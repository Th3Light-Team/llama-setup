import { useDownloadsStore, selectActiveCount, selectFailedCount } from '@/lib/stores/downloads'
import { Download, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DownloadIndicator() {
  const active = useDownloadsStore(selectActiveCount)
  const failed = useDownloadsStore(selectFailedCount)
  const toggleDrawer = useDownloadsStore(s => s.toggleDrawer)

  if (active === 0 && failed === 0) return null

  const showFailed = failed > 0 && active === 0

  return (
    <button
      type="button"
      onClick={() => toggleDrawer()}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs',
        'border border-sidebar-border bg-sidebar/60 hover:bg-sidebar-accent/60 transition-colors',
        'text-sidebar-foreground/80'
      )}
      aria-label="Open downloads drawer"
    >
      {showFailed ? (
        <>
          <AlertTriangle className="h-3.5 w-3.5 text-status-error" aria-hidden />
          <span>{failed} failed</span>
        </>
      ) : (
        <>
          <Download className="h-3.5 w-3.5 animate-pulse text-status-downloading" aria-hidden />
          <span>{active} downloading</span>
        </>
      )}
    </button>
  )
}
