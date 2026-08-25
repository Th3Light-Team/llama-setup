import { join } from 'path'
import { homedir } from 'os'
import { rm } from 'fs/promises'
import { existsSync } from 'fs'
import { db } from '../../main/db'
import { DownloadManager } from '../../main/downloads/DownloadManager'
import { InstallRecord, ParsedAsset } from './types'

const APP_DIR = join(homedir(), '.llama-studio')
const BINARIES_DIR = join(APP_DIR, 'binaries')

export async function getInstalledBinaries(): Promise<InstallRecord[]> {
  const stmt = db.prepare('SELECT * FROM installs ORDER BY install_date DESC')
  return stmt.all() as InstallRecord[]
}

/**
 * Enqueue a binary install via the unified DownloadManager. Returns the
 * download job id; progress and completion are surfaced through the
 * downloads drawer. The DB row in `installs` is created when the job
 * finishes successfully.
 */
export function installBinary(tag: string, asset: ParsedAsset): string {
  const installId = `${tag}-${asset.backend}-${asset.arch}`
  const targetDir = join(BINARIES_DIR, installId)

  if (existsSync(targetDir)) {
    throw new Error('Binary already installed')
  }

  const mgr = DownloadManager.getInstance()
  const id = mgr.enqueue({
    id: `binary:${installId}`,
    kind: 'binary',
    displayName: `${tag} · ${asset.backend} (${asset.arch})`,
    url: asset.url,
    targetPath: targetDir,
    extractZip: true,
    extra: { installId, tag, backend: asset.backend, arch: asset.arch }
  })

  return id
}

export async function uninstallBinary(id: string): Promise<void> {
  const targetDir = join(BINARIES_DIR, id)
  await rm(targetDir, { recursive: true, force: true })
  db.prepare('DELETE FROM installs WHERE id = ?').run(id)
}

/**
 * Hook invoked once at app startup: when a binary download completes,
 * register the installed binary in the `installs` table.
 */
export function registerBinaryInstallHooks(): void {
  const mgr = DownloadManager.getInstance()
  mgr.events.on('done', (job: import('../downloads/types').DownloadJob) => {
    if (job.kind !== 'binary') return
    const extra = job.extra as { installId?: string; tag?: string; backend?: string } | null
    if (!extra?.installId || !extra.tag || !extra.backend) return
    const exists = db.prepare('SELECT 1 FROM installs WHERE id = ?').get(extra.installId)
    if (exists) return
    db.prepare(`
      INSERT INTO installs (id, tag, backend, install_date, verified, path)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(extra.installId, extra.tag, extra.backend, new Date().toISOString(), job.targetPath)
  })
}
