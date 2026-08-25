import { join } from 'path'
import { existsSync } from 'fs'
import os from 'os'
import type { PathAnalysis, PathEntry } from './types'
import type { PathScanEntry } from './phases/path-scan'

/**
 * Build the complete PATH analysis from Phase 2 scan data.
 * Produces warnings about stale entries, shadowed binaries, and
 * missing managed binary directory.
 */
export function buildPathAnalysis(pathEntries: PathScanEntry[]): PathAnalysis {
  const entries: PathEntry[] = pathEntries.map(pe => ({
    directory: pe.directory,
    exists: pe.exists,
    containsLlama: pe.containsLlama,
    llamaBinaries: pe.llamaBinaries,
    priority: pe.priority
  }))

  const warnings: string[] = []

  // Warning: stale PATH entries (non-existent directories)
  const staleEntries = entries.filter(e => !e.exists)
  for (const stale of staleEntries) {
    warnings.push(
      `PATH contains non-existent directory: "${stale.directory}"`
    )
  }

  // Warning: managed install dir not on PATH
  const managedBinDir = join(os.homedir(), '.llama-studio', 'binaries')
  if (existsSync(managedBinDir)) {
    const isOnPath = entries.some(e =>
      normalizePath(e.directory).startsWith(normalizePath(managedBinDir))
    )
    if (!isOnPath) {
      warnings.push(
        'Llama Studio binaries directory is not on your system PATH. ' +
        'Binaries installed by this app won\'t be available in your terminal.'
      )
    }
  }

  // Warning: shadowed binaries (same binary name in multiple PATH entries)
  const binaryLocations = new Map<string, string[]>()
  for (const entry of entries) {
    for (const binary of entry.llamaBinaries) {
      const key = binary.toLowerCase()
      if (!binaryLocations.has(key)) {
        binaryLocations.set(key, [])
      }
      binaryLocations.get(key)!.push(entry.directory)
    }
  }

  for (const [binary, dirs] of binaryLocations) {
    if (dirs.length > 1) {
      warnings.push(
        `"${binary}" found in ${dirs.length} PATH directories. ` +
        `"${dirs[0]}" takes priority over: ${dirs.slice(1).join(', ')}`
      )
    }
  }

  return { entries, warnings }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}
