import { describe, it, expect } from 'vitest'
import { jobToRow, toLeaderboardRows, mostBenchedModel } from './leaderboard'
import type { BenchJob, BenchResult } from './types'

function result(over: Partial<BenchResult['context']>, tg: number, pp: number, ngl = 99, fa = true): BenchResult {
  return {
    context: {
      buildCommit: 'abc', buildNumber: 8757, cpuInfo: 'Ryzen', gpuInfo: 'RTX 4070',
      backends: 'CUDA', modelType: 'llama', modelSizeBytes: 1000, modelParamCount: 100, ...over,
    },
    tests: [
      { kind: 'pp', tokensPerSec: pp, tokensPerSecStddev: 0, avgNs: 1, testTime: '', nPrompt: 512, nGen: 0, nThreads: 12, nGpuLayers: ngl, nBatch: 2048, nUbatch: 512, flashAttn: fa, sampleCount: 1 },
      { kind: 'tg', tokensPerSec: tg, tokensPerSecStddev: 0, avgNs: 1, testTime: '', nPrompt: 0, nGen: 128, nThreads: 12, nGpuLayers: ngl, nBatch: 2048, nUbatch: 512, flashAttn: fa, sampleCount: 1 },
    ],
  }
}

function job(id: string, modelPath: string, res: BenchResult | null, state: BenchJob['state'] = 'done'): BenchJob {
  return {
    id, modelPath, displayName: modelPath, installPath: 'C:/engines/b8757-cuda',
    spec: { modelPath, installPath: 'C:/engines/b8757-cuda' },
    state, progress: 100, log: '', result: res, errorMessage: null, exitCode: 0,
    startedAt: null, finishedAt: '2026-06-13T10:00:00Z', createdAt: '2026-06-13T09:00:00Z',
  }
}

describe('jobToRow', () => {
  it('extracts model, quant, engine, params and metrics', () => {
    const row = jobToRow(job('1', 'C:/models/SmolLM2-135M-Q4_K_M.gguf', result({}, 311.7, 11427)))!
    expect(row.model).toBe('SmolLM2-135M-Q4_K_M')
    expect(row.quant).toBe('Q4_K_M')
    expect(row.engineLabel).toBe('b8757')
    expect(row.backend).toBe('CUDA')
    expect(row.tgTps).toBeCloseTo(311.7)
    expect(row.ppTps).toBeCloseTo(11427)
    expect(row.ngl).toBe(99)
    expect(row.flashAttn).toBe(true)
  })

  it('returns null for non-done or resultless jobs', () => {
    expect(jobToRow(job('1', 'm.gguf', null, 'running'))).toBeNull()
    expect(jobToRow(job('2', 'm.gguf', null, 'done'))).toBeNull()
  })

  it('defaults device to "auto" when the run had no -dev target', () => {
    const row = jobToRow(job('1', 'm.gguf', result({}, 100, 200)))!
    expect(row.device).toBe('auto')
  })
})

describe('toLeaderboardRows', () => {
  const jobs: BenchJob[] = [
    job('a', 'C:/m/SmolLM2-Q4_K_M.gguf', result({ backends: 'CUDA' }, 311.7, 11427)),
    job('b', 'C:/m/SmolLM2-Q4_K_M.gguf', result({ backends: 'Vulkan' }, 270.0, 8900)),
    job('c', 'C:/m/Llama-3.2-1B-Q4_K_M.gguf', result({ backends: 'CUDA' }, 142.3, 6200)),
    job('dup', 'C:/m/SmolLM2-Q4_K_M.gguf', result({ backends: 'CUDA' }, 305.0, 11000)), // same config as 'a'
  ]

  it('ranks by tg t/s descending', () => {
    const rows = toLeaderboardRows(jobs, { rankBy: 'tg' })
    expect(rows[0].backend).toBe('CUDA')
    expect(rows[0].tgTps).toBeCloseTo(311.7)
    expect(rows.map(r => r.tgTps)).toEqual([...rows.map(r => r.tgTps)].sort((x, y) => (y ?? 0) - (x ?? 0)))
  })

  it('dedupes best-per-config and counts runs', () => {
    const rows = toLeaderboardRows(jobs, { rankBy: 'tg' })
    // 'a' and 'dup' share a config (CUDA SmolLM2 ngl99 fa) → 1 row, count 2, best=311.7
    const cuda = rows.find(r => r.backend === 'CUDA' && r.model.startsWith('SmolLM2'))!
    expect(cuda.runCount).toBe(2)
    expect(cuda.tgTps).toBeCloseTo(311.7)
    // total unique configs: CUDA-Smol, Vulkan-Smol, CUDA-Llama = 3
    expect(rows).toHaveLength(3)
  })

  it('can rank by pp instead', () => {
    const rows = toLeaderboardRows(jobs, { rankBy: 'pp' })
    expect(rows[0].ppTps).toBeCloseTo(11427)
  })

  it('skips unfinished jobs', () => {
    const rows = toLeaderboardRows([...jobs, job('x', 'm.gguf', null, 'failed')])
    expect(rows.every(r => r.tgTps !== null || r.ppTps !== null)).toBe(true)
  })
})

describe('mostBenchedModel', () => {
  it('returns the model with the most rows', () => {
    const rows = toLeaderboardRows([
      job('a', 'C:/m/SmolLM2-Q4_K_M.gguf', result({ backends: 'CUDA' }, 311, 100)),
      job('b', 'C:/m/SmolLM2-Q4_K_M.gguf', result({ backends: 'Vulkan' }, 270, 90)),
      job('c', 'C:/m/Llama-3.2-1B-Q4_K_M.gguf', result({ backends: 'CUDA' }, 142, 80)),
    ])
    expect(mostBenchedModel(rows)).toBe('SmolLM2-Q4_K_M')
  })

  it('returns null for empty', () => {
    expect(mostBenchedModel([])).toBeNull()
  })
})
