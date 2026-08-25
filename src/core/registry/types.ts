export interface HfModelSummary {
  id: string
  author: string
  likes: number
  downloads: number
  tags: string[]
  pipelineTag: string
  createdAt: string
}

export interface HfModelDetail {
  id: string
  author: string
  likes: number
  downloads: number
  tags: string[]
  pipelineTag: string
  createdAt: string
  lastModified: string
  architecture: string | null
  contextLength: number | null
  license: string | null
  variants: GgufVariant[]
}

export interface GgufVariant {
  filename: string
  sizeMB: number
  quantization: string
  downloadUrl: string
  /** SHA256 (LFS oid) when published by HF; null if not available. */
  sha256: string | null
  /**
   * Additional shards beyond the primary file, in part order.
   * Each entry includes its own filename, byte-size, sha256, and URL.
   * Empty for single-file variants.
   */
  shards: ShardFile[]
}

export interface ShardFile {
  filename: string
  sizeMB: number
  sha256: string | null
  downloadUrl: string
}
