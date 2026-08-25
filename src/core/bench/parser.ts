import type { BenchContext, BenchResult, BenchTest } from './types'

/**
 * Extract the JSON array from llama-bench's combined stdout (the only
 * format we use is `-o json`).  llama-bench prints a few non-JSON lines
 * first (build banner, warmup status with --progress) so we strip everything
 * before the opening `[` and after the matching `]`.
 *
 * Returns `null` if no parseable array is found — caller decides how to
 * surface that (usually "no results produced; see logs").
 */
export function extractJsonArray(rawStdout: string): unknown[] | null {
  const start = rawStdout.indexOf('[')
  if (start === -1) return null

  // Walk forward until brackets balance; ignore `[` / `]` inside strings.
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < rawStdout.length; i++) {
    const ch = rawStdout[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        try {
          const parsed = JSON.parse(rawStdout.slice(start, i + 1))
          return Array.isArray(parsed) ? parsed : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * Classify a single test row.
 *   n_prompt > 0, n_gen = 0 → "pp" (prompt processing)
 *   n_prompt = 0, n_gen > 0 → "tg" (token generation)
 *   both > 0                → "mixed" (when used with --pg)
 */
function classify(row: { n_prompt?: number; n_gen?: number }): BenchTest['kind'] {
  const p = row.n_prompt ?? 0
  const g = row.n_gen ?? 0
  if (p > 0 && g === 0) return 'pp'
  if (p === 0 && g > 0) return 'tg'
  if (p > 0 && g > 0) return 'mixed'
  return 'unknown'
}

/**
 * Map a single llama-bench JSON row to our typed test.  Fields default
 * conservatively so a future llama.cpp build that drops a field doesn't
 * make the parser throw.
 */
function rowToTest(row: Record<string, unknown>): BenchTest {
  const num = (k: string): number => {
    const v = row[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  const bool = (k: string): boolean => row[k] === true
  const str = (k: string): string => typeof row[k] === 'string' ? (row[k] as string) : ''

  const samples = Array.isArray(row.samples_ts) ? row.samples_ts as unknown[] : []

  return {
    kind: classify(row as { n_prompt?: number; n_gen?: number }),
    tokensPerSec: num('avg_ts'),
    tokensPerSecStddev: num('stddev_ts'),
    avgNs: num('avg_ns'),
    testTime: str('test_time'),
    nPrompt: num('n_prompt'),
    nGen: num('n_gen'),
    nThreads: num('n_threads'),
    nGpuLayers: num('n_gpu_layers'),
    nBatch: num('n_batch'),
    nUbatch: num('n_ubatch'),
    flashAttn: bool('flash_attn'),
    sampleCount: samples.length,
  }
}

/**
 * llama-bench repeats the per-machine context (CPU/GPU/build/model info) on
 * every row.  Take the first row as canonical; the rows must all describe
 * the same model loaded from the same install.
 */
function extractContext(firstRow: Record<string, unknown>): BenchContext {
  const num = (k: string): number => typeof firstRow[k] === 'number' ? (firstRow[k] as number) : 0
  const numOrNull = (k: string): number | null => typeof firstRow[k] === 'number' ? (firstRow[k] as number) : null
  const strOrNull = (k: string): string | null => typeof firstRow[k] === 'string' ? (firstRow[k] as string) : null
  const str = (k: string): string => strOrNull(k) ?? ''
  return {
    buildCommit: strOrNull('build_commit'),
    buildNumber: numOrNull('build_number'),
    cpuInfo: str('cpu_info').trim(),
    gpuInfo: str('gpu_info').trim(),
    backends: str('backends'),
    modelType: str('model_type').trim(),
    modelSizeBytes: num('model_size'),
    modelParamCount: num('model_n_params'),
  }
}

/**
 * Parse a full llama-bench `-o json` stdout into a typed BenchResult.
 * Returns `null` when no valid JSON array was found.  Rows that aren't
 * objects are skipped — partial output is better than nothing for the UI.
 */
export function parseBenchOutput(stdout: string): BenchResult | null {
  const arr = extractJsonArray(stdout)
  if (!arr || arr.length === 0) return null

  const objectRows = arr.filter(
    (r): r is Record<string, unknown> => typeof r === 'object' && r !== null && !Array.isArray(r)
  )
  if (objectRows.length === 0) return null

  return {
    context: extractContext(objectRows[0]),
    tests: objectRows.map(rowToTest),
  }
}
