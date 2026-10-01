import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Trophy, Plus, Gauge, Cpu, Monitor, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { useBenchStore } from '@/lib/stores/bench'
import { cn } from '@/lib/utils'
import { toLeaderboardRows, mostBenchedModel, type RankMetric, type LeaderboardRow } from '../../core/bench/leaderboard'
import { BenchDetailsDialog } from '@/components/BenchDetailsDialog'

const ALL = '__all__'

function medalStyle(rank: number): { bg: string; text: string } | null {
  if (rank === 0) return { bg: '#BA7517', text: '#fff' } // gold
  if (rank === 1) return { bg: '#888780', text: '#fff' } // silver
  if (rank === 2) return { bg: '#D85A30', text: '#fff' } // bronze
  return null
}

function Select({ value, onChange, options, label }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; label: string
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-7 rounded-md border border-border bg-muted px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export default function BenchLeaderboardPage() {
  const navigate = useNavigate()
  const jobsMap = useBenchStore(useShallow(s => s.jobs))
  const [rankBy, setRankBy] = useState<RankMetric>('tg')
  const [modelFilter, setModelFilter] = useState<string>(ALL)
  const [engineFilter, setEngineFilter] = useState<string>(ALL)
  const [deviceFilter, setDeviceFilter] = useState<string>(ALL)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const didInitModel = useRef(false)

  const jobs = useMemo(() => Object.values(jobsMap), [jobsMap])
  const allRows = useMemo(() => toLeaderboardRows(jobs, { rankBy }), [jobs, rankBy])

  const activeCount = useMemo(
    () => jobs.filter(j => j.state === 'running' || j.state === 'queued').length,
    [jobs]
  )

  // Default the model filter to the most-benched model once, for a fair
  // single-model shootout instead of a mixed-model raw-speed board.
  useEffect(() => {
    if (didInitModel.current || allRows.length === 0) return
    const top = mostBenchedModel(allRows)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot default once async bench rows arrive (guarded by ref)
    if (top) { setModelFilter(top); didInitModel.current = true }
  }, [allRows])

  const models = useMemo(() => [...new Set(allRows.map(r => r.model))], [allRows])
  const engines = useMemo(() => [...new Set(allRows.map(r => r.engineLabel))], [allRows])
  const devices = useMemo(() => [...new Set(allRows.map(r => r.device))], [allRows])

  const rows = useMemo(() => allRows.filter(r =>
    (modelFilter === ALL || r.model === modelFilter)
    && (engineFilter === ALL || r.engineLabel === engineFilter)
    && (deviceFilter === ALL || r.device === deviceFilter)
  ), [allRows, modelFilter, engineFilter, deviceFilter])

  const maxMetric = useMemo(() => {
    const vals = rows.map(r => (rankBy === 'tg' ? r.tgTps : r.ppTps) ?? 0)
    return Math.max(1, ...vals)
  }, [rows, rankBy])

  const detailsJob = detailsId ? jobsMap[detailsId] ?? null : null

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl pb-10">
        <PageHeader
          title="Bench leaderboard"
          subtitle="Every run you've measured, ranked"
          actions={
            <Button size="sm" className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => navigate('/library')}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> New bench
            </Button>
          }
        />

        {allRows.length === 0 ? (
          <EmptyState
            icon={<Gauge className="h-6 w-6" aria-hidden />}
            title={activeCount > 0 ? 'Benchmark running…' : 'No benchmarks yet'}
            body={activeCount > 0
              ? 'Results will appear here as runs finish.'
              : 'Run a Quick or Custom bench on any model in your Library to put it on the board.'}
            action={<Button size="sm" onClick={() => navigate('/library')}>Go to Library</Button>}
          />
        ) : (
          <>
            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <Select label="Model" value={modelFilter} onChange={setModelFilter}
                options={[{ value: ALL, label: 'All' }, ...models.map(m => ({ value: m, label: m }))]} />
              <Select label="Engine" value={engineFilter} onChange={setEngineFilter}
                options={[{ value: ALL, label: 'All' }, ...engines.map(e => ({ value: e, label: e }))]} />
              <Select label="Device" value={deviceFilter} onChange={setDeviceFilter}
                options={[{ value: ALL, label: 'All' }, ...devices.map(d => ({ value: d, label: d }))]} />
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">rank by</span>
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  {(['tg', 'pp'] as RankMetric[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setRankBy(m)}
                      className={cn('px-2.5 py-1 text-xs', rankBy === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
                    >
                      {m === 'tg' ? 'tg t/s' : 'pp t/s'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {activeCount > 0 && (
              <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {activeCount} run{activeCount === 1 ? '' : 's'} in progress
              </p>
            )}

            {modelFilter === ALL && models.length > 1 && (
              <p className="text-[11px] text-status-warning mb-2">
                Ranking across different models compares raw speed — filter to one model for a fair hardware comparison.
              </p>
            )}

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {rows.map((row, i) => (
                <LeaderboardRowItem
                  key={row.jobId}
                  row={row}
                  rank={i}
                  rankBy={rankBy}
                  widthPct={Math.round((((rankBy === 'tg' ? row.tgTps : row.ppTps) ?? 0) / maxMetric) * 100)}
                  onClick={() => setDetailsId(row.jobId)}
                  isLast={i === rows.length - 1}
                />
              ))}
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No runs match these filters.</p>
              )}
            </div>
          </>
        )}
      </div>

      <BenchDetailsDialog
        open={!!detailsJob}
        job={detailsJob}
        onOpenChange={(o) => { if (!o) setDetailsId(null) }}
      />
    </div>
  )
}

function LeaderboardRowItem({ row, rank, rankBy, widthPct, onClick, isLast }: {
  row: LeaderboardRow; rank: number; rankBy: RankMetric; widthPct: number; onClick: () => void; isLast: boolean
}) {
  const medal = medalStyle(rank)
  const metric = rankBy === 'tg' ? row.tgTps : row.ppTps
  const secondary = rankBy === 'tg' ? row.ppTps : row.tgTps
  const secondaryLabel = rankBy === 'tg' ? 'pp/s' : 'tg/s'

  return (
    <button
      onClick={onClick}
      className={cn('w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors', !isLast && 'border-b border-border')}
    >
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
        style={medal ? { background: medal.bg, color: medal.text } : undefined}
      >
        {rank === 0 ? <Trophy className="h-3 w-3" aria-hidden /> : <span className={cn(!medal && 'text-muted-foreground')}>{rank + 1}</span>}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{row.model}</div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          <Badge variant="secondary" className="text-[10px] font-mono gap-1">
            {row.device === 'CPU' ? <Cpu className="h-2.5 w-2.5" aria-hidden /> : <Monitor className="h-2.5 w-2.5" aria-hidden />}
            {row.backend}{row.device !== 'auto' ? ` · ${row.device}` : ''}
          </Badge>
          <span className="text-[10px] text-muted-foreground font-mono">{row.engineLabel}</span>
          <span className="text-[10px] text-muted-foreground font-mono">ngl {row.ngl}</span>
          {row.flashAttn && <span className="text-[10px] text-muted-foreground font-mono">fa</span>}
          {row.runCount > 1 && <span className="text-[10px] text-muted-foreground">×{row.runCount}</span>}
        </div>
      </div>

      <div className="w-40 shrink-0 text-right">
        <div className="text-sm font-medium tabular-nums">
          {metric != null ? metric.toFixed(1) : '—'} <span className="text-[10px] text-muted-foreground">{rankBy} t/s</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
          <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: '#EF9F27' }} />
        </div>
        <div className="text-[10px] text-muted-foreground font-mono mt-1">
          {secondary != null ? `${secondary.toFixed(0)} ${secondaryLabel}` : ''}
        </div>
      </div>
    </button>
  )
}
