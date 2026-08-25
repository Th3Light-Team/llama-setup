import { HfModelSummary, HfModelDetail, GgufVariant, ShardFile } from './types'

const HF_API_URL = 'https://huggingface.co/api'

/**
 * Search HuggingFace for GGUF models.
 */
export async function searchModels(
  query: string,
  sort: 'downloads' | 'likes' | 'lastModified' = 'downloads',
  limit = 20
): Promise<HfModelSummary[]> {
  const searchTerm = query ? `${query} gguf` : 'gguf'
  const url = `${HF_API_URL}/models?search=${encodeURIComponent(searchTerm)}&sort=${sort}&direction=-1&limit=${limit}&filter=gguf`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Llama-Studio-App' }
  })

  if (!res.ok) throw new Error(`HF API error: ${res.statusText}`)

  const data: any[] = await res.json()

  return data.map(m => ({
    id: m.id || m.modelId,
    author: m.author || m.id?.split('/')[0] || 'unknown',
    likes: m.likes || 0,
    downloads: m.downloads || 0,
    tags: m.tags || [],
    pipelineTag: m.pipeline_tag || 'text-generation',
    createdAt: m.createdAt || ''
  }))
}

/**
 * Get full model details including GGUF file variants.
 */
export async function getModelDetail(modelId: string): Promise<HfModelDetail> {
  const url = `${HF_API_URL}/models/${modelId}?blobs=true`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Llama-Studio-App' }
  })

  if (!res.ok) throw new Error(`HF API error: ${res.statusText}`)

  const data: any = await res.json()

  // Extract license from tags
  const licenseTag = (data.tags || []).find((t: string) => t.startsWith('license:'))
  const license = licenseTag ? licenseTag.replace('license:', '') : null

  // Parse GGUF variants from siblings
  const variants = parseGgufVariants(modelId, data.siblings || [])

  return {
    id: data.id || data.modelId,
    author: data.author || data.id?.split('/')[0] || 'unknown',
    likes: data.likes || 0,
    downloads: data.downloads || 0,
    tags: data.tags || [],
    pipelineTag: data.pipeline_tag || 'text-generation',
    createdAt: data.createdAt || '',
    lastModified: data.lastModified || '',
    architecture: data.gguf?.architecture || data.config?.model_type || null,
    contextLength: data.gguf?.context_length || null,
    license,
    variants
  }
}

/**
 * Match the multi-part shard suffix, e.g. "-00001-of-00003".
 * Captures (1) part index, (2) total parts.
 */
const SHARD_RE = /-(\d{1,5})-of-(\d{1,5})(?=\.gguf$)/i

/**
 * Group key for variants: strip the shard suffix so all parts of one model collapse.
 */
function variantKey(filename: string): string {
  return filename.replace(SHARD_RE, '')
}

/**
 * Parse the siblings array from HF API into typed GGUF variants.
 * Filters only .gguf files that look like model weights (not imatrix, not mmproj).
 * Multi-part shards (-00001-of-00003) collapse into a single variant whose
 * `shards` array carries the additional parts; downloading the variant must
 * fetch all shards together to produce a usable model.
 */
export function parseGgufVariants(modelId: string, siblings: any[]): GgufVariant[] {
  const eligible = siblings
    .filter(s => {
      const name = (s.rfilename || '').toLowerCase()
      if (!name.endsWith('.gguf')) return false
      if (name.includes('imatrix')) return false
      if (name.includes('mmproj')) return false
      return true
    })
    .map(s => {
      const filename = s.rfilename as string
      const sizeBytes = s.size || s.lfs?.size || 0
      const shardMatch = filename.match(SHARD_RE)
      return {
        filename,
        sizeBytes,
        sha256: (s.lfs?.oid as string) || null,
        shardIndex: shardMatch ? parseInt(shardMatch[1], 10) : null,
        shardTotal: shardMatch ? parseInt(shardMatch[2], 10) : null,
      }
    })

  // Group by stripped key.  Single-file variants form a group of one.
  const groups = new Map<string, typeof eligible>()
  for (const file of eligible) {
    const key = variantKey(file.filename)
    let bucket = groups.get(key)
    if (!bucket) { bucket = []; groups.set(key, bucket) }
    bucket.push(file)
  }

  const variants: GgufVariant[] = []
  for (const [, files] of groups) {
    // Order shards by part index so part 1 leads.
    files.sort((a, b) => (a.shardIndex ?? 0) - (b.shardIndex ?? 0))
    const primary = files[0]
    const rest = files.slice(1)

    const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0)
    const sizeMB = Math.round(totalBytes / (1024 * 1024))

    const shards: ShardFile[] = rest.map(f => ({
      filename: f.filename,
      sizeMB: Math.round(f.sizeBytes / (1024 * 1024)),
      sha256: f.sha256,
      downloadUrl: `https://huggingface.co/${modelId}/resolve/main/${f.filename}`,
    }))

    variants.push({
      filename: primary.filename,
      sizeMB,
      quantization: extractQuantization(primary.filename),
      downloadUrl: `https://huggingface.co/${modelId}/resolve/main/${primary.filename}`,
      sha256: primary.sha256,
      shards,
    })
  }

  return variants.sort((a, b) => a.sizeMB - b.sizeMB)
}

/**
 * Extract quantization type from filename.
 * Examples:
 *   "model-Q4_K_M.gguf"   → "Q4_K_M"
 *   "model-IQ2_XXS.gguf"  → "IQ2_XXS"
 *   "model-BF16.gguf"     → "BF16"
 *   "model-F16.gguf"      → "F16"
 */
export function extractQuantization(filename: string): string {
  // Remove directory prefix (e.g., "BF16/model-BF16-00001-of-00002.gguf")
  const basename = filename.split('/').pop() || filename

  // Known quantization patterns
  const patterns = [
    // IQ variants (must check before Q variants)
    /(?:^|[-_.])(IQ[1-4]_(?:XXS|XS|S|M|NL|K_S|K_M))/i,
    // Unsloth UD prefix variants — stop at shard suffix or extension
    /(?:^|[-_.])(UD[-_](?:IQ|Q)[0-9](?:_K(?:_(?:XS|S|M|L|XL))?|_[0-9])?)/i,
    // Standard Q variants
    /(?:^|[-_.])(Q[0-9]+_K(?:_(?:XS|S|M|L|XL))?)/i,
    /(?:^|[-_.])(Q[0-9]+_[0-9])/i,
    // Special format types
    /(?:^|[-_.])(MXFP4_MOE|MXFP4)/i,
    // Float types
    /(?:^|[-_.])(BF16|F16|F32)/i,
  ]

  for (const pattern of patterns) {
    const match = basename.match(pattern)
    if (match) return match[1].toUpperCase()
  }

  return 'Unknown'
}
