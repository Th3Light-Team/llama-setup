import { existsSync, statSync, readFileSync } from 'fs'
import { createHash } from 'crypto'
import os from 'os'
import { runCommand } from '../detector/runner'
import type { BinaryHealth, HealthCheck, VersionInfo, BinaryIssue } from './types'

/** Known binary filenames for llama.cpp */
export const LLAMA_BINARY_NAMES_UNIX = [
  'llama-server', 'llama-cli', 'llama-quantize', 'llama-bench', 'main'
] as const

export const LLAMA_BINARY_NAMES_WIN = [
  'llama-server.exe', 'llama-cli.exe', 'llama-quantize.exe', 'llama-bench.exe', 'main.exe'
] as const

/** Get the correct binary names for the current OS */
export function getBinaryNames(): readonly string[] {
  return os.platform() === 'win32' ? LLAMA_BINARY_NAMES_WIN : LLAMA_BINARY_NAMES_UNIX
}

/**
 * Generate a fast fingerprint for deduplication.
 * Uses first 1MB of the file + file size + mtime instead of full SHA-256
 * for performance on large (~100MB) binaries.
 */
export function fastFingerprint(filePath: string): string {
  try {
    const stat = statSync(filePath)
    const fd = readFileSync(filePath, { flag: 'r' })
    const chunk = fd.subarray(0, Math.min(1024 * 1024, fd.length))
    const hash = createHash('sha256')
    hash.update(chunk)
    hash.update(`${stat.size}:${stat.mtimeMs}`)
    return hash.digest('hex').substring(0, 16)
  } catch {
    return 'unknown'
  }
}

export async function analyzeBinary(binaryPath: string): Promise<{ health: BinaryHealth, version: VersionInfo | null }> {
  // Run --version ONCE to use for both dependency checking and version extraction.
  // llama.cpp builds print the "version: NNNN (HASH)" line to *stderr* (next
  // to their ggml backend-load status), so we must check both streams.
  const cmdResult = await runCommand(binaryPath, ['--version'], { timeoutMs: 3000 })

  const health = await checkBinaryHealthInternal(binaryPath, cmdResult)

  let version: VersionInfo | null = null
  if (cmdResult.ok) {
    const combined = `${cmdResult.stdout}\n${cmdResult.stderr}`
    version = parseVersionString(combined)
  }

  return { health, version }
}

/**
 * Deep verify a binary (used by IPC).
 */
export async function checkBinaryHealth(binaryPath: string): Promise<BinaryHealth> {
  const { health } = await analyzeBinary(binaryPath)
  return health
}

/** Internal health check runner that reuses the command result */
async function checkBinaryHealthInternal(binaryPath: string, cmdResult: { ok: boolean, stdout: string, error: string }): Promise<BinaryHealth> {
  const checks: HealthCheck[] = []
  let worstStatus: BinaryHealth['status'] = 'healthy'

  // --- Check 1: File existence and permissions ---
  const existCheck = checkFileExists(binaryPath)
  checks.push(existCheck)
  if (!existCheck.passed) {
    return { status: 'broken', checks }
  }

  // --- Check 2: Dynamic dependency / execution check ---
  const depCheck = checkDependencies(binaryPath, cmdResult)
  checks.push(depCheck)
  if (!depCheck.passed) {
    worstStatus = 'broken'
  }

  // --- Check 3: Version extraction (same stdout+stderr combine as analyzeBinary) ---
  let parsedVersion: VersionInfo | null = null
  if (cmdResult.ok) {
    parsedVersion = parseVersionString(`${cmdResult.stdout}\n${cmdResult.stderr}`)
  }
  const versionCheck = checkVersionExtraction(parsedVersion)
  checks.push(versionCheck)
  if (!versionCheck.passed && worstStatus === 'healthy') {
    worstStatus = 'degraded'
  }

  // --- Check 4: Staleness ---
  const staleCheck = checkStaleness(binaryPath)
  checks.push(staleCheck)

  // --- Check 5: macOS-specific (quarantine / unsigned) ---
  if (os.platform() === 'darwin') {
    const quarantineCheck = await checkQuarantine(binaryPath)
    checks.push(quarantineCheck)
    if (!quarantineCheck.passed && worstStatus === 'healthy') {
      worstStatus = 'degraded'
    }
  }

  return { status: worstStatus, checks }
}

/**
 * Extract version info from a binary by running --version.
 * Prefer `analyzeBinary` to avoid spawning multiple processes.
 */
export async function extractVersion(binaryPath: string): Promise<VersionInfo | null> {
  const result = await runCommand(binaryPath, ['--version'], { timeoutMs: 3000 })
  if (!result.ok) return null
  return parseVersionString(result.stdout)
}

/**
 * Parse a version string from llama.cpp --version output.
 * Handles multiple known formats:
 *   - "version: 4358 (42c3bb5e)"
 *   - "b8492"
 *   - "ggml_cuda_init: ..."  (just look for build number patterns)
 */
export function parseVersionString(raw: string): VersionInfo {
  const trimmed = raw.trim()

  // Pattern 1: "version: NNNN (HASH)"
  const versionMatch = trimmed.match(/version:\s*(\d+)\s*\(([a-f0-9]+)\)/i)
  if (versionMatch) {
    return {
      raw: trimmed,
      build: parseInt(versionMatch[1], 10),
      commit: versionMatch[2]
    }
  }

  // Pattern 2: "bNNNN" anywhere in output
  const buildMatch = trimmed.match(/\bb(\d{3,})\b/i)
  if (buildMatch) {
    // Try to also find a commit hash near it
    const commitMatch = trimmed.match(/\b([a-f0-9]{7,40})\b/)
    return {
      raw: trimmed,
      build: parseInt(buildMatch[1], 10),
      commit: commitMatch ? commitMatch[1] : null
    }
  }

  // Pattern 3: Just a build number
  const numberMatch = trimmed.match(/^(\d{3,})$/)
  if (numberMatch) {
    return {
      raw: trimmed,
      build: parseInt(numberMatch[1], 10),
      commit: null
    }
  }

  // Could not parse — return raw
  return { raw: trimmed, build: null, commit: null }
}

// ─── Individual health checks ────────────────────────────────────

function checkFileExists(binaryPath: string): HealthCheck {
  const start = performance.now()
  try {
    if (!existsSync(binaryPath)) {
      return {
        name: 'File existence',
        passed: false,
        detail: `Binary not found at ${binaryPath}`,
        durationMs: Math.round(performance.now() - start)
      }
    }

    const stat = statSync(binaryPath)
    if (stat.size === 0) {
      return {
        name: 'File existence',
        passed: false,
        detail: 'Binary file is empty (0 bytes)',
        durationMs: Math.round(performance.now() - start)
      }
    }

    // On Unix, check executable permission
    if (os.platform() !== 'win32') {
      const mode = stat.mode
      const isExecutable = !!(mode & 0o111)
      if (!isExecutable) {
        return {
          name: 'File existence',
          passed: false,
          detail: 'Binary exists but is not marked as executable',
          durationMs: Math.round(performance.now() - start)
        }
      }
    }

    return {
      name: 'File existence',
      passed: true,
      detail: `Found (${formatSize(stat.size)})`,
      durationMs: Math.round(performance.now() - start)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      name: 'File existence',
      passed: false,
      detail: `Access error: ${message}`,
      durationMs: Math.round(performance.now() - start)
    }
  }
}

export function checkDependencies(binaryPath: string, result: { ok: boolean, stdout: string, error: string }): HealthCheck {
  const start = performance.now()
  const platform = os.platform()

  // The most reliable cross-platform check: try to run the binary with --version.
  // Some llama.cpp binaries (notably llama-bench) don't accept --version and
  // exit non-zero printing their usage banner.  That's NOT a dependency failure —
  // the binary loaded and ran far enough to parse args and emit help.

  if (result.ok) {
    return {
      name: 'Dependencies',
      passed: true,
      detail: 'Binary executes successfully',
      durationMs: Math.round(performance.now() - start)
    }
  }

  const errorLower = result.error.toLowerCase()

  // ── Short-circuit on "the binary ran and complained about args" ──
  // Putting this BEFORE the platform DLL checks because llama.cpp's startup
  // banner mentions ggml-*.dll / .dylib / .so file names — those names match
  // a naive "errorLower.includes('dll')" and were marking llama-bench as
  // Broken even though it printed its full help.
  if (
    errorLower.includes('usage:') ||
    errorLower.includes('error: invalid parameter') ||
    errorLower.includes('error: missing') ||
    errorLower.includes('error: unknown argument') ||
    errorLower.includes('error: unrecognized argument')
  ) {
    return {
      name: 'Dependencies',
      passed: true,
      detail: 'Binary executes (printed usage / argument error)',
      durationMs: Math.round(performance.now() - start)
    }
  }

  // Windows-specific DLL errors — match on actual load-failure phrases,
  // not the bare "dll" substring which appears in successful backend logs.
  if (platform === 'win32') {
    if (errorLower.includes('not a valid win32 application')) {
      return {
        name: 'Dependencies',
        passed: false,
        detail: 'Binary is for a different architecture or is corrupted',
        durationMs: Math.round(performance.now() - start)
      }
    }
    if (
      errorLower.includes('side-by-side') ||
      errorLower.includes('was not found') ||
      errorLower.includes('is missing from your computer') ||
      errorLower.includes('cannot find') ||
      errorLower.includes('code execution cannot proceed') ||
      errorLower.includes('0xc000007b') ||
      errorLower.includes('the procedure entry point')
    ) {
      return {
        name: 'Dependencies',
        passed: false,
        detail: `Missing DLL or runtime: ${result.error.substring(0, 200)}`,
        durationMs: Math.round(performance.now() - start)
      }
    }
  }

  // macOS-specific dylib errors — same principle: match actual load-failure phrases.
  if (platform === 'darwin') {
    if (
      errorLower.includes('library not loaded') ||
      errorLower.includes('image not found') ||
      errorLower.includes('symbol not found')
    ) {
      return {
        name: 'Dependencies',
        passed: false,
        detail: `Missing dynamic library: ${result.error.substring(0, 200)}`,
        durationMs: Math.round(performance.now() - start)
      }
    }
  }

  // Linux-specific .so errors — only match the actual dlopen / loader phrases,
  // not "*.so" filenames which can appear in normal output.
  if (platform === 'linux') {
    if (
      errorLower.includes('error while loading shared libraries') ||
      errorLower.includes('cannot open shared object file') ||
      errorLower.includes('undefined symbol')
    ) {
      return {
        name: 'Dependencies',
        passed: false,
        detail: `Missing shared library: ${result.error.substring(0, 200)}`,
        durationMs: Math.round(performance.now() - start)
      }
    }
  }

  // Generic execution failure — could be missing args (which is OK for some binaries)
  if (errorLower.includes('enoent') || errorLower.includes('no such file')) {
    return {
      name: 'Dependencies',
      passed: false,
      detail: 'Binary file not found or cannot be executed',
      durationMs: Math.round(performance.now() - start)
    }
  }

  // Ambiguous failure — mark as degraded rather than broken
  return {
    name: 'Dependencies',
    passed: false,
    detail: `Execution check inconclusive: ${result.error.substring(0, 150)}`,
    durationMs: Math.round(performance.now() - start)
  }
}

function checkVersionExtraction(version: VersionInfo | null): HealthCheck {
  const start = performance.now()

  if (version && version.build !== null) {
    return {
      name: 'Version',
      passed: true,
      detail: `Build ${version.build}${version.commit ? ` (${version.commit})` : ''}`,
      durationMs: Math.round(performance.now() - start)
    }
  }

  if (version && version.raw) {
    return {
      name: 'Version',
      passed: false,
      detail: `Version string found but could not parse build number: "${version.raw.substring(0, 80)}"`,
      durationMs: Math.round(performance.now() - start)
    }
  }

  return {
    name: 'Version',
    passed: false,
    detail: 'Could not extract version information',
    durationMs: Math.round(performance.now() - start)
  }
}

function checkStaleness(binaryPath: string): HealthCheck {
  const start = performance.now()
  try {
    const stat = statSync(binaryPath)
    const ageMs = Date.now() - stat.mtimeMs
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
    const isStale = ageDays > 90

    return {
      name: 'Staleness',
      passed: !isStale,
      detail: isStale
        ? `Binary is ${ageDays} days old. A newer version may be available.`
        : `Binary is ${ageDays} day${ageDays === 1 ? '' : 's'} old`,
      durationMs: Math.round(performance.now() - start)
    }
  } catch {
    return {
      name: 'Staleness',
      passed: true,
      detail: 'Could not determine file age',
      durationMs: Math.round(performance.now() - start)
    }
  }
}

async function checkQuarantine(binaryPath: string): Promise<HealthCheck> {
  const start = performance.now()
  const result = await runCommand('xattr', ['-l', binaryPath], { timeoutMs: 2000 })

  if (result.ok && result.stdout.includes('com.apple.quarantine')) {
    return {
      name: 'macOS quarantine',
      passed: false,
      detail: `Quarantine flag is set. Run: xattr -d com.apple.quarantine "${binaryPath}"`,
      durationMs: Math.round(performance.now() - start)
    }
  }

  return {
    name: 'macOS quarantine',
    passed: true,
    detail: 'No quarantine flag detected',
    durationMs: Math.round(performance.now() - start)
  }
}

// ─── Utilities ───────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}
