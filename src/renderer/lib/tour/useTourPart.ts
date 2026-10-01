import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { scheduleAutoStart } from './manager'
import type { TourPartId } from './parts'

/**
 * Call from a page (or the layout for shell parts). Starts the part
 * automatically the first time it is allowed: tours enabled, part not yet
 * seen, nothing else open, target elements mounted. Re-evaluated on every
 * route change so a shell part picks up "Reset all" / "Turn on automatic tours".
 */
export function useTourPart(id: TourPartId): void {
  const { pathname } = useLocation()
  useEffect(() => scheduleAutoStart(id), [id, pathname])
}
