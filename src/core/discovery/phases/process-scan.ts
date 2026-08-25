import os from 'os'
import { existsSync, statSync } from 'fs'
import { runCommand } from '../../detector/runner'
import { analyzeBinary, fastFingerprint } from '../health'
import type { PhaseResult, DiscoveredInstall } from '../types'

/**
 * Phase 6: Running process detection.
 *
 * Checks if any llama.cpp process is currently running. This reveals
 * binary paths even when they're not on PATH or in well-known directories,
 * and warns about potential port conflicts.
 *
 * Budget: ~100ms
 */
export async function probeRunningProcesses(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []
  const platform = os.platform()

  const processes = await findLlamaProcesses(platform)

  for (const proc of processes) {
    if (!proc.path || !existsSync(proc.path)) continue

    try {
      const stat = statSync(proc.path)
      const { health, version } = await analyzeBinary(proc.path)

      installations.push({
        fingerprint: fastFingerprint(proc.path),
        source: { type: 'process', pid: proc.pid },
        installPath: proc.path.substring(0, proc.path.lastIndexOf(platform === 'win32' ? '\\' : '/')),
        binaryPath: proc.path,
        binaryName: classifyProcessName(proc.name),
        version,
        backend: 'unknown',
        health,
        managed: false,
        managedId: null,
        sizeBytes: stat.size,
        modifiedAt: stat.mtimeMs
      })

      issues.push({
        binaryPath: proc.path,
        severity: 'info',
        code: 'VERSION_MISMATCH',
        message: `${proc.name} is currently running (PID ${proc.pid}). Starting another instance may cause port conflicts.`,
        suggestion: 'Stop the running instance before launching from Llama Studio.'
      })
    } catch {
      // Skip inaccessible process binaries
    }
  }

  return { installations, issues }
}

interface ProcessInfo {
  pid: number
  name: string
  path: string
}

async function findLlamaProcesses(platform: string): Promise<ProcessInfo[]> {
  const results: ProcessInfo[] = []

  if (platform === 'win32') {
    const psResult = await runCommand(
      'powershell.exe',
      [
        '-NonInteractive', '-Command',
        'Get-Process -Name "llama-server","llama-cli" -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path | ConvertTo-Json'
      ],
      { timeoutMs: 3000 }
    )

    if (psResult.ok && psResult.stdout.trim()) {
      try {
        const parsed = JSON.parse(psResult.stdout)
        const processes = Array.isArray(parsed) ? parsed : [parsed]
        for (const p of processes) {
          if (p.Path) {
            results.push({
              pid: p.Id,
              name: p.ProcessName,
              path: p.Path
            })
          }
        }
      } catch {
        // JSON parse failure — skip
      }
    }
  } else {
    // macOS / Linux: use pgrep + ps to find llama processes
    const pgrepResult = await runCommand(
      'pgrep', ['-a', 'llama-(server|cli)'],
      { timeoutMs: 2000 }
    )

    if (pgrepResult.ok && pgrepResult.stdout.trim()) {
      for (const line of pgrepResult.stdout.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        // Format: "12345 /path/to/llama-server --args..."
        const match = trimmed.match(/^(\d+)\s+(\S+)/)
        if (match) {
          results.push({
            pid: parseInt(match[1], 10),
            name: match[2].split('/').pop() || match[2],
            path: match[2]
          })
        }
      }
    } else {
      // Fallback: ps aux | grep
      const psResult = await runCommand(
        'sh', ['-c', 'ps aux | grep -E "llama-(server|cli)" | grep -v grep'],
        { timeoutMs: 2000, shell: true }
      )

      if (psResult.ok && psResult.stdout.trim()) {
        for (const line of psResult.stdout.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          // ps aux format: USER PID ... COMMAND
          const parts = trimmed.split(/\s+/)
          const pid = parseInt(parts[1], 10)
          // Find the command path (usually the 11th field or later)
          const cmdIdx = parts.findIndex(p => p.includes('llama-'))
          if (cmdIdx >= 0 && !isNaN(pid)) {
            results.push({
              pid,
              name: parts[cmdIdx].split('/').pop() || parts[cmdIdx],
              path: parts[cmdIdx]
            })
          }
        }
      }
    }
  }

  return results
}

function classifyProcessName(name: string): DiscoveredInstall['binaryName'] {
  const lower = name.toLowerCase().replace(/\.exe$/, '')
  if (lower.includes('llama-server')) return 'llama-server'
  if (lower.includes('llama-cli')) return 'llama-cli'
  if (lower === 'main') return 'main'
  return 'other'
}
