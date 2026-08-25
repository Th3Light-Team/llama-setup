import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { startServer, stopServer, getServerStatus, setLogCallback } from '../../core/launcher/server'
import { listProfiles, createProfile, updateProfile, deleteProfile } from '../../core/launcher/profiles'
import { FLAG_CATALOG, buildCliPreview, getDefaultValues } from '../../core/launcher/flags'
import { db } from '../db'
import { randomUUID } from 'crypto'
import { listJobs } from '../downloads/repo'
import { verifyAuditStamp, type AuditStamp } from '../security/launch-guard'

export function setupLauncherIPC() {
  // --- Flag catalog ---
  ipcMain.handle('launcher:getFlagCatalog', () => FLAG_CATALOG)
  ipcMain.handle('launcher:getDefaultValues', () => getDefaultValues())
  ipcMain.handle('launcher:buildCliPreview', (_, binaryPath: string, values: Record<string, any>) => {
    return buildCliPreview(binaryPath, values)
  })

  // --- Server lifecycle ---
  ipcMain.handle('launcher:start', async (event, installPath: string, flagValues: Record<string, any>) => {
    // ── TOCTOU guard ────────────────────────────────────────────────────────
    // If a model path is configured, verify its file identity matches the
    // stamp recorded at audit time.  This detects file swaps that could occur
    // in the window between downloading / auditing and actually launching the
    // server (symlink swap, filesystem race, malicious replacement).
    const modelPath: string | undefined = flagValues['model']
    if (modelPath) {
      const jobs = listJobs()
      const job = jobs.find(j => j.kind === 'model' && j.targetPath === modelPath && j.state === 'done')
      const stamp = (job?.extra as { auditStamp?: AuditStamp } | null)?.auditStamp

      if (stamp) {
        // A stamp exists — enforce the check.
        const check = await verifyAuditStamp(modelPath, stamp)
        if (!check.ok) {
          return {
            state: 'error',
            pid: null,
            port: null,
            error: `Launch blocked: ${check.reason}`,
            uptime: null
          }
        }
      } else {
        // No stamp means the model was not downloaded through the audited
        // pipeline (e.g. manually placed).  Log a warning but allow launch
        // so existing workflows aren't broken.  In a future hardening pass
        // this could be made a hard block.
        console.warn(`[launch-guard] No audit stamp for model "${modelPath}" — skipping TOCTOU check.`)
      }
    }

    // Wire log streaming to renderer
    setLogCallback((line: string) => {
      try {
        const windows = BrowserWindow.getAllWindows()
        windows.forEach(w => w.webContents.send('launcher:log', line))
      } catch { /* window may be closed */ }
    })

    return startServer(installPath, flagValues)
  })

  ipcMain.handle('launcher:stop', () => {
    const status = stopServer()
    setLogCallback(null)
    return status
  })

  ipcMain.handle('launcher:status', () => {
    return getServerStatus()
  })

  // --- Profile management ---
  ipcMain.handle('launcher:listProfiles', () => listProfiles())

  ipcMain.handle('launcher:createProfile', (_, name: string, description: string, backend: string, flags?: Record<string, any>) => {
    return createProfile(name, description, backend, flags)
  })

  ipcMain.handle('launcher:updateProfile', (_, id: string, updates: any) => {
    return updateProfile(id, updates)
  })

  ipcMain.handle('launcher:deleteProfile', (_, id: string) => {
    return deleteProfile(id)
  })

  ipcMain.handle('launcher:duplicateProfile', (_, id: string) => {
    const all = listProfiles()
    const src = all.find(p => p.id === id)
    if (!src) throw new Error('Profile not found')
    return createProfile(`${src.name} (copy)`, src.description ?? '', src.backend ?? 'cpu', src.flags)
  })

  ipcMain.handle('launcher:exportProfile', async (_, id: string) => {
    const all = listProfiles()
    const profile = all.find(p => p.id === id)
    if (!profile) throw new Error('Profile not found')

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export profile',
      defaultPath: `${profile.name.replace(/[^a-z0-9]/gi, '_')}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, JSON.stringify(profile, null, 2), 'utf-8')
    return filePath
  })

  ipcMain.handle('launcher:importProfile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import profile',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return null
    const raw = await readFile(filePaths[0], 'utf-8')
    const data = JSON.parse(raw)
    return createProfile(
      data.name ?? 'Imported profile',
      data.description ?? '',
      data.backend ?? 'cpu',
      data.flags ?? {}
    )
  })

  // Run history
  ipcMain.handle('launcher:recordRun', (_, profileId: string) => {
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO profile_runs (id, profile_id, started_at) VALUES (?, ?, ?)').run(id, profileId, now)
    return id
  })

  ipcMain.handle('launcher:stopRun', (_, runId: string, exitCode: number) => {
    db.prepare('UPDATE profile_runs SET stopped_at = ?, exit_code = ? WHERE id = ?')
      .run(new Date().toISOString(), exitCode, runId)
  })

  ipcMain.handle('launcher:listRuns', (_, profileId: string) => {
    return db.prepare('SELECT * FROM profile_runs WHERE profile_id = ? ORDER BY started_at DESC LIMIT 10').all(profileId)
  })
}
