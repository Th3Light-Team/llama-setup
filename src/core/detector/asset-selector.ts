import { BackendResult } from '../../types'
import { getCudaSuffix } from './probes/cuda.probe'

type OSType = 'windows' | 'macos' | 'linux'
type ArchType = 'x64' | 'arm64'

const OS_SUFFIX_MAP: Record<OSType, string> = {
  windows: 'win',
  macos: 'macos',
  linux: 'ubuntu'
}

/** Backend priority order per DETECTOR.md */
const BACKEND_PRIORITY: Array<BackendResult['id']> = ['cuda', 'metal', 'vulkan', 'opencl', 'cpu']

/**
 * Selects the best GitHub release asset for the detected hardware.
 * Implements the asset selection algorithm from DETECTOR.md.
 *
 * @param os - Detected OS type
 * @param arch - Detected architecture
 * @param backends - All detected backend results
 * @param availableAssets - List of asset filenames from a GitHub release
 * @returns The best matching asset name, or a generated pattern if no assets provided
 */
export function selectAsset(
  os: OSType,
  arch: ArchType,
  backends: BackendResult[],
  availableAssets: string[] = []
): string {
  const osSuffix = OS_SUFFIX_MAP[os]
  const archSuffix = arch

  for (const backendId of BACKEND_PRIORITY) {
    const backend = backends.find(b => b.id === backendId && b.available)
    if (!backend) continue

    let pattern: string
    if (backendId === 'cuda') {
      const cudaSuffix = getCudaSuffix(backend.version || '')
      if (!cudaSuffix) continue // Driver too old, skip CUDA
      pattern = `${osSuffix}-${cudaSuffix}-${archSuffix}`
    } else if (backendId === 'metal') {
      pattern = `macos-${archSuffix}`
    } else if (backendId === 'cpu') {
      // CPU fallback: look for a generic binary without specific backend suffix
      pattern = `${osSuffix}-${archSuffix}`
    } else {
      pattern = `${osSuffix}-${backendId}-${archSuffix}`
    }

    // If we have a list of real assets, match against it
    if (availableAssets.length > 0) {
      const match = availableAssets.find(a => a.includes(pattern))
      if (match) return match
    } else {
      // No assets list yet (pre-release fetch): return the pattern itself
      return `${pattern}.zip`
    }
  }

  // Ultimate fallback: any asset for this OS+arch
  if (availableAssets.length > 0) {
    const fallback = availableAssets.find(a => a.includes(osSuffix) && a.includes(archSuffix))
    if (fallback) return fallback
    return availableAssets[0] // absolute last resort
  }

  return `${osSuffix}-cpu-${archSuffix}.zip`
}
