import { ipcMain } from 'electron'
import { BenchRunner } from '../bench/BenchRunner'
import type { BenchSpec } from '../../core/bench/types'

export function setupBenchIPC() {
  const mgr = BenchRunner.getInstance()
  mgr.init()

  ipcMain.handle('bench:start', (_e, spec: BenchSpec) => mgr.enqueue(spec))
  ipcMain.handle('bench:cancel', (_e, id: string) => mgr.cancel(id))
  ipcMain.handle('bench:remove', (_e, id: string) => mgr.remove(id))
  ipcMain.handle('bench:clearDone', () => mgr.clearFinished())
  ipcMain.handle('bench:list', () => mgr.list())
  ipcMain.handle('bench:get', (_e, id: string) => mgr.get(id))
}
