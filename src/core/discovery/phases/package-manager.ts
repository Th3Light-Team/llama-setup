import os from 'os'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { runCommand } from '../../detector/runner'
import { analyzeBinary, fastFingerprint } from '../health'
import type { PhaseResult, DiscoveredInstall } from '../types'

/**
 * Phase 4: Package manager detection.
 *
 * Queries platform-specific package managers for installed llama.cpp packages.
 * Each query is wrapped in a try/catch and timeout so a missing package manager
 * never crashes the scan.
 *
 * Budget: ~500ms
 */
export async function probePackageManagers(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []
  const platform = os.platform()

  if (platform === 'darwin') {
    const brewResults = await probeHomebrew()
    installations.push(...brewResults.installations)
    issues.push(...brewResults.issues)
  }

  if (platform === 'linux') {
    const aptResults = await probeAptDpkg()
    installations.push(...aptResults.installations)
    issues.push(...aptResults.issues)

    const snapResults = await probeSnap()
    installations.push(...snapResults.installations)
    issues.push(...snapResults.issues)
  }

  if (platform === 'win32') {
    const scoopResults = await probeScoop()
    installations.push(...scoopResults.installations)
    issues.push(...scoopResults.issues)

    const chocoResults = await probeChocolatey()
    installations.push(...chocoResults.installations)
    issues.push(...chocoResults.issues)

    const wingetResults = await probeWinget()
    installations.push(...wingetResults.installations)
    issues.push(...wingetResults.issues)
  }

  return { installations, issues }
}

// ─── Homebrew (macOS) ────────────────────────────────────────────

async function probeHomebrew(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []

  // Check if llama.cpp is installed via brew
  const listResult = await runCommand('brew', ['list', '--formula'], { timeoutMs: 3000 })
  if (!listResult.ok) return { installations, issues }

  const formulae = listResult.stdout.split('\n').map(l => l.trim())
  const llamaFormula = formulae.find(f => f.toLowerCase().includes('llama'))
  if (!llamaFormula) return { installations, issues }

  // Get detailed info
  const infoResult = await runCommand('brew', ['info', '--json=v2', llamaFormula], { timeoutMs: 3000 })
  if (!infoResult.ok) return { installations, issues }

  try {
    const info = JSON.parse(infoResult.stdout)
    const formula = info.formulae?.[0]
    if (!formula) return { installations, issues }

    // Get the prefix (install path)
    const prefixResult = await runCommand('brew', ['--prefix', llamaFormula], { timeoutMs: 2000 })
    if (!prefixResult.ok) return { installations, issues }

    const prefix = prefixResult.stdout.trim()
    const binDir = join(prefix, 'bin')

    // Look for llama-server in the bin directory
    for (const binaryName of ['llama-server', 'llama-cli'] as const) {
      const binaryPath = join(binDir, binaryName)
      if (!existsSync(binaryPath)) continue

      const stat = statSync(binaryPath)
      const { health, version } = await analyzeBinary(binaryPath)

      installations.push({
        fingerprint: fastFingerprint(binaryPath),
        source: { type: 'package_manager', manager: 'Homebrew' },
        installPath: prefix,
        binaryPath,
        binaryName,
        version,
        backend: os.arch() === 'arm64' ? 'metal' : 'cpu',
        health,
        managed: false,
        managedId: null,
        sizeBytes: stat.size,
        modifiedAt: stat.mtimeMs
      })
    }
  } catch {
    // JSON parse failure — not critical
  }

  return { installations, issues }
}

// ─── APT/dpkg (Linux) ───────────────────────────────────────────

async function probeAptDpkg(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []

  // Check if llama-cpp or similar package is installed
  const dpkgResult = await runCommand('dpkg', ['-l'], { timeoutMs: 3000 })
  if (!dpkgResult.ok) return { installations, issues }

  const llamaLine = dpkgResult.stdout.split('\n').find(l => l.toLowerCase().includes('llama'))
  if (!llamaLine) return { installations, issues }

  // Get file list for the package
  const packageName = llamaLine.trim().split(/\s+/)[1]
  if (!packageName) return { installations, issues }

  const filesResult = await runCommand('dpkg', ['-L', packageName], { timeoutMs: 2000 })
  if (!filesResult.ok) return { installations, issues }

  const files = filesResult.stdout.split('\n').map(f => f.trim())
  for (const file of files) {
    const baseName = file.split('/').pop()?.toLowerCase() || ''
    if (!baseName.startsWith('llama-') && baseName !== 'main') continue
    if (!existsSync(file)) continue

    try {
      const stat = statSync(file)
      if (!stat.isFile()) continue

      const { health, version } = await analyzeBinary(file)
      const binaryName = classifyBinaryName(baseName)

      installations.push({
        fingerprint: fastFingerprint(file),
        source: { type: 'package_manager', manager: 'APT' },
        installPath: file.substring(0, file.lastIndexOf('/')),
        binaryPath: file,
        binaryName,
        version,
        backend: 'unknown',
        health,
        managed: false,
        managedId: null,
        sizeBytes: stat.size,
        modifiedAt: stat.mtimeMs
      })
    } catch {
      // Skip inaccessible files
    }
  }

  return { installations, issues }
}

// ─── Snap (Linux) ────────────────────────────────────────────────

async function probeSnap(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []

  const snapResult = await runCommand('snap', ['list'], { timeoutMs: 3000 })
  if (!snapResult.ok) return { installations, issues }

  const llamaLine = snapResult.stdout.split('\n').find(l => l.toLowerCase().includes('llama'))
  if (!llamaLine) return { installations, issues }

  // Snap binaries are typically at /snap/<name>/current/
  const snapName = llamaLine.trim().split(/\s+/)[0]
  const snapBinDir = `/snap/${snapName}/current/bin`

  if (existsSync(snapBinDir)) {
    for (const binaryName of ['llama-server', 'llama-cli'] as const) {
      const binaryPath = join(snapBinDir, binaryName)
      if (!existsSync(binaryPath)) continue

      const stat = statSync(binaryPath)
      const { health, version } = await analyzeBinary(binaryPath)

      installations.push({
        fingerprint: fastFingerprint(binaryPath),
        source: { type: 'package_manager', manager: 'Snap' },
        installPath: `/snap/${snapName}/current`,
        binaryPath,
        binaryName,
        version,
        backend: 'unknown',
        health,
        managed: false,
        managedId: null,
        sizeBytes: stat.size,
        modifiedAt: stat.mtimeMs
      })
    }
  }

  return { installations, issues }
}

// ─── Scoop (Windows) ────────────────────────────────────────────

async function probeScoop(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []

  const prefixResult = await runCommand('scoop', ['prefix', 'llama.cpp'], { timeoutMs: 3000 })
  if (!prefixResult.ok) return { installations, issues }

  const prefix = prefixResult.stdout.trim()
  if (!prefix || !existsSync(prefix)) return { installations, issues }

  for (const binaryName of ['llama-server.exe', 'llama-cli.exe'] as const) {
    const binaryPath = join(prefix, binaryName)
    if (!existsSync(binaryPath)) continue

    const stat = statSync(binaryPath)
    const { health, version } = await analyzeBinary(binaryPath)

    installations.push({
      fingerprint: fastFingerprint(binaryPath),
      source: { type: 'package_manager', manager: 'Scoop' },
      installPath: prefix,
      binaryPath,
      binaryName: classifyBinaryName(binaryName),
      version,
      backend: 'unknown',
      health,
      managed: false,
      managedId: null,
      sizeBytes: stat.size,
      modifiedAt: stat.mtimeMs
    })
  }

  return { installations, issues }
}

// ─── Chocolatey (Windows) ───────────────────────────────────────

async function probeChocolatey(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []

  const chocoResult = await runCommand(
    'powershell.exe',
    ['-NonInteractive', '-Command', 'choco list --local-only 2>$null | Select-String llama'],
    { timeoutMs: 5000 }
  )

  if (!chocoResult.ok || !chocoResult.stdout.trim()) return { installations, issues }

  // Chocolatey installs to C:\ProgramData\chocolatey\lib\<package>\tools\ typically
  const chocoLib = 'C:\\ProgramData\\chocolatey\\lib'
  if (!existsSync(chocoLib)) return { installations, issues }

  // Try common patterns
  for (const subdir of ['llama.cpp', 'llama-cpp', 'llamacpp']) {
    const toolsDir = join(chocoLib, subdir, 'tools')
    if (!existsSync(toolsDir)) continue

    for (const binaryName of ['llama-server.exe', 'llama-cli.exe'] as const) {
      const binaryPath = join(toolsDir, binaryName)
      if (!existsSync(binaryPath)) continue

      const stat = statSync(binaryPath)
      const { health, version } = await analyzeBinary(binaryPath)

      installations.push({
        fingerprint: fastFingerprint(binaryPath),
        source: { type: 'package_manager', manager: 'Chocolatey' },
        installPath: join(chocoLib, subdir),
        binaryPath,
        binaryName: classifyBinaryName(binaryName),
        version,
        backend: 'unknown',
        health,
        managed: false,
        managedId: null,
        sizeBytes: stat.size,
        modifiedAt: stat.mtimeMs
      })
    }
  }

  return { installations, issues }
}

// ─── Winget (Windows) ───────────────────────────────────────────

async function probeWinget(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []

  const wingetResult = await runCommand(
    'powershell.exe',
    ['-NonInteractive', '-Command', 'winget list --name llama 2>$null'],
    { timeoutMs: 5000 }
  )

  if (!wingetResult.ok || !wingetResult.stdout.toLowerCase().includes('llama')) {
    return { installations, issues }
  }

  // Winget doesn't easily expose install paths, so we just note it was found
  // The actual binary discovery happens through PATH or well-known dir scanning
  // This phase mainly confirms the package manager knows about it

  return { installations, issues }
}

// ─── Helpers ─────────────────────────────────────────────────────

function classifyBinaryName(filename: string): DiscoveredInstall['binaryName'] {
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
