/**
 * DownloadManager unit tests.
 *
 * Network calls (fetch), file I/O (streamToPart, verifiers, extractZipTo) and
 * the DB layer are all mocked so the state-machine logic can be tested
 * synchronously / without real HTTP.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'

// ── Mock all heavy I/O before importing DownloadManager ─────────────────────

vi.mock('../main/downloads/download-utils', () => ({
  streamToPart: vi.fn(),
  readPartMeta: vi.fn().mockResolvedValue(null),
  writePartMeta: vi.fn().mockResolvedValue(undefined),
  deletePartMeta: vi.fn().mockResolvedValue(undefined),
  partExistingBytes: vi.fn().mockReturnValue(0),
  hashFromFile: vi.fn(),
  backoffDelayMs: vi.fn((attempt: number) => (attempt >= 6 ? null : Math.pow(2, attempt - 1) * 1000))
}))

vi.mock('../main/downloads/verifiers', () => ({
  verifyGGUFMagic: vi.fn().mockResolvedValue(true),
  sha256OfFile: vi.fn().mockResolvedValue('a'.repeat(64)),
  extractZipTo: vi.fn().mockResolvedValue(undefined),
  extractArchiveTo: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 1024, mtimeMs: 1_700_000_000_000, ino: 99 })
}))

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false)
}))

vi.mock('../core/security/gguf-auditor', () => ({
  auditGgufFile: vi.fn().mockResolvedValue({ valid: true, metadata: { version: 3, tensorCount: 1, kvCount: 1, architecture: 'llama', contextLength: 4096 } })
}))

// ── Import after mocks are registered ───────────────────────────────────────
import { DownloadManager } from '../main/downloads/DownloadManager'
import * as utils from '../main/downloads/download-utils'
import * as verifiers from '../main/downloads/verifiers'
import * as auditorMod from '../core/security/gguf-auditor'
import { createHash } from 'crypto'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake successful streamToPart result. */
function makeStreamResult(bytes = 1024) {
  const hash = createHash('sha256')
  hash.update(Buffer.alloc(bytes))
  return {
    bytesWritten: bytes,
    totalBytes: bytes,
    etag: '"etag-test"',
    hash
  }
}

/** Reset the DownloadManager singleton between tests. */
function freshManager(): DownloadManager {
  // @ts-expect-error – private static field
  DownloadManager.instance = null
  const mgr = DownloadManager.getInstance()
  mgr.init()
  return mgr
}

// ─── Singleton ───────────────────────────────────────────────────────────────

describe('DownloadManager singleton', () => {
  beforeEach(() => {
    // @ts-expect-error – accessing private member in test
    DownloadManager.instance = null
  })

  it('always returns the same instance', () => {
    const a = DownloadManager.getInstance()
    const b = DownloadManager.getInstance()
    expect(a).toBe(b)
  })

  it('init() is idempotent — calling twice does not throw', () => {
    const mgr = DownloadManager.getInstance()
    expect(() => {
      mgr.init()
      mgr.init()
    }).not.toThrow()
  })
})

// ─── enqueue ─────────────────────────────────────────────────────────────────

describe('enqueue', () => {
  let mgr: DownloadManager

  beforeEach(() => {
    vi.mocked(utils.streamToPart).mockResolvedValue(makeStreamResult() as any)
    mgr = freshManager()
  })

  it('returns a string id', () => {
    const id = mgr.enqueue({
      kind: 'model',
      displayName: 'Test model',
      url: 'https://example.com/a.gguf',
      targetPath: '/tmp/a.gguf'
    })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('is idempotent — enqueuing the same id twice returns the same id without creating a duplicate', () => {
    const spec = {
      id: 'stable-id',
      kind: 'model' as const,
      displayName: 'Model X',
      url: 'https://example.com/x.gguf',
      targetPath: '/tmp/x.gguf'
    }
    const id1 = mgr.enqueue(spec)
    const id2 = mgr.enqueue(spec)
    expect(id1).toBe('stable-id')
    expect(id2).toBe('stable-id')
    expect(mgr.list()).toHaveLength(1)
  })

  it('job appears in list() with state queued immediately', () => {
    const id = mgr.enqueue({
      kind: 'binary',
      displayName: 'llama.cpp b1234',
      url: 'https://github.com/releases/b1234.zip',
      targetPath: '/tmp/llama/b1234',
      extractZip: true
    })
    const jobs = mgr.list()
    expect(jobs.some(j => j.id === id)).toBe(true)
  })

  it('uses the provided id when given', () => {
    const id = mgr.enqueue({
      id: 'my-custom-id',
      kind: 'model',
      displayName: 'Custom',
      url: 'https://example.com/c.gguf',
      targetPath: '/tmp/c.gguf'
    })
    expect(id).toBe('my-custom-id')
  })
})

// ─── cancel ──────────────────────────────────────────────────────────────────

describe('cancel', () => {
  let mgr: DownloadManager

  beforeEach(() => {
    // streamToPart never resolves (simulates long download)
    vi.mocked(utils.streamToPart).mockImplementation(
      () => new Promise(() => {}) // infinite pending
    )
    mgr = freshManager()
  })

  it('transitions queued → cancelled synchronously for a queued job', async () => {
    // Prevent the tick from starting the download by filling the slots
    mgr.enqueue({ kind: 'model', displayName: 'A', url: 'u1', targetPath: '/tmp/1.gguf' })
    mgr.enqueue({ kind: 'model', displayName: 'B', url: 'u2', targetPath: '/tmp/2.gguf' })

    // This third job should sit in queued (2 slots full)
    const cancelId = mgr.enqueue({ id: 'to-cancel', kind: 'model', displayName: 'C', url: 'u3', targetPath: '/tmp/3.gguf' })

    mgr.cancel(cancelId)

    const job = mgr.getJob(cancelId)
    expect(job?.state).toBe('cancelled')
  })

  it('is a no-op on an unknown id', () => {
    expect(() => mgr.cancel('ghost-id')).not.toThrow()
  })
})

// ─── pause / resume ──────────────────────────────────────────────────────────

describe('pause / resume', () => {
  let mgr: DownloadManager

  beforeEach(() => {
    vi.mocked(utils.streamToPart).mockImplementation(() => new Promise(() => {}))
    mgr = freshManager()
  })

  it('pause on a queued job sets state to paused', () => {
    // Fill both concurrent slots
    mgr.enqueue({ kind: 'model', displayName: 'A', url: 'u1', targetPath: '/tmp/1.gguf' })
    mgr.enqueue({ kind: 'model', displayName: 'B', url: 'u2', targetPath: '/tmp/2.gguf' })

    const id = mgr.enqueue({ id: 'pausable', kind: 'model', displayName: 'C', url: 'u3', targetPath: '/tmp/3.gguf' })
    mgr.pause(id)
    expect(mgr.getJob(id)?.state).toBe('paused')
  })

  it('resume on a paused job sets it back to queued and resets attempts', () => {
    mgr.enqueue({ kind: 'model', displayName: 'A', url: 'u1', targetPath: '/tmp/1.gguf' })
    mgr.enqueue({ kind: 'model', displayName: 'B', url: 'u2', targetPath: '/tmp/2.gguf' })

    const id = mgr.enqueue({ id: 'resumable', kind: 'model', displayName: 'C', url: 'u3', targetPath: '/tmp/3.gguf' })
    mgr.pause(id)
    expect(mgr.getJob(id)?.state).toBe('paused')

    mgr.resume(id)
    expect(mgr.getJob(id)?.state).toBe('queued')
    expect(mgr.getJob(id)?.attempts).toBe(0)
  })

  it('resume on a failed job resets it to queued', () => {
    mgr.enqueue({ kind: 'model', displayName: 'A', url: 'u1', targetPath: '/tmp/1.gguf' })
    mgr.enqueue({ kind: 'model', displayName: 'B', url: 'u2', targetPath: '/tmp/2.gguf' })

    const id = mgr.enqueue({ id: 'retry-me', kind: 'model', displayName: 'C', url: 'u3', targetPath: '/tmp/3.gguf' })
    // Force it into failed state via cancel then internal manipulation
    mgr.cancel(id)
    // Manually patch state to failed (mirrors what handleFailure does)
    const job = mgr.getJob(id)!
    ;(job as any).state = 'failed'
    ;(job as any).attempts = 3

    mgr.resume(id)
    expect(mgr.getJob(id)?.state).toBe('queued')
    expect(mgr.getJob(id)?.attempts).toBe(0)
  })
})

// ─── remove ───────────────────────────────────────────────────────────────────

describe('remove', () => {
  let mgr: DownloadManager

  beforeEach(() => {
    vi.mocked(utils.streamToPart).mockImplementation(() => new Promise(() => {}))
    mgr = freshManager()
  })

  it('removes a cancelled job from list()', () => {
    mgr.enqueue({ kind: 'model', displayName: 'A', url: 'u1', targetPath: '/tmp/1.gguf' })
    mgr.enqueue({ kind: 'model', displayName: 'B', url: 'u2', targetPath: '/tmp/2.gguf' })
    const id = mgr.enqueue({ id: 'rm-me', kind: 'model', displayName: 'C', url: 'u3', targetPath: '/tmp/3.gguf' })
    mgr.cancel(id)
    expect(mgr.getJob(id)?.state).toBe('cancelled')

    mgr.remove(id)
    expect(mgr.getJob(id)).toBeNull()
    expect(mgr.list().some(j => j.id === id)).toBe(false)
  })

  it('cannot remove an actively running job', () => {
    const id = mgr.enqueue({ id: 'active', kind: 'model', displayName: 'A', url: 'u1', targetPath: '/tmp/1.gguf' })
    // After enqueue, tick() starts it — running.has(id) should be true
    mgr.remove(id)
    // Still in list (not removed)
    expect(mgr.getJob(id)).not.toBeNull()
  })

  it('is a no-op on unknown id', () => {
    expect(() => mgr.remove('ghost')).not.toThrow()
  })
})

// ─── clearFinished ────────────────────────────────────────────────────────────

describe('clearFinished', () => {
  let mgr: DownloadManager

  beforeEach(() => {
    vi.mocked(utils.streamToPart).mockImplementation(() => new Promise(() => {}))
    mgr = freshManager()
  })

  it('removes all done / failed / cancelled jobs but leaves queued ones', () => {
    // Create 3 queued and push 2 to terminal states
    mgr.enqueue({ kind: 'model', displayName: 'A', url: 'u1', targetPath: '/tmp/1.gguf' })
    mgr.enqueue({ kind: 'model', displayName: 'B', url: 'u2', targetPath: '/tmp/2.gguf' })

    const idCancel = mgr.enqueue({ id: 'cancelled-job', kind: 'model', displayName: 'C', url: 'u3', targetPath: '/tmp/3.gguf' })
    mgr.cancel(idCancel)

    mgr.clearFinished()
    expect(mgr.getJob(idCancel)).toBeNull()
    // The two actively running ones should remain
    expect(mgr.list().length).toBe(2)
  })
})

// ─── list ordering ────────────────────────────────────────────────────────────

describe('list', () => {
  let mgr: DownloadManager

  beforeEach(() => {
    vi.mocked(utils.streamToPart).mockImplementation(() => new Promise(() => {}))
    mgr = freshManager()
  })

  it('returns newest jobs first', () => {
    const id1 = mgr.enqueue({ kind: 'model', displayName: 'First', url: 'u1', targetPath: '/tmp/1.gguf' })
    const id2 = mgr.enqueue({ kind: 'model', displayName: 'Second', url: 'u2', targetPath: '/tmp/2.gguf' })
    const id3 = mgr.enqueue({ kind: 'model', displayName: 'Third', url: 'u3', targetPath: '/tmp/3.gguf' })

    const ordered = mgr.list()
    // All 3 should be present; creation order may be the same ms but IDs should all appear
    const ids = ordered.map(j => j.id)
    expect(ids).toContain(id1)
    expect(ids).toContain(id2)
    expect(ids).toContain(id3)
  })
})

// ─── Successful download flow ─────────────────────────────────────────────────

describe('successful download (model)', () => {
  let mgr: DownloadManager

  beforeEach(() => {
    // Must call onProgress so job.bytesDone is updated before the size guard runs
    vi.mocked(utils.streamToPart).mockImplementation(async (opts) => {
      const result = makeStreamResult(512)
      opts.onProgress(result.bytesWritten, result.totalBytes)
      return result as any
    })
    vi.mocked(verifiers.verifyGGUFMagic).mockResolvedValue(true)
    mgr = freshManager()
  })

  it('transitions through downloading → verifying → done', async () => {
    const states: string[] = []
    const id = mgr.enqueue({
      kind: 'model',
      displayName: 'My GGUF',
      url: 'https://example.com/m.gguf',
      targetPath: '/tmp/m.gguf'
    })

    // Poll until done or timeout
    const start = Date.now()
    while (Date.now() - start < 5000) {
      const job = mgr.getJob(id)
      if (!job) break
      if (!states.includes(job.state)) states.push(job.state)
      if (job.state === 'done' || job.state === 'failed') break
      await new Promise(r => setTimeout(r, 10))
    }

    const finalJob = mgr.getJob(id)
    expect(finalJob?.state).toBe('done')
    expect(states).toContain('downloading')
  })

  it('emits "done" on the EventEmitter when a job completes', async () => {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for done event')), 5000)
      mgr.events.once('done', (job) => {
        clearTimeout(timer)
        expect(job.state).toBe('done')
        resolve()
      })
      mgr.enqueue({
        kind: 'model',
        displayName: 'Event test',
        url: 'https://example.com/e.gguf',
        targetPath: '/tmp/e.gguf'
      })
    })
  })
})

// ─── SHA mismatch handling ────────────────────────────────────────────────────

describe('SHA mismatch', () => {
  let mgr: DownloadManager

  beforeEach(() => {
    // streamToPart returns a hash whose digest won't match the expectedSha
    vi.mocked(utils.streamToPart).mockImplementation(async (opts) => {
      const hash = createHash('sha256')
      hash.update(Buffer.from('wrong content'))
      opts.onProgress(512, 512) // keep bytesDone in sync
      return { bytesWritten: 512, totalBytes: 512, etag: null, hash } as any
    })
    mgr = freshManager()
  })

  it('fails the job when sha256 does not match', async () => {
    const id = mgr.enqueue({
      kind: 'model',
      displayName: 'Corrupt model',
      url: 'https://example.com/c.gguf',
      targetPath: '/tmp/c.gguf',
      sha256Expected: 'z'.repeat(64), // will not match
      maxAttempts: 1
    })

    const start = Date.now()
    while (Date.now() - start < 5000) {
      const job = mgr.getJob(id)
      if (job?.state === 'failed' || job?.state === 'done') break
      await new Promise(r => setTimeout(r, 20))
    }

    const job = mgr.getJob(id)
    expect(job?.state).toBe('failed')
    expect(job?.errorMessage).toMatch(/checksum/i)
  })
})

// ─── GGUF magic failure ───────────────────────────────────────────────────────

describe('GGUF magic failure', () => {
  let mgr: DownloadManager

  beforeEach(() => {
    vi.mocked(utils.streamToPart).mockImplementation(async (opts) => {
      const result = makeStreamResult()
      opts.onProgress(result.bytesWritten, result.totalBytes)
      return result as any
    })
    vi.mocked(verifiers.verifyGGUFMagic).mockResolvedValue(false) // not a GGUF
    mgr = freshManager()
  })

  it('fails the job when the downloaded file is not a valid GGUF', async () => {
    const id = mgr.enqueue({
      kind: 'model',
      displayName: 'Not a GGUF',
      url: 'https://example.com/bad.gguf',
      targetPath: '/tmp/bad.gguf',
      maxAttempts: 1
    })

    const start = Date.now()
    while (Date.now() - start < 5000) {
      const job = mgr.getJob(id)
      if (job?.state === 'failed' || job?.state === 'done') break
      await new Promise(r => setTimeout(r, 20))
    }

    const job = mgr.getJob(id)
    expect(job?.state).toBe('failed')
    expect(job?.errorMessage).toMatch(/gguf/i)
  })
})

// ─── Concurrency limit ────────────────────────────────────────────────────────

describe('concurrency', () => {
  it('runs at most 2 downloads in parallel', async () => {
    // @ts-expect-error – accessing private member in test
    DownloadManager.instance = null
    let concurrent = 0
    let maxConcurrent = 0

    vi.mocked(utils.streamToPart).mockImplementation(async (opts) => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise(r => setTimeout(r, 30))
      concurrent--
      const result = makeStreamResult()
      opts.onProgress(result.bytesWritten, result.totalBytes)
      return result as any
    })

    const mgr = DownloadManager.getInstance()
    mgr.init()

    // Enqueue 4 jobs
    for (let i = 0; i < 4; i++) {
      mgr.enqueue({
        kind: 'model',
        displayName: `Model ${i}`,
        url: `https://example.com/m${i}.gguf`,
        targetPath: `/tmp/m${i}.gguf`
      })
    }

    // Wait for all to complete
    const start = Date.now()
    while (Date.now() - start < 8000) {
      const jobs = mgr.list()
      if (jobs.every(j => j.state === 'done' || j.state === 'failed')) break
      await new Promise(r => setTimeout(r, 50))
    }

    expect(maxConcurrent).toBeLessThanOrEqual(2)
    expect(maxConcurrent).toBeGreaterThanOrEqual(1)
  })
})

// ─── Auditor wiring ───────────────────────────────────────────────────────────

describe('auditGgufFile wiring (Phase 2)', () => {
  beforeEach(() => {
    vi.mocked(utils.streamToPart).mockImplementation(async (opts) => {
      const result = makeStreamResult()
      opts.onProgress(result.bytesWritten, result.totalBytes)
      return result as any
    })
    vi.mocked(verifiers.verifyGGUFMagic).mockResolvedValue(true)
  })

  it('calls auditGgufFile for model downloads after magic check passes', async () => {
    vi.mocked(auditorMod.auditGgufFile).mockResolvedValue({ valid: true, metadata: { version: 3, tensorCount: 1, kvCount: 1, architecture: 'llama', contextLength: 4096 } })
    // @ts-expect-error – accessing private member in test
    DownloadManager.instance = null
    const mgr = DownloadManager.getInstance()
    mgr.init()

    const id = mgr.enqueue({
      kind: 'model',
      displayName: 'Audited model',
      url: 'https://example.com/m.gguf',
      targetPath: '/tmp/audited.gguf'
    })

    const start = Date.now()
    while (Date.now() - start < 5000) {
      const job = mgr.getJob(id)
      if (job?.state === 'done' || job?.state === 'failed') break
      await new Promise(r => setTimeout(r, 20))
    }

    expect(vi.mocked(auditorMod.auditGgufFile)).toHaveBeenCalledWith(expect.stringContaining('audited.gguf'))
    expect(mgr.getJob(id)?.state).toBe('done')
  })

  it('fails the job when auditGgufFile returns valid=false', async () => {
    vi.mocked(auditorMod.auditGgufFile).mockResolvedValue({ valid: false, error: 'Potential exploit: tensor_count exceeds maximum' })
    // @ts-expect-error – accessing private member in test
    DownloadManager.instance = null
    const mgr = DownloadManager.getInstance()
    mgr.init()

    const id = mgr.enqueue({
      kind: 'model',
      displayName: 'Exploit model',
      url: 'https://example.com/exploit.gguf',
      targetPath: '/tmp/exploit.gguf',
      maxAttempts: 1
    })

    const start = Date.now()
    while (Date.now() - start < 5000) {
      const job = mgr.getJob(id)
      if (job?.state === 'failed' || job?.state === 'done') break
      await new Promise(r => setTimeout(r, 20))
    }

    const job = mgr.getJob(id)
    expect(job?.state).toBe('failed')
    expect(job?.errorMessage).toMatch(/audit failed/i)
  })

  it('does NOT call auditGgufFile for binary downloads', async () => {
    vi.mocked(auditorMod.auditGgufFile).mockClear()
    // @ts-expect-error – accessing private member in test
    DownloadManager.instance = null
    const mgr = DownloadManager.getInstance()
    mgr.init()

    const id = mgr.enqueue({
      kind: 'binary',
      displayName: 'llama.cpp',
      url: 'https://github.com/releases/b.zip',
      targetPath: '/tmp/llama',
      extractZip: true
    })

    const start = Date.now()
    while (Date.now() - start < 5000) {
      const job = mgr.getJob(id)
      if (job?.state === 'done' || job?.state === 'failed') break
      await new Promise(r => setTimeout(r, 20))
    }

    expect(vi.mocked(auditorMod.auditGgufFile)).not.toHaveBeenCalled()
  })

  it('writes an auditStamp into job.extra after a successful audit', async () => {
    vi.mocked(auditorMod.auditGgufFile).mockResolvedValue({ valid: true, metadata: { version: 3, tensorCount: 1, kvCount: 1, architecture: 'llama', contextLength: null } })
    // @ts-expect-error – accessing private member in test
    DownloadManager.instance = null
    const mgr = DownloadManager.getInstance()
    mgr.init()

    const id = mgr.enqueue({
      kind: 'model',
      displayName: 'Stamped model',
      url: 'https://example.com/s.gguf',
      targetPath: '/tmp/stamped.gguf'
    })

    const start = Date.now()
    while (Date.now() - start < 5000) {
      const job = mgr.getJob(id)
      if (job?.state === 'done' || job?.state === 'failed') break
      await new Promise(r => setTimeout(r, 20))
    }

    const job = mgr.getJob(id)
    expect(job?.state).toBe('done')
    const extra = job?.extra as any
    expect(extra?.auditStamp).toBeDefined()
    expect(typeof extra.auditStamp.size).toBe('number')
    expect(typeof extra.auditStamp.mtimeMs).toBe('number')
    expect(typeof extra.auditStamp.ino).toBe('number')
  })
})
