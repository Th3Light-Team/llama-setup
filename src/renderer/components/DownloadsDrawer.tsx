import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useDownloadsStore } from '@/lib/stores/downloads'
import { useShallow } from 'zustand/react/shallow'
import { DownloadCard } from './DownloadCard'
import { Inbox } from 'lucide-react'
import { useMemo } from 'react'

export function DownloadsDrawer() {
  const drawerOpen = useDownloadsStore(s => s.drawerOpen)
  const closeDrawer = useDownloadsStore(s => s.closeDrawer)
  const jobsMap = useDownloadsStore(useShallow(s => s.jobs))

  const jobs = useMemo(
    () => Object.values(jobsMap).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [jobsMap]
  )

  const activeCount = useMemo(
    () => jobs.filter(j =>
      j.state === 'queued' || j.state === 'downloading' ||
      j.state === 'verifying' || j.state === 'extracting' || j.state === 'paused'
    ).length,
    [jobs]
  )

  const cancel = useDownloadsStore(s => s.cancel)
  const pause = useDownloadsStore(s => s.pause)
  const resume = useDownloadsStore(s => s.resume)
  const remove = useDownloadsStore(s => s.remove)
  const clearDone = useDownloadsStore(s => s.clearDone)

  const active = jobs.filter(j =>
    j.state === 'queued' || j.state === 'downloading' ||
    j.state === 'verifying' || j.state === 'extracting' || j.state === 'paused'
  )
  const history = jobs.filter(j => j.state === 'done' || j.state === 'failed' || j.state === 'cancelled')

  return (
    <Sheet open={drawerOpen} onOpenChange={(open) => { if (!open) closeDrawer() }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <SheetTitle>Downloads</SheetTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {activeCount > 0 && <span>{activeCount} active</span>}
              {history.length > 0 && (
                <Button variant="ghost" size="xs" onClick={() => clearDone()}>Clear done</Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
          {jobs.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-12 text-muted-foreground gap-2">
              <Inbox className="h-8 w-8" aria-hidden />
              <p className="text-sm">No downloads yet</p>
              <p className="text-xs">Models and binaries you queue will appear here.</p>
            </div>
          )}

          {active.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Active</div>
              {active.map(job => (
                <DownloadCard
                  key={job.id}
                  job={job}
                  onCancel={() => cancel(job.id)}
                  onPause={() => pause(job.id)}
                  onResume={() => resume(job.id)}
                  onRetry={() => resume(job.id)}
                  onRemove={() => remove(job.id)}
                />
              ))}
            </div>
          )}

          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">History</div>
              {history.map(job => (
                <DownloadCard
                  key={job.id}
                  job={job}
                  onCancel={() => cancel(job.id)}
                  onPause={() => pause(job.id)}
                  onResume={() => resume(job.id)}
                  onRetry={() => resume(job.id)}
                  onRemove={() => remove(job.id)}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
