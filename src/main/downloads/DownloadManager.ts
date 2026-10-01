import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { mkdir, rename, unlink, rm, stat } from 'fs/promises'
import { dirname } from 'path'
import { existsSync } from 'fs'
import { createHash } from 'crypto'
import { randomUUID } from 'crypto'

import type {
  DownloadJob,
  DownloadState,
  EnqueueSpec,
  DownloadProgressEvent,
  DownloadStateEvent,
  DownloadDoneEvent
} from '../../core/downloads/types'

import {
  insertJob,
  updateJob,
  listJobs,
  getJob as getJobRow,
  deleteJob,
  pruneOldFinished
} from './repo'

import {
  streamToPart,
  readPartMeta,
  writePartMeta,
  deletePartMeta,
  partExistingBytes,
  hashFromFile,
  backoffDelayMs
} from './download-utils'

import { verifyGGUFMagic, extractZipTo } from './verifiers'
import { auditGgufFile } from '../../core/security/gguf-auditor'

const MAX_CONCURRENT = 2
const PROGRESS_DB_INTERVAL_MS = 2000
const HISTORY_RETENTION_DAYS = 7

interface RunningJob {
  job: DownloadJob
  abort: AbortController
  lastDbWriteAt: number
}

export class DownloadManager {
  private static instance: DownloadManager | null = null
  private jobs: Map<string, DownloadJob> = new Map()
  private running: Map<string, RunningJob> = new Map()
  private initialized = false
  /** In-process events for main-side subscribers. Channels: 'done' | 'failed'. */
  readonly events = new EventEmitter()

  static getInstance(): DownloadManager {
    if (!this.instance) this.instance = new DownloadManager()
    return this.instance
  }

  init(): void {
    if (this.initialized) return
    pruneOldFinished(HISTORY_RETENTION_DAYS)
    for (const job of listJobs()) {
      // Crash recovery: anything that was mid-flight becomes paused so the
      // user can decide to resume.
      if (
        job.state === 'downloading' ||
        job.state === 'verifying' ||
        job.state === 'extracting'
      ) {
        job.state = 'paused'
        updateJob({ ...job, updatedAt: new Date().toISOString() })
      }
      this.jobs.set(job.id, job)
    }
    this.initialized = true
    this.broadcastList()
    this.tick()
  }

  // ─── Public API ─────────────────────────────────────────────────────

  enqueue(spec: EnqueueSpec): string {
    const id = spec.id ?? randomUUID()
    if (this.jobs.has(id)) return id // idempotent
    const now = new Date().toISOString()
    const job: DownloadJob = {
      id,
      kind: spec.kind,
      displayName: spec.displayName,
      url: spec.url,
      targetPath: spec.targetPath,
      partPath: `${spec.targetPath}.part`,
      metaPath: `${spec.targetPath}.part.json`,
      extractZip: !!spec.extractZip,
      bytesTotal: null,
      bytesDone: 0,
      state: 'queued',
      errorMessage: null,
      attempts: 0,
      maxAttempts: spec.maxAttempts ?? 5,
      sha256Expected: spec.sha256Expected ?? null,
      sha256Actual: null,
      etag: null,
      extra: spec.extra ?? null,
      createdAt: now,
      updatedAt: now
    }
    insertJob(job)
    this.jobs.set(id, job)
    this.emitState(job)
    this.broadcastList()
    this.tick()
    return id
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    const running = this.running.get(id)
    if (running) {
      running.abort.abort()
    }
    this.transition(job, 'cancelled')
  }

  pause(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    const running = this.running.get(id)
    if (running) {
      running.abort.abort()
    }
    if (job.state === 'queued' || job.state === 'downloading') {
      this.transition(job, 'paused')
    }
  }

  resume(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    if (job.state === 'paused' || job.state === 'failed') {
      job.attempts = 0
      job.errorMessage = null
      this.transition(job, 'queued')
      this.tick()
    }
  }

  remove(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    if (this.running.has(id)) return // can't remove an active job
    deleteJob(id)
    this.jobs.delete(id)
    this.broadcastList()
  }

  clearFinished(): void {
    for (const job of [...this.jobs.values()]) {
      if (job.state === 'done' || job.state === 'failed' || job.state === 'cancelled') {
        deleteJob(job.id)
        this.jobs.delete(job.id)
      }
    }
    this.broadcastList()
  }

  list(): DownloadJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getJob(id: string): DownloadJob | null {
    return this.jobs.get(id) ?? null
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private tick(): void {
    if (this.running.size >= MAX_CONCURRENT) return
    const next = [...this.jobs.values()].find(j => j.state === 'queued')
    if (!next) return
    this.start(next).catch(err => {
      console.error('[DownloadManager] start failed', err)
    })
    if (this.running.size < MAX_CONCURRENT) this.tick()
  }

  private async start(job: DownloadJob): Promise<void> {
    const abort = new AbortController()
    this.running.set(job.id, { job, abort, lastDbWriteAt: 0 })
    this.transition(job, 'downloading')

    try {
      await this.runJob(job, abort.signal)
    } catch (err: any) {
      if (job.state === 'cancelled' || job.state === 'paused') {
        // user-driven exit, no failure
      } else {
        await this.handleFailure(job, err)
      }
    } finally {
      this.running.delete(job.id)
      this.tick()
    }
  }

  private async runJob(job: DownloadJob, signal: AbortSignal): Promise<void> {
    await mkdir(dirname(job.targetPath), { recursive: true })

    // Resume detection
    let fromByte = partExistingBytes(job.partPath)
    let hash = createHash('sha256')
    const meta = await readPartMeta(job.metaPath)
    if (fromByte > 0 && meta && meta.bytesDone === fromByte) {
      // Reseed hash with what's already on disk
      hash = await hashFromFile(job.partPath)
    } else if (fromByte > 0) {
      // No matching meta — start over
      fromByte = 0
      await unlink(job.partPath).catch(() => {})
    }

    job.bytesDone = fromByte
    this.persistProgress(job, true)

    let stalled = false
    const result = await streamToPart(
      {
        url: job.url,
        partPath: job.partPath,
        fromByte,
        signal,
        onProgress: (bytesDone, bytesTotal) => {
          job.bytesDone = bytesDone
          if (bytesTotal !== null) job.bytesTotal = bytesTotal
          this.emitProgress(job)
          this.persistProgress(job, false)
          // Persist resume meta periodically
          writePartMeta(job.metaPath, {
            url: job.url,
            etag: job.etag,
            bytesDone,
            sha256Partial: null
          }).catch(() => {})
        },
        onStall: () => {
          if (stalled) return
          stalled = true
          if (!signal.aborted) this.running.get(job.id)?.abort.abort()
        }
      },
      hash
    )

    if (stalled) throw new Error('Download stalled (no progress for 60s)')

    job.etag = result.etag
    if (result.totalBytes !== null) job.bytesTotal = result.totalBytes

    // Verify size if we know the total
    if (job.bytesTotal !== null && job.bytesDone < job.bytesTotal) {
      throw new Error('Stream ended before all bytes were received')
    }

    // Verify
    this.transition(job, 'verifying')
    const computedSha = result.hash.digest('hex')
    job.sha256Actual = computedSha

    if (job.sha256Expected && computedSha.toLowerCase() !== job.sha256Expected.toLowerCase()) {
      // Corrupt — wipe part and let the failure handler retry from zero
      await unlink(job.partPath).catch(() => {})
      await deletePartMeta(job.metaPath)
      throw new Error('Checksum mismatch')
    }

    if (job.kind === 'model') {
      // Fast 4-byte pre-check before handing the file to the full parser
      const magicOk = await verifyGGUFMagic(job.partPath)
      if (!magicOk) throw new Error('Not a GGUF file')

      // Full structural audit (version bounds, tensor/KV counts, BigInt-safe,
      // file-size plausibility, parser crash protection)
      const audit = await auditGgufFile(job.partPath)
      if (!audit.valid) throw new Error(`GGUF audit failed: ${audit.error}`)

      // Record a file-identity stamp so the launcher can detect a TOCTOU swap
      // between now (audit time) and when the model is actually loaded.
      const s = await stat(job.partPath)
      const auditStamp = { size: s.size, mtimeMs: s.mtimeMs, ino: s.ino }
      job.extra = { ...(job.extra ?? {}), auditStamp, auditMetadata: audit.metadata }
      updateJob(job)
    }

    // Extract (binaries) or atomic finalize (models)
    if (job.extractZip) {
      this.transition(job, 'extracting')
      const tmpExtractDir = `${job.targetPath}.tmp`
      await rm(tmpExtractDir, { recursive: true, force: true }).catch(() => {})
      await extractZipTo(job.partPath, tmpExtractDir)
      // Move tmp dir to final target
      if (existsSync(job.targetPath)) {
        await rm(job.targetPath, { recursive: true, force: true })
      }
      await rename(tmpExtractDir, job.targetPath)
      await unlink(job.partPath).catch(() => {})
      await deletePartMeta(job.metaPath)
    } else {
      // Atomic finalize
      if (existsSync(job.targetPath)) {
        await unlink(job.targetPath).catch(() => {})
      }
      await rename(job.partPath, job.targetPath)
      await deletePartMeta(job.metaPath)
    }

    job.bytesDone = job.bytesTotal ?? job.bytesDone
    this.transition(job, 'done')
    this.emitDone(job)
    this.events.emit('done', job)
  }

  private async handleFailure(job: DownloadJob, err: Error): Promise<void> {
    job.attempts += 1
    job.errorMessage = err?.message ?? String(err)

    const wait = backoffDelayMs(job.attempts)
    if (wait === null || job.attempts >= job.maxAttempts) {
      this.transition(job, 'failed')
      this.events.emit('failed', job)
      return
    }

    // Schedule retry as a queued job; tick() will pick it up after the wait.
    this.transition(job, 'queued')
    setTimeout(() => this.tick(), wait)
  }

  private transition(job: DownloadJob, state: DownloadState): void {
    job.state = state
    job.updatedAt = new Date().toISOString()
    updateJob(job)
    this.emitState(job)
  }

  private persistProgress(job: DownloadJob, force: boolean): void {
    const r = this.running.get(job.id)
    const now = Date.now()
    if (!force && r && now - r.lastDbWriteAt < PROGRESS_DB_INTERVAL_MS) return
    if (r) r.lastDbWriteAt = now
    job.updatedAt = new Date().toISOString()
    updateJob(job)
  }

  // ─── Event broadcast ────────────────────────────────────────────────

  private send(channel: string, payload: unknown): void {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(channel, payload)
    }
  }

  private emitProgress(job: DownloadJob): void {
    const evt: DownloadProgressEvent = {
      id: job.id,
      bytesDone: job.bytesDone,
      bytesTotal: job.bytesTotal,
      state: job.state
    }
    this.send('download:progress', evt)
  }

  private emitState(job: DownloadJob): void {
    const evt: DownloadStateEvent = {
      id: job.id,
      state: job.state,
      errorMessage: job.errorMessage,
      attempts: job.attempts
    }
    this.send('download:state', evt)
    this.broadcastList()
  }

  private emitDone(job: DownloadJob): void {
    const evt: DownloadDoneEvent = { id: job.id, targetPath: job.targetPath }
    this.send('download:done', evt)
  }

  private broadcastList(): void {
    this.send('download:list', this.list())
  }
}

// Re-export DB query so IPC can read without re-importing repo.
export { getJobRow }
