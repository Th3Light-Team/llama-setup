import type { BenchSpec } from './types'

/**
 * "Quick bench" — a fast, opinionated run for getting a rough sense of how
 * a model performs on this machine.  Single prompt+gen pair, 3 reps.
 * Should complete in well under a minute for a small model.
 */
export function quickBenchSpec(modelPath: string, installPath: string): BenchSpec {
  return {
    modelPath,
    installPath,
    prompts: [512],
    generations: [128],
    repetitions: 3,
    threads: 0,    // auto
    gpuLayers: -1, // all layers on GPU
    flashAttn: true,
    timeoutMs: 5 * 60 * 1000,
  }
}

/**
 * Defaults presented to the user in the custom-bench dialog.  Identical to
 * quickBenchSpec but with the wider sweep llama-bench's docs recommend for
 * comparing models.
 */
export function customBenchDefaults(modelPath: string, installPath: string): BenchSpec {
  return {
    modelPath,
    installPath,
    prompts: [512],
    generations: [128],
    repetitions: 3,
    threads: 0,
    batchSize: 2048,
    microBatchSize: 512,
    gpuLayers: -1,
    flashAttn: true,
    timeoutMs: 10 * 60 * 1000,
  }
}

/**
 * Translate a BenchSpec into the CLI argument array for llama-bench.
 * Always sets `-o json` so the parser has a stable contract.
 */
export function specToArgs(spec: BenchSpec): string[] {
  const args: string[] = ['-m', spec.modelPath, '-o', 'json']

  if (spec.prompts && spec.prompts.length > 0) {
    args.push('-p', spec.prompts.join(','))
  }
  if (spec.generations && spec.generations.length > 0) {
    args.push('-n', spec.generations.join(','))
  }
  if (typeof spec.repetitions === 'number') {
    args.push('-r', String(spec.repetitions))
  }
  if (typeof spec.threads === 'number' && spec.threads > 0) {
    args.push('-t', String(spec.threads))
  }
  if (typeof spec.batchSize === 'number') {
    args.push('-b', String(spec.batchSize))
  }
  if (typeof spec.microBatchSize === 'number') {
    args.push('-ub', String(spec.microBatchSize))
  }
  if (typeof spec.gpuLayers === 'number') {
    args.push('-ngl', String(spec.gpuLayers))
  }
  if (spec.flashAttn === true) {
    args.push('-fa', '1')
  }

  return args
}
