import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDownloadsStore } from '../stores/downloads'
import { useBenchStore } from '../stores/bench'
import { handleRouteChange, registerNavigator, stopTour } from './manager'

/**
 * Mounted once in Layout. Gives the tour manager the router's `navigate`,
 * and ends a running tour when the user leaves its page or opens a drawer
 * (a keyboard shortcut can do that while the overlay is up).
 */
export function TourController() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const downloadsOpen = useDownloadsStore(s => s.drawerOpen)
  const benchOpen = useBenchStore(s => s.drawerOpen)

  useEffect(() => registerNavigator(to => navigate(to)), [navigate])

  useEffect(() => { handleRouteChange(pathname) }, [pathname])

  useEffect(() => {
    if (downloadsOpen || benchOpen) stopTour('interrupted')
  }, [downloadsOpen, benchOpen])

  return null
}
