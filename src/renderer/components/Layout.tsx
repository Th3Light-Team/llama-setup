import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/Sidebar'
import { DownloadsDrawer } from '@/components/DownloadsDrawer'
import { BenchSidebar } from '@/components/BenchSidebar'
import { useDownloadsStore } from '@/lib/stores/downloads'
import { useBenchStore } from '@/lib/stores/bench'

export default function Layout() {
  const initDownloads = useDownloadsStore(s => s.init)
  const toggleDownloadsDrawer = useDownloadsStore(s => s.toggleDrawer)
  const initBench = useBenchStore(s => s.init)
  const toggleBenchDrawer = useBenchStore(s => s.toggleDrawer)

  useEffect(() => {
    let cleanupDownloads: (() => void) | undefined
    initDownloads().then(off => { cleanupDownloads = off })
    const cleanupBench = initBench()
    return () => { cleanupDownloads?.(); cleanupBench() }
  }, [initDownloads, initBench])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault()
        toggleDownloadsDrawer()
      }
      if (mod && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault()
        toggleBenchDrawer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleDownloadsDrawer, toggleBenchDrawer])

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 overflow-hidden bg-background p-6">
        <Outlet />
      </main>
      <DownloadsDrawer />
      <BenchSidebar />
    </div>
  )
}
