import { join } from 'path'
import { homedir } from 'os'
import { db } from './db'

/**
 * App settings — persisted as a single JSON blob in `app_kv`.
 *
 * `modelsDir` is the **default** folder: where new downloads land and the
 * implicit fallback when the user hasn't configured anything else.
 * `extraModelsDirs` is the user-managed set of additional locations the
 * Library scans alongside the default — these are read-only sources, the
 * downloader never writes to them.
 */
export interface AppSettings {
  modelsDir: string
  extraModelsDirs: string[]
  binariesDir: string
  licensePolicy: 'unrestricted' | 'standard' | 'strict'
  telemetry: boolean
}

const DEFAULT_MODELS_DIR = join(homedir(), '.llama-studio', 'models')
const DEFAULT_BINARIES_DIR = join(homedir(), '.llama-studio', 'binaries')

const DEFAULTS: AppSettings = {
  modelsDir: DEFAULT_MODELS_DIR,
  extraModelsDirs: [],
  binariesDir: DEFAULT_BINARIES_DIR,
  licensePolicy: 'unrestricted',
  telemetry: false,
}

function readRaw(): Partial<AppSettings> {
  const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get('settings') as { value: string } | undefined
  if (!row) return {}
  try { return JSON.parse(row.value) as Partial<AppSettings> } catch { return {} }
}

/** Resolve full settings, applying defaults for any missing/legacy fields. */
export function getSettings(): AppSettings {
  const raw = readRaw()
  return {
    ...DEFAULTS,
    ...raw,
    // Defensive: drop duplicates and entries identical to the default dir.
    extraModelsDirs: Array.from(new Set(raw.extraModelsDirs ?? []))
      .filter(p => typeof p === 'string' && p.trim().length > 0 && p !== (raw.modelsDir ?? DEFAULTS.modelsDir)),
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...getSettings(), ...patch }
  db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run('settings', JSON.stringify(next))
  return getSettings()
}

/** All model-folder roots the app should scan, default first. */
export function allModelDirs(): string[] {
  const s = getSettings()
  return [s.modelsDir, ...s.extraModelsDirs]
}

/**
 * Returns true when `filePath` is inside any configured model folder.
 * Used to gate `library:reveal` and `library:delete` against path-traversal.
 */
export function isInsideAnyModelDir(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return allModelDirs().some(dir => normalized.startsWith(dir.replace(/\\/g, '/').toLowerCase()))
}
