import { execa } from 'execa'

interface CommandSuccess {
  ok: true
  stdout: string
  /** stderr captured alongside stdout — llama.cpp prints status lines AND the
   *  version banner here, so consumers should usually look in both streams. */
  stderr: string
  durationMs: number
}

interface CommandFailure {
  ok: false
  error: string
  durationMs: number
}

export type CommandResult = CommandSuccess | CommandFailure

/**
 * Safe command runner with timeout, logging, and platform-aware path resolution.
 * Never throws — always returns a discriminated union.
 */
export async function runCommand(
  cmd: string,
  args: string[] = [],
  options: { timeoutMs?: number; shell?: boolean } = {}
): Promise<CommandResult> {
  const { timeoutMs = 2000, shell = false } = options
  const start = performance.now()

  try {
    const result = await execa(cmd, args, {
      timeout: timeoutMs,
      reject: true,
      shell,
      windowsHide: true,
      // Prevent inheriting the parent's stdio which can hang in Electron
      stdin: 'ignore'
    })

    const durationMs = Math.round(performance.now() - start)
    return { ok: true, stdout: result.stdout, stderr: result.stderr ?? '', durationMs }
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start)
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message, durationMs }
  }
}

/**
 * Resolves nvidia-smi to an explicit path on platforms where it may
 * not be on PATH in minimal/server installs.
 */
export function resolveNvidiaSmiPath(osType: 'windows' | 'macos' | 'linux'): string[] {
  const candidates: string[] = ['nvidia-smi']

  if (osType === 'windows') {
    candidates.push('C:\\Windows\\System32\\nvidia-smi.exe')
  } else if (osType === 'linux') {
    candidates.push('/usr/bin/nvidia-smi', '/usr/local/bin/nvidia-smi')
  }

  return candidates
}

/**
 * Attempts to run a command using multiple candidate paths.
 * Returns the first successful result.
 */
export async function runCommandWithFallbackPaths(
  candidates: string[],
  args: string[] = [],
  options: { timeoutMs?: number } = {}
): Promise<CommandResult> {
  for (const cmd of candidates) {
    const result = await runCommand(cmd, args, options)
    if (result.ok) return result
  }
  // Return the last failure for diagnostics
  return { ok: false, error: `All candidates failed: ${candidates.join(', ')}`, durationMs: 0 }
}
