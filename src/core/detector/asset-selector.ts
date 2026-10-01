import { BackendResult } from '../../types'
import { getCudaSuffix } from './probes/cuda.probe'
import { maxToolkitForBackendVersion } from '../binaries/cuda'

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
      // backend.version is the NVIDIA driver (nvidia-smi, e.g. "551.61") or, when
      // only nvcc was found, the toolkit version ("12.4").
      const ver = backend.version ?? ''
      const first = parseInt(ver.split('.')[0], 10)
      let cudaSuffix: string
      if (!isNaN(first) && first < 100) {
        const toolkit = maxToolkitForBackendVersion(ver)!
        cudaSuffix = `cuda-cu${toolkit.major}${Number.isFinite(toolkit.minor) ? `.${toolkit.minor}` : ''}`
      } else {
        cudaSuffix = getCudaSuffix(ver)
      }
      if (!cudaSuffix) continue // Driver too old, skip CUDA
      // Real release names use "cuda-12.4", our backend ids "cuda-cu12.4"
      pattern = `${osSuffix}-${cudaSuffix.replace('cuda-cu', 'cuda-')}-${archSuffix}`
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
      // Real names say "cuda-12.4"; older fixtures "cuda-cu12.4" — compare on the normalised form
      const match = availableAssets.find(a => a.replace('cuda-cu', 'cuda-').includes(pattern))
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
