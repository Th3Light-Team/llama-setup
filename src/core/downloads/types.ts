export type DownloadKind = 'binary' | 'model'

export type DownloadState =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'paused'

export interface DownloadJob {
  id: string
  kind: DownloadKind
  displayName: string
  url: string
  targetPath: string
  partPath: string
  metaPath: string
  extractZip: boolean
  bytesTotal: number | null
  bytesDone: number
  state: DownloadState
  errorMessage: string | null
  attempts: number
  maxAttempts: number
  sha256Expected: string | null
  sha256Actual: string | null
  etag: string | null
  /** Free-form JSON for callers (e.g. modelId/filename, binary install id). */
  extra: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface EnqueueSpec {
  kind: DownloadKind
  displayName: string
  url: string
  targetPath: string
  sha256Expected?: string | null
  extractZip?: boolean
  maxAttempts?: number
  extra?: Record<string, unknown>
  /** Optional explicit id (for idempotency). Auto-generated if omitted. */
  id?: string
}

export interface DownloadProgressEvent {
  id: string
  bytesDone: number
  bytesTotal: number | null
  state: DownloadState
}

export interface DownloadStateEvent {
  id: string
  state: DownloadState
  errorMessage?: string | null
  attempts?: number
}

export interface DownloadDoneEvent {
  id: string
  targetPath: string
}
