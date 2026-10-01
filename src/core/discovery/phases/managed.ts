import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { db } from '../../../main/db'
import { analyzeBinary, fastFingerprint, getBinaryNames } from '../health'
import type { PhaseResult, DiscoveredInstall, BinaryIssue, BinaryName } from '../types'
import type { InstallRecord } from '../../binaries/types'

/**
 * Phase 1: Managed install reconciliation.
 *
 * Verifies that every install in our DB still exists on disk and is healthy.
 * This catches deleted, moved, or corrupted managed binaries before the user
 * tries to launch them.
 *
 * Budget: ~50ms
 */
export async function probeManagedInstalls(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: BinaryIssue[] = []

  let rows: InstallRecord[]
  try {
    const stmt = db.prepare('SELECT * FROM installs ORDER BY install_date DESC')
    rows = stmt.all() as InstallRecord[]
  } catch {
    // DB may not be initialized yet — not an error for this phase
    return { installations, issues }
  }

  for (const row of rows) {
    const installPath = row.path || ''

    // Find actual binary inside the install directory
    const binaryNames = getBinaryNames()
    let foundBinaryPath: string | null = null
    let foundBinaryName: BinaryName = 'other'

    for (const name of binaryNames) {
      const candidates = [
        join(installPath, name),
        join(installPath, 'bin', name),
        join(installPath, 'build', 'bin', name)
      ]
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          foundBinaryPath = candidate
          foundBinaryName = classifyBinaryName(name)
          break
        }
      }
      if (foundBinaryPath) break
    }

    if (!foundBinaryPath) {
      // The install directory or binary is missing
      issues.push({
        binaryPath: installPath,
        severity: 'error',
        code: 'MISSING_FILE',
        message: `Managed install "${row.id}" — binary files not found at ${installPath}`,
        suggestion: 'Reinstall this binary from the releases list, or remove the stale entry.'
      })

      installations.push({
        fingerprint: 'missing',
        source: { type: 'managed' },
        installPath,
        binaryPath: installPath,
        binaryName: 'llama-server',
        version: null,
        backend: (row.backend as DiscoveredInstall['backend']) || 'unknown',
        health: { status: 'broken', checks: [{ name: 'File existence', passed: false, detail: 'Binary files not found', durationMs: 0 }] },
        managed: true,
        managedId: row.id,
        sizeBytes: 0,
        modifiedAt: 0
      })
      continue
    }

    // Binary exists — run health checks
    const { health, version } = await analyzeBinary(foundBinaryPath)
    const stat = statSync(foundBinaryPath)

    installations.push({
      fingerprint: fastFingerprint(foundBinaryPath),
      source: { type: 'managed' },
      installPath,
      binaryPath: foundBinaryPath,
      binaryName: foundBinaryName,
      version,
      backend: (row.backend as DiscoveredInstall['backend']) || 'unknown',
      health,
      managed: true,
      managedId: row.id,
      sizeBytes: stat.size,
      modifiedAt: stat.mtimeMs
    })

    // Surface health issues
    if (health.status === 'broken' || health.status === 'degraded') {
      const failedChecks = health.checks.filter(c => !c.passed).map(c => c.detail).join('; ')
      issues.push({
        binaryPath: foundBinaryPath,
        severity: health.status === 'broken' ? 'error' : 'warning',
        code: health.status === 'broken' ? 'CORRUPT_BINARY' : 'MISSING_DEPENDENCY',
        message: `Managed install "${row.id}" has issues: ${failedChecks}`,
        suggestion: health.status === 'broken'
          ? 'Reinstall this binary or remove the entry.'
          : 'Check that required runtime libraries are installed.'
      })
    }
  }

  return { installations, issues }
}

function classifyBinaryName(filename: string): BinaryName {
  const base = filename.replace(/\.exe$/, '').toLowerCase()
  switch (base) {
    case 'llama-server': return 'llama-server'
    case 'llama-cli': return 'llama-cli'
    case 'llama-quantize': return 'llama-quantize'
    case 'llama-bench': return 'llama-bench'
    case 'main': return 'main'
    default: return 'other'
  }
}
