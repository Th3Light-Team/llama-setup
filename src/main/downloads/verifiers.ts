import { createReadStream } from 'fs'
import { open } from 'fs/promises'
import { createHash } from 'crypto'
import extract from 'extract-zip'

const GGUF_MAGIC = Buffer.from([0x47, 0x47, 0x55, 0x46]) // "GGUF"

export async function verifyGGUFMagic(filePath: string): Promise<boolean> {
  const fh = await open(filePath, 'r')
  try {
    const buf = Buffer.alloc(4)
    const { bytesRead } = await fh.read(buf, 0, 4, 0)
    if (bytesRead < 4) return false
    return buf.equals(GGUF_MAGIC)
  } finally {
    await fh.close()
  }
}

export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(filePath)
    rs.on('data', d => hash.update(d as Buffer))
    rs.on('end', () => resolve())
    rs.on('error', reject)
  })
  return hash.digest('hex')
}

export async function extractZipTo(zipPath: string, targetDir: string): Promise<void> {
  await extract(zipPath, { dir: targetDir })
}
