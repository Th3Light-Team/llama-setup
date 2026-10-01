import { probeManagedInstalls } from './phases/managed'
import { probePathScan } from './phases/path-scan'
import { probeWellKnownDirs } from './phases/well-known'
import { probePackageManagers } from './phases/package-manager'
import { probeOllama } from './phases/ollama'
import { probeRunningProcesses } from './phases/process-scan'
import { buildPathAnalysis } from './path-analysis'
import { checkBinaryHealth } from './health'
import type {
  InstallationScan,
  DiscoveredInstall,
  BinaryIssue,
  ScanOptions,
  BinaryHealth
} from './types'

/** Maximum time the full discovery scan is allowed to take */
const FULL_SCAN_BUDGET_MS = 5000

/**
 * Run a timeout-wrapped phase. If the phase exceeds the remaining budget,
 * returns an empty result rather than blocking the scan.
 */
async function withBudget<T>(
  phase: () => Promise<T>,
  fallback: T,
  remainingMs: number
): Promise<T> {
  if (remainingMs <= 0) return fallback

  return Promise.race([
    phase(),
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(fallback), remainingMs)
    )
  ])
}

/**
 * Main discovery orchestrator.
 *
 * Runs discovery phases in sequence with a global time budget.
 * Deduplicates results by binary fingerprint to avoid showing the same
 * binary multiple times when found via different sources.
 *
 * @param options - Controls which phases run
 * @returns Complete installation scan result
 */
export async function runDiscoveryScan(
  options: ScanOptions = {}
): Promise<InstallationScan> {
  const startTime = performance.now()
  const allInstallations: DiscoveredInstall[] = []
  const allIssues: BinaryIssue[] = []
  const scanLocations: string[] = []

  const {
    quickScan = false,
    checkPackageManagers = !quickScan,
    checkRunningProcesses = !quickScan
  } = options

  function elapsed(): number {
    return Math.round(performance.now() - startTime)
  }

  function remaining(): number {
    return FULL_SCAN_BUDGET_MS - elapsed()
  }

  const emptyPhase = { installations: [], issues: [] }

  // ─── Phase 1: Managed install reconciliation ───
  const managedResult = await withBudget(
    () => probeManagedInstalls(),
    emptyPhase,
    remaining()
  )
  allInstallations.push(...managedResult.installations)
  allIssues.push(...managedResult.issues)
  scanLocations.push('Managed installs (database)')

  // ─── Phase 2: PATH scanning ───
  const pathResult = await withBudget(
    () => probePathScan(),
    { ...emptyPhase, pathEntries: [] },
    remaining()
  )
  allInstallations.push(...pathResult.installations)
  allIssues.push(...pathResult.issues)
  scanLocations.push('System PATH')

  // Build PATH analysis from Phase 2 data
  const pathAnalysis = buildPathAnalysis(pathResult.pathEntries)

  // ─── Phase 3: Well-known directories ───
  const wellKnownResult = await withBudget(
    () => probeWellKnownDirs(),
    emptyPhase,
    remaining()
  )
  allInstallations.push(...wellKnownResult.installations)
  allIssues.push(...wellKnownResult.issues)
  scanLocations.push('Well-known directories')

  // ─── Quick scan stops here ───
  if (!quickScan) {
    // ─── Phase 4: Package managers ───
    if (checkPackageManagers) {
      const pkgResult = await withBudget(
        () => probePackageManagers(),
        emptyPhase,
        remaining()
      )
      allInstallations.push(...pkgResult.installations)
      allIssues.push(...pkgResult.issues)
      scanLocations.push('Package managers')
    }

    // ─── Phase 5: Ollama ───
    const ollamaResult = await withBudget(
      () => probeOllama(),
      emptyPhase,
      remaining()
    )
    allInstallations.push(...ollamaResult.installations)
    allIssues.push(...ollamaResult.issues)
    scanLocations.push('Ollama')

    // ─── Phase 6: Running processes ───
    if (checkRunningProcesses) {
      const processResult = await withBudget(
        () => probeRunningProcesses(),
        emptyPhase,
        remaining()
      )
      allInstallations.push(...processResult.installations)
      allIssues.push(...processResult.issues)
      scanLocations.push('Running processes')
    }
  }

  // ─── Deduplication ───
  const deduplicated = deduplicateInstalls(allInstallations)

  // ─── Mark managed installs ───
  // Cross-reference external discoveries with managed installs
  const managedPaths = new Set(
    allInstallations
      .filter(i => i.managed)
      .map(i => normalizePath(i.binaryPath))
  )

  for (const install of deduplicated) {
    if (!install.managed && managedPaths.has(normalizePath(install.binaryPath))) {
      install.managed = true
    }
  }

  return {
    installations: deduplicated,
    issues: allIssues,
    pathAnalysis,
    scanDurationMs: elapsed(),
    scannedAt: Date.now(),
    scanLocations
  }
}

/**
 * Deep verify a specific binary path.
 * Runs the full health check suite including the expensive dependency check.
 */
export async function verifyBinary(binaryPath: string): Promise<BinaryHealth> {
  return checkBinaryHealth(binaryPath)
}

/**
 * Deduplicate discovered installations by binary fingerprint.
 * When the same binary is found via multiple sources, prefer the first source
 * (managed > path > well_known > package_manager > ollama > process).
 */
function deduplicateInstalls(installs: DiscoveredInstall[]): DiscoveredInstall[] {
  const seen = new Map<string, DiscoveredInstall>()

  // Source priority (lower = higher priority)
  const sourcePriority = (source: DiscoveredInstall['source']): number => {
    switch (source.type) {
      case 'managed': return 0
      case 'path': return 1
      case 'well_known': return 2
      case 'package_manager': return 3
      case 'ollama': return 4
      case 'process': return 5
      case 'manual': return 6
      default: return 99
    }
  }

  for (const install of installs) {
    // Use normalized binary path as the dedup key (more reliable than fingerprint
    // since fingerprint includes mtime which could vary across symlinks)
    const key = normalizePath(install.binaryPath)

    const existing = seen.get(key)
    if (!existing || sourcePriority(install.source) < sourcePriority(existing.source)) {
      seen.set(key, install)
    }
  }

  return Array.from(seen.values())
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

// Re-export types for convenience
export type { InstallationScan, DiscoveredInstall, BinaryIssue, ScanOptions, BinaryHealth }
