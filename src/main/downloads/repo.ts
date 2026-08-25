import { db } from '../db'
import type { DownloadJob, DownloadState } from '../../core/downloads/types'

interface Row {
  id: string
  kind: string
  display_name: string
  url: string
  target_path: string
  part_path: string
  meta_path: string
  extract_zip: number
  bytes_total: number | null
  bytes_done: number
  state: string
  error_message: string | null
  attempts: number
  max_attempts: number
  sha256_expected: string | null
  sha256_actual: string | null
  etag: string | null
  extra: string | null
  created_at: string
  updated_at: string
}

function rowToJob(r: Row): DownloadJob {
  return {
    id: r.id,
    kind: r.kind as DownloadJob['kind'],
    displayName: r.display_name,
    url: r.url,
    targetPath: r.target_path,
    partPath: r.part_path,
    metaPath: r.meta_path,
    extractZip: !!r.extract_zip,
    bytesTotal: r.bytes_total,
    bytesDone: r.bytes_done,
    state: r.state as DownloadState,
    errorMessage: r.error_message,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    sha256Expected: r.sha256_expected,
    sha256Actual: r.sha256_actual,
    etag: r.etag,
    extra: r.extra ? JSON.parse(r.extra) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function insertJob(job: DownloadJob): void {
  db.prepare(`
    INSERT INTO downloads (
      id, kind, display_name, url, target_path, part_path, meta_path, extract_zip,
      bytes_total, bytes_done, state, error_message, attempts, max_attempts,
      sha256_expected, sha256_actual, etag, extra, created_at, updated_at
    ) VALUES (
      @id, @kind, @display_name, @url, @target_path, @part_path, @meta_path, @extract_zip,
      @bytes_total, @bytes_done, @state, @error_message, @attempts, @max_attempts,
      @sha256_expected, @sha256_actual, @etag, @extra, @created_at, @updated_at
    )
  `).run({
    id: job.id,
    kind: job.kind,
    display_name: job.displayName,
    url: job.url,
    target_path: job.targetPath,
    part_path: job.partPath,
    meta_path: job.metaPath,
    extract_zip: job.extractZip ? 1 : 0,
    bytes_total: job.bytesTotal,
    bytes_done: job.bytesDone,
    state: job.state,
    error_message: job.errorMessage,
    attempts: job.attempts,
    max_attempts: job.maxAttempts,
    sha256_expected: job.sha256Expected,
    sha256_actual: job.sha256Actual,
    etag: job.etag,
    extra: job.extra ? JSON.stringify(job.extra) : null,
    created_at: job.createdAt,
    updated_at: job.updatedAt
  })
}

export function updateJob(job: DownloadJob): void {
  db.prepare(`
    UPDATE downloads SET
      display_name = @display_name,
      bytes_total = @bytes_total,
      bytes_done = @bytes_done,
      state = @state,
      error_message = @error_message,
      attempts = @attempts,
      sha256_actual = @sha256_actual,
      etag = @etag,
      updated_at = @updated_at
    WHERE id = @id
  `).run({
    id: job.id,
    display_name: job.displayName,
    bytes_total: job.bytesTotal,
    bytes_done: job.bytesDone,
    state: job.state,
    error_message: job.errorMessage,
    attempts: job.attempts,
    sha256_actual: job.sha256Actual,
    etag: job.etag,
    updated_at: job.updatedAt
  })
}

export function listJobs(): DownloadJob[] {
  const rows = db.prepare('SELECT * FROM downloads ORDER BY created_at DESC').all() as Row[]
  return rows.map(rowToJob)
}

export function getJob(id: string): DownloadJob | null {
  const row = db.prepare('SELECT * FROM downloads WHERE id = ?').get(id) as Row | undefined
  return row ? rowToJob(row) : null
}

export function deleteJob(id: string): void {
  db.prepare('DELETE FROM downloads WHERE id = ?').run(id)
}

export function pruneOldFinished(olderThanDays: number): void {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
  db.prepare(`
    DELETE FROM downloads
    WHERE state IN ('done', 'failed', 'cancelled') AND updated_at < ?
  `).run(cutoff)
}
