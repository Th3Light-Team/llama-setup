import { ipcMain, shell } from 'electron'
import { join, basename } from 'path'
import { readdir, stat, readFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { getSettings, isInsideAnyModelDir, allModelDirs } from '../settings'

export interface LocalModel {
  modelId: string
  filename: string
  path: string
  sizeMb: number
  downloadedAt: string | null
  meta: Record<string, unknown> | null
  /** Absolute root the model lives in — one of `getSettings().modelsDir | extraModelsDirs`. */
  folderPath: string
  /** True for the default download folder. */
  isDefaultFolder: boolean
}

/**
 * Walk one model-root folder.  We expect the layout the downloader produces:
 *   <root>/<author--repo>/<file.gguf>
 * but tolerate flat `<root>/<file.gguf>` for user-imported folders.
 */
async function scanFolder(root: string, isDefault: boolean): Promise<LocalModel[]> {
  if (!existsSync(root)) return []

  const models: LocalModel[] = []
  let entries: string[] = []
  try { entries = await readdir(root) } catch { return [] }

  // First pass: GGUFs directly under the root (user-imported flat layout).
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.gguf')) continue
    const filePath = join(root, entry)
    try {
      const s = await stat(filePath)
      if (!s.isFile()) continue
      models.push({
        modelId: basename(root),
        filename: entry,
        path: filePath,
        sizeMb: Math.round(s.size / 1024 / 1024),
        downloadedAt: s.mtime.toISOString(),
        meta: null,
        folderPath: root,
        isDefaultFolder: isDefault,
      })
    } catch { /* skip */ }
  }

  // Second pass: <root>/<author--repo>/*.gguf
  for (const dir of entries) {
    const dirPath = join(root, dir)
    let sub: string[] = []
    try {
      const s = await stat(dirPath)
      if (!s.isDirectory()) continue
      sub = await readdir(dirPath)
    } catch { continue }

    let meta: Record<string, unknown> | null = null
    const metaPath = join(dirPath, '_meta.json')
    if (existsSync(metaPath)) {
      try { meta = JSON.parse(await readFile(metaPath, 'utf-8')) } catch { /* ignore */ }
    }

    for (const file of sub) {
      if (!file.toLowerCase().endsWith('.gguf')) continue
      const filePath = join(dirPath, file)
      try {
        const s = await stat(filePath)
        if (!s.isFile()) continue
        models.push({
          modelId: dir.replace('--', '/'),
          filename: file,
          path: filePath,
          sizeMb: Math.round(s.size / 1024 / 1024),
          downloadedAt: s.mtime.toISOString(),
          meta,
          folderPath: root,
          isDefaultFolder: isDefault,
        })
      } catch { /* skip */ }
    }
  }

  return models
}

async function scanLibrary(): Promise<LocalModel[]> {
  const settings = getSettings()
  const roots: { path: string; isDefault: boolean }[] = [
    { path: settings.modelsDir, isDefault: true },
    ...settings.extraModelsDirs.map(p => ({ path: p, isDefault: false })),
  ]
  const perFolder = await Promise.all(roots.map(r => scanFolder(r.path, r.isDefault)))
  const all = perFolder.flat()

  // Same path can appear twice if a user accidentally adds an ancestor;
  // dedupe by absolute path while preserving folder priority (default wins).
  const seen = new Set<string>()
  const deduped: LocalModel[] = []
  for (const m of all) {
    const key = m.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(m)
  }

  return deduped.sort((a, b) => (b.downloadedAt ?? '').localeCompare(a.downloadedAt ?? ''))
}

export function setupLibraryIPC() {
  ipcMain.handle('library:list', () => scanLibrary())

  /** Surfaces the configured folders so the Library UI can build its chip-bar. */
  ipcMain.handle('library:folders', () => {
    const settings = getSettings()
    return [
      { path: settings.modelsDir, isDefault: true },
      ...settings.extraModelsDirs.map(p => ({ path: p, isDefault: false })),
    ]
  })

  ipcMain.handle('library:reveal', async (_, filePath: string) => {
    // Allowlist against every configured root — the v0.1 traversal guard now
    // accepts default + extras, so users can reveal files in any added folder.
    if (!isInsideAnyModelDir(filePath)) {
      throw new Error('Path is not inside any configured model folder')
    }
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('library:delete', async (_, filePath: string) => {
    if (!isInsideAnyModelDir(filePath)) {
      throw new Error('Path is not inside any configured model folder')
    }
    if (!filePath.toLowerCase().endsWith('.gguf')) {
      throw new Error('Only .gguf files can be deleted via this API')
    }
    await rm(filePath, { force: true })
  })

  /**
   * Append a folder to extraModelsDirs.  Refuses to add the default folder
   * (already scanned) or duplicates.  Returns the updated folder list.
   */
  ipcMain.handle('library:addFolder', async (_, folderPath: string) => {
    if (typeof folderPath !== 'string' || folderPath.trim() === '') {
      throw new Error('Invalid folder path')
    }
    if (!existsSync(folderPath)) {
      throw new Error('Folder does not exist')
    }
    const settings = getSettings()
    if (folderPath === settings.modelsDir) {
      throw new Error('That folder is already the default models directory')
    }
    if (settings.extraModelsDirs.includes(folderPath)) {
      throw new Error('Folder already added')
    }
    // Reuse the same KV writer so defaults/dedup logic stays in one place.
    const { setSettings } = await import('../settings')
    setSettings({ extraModelsDirs: [...settings.extraModelsDirs, folderPath] })
    return allModelDirs()
  })

  ipcMain.handle('library:removeFolder', async (_, folderPath: string) => {
    const settings = getSettings()
    if (folderPath === settings.modelsDir) {
      throw new Error('Cannot remove the default models folder; change it in Settings instead.')
    }
    const { setSettings } = await import('../settings')
    setSettings({ extraModelsDirs: settings.extraModelsDirs.filter(p => p !== folderPath) })
    return allModelDirs()
  })
}
