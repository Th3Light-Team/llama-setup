import { ipcMain } from 'electron'
import { searchModels, getModelDetail } from '../../core/registry/hf-client'
import { HfModelSummary, ShardFile } from '../../core/registry/types'
import { join } from 'path'
import { homedir } from 'os'
import { DownloadManager } from '../downloads/DownloadManager'

const MODELS_DIR = join(homedir(), '.llama-studio', 'models')

let searchCache: { query: string; sort: string; data: HfModelSummary[]; ts: number } | null = null
const CACHE_TTL = 5 * 60 * 1000

export function setupRegistryIPC() {
  ipcMain.handle('registry:search', async (_, query: string, sort?: string) => {
    const sortBy = (sort as any) || 'downloads'

    if (searchCache && searchCache.query === query && searchCache.sort === sortBy && Date.now() - searchCache.ts < CACHE_TTL) {
      return searchCache.data
    }

    const results = await searchModels(query, sortBy)
    searchCache = { query, sort: sortBy, data: results, ts: Date.now() }
    return results
  })

  ipcMain.handle('registry:detail', async (_, modelId: string) => {
    return getModelDetail(modelId)
  })

  /**
   * Enqueue a model download via DownloadManager.
   * For sharded models, every shard is enqueued as its own job so all parts
   * land in the same directory; llama.cpp opens the primary file and reads
   * the rest by convention.
   * Returns the primary download job id.
   */
  ipcMain.handle(
    'registry:download',
    async (
      _e,
      modelId: string,
      filename: string,
      downloadUrl: string,
      sha256?: string | null,
      shards?: ShardFile[]
    ) => {
      const mgr = DownloadManager.getInstance()
      const modelDir = join(MODELS_DIR, modelId.replace('/', '--'))

      const enqueueOne = (fname: string, url: string, sha: string | null, isShard: boolean) => {
        const baseName = fname.split('/').pop() || fname
        const targetPath = join(modelDir, baseName)
        const id = `model:${modelId}/${baseName}`
        return mgr.enqueue({
          id,
          kind: 'model',
          displayName: `${modelId} · ${baseName}`,
          url,
          targetPath,
          sha256Expected: sha,
          extra: { modelId, filename: baseName, isShard }
        })
      }

      const primaryId = enqueueOne(filename, downloadUrl, sha256 ?? null, false)
      for (const shard of shards ?? []) {
        enqueueOne(shard.filename, shard.downloadUrl, shard.sha256, true)
      }
      return primaryId
    }
  )

  ipcMain.handle('registry:getModelsDir', () => MODELS_DIR)
}
