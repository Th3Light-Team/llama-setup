import { BrowserWindow, ipcMain } from 'electron'
import { fetchReleases } from '../../core/binaries/github'
import { findRuntimeFor } from '../../core/binaries/select'
import {
  getInstalledBinaries,
  installBinary,
  uninstallBinary,
  registerBinaryInstallHooks
} from '../../core/binaries/manager'
import { ParsedAsset, ReleaseWithAssets } from '../../core/binaries/types'

let releasesCache: { data: ReleaseWithAssets[], timestamp: number } | null = null
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

export function setupBinariesIPC() {
  // Tell every window once an install is fully registered (after any CUDA runtime merge),
  // so lists refresh against the final state rather than the raw download events.
  registerBinaryInstallHooks(installId => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('binaries:changed', installId)
  })

  ipcMain.handle('binaries:listReleases', async (_, forceRefresh?: boolean) => {
    try {
      if (!forceRefresh && releasesCache && (Date.now() - releasesCache.timestamp < CACHE_TTL)) {
        return releasesCache.data
      }

      const releases = await fetchReleases()
      releasesCache = { data: releases, timestamp: Date.now() }
      return releases
    } catch (err) {
      console.error('Failed to fetch releases:', err)
      throw err
    }
  })

  ipcMain.handle('binaries:getInstalled', async () => {
    return getInstalledBinaries()
  })

  ipcMain.handle('binaries:install', async (_event, tag: string, asset: ParsedAsset) => {
    try {
      // CUDA engines need the matching cudart bundle from the same release.
      let runtime: ParsedAsset | undefined
      if (asset.backend.startsWith('cuda')) {
        let release = releasesCache?.data.find(r => r.tag === tag)
        if (!release) release = (await fetchReleases()).find(r => r.tag === tag)
        runtime = findRuntimeFor(release?.runtimes, asset)
      }
      // Returns a download job id; progress is observed via the downloads drawer.
      return installBinary(tag, asset, runtime)
    } catch (err) {
      console.error('Install failed:', err)
      throw err
    }
  })

  ipcMain.handle('binaries:uninstall', async (_, id: string) => {
    return uninstallBinary(id)
  })
}
