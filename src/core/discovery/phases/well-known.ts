import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { analyzeBinary, fastFingerprint, getBinaryNames } from '../health'
import type { PhaseResult, DiscoveredInstall, BinaryName } from '../types'

/**
 * Phase 3: Well-known directory scan.
 *
 * Checks commonly used directories where llama.cpp is installed,
 * beyond what's on PATH. Limited to 2 levels of depth for performance.
 *
 * Budget: ~300ms
 */
export async function probeWellKnownDirs(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []
  const platform = os.platform()
  const home = os.homedir()

  const locations = getWellKnownLocations(platform, home)

  for (const location of locations) {
    if (!existsSync(location)) continue

    const found = await scanDirectoryForBinaries(location, 2)
    for (const binary of found) {
      installations.push({
        ...binary,
        source: { type: 'well_known', location }
      })
    }
  }

  return { installations, issues }
}

/** Get well-known directories for each platform */
function getWellKnownLocations(platform: string, home: string): string[] {
  const common = [
    join(home, '.llama-studio', 'binaries')
  ]

  switch (platform) {
    case 'win32': {
      const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
      const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
      const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
      return [
        ...common,
        'C:\\llama.cpp',
        join(home, 'llama.cpp'),
        join(home, 'Desktop', 'llama.cpp'),
        join(localAppData, 'llama.cpp'),
        join(programFiles, 'llama.cpp'),
        join(programFilesX86, 'llama.cpp'),
        // Check Downloads for extracted llama.cpp archives
        ...scanDownloadsForLlama(join(home, 'Downloads'))
      ]
    }

    case 'darwin':
      return [
        ...common,
        '/usr/local/bin',
        '/opt/homebrew/bin',
        join(home, 'llama.cpp', 'build', 'bin'),
        join(home, 'llama.cpp'),
        // Homebrew cellar locations
        ...findHomebrewCellarPaths()
      ]

    default: // linux
      return [
        ...common,
        '/usr/local/bin',
        '/usr/bin',
        '/opt/llama.cpp',
        join(home, 'llama.cpp', 'build', 'bin'),
        join(home, 'llama.cpp'),
        join(home, '.local', 'bin'),
        '/snap/llama-cpp/current'
      ]
  }
}

/** Scan ~/Downloads for directories matching llama* pattern */
function scanDownloadsForLlama(downloadsDir: string): string[] {
  const results: string[] = []
  if (!existsSync(downloadsDir)) return results

  try {
    const entries = readdirSync(downloadsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.toLowerCase().startsWith('llama')) {
        results.push(join(downloadsDir, entry.name))
      }
    }
  } catch {
    // Can't read downloads — not critical
  }
  return results.slice(0, 5) // Limit to 5 matches
}

/** Find Homebrew cellar paths for llama.cpp */
function findHomebrewCellarPaths(): string[] {
  const results: string[] = []
  const cellarPaths = [
    '/opt/homebrew/Cellar/llama.cpp',
    '/usr/local/Cellar/llama.cpp'
  ]

  for (const cellar of cellarPaths) {
    if (!existsSync(cellar)) continue
    try {
      const versions = readdirSync(cellar, { withFileTypes: true })
      for (const ver of versions) {
        if (ver.isDirectory()) {
          results.push(join(cellar, ver.name, 'bin'))
        }
      }
    } catch {
      // Can't read cellar — skip
    }
  }

  return results
}

/**
 * Scan a directory up to maxDepth levels for llama.cpp binaries.
 * Returns discovered installs WITHOUT the source field (caller fills it).
 */
async function scanDirectoryForBinaries(
  dir: string,
  maxDepth: number,
  currentDepth = 0
): Promise<Omit<DiscoveredInstall, 'source'>[]> {
  const results: Omit<DiscoveredInstall, 'source'>[] = []
  if (currentDepth > maxDepth) return results

  const binaryNames = getBinaryNames()
  let entries: string[]

  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }

  const scanPromises: Promise<void>[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    let stat: ReturnType<typeof statSync>

    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isFile()) {
      const lowerEntry = entry.toLowerCase()
      const isLlamaBinary = binaryNames.some(n => n.toLowerCase() === lowerEntry)
      if (!isLlamaBinary) continue

      const binaryName = classifyBinaryName(entry)

      scanPromises.push((async () => {
        try {
          const { health, version } = await analyzeBinary(fullPath)
          results.push({
            fingerprint: fastFingerprint(fullPath),
            installPath: dir,
            binaryPath: fullPath,
            binaryName,
            version,
            backend: guessBackend(dir),
            health,
            managed: false,
            managedId: null,
            sizeBytes: stat.size,
            modifiedAt: stat.mtimeMs
          })
        } catch {
          // ignore error
        }
      })())
    } else if (stat.isDirectory() && currentDepth < maxDepth) {
      // Recurse into subdirectories (bin, build, build/bin, etc.)
      scanPromises.push((async () => {
        const subResults = await scanDirectoryForBinaries(fullPath, maxDepth, currentDepth + 1)
        results.push(...subResults)
      })())
    }
  }

  await Promise.all(scanPromises)

  return results
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

function guessBackend(dir: string): DiscoveredInstall['backend'] {
  const lower = dir.toLowerCase()
  if (lower.includes('cuda')) return 'cuda'
  if (lower.includes('metal')) return 'metal'
  if (lower.includes('vulkan')) return 'vulkan'
  if (lower.includes('cpu')) return 'cpu'
  return 'unknown'
}
