import { existsSync, statSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { analyzeBinary, fastFingerprint } from '../health'
import type { PhaseResult, DiscoveredInstall } from '../types'

/**
 * Phase 5: Ollama detection.
 *
 * Ollama bundles its own llama.cpp fork. We detect it separately because
 * the binary layout, version scheme, and capabilities differ from upstream.
 *
 * Budget: ~200ms
 */
export async function probeOllama(): Promise<PhaseResult> {
  const installations: DiscoveredInstall[] = []
  const issues: PhaseResult['issues'] = []
  const platform = os.platform()
  const home = os.homedir()

  const ollamaPaths = getOllamaPaths(platform, home)

  for (const ollamaPath of ollamaPaths) {
    if (!existsSync(ollamaPath)) continue

    try {
      const stat = statSync(ollamaPath)
      if (!stat.isFile()) continue

      const { health, version } = await analyzeBinary(ollamaPath)

      installations.push({
        fingerprint: fastFingerprint(ollamaPath),
        source: { type: 'ollama' },
        installPath: ollamaPath.substring(0, ollamaPath.lastIndexOf(platform === 'win32' ? '\\' : '/')),
        binaryPath: ollamaPath,
        binaryName: 'other',
        version,
        backend: 'unknown',
        health,
        managed: false,
        managedId: null,
        sizeBytes: stat.size,
        modifiedAt: stat.mtimeMs
      })

      issues.push({
        binaryPath: ollamaPath,
        severity: 'info',
        code: 'VERSION_MISMATCH',
        message: 'This is Ollama\'s bundled llama.cpp fork. It may behave differently from upstream builds.',
        suggestion: 'For full llama.cpp features, install an upstream build from the Binaries page.'
      })

      // Only report the first Ollama binary we find
      break
    } catch {
      // Skip inaccessible paths
    }
  }

  return { installations, issues }
}

function getOllamaPaths(platform: string, home: string): string[] {
  switch (platform) {
    case 'win32': {
      const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
      return [
        join(localAppData, 'Ollama', 'ollama_llama_server.exe'),
        join(localAppData, 'Programs', 'Ollama', 'ollama_llama_server.exe'),
        join(localAppData, 'Ollama', 'ollama.exe'),
        join(localAppData, 'Programs', 'Ollama', 'ollama.exe')
      ]
    }

    case 'darwin':
      return [
        '/usr/local/bin/ollama',
        '/Applications/Ollama.app/Contents/MacOS/ollama',
        join(home, '.ollama', 'ollama')
      ]

    default: // linux
      return [
        '/usr/local/bin/ollama',
        '/usr/bin/ollama',
        join(home, '.ollama', 'ollama')
      ]
  }
}
