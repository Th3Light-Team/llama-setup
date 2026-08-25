import { ipcMain } from 'electron'
import { listEngines, setDefaultEngine, getDefaultEngine, verifyEngine } from '../engines'

export function setupEnginesIPC() {
  ipcMain.handle('engines:list', (_e, force?: boolean) => listEngines(!!force))
  ipcMain.handle('engines:setDefault', (_e, path: string) => setDefaultEngine(path))
  ipcMain.handle('engines:getDefault', () => getDefaultEngine())
  ipcMain.handle('engines:verify', (_e, installPath: string) => verifyEngine(installPath))
}
