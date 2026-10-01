import type { DownloadJob } from '../../core/downloads/types'

export interface InstallProgress {
  /** 'done' only when every part of the install (engine and CUDA runtime) is done */
  state: 'active' | 'done' | 'failed'
  percent: number
  bytesDone: number
  bytesTotal: number
  error: string | null
  /** true when a separate CUDA runtime download is part of this install */
  hasRuntime: boolean
}

type JobExtra = { installId?: string; runtimeOf?: string } | null

/**
 * Combine the jobs that make up one binary install (the engine archive and,
 * for CUDA builds, the cudart runtime bundle) into a single progress value so
 * the UI never reports "done" while the runtime is still downloading.
 */
export function installProgressFor(
  jobs: Record<string, DownloadJob> | DownloadJob[],
  installId: string
): InstallProgress | undefined {
  const parts = (Array.isArray(jobs) ? jobs : Object.values(jobs)).filter(j => {
    if (j.kind !== 'binary') return false
    const e = j.extra as JobExtra
    return e?.installId === installId || e?.runtimeOf === installId
  })
  if (parts.length === 0) return undefined

  const failed = parts.find(j => j.state === 'failed' || j.state === 'cancelled')
  const allDone = parts.every(j => j.state === 'done')
  const bytesDone = parts.reduce((n, j) => n + (j.state === 'done' ? (j.bytesTotal ?? j.bytesDone) : j.bytesDone), 0)
  const bytesTotal = parts.reduce((n, j) => n + (j.bytesTotal ?? 0), 0)

  return {
    state: failed ? 'failed' : allDone ? 'done' : 'active',
    percent: allDone ? 100 : bytesTotal > 0 ? Math.min(99, Math.round((bytesDone / bytesTotal) * 100)) : 0,
    bytesDone,
    bytesTotal,
    error: failed ? (failed.errorMessage ?? `Download ${failed.state}`) : null,
    hasRuntime: parts.some(j => (j.extra as JobExtra)?.runtimeOf === installId)
  }
}
