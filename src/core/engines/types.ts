/**
 * "Engine" = one llama.cpp install directory, unifying what used to be two
 * separate lists (managed installs from the DB + externally discovered
 * binaries). Multiple discovered binaries (llama-server, llama-cli,
 * llama-bench…) sharing an install dir collapse into a single engine.
 *
 * No Node/Electron imports — shared between main and renderer.
 */

export type EngineHealth = 'healthy' | 'degraded' | 'broken' | 'unknown'

export interface EngineBinary {
  name: string          // 'llama-server', 'llama-cli', …
  path: string
  health: EngineHealth
}

export interface EngineRow {
  /** Stable id: managed install id when managed, else the normalized path. */
  id: string
  /** Install directory (what the launcher/bench receive). */
  path: string
  /** Best server/cli binary path inside the install, when known. */
  binaryPath: string | null
  managed: boolean
  /** Build tag, e.g. "b8757" or "external". */
  tag: string
  build: number | null
  backend: string
  /** Engine-level health = best health across its binaries. */
  health: EngineHealth
  versionRaw: string | null
  lastVerified: string | null
  installedAt: string | null
  /** Human source label: 'Managed', 'Found on PATH', 'winget', … */
  source: string
  /** Which llama.cpp binaries this install provides. */
  binaries: EngineBinary[]
  /** Approximate compute targets (refined by `llama-bench --list-devices`). */
  devices: string[]
  /** Total size on disk in bytes, when known. */
  sizeBytes: number | null
  isDefault: boolean
  /** Builds behind latest release, when computable. */
  buildsBehind: number | null
}

const HEALTH_RANK: Record<EngineHealth, number> = {
  healthy: 3, degraded: 2, broken: 1, unknown: 0,
}

/** Engine health = the best health among its binaries (one working server
 *  means the engine is usable, even if llama-bench lacks --version). */
export function bestHealth(healths: EngineHealth[]): EngineHealth {
  let best: EngineHealth = 'unknown'
  for (const h of healths) if (HEALTH_RANK[h] > HEALTH_RANK[best]) best = h
  return best
}

/**
 * Approximate the compute devices a backend can drive, given the GPUs that
 * hardware detection found. This is a heuristic for display only — the Bench
 * page replaces it with the precise `llama-bench --list-devices` output.
 */
export function deriveDevices(backend: string, gpuNames: string[]): string[] {
  const b = (backend || '').toLowerCase()
  const has = (re: RegExp) => gpuNames.filter(n => re.test(n))
  let devices: string[] = []

  if (b.startsWith('cuda')) {
    devices = has(/nvidia|geforce|rtx|gtx|tesla|quadro/i)
  } else if (b === 'vulkan') {
    devices = [...gpuNames] // Vulkan can target every visible GPU
  } else if (b.startsWith('metal')) {
    devices = has(/apple|\bm[1-4]\b/i)
    if (devices.length === 0 && gpuNames.length > 0) devices = [gpuNames[0]]
  } else if (b === 'rocm' || b === 'hip') {
    devices = has(/amd|radeon/i)
  } else if (b === 'cpu') {
    return ['CPU']
  } else {
    // Unknown backend (e.g. a winget build that dynamically loads vulkan+cpu):
    // surface the GPUs we know about plus CPU.
    devices = [...gpuNames]
  }

  if (devices.length === 0) devices = ['CPU']
  else if (b !== 'cpu') devices = [...devices, 'CPU']
  return devices
}
