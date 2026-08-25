import { createReadStream, createWriteStream, existsSync, statSync } from 'fs'
import { readFile, writeFile, unlink } from 'fs/promises'
import { createHash, type Hash } from 'crypto'

const USER_AGENT = 'Llama-Studio-App'

export interface HeadInfo {
  status: number
  contentLength: number | null
  etag: string | null
  acceptsRanges: boolean
}

export async function httpHead(url: string, signal?: AbortSignal): Promise<HeadInfo> {
  const res = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT },
    signal
  })
  const len = res.headers.get('content-length')
  return {
    status: res.status,
    contentLength: len ? Number(len) : null,
    etag: res.headers.get('etag'),
    acceptsRanges: (res.headers.get('accept-ranges') || '').toLowerCase().includes('bytes')
  }
}

export interface PartMeta {
  url: string
  etag: string | null
  bytesDone: number
  /** Hex sha256 of bytes written so far (for resume continuation). */
  sha256Partial: string | null
}

export async function readPartMeta(metaPath: string): Promise<PartMeta | null> {
  try {
    const text = await readFile(metaPath, 'utf8')
    return JSON.parse(text) as PartMeta
  } catch {
    return null
  }
}

export async function writePartMeta(metaPath: string, meta: PartMeta): Promise<void> {
  await writeFile(metaPath, JSON.stringify(meta), 'utf8')
}

export async function deletePartMeta(metaPath: string): Promise<void> {
  await unlink(metaPath).catch(() => {})
}

export interface StreamOpts {
  url: string
  partPath: string
  fromByte: number
  signal: AbortSignal
  onProgress: (bytesDone: number, bytesTotal: number | null) => void
  /** Emitted when no bytes have been received in `stallSeconds`. */
  onStall: () => void
  stallSeconds?: number
}

export interface StreamResult {
  bytesWritten: number
  totalBytes: number | null
  etag: string | null
  /** Hash includes everything written from byte 0 (caller must seed if resuming). */
  hash: Hash
}

/**
 * Stream a download into `partPath`, appending if `fromByte > 0`.
 * The caller seeds the hash with bytes already on disk if `fromByte > 0`.
 */
export async function streamToPart(opts: StreamOpts, hash: Hash): Promise<StreamResult> {
  const { url, partPath, fromByte, signal, onProgress, onStall } = opts
  const stallMs = (opts.stallSeconds ?? 60) * 1000

  const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
  if (fromByte > 0) headers['Range'] = `bytes=${fromByte}-`

  const res = await fetch(url, { headers, redirect: 'follow', signal })
  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  if (!res.body) throw new Error('Response has no body')

  const contentLength = res.headers.get('content-length')
  const remaining = contentLength ? Number(contentLength) : null
  // For 206 responses, content-length is the *remaining* bytes.
  const totalBytes = remaining !== null
    ? (res.status === 206 ? fromByte + remaining : remaining)
    : null

  const append = fromByte > 0 && res.status === 206
  const stream = createWriteStream(partPath, { flags: append ? 'a' : 'w' })

  let bytesDone = append ? fromByte : 0
  if (!append && fromByte > 0) {
    // Server didn't honor the Range — caller's hash is wrong; reset it.
    hash = createHash('sha256')
  }

  let lastProgressAt = Date.now()
  let lastEmittedAt = 0
  const reader = res.body.getReader()

  const stallTimer = setInterval(() => {
    if (Date.now() - lastProgressAt > stallMs) {
      onStall()
    }
  }, Math.min(stallMs, 5000))

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      hash.update(chunk)
      stream.write(chunk)
      bytesDone += chunk.length
      lastProgressAt = Date.now()

      const now = Date.now()
      if (now - lastEmittedAt > 500) {
        onProgress(bytesDone, totalBytes)
        lastEmittedAt = now
      }
    }
  } finally {
    clearInterval(stallTimer)
    stream.end()
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve())
      stream.on('error', reject)
    })
  }

  onProgress(bytesDone, totalBytes)
  return {
    bytesWritten: bytesDone,
    totalBytes,
    etag: res.headers.get('etag'),
    hash
  }
}

export function backoffDelayMs(attempt: number): number | null {
  if (attempt >= 6) return null
  return Math.pow(2, attempt - 1) * 1000
}

export function partExistingBytes(partPath: string): number {
  if (!existsSync(partPath)) return 0
  try {
    return statSync(partPath).size
  } catch {
    return 0
  }
}

/** Re-hash an existing part file from scratch (used to resume hashing). */
export async function hashFromFile(filePath: string): Promise<Hash> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(filePath)
    rs.on('data', d => hash.update(d as Buffer))
    rs.on('end', () => resolve())
    rs.on('error', reject)
  })
  return hash
}
