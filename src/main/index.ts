import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import './db'
import { setupDetectorIPC } from './ipc/detector'
import { setupBinariesIPC } from './ipc/binaries'
import { setupLauncherIPC } from './ipc/launcher'
import { setupRegistryIPC } from './ipc/registry'
import { setupDiscoveryIPC } from './ipc/discovery'
import { setupAppIPC } from './ipc/app'
import { setupLibraryIPC } from './ipc/library'
import { setupDownloadsIPC } from './ipc/downloads'
import { setupBenchIPC } from './ipc/bench'
import { setupEnginesIPC } from './ipc/engines'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('ping', () => 'pong')
  
  setupDetectorIPC()
  setupBinariesIPC()
  setupLauncherIPC()
  setupRegistryIPC()
  setupDiscoveryIPC()
  setupAppIPC()
  setupLibraryIPC()
  setupDownloadsIPC()
  setupBenchIPC()
  setupEnginesIPC()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
