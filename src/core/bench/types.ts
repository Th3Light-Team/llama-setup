/**
 * Bench domain types — kept free of Node/Electron imports so they can be
 * shared between main and renderer.
 */

export type BenchState =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled'

/**
 * User-facing bench knobs.  Mirrors a curated subset of llama-bench flags
 * — the ones most commonly tuned for "how fast can this model run?".
 * The runner translates these into CLI args.
 */
export interface BenchSpec {
  /** Required. Absolute path to a .gguf file. */
  modelPath: string
  /** Required. Path to the install directory (we resolve llama-bench inside it). */
  installPath: string
  /** Display name for the job. Defaults to the model filename. */
  displayName?: string
  /** Prompt sizes to test (-p). e.g. [512] or [128, 512, 1024] */
  prompts?: number[]
  /** Generation sizes to test (-n). e.g. [128] */
  generations?: number[]
  /** Repetitions per test (-r). Default 3. Lower = faster, noisier. */
  repetitions?: number
  /** CPU threads (-t). 0 = auto. */
  threads?: number
  /** Logical batch size (-b). */
  batchSize?: number
  /** Micro-batch size (-ub). */
  microBatchSize?: number
  /** GPU layer offload (-ngl). -1 = all. */
  gpuLayers?: number
  /** Flash attention (-fa). */
  flashAttn?: boolean
  /** Specific device to target (-dev), e.g. "Vulkan0". Phase 2 entry flow. */
  device?: string
  /** Human label for `device`, shown on the leaderboard (e.g. "RTX 4070"). */
  deviceLabel?: string
  /** Time budget. After this elapses we kill the process. Default 5 min. */
  timeoutMs?: number
}

/**
 * One row from llama-bench's JSON output (one model × one test config).
 * llama-bench emits this for every (prompt, generation) pair × repetition group.
 */
export interface BenchTest {
  /** "pp" (prompt processing) when n_prompt>0, n_gen=0; "tg" (token gen) when reversed. */
  kind: 'pp' | 'tg' | 'mixed' | 'unknown'
  /** Tokens per second — main metric. */
  tokensPerSec: number
  /** Standard deviation of tokens/sec across repetitions. */
  tokensPerSecStddev: number
  /** Average run time in nanoseconds. */
  avgNs: number
  /** ISO timestamp of when this test ran. */
  testTime: string
  /** Raw test parameters. */
  nPrompt: number
  nGen: number
  nThreads: number
  nGpuLayers: number
  nBatch: number
  nUbatch: number
  flashAttn: boolean
  /** Number of individual samples that fed into avg/stddev. */
  sampleCount: number
}

/**
 * Aggregated machine context, captured once per bench run (identical across
 * tests in a single run because llama-bench emits it on every row).
 */
export interface BenchContext {
  buildCommit: string | null
  buildNumber: number | null
  cpuInfo: string
  gpuInfo: string
  backends: string
  modelType: string
  modelSizeBytes: number
  modelParamCount: number
}

export interface BenchResult {
  context: BenchContext
  tests: BenchTest[]
}

export interface BenchJob {
  id: string
  modelPath: string
  /** Short name for the sidebar — usually the model filename. */
  displayName: string
  installPath: string
  spec: BenchSpec
  state: BenchState
  /** 0-100; runner estimates from output progress markers. */
  progress: number
  /** Full text output (mostly stderr — backend loading + warm-up logs). */
  log: string
  /** Parsed result when state === 'done'. */
  result: BenchResult | null
  errorMessage: string | null
  exitCode: number | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}
