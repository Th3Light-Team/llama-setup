import { describe, it, expect } from 'vitest'
import { installProgressFor } from '../renderer/lib/install-progress'
import type { DownloadJob } from '../core/downloads/types'

const job = (over: Partial<DownloadJob> & { extra: unknown }): DownloadJob => ({
  id: 'x', kind: 'binary', displayName: '', url: '', targetPath: '', partPath: '', metaPath: '',
  extractZip: true, bytesTotal: 100, bytesDone: 0, state: 'downloading', errorMessage: null,
  attempts: 0, maxAttempts: 5, sha256Expected: null, sha256Actual: null, etag: null,
  createdAt: '', updatedAt: '', ...over
}) as DownloadJob

const ID = 'b1-cuda-cu12.4-x64'
const engine = (o: Partial<DownloadJob> = {}) => job({ id: `binary:${ID}`, extra: { installId: ID }, ...o })
const runtime = (o: Partial<DownloadJob> = {}) => job({ id: `binary:${ID}:runtime`, extra: { runtimeOf: ID }, ...o })

describe('installProgressFor', () => {
  it('is undefined when no job belongs to the install', () => {
    expect(installProgressFor({}, ID)).toBeUndefined()
    expect(installProgressFor([engine()], 'other-id')).toBeUndefined()
    expect(installProgressFor([job({ kind: 'model', extra: { installId: ID } })], ID)).toBeUndefined()
  })

  it('a plain engine install reports its own progress', () => {
    const p = installProgressFor([engine({ bytesDone: 40 })], ID)!
    expect(p).toMatchObject({ state: 'active', percent: 40, hasRuntime: false })
    expect(installProgressFor([engine({ state: 'done', bytesDone: 100 })], ID)).toMatchObject({ state: 'done', percent: 100 })
  })

  it('does NOT report done while the CUDA runtime is still downloading (regression)', () => {
    const p = installProgressFor([engine({ state: 'done', bytesDone: 100, bytesTotal: 100 }), runtime({ bytesDone: 50, bytesTotal: 300 })], ID)!
    expect(p.state).toBe('active')
    expect(p.hasRuntime).toBe(true)
    expect(p.percent).toBe(38) // (100 + 50) / (100 + 300)
  })

  it('is done only when engine and runtime are both done', () => {
    const p = installProgressFor([engine({ state: 'done' }), runtime({ state: 'done', bytesTotal: 300, bytesDone: 300 })], ID)!
    expect(p).toMatchObject({ state: 'done', percent: 100 })
  })

  it('never shows 100% before everything is done', () => {
    const p = installProgressFor([engine({ bytesDone: 100 }), runtime({ bytesDone: 300, bytesTotal: 300, state: 'extracting' })], ID)!
    expect(p.state).toBe('active')
    expect(p.percent).toBe(99)
  })

  it('fails when either part fails, surfacing its error', () => {
    const p = installProgressFor([engine({ state: 'done' }), runtime({ state: 'failed', errorMessage: 'HTTP 404 Not Found' })], ID)!
    expect(p).toMatchObject({ state: 'failed', error: 'HTTP 404 Not Found' })
    expect(installProgressFor([engine({ state: 'cancelled' })], ID)).toMatchObject({ state: 'failed' })
  })

  it('accepts the jobs as a record keyed by id', () => {
    expect(installProgressFor({ a: engine({ bytesDone: 10 }) }, ID)?.percent).toBe(10)
  })
})
