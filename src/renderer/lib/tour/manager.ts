/**
 * Tour manager: the only module that touches Driver.js and the DOM.
 * Decisions (what/when to show) live in `logic.ts`; persisted progress lives
 * in the `ui-prefs` store.
 */
import { driver, type Driver, type DriveStep, type PopoverDOM } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'
import { useUiPrefsStore } from '../stores/ui-prefs'
import { useDownloadsStore } from '../stores/downloads'
import { useBenchStore } from '../stores/bench'
import type { TourPart, TourStep } from './parts'
import {
  decideAutoStart,
  getPart,
  isPartPageActive,
  nextPartOf,
  normalizePath,
  resolveSteps,
} from './logic'

export type TourEndReason = 'completed' | 'dismissed' | 'skipped-all' | 'interrupted'

interface ActiveTour {
  part: TourPart
  steps: TourStep[]
  driver: Driver
  reason: TourEndReason | null
  afterEnd: (() => void) | null
  navigating: boolean
  finalized: boolean
}

/** How long an automatic start keeps waiting for the page / overlays to be ready. */
const AUTO_DEADLINE_MS = 20_000
const POLL_MS = 100

let active: ActiveTour | null = null
/** Token of a start in flight (waiting for elements); null when idle. */
let startingToken: number | null = null
let tokenCounter = 0
let navigateFn: ((to: string) => void) | null = null

// ─── environment helpers ─────────────────────────────────────────────────────

export function registerNavigator(fn: (to: string) => void): () => void {
  navigateFn = fn
  return () => { if (navigateFn === fn) navigateFn = null }
}

export function currentPath(): string {
  return normalizePath(window.location.hash || '/')
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/** First element matching `selector` that is actually rendered (non-zero size). */
export function queryVisible(selector: string): Element | null {
  for (const el of Array.from(document.querySelectorAll(selector))) {
    if (isVisible(el)) return el
  }
  return null
}

const selectorExists = (selector: string) => queryVisible(selector) !== null

const OVERLAY_SELECTOR =
  '[role="dialog"]:not(#driver-popover-content), [role="alertdialog"], [role="menu"], [data-slot="sheet-content"]'

/** A dialog, menu or drawer is open: do not stack a tour on top of it. */
export function hasBlockingOverlay(): boolean {
  if (useDownloadsStore.getState().drawerOpen || useBenchStore.getState().drawerOpen) return true
  return document.querySelector(OVERLAY_SELECTOR) !== null
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

async function sleep(ms: number, aborted?: () => boolean): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (aborted?.()) return
    await new Promise(r => setTimeout(r, Math.min(POLL_MS, Math.max(0, end - Date.now()))))
  }
}

/** Poll until a visible element matches, the timeout passes, or `aborted()`. */
async function waitFor(selector: string, timeoutMs: number, aborted?: () => boolean): Promise<boolean> {
  const end = Date.now() + timeoutMs
  for (;;) {
    if (selectorExists(selector)) return true
    if (aborted?.() || Date.now() >= end) return false
    await new Promise(r => setTimeout(r, POLL_MS))
  }
}

export function isTourBusy(): boolean {
  return active !== null || startingToken !== null
}

export function isTourActive(): boolean {
  return active !== null
}

export function activeTourPartId(): string | null {
  return active?.part.id ?? null
}

// ─── lifecycle ───────────────────────────────────────────────────────────────

function finalize(ctx: ActiveTour): void {
  if (ctx.finalized) return
  ctx.finalized = true
  if (active === ctx) active = null
  const prefs = useUiPrefsStore.getState()
  if (ctx.reason === 'completed' || ctx.reason === 'dismissed') {
    prefs.completeTourPart(ctx.part.id)
  } else if (ctx.reason === 'skipped-all') {
    prefs.completeTourPart(ctx.part.id)
    prefs.setToursDisabled(true)
  }
  ctx.afterEnd?.()
}

function finish(ctx: ActiveTour, reason: TourEndReason, afterEnd?: () => void): void {
  if (ctx.finalized) return
  ctx.reason = ctx.reason ?? reason
  ctx.afterEnd = afterEnd ?? null
  try { ctx.driver.destroy() } catch { /* already torn down */ }
  finalize(ctx)
}

/** End the running tour without recording progress (route change, drawer opened, replaced by another tour). */
export function stopTour(reason: TourEndReason = 'interrupted'): void {
  if (active) finish(active, reason)
}

/** Called when the route changes: a page-bound tour must not outlive its page. */
export function handleRouteChange(pathname: string): void {
  if (active && !isPartPageActive(active.part, pathname)) stopTour('interrupted')
}

async function ensureStepElement(step: TourStep, aborted?: () => boolean): Promise<boolean> {
  if (selectorExists(step.selector)) return true
  if (step.clickFirst) {
    const trigger = queryVisible(step.clickFirst)
    if (trigger instanceof HTMLElement) {
      trigger.click()
      return waitFor(step.selector, 1500, aborted)
    }
  }
  return waitFor(step.selector, 300, aborted)
}

/** Move to step `target`, clicking/waiting as needed; skips steps that cannot be shown. */
async function go(ctx: ActiveTour, target: number, dir: 1 | -1): Promise<void> {
  if (ctx.finalized || ctx.navigating) return
  ctx.navigating = true
  try {
    for (let i = target; i >= 0 && i < ctx.steps.length; i += dir) {
      if (ctx.finalized) return
      if (await ensureStepElement(ctx.steps[i])) {
        if (!ctx.finalized) ctx.driver.moveTo(i)
        return
      }
    }
    if (dir === 1) completeAndContinue(ctx)
  } finally {
    ctx.navigating = false
  }
}

function completeAndContinue(ctx: ActiveTour, followNext = false): void {
  const next = followNext ? nextPartOf(ctx.part) : undefined
  finish(ctx, 'completed', next ? () => { void startTourPart(next.id) } : undefined)
}

function decorate(popover: PopoverDOM, ctx: ActiveTour): void {
  const idx = ctx.driver.getActiveIndex() ?? 0
  const isLast = idx >= ctx.steps.length - 1
  const next = nextPartOf(ctx.part)

  // Skip tour: stop all automatic tours.
  const skip = document.createElement('button')
  skip.type = 'button'
  skip.className = 'llama-tour-skip'
  skip.textContent = 'Skip tour'
  skip.title = 'Stop automatic tours. You can replay any tour from the ? button or Settings.'
  skip.addEventListener('click', () => finish(ctx, 'skipped-all'))
  popover.footer.insertBefore(skip, popover.footerButtons)

  if (isLast && next) {
    // Primary button already says "Next: <part>"; add a plain Finish beside it.
    const finishBtn = document.createElement('button')
    finishBtn.type = 'button'
    finishBtn.className = 'driver-popover-footer-btn llama-tour-finish'
    finishBtn.textContent = 'Done'
    finishBtn.addEventListener('click', () => completeAndContinue(ctx, false))
    popover.footerButtons.insertBefore(finishBtn, popover.nextButton)
  }

  // Driver focuses the close button first; keyboard users want "Next".
  setTimeout(() => { if (!ctx.finalized) popover.nextButton.focus() }, 0)
}

function toDriveSteps(ctx: ActiveTour): DriveStep[] {
  const next = nextPartOf(ctx.part)
  return ctx.steps.map((step, i) => {
    const isLast = i === ctx.steps.length - 1
    return {
      // null -> Driver falls back to a centered popover instead of highlighting nothing.
      element: (() => queryVisible(step.selector)) as unknown as () => Element,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side ?? 'bottom',
        align: step.align ?? 'start',
        doneBtnText: next ? (ctx.part.nextCta ?? `Next: ${next.title}`) : 'Done',
        onNextClick: () => { void go(ctx, i + 1, 1) },
        onPrevClick: () => { void go(ctx, i - 1, -1) },
        onDoneClick: () => completeAndContinue(ctx, isLast && !!next),
      },
    }
  })
}

// ─── public API ──────────────────────────────────────────────────────────────

export interface StartOptions {
  /** Automatic start: yields to a running tour and to open dialogs, never replaces anything. */
  auto?: boolean
  /** Abort a pending start (e.g. the page unmounted). */
  shouldAbort?: () => boolean
}

/**
 * Start a part. Navigates to its page when needed, waits for the page to be
 * ready, drops steps whose element is missing. Resolves true when a tour started.
 */
export async function startTourPart(id: string, opts: StartOptions = {}): Promise<boolean> {
  const part = getPart(id)
  if (!part) return false
  if (opts.auto && isTourBusy()) return false

  if (active) stopTour('interrupted')
  const token = ++tokenCounter
  startingToken = token
  const aborted = () => startingToken !== token || opts.shouldAbort?.() === true
  const release = () => { if (startingToken === token) startingToken = null }

  try {
    if (!part.shell && !part.routes.includes(currentPath())) navigateFn?.(part.routes[0])

    if (!(await waitFor(part.readySelector, opts.auto ? 10_000 : 8_000, aborted))) return false
    // Let the page paint and async data (engines, profiles, ...) arrive.
    await sleep(opts.auto ? 700 : 400, aborted)
    if (part.settleSelectors?.length) {
      await Promise.race([
        Promise.all(part.settleSelectors.map(s => waitFor(s, 3000, aborted))),
        sleep(3000, aborted),
      ])
    }
    if (aborted()) return false
    if (opts.auto && (hasBlockingOverlay() || !isPartPageActive(part, currentPath()))) return false

    const steps = resolveSteps(part, selectorExists)
    while (steps.length > 0 && !(await ensureStepElement(steps[0], aborted))) steps.shift()
    if (steps.length === 0 || aborted()) return false

    const ctx: ActiveTour = {
      part, steps, driver: undefined as unknown as Driver,
      reason: null, afterEnd: null, navigating: false, finalized: false,
    }
    ctx.driver = driver({
      animate: !prefersReducedMotion(),
      smoothScroll: false,
      allowClose: true,
      allowKeyboardControl: true,
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      prevBtnText: 'Back',
      nextBtnText: 'Next',
      doneBtnText: 'Done',
      overlayColor: '#000',
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 8,
      popoverOffset: 10,
      disableActiveInteraction: true,
      // Clicking outside does nothing: closing is explicit (X, Esc, Skip tour).
      overlayClickBehavior: () => {},
      popoverClass: 'llama-tour',
      steps: toDriveSteps(ctx),
      onPopoverRender: popover => decorate(popover, ctx),
      onDestroyStarted: () => {
        // X button / Esc: closing a part counts as "seen".
        ctx.reason = ctx.reason ?? 'dismissed'
        try { ctx.driver.destroy() } catch { /* ignore */ }
        finalize(ctx)
      },
      onDestroyed: () => finalize(ctx),
    })
    active = ctx
    release()
    ctx.driver.drive(0)
    return true
  } finally {
    release()
  }
}

/**
 * Auto-start `id` once the page is ready, if allowed (not seen, not disabled,
 * nothing else on screen). Returns a cancel function for effect cleanup.
 */
export function scheduleAutoStart(id: string): () => void {
  const part = getPart(id)
  if (!part) return () => {}
  let cancelled = false

  void (async () => {
    const deadline = Date.now() + AUTO_DEADLINE_MS
    while (!cancelled && Date.now() < deadline) {
      const prefs = useUiPrefsStore.getState()
      const decision = decideAutoStart({
        part,
        pathname: currentPath(),
        completed: prefs.tourCompleted,
        disabled: prefs.toursDisabled,
        busy: isTourBusy(),
        overlayOpen: hasBlockingOverlay(),
        readyPresent: queryVisible(part.readySelector) !== null,
      })
      if (decision === 'never') return
      if (decision === 'now') {
        await startTourPart(id, { auto: true, shouldAbort: () => cancelled })
        return
      }
      await sleep(400, () => cancelled)
    }
  })()

  return () => { cancelled = true }
}
