import type { BackendResult, DetectionResult } from '../types'
import type { ParsedAsset } from './types'
import {
  type CudaVersion,
  DEFAULT_CUDA_BACKEND,
  compareCuda,
  cudaVersionOfBackend,
  maxToolkitForBackendVersion
} from './cuda'

/** The subset of hardware detection output the asset picker needs. */
export type HostInfo = Pick<DetectionResult, 'os' | 'arch'> &
  Partial<Pick<DetectionResult, 'backends' | 'recommendedAsset'>>

/**
 * Which detected backend does the detector's recommended asset name refer to?
 * (e.g. "llama-...-ubuntu-vulkan-x64.zip" -> "vulkan"). Undefined when the
 * recommendation names no specific backend (plain CPU / Metal builds).
 */
export function findRecommendedBackendId(
  hw: Pick<DetectionResult, 'backends' | 'recommendedAsset'> | null | undefined
): BackendResult['id'] | undefined {
  if (!hw?.backends) return undefined
  const rec = (hw.recommendedAsset ?? '').toLowerCase()
  return hw.backends.find(b => rec.includes(b.id))?.id
}

/**
 * Newest CUDA toolkit this machine's NVIDIA driver (or toolkit, when only nvcc
 * was found) can run, or null if unknown / no usable CUDA.
 */
export function cudaMaxForHardware(
  hw: Pick<DetectionResult, 'backends'> | null | undefined
): CudaVersion | null {
  const cuda = hw?.backends?.find(b => b.id === 'cuda' && b.available)
  return maxToolkitForBackendVersion(cuda?.version)
}

export interface PickOptions {
  /** Newest CUDA toolkit the host can run (see cudaMaxForHardware). */
  cudaMax?: CudaVersion | null
}

/**
 * Newest CUDA build that is not newer than `max` (older toolkits run on newer
 * drivers, never the reverse). Without a known max, prefer the widely
 * compatible default, then any CUDA build.
 */
function pickCudaAsset(cuda: ParsedAsset[], max: CudaVersion | null | undefined): ParsedAsset | undefined {
  if (!max) return cuda.find(a => a.backend === DEFAULT_CUDA_BACKEND) ?? cuda[0]
  return cuda
    .filter(a => {
      const v = cudaVersionOfBackend(a.backend)
      return v !== null && compareCuda(v, max) <= 0
    })
    .sort((a, b) => compareCuda(cudaVersionOfBackend(b.backend)!, cudaVersionOfBackend(a.backend)!))[0]
}

/**
 * Choose the release asset to install for this machine.
 *
 * Only assets built for the host OS and CPU architecture are considered (an
 * arm64 build on an x64 box won't run). Among those: the asset whose backend
 * matches the recommended one, else the plain CPU build, else the first host
 * asset. For CUDA, the newest build the driver can run is chosen. When `hw` is
 * null/undefined, no OS/arch filtering is applied.
 */
export function pickBestAsset(
  assets: ParsedAsset[],
  hw: Pick<DetectionResult, 'os' | 'arch'> | null | undefined,
  recommendedBackendId?: string | null,
  opts: PickOptions = {}
): ParsedAsset | undefined {
  const hostAssets = assets.filter(a =>
    (!hw?.os || a.os === hw.os) && (!hw?.arch || a.arch === hw.arch)
  )
  const cpuOrOther = () =>
    hostAssets.find(a => a.backend === 'cpu') ??
    hostAssets.find(a => !a.backend.startsWith('cuda')) ??
    hostAssets[0]

  if (recommendedBackendId?.toLowerCase().startsWith('cuda')) {
    const hinted = cudaVersionOfBackend(recommendedBackendId) // e.g. "cuda-cu12.4" passed explicitly
    const max = opts.cudaMax ?? hinted
    const cudaAssets = hostAssets.filter(a => a.backend.startsWith('cuda'))
    return pickCudaAsset(cudaAssets, max) ?? cpuOrOther()
  }

  return (
    hostAssets.find(a =>
      recommendedBackendId
        ? a.backend.toLowerCase().includes(recommendedBackendId.toLowerCase())
        : a.backend === 'cpu'
    ) ?? cpuOrOther()
  )
}

/** The CUDA runtime bundle (cudart-*) that goes with a CUDA engine asset, if the release has one. */
export function findRuntimeFor(runtimes: ParsedAsset[] | undefined, asset: ParsedAsset): ParsedAsset | undefined {
  if (!asset.backend.startsWith('cuda')) return undefined
  return (runtimes ?? []).find(r => r.os === asset.os && r.arch === asset.arch && r.backend === asset.backend)
}
