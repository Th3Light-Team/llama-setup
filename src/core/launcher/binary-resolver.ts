import { join } from 'path'
import { existsSync } from 'fs'

/**
 * Resolve a llama.cpp binary name (e.g. "llama-server", "llama-bench") inside
 * an install directory.  Checks the install root and the common bin/ and
 * build/bin/ subdirs in order.  Returns the absolute path or null.
 *
 * Shared by the launcher (llama-server) and the bench runner (llama-bench)
 * so a single source of truth governs how we locate executables.
 */
export function resolveLlamaBinary(installPath: string, name: string): string | null {
  const isWin = process.platform === 'win32'
  const exe = isWin ? `${name}.exe` : name

  const candidates = [
    join(installPath, exe),
    join(installPath, 'bin', exe),
    join(installPath, 'build', 'bin', exe),
  ]

  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}
