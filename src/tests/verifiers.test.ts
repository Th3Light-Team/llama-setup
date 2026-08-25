import { describe, it, expect, afterEach } from 'vitest'
import { writeFile, unlink } from 'fs/promises'
import { createHash } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'

import { verifyGGUFMagic, sha256OfFile } from '../main/downloads/verifiers'

// ─── verifyGGUFMagic ────────────────────────────────────────────────────────

describe('verifyGGUFMagic', () => {
  const tmp = join(tmpdir(), `llama-test-magic-${Date.now()}.bin`)

  afterEach(async () => {
    await unlink(tmp).catch(() => {})
  })

  it('returns true for a file that starts with the GGUF magic bytes (0x47475546)', async () => {
    // "GGUF" in ASCII
    const magic = Buffer.from([0x47, 0x47, 0x55, 0x46])
    const rest = Buffer.from([0x01, 0x00, 0x00, 0x00, 0xff, 0xee]) // fake version + data
    await writeFile(tmp, Buffer.concat([magic, rest]))
    await expect(verifyGGUFMagic(tmp)).resolves.toBe(true)
  })

  it('returns false for a file with wrong leading bytes', async () => {
    await writeFile(tmp, Buffer.from([0x89, 0x50, 0x4e, 0x47])) // PNG magic
    await expect(verifyGGUFMagic(tmp)).resolves.toBe(false)
  })

  it('returns false for a file with fewer than 4 bytes', async () => {
    await writeFile(tmp, Buffer.from([0x47, 0x47])) // only 2 bytes
    await expect(verifyGGUFMagic(tmp)).resolves.toBe(false)
  })

  it('returns false for an empty file', async () => {
    await writeFile(tmp, Buffer.alloc(0))
    await expect(verifyGGUFMagic(tmp)).resolves.toBe(false)
  })

  it('works correctly when GGUF magic is followed by large content', async () => {
    const magic = Buffer.from([0x47, 0x47, 0x55, 0x46])
    const padding = Buffer.alloc(4096, 0xab)
    await writeFile(tmp, Buffer.concat([magic, padding]))
    await expect(verifyGGUFMagic(tmp)).resolves.toBe(true)
  })
})

// ─── sha256OfFile ─────────────────────────────────────────────────────────────

describe('sha256OfFile', () => {
  const tmp = join(tmpdir(), `llama-test-sha256-${Date.now()}.bin`)

  afterEach(async () => {
    await unlink(tmp).catch(() => {})
  })

  it('matches the known sha256 of "hello world"', async () => {
    await writeFile(tmp, 'hello world')
    const expected = createHash('sha256').update('hello world').digest('hex')
    await expect(sha256OfFile(tmp)).resolves.toBe(expected)
  })

  it('matches known sha256 for empty file', async () => {
    await writeFile(tmp, '')
    const expected = createHash('sha256').update('').digest('hex')
    await expect(sha256OfFile(tmp)).resolves.toBe(expected)
  })

  it('produces a 64-character hex string', async () => {
    await writeFile(tmp, Buffer.from('some binary data'))
    const result = await sha256OfFile(tmp)
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic — same file produces same hash on two calls', async () => {
    const data = Buffer.from('deterministic test data 12345')
    await writeFile(tmp, data)
    const first = await sha256OfFile(tmp)
    const second = await sha256OfFile(tmp)
    expect(first).toBe(second)
  })

  it('different content produces different hash', async () => {
    await writeFile(tmp, 'content a')
    const hashA = await sha256OfFile(tmp)
    await writeFile(tmp, 'content b')
    const hashB = await sha256OfFile(tmp)
    expect(hashA).not.toBe(hashB)
  })
})
