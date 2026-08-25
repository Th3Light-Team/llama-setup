import { useMemo } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { Gauge, FileText, X, Trash2 } from 'lucide-react'
import { useBenchStore } from '@/lib/stores/bench'
import { useShallow } from 'zustand/react/shallow'
import { BenchDetailsDialog } from './BenchDetailsDialog'
import { cn } from '@/lib/utils'
import type { BenchJob } from '../../core/bench/types'

function statusKind(s: BenchJob['state']) {
  if (s === 'running') return 'running'
  if (s === 'queued') return 'scanning'
  if (s === 'done') return 'ready'
  if (s === 'failed') return 'error'
  return 'idle'
}

function statusLabel(s: BenchJob['state']) {
  if (s === 'running') return 'Running'
  if (s === 'queued') return 'Queued'
  if (s === 'done') return 'Done'
  if (s === 'failed') return 'Failed'
  return 'Cancelled'
}

function summarize(job: BenchJob): string {
  if (!job.result || job.result.tests.length === 0) return ''
  const pp = job.result.tests.find(t => t.kind === 'pp')
  const tg = job.result.tests.find(t => t.kind === 'tg')
  const parts: string[] = []
  if (pp) parts.push(`pp ${pp.tokensPerSec.toFixed(0)} t/s`)
  if (tg) parts.push(`tg ${tg.tokensPerSec.toFixed(1)} t/s`)
  return parts.join(' · ')
}

export function BenchSidebar() {
  const drawerOpen = useBenchStore(s => s.drawerOpen)
  const closeDrawer = useBenchStore(s => s.closeDrawer)
  const jobsMap = useBenchStore(useShallow(s => s.jobs))
  const detailsId = useBenchStore(s => s.detailsId)
  const openDetails = useBenchStore(s => s.openDetails)
  const closeDetails = useBenchStore(s => s.closeDetails)
  const cancel = useBenchStore(s => s.cancel)
  const remove = useBenchStore(s => s.remove)
  const clearDone = useBenchStore(s => s.clearDone)

  const jobs = useMemo(
    () => Object.values(jobsMap).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [jobsMap]
  )

  const finishedCount = jobs.filter(j => j.state === 'done' || j.state === 'failed' || j.state === 'cancelled').length
  const detailsJob = detailsId ? jobsMap[detailsId] ?? null : null

  return (
    <>
      <Sheet open={drawerOpen} onOpenChange={(open) => { if (!open) closeDrawer() }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <div className="flex items-center justify-between gap-2 pr-8">
              <SheetTitle className="flex items-center gap-1.5">
                <Gauge className="h-4 w-4 text-brand" aria-hidden /> Benchmarks
              </SheetTitle>
              {finishedCount > 0 && (
                <Button variant="ghost" size="xs" onClick={() => clearDone()}>
                  Clear finished
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 text-muted-foreground gap-2">
                <Gauge className="h-8 w-8" aria-hidden />
                <p className="text-sm">No benchmarks yet</p>
                <p className="text-xs">Run a quick bench from any model in your Library.</p>
              </div>
            ) : (
              jobs.map(job => (
                <div
                  key={job.id}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 flex flex-col gap-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={job.displayName}>{job.displayName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <StatusPill kind={statusKind(job.state)} label={statusLabel(job.state)} />
                  </div>

                  {job.state === 'running' && (
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full bg-brand transition-all', job.progress === 0 && 'animate-pulse w-1/4')}
                        style={job.progress > 0 ? { width: `${job.progress}%` } : undefined}
                      />
                    </div>
                  )}

                  {job.state === 'done' && (
                    <p className="text-xs font-mono text-status-ready">{summarize(job)}</p>
                  )}

                  {job.state === 'failed' && job.errorMessage && (
                    <p className="text-xs text-status-error truncate" title={job.errorMessage}>{job.errorMessage}</p>
                  )}

                  <div className="flex items-center justify-end gap-1 pt-1 -mb-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => openDetails(job.id)}
                      className="gap-1 text-xs"
                    >
                      <FileText className="h-3 w-3" aria-hidden /> Details
                    </Button>
                    {(job.state === 'running' || job.state === 'queued') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => cancel(job.id)}
                        title="Cancel"
                      >
                        <X className="h-3 w-3" aria-hidden />
                        <span className="sr-only">Cancel</span>
                      </Button>
                    )}
                    {(job.state === 'done' || job.state === 'failed' || job.state === 'cancelled') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(job.id)}
                        title="Remove from list"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                        <span className="sr-only">Remove</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <BenchDetailsDialog
        open={!!detailsJob}
        job={detailsJob}
        onOpenChange={(open) => { if (!open) closeDetails() }}
      />
    </>
  )
}
