/**
 * Tests for the hardened GGUF auditor.
 *
 * Rather than mocking the @huggingface/gguf library (which would only test
 * our wrapper, not the real parsing path), we build minimal but structurally
 * valid GGUF binary blobs in memory and write them to tmp files.
 *
 * For cases that need the HF parser to succeed (steps 3-7) we use vi.mock to
 * control the returned metadata so we can exercise every bounds-check branch
 * without constructing a fully valid GGUF binary.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// ── Mock the HF gguf parser — we control what "parsed metadata" looks like ──
vi.mock('@huggingface/gguf', () => ({
  gguf: vi.fn()
}))

import { gguf as ggufMock } from '@huggingface/gguf'
import { auditGgufFile } from '../core/security/gguf-auditor'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GGUF_MAGIC = Buffer.from([0x47, 0x47, 0x55, 0x46])

/** Write a tmp file with the given content and return its path. */
async function tmpFile(name: string, content: Buffer | string): Promise<string> {
  const p = join(tmpdir(), `llama-gguf-test-${Date.now()}-${name}`)
  await writeFile(p, content)
  return p
}

/** A minimal "valid-looking" GGUF header: magic + v3 version bytes. */
function minimalGgufHeader(): Buffer {
  const buf = Buffer.alloc(64, 0)
  GGUF_MAGIC.copy(buf, 0)
  buf.writeUInt32LE(3, 4) // version = 3
  return buf
}

/**
 * Default good metadata returned by the mocked parser.
 * tensor_count=1 so our 64-byte tmp files pass the size-plausibility check
 * (1 tensor × 32 bytes/tensor = 32 bytes ≤ 64 bytes).
 */
function goodMetadata() {
  return {
    metadata: {
      version: 3,
      tensor_count: 1n,
      kv_count: 1n,
      'general.architecture': 'llama',
      'llama.context_length': 4096
    }
  }
}

// ─── Step 1: File-size lower bound ───────────────────────────────────────────

describe('Step 1 — file-size lower bound', () => {
  it('rejects a file smaller than 24 bytes', async () => {
    const p = await tmpFile('tiny.gguf', Buffer.alloc(10))
    const result = await auditGgufFile(p)
    await unlink(p)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/too small/i)
  })

  it('accepts a file with exactly 24 bytes (magic + valid header stub)', async () => {
    vi.mocked(ggufMock).mockResolvedValue(goodMetadata() as any)
    const p = await tmpFile('exact24.gguf', minimalGgufHeader().subarray(0, 64))
    const result = await auditGgufFile(p)
    await unlink(p)
    // The HF mock returns good metadata, so it should pass all checks
    expect(result.valid).toBe(true)
  })
})

// ─── Step 2: Magic-byte check ────────────────────────────────────────────────

describe('Step 2 — independent magic-byte check', () => {
  it('rejects a file with wrong leading bytes (PNG magic)', async () => {
    const buf = Buffer.alloc(64, 0)
    Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(buf) // PNG
    const p = await tmpFile('notgguf.bin', buf)
    const result = await auditGgufFile(p)
    await unlink(p)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/magic/i)
  })

  it('rejects a file with all-zero leading bytes', async () => {
    const p = await tmpFile('zeros.bin', Buffer.alloc(64, 0))
    const result = await auditGgufFile(p)
    await unlink(p)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/magic/i)
  })

  it('accepts a file whose first 4 bytes are the GGUF magic', async () => {
    vi.mocked(ggufMock).mockResolvedValue(goodMetadata() as any)
    const p = await tmpFile('magic-ok.gguf', minimalGgufHeader())
    const result = await auditGgufFile(p)
    await unlink(p)
    expect(result.valid).toBe(true)
  })

  it('does NOT call the HF parser when magic bytes are wrong (no unnecessary parsing)', async () => {
    vi.mocked(ggufMock).mockClear()
    const buf = Buffer.alloc(64, 0xab) // wrong magic
    const p = await tmpFile('bad-magic.gguf', buf)
    await auditGgufFile(p)
    await unlink(p)
    expect(vi.mocked(ggufMock)).not.toHaveBeenCalled()
  })
})

// ─── Step 4: Version bounds ───────────────────────────────────────────────────

describe('Step 4 — GGUF version bounds', () => {
  let p: string

  afterEach(async () => { await unlink(p).catch(() => {}) })

  it('rejects version 0', async () => {
    vi.mocked(ggufMock).mockResolvedValue({ metadata: { ...goodMetadata().metadata, version: 0 } } as any)
    p = await tmpFile('v0.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/version/i)
  })

  it('accepts version 1', async () => {
    vi.mocked(ggufMock).mockResolvedValue({ metadata: { ...goodMetadata().metadata, version: 1 } } as any)
    p = await tmpFile('v1.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(true)
  })

  it('accepts version 3 (current max)', async () => {
    vi.mocked(ggufMock).mockResolvedValue(goodMetadata() as any)
    p = await tmpFile('v3.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(true)
  })

  it('rejects version 4 (future / unsupported)', async () => {
    vi.mocked(ggufMock).mockResolvedValue({ metadata: { ...goodMetadata().metadata, version: 4 } } as any)
    p = await tmpFile('v4.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/version/i)
  })

  it('rejects a missing version field', async () => {
    const m = { ...goodMetadata().metadata }
    delete (m as any).version
    vi.mocked(ggufMock).mockResolvedValue({ metadata: m } as any)
    p = await tmpFile('no-version.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/version/i)
  })
})

// ─── Step 5: Tensor / KV count bounds (BigInt-safe) ──────────────────────────

describe('Step 5 — tensor & KV count bounds', () => {
  let p: string
  afterEach(async () => { await unlink(p).catch(() => {}) })

  it('rejects a missing tensor_count field', async () => {
    const m = { ...goodMetadata().metadata }
    delete (m as any).tensor_count
    vi.mocked(ggufMock).mockResolvedValue({ metadata: m } as any)
    p = await tmpFile('no-tc.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/tensor_count/i)
  })

  it('rejects tensor_count above MAX (10 000) using BigInt', async () => {
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: { ...goodMetadata().metadata, tensor_count: 10_001n }
    } as any)
    p = await tmpFile('huge-tc.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/tensor_count/i)
  })

  it('accepts tensor_count exactly at MAX (10 000) when file is large enough', async () => {
    // 10 000 × 32 bytes = 320 000 bytes minimum; write a file that size
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: { ...goodMetadata().metadata, tensor_count: 10_000n }
    } as any)
    const bigBuf = Buffer.alloc(320_100, 0)
    GGUF_MAGIC.copy(bigBuf, 0)
    p = await tmpFile('max-tc.gguf', bigBuf)
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(true)
  })

  // ── THE KEY TEST: BigInt precision bypass is no longer possible ───────────
  it('rejects a crafted tensor_count near Number.MAX_SAFE_INTEGER that would fool Number() coercion', async () => {
    // Number(9_007_199_254_741_001n) === 9_007_199_254_740_992 (< MAX_TENSOR_COUNT would have been a bypass)
    // With BigInt comparison this must still be rejected.
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: { ...goodMetadata().metadata, tensor_count: 9_007_199_254_741_001n }
    } as any)
    p = await tmpFile('bigint-bypass.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/tensor_count/i)
  })

  it('rejects kv_count above MAX (10 000)', async () => {
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: { ...goodMetadata().metadata, kv_count: 999_999n }
    } as any)
    p = await tmpFile('huge-kv.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/kv_count/i)
  })

  it('rejects a missing kv_count field', async () => {
    const m = { ...goodMetadata().metadata }
    delete (m as any).kv_count
    vi.mocked(ggufMock).mockResolvedValue({ metadata: m } as any)
    p = await tmpFile('no-kv.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/kv_count/i)
  })

  it('rejects a negative tensor_count', async () => {
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: { ...goodMetadata().metadata, tensor_count: -1n }
    } as any)
    p = await tmpFile('neg-tc.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/negative/i)
  })
})

// ─── Step 6: File-size vs. claimed tensor count plausibility ─────────────────

describe('Step 6 — file-size vs. claimed tensor-count plausibility', () => {
  it('rejects a physically small file that claims many tensors', async () => {
    // 64-byte file, 10 000 tensors × 32 bytes/tensor minimum = 320 000 bytes needed
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: { ...goodMetadata().metadata, tensor_count: 10_000n }
    } as any)
    const p = await tmpFile('small-many-tensors.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    await unlink(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/too small/i)
  })

  it('accepts a file large enough for its claimed tensor count', async () => {
    // 10 tensors × 32 bytes = 320 bytes minimum — our 64-byte file is fine for 0 tensors
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: { ...goodMetadata().metadata, tensor_count: 0n }
    } as any)
    const p = await tmpFile('zero-tensors.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    await unlink(p)
    // 0 tensors means minRequired = 0 bytes; any file passes the size check
    expect(r.valid).toBe(true)
  })
})

// ─── Step 7: Sanitised metadata output ───────────────────────────────────────

describe('Step 7 — sanitised metadata output', () => {
  let p: string
  afterEach(async () => { await unlink(p).catch(() => {}) })

  it('returns only the safe typed fields — no raw arbitrary metadata', async () => {
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: {
        ...goodMetadata().metadata,
        'some.secret.key': 'exfiltrate this',
        'nested.object': { foo: 'bar' },
        'general.architecture': 'mistral',
        'llama.context_length': 8192
      }
    } as any)
    p = await tmpFile('sanitised.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(true)
    expect(r.metadata).toBeDefined()
    // Only the declared SafeGgufMetadata fields should be present
    const keys = Object.keys(r.metadata!)
    expect(keys).toEqual(['version', 'tensorCount', 'kvCount', 'architecture', 'contextLength'])
    expect(r.metadata!.architecture).toBe('mistral')
    expect(r.metadata!.contextLength).toBe(8192)
    expect((r.metadata as any)['some.secret.key']).toBeUndefined()
  })

  it('returns null for optional fields that are absent', async () => {
    // Start from a clean minimal metadata without any optional keys
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: {
        version: 3,
        tensor_count: 1n,
        kv_count: 1n
        // no 'general.architecture', no context length keys
      }
    } as any)
    p = await tmpFile('no-arch.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(true)
    expect(r.metadata!.architecture).toBeNull()
    expect(r.metadata!.contextLength).toBeNull()
  })

  it('Number cast of tensorCount is safe because BigInt check already passed', async () => {
    // Use tensor_count: 8n so the 64-byte file passes the plausibility check
    // (8 × 32 = 256 bytes needed; our file is 64 bytes, so use 1 tensor)
    vi.mocked(ggufMock).mockResolvedValue({
      metadata: { ...goodMetadata().metadata, tensor_count: 1n }
    } as any)
    p = await tmpFile('number-cast.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    expect(r.valid).toBe(true)
    expect(typeof r.metadata!.tensorCount).toBe('number')
    expect(r.metadata!.tensorCount).toBe(1) // matches tensor_count: 1n above
  })
})

// ─── HF parser error handling ─────────────────────────────────────────────────

describe('HF parser error handling', () => {
  it('returns valid=false when the parser throws', async () => {
    vi.mocked(ggufMock).mockRejectedValue(new Error('Corrupt GGUF header'))
    const p = await tmpFile('throws.gguf', minimalGgufHeader())
    const r = await auditGgufFile(p)
    await unlink(p)
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/parse/i)
  })
})
