import { ipcMain } from 'electron'
import { DownloadManager } from '../downloads/DownloadManager'
import type { EnqueueSpec } from '../../core/downloads/types'

export function setupDownloadsIPC(): void {
  const mgr = DownloadManager.getInstance()
  mgr.init()

  ipcMain.handle('download:enqueue', (_e, spec: EnqueueSpec) => mgr.enqueue(spec))
  ipcMain.handle('download:cancel', (_e, id: string) => { mgr.cancel(id) })
  ipcMain.handle('download:pause', (_e, id: string) => { mgr.pause(id) })
  ipcMain.handle('download:resume', (_e, id: string) => { mgr.resume(id) })
  ipcMain.handle('download:remove', (_e, id: string) => { mgr.remove(id) })
  ipcMain.handle('download:clearDone', () => { mgr.clearFinished() })
  ipcMain.handle('download:list', () => mgr.list())
}
