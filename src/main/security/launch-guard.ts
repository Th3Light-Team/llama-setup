/**
 * TOCTOU (Time-of-Check Time-of-Use) guard for model files.
 *
 * A file's identity stamp is recorded immediately after the GGUF audit
 * completes (inside DownloadManager).  Before llama-server is spawned, the
 * stamp is compared to the current file stat.  If any field changed, the file
 * was swapped or modified between audit and launch — we refuse to proceed.
 *
 * The stamp covers three independent axes:
 *   - size    : content length changes are detected
 *   - mtimeMs : modification time changes are detected (on most FSes)
 *   - ino     : inode changes detect symlink swaps / renames on POSIX
 *
 * Note: Windows NTFS does not expose a meaningful `ino` — the node `stat()`
 * call returns 0 for all files.  On Windows the guard falls back to
 * size + mtimeMs only, which is still a strong signal against accidental
 * overwrites, though not against a carefully crafted same-size same-mtime swap.
 */
import { stat } from 'fs/promises'

export interface AuditStamp {
  size: number
  mtimeMs: number
  ino: number
}

export interface StampVerifyResult {
  ok: boolean
  reason?: string
}

/**
 * Compare the current file stat against a previously recorded stamp.
 * Returns `{ ok: false, reason }` if any mismatch is detected.
 */
export async function verifyAuditStamp(
  filePath: string,
  stamp: AuditStamp
): Promise<StampVerifyResult> {
  let s: Awaited<ReturnType<typeof stat>>
  try {
    s = await stat(filePath)
  } catch (err: any) {
    return { ok: false, reason: `Cannot stat model file: ${err.message}` }
  }

  if (s.size !== stamp.size) {
    return {
      ok: false,
      reason: `Model file size changed since audit (expected ${stamp.size} bytes, got ${s.size} bytes). Possible tampering.`
    }
  }

  if (Math.round(s.mtimeMs) !== Math.round(stamp.mtimeMs)) {
    return {
      ok: false,
      reason: `Model file modification time changed since audit. Possible tampering.`
    }
  }

  // Only check inode on POSIX (Windows returns 0 for all files)
  if (stamp.ino !== 0 && s.ino !== stamp.ino) {
    return {
      ok: false,
      reason: `Model file inode changed since audit — file may have been swapped via symlink. Possible tampering.`
    }
  }

  return { ok: true }
}
