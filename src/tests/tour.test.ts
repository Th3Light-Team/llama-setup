import { describe, it, expect } from 'vitest'
import { TOUR_PARTS } from '../renderer/lib/tour/parts'
import {
  decideAutoStart,
  getPart,
  isPartPageActive,
  normalizePath,
  nextPartOf,
  partForPageMenu,
  partForPath,
  progressLabel,
  resolveSteps,
  type AutoStartContext,
} from '../renderer/lib/tour/logic'
import { INITIAL_TOUR_STATE, isPartDone, markPartDone, resetTourState } from '../renderer/lib/tour/state'
import { useUiPrefsStore } from '../renderer/lib/stores/ui-prefs'

describe('tour part registry', () => {
  it('has unique ids', () => {
    const ids = TOUR_PARTS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('defines the six parts in teaching order', () => {
    expect(TOUR_PARTS.map(p => p.id)).toEqual(['welcome', 'hardware', 'binaries', 'registry', 'launch', 'bench'])
  })

  it('has 3-6 steps per part', () => {
    for (const p of TOUR_PARTS) {
      expect(p.steps.length, p.id).toBeGreaterThanOrEqual(3)
      expect(p.steps.length, p.id).toBeLessThanOrEqual(6)
    }
  })

  it('gives every step a data-tour selector, a title and a description', () => {
    for (const p of TOUR_PARTS) {
      for (const [i, s] of p.steps.entries()) {
        const where = `${p.id}[${i}]`
        expect(s.selector, where).toMatch(/\[data-tour="[a-z0-9-]+"\]/)
        expect(s.title.trim().length, where).toBeGreaterThan(0)
        expect(s.description.trim().length, where).toBeGreaterThan(0)
        if (s.clickFirst) expect(s.clickFirst, where).toMatch(/\[data-tour="[a-z0-9-]+"\]/)
      }
    }
  })

  it('does not start a part with a clickFirst step (the driver needs the first element up front)', () => {
    for (const p of TOUR_PARTS) expect(p.steps[0].clickFirst, p.id).toBeUndefined()
  })

  it('has valid, acyclic next-part links with a call-to-action label', () => {
    for (const p of TOUR_PARTS) {
      if (!p.next) continue
      expect(getPart(p.next), `${p.id}.next`).toBeDefined()
      expect(p.nextCta, `${p.id}.nextCta`).toBeTruthy()
      expect(p.next).not.toBe(p.id)
    }
    // Walk the chain from welcome: must visit every part exactly once and end.
    const seen: string[] = []
    let cur = getPart('welcome')
    while (cur) {
      expect(seen).not.toContain(cur.id)
      seen.push(cur.id)
      cur = nextPartOf(cur)
    }
    expect(seen).toEqual(TOUR_PARTS.map(p => p.id))
  })

  it('has valid `requires` references and routes', () => {
    for (const p of TOUR_PARTS) {
      for (const r of p.requires ?? []) expect(getPart(r), `${p.id} requires ${r}`).toBeDefined()
      expect(p.routes.length, p.id).toBeGreaterThan(0)
      for (const r of p.routes) expect(r.startsWith('/'), `${p.id} route ${r}`).toBe(true)
      expect(p.readySelector, p.id).toMatch(/\[data-tour=/)
    }
  })

  it('has unique routes across parts (so "Tour this page" is unambiguous)', () => {
    const routes = TOUR_PARTS.flatMap(p => p.routes)
    expect(new Set(routes).size).toBe(routes.length)
  })
})

describe('path helpers', () => {
  it('normalizes hash-router paths', () => {
    expect(normalizePath('#/hardware')).toBe('/hardware')
    expect(normalizePath('#/launch?modelPath=x')).toBe('/launch')
    expect(normalizePath('/binaries/')).toBe('/binaries')
    expect(normalizePath('')).toBe('/')
  })

  it('maps pages to parts and falls back to the shell tour', () => {
    expect(partForPath('/hardware')?.id).toBe('hardware')
    expect(partForPath('/')?.id).toBe('welcome')
    expect(partForPath('/settings')).toBeUndefined()
    expect(partForPageMenu('/library')).toMatchObject({ exact: false })
    expect(partForPageMenu('/library').part.id).toBe('welcome')
    expect(partForPageMenu('/bench')).toMatchObject({ exact: true })
  })

  it('treats shell parts as active on any non-onboarding page', () => {
    const welcome = getPart('welcome')!
    const hardware = getPart('hardware')!
    expect(isPartPageActive(welcome, '/launch')).toBe(true)
    expect(isPartPageActive(welcome, '/onboarding/3')).toBe(false)
    expect(isPartPageActive(hardware, '/hardware')).toBe(true)
    expect(isPartPageActive(hardware, '/launch')).toBe(false)
  })
})

describe('resolveSteps', () => {
  const launch = getPart('launch')!

  it('skips steps whose element is missing instead of failing', () => {
    const present = new Set(['[data-tour="launch-profiles"]'])
    const steps = resolveSteps(launch, s => present.has(s))
    expect(steps.map(s => s.title)).toEqual(['Profiles'])
  })

  it('keeps a clickFirst step when only its trigger exists', () => {
    const present = new Set([
      '[data-tour="launch-profiles"]',
      '[data-tour="launch-tabs"]',
      '[data-tour="launch-tab-configure"]',
    ])
    const titles = resolveSteps(launch, s => present.has(s)).map(s => s.title)
    expect(titles).toContain('Configure flags')
    expect(titles).not.toContain('Server output')
  })

  it('returns every step when everything is mounted', () => {
    expect(resolveSteps(launch, () => true)).toHaveLength(launch.steps.length)
  })

  it('formats progress as "n of total"', () => {
    expect(progressLabel(1, 5)).toBe('2 of 5')
  })
})

describe('decideAutoStart', () => {
  const base = (over: Partial<AutoStartContext> = {}): AutoStartContext => ({
    part: getPart('hardware')!,
    pathname: '/hardware',
    completed: ['welcome'],
    disabled: false,
    busy: false,
    overlayOpen: false,
    readyPresent: true,
    ...over,
  })

  it('starts when everything allows it', () => {
    expect(decideAutoStart(base())).toBe('now')
  })

  it('never starts when tours are disabled or the part is already seen', () => {
    expect(decideAutoStart(base({ disabled: true }))).toBe('never')
    expect(decideAutoStart(base({ completed: ['welcome', 'hardware'] }))).toBe('never')
  })

  it('never starts during onboarding or on another page', () => {
    expect(decideAutoStart(base({ pathname: '/onboarding/2' }))).toBe('never')
    expect(decideAutoStart(base({ pathname: '/launch' }))).toBe('never')
    expect(decideAutoStart(base({ part: getPart('welcome')!, completed: [], pathname: '/onboarding/1' }))).toBe('never')
  })

  it('waits for the welcome part before contextual parts', () => {
    expect(decideAutoStart(base({ completed: [] }))).toBe('never')
  })

  it('waits (does not give up) while another tour or an overlay is up, or the page is not ready', () => {
    expect(decideAutoStart(base({ busy: true }))).toBe('wait')
    expect(decideAutoStart(base({ overlayOpen: true }))).toBe('wait')
    expect(decideAutoStart(base({ readyPresent: false }))).toBe('wait')
  })

  it('starts the welcome part on whatever page the user lands on', () => {
    const ctx = base({ part: getPart('welcome')!, completed: [], pathname: '/launch' })
    expect(decideAutoStart(ctx)).toBe('now')
  })
})

describe('persisted tour state', () => {
  it('marks parts done once, immutably', () => {
    const a: string[] = []
    const b = markPartDone(a, 'welcome')
    expect(a).toEqual([])
    expect(b).toEqual(['welcome'])
    expect(markPartDone(b, 'welcome')).toBe(b)
    expect(isPartDone(b, 'welcome')).toBe(true)
    expect(isPartDone(b, 'hardware')).toBe(false)
  })

  it('reset clears progress and re-enables automatic tours', () => {
    expect(resetTourState()).toEqual({ tourCompleted: [], toursDisabled: false })
    expect(INITIAL_TOUR_STATE).toEqual({ tourCompleted: [], toursDisabled: false })
  })
})

describe('ui-prefs tour actions', () => {
  it('completes, disables and resets', () => {
    const s = useUiPrefsStore
    s.getState().resetTours()
    s.getState().completeTourPart('welcome')
    s.getState().completeTourPart('welcome')
    s.getState().completeTourPart('hardware')
    expect(s.getState().tourCompleted).toEqual(['welcome', 'hardware'])

    s.getState().setToursDisabled(true)
    expect(s.getState().toursDisabled).toBe(true)

    s.getState().resetTours()
    expect(s.getState().tourCompleted).toEqual([])
    expect(s.getState().toursDisabled).toBe(false)
  })
})
