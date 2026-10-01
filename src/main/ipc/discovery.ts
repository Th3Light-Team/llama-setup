import { ipcMain } from 'electron'
import { db } from '../db'
import { runDiscoveryScan, verifyBinary } from '../../core/discovery'
import type { InstallationScan, ScanOptions } from '../../core/discovery/types'

// TTL for discovery scan cache: 30 minutes
const CACHE_TTL_MS = 30 * 60 * 1000

export function setupDiscoveryIPC() {
  /**
   * Run a discovery scan (optionally from cache).
   */
  ipcMain.handle('discovery:scan', async (_, options?: ScanOptions & { forceRescan?: boolean }) => {
    try {
      const forceRescan = options?.forceRescan ?? false

      if (!forceRescan) {
        // Try to load from cache
        const row = db.prepare('SELECT result, updated_at FROM discovery_cache WHERE id = 1').get() as
          { result: string; updated_at: string } | undefined

        if (row) {
          const updatedAt = parseInt(row.updated_at, 10)
          if (Date.now() - updatedAt < CACHE_TTL_MS) {
            return JSON.parse(row.result) as InstallationScan
          }
        }
      }

      // Run fresh scan
      const result = await runDiscoveryScan(options)

      // Save to cache
      const stmt = db.prepare(`
        INSERT INTO discovery_cache (id, result, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          result = excluded.result,
          updated_at = excluded.updated_at
      `)
      stmt.run(JSON.stringify(result), Date.now().toString())

      return result
    } catch (err) {
      console.error('Discovery scan failed:', err)
      throw err
    }
  })

  /**
   * Deep verify a specific binary.
   */
  ipcMain.handle('discovery:verify', async (_, binaryPath: string) => {
    try {
      return await verifyBinary(binaryPath)
    } catch (err) {
      console.error('Binary verification failed:', err)
      throw err
    }
  })

  /**
   * Import an external binary into the managed installs table.
   */
  ipcMain.handle('discovery:import', async (_, binaryPath: string, backend?: string) => {
    try {
      const { extractVersion, fastFingerprint } = await import('../../core/discovery/health')
      const { existsSync } = await import('fs')
      const { dirname } = await import('path')

      if (!existsSync(binaryPath)) {
        throw new Error(`Binary not found at: ${binaryPath}`)
      }

      const version = await extractVersion(binaryPath)
      const installDir = dirname(binaryPath)
      const buildTag = version?.build ? `b${version.build}` : 'external'
      const resolvedBackend = backend || 'unknown'
      const installId = `external-${fastFingerprint(binaryPath)}`

      // Check if already imported
      const existing = db.prepare('SELECT id FROM installs WHERE id = ?').get(installId)
      if (existing) {
        throw new Error('This binary has already been imported')
      }

      const stmt = db.prepare(`
        INSERT INTO installs (id, tag, backend, install_date, verified, path, binary_path, health_status, version_raw, version_build)
        VALUES (?, ?, ?, ?, 1, ?, ?, 'healthy', ?, ?)
      `)
      stmt.run(
        installId,
        buildTag,
        resolvedBackend,
        new Date().toISOString(),
        installDir,
        binaryPath,
        version?.raw || null,
        version?.build || null
      )

      // Invalidate discovery cache so next scan picks up the new managed install
      db.prepare('DELETE FROM discovery_cache WHERE id = 1').run()

      return {
        id: installId,
        tag: buildTag,
        backend: resolvedBackend,
        install_date: new Date().toISOString(),
        verified: true,
        path: installDir
      }
    } catch (err) {
      console.error('Import failed:', err)
      throw err
    }
  })

  /**
   * Get the last cached scan result without running a new scan.
   */
  ipcMain.handle('discovery:getLastScan', async () => {
    try {
      const row = db.prepare('SELECT result FROM discovery_cache WHERE id = 1').get() as
        { result: string } | undefined

      return row ? JSON.parse(row.result) as InstallationScan : null
    } catch {
      return null
    }
  })
}
