import { ipcMain } from 'electron'
import { fetchReleases } from '../../core/binaries/github'
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
  registerBinaryInstallHooks()

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
      // Returns a download job id; progress is observed via the downloads drawer.
      return installBinary(tag, asset)
    } catch (err) {
      console.error('Install failed:', err)
      throw err
    }
  })

  ipcMain.handle('binaries:uninstall', async (_, id: string) => {
    return uninstallBinary(id)
  })
}
