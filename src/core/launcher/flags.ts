import { FlagDef } from './types'

/**
 * Complete flag catalog for llama-server.
 * Sourced from: https://github.com/ggerganov/llama.cpp/blob/master/examples/server/README.md
 *
 * Groups:
 *   core        — model path, threads, batch size
 *   gpu         — GPU layers, tensor split, VRAM budget
 *   context     — context length, rope, prompt cache
 *   sampling    — temperature, top-k, top-p, repeat penalty
 *   server      — host, port, parallel slots, API key
 *   experimental — draft model, speculative decoding, flash attention
 */
export const FLAG_CATALOG: FlagDef[] = [
  // ═══════════════════════════════════════════════════════════
  //  CORE
  // ═══════════════════════════════════════════════════════════
  {
    key: 'model', flag: '-m', label: 'Model Path', group: 'core',
    description: 'Path to the GGUF model file',
    type: 'string', default: ''
  },
  {
    key: 'threads', flag: '-t', label: 'Threads', group: 'core',
    description: 'Number of CPU threads for generation (0 = auto)',
    type: 'number', default: 0, min: 0, max: 128, step: 1, unit: 'threads'
  },
  {
    key: 'threads_batch', flag: '-tb', label: 'Batch Threads', group: 'core',
    description: 'Number of CPU threads for prompt processing (0 = same as threads)',
    type: 'number', default: 0, min: 0, max: 128, step: 1, unit: 'threads'
  },
  {
    key: 'batch_size', flag: '-b', label: 'Batch Size', group: 'core',
    description: 'Logical batch size for prompt processing',
    type: 'number', default: 2048, min: 32, max: 8192, step: 32, affectsVram: true
  },
  {
    key: 'ubatch_size', flag: '-ub', label: 'Micro Batch', group: 'core',
    description: 'Physical micro-batch size',
    type: 'number', default: 512, min: 32, max: 2048, step: 32, affectsVram: true
  },

  // ═══════════════════════════════════════════════════════════
  //  GPU
  // ═══════════════════════════════════════════════════════════
  {
    key: 'n_gpu_layers', flag: '-ngl', label: 'GPU Layers', group: 'gpu',
    description: 'Number of model layers to offload to GPU (-1 = all)',
    type: 'number', default: -1, min: -1, max: 200, step: 1, affectsVram: true, gpuOnly: true
  },
  {
    key: 'split_mode', flag: '-sm', label: 'Split Mode', group: 'gpu',
    description: 'How to split across multiple GPUs',
    type: 'select', default: 'layer',
    options: [
      { value: 'none', label: 'None' },
      { value: 'layer', label: 'Layer (default)' },
      { value: 'row', label: 'Row' }
    ],
    gpuOnly: true
  },
  {
    key: 'main_gpu', flag: '-mg', label: 'Main GPU', group: 'gpu',
    description: 'Index of the main GPU for computations',
    type: 'number', default: 0, min: 0, max: 7, step: 1, gpuOnly: true
  },
  {
    key: 'flash_attn', flag: '-fa', label: 'Flash Attention', group: 'gpu',
    description: 'Enable Flash Attention for faster inference',
    type: 'boolean', default: true, gpuOnly: true, affectsVram: true,
    offArgs: ['-fa', 'off']
  },

  // ═══════════════════════════════════════════════════════════
  //  CONTEXT
  // ═══════════════════════════════════════════════════════════
  {
    key: 'ctx_size', flag: '-c', label: 'Context Size', group: 'context',
    description: 'Size of the prompt context window in tokens',
    type: 'number', default: 4096, min: 128, max: 131072, step: 128, unit: 'tokens', affectsVram: true
  },
  {
    key: 'rope_freq_base', flag: '--rope-freq-base', label: 'RoPE Freq Base', group: 'context',
    description: 'Base frequency for RoPE (Rotary Position Embedding)',
    type: 'number', default: 0, min: 0, max: 1000000, step: 1000
  },
  {
    key: 'rope_freq_scale', flag: '--rope-freq-scale', label: 'RoPE Freq Scale', group: 'context',
    description: 'Scale factor for RoPE frequency',
    type: 'number', default: 0, min: 0, max: 10, step: 0.1
  },
  {
    key: 'cache_type_k', flag: '-ctk', label: 'KV Cache Type (K)', group: 'context',
    description: 'Data type for K cache (lower = less VRAM)',
    type: 'select', default: 'f16',
    options: [
      { value: 'f32', label: 'F32 (most accurate)' },
      { value: 'f16', label: 'F16 (default)' },
      { value: 'q8_0', label: 'Q8_0 (50% savings)' },
      { value: 'q4_0', label: 'Q4_0 (75% savings)' }
    ],
    affectsVram: true
  },
  {
    key: 'cache_type_v', flag: '-ctv', label: 'KV Cache Type (V)', group: 'context',
    description: 'Data type for V cache',
    type: 'select', default: 'f16',
    options: [
      { value: 'f32', label: 'F32' },
      { value: 'f16', label: 'F16 (default)' },
      { value: 'q8_0', label: 'Q8_0' },
      { value: 'q4_0', label: 'Q4_0' }
    ],
    affectsVram: true
  },

  // ═══════════════════════════════════════════════════════════
  //  SAMPLING
  // ═══════════════════════════════════════════════════════════
  {
    key: 'temp', flag: '--temp', label: 'Temperature', group: 'sampling',
    description: 'Randomness of generation (0 = greedy)',
    type: 'number', default: 0.8, min: 0, max: 2, step: 0.05
  },
  {
    key: 'top_k', flag: '--top-k', label: 'Top-K', group: 'sampling',
    description: 'Limit sampling to top K tokens (0 = disabled)',
    type: 'number', default: 40, min: 0, max: 500, step: 1
  },
  {
    key: 'top_p', flag: '--top-p', label: 'Top-P', group: 'sampling',
    description: 'Nucleus sampling probability threshold',
    type: 'number', default: 0.95, min: 0, max: 1, step: 0.01
  },
  {
    key: 'min_p', flag: '--min-p', label: 'Min-P', group: 'sampling',
    description: 'Minimum probability threshold relative to top token',
    type: 'number', default: 0.05, min: 0, max: 1, step: 0.01
  },
  {
    key: 'repeat_penalty', flag: '--repeat-penalty', label: 'Repeat Penalty', group: 'sampling',
    description: 'Penalize repeated token sequences',
    type: 'number', default: 1.1, min: 0, max: 3, step: 0.05
  },
  {
    key: 'seed', flag: '-s', label: 'Seed', group: 'sampling',
    description: 'RNG seed (-1 = random)',
    type: 'number', default: -1, min: -1, max: 2147483647, step: 1
  },

  // ═══════════════════════════════════════════════════════════
  //  SERVER
  // ═══════════════════════════════════════════════════════════
  {
    key: 'host', flag: '--host', label: 'Host', group: 'server',
    description: 'Listen address for the HTTP server',
    type: 'string', default: '127.0.0.1'
  },
  {
    key: 'port', flag: '--port', label: 'Port', group: 'server',
    description: 'Listen port for the HTTP server',
    type: 'number', default: 8080, min: 1024, max: 65535, step: 1
  },
  {
    key: 'n_parallel', flag: '-np', label: 'Parallel Slots', group: 'server',
    description: 'Number of concurrent request slots',
    type: 'number', default: 1, min: 1, max: 64, step: 1, affectsVram: true
  },
  {
    key: 'cont_batching', flag: '-cb', label: 'Continuous Batching', group: 'server',
    description: 'Enable continuous batching for better throughput',
    type: 'boolean', default: true,
    offArgs: ['-nocb']
  },
  {
    key: 'api_key', flag: '--api-key', label: 'API Key', group: 'server',
    description: 'Optional API key for authentication',
    type: 'string', default: ''
  },
  {
    key: 'embeddings', flag: '--embeddings', label: 'Embeddings', group: 'server',
    description: 'Enable embeddings endpoint',
    type: 'boolean', default: false
  },

  // ═══════════════════════════════════════════════════════════
  //  EXPERIMENTAL
  // ═══════════════════════════════════════════════════════════
  {
    key: 'mlock', flag: '--mlock', label: 'Memory Lock', group: 'experimental',
    description: 'Lock model in RAM to prevent swapping',
    type: 'boolean', default: false
  },
  {
    key: 'no_mmap', flag: '--no-mmap', label: 'Disable mmap', group: 'experimental',
    description: 'Disable memory-mapped I/O for model loading',
    type: 'boolean', default: false
  },
  {
    key: 'verbose', flag: '-v', label: 'Verbose Logging', group: 'experimental',
    description: 'Enable verbose output in the server log',
    type: 'boolean', default: false
  },
]

/**
 * Convert current flag values into a CLI argument array for llama-server.
 * Only emits flags whose values differ from the default. Booleans that
 * default to true are switched off with their `offArgs` (e.g. -nocb).
 */
export function buildCliArgs(values: Record<string, any>): string[] {
  const args: string[] = []

  for (const def of FLAG_CATALOG) {
    const val = values[def.key]
    if (val === undefined || val === def.default) continue

    // Skip empty strings
    if (typeof val === 'string' && val.trim() === '') continue

    if (def.type === 'boolean') {
      if (val === true) args.push(def.flag)
      else if (val === false && def.offArgs) args.push(...def.offArgs)
    } else {
      args.push(def.flag, String(val))
    }
  }

  return args
}

/**
 * Build a human-readable CLI preview string.
 */
export function buildCliPreview(binaryPath: string, values: Record<string, any>): string {
  const serverBin = binaryPath.includes(' ') ? `"${binaryPath}"` : binaryPath
  const args = buildCliArgs(values)
  return [serverBin, ...args].join(' ')
}

/** Get all flags for a specific group */
export function getFlagsByGroup(group: string): FlagDef[] {
  return FLAG_CATALOG.filter(f => f.group === group)
}

/** Build default values object from the catalog */
export function getDefaultValues(): Record<string, any> {
  const defaults: Record<string, any> = {}
  for (const flag of FLAG_CATALOG) {
    defaults[flag.key] = flag.default
  }
  return defaults
}

export const FLAG_GROUPS: { id: string; label: string; icon: string }[] = [
  { id: 'core', label: 'Core', icon: 'box' },
  { id: 'gpu', label: 'GPU Offload', icon: 'gpu' },
  { id: 'context', label: 'Context', icon: 'text' },
  { id: 'sampling', label: 'Sampling', icon: 'dice' },
  { id: 'server', label: 'Server', icon: 'server' },
  { id: 'experimental', label: 'Experimental', icon: 'flask' },
]
