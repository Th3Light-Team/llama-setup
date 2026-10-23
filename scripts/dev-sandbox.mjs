/**
 * Dev sandbox: runs the app against a throwaway HOME so you can iterate
 * without touching ~/.llama-studio and without the first-run wizard.
 *
 *   npm run dev:sandbox            # onboarding already done; your real models + binaries visible
 *   npm run dev:zero              # wipes the sandbox first -> true zero state (wizard runs)
 *
 * The sandbox lives in `.dev-sandbox/` (gitignored). Nothing is copied: each real
 * model file and the binaries folder are symlinked. Deleting a model in the
 * sandbox removes only the link, never the real file.
 *
 * Overrides: LLAMA_STUDIO_HOME=/path/to/real/home  (default: your home dir)
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const repo = resolve(import.meta.dirname, '..')
const sandbox = join(repo, '.dev-sandbox')
const sandboxHome = join(sandbox, 'home')
const appDir = join(sandboxHome, '.llama-studio')
const zero = process.argv.includes('--zero')
const realAppDir = join(process.env.LLAMA_STUDIO_HOME ?? homedir(), '.llama-studio')

if (zero) {
  rmSync(sandbox, { recursive: true, force: true })
  console.log('[sandbox] zero state: wiped', sandbox)
}
mkdirSync(appDir, { recursive: true })

/**
 * Mirror the real models into the sandbox with one symlink per file. The Library
 * scans and deletes through these paths: `rm` on a symlink removes only the link,
 * so deleting in the sandbox can never touch the real .gguf. Re-run on every start,
 * so models downloaded for real later show up in the sandbox too.
 */
function linkRealModels(realModels, sandboxModels) {
  mkdirSync(sandboxModels, { recursive: true })
  let linked = 0
  const linkFile = (src, dest) => {
    if (!existsSync(dest)) { symlinkSync(src, dest, 'file'); linked++ }
  }
  for (const entry of readdirSync(realModels, { withFileTypes: true })) {
    const src = join(realModels, entry.name)
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) {
      linkFile(src, join(sandboxModels, entry.name))
    } else if (entry.isDirectory()) {
      const destDir = join(sandboxModels, entry.name)
      mkdirSync(destDir, { recursive: true })
      for (const file of readdirSync(src)) {
        if (file.toLowerCase().endsWith('.gguf') || file === '_meta.json') linkFile(join(src, file), join(destDir, file))
      }
    }
  }
  return linked
}

/**
 * Copy the `installs` rows of the real app DB (read-only) so the launcher sees the
 * engine as installed. Paths under the real app dir are rewritten to the sandbox,
 * where the binaries folder is a symlink. Existing sandbox rows are kept.
 */
function seedInstalls(db, realDbPath, realDir, sandboxDir) {
  if (!existsSync(realDbPath)) return 0
  const real = new DatabaseSync(realDbPath, { readOnly: true })
  try {
    const schema = real.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'installs'").get()
    if (!schema) return 0
    db.exec(schema.sql.replace(/^CREATE TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS '))
    const rows = real.prepare('SELECT * FROM installs').all()
    for (const row of rows) {
      const cols = Object.keys(row)
      const values = cols.map(c => (typeof row[c] === 'string' ? row[c].split(realDir).join(sandboxDir) : row[c]))
      db.prepare(`INSERT OR IGNORE INTO installs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...values)
    }
    console.log(`[sandbox] ${rows.length} install record(s) copied from the real app DB`)
    return rows.length
  } finally {
    real.close()
  }
}

if (!zero) {
  // The app creates these tables itself; declaring them here keeps seeding safe on first run.
  const db = new DatabaseSync(join(appDir, 'studio.db'))
  db.exec('CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
  const put = (key, value) => db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
  put('onboarding', { completedAt: new Date().toISOString(), skippedSteps: [], version: '1' })
  // Sandbox models folder is the default one, so no extra folders are configured.
  put('settings', { extraModelsDirs: [] })
  seedInstalls(db, join(realAppDir, 'studio.db'), realAppDir, appDir)
  db.close()

  const realModels = join(realAppDir, 'models')
  if (existsSync(realModels)) {
    const linked = linkRealModels(realModels, join(appDir, 'models'))
    console.log(`[sandbox] ${linked} model file link(s) added from ${realModels}`)
  }

  const realBinaries = join(realAppDir, 'binaries')
  const sandboxBinaries = join(appDir, 'binaries')
  if (existsSync(realBinaries) && !existsSync(sandboxBinaries)) {
    symlinkSync(realBinaries, sandboxBinaries, 'dir')
    console.log('[sandbox] binaries linked from', realBinaries)
  }
  console.log('[sandbox] onboarding marked complete')
}

const child = spawn(
  process.execPath,
  [join(repo, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev'],
  {
    cwd: repo,
    stdio: 'inherit',
    env: {
      ...process.env,
      HOME: sandboxHome,
      USERPROFILE: sandboxHome,
      XDG_CONFIG_HOME: join(sandboxHome, '.config'),
      LLAMA_STUDIO_SANDBOX: '1', // the app turns automatic tours off when set
    },
  },
)
child.on('exit', code => process.exit(code ?? 0))
