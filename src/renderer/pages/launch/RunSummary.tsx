import { useMemo } from 'react'
import { Activity, CircleCheck, CircleX, Cpu, Gauge, Info, Layers, TriangleAlert } from 'lucide-react'
import { StatusPill, type StatusKind } from '@/components/ui/status-pill'
import { cn } from '@/lib/utils'
import { summarizeLog, type LaunchSummary, type Notice } from '../../../core/launcher/log-parser'
import type { ServerStatus } from '../../../core/launcher/types'

interface RunSummaryProps {
  logs: string[]
  status: ServerStatus
  onViewLine: (index: number) => void
}

const PHASE: Record<LaunchSummary['phase'], { kind: StatusKind; label: (s: LaunchSummary) => string }> = {
  idle: { kind: 'idle', label: () => 'Idle' },
  stopped: { kind: 'idle', label: () => 'Stopped' },
  loading: { kind: 'scanning', label: () => 'Loading model' },
  ready: { kind: 'ready', label: s => (s.port ? `Ready on :${s.port}` : 'Ready') },
  serving: { kind: 'running', label: () => 'Serving request' },
  error: { kind: 'error', label: () => 'Error' },
}

const TONE: Record<Notice['tone'], { icon: typeof Info; box: string; text: string }> = {
  info: { icon: Info, box: 'bg-muted/60', text: 'text-muted-foreground' },
  success: { icon: CircleCheck, box: 'bg-status-ready/10', text: 'text-status-ready' },
  warning: { icon: TriangleAlert, box: 'bg-status-warning/10', text: 'text-status-warning' },
  error: { icon: CircleX, box: 'bg-status-error/10', text: 'text-status-error' },
}

function formatElapsed(ms: number | null): string {
  if (ms === null) return ''
  const total = ms / 1000
  const m = Math.floor(total / 60)
  const s = (total % 60).toFixed(3).padStart(6, '0')
  return `${String(m).padStart(2, '0')}:${s}`
}

function formatTps(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : v.toFixed(1)
}

/** Polyline over the last generation speeds; the end point is marked. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <p className="text-xs text-muted-foreground py-6 text-center">Send a request to see generation speed here.</p>
  }
  const W = 600
  const H = 72
  const max = Math.max(...values) * 1.1 || 1
  const step = W / (values.length - 1)
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(H - (v / max) * H).toFixed(1)}`).join(' ')
  const last = points.split(' ').pop()!.split(',')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[72px] text-brand" role="img" aria-label="Generation speed for recent requests">
      <polyline fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={points} />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill="currentColor" />
    </svg>
  )
}

function Tile({ icon: Icon, label, children }: { icon: typeof Cpu; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </div>
      {children}
    </div>
  )
}

export function RunSummary({ logs, status, onViewLine }: RunSummaryProps) {
  const summary = useMemo(
    () => summarizeLog(logs, { running: status.state === 'running' || status.state === 'starting', errorText: status.error }),
    [logs, status.state, status.error]
  )
  const phase = PHASE[summary.phase]

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto min-h-0 flex-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <StatusPill kind={phase.kind} label={phase.label(summary)} />
        {summary.requestsDone > 0 && (
          <span className="text-[11px] text-muted-foreground">{summary.requestsDone} request{summary.requestsDone === 1 ? '' : 's'} completed</span>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <Tile icon={Cpu} label="Model">
          <p className="text-sm font-medium truncate" title={summary.model ?? undefined}>{summary.model ? summary.model.replace(/\.gguf$/i, '') : 'Not loaded'}</p>
          {summary.quant && (
            <span className="inline-block mt-1.5 text-[11px] font-mono px-1.5 py-0.5 rounded-md bg-brand/15 text-foreground">{summary.quant}</span>
          )}
        </Tile>
        <Tile icon={Layers} label="Context">
          <p className="text-xl font-semibold tabular-nums">{summary.ctxPerSlot ? summary.ctxPerSlot.toLocaleString() : '—'}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{summary.slots ? `${summary.slots} slot${summary.slots === 1 ? '' : 's'}` : 'Tokens per slot'}</p>
        </Tile>
        <Tile icon={Gauge} label="Generation">
          <p className="text-xl font-semibold tabular-nums">
            {formatTps(summary.last?.genTps)} <span className="text-xs font-normal text-muted-foreground">tok/s</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Prompt {formatTps(summary.last?.promptTps)} tok/s</p>
        </Tile>
      </div>

      <div className="rounded-xl bg-card border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Activity className="h-3.5 w-3.5" aria-hidden /> Speed, recent requests
          </span>
          {summary.genHistory.length > 0 && (
            <span className="text-[11px] tabular-nums text-muted-foreground">{summary.genHistory.length} sampled</span>
          )}
        </div>
        <Sparkline values={summary.genHistory} />
      </div>

      <div className="flex flex-col gap-2">
        {summary.notices.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nothing to report yet. Start the server to see its events here.</p>
        ) : (
          summary.notices.map(n => {
            const tone = TONE[n.tone]
            const Icon = tone.icon
            return (
              <div key={n.id} className={cn('flex items-start gap-2.5 rounded-xl px-3 py-2.5', tone.box)}>
                <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', tone.text)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', n.tone === 'info' ? 'text-foreground' : tone.text)}>{n.title}</p>
                  <p className="text-xs text-muted-foreground break-words">{n.detail}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {n.elapsedMs !== null && (
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{formatElapsed(n.elapsedMs)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onViewLine(n.lineIndex)}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    View line
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
