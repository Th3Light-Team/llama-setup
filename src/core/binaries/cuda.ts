/**
 * CUDA helpers shared by asset parsing, hardware detection and asset selection.
 *
 * llama.cpp publishes one CUDA build per toolkit version (e.g. `win-cuda-12.4`,
 * `ubuntu-cuda-12.8`, `win-cuda-13.4`) and the set changes between releases, so
 * versions are parsed from the file name instead of being hard-coded.
 */

export interface CudaVersion {
  major: number
  /** null when the name carries only a major (e.g. "cuda-11") */
  minor: number | null
}

/** Parse "…-cuda-12.4-…", "…-cuda-cu12.4-…" or "…-cuda-11-…". */
export function parseCudaVersion(filename: string): CudaVersion | null {
  const m = filename.toLowerCase().match(/-cuda-(?:cu)?(\d+)(?:\.(\d+))?(?=[-.]|$)/)
  if (!m) return null
  return { major: parseInt(m[1], 10), minor: m[2] !== undefined ? parseInt(m[2], 10) : null }
}

/** Backend id used across the app for a CUDA build, e.g. "cuda-cu12.4" / "cuda-cu11". */
export function cudaBackendId(v: CudaVersion): string {
  return `cuda-cu${v.major}${v.minor !== null ? `.${v.minor}` : ''}`
}

/** Version encoded in a backend id ("cuda-cu12.4"), or null for non-CUDA ids. */
export function cudaVersionOfBackend(backend: string): CudaVersion | null {
  const m = backend.toLowerCase().match(/^cuda-cu(\d+)(?:\.(\d+))?$/)
  if (!m) return null
  return { major: parseInt(m[1], 10), minor: m[2] !== undefined ? parseInt(m[2], 10) : null }
}

/** <0, 0, >0. A missing minor counts as ".0" so "11" sorts below "11.8". */
export function compareCuda(a: CudaVersion, b: CudaVersion): number {
  return a.major - b.major || (a.minor ?? 0) - (b.minor ?? 0)
}

/**
 * Newest CUDA toolkit a given NVIDIA driver can run (older toolkits always run
 * on newer drivers). `minor: Infinity` means "any minor of that major".
 * Returns null when the driver is too old for any published build (< 470).
 */
export function maxToolkitForDriver(driverVersion: string): CudaVersion | null {
  const major = parseInt(driverVersion.split('.')[0], 10)
  if (isNaN(major)) return null
  if (major >= 580) return { major: 13, minor: Infinity }
  if (major >= 570) return { major: 12, minor: 8 }
  if (major >= 550) return { major: 12, minor: 4 }
  if (major >= 525) return { major: 12, minor: 0 }
  if (major >= 470) return { major: 11, minor: Infinity }
  return null
}

/**
 * Newest toolkit usable for a detected CUDA backend. Detection reports either
 * the NVIDIA driver version ("551.61", from nvidia-smi) or the toolkit version
 * ("12.4", from nvcc); a first component >= 100 can only be a driver.
 */
export function maxToolkitForBackendVersion(version: string | undefined): CudaVersion | null {
  if (!version) return null
  const m = version.trim().match(/^(\d+)(?:\.(\d+))?/)
  if (!m) return null
  const major = parseInt(m[1], 10)
  // A known but too-old driver can run no published build: report "toolkit 0" (not
  // null, which means "unknown") so callers fall back to a non-CUDA engine.
  if (major >= 100) return maxToolkitForDriver(version.trim()) ?? NO_CUDA
  return { major, minor: m[2] !== undefined ? parseInt(m[2], 10) : Infinity }
}

/** "Supports no CUDA build": a known driver that is older than every published build. */
export const NO_CUDA: CudaVersion = { major: 0, minor: 0 }

/** Version-less pick when nothing is known about the driver: prefer the most widely compatible 12.x. */
export const DEFAULT_CUDA_BACKEND = 'cuda-cu12.4'
