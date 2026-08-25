import { Gauge } from 'lucide-react'
import { useBenchStore } from '@/lib/stores/bench'
import { useShallow } from 'zustand/react/shallow'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

/**
 * Small chip in the layout sidebar that opens the bench drawer.  Mirrors
 * DownloadIndicator's spot/shape so the two queue indicators sit visually
 * as a pair.
 */
export function BenchIndicator() {
  const jobsMap = useBenchStore(useShallow(s => s.jobs))
  const toggleDrawer = useBenchStore(s => s.toggleDrawer)

  const { running, total } = useMemo(() => {
    const jobs = Object.values(jobsMap)
    return {
      running: jobs.filter(j => j.state === 'running' || j.state === 'queued').length,
      total: jobs.length,
    }
  }, [jobsMap])

  // Hide when there's nothing to show, to keep the sidebar tidy.
  if (total === 0) return null

  return (
    <button
      onClick={toggleDrawer}
      className={cn(
        'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs',
        'border border-border hover:bg-sidebar-accent/60 transition-colors text-left'
      )}
      aria-label="Open benchmarks"
    >
      <Gauge className={cn('h-3.5 w-3.5 shrink-0', running > 0 ? 'text-brand animate-pulse' : 'text-muted-foreground')} aria-hidden />
      <span className="flex-1 truncate">
        {running > 0 ? `${running} bench running` : `${total} bench${total === 1 ? '' : 'es'}`}
      </span>
    </button>
  )
}
