/** Minimal Electron stub for unit tests running in plain Node. */
export const BrowserWindow = {
  getAllWindows: () => [] as unknown[]
}

export const app = {
  getPath: () => '/tmp/llama-studio-test',
  isReady: () => true
}

export const ipcMain = {
  handle: () => {},
  on: () => {},
  removeHandler: () => {}
}
