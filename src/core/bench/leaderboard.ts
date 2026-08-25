import type { BenchJob } from './types'
import { extractQuantization } from '../registry/hf-client'

/**
 * One leaderboard entry — a single benchmarked configuration, sliceable across
 * the four axes (model · engine · device · params).
 */
export interface LeaderboardRow {
  jobId: string
  model: string
  quant: string
  engineLabel: string
  backend: string
  device: string
  ngl: number
  flashAttn: boolean
  threads: number
  ppTps: number | null
  tgTps: number | null
  when: string
  /** How many runs collapsed into this row when deduping best-per-config. */
  runCount: number
}

export type RankMetric = 'tg' | 'pp'

function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function configKey(r: LeaderboardRow): string {
  return [r.model, r.quant, r.engineLabel, r.backend, r.device, r.ngl, r.flashAttn, r.threads].join('|')
}

function metricOf(r: LeaderboardRow, rankBy: RankMetric): number {
  return (rankBy === 'tg' ? r.tgTps : r.ppTps) ?? -1
}

/**
 * Convert a completed bench job into a leaderboard row. Returns null for jobs
 * that aren't done or produced no parseable result. When a run contains
 * several prompt/gen sizes, the fastest test of each kind is taken as the
 * representative (pp from the best pp test, tg from the best tg test).
 */
export function jobToRow(job: BenchJob): LeaderboardRow | null {
  if (job.state !== 'done' || !job.result) return null
  const tests = job.result.tests
  if (tests.length === 0) return null

  const tg = tests.filter(t => t.kind === 'tg').sort((a, b) => b.tokensPerSec - a.tokensPerSec)[0]
  const pp = tests.filter(t => t.kind === 'pp').sort((a, b) => b.tokensPerSec - a.tokensPerSec)[0]
  const rep = tg ?? pp ?? tests[0]

  const file = baseName(job.modelPath)
  const ctx = job.result.context

  return {
    jobId: job.id,
    model: file.replace(/\.gguf$/i, ''),
    quant: extractQuantization(file),
    engineLabel: ctx.buildNumber ? `b${ctx.buildNumber}` : baseName(job.installPath),
    backend: ctx.backends || 'unknown',
    device: job.spec.deviceLabel || 'auto',
    ngl: rep.nGpuLayers,
    flashAttn: rep.flashAttn,
    threads: rep.nThreads,
    ppTps: pp ? pp.tokensPerSec : null,
    tgTps: tg ? tg.tokensPerSec : null,
    when: job.finishedAt || job.createdAt,
    runCount: 1,
  }
}

/**
 * Build the ranked leaderboard from bench jobs.
 *   - dedupe (default true): keep the best run per unique config, counting how
 *     many runs share that config.
 *   - rankBy: sort descending by tg or pp tokens/sec.
 */
export function toLeaderboardRows(
  jobs: BenchJob[],
  opts: { dedupe?: boolean; rankBy?: RankMetric } = {}
): LeaderboardRow[] {
  const rankBy = opts.rankBy ?? 'tg'
  const dedupe = opts.dedupe ?? true

  const raw = jobs.map(jobToRow).filter((r): r is LeaderboardRow => r !== null)

  let rows = raw
  if (dedupe) {
    const best = new Map<string, LeaderboardRow>()
    for (const r of raw) {
      const k = configKey(r)
      const cur = best.get(k)
      if (!cur) {
        best.set(k, { ...r })
      } else {
        const winner = metricOf(r, rankBy) > metricOf(cur, rankBy) ? { ...r } : { ...cur }
        winner.runCount = cur.runCount + 1
        best.set(k, winner)
      }
    }
    rows = [...best.values()]
  }

  return rows.sort((a, b) => metricOf(b, rankBy) - metricOf(a, rankBy))
}

/** The model id that appears most across rows — used to default the filter to a
 *  single model (a fair hardware shootout) rather than a mixed-model board. */
export function mostBenchedModel(rows: LeaderboardRow[]): string | null {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.model, (counts.get(r.model) ?? 0) + 1)
  let top: string | null = null
  let max = 0
  for (const [model, n] of counts) if (n > max) { max = n; top = model }
  return top
}
