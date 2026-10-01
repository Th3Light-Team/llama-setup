import { createReadStream } from 'fs'
import { open } from 'fs/promises'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdir, readdir, rename, rm } from 'fs/promises'
import { join } from 'path'
import extract from 'extract-zip'

const execFileAsync = promisify(execFile)

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

/**
 * Extract a .tar.gz with the system `tar` (present on Linux, macOS and
 * Windows 10+). llama.cpp's Linux/macOS archives wrap everything in a single
 * top-level folder; hoist its contents so binaries land in targetDir.
 */
export async function extractTarGzTo(archivePath: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true })
  await execFileAsync('tar', ['-xzf', archivePath, '-C', targetDir])
  const entries = await readdir(targetDir, { withFileTypes: true })
  if (entries.length === 1 && entries[0].isDirectory()) {
    const inner = join(targetDir, entries[0].name)
    for (const name of await readdir(inner)) {
      await rename(join(inner, name), join(targetDir, name))
    }
    await rm(inner, { recursive: true, force: true })
  }
}

export function extractArchiveTo(archivePath: string, sourceUrl: string, targetDir: string): Promise<void> {
  const name = sourceUrl.split('?')[0].toLowerCase()
  return name.endsWith('.tar.gz') || name.endsWith('.tgz')
    ? extractTarGzTo(archivePath, targetDir)
    : extractZipTo(archivePath, targetDir)
}
