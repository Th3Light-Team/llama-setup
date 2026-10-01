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
): BackendResult['id'] | undefined {
  if (!hw?.backends) return undefined
  const rec = (hw.recommendedAsset ?? '').toLowerCase()
  return hw.backends.find(b => rec.includes(b.id))?.id
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
