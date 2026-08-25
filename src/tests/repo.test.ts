import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './__mocks__/db'

// Import after the mock DB is created — repo.ts will use the in-memory db
import {
  insertJob,
  updateJob,
  listJobs,
  getJob,
  deleteJob,
  pruneOldFinished
} from '../main/downloads/repo'

import type { DownloadJob } from '../core/downloads/types'

function makeJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  const now = new Date().toISOString()
  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
    kind: 'model',
    displayName: 'Test Model',
    url: 'https://example.com/model.gguf',
    targetPath: '/tmp/model.gguf',
    partPath: '/tmp/model.gguf.part',
    metaPath: '/tmp/model.gguf.part.json',
    extractZip: false,
    bytesTotal: null,
    bytesDone: 0,
    state: 'queued',
    errorMessage: null,
    attempts: 0,
    maxAttempts: 5,
    sha256Expected: null,
    sha256Actual: null,
    etag: null,
    extra: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

// ─── insertJob ───────────────────────────────────────────────────────────────

describe('insertJob', () => {
  it('inserts a job and getJob retrieves it correctly', () => {
    const job = makeJob()
    insertJob(job)
    const got = getJob(job.id)
    expect(got).not.toBeNull()
    expect(got!.id).toBe(job.id)
    expect(got!.displayName).toBe(job.displayName)
    expect(got!.state).toBe('queued')
    expect(got!.extractZip).toBe(false)
    expect(got!.extra).toBeNull()
  })

  it('stores and retrieves a non-null extra object', () => {
    const extra = { modelId: 'abc/def', filename: 'model.gguf' }
    const job = makeJob({ extra })
    insertJob(job)
    const got = getJob(job.id)
    expect(got!.extra).toEqual(extra)
  })

  it('stores and retrieves extractZip = true', () => {
    const job = makeJob({ extractZip: true, kind: 'binary' })
    insertJob(job)
    const got = getJob(job.id)
    expect(got!.extractZip).toBe(true)
  })

  it('stores and retrieves sha256Expected and etag', () => {
    const sha256Expected = 'a'.repeat(64)
    const etag = '"etag-value"'
    const job = makeJob({ sha256Expected, etag })
    insertJob(job)
    const got = getJob(job.id)
    expect(got!.sha256Expected).toBe(sha256Expected)
    expect(got!.etag).toBe(etag)
  })

  it('throws on duplicate id (PRIMARY KEY constraint)', () => {
    const job = makeJob()
    insertJob(job)
    expect(() => insertJob(job)).toThrow()
  })
})

// ─── updateJob ───────────────────────────────────────────────────────────────

describe('updateJob', () => {
  it('updates mutable fields (state, bytesDone, bytesTotal)', () => {
    const job = makeJob()
    insertJob(job)

    const updated: DownloadJob = {
      ...job,
      state: 'downloading',
      bytesDone: 512_000,
      bytesTotal: 1_048_576,
      updatedAt: new Date().toISOString()
    }
    updateJob(updated)

    const got = getJob(job.id)!
    expect(got.state).toBe('downloading')
    expect(got.bytesDone).toBe(512_000)
    expect(got.bytesTotal).toBe(1_048_576)
  })

  it('updates errorMessage and attempts on failure', () => {
    const job = makeJob()
    insertJob(job)

    const updated: DownloadJob = {
      ...job,
      state: 'failed',
      attempts: 3,
      errorMessage: 'HTTP 503 Service Unavailable',
      updatedAt: new Date().toISOString()
    }
    updateJob(updated)

    const got = getJob(job.id)!
    expect(got.state).toBe('failed')
    expect(got.attempts).toBe(3)
    expect(got.errorMessage).toBe('HTTP 503 Service Unavailable')
  })

  it('updates sha256Actual', () => {
    const job = makeJob()
    insertJob(job)

    const updated: DownloadJob = {
      ...job,
      sha256Actual: 'b'.repeat(64),
      state: 'done',
      updatedAt: new Date().toISOString()
    }
    updateJob(updated)

    const got = getJob(job.id)!
    expect(got.sha256Actual).toBe('b'.repeat(64))
  })
})

// ─── listJobs ────────────────────────────────────────────────────────────────

describe('listJobs', () => {
  it('returns empty array when no jobs exist', () => {
    expect(listJobs()).toEqual([])
  })

  it('returns all inserted jobs', () => {
    const j1 = makeJob({ displayName: 'Job A' })
    const j2 = makeJob({ displayName: 'Job B', kind: 'binary' })
    insertJob(j1)
    insertJob(j2)

    const all = listJobs()
    expect(all).toHaveLength(2)
    const names = all.map(j => j.displayName)
    expect(names).toContain('Job A')
    expect(names).toContain('Job B')
  })

  it('orders results newest-first (by created_at DESC)', async () => {
    const older = makeJob({ createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' })
    const newer = makeJob({ createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z' })
    insertJob(older)
    insertJob(newer)

    const jobs = listJobs()
    expect(jobs[0].id).toBe(newer.id)
    expect(jobs[1].id).toBe(older.id)
  })
})

// ─── getJob ───────────────────────────────────────────────────────────────────

describe('getJob', () => {
  it('returns null for a non-existent id', () => {
    expect(getJob('nonexistent-id')).toBeNull()
  })

  it('returns the correct job by id', () => {
    const j1 = makeJob({ displayName: 'Alpha' })
    const j2 = makeJob({ displayName: 'Beta' })
    insertJob(j1)
    insertJob(j2)

    expect(getJob(j1.id)!.displayName).toBe('Alpha')
    expect(getJob(j2.id)!.displayName).toBe('Beta')
  })
})

// ─── deleteJob ────────────────────────────────────────────────────────────────

describe('deleteJob', () => {
  it('removes the job from the DB', () => {
    const job = makeJob()
    insertJob(job)
    expect(getJob(job.id)).not.toBeNull()

    deleteJob(job.id)
    expect(getJob(job.id)).toBeNull()
  })

  it('is a no-op when the id does not exist (no throw)', () => {
    expect(() => deleteJob('ghost-id')).not.toThrow()
  })

  it('only deletes the targeted job', () => {
    const j1 = makeJob()
    const j2 = makeJob()
    insertJob(j1)
    insertJob(j2)

    deleteJob(j1.id)
    expect(getJob(j1.id)).toBeNull()
    expect(getJob(j2.id)).not.toBeNull()
  })
})

// ─── pruneOldFinished ────────────────────────────────────────────────────────

describe('pruneOldFinished', () => {
  it('removes done/failed/cancelled jobs older than the cutoff', () => {
    const old = '2020-01-01T00:00:00.000Z'
    const j_done = makeJob({ state: 'done', updatedAt: old, createdAt: old })
    const j_failed = makeJob({ state: 'failed', updatedAt: old, createdAt: old })
    const j_cancelled = makeJob({ state: 'cancelled', updatedAt: old, createdAt: old })
    insertJob(j_done)
    insertJob(j_failed)
    insertJob(j_cancelled)

    pruneOldFinished(7) // prune jobs older than 7 days
    expect(getJob(j_done.id)).toBeNull()
    expect(getJob(j_failed.id)).toBeNull()
    expect(getJob(j_cancelled.id)).toBeNull()
  })

  it('does not remove active / queued jobs even if old', () => {
    const old = '2020-01-01T00:00:00.000Z'
    const j_queued = makeJob({ state: 'queued', updatedAt: old, createdAt: old })
    const j_paused = makeJob({ state: 'paused', updatedAt: old, createdAt: old })
    insertJob(j_queued)
    insertJob(j_paused)

    pruneOldFinished(7)
    expect(getJob(j_queued.id)).not.toBeNull()
    expect(getJob(j_paused.id)).not.toBeNull()
  })

  it('does not remove finished jobs that are newer than the cutoff', () => {
    const recent = new Date().toISOString()
    const j = makeJob({ state: 'done', updatedAt: recent, createdAt: recent })
    insertJob(j)

    pruneOldFinished(7)
    expect(getJob(j.id)).not.toBeNull()
  })
})
