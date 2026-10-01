import { existsSync, readdirSync, statSync, realpathSync } from 'fs'
import { join, delimiter } from 'path'
import { analyzeBinary, fastFingerprint, getBinaryNames } from '../health'
import type { PhaseResult, DiscoveredInstall, BinaryIssue, BinaryName } from '../types'

/**
 * Phase 2: System PATH scanning.
 *
 * Parses the system PATH and scans each directory for llama.cpp binaries.
 * Also feeds data into the PathAnalysis for shadowing detection.
 *
 * Budget: ~200ms
 */
export async function probePathScan(): Promise<PhaseResult & { pathEntries: PathScanEntry[] }> {
  const installations: DiscoveredInstall[] = []
  const issues: BinaryIssue[] = []
  const pathEntries: PathScanEntry[] = []

  const pathString = process.env.PATH || ''
  const dirs = pathString.split(delimiter).filter(d => d.trim().length > 0)
  const binaryNames = getBinaryNames()

  // Track which binaries we've found and where (for shadowing detection)
  const firstSeen = new Map<string, string>()
  // Track canonical paths to avoid duplicate scanning
  const scannedCanonicalPaths = new Set<string>()

  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i]
    const dirExists = existsSync(dir)
    const foundBinaries: string[] = []

    if (dirExists) {
      // Resolve symlinks to get the canonical path
      let canonicalDir: string
      try {
        canonicalDir = realpathSync(dir)
      } catch {
        canonicalDir = dir
      }

      // Skip if we already scanned this canonical path
      if (scannedCanonicalPaths.has(canonicalDir)) {
        pathEntries.push({
          directory: dir,
          exists: true,
          containsLlama: false,
          llamaBinaries: [],
          priority: i
        })
        continue
      }
      scannedCanonicalPaths.add(canonicalDir)

      try {
        const entries = readdirSync(dir)
        const scanPromises: Promise<void>[] = []
        for (const entry of entries) {
          const lowerEntry = entry.toLowerCase()
          const matchedName = binaryNames.find(n => n.toLowerCase() === lowerEntry)
          if (!matchedName) continue

          const fullPath = join(dir, entry)
          try {
            const stat = statSync(fullPath)
            if (!stat.isFile()) continue

            foundBinaries.push(entry)

            // Shadowing detection
            const baseName = entry.toLowerCase()
            if (firstSeen.has(baseName)) {
              issues.push({
                binaryPath: fullPath,
                severity: 'warning',
                code: 'SHADOWED_BINARY',
                message: `"${entry}" in ${dir} is shadowed by ${firstSeen.get(baseName)} (higher PATH priority)`,
                suggestion: 'The version in the higher-priority directory will be used when running from terminal.'
              })
            } else {
              firstSeen.set(baseName, dir)
            }

            // Check for legacy "main" binary name
            const binaryName = classifyBinaryName(entry)
            if (binaryName === 'main') {
              issues.push({
                binaryPath: fullPath,
                severity: 'info',
                code: 'LEGACY_NAME',
                message: `Found legacy binary name "main" at ${fullPath}. llama.cpp renamed this to "llama-cli" around b2900.`,
                suggestion: 'Consider upgrading to a newer version with the renamed binary.'
              })
            }

            scanPromises.push((async () => {
              try {
                // Run health check and version extraction in a single command
                const { health, version } = await analyzeBinary(fullPath)

                installations.push({
                  fingerprint: fastFingerprint(fullPath),
                  source: { type: 'path', pathEntry: dir },
                  installPath: dir,
                  binaryPath: fullPath,
                  binaryName,
                  version,
                  backend: guessBackendFromPath(dir, entry),
                  health,
                  managed: false,
                  managedId: null,
                  sizeBytes: stat.size,
                  modifiedAt: stat.mtimeMs
                })
              } catch {
                // Ignore health check failures
              }
            })())
          } catch {
            // Individual file stat failure — skip
          }
        }
        await Promise.all(scanPromises)
      } catch {
        // Can't read directory — not a fatal error
      }
    } else {
      issues.push({
        binaryPath: dir,
        severity: 'warning',
        code: 'STALE_PATH',
        message: `PATH contains non-existent directory: ${dir}`,
        suggestion: 'Remove this entry from your system PATH to avoid confusion.'
      })
    }

    pathEntries.push({
      directory: dir,
      exists: dirExists,
      containsLlama: foundBinaries.length > 0,
      llamaBinaries: foundBinaries,
      priority: i
    })
  }

  return { installations, issues, pathEntries }
}

export interface PathScanEntry {
  directory: string
  exists: boolean
  containsLlama: boolean
  llamaBinaries: string[]
  priority: number
}

function classifyBinaryName(filename: string): BinaryName {
  const base = filename.replace(/\.exe$/i, '').toLowerCase()
  switch (base) {
    case 'llama-server': return 'llama-server'
    case 'llama-cli': return 'llama-cli'
    case 'llama-quantize': return 'llama-quantize'
    case 'llama-bench': return 'llama-bench'
    case 'main': return 'main'
    default: return 'other'
  }
}

/** Attempt to guess the backend from directory structure or filename context */
function guessBackendFromPath(dir: string): DiscoveredInstall['backend'] {
  const lowerDir = dir.toLowerCase()
  if (lowerDir.includes('cuda')) return 'cuda'
  if (lowerDir.includes('metal')) return 'metal'
  if (lowerDir.includes('vulkan')) return 'vulkan'
  return 'unknown'
}
