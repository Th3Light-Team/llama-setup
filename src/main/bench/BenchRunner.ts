import { BrowserWindow } from 'electron'
import { ChildProcess, spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { basename } from 'path'

import type { BenchJob, BenchSpec, BenchState } from '../../core/bench/types'
import { resolveLlamaBinary } from '../../core/launcher/binary-resolver'
import { specToArgs } from '../../core/bench/defaults'
import { parseBenchOutput } from '../../core/bench/parser'
import { insertJob, updateJob, listJobs, getJob, deleteJob, pruneOldFinished } from './repo'

const HISTORY_RETENTION_DAYS = 30
/** Cap individual job logs to keep DB rows small and renderer responsive. */
const MAX_LOG_BYTES = 256 * 1024

/**
 * BenchRunner — singleton that spawns llama-bench, captures progress, and
 * persists results.  Mirrors DownloadManager's shape so the UI patterns
 * (queue + sidebar + per-job details) work the same way.
 *
 * One bench at a time (concurrent runs would compete for the GPU and skew
 * results, defeating the point).
 */
export class BenchRunner {
  private static instance: BenchRunner | null = null
  private jobs: Map<string, BenchJob> = new Map()
  private active: { job: BenchJob; process: ChildProcess; killTimer: NodeJS.Timeout | null } | null = null
  private initialized = false

  static getInstance(): BenchRunner {
    if (!this.instance) this.instance = new BenchRunner()
    return this.instance
  }

  init(): void {
    if (this.initialized) return
    pruneOldFinished(HISTORY_RETENTION_DAYS)
    for (const job of listJobs()) {
      // Crash recovery: anything mid-flight at last shutdown becomes failed.
      if (job.state === 'queued' || job.state === 'running') {
        job.state = 'failed'
        job.errorMessage = 'Interrupted by app restart'
        updateJob(job)
      }
      this.jobs.set(job.id, job)
    }
    this.initialized = true
    this.broadcastList()
  }

  // ─── Public API ─────────────────────────────────────────────────────

  enqueue(spec: BenchSpec): string {
    const id = randomUUID()
    const now = new Date().toISOString()
    const displayName = spec.displayName ?? basename(spec.modelPath)
    const job: BenchJob = {
      id,
      modelPath: spec.modelPath,
      displayName,
      installPath: spec.installPath,
      spec,
      state: 'queued',
      progress: 0,
      log: '',
      result: null,
      errorMessage: null,
      exitCode: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
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
    if (this.active?.job.id === id) {
      // Terminate; the close handler will mark cancelled.
      this.active.process.kill()
      job.state = 'cancelled'
    } else if (job.state === 'queued') {
      job.state = 'cancelled'
      job.finishedAt = new Date().toISOString()
      this.persist(job)
    }
  }

  remove(id: string): void {
    if (this.active?.job.id === id) return // can't remove a running job
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

  list(): BenchJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  get(id: string): BenchJob | null {
    return this.jobs.get(id) ?? null
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private tick(): void {
    if (this.active) return
    const next = [...this.jobs.values()].find(j => j.state === 'queued')
    if (!next) return
    this.start(next)
  }

  private start(job: BenchJob): void {
    const binary = resolveLlamaBinary(job.installPath, 'llama-bench')
    if (!binary) {
      job.state = 'failed'
      job.errorMessage = `llama-bench not found inside ${job.installPath}`
      job.finishedAt = new Date().toISOString()
      this.persist(job)
      return
    }

    const args = specToArgs(job.spec)
    job.state = 'running'
    job.startedAt = new Date().toISOString()
    job.log = `$ ${binary} ${args.join(' ')}\n`
    this.persist(job)

    let proc: ChildProcess
    try {
      proc = spawn(binary, args, {
        cwd: job.installPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })
    } catch (err) {
      job.state = 'failed'
      job.errorMessage = err instanceof Error ? err.message : String(err)
      job.finishedAt = new Date().toISOString()
      this.persist(job)
      this.tick()
      return
    }

    // Hard timeout — kill -9 the process if it runs over budget.
    const timeoutMs = job.spec.timeoutMs ?? 5 * 60 * 1000
    const killTimer = setTimeout(() => {
      if (this.active?.job.id !== job.id) return
      job.errorMessage = `Bench exceeded ${Math.round(timeoutMs / 1000)}s budget`
      proc.kill('SIGKILL')
    }, timeoutMs)

    this.active = { job, process: proc, killTimer }

    let stdoutBuf = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdoutBuf += text
      this.appendLog(job, text)
      this.bumpProgressFromOutput(job, stdoutBuf)
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      this.appendLog(job, chunk.toString())
    })

    proc.on('error', (err) => {
      job.errorMessage = err.message
    })

    proc.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer)
      job.exitCode = code
      job.finishedAt = new Date().toISOString()

      const parsed = parseBenchOutput(stdoutBuf)

      if (job.state === 'cancelled') {
        // user-driven exit; state already set
      } else if (parsed) {
        // Treat any run that produced parseable results as successful, even
        // if exit code is non-zero (some llama-bench builds exit 1 after
        // printing a deprecation notice while still emitting valid JSON).
        job.state = 'done'
        job.result = parsed
        job.progress = 100
      } else if (code === 0) {
        job.state = 'failed'
        job.errorMessage = job.errorMessage ?? 'No bench results parsed from output'
      } else {
        job.state = 'failed'
        job.errorMessage = job.errorMessage ?? `llama-bench exited with code ${code}`
      }
      this.persist(job)
      this.active = null
      this.tick()
    })
  }

  /**
   * Estimate progress from llama-bench's own status lines.  Without
   * `--progress` (which we don't pass to keep output clean for the parser)
   * we lean on the warm-up + per-test "main:" markers it prints.  This is
   * approximate — the UI shows it as a bar, not a number.
   */
  private bumpProgressFromOutput(job: BenchJob, stdoutSoFar: string): void {
    const totalTests = (job.spec.prompts?.length ?? 0) + (job.spec.generations?.length ?? 0)
    if (totalTests === 0) return
    // Each completed test JSON row ends with a closing brace at line start.
    const completed = (stdoutSoFar.match(/^\s*\},?\s*$/gm) ?? []).length
    const pct = Math.min(95, Math.round((completed / totalTests) * 100))
    if (pct !== job.progress) {
      job.progress = pct
      this.emitProgress(job)
    }
  }

  private appendLog(job: BenchJob, text: string): void {
    job.log = (job.log + text).slice(-MAX_LOG_BYTES)
    this.emitProgress(job)
  }

  private persist(job: BenchJob): void {
    updateJob(job)
    this.emitState(job)
    this.broadcastList()
  }

  // ─── Event broadcast ────────────────────────────────────────────────

  private send(channel: string, payload: unknown): void {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(channel, payload)
    }
  }

  private emitProgress(job: BenchJob): void {
    this.send('bench:progress', { id: job.id, progress: job.progress, log: job.log })
  }

  private emitState(job: BenchJob): void {
    this.send('bench:state', {
      id: job.id, state: job.state, errorMessage: job.errorMessage, exitCode: job.exitCode,
    })
  }

  private broadcastList(): void {
    this.send('bench:list', this.list())
  }
}

/** Cast through unknown so non-Node consumers (renderer types) can ignore the internal state. */
export type { BenchJob, BenchSpec, BenchState } from '../../core/bench/types'
