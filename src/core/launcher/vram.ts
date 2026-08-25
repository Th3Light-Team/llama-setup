import type { FlagValues } from './types'

/**
 * VRAM estimation engine for llama.cpp inference.
 *
 * Uses heuristic calculation based on:
 * - Model file size (proxy for parameter count + quantization)
 * - Number of GPU layers offloaded
 * - Context size and KV cache quantization
 * - Batch size and parallel slots
 * - Flash attention savings
 *
 * This is an *estimate* — actual usage depends on model architecture,
 * quantization type, and runtime allocations.
 */

const KV_BYTES_PER_TOKEN: Record<string, number> = {
  'f32':  4,
  'f16':  2,
  'q8_0': 1,
  'q4_0': 0.5
}

export interface VramEstimate {
  modelMB: number
  kvCacheMB: number
  overheadMB: number
  totalMB: number
  fitsInVram: boolean
  utilizationPercent: number
}

/**
 * Estimate VRAM usage for a given configuration.
 *
 * @param modelSizeMB  — Size of the GGUF file in MB (used as weight proxy)
 * @param totalVramMB  — Available VRAM on the target GPU
 * @param values       — Current flag values from the flag builder
 * @param totalLayers  — Total layers in the model (estimated from file size if unknown)
 */
export function estimateVram(
  modelSizeMB: number,
  totalVramMB: number,
  values: FlagValues,
  totalLayers?: number
): VramEstimate {
  // --- Model weight estimation ---
  // If ngl == -1, offload all layers. Otherwise, scale proportionally.
  const ngl = values.n_gpu_layers ?? -1
  const estimatedLayers = totalLayers || estimateLayerCount(modelSizeMB)
  const layersOnGpu = ngl === -1 ? estimatedLayers : Math.min(ngl, estimatedLayers)
  const layerFraction = estimatedLayers > 0 ? layersOnGpu / estimatedLayers : 1

  const modelMB = Math.round(modelSizeMB * layerFraction)

  // --- KV cache estimation ---
  const ctxSize = values.ctx_size ?? 4096
  const nParallel = values.n_parallel ?? 1
  const cacheTypeK = values.cache_type_k ?? 'f16'
  const cacheTypeV = values.cache_type_v ?? 'f16'
  const flashAttn = values.flash_attn ?? true

  // Each token in KV cache needs: 2 * n_heads * head_dim * bytes_per_element
  // Simplified: use bytes-per-token lookup * estimated hidden dim
  const bytesPerTokenK = KV_BYTES_PER_TOKEN[cacheTypeK] ?? 2
  const bytesPerTokenV = KV_BYTES_PER_TOKEN[cacheTypeV] ?? 2

  // Estimate hidden dimension from model size (rough heuristic)
  const hiddenDim = estimateHiddenDim(modelSizeMB)

  // KV cache per slot = ctx_size * 2 (K+V) * hidden_dim * bytes
  const kvPerSlotBytes = ctxSize * hiddenDim * (bytesPerTokenK + bytesPerTokenV)
  let kvCacheMB = Math.round((kvPerSlotBytes * nParallel) / (1024 * 1024))

  // Flash attention reduces KV cache overhead by ~20%
  if (flashAttn) {
    kvCacheMB = Math.round(kvCacheMB * 0.8)
  }

  // --- Overhead ---
  // CUDA context, compute buffers, scratch space (~200-500MB depending on model size)
  const overheadMB = Math.round(200 + modelSizeMB * 0.02)

  // --- Total ---
  const totalMB = modelMB + kvCacheMB + overheadMB
  const fitsInVram = totalVramMB > 0 ? totalMB <= totalVramMB : true
  const utilizationPercent = totalVramMB > 0 ? Math.round((totalMB / totalVramMB) * 100) : 0

  return { modelMB, kvCacheMB, overheadMB, totalMB, fitsInVram, utilizationPercent }
}

/** Estimate total layer count from GGUF file size in MB */
function estimateLayerCount(sizeMB: number): number {
  // Very rough heuristics based on common quants:
  // ~1B model ≈ 0.5-1 GB ≈ 22 layers
  // ~7B model ≈ 4-7 GB ≈ 32 layers
  // ~13B model ≈ 7-13 GB ≈ 40 layers
  // ~34B model ≈ 17-26 GB ≈ 48 layers
  // ~70B model ≈ 35-70 GB ≈ 80 layers
  if (sizeMB < 1500) return 22
  if (sizeMB < 6000) return 32
  if (sizeMB < 12000) return 40
  if (sizeMB < 25000) return 48
  return 80
}

/** Estimate hidden dimension from model file size */
function estimateHiddenDim(sizeMB: number): number {
  if (sizeMB < 1500) return 2048   // ~1-3B
  if (sizeMB < 6000) return 4096   // ~7B
  if (sizeMB < 12000) return 5120  // ~13B
  if (sizeMB < 25000) return 6656  // ~34B
  return 8192                       // ~70B+
}
