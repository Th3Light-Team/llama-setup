import { db } from './db'
import { runDiscoveryScan } from '../core/discovery'
import { analyzeBinary } from '../core/discovery/health'
import { resolveLlamaBinary } from '../core/launcher/binary-resolver'
import {
  deriveDevices, bestHealth,
  type EngineRow, type EngineHealth, type EngineBinary,
} from '../core/engines/types'
import type { DetectionResult } from '../core/types'
import type { InstallationScan, DiscoveredInstall } from '../core/discovery/types'

function normPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
}

const HEALTH_RANK: Record<EngineHealth, number> = { healthy: 3, degraded: 2, broken: 1, unknown: 0 }

function getGpuNames(): string[] {
  try {
    const row = db.prepare('SELECT result FROM detection_cache WHERE id = 1').get() as { result: string } | undefined
    if (!row) return []
    const det = JSON.parse(row.result) as DetectionResult
    return det.vram?.gpus?.map(g => g.name) ?? []
  } catch {
    return []
  }
}

function getDefaultPath(): string | null {
  const row = db.prepare("SELECT value FROM app_kv WHERE key = 'defaultEnginePath'").get() as { value: string } | undefined
  return row?.value ?? null
}

function sourceLabel(inst: DiscoveredInstall): string {
  switch (inst.source.type) {
    case 'path': return 'Found on PATH'
    case 'package_manager': return `Via ${(inst.source as { manager: string }).manager}`
    case 'well_known': return 'Well-known location'
    case 'ollama': return 'Ollama'
    case 'process': return 'Running process'
    default: return 'External'
  }
}

async function getScan(force: boolean): Promise<InstallationScan> {
  if (!force) {
    const row = db.prepare('SELECT result FROM discovery_cache WHERE id = 1').get() as { result: string } | undefined
    if (row) {
      try { return JSON.parse(row.result) as InstallationScan } catch { /* fall through */ }
    }
  }
  const scan = await runDiscoveryScan({ quickScan: true })
  db.prepare(`
    INSERT INTO discovery_cache (id, result, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET result = excluded.result, updated_at = excluded.updated_at
  `).run(JSON.stringify(scan), Date.now().toString())
  return scan
}

/**
 * The unified engine list: discovered binaries grouped by install directory,
 * plus any managed installs the scan didn't surface. One install dir = one
 * engine, even when it ships several llama-* binaries.
 */
export async function listEngines(force = false): Promise<EngineRow[]> {
  const scan = await getScan(force)
  const gpuNames = getGpuNames()
  const defaultPath = getDefaultPath()

  const groups = new Map<string, DiscoveredInstall[]>()
  for (const inst of scan.installations) {
    const key = normPath(inst.installPath)
    const arr = groups.get(key) ?? []
    arr.push(inst)
    groups.set(key, arr)
  }

  const engines: EngineRow[] = []
  const seen = new Set<string>()

  for (const [key, insts] of groups) {
    seen.add(key)
    const binaries: EngineBinary[] = insts.map(i => ({
      name: i.binaryName,
      path: i.binaryPath,
      health: i.health.status as EngineHealth,
    }))
    const health = bestHealth(binaries.map(b => b.health))
    const server = insts.find(i => i.binaryName === 'llama-server')
      ?? insts.find(i => i.binaryName === 'llama-cli')
      ?? insts[0]
    const versioned = insts.find(i => i.version?.build) ?? insts.find(i => i.version)
    const backend = insts.find(i => i.backend && i.backend !== 'unknown')?.backend ?? insts[0].backend ?? 'unknown'
    const managed = insts.some(i => i.managed)
    const managedId = insts.find(i => i.managedId)?.managedId ?? null

    engines.push({
      id: managedId ?? key,
      path: insts[0].installPath,
      binaryPath: server.binaryPath ?? null,
      managed,
      tag: versioned?.version?.build ? `b${versioned.version.build}` : 'external',
      build: versioned?.version?.build ?? null,
      backend,
      health,
      versionRaw: versioned?.version?.raw ?? null,
      lastVerified: null,
      installedAt: null,
      source: managed ? 'Managed' : sourceLabel(insts[0]),
      binaries,
      devices: deriveDevices(backend, gpuNames),
      sizeBytes: insts.reduce((s, i) => s + (i.sizeBytes || 0), 0) || null,
      isDefault: defaultPath ? normPath(insts[0].installPath) === normPath(defaultPath) : false,
      buildsBehind: null,
    })
  }

  // Managed installs the scan missed (e.g. just-installed, not yet re-scanned).
  const rows = db.prepare('SELECT * FROM installs').all() as Record<string, unknown>[]
  for (const r of rows) {
    const p = (r.path as string) || (r.binary_path as string)
    if (!p || seen.has(normPath(p))) continue
    seen.add(normPath(p))
    const backend = (r.backend as string) ?? 'unknown'
    engines.push({
      id: r.id as string,
      path: r.path as string,
      binaryPath: (r.binary_path as string) ?? resolveLlamaBinary(r.path as string, 'llama-server'),
      managed: true,
      tag: r.tag as string,
      build: (r.version_build as number) ?? null,
      backend,
      health: ((r.health_status as EngineHealth) || 'unknown'),
      versionRaw: (r.version_raw as string) ?? null,
      lastVerified: (r.last_verified as string) ?? null,
      installedAt: (r.install_date as string) ?? null,
      source: 'Managed',
      binaries: [],
      devices: deriveDevices(backend, gpuNames),
      sizeBytes: null,
      isDefault: defaultPath ? normPath(r.path as string) === normPath(defaultPath) : false,
      buildsBehind: null,
    })
  }

  engines.sort((a, b) =>
    (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)
    || HEALTH_RANK[b.health] - HEALTH_RANK[a.health]
    || (b.build ?? 0) - (a.build ?? 0)
  )
  return engines
}

export function setDefaultEngine(path: string): string {
  db.prepare("INSERT OR REPLACE INTO app_kv (key, value) VALUES ('defaultEnginePath', ?)").run(path)
  return path
}

export function getDefaultEngine(): string | null {
  return getDefaultPath()
}

/**
 * Re-run the health check on an engine's server/cli binary, persist the result
 * to the managed-installs row (when managed), and invalidate the discovery
 * cache so the next `listEngines` reflects fresh health.
 */
export async function verifyEngine(installPath: string) {
  const bin = resolveLlamaBinary(installPath, 'llama-server') ?? resolveLlamaBinary(installPath, 'llama-cli')
  if (!bin) return { status: 'broken' as const, checks: [] }

  const { health, version } = await analyzeBinary(bin)
  db.prepare(`
    UPDATE installs SET health_status = ?, last_verified = ?, version_raw = ?, version_build = ?
    WHERE path = ?
  `).run(health.status, new Date().toISOString(), version?.raw ?? null, version?.build ?? null, installPath)
  db.prepare('DELETE FROM discovery_cache WHERE id = 1').run()
  return health
}
