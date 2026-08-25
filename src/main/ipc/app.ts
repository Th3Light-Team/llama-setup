import { ipcMain, dialog, BrowserWindow } from 'electron'
import { dirname, parse } from 'path'
import { statfs } from 'fs/promises'
import { existsSync } from 'fs'
import { db } from '../db'
import { getSettings as readSettings, setSettings as writeSettings, type AppSettings } from '../settings'

export interface OnboardingState {
  completedAt: string | null
  skippedSteps: string[]
  version: string
}

export type { AppSettings } from '../settings'

function getKv(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_kv WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setKv(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run(key, value)
}

export function setupAppIPC() {
  ipcMain.handle('app:getOnboardingState', (): OnboardingState | null => {
    const raw = getKv('onboarding')
    if (!raw) return null
    try { return JSON.parse(raw) as OnboardingState } catch { return null }
  })

  ipcMain.handle('app:setOnboardingState', (_event, state: Partial<OnboardingState>) => {
    const existing = (() => {
      const raw = getKv('onboarding')
      if (!raw) return null
      try { return JSON.parse(raw) as OnboardingState } catch { return null }
    })()
    const next: OnboardingState = {
      completedAt: state.completedAt ?? existing?.completedAt ?? null,
      skippedSteps: state.skippedSteps ?? existing?.skippedSteps ?? [],
      version: state.version ?? existing?.version ?? '1',
    }
    setKv('onboarding', JSON.stringify(next))
    return next
  })

  ipcMain.handle('app:resetOnboarding', () => {
    setKv('onboarding', JSON.stringify({ completedAt: null, skippedSteps: [], version: '1' }))
  })

  ipcMain.handle('app:getSettings', (): AppSettings => readSettings())

  ipcMain.handle('app:setSettings', (_event, settings: Partial<AppSettings>) => writeSettings(settings))

  /**
   * OS folder picker.  Used by Settings ("Add folder…") and Library
   * ("+ Add folder…" chip) to add an additional model folder.  Returns
   * the selected absolute path, or null if the user cancelled.
   */
  ipcMain.handle('app:pickFolder', async (_event, opts?: { title?: string }): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: opts?.title ?? 'Select folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('app:diskFree', async (_event, targetPath?: string): Promise<number | null> => {
    const start = targetPath ?? readSettings().modelsDir
    // Walk up to the nearest ancestor that exists.  statfs() needs a real path —
    // on first run the models dir hasn't been created yet, which previously
    // returned null and made the Download dialog show "Disk space: Unknown".
    let dir = start
    const root = parse(dir).root
    while (!existsSync(dir) && dir !== root) dir = dirname(dir)
    try {
      const stat = await statfs(dir)
      // bavail = blocks available to unprivileged users; bsize = block size in bytes
      return Math.round((stat.bavail * stat.bsize) / (1024 * 1024 * 1024) * 10) / 10
    } catch {
      return null
    }
  })
}
