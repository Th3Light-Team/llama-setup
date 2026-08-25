import { useEffect, useRef, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pause, Play, X, RotateCw, Trash2, CheckCircle2, AlertTriangle, Loader2, FileArchive, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DownloadJob } from '../../core/downloads/types'

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${bytes} B`
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `~${Math.round(seconds / 60)} min`
  return `~${(seconds / 3600).toFixed(1)} h`
}

export interface DownloadCardProps {
  job: DownloadJob
  onCancel: () => void
  onPause: () => void
  onResume: () => void
  onRetry: () => void
  onRemove: () => void
}

export function DownloadCard({ job, onCancel, onPause, onResume, onRetry, onRemove }: DownloadCardProps) {
  const samplesRef = useRef<{ at: number; bytes: number }[]>([])
  const [speed, setSpeed] = useState(0)

  useEffect(() => {
    const now = Date.now()
    const arr = samplesRef.current
    arr.push({ at: now, bytes: job.bytesDone })
    if (arr.length > 10) arr.shift()
    if (arr.length >= 2) {
      const first = arr[0]
      const last = arr[arr.length - 1]
      const dt = (last.at - first.at) / 1000
      const db = last.bytes - first.bytes
      setSpeed(dt > 0 ? db / dt : 0)
    }
  }, [job.bytesDone])

  const percent = job.bytesTotal && job.bytesTotal > 0
    ? Math.min(100, Math.round((job.bytesDone / job.bytesTotal) * 100))
    : (job.state === 'done' ? 100 : 0)

  const eta = job.bytesTotal && speed > 0
    ? formatEta((job.bytesTotal - job.bytesDone) / speed)
    : '—'

  const stateColors: Record<string, string> = {
    queued: 'text-muted-foreground',
    downloading: 'text-status-downloading',
    verifying: 'text-status-scanning',
    extracting: 'text-status-scanning',
    paused: 'text-muted-foreground',
    done: 'text-status-ready',
    failed: 'text-status-error',
    cancelled: 'text-muted-foreground'
  }

  const KindIcon = job.kind === 'binary' ? FileArchive : Brain
  const showProgress = job.state === 'downloading' || job.state === 'paused' || job.state === 'queued' || job.state === 'verifying' || job.state === 'extracting'

  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <KindIcon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate" title={job.displayName}>{job.displayName}</span>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">{job.kind}</Badge>
          </div>
          <div className={cn('text-[11px] mt-0.5 flex items-center gap-1', stateColors[job.state])}>
            {(job.state === 'downloading' || job.state === 'verifying' || job.state === 'extracting') && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            )}
            {job.state === 'done' && <CheckCircle2 className="h-3 w-3" aria-hidden />}
            {job.state === 'failed' && <AlertTriangle className="h-3 w-3" aria-hidden />}
            <span className="capitalize">{job.state}</span>
            {job.state === 'failed' && job.errorMessage && (
              <span className="text-muted-foreground truncate" title={job.errorMessage}>· {job.errorMessage}</span>
            )}
            {job.state === 'failed' && job.attempts > 0 && (
              <span className="text-muted-foreground">· {job.attempts} attempt{job.attempts !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>

      {showProgress && (
        <>
          <Progress value={percent} className="gap-1" />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>
              {formatBytes(job.bytesDone)}
              {job.bytesTotal !== null && ` / ${formatBytes(job.bytesTotal)}`}
              {' · '}{percent}%
            </span>
            <span>
              {job.state === 'downloading' && speed > 0 && `${formatSpeed(speed)} · ETA ${eta}`}
              {job.state === 'paused' && 'Paused'}
              {job.state === 'queued' && 'Queued'}
              {job.state === 'verifying' && 'Verifying…'}
              {job.state === 'extracting' && 'Extracting…'}
            </span>
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-1">
        {job.state === 'downloading' && (
          <>
            <Button variant="ghost" size="xs" onClick={onPause}><Pause className="h-3 w-3" aria-hidden /> Pause</Button>
            <Button variant="ghost" size="xs" onClick={onCancel}><X className="h-3 w-3" aria-hidden /> Cancel</Button>
          </>
        )}
        {job.state === 'queued' && (
          <Button variant="ghost" size="xs" onClick={onCancel}><X className="h-3 w-3" aria-hidden /> Cancel</Button>
        )}
        {job.state === 'paused' && (
          <>
            <Button variant="ghost" size="xs" onClick={onResume}><Play className="h-3 w-3" aria-hidden /> Resume</Button>
            <Button variant="ghost" size="xs" onClick={onCancel}><X className="h-3 w-3" aria-hidden /> Cancel</Button>
          </>
        )}
        {job.state === 'failed' && (
          <>
            <Button variant="ghost" size="xs" onClick={onRetry}><RotateCw className="h-3 w-3" aria-hidden /> Retry</Button>
            <Button variant="ghost" size="xs" onClick={onRemove}><Trash2 className="h-3 w-3" aria-hidden /> Remove</Button>
          </>
        )}
        {(job.state === 'done' || job.state === 'cancelled') && (
          <Button variant="ghost" size="xs" onClick={onRemove}><Trash2 className="h-3 w-3" aria-hidden /> Remove</Button>
        )}
      </div>
    </div>
  )
}
