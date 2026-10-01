import type { BackendResult, DetectionResult } from '../types'
import type { ParsedAsset } from './types'

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
): BackendResult['id'] | string | undefined {
  if (!hw?.backends) return undefined
  const rec = (hw.recommendedAsset ?? '').toLowerCase()
  const id = hw.backends.find(b => rec.includes(b.id))?.id
  if (id === 'cuda') {
    // The driver decides which CUDA toolkit build can run: keep the version
    // ("win-cuda-cu12.4-x64" / "win-cuda-12.4-x64" -> "cuda-cu12.4").
    const m = rec.match(/cuda-(?:cu)?(\d+(?:\.\d+)?)/)
    if (m) return `cuda-cu${m[1]}`
  }
  return id
}

/** CUDA toolkit builds, newest first. A build runs on drivers that support its toolkit or newer. */
const CUDA_BUILDS = ['cuda-cu13.1', 'cuda-cu12.4', 'cuda-cu12.0', 'cuda-cu11']

/**
 * Pick the CUDA asset a driver can run: the newest build that is not newer
 * than the recommended toolkit (older toolkits run on newer drivers, never the
 * reverse). A bare "cuda" (version unknown) prefers cu12.4, then any CUDA build.
 */
function pickCudaAsset(hostAssets: ParsedAsset[], recommended: string): ParsedAsset | undefined {
  const cuda = hostAssets.filter(a => a.backend.startsWith('cuda'))
  const idx = CUDA_BUILDS.indexOf(recommended.toLowerCase())
  if (idx === -1) {
    return cuda.find(a => a.backend === 'cuda-cu12.4') ?? cuda[0]
  }
  for (const build of CUDA_BUILDS.slice(idx)) {
    const hit = cuda.find(a => a.backend === build)
    if (hit) return hit
  }
  return undefined
}

/**
 * Choose the release asset to install for this machine.
 *
 * Only assets built for the host OS and CPU architecture are considered (an
 * arm64 build on an x64 box won't run). Among those: the asset whose backend
 * matches the recommended one, else the plain CPU build, else the first host
 * asset. When `hw` is null/undefined, no OS/arch filtering is applied.
 */
export function pickBestAsset(
  assets: ParsedAsset[],
  hw: Pick<DetectionResult, 'os' | 'arch'> | null | undefined,
  recommendedBackendId?: string | null
): ParsedAsset | undefined {
  const hostAssets = assets.filter(a =>
    (!hw?.os || a.os === hw.os) && (!hw?.arch || a.arch === hw.arch)
  )
  if (recommendedBackendId?.toLowerCase().startsWith('cuda')) {
    const cuda = pickCudaAsset(hostAssets, recommendedBackendId)
    if (cuda) return cuda
    return hostAssets.find(a => a.backend === 'cpu') ?? hostAssets.find(a => !a.backend.startsWith('cuda')) ?? hostAssets[0]
  }
  return (
    hostAssets.find(a =>
      recommendedBackendId
        ? a.backend.toLowerCase().includes(recommendedBackendId.toLowerCase())
        : a.backend === 'cpu'
    ) ??
    hostAssets.find(a => a.backend === 'cpu') ??
    hostAssets[0]
  )
}
