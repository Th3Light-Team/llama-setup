import { join } from 'path'
import { homedir } from 'os'
import { readdir, rename, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { db } from '../../main/db'
import { DownloadManager } from '../../main/downloads/DownloadManager'
import { InstallRecord, ParsedAsset } from './types'
import { cudaVersionOfBackend } from './cuda'
import { hasSystemCudaRuntime } from './cuda-runtime'

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
export function installBinary(tag: string, asset: ParsedAsset, runtime?: ParsedAsset | null): string {
  const installId = `${tag}-${asset.backend}-${asset.arch}`
  const targetDir = join(BINARIES_DIR, installId)

  if (existsSync(targetDir)) {
    throw new Error('Binary already installed')
  }

  // CUDA engine builds do not ship cudart/cuBLAS. Fetch the matching runtime
  // bundle too, unless this machine already has that CUDA version installed.
  let needsRuntime = false
  if (runtime) {
    if (runtime.os !== asset.os || runtime.arch !== asset.arch || runtime.backend !== asset.backend) {
      throw new Error(`CUDA runtime ${runtime.filename} does not match ${asset.filename}`)
    }
    const v = cudaVersionOfBackend(asset.backend)
    needsRuntime = !(v && hasSystemCudaRuntime(v))
  }

  const mgr = DownloadManager.getInstance()
  const id = mgr.enqueue({
    id: `binary:${installId}`,
    kind: 'binary',
    displayName: `${tag} · ${asset.backend} (${asset.arch})`,
    url: asset.url,
    targetPath: targetDir,
    extractZip: true,
    extra: {
      installId, tag, backend: asset.backend, arch: asset.arch,
      ...(needsRuntime ? { runtimeJobId: runtimeJobId(installId) } : {})
    }
  })

  if (needsRuntime && runtime) {
    // Downloaded in parallel into a sibling dir; merged once both jobs are done.
    mgr.enqueue({
      id: runtimeJobId(installId),
      kind: 'binary',
      displayName: `${tag} · CUDA runtime (${runtime.backend.replace('cuda-cu', '')})`,
      url: runtime.url,
      targetPath: runtimeDir(installId),
      extractZip: true,
      extra: { runtimeOf: installId, tag }
    })
  }

  return id
}

const runtimeJobId = (installId: string) => `binary:${installId}:runtime`
const runtimeDir = (installId: string) => join(BINARIES_DIR, `${installId}.runtime`)

export async function uninstallBinary(id: string): Promise<void> {
  const targetDir = join(BINARIES_DIR, id)
  await rm(targetDir, { recursive: true, force: true })
  db.prepare('DELETE FROM installs WHERE id = ?').run(id)
}

/**
 * Hook invoked once at app startup: when a binary download completes,
 * register the installed binary in the `installs` table.
 */
export function registerBinaryInstallHooks(onInstalled?: (installId: string) => void): void {
  const mgr = DownloadManager.getInstance()
  const finalizing = new Set<string>()

  function register(job: import('../downloads/types').DownloadJob): void {
    const extra = job.extra as { installId?: string; tag?: string; backend?: string } | null
    if (!extra?.installId || !extra.tag || !extra.backend) return
    const exists = db.prepare('SELECT 1 FROM installs WHERE id = ?').get(extra.installId)
    if (exists) return
    db.prepare(`
      INSERT INTO installs (id, tag, backend, install_date, verified, path)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(extra.installId, extra.tag, extra.backend, new Date().toISOString(), job.targetPath)
  }

  /** Both the engine and its CUDA runtime are downloaded: merge the runtime next to the engine, then register. */
  async function finalizeWithRuntime(installId: string): Promise<void> {
    const primary = mgr.getJob(`binary:${installId}`)
    const runtime = mgr.getJob(runtimeJobId(installId))
    if (!primary || !runtime || primary.state !== 'done' || runtime.state !== 'done') return
    if (finalizing.has(installId)) return
    finalizing.add(installId)
    try {
      const src = runtimeDir(installId)
      for (const name of await readdir(src)) {
        const dest = join(primary.targetPath, name)
        await rm(dest, { recursive: true, force: true })
        await rename(join(src, name), dest)
      }
      await rm(src, { recursive: true, force: true })
      register(primary)
      onInstalled?.(installId)
    } catch (err) {
      console.error(`Failed to install CUDA runtime for ${installId}:`, err)
      await rm(primary.targetPath, { recursive: true, force: true }).catch(() => {})
    } finally {
      finalizing.delete(installId)
    }
  }

  mgr.events.on('done', (job: import('../downloads/types').DownloadJob) => {
    if (job.kind !== 'binary') return
    const extra = job.extra as { installId?: string; runtimeOf?: string; runtimeJobId?: string } | null
    if (extra?.runtimeOf) { void finalizeWithRuntime(extra.runtimeOf); return }
    if (!extra?.installId) return
    if (extra.runtimeJobId) void finalizeWithRuntime(extra.installId)
    else { register(job); onInstalled?.(extra.installId) }
  })

  // If either half of a CUDA install fails for good, drop the other half too
  // so a retry starts from a clean slate instead of "already installed".
  mgr.events.on('failed', (job: import('../downloads/types').DownloadJob) => {
    if (job.kind !== 'binary') return
    const extra = job.extra as { installId?: string; runtimeOf?: string; runtimeJobId?: string } | null
    const installId = extra?.runtimeOf ?? (extra?.runtimeJobId ? extra.installId : undefined)
    if (!installId) return
    for (const sibling of [`binary:${installId}`, runtimeJobId(installId)]) {
      if (sibling !== job.id) mgr.cancel(sibling)
    }
    void rm(join(BINARIES_DIR, installId), { recursive: true, force: true })
    void rm(runtimeDir(installId), { recursive: true, force: true })
  })
}
