/**
 * Pure tour logic: no DOM, no Driver.js. Everything that decides *whether*
 * and *what* to show lives here so it can be unit-tested.
 */
import { TOUR_PARTS, type TourPart, type TourStep } from './parts'

export function getPart(id: string): TourPart | undefined {
  return TOUR_PARTS.find(p => p.id === id)
}

/** The part whose page is `pathname`, or undefined (Library, Settings...). */
export function partForPath(pathname: string): TourPart | undefined {
  const clean = normalizePath(pathname)
  return TOUR_PARTS.find(p => p.routes.includes(clean))
}

/** `#/hardware?x=1` / `/hardware/` -> `/hardware`. */
export function normalizePath(raw: string): string {
  let p = raw.replace(/^#/, '').split('?')[0].split('#')[0]
  if (!p.startsWith('/')) p = '/' + p
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

export function isOnboardingPath(pathname: string): boolean {
  return normalizePath(pathname).startsWith('/onboarding')
}

/** Is the part's page the current one? Shell parts work anywhere (but not in onboarding). */
export function isPartPageActive(part: TourPart, pathname: string): boolean {
  if (isOnboardingPath(pathname)) return false
  return !!part.shell || part.routes.includes(normalizePath(pathname))
}

/**
 * Keep only steps that can be shown. A step survives when its element exists,
 * or when it declares a `clickFirst` target that exists (the click will reveal it).
 */
export function resolveSteps(
  part: TourPart,
  exists: (selector: string) => boolean,
): TourStep[] {
  return part.steps.filter(step => exists(step.selector) || (!!step.clickFirst && exists(step.clickFirst)))
}

export function progressLabel(index: number, total: number): string {
  return `${index + 1} of ${total}`
}

export function nextPartOf(part: TourPart): TourPart | undefined {
  return part.next ? getPart(part.next) : undefined
}

export interface AutoStartContext {
  part: TourPart
  pathname: string
  completed: string[]
  disabled: boolean
  /** A tour (any part) is running or being started. */
  busy: boolean
  /** A dialog, menu or drawer is open. */
  overlayOpen: boolean
  /** `part.readySelector` is mounted and visible. */
  readyPresent: boolean
}

export type AutoStartDecision = 'now' | 'wait' | 'never'

/**
 * - never: this visit will not auto-start the part (re-evaluated on the next visit)
 * - wait:  conditions are temporary, poll again
 * - now:   start
 */
export function decideAutoStart(ctx: AutoStartContext): AutoStartDecision {
  const { part } = ctx
  if (ctx.disabled) return 'never'
  if (ctx.completed.includes(part.id)) return 'never'
  if (!isPartPageActive(part, ctx.pathname)) return 'never'
  if (part.requires?.some(r => !ctx.completed.includes(r))) return 'never'
  if (ctx.busy) return 'wait'
  if (ctx.overlayOpen) return 'wait'
  if (!ctx.readyPresent) return 'wait'
  return 'now'
}

/** What the "Tour this page" menu item should run for a path. Falls back to the app-shell tour. */
export function partForPageMenu(pathname: string): { part: TourPart; exact: boolean } {
  const exact = partForPath(pathname)
  if (exact) return { part: exact, exact: true }
  return { part: getPart('welcome')!, exact: false }
}
