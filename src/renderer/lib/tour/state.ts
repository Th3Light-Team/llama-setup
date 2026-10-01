/**
 * Pure reducers for the persisted tour state. The zustand store
 * (`ui-prefs`) delegates to these so the rules are unit-testable.
 */

export interface TourPersistedState {
  /** Part ids the user has finished OR closed. They never auto-start again. */
  tourCompleted: string[]
  /** When true no tour starts automatically. Manual replays still work. */
  toursDisabled: boolean
}

export const INITIAL_TOUR_STATE: TourPersistedState = {
  tourCompleted: [],
  toursDisabled: false,
}

export function markPartDone(completed: string[], id: string): string[] {
  return completed.includes(id) ? completed : [...completed, id]
}

export function isPartDone(completed: string[], id: string): boolean {
  return completed.includes(id)
}

/** "Reset all": forget progress and turn automatic tours back on. */
export function resetTourState(): TourPersistedState {
  return { tourCompleted: [], toursDisabled: false }
}
