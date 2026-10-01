/**
 * Tests for the TOCTOU launch guard (verifyAuditStamp).
 */
import { describe, it, expect } from 'vitest'
import { writeFile, unlink, utimes } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { statSync } from 'fs'

import { verifyAuditStamp, type AuditStamp } from '../main/security/launch-guard'

async function tmpFile(name: string, content: Buffer | string = 'hello'): Promise<string> {
  const p = join(tmpdir(), `llama-guard-test-${Date.now()}-${name}`)
  await writeFile(p, content)
  return p
}

function stampOf(filePath: string): AuditStamp {
  const s = statSync(filePath)
  return { size: s.size, mtimeMs: s.mtimeMs, ino: s.ino }
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('verifyAuditStamp — unchanged file', () => {
  it('returns ok=true when nothing changed', async () => {
    const p = await tmpFile('unchanged.bin')
    const stamp = stampOf(p)
    const result = await verifyAuditStamp(p, stamp)
    await unlink(p)
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
  })
})

// ─── Size mismatch ─────────────────────────────────────────────────────────────

describe('verifyAuditStamp — size change', () => {
  it('returns ok=false when the file grows', async () => {
    const p = await tmpFile('grown.bin', 'original content')
    const stamp = stampOf(p)

    // Append bytes to change the size
    await writeFile(p, 'original content plus more bytes')

    const result = await verifyAuditStamp(p, stamp)
    await unlink(p)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/size/i)
  })

  it('returns ok=false when the file shrinks', async () => {
    const p = await tmpFile('shrunk.bin', 'longer original content here')
    const stamp = stampOf(p)
    await writeFile(p, 'short')

    const result = await verifyAuditStamp(p, stamp)
    await unlink(p)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/size/i)
  })
})

// ─── mtime mismatch ────────────────────────────────────────────────────────────

describe('verifyAuditStamp — mtime change', () => {
  it('returns ok=false when mtime is updated (same content)', async () => {
    const content = Buffer.from('exact same content')
    const p = await tmpFile('mtime-changed.bin', content)
    const stamp = stampOf(p)

    // Touch the file: set mtime to a clearly different time
    const futureDate = new Date(Date.now() + 60_000)
    await utimes(p, futureDate, futureDate)

    const result = await verifyAuditStamp(p, stamp)
    await unlink(p)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/modification time/i)
  })
})

// ─── Missing file ──────────────────────────────────────────────────────────────

describe('verifyAuditStamp — file missing', () => {
  it('returns ok=false with a descriptive reason when the file does not exist', async () => {
    const stamp: AuditStamp = { size: 1024, mtimeMs: Date.now(), ino: 12345 }
    const result = await verifyAuditStamp('/nonexistent/path/model.gguf', stamp)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/stat/i)
  })
})

// ─── Windows ino=0 fallback ────────────────────────────────────────────────────

describe('verifyAuditStamp — ino=0 (Windows fallback)', () => {
  it('skips the inode check when stamp.ino is 0, still passes on matching size+mtime', async () => {
    const p = await tmpFile('windows-ino.bin', 'model data')
    const s = statSync(p)
    // Simulate a Windows stamp where ino is always 0
    const stamp: AuditStamp = { size: s.size, mtimeMs: s.mtimeMs, ino: 0 }

    const result = await verifyAuditStamp(p, stamp)
    await unlink(p)
    expect(result.ok).toBe(true)
  })
})
