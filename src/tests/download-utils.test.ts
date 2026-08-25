import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFile, unlink, mkdir, rm } from 'fs/promises'
import { createHash } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'

import {
  backoffDelayMs,
  readPartMeta,
  writePartMeta,
  deletePartMeta,
  partExistingBytes,
  hashFromFile,
  type PartMeta
} from '../main/downloads/download-utils'

// ─── backoffDelayMs ──────────────────────────────────────────────────────────

describe('backoffDelayMs', () => {
  it('returns 0ms for attempt 0 (2^-1 * 1000 → 0.5, but we use 2^(attempt-1))', () => {
    // attempt=0 → 2^(0-1) = 0.5s, attempt=1 → 1s, attempt=2 → 2s…
    // The implementation: Math.pow(2, attempt - 1) * 1000
    expect(backoffDelayMs(0)).toBe(500)
  })

  it('returns 1000ms for attempt 1', () => {
    expect(backoffDelayMs(1)).toBe(1000)
  })

  it('returns 2000ms for attempt 2', () => {
    expect(backoffDelayMs(2)).toBe(2000)
  })

  it('returns 4000ms for attempt 3', () => {
    expect(backoffDelayMs(3)).toBe(4000)
  })

  it('returns 8000ms for attempt 4', () => {
    expect(backoffDelayMs(4)).toBe(8000)
  })

  it('returns 16000ms for attempt 5', () => {
    expect(backoffDelayMs(5)).toBe(16000)
  })

  it('returns null for attempt >= 6 (give up)', () => {
    expect(backoffDelayMs(6)).toBeNull()
    expect(backoffDelayMs(7)).toBeNull()
    expect(backoffDelayMs(100)).toBeNull()
  })

  it('delays increase exponentially', () => {
    const delays = [1, 2, 3, 4, 5].map(a => backoffDelayMs(a) as number)
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBe(delays[i - 1] * 2)
    }
  })
})

// ─── partExistingBytes ───────────────────────────────────────────────────────

describe('partExistingBytes', () => {
  const tmp = join(tmpdir(), `llama-test-part-${Date.now()}.part`)

  afterEach(async () => {
    await unlink(tmp).catch(() => {})
  })

  it('returns 0 when the file does not exist', () => {
    expect(partExistingBytes('/nonexistent/path/file.part')).toBe(0)
  })

  it('returns the exact byte count of an existing file', async () => {
    const content = Buffer.from('hello world!')
    await writeFile(tmp, content)
    expect(partExistingBytes(tmp)).toBe(content.length)
  })

  it('returns 0 for an empty file', async () => {
    await writeFile(tmp, '')
    expect(partExistingBytes(tmp)).toBe(0)
  })
})

// ─── readPartMeta / writePartMeta / deletePartMeta ──────────────────────────

describe('part meta sidecar', () => {
  const tmp = join(tmpdir(), `llama-test-meta-${Date.now()}.part.json`)

  afterEach(async () => {
    await unlink(tmp).catch(() => {})
  })

  it('writePartMeta then readPartMeta round-trips correctly', async () => {
    const meta: PartMeta = {
      url: 'https://example.com/model.gguf',
      etag: '"abc123"',
      bytesDone: 1_048_576,
      sha256Partial: null
    }
    await writePartMeta(tmp, meta)
    const got = await readPartMeta(tmp)
    expect(got).toEqual(meta)
  })

  it('readPartMeta returns null when file is missing', async () => {
    const result = await readPartMeta('/nonexistent/meta.json')
    expect(result).toBeNull()
  })

  it('readPartMeta returns null when file is malformed JSON', async () => {
    await writeFile(tmp, 'not json at all {{{')
    const result = await readPartMeta(tmp)
    expect(result).toBeNull()
  })

  it('deletePartMeta removes the file', async () => {
    await writeFile(tmp, '{}')
    expect(existsSync(tmp)).toBe(true)
    await deletePartMeta(tmp)
    expect(existsSync(tmp)).toBe(false)
  })

  it('deletePartMeta is a no-op on missing file (no throw)', async () => {
    await expect(deletePartMeta('/nonexistent/meta.json')).resolves.toBeUndefined()
  })
})

// ─── hashFromFile ─────────────────────────────────────────────────────────────

describe('hashFromFile', () => {
  const tmp = join(tmpdir(), `llama-test-hash-${Date.now()}.bin`)

  afterEach(async () => {
    await unlink(tmp).catch(() => {})
  })

  it('produces same digest as in-memory hash of the same bytes', async () => {
    const data = Buffer.from('The quick brown fox jumps over the lazy dog')
    await writeFile(tmp, data)

    const expected = createHash('sha256').update(data).digest('hex')
    const hash = await hashFromFile(tmp)
    expect(hash.digest('hex')).toBe(expected)
  })

  it('works on an empty file (returns sha256 of empty string)', async () => {
    await writeFile(tmp, '')
    const expected = createHash('sha256').update('').digest('hex')
    const hash = await hashFromFile(tmp)
    expect(hash.digest('hex')).toBe(expected)
  })
})
