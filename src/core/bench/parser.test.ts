import { describe, it, expect } from 'vitest'
import { extractJsonArray, parseBenchOutput } from './parser'
import { specToArgs, quickBenchSpec } from './defaults'

const REAL_FIXTURE = `load_backend: loaded RPC backend
ggml_vulkan: Found 2 Vulkan devices
[
  {
    "build_commit": "a29e4c0b7",
    "build_number": 8757,
    "cpu_info": "AMD Ryzen AI 9 HX 370 w/ Radeon 890M           ",
    "gpu_info": "AMD Radeon(TM) 890M Graphics, NVIDIA GeForce RTX 4070 Laptop GPU",
    "backends": "Vulkan",
    "model_filename": "C:\\\\Users\\\\olive\\\\.llama-studio\\\\models\\\\m.gguf",
    "model_type": "llama 256M IQ3_XS - 3.3 bpw",
    "model_size": 86416128,
    "model_n_params": 134515008,
    "n_batch": 2048,
    "n_ubatch": 512,
    "n_threads": 12,
    "n_gpu_layers": 99,
    "flash_attn": false,
    "n_prompt": 32,
    "n_gen": 0,
    "n_depth": 0,
    "test_time": "2026-06-13T04:39:25Z",
    "avg_ns": 5318100,
    "stddev_ns": 0,
    "avg_ts": 6017.186589,
    "stddev_ts": 0.0,
    "samples_ns": [ 5318100 ],
    "samples_ts": [ 6017.19 ]
  },
  {
    "build_commit": "a29e4c0b7",
    "build_number": 8757,
    "cpu_info": "AMD Ryzen AI 9 HX 370 w/ Radeon 890M           ",
    "gpu_info": "AMD Radeon(TM) 890M Graphics, NVIDIA GeForce RTX 4070 Laptop GPU",
    "backends": "Vulkan",
    "model_filename": "C:\\\\Users\\\\olive\\\\.llama-studio\\\\models\\\\m.gguf",
    "model_type": "llama 256M IQ3_XS - 3.3 bpw",
    "model_size": 86416128,
    "model_n_params": 134515008,
    "n_batch": 2048,
    "n_ubatch": 512,
    "n_threads": 12,
    "n_gpu_layers": 99,
    "flash_attn": false,
    "n_prompt": 0,
    "n_gen": 16,
    "n_depth": 0,
    "test_time": "2026-06-13T04:39:30Z",
    "avg_ns": 56364300,
    "stddev_ns": 0,
    "avg_ts": 283.867625,
    "stddev_ts": 0.0,
    "samples_ns": [ 56364300, 56400000, 56300000 ],
    "samples_ts": [ 283.86, 283.7, 284.0 ]
  }
]`

describe('extractJsonArray', () => {
  it('extracts the array even with non-JSON preamble', () => {
    const arr = extractJsonArray(REAL_FIXTURE)
    expect(arr).not.toBeNull()
    expect(arr).toHaveLength(2)
  })

  it('ignores brackets inside string values', () => {
    const input = 'preamble [{"a": "value with ] in it"}]'
    const arr = extractJsonArray(input)
    expect(arr).toEqual([{ a: 'value with ] in it' }])
  })

  it('returns null when no array present', () => {
    expect(extractJsonArray('just some logs')).toBeNull()
  })

  it('returns null when JSON is unclosed', () => {
    expect(extractJsonArray('[{"a": 1}')).toBeNull()
  })
})

describe('parseBenchOutput', () => {
  it('parses a real two-test llama-bench run', () => {
    const result = parseBenchOutput(REAL_FIXTURE)
    expect(result).not.toBeNull()
    expect(result!.tests).toHaveLength(2)

    const [pp, tg] = result!.tests
    expect(pp.kind).toBe('pp')
    expect(pp.nPrompt).toBe(32)
    expect(pp.tokensPerSec).toBeCloseTo(6017.19, 1)

    expect(tg.kind).toBe('tg')
    expect(tg.nGen).toBe(16)
    expect(tg.tokensPerSec).toBeCloseTo(283.87, 1)
    expect(tg.sampleCount).toBe(3)
  })

  it('extracts shared context once', () => {
    const result = parseBenchOutput(REAL_FIXTURE)!
    expect(result.context.buildNumber).toBe(8757)
    expect(result.context.backends).toBe('Vulkan')
    expect(result.context.cpuInfo).toBe('AMD Ryzen AI 9 HX 370 w/ Radeon 890M')
    expect(result.context.modelSizeBytes).toBe(86416128)
  })

  it('returns null when no JSON found', () => {
    expect(parseBenchOutput('error: model file not found')).toBeNull()
  })

  it('survives a row missing optional fields', () => {
    const minimal = '[{"n_prompt": 16, "n_gen": 0, "avg_ts": 100}]'
    const result = parseBenchOutput(minimal)
    expect(result).not.toBeNull()
    expect(result!.tests[0].kind).toBe('pp')
    expect(result!.tests[0].tokensPerSec).toBe(100)
    // Missing fields should default to safe zeros / empty strings, not throw.
    expect(result!.context.cpuInfo).toBe('')
  })
})

describe('specToArgs', () => {
  it('always sets -o json and -m', () => {
    const args = specToArgs(quickBenchSpec('/m.gguf', '/install'))
    expect(args).toContain('-o')
    expect(args[args.indexOf('-o') + 1]).toBe('json')
    expect(args).toContain('-m')
    expect(args[args.indexOf('-m') + 1]).toBe('/m.gguf')
  })

  it('omits threads when auto (0)', () => {
    const args = specToArgs({ modelPath: '/m', installPath: '/i', threads: 0 })
    expect(args).not.toContain('-t')
  })

  it('joins multiple prompt sizes with commas', () => {
    const args = specToArgs({
      modelPath: '/m', installPath: '/i',
      prompts: [128, 512, 1024], generations: [128]
    })
    expect(args[args.indexOf('-p') + 1]).toBe('128,512,1024')
  })

  it('emits -fa 1 when flashAttn true (not when undefined)', () => {
    expect(specToArgs({ modelPath: '/m', installPath: '/i', flashAttn: true })).toContain('-fa')
    expect(specToArgs({ modelPath: '/m', installPath: '/i' })).not.toContain('-fa')
  })
})
