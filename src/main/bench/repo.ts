import { db } from '../db'
import type { BenchJob, BenchState } from '../../core/bench/types'

interface Row {
  id: string
  model_path: string
  display_name: string
  install_path: string
  spec: string
  state: string
  progress: number
  log: string
  result: string | null
  error_message: string | null
  exit_code: number | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

function rowToJob(r: Row): BenchJob {
  return {
    id: r.id,
    modelPath: r.model_path,
    displayName: r.display_name,
    installPath: r.install_path,
    spec: JSON.parse(r.spec),
    state: r.state as BenchState,
    progress: r.progress,
    log: r.log,
    result: r.result ? JSON.parse(r.result) : null,
    errorMessage: r.error_message,
    exitCode: r.exit_code,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    createdAt: r.created_at,
  }
}

export function insertJob(job: BenchJob): void {
  db.prepare(`
    INSERT INTO bench_runs (
      id, model_path, display_name, install_path, spec, state, progress, log,
      result, error_message, exit_code, started_at, finished_at, created_at
    ) VALUES (
      @id, @model_path, @display_name, @install_path, @spec, @state, @progress, @log,
      @result, @error_message, @exit_code, @started_at, @finished_at, @created_at
    )
  `).run({
    id: job.id,
    model_path: job.modelPath,
    display_name: job.displayName,
    install_path: job.installPath,
    spec: JSON.stringify(job.spec),
    state: job.state,
    progress: job.progress,
    log: job.log,
    result: job.result ? JSON.stringify(job.result) : null,
    error_message: job.errorMessage,
    exit_code: job.exitCode,
    started_at: job.startedAt,
    finished_at: job.finishedAt,
    created_at: job.createdAt,
  })
}

export function updateJob(job: BenchJob): void {
  db.prepare(`
    UPDATE bench_runs SET
      state = @state,
      progress = @progress,
      log = @log,
      result = @result,
      error_message = @error_message,
      exit_code = @exit_code,
      started_at = @started_at,
      finished_at = @finished_at
    WHERE id = @id
  `).run({
    id: job.id,
    state: job.state,
    progress: job.progress,
    log: job.log,
    result: job.result ? JSON.stringify(job.result) : null,
    error_message: job.errorMessage,
    exit_code: job.exitCode,
    started_at: job.startedAt,
    finished_at: job.finishedAt,
  })
}

export function listJobs(): BenchJob[] {
  const rows = db.prepare('SELECT * FROM bench_runs ORDER BY created_at DESC').all() as Row[]
  return rows.map(rowToJob)
}

export function getJob(id: string): BenchJob | null {
  const row = db.prepare('SELECT * FROM bench_runs WHERE id = ?').get(id) as Row | undefined
  return row ? rowToJob(row) : null
}

export function deleteJob(id: string): void {
  db.prepare('DELETE FROM bench_runs WHERE id = ?').run(id)
}

export function pruneOldFinished(olderThanDays: number): void {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(`
    DELETE FROM bench_runs
    WHERE state IN ('done', 'failed', 'cancelled') AND created_at < ?
  `).run(cutoff)
}
