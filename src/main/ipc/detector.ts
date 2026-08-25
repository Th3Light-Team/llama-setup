import { ipcMain } from 'electron'
import { db } from '../db'
import { detectHardware } from '../../core/detector'
import { DetectionResult } from '../../core/types'

// TTL for hardware detection cache: 1 hour
const CACHE_TTL_MS = 60 * 60 * 1000

export function setupDetectorIPC() {
  ipcMain.handle('detectHardware', async (_, forceRecheck?: boolean) => {
    try {
      if (!forceRecheck) {
        // Try to load from cache
        const row = db.prepare('SELECT result, updated_at FROM detection_cache WHERE id = 1').get() as { result: string, updated_at: string } | undefined
        
        if (row) {
          const updatedAt = parseInt(row.updated_at, 10)
          if (Date.now() - updatedAt < CACHE_TTL_MS) {
            return JSON.parse(row.result) as DetectionResult
          }
        }
      }

      // Run fresh detection
      const result = await detectHardware()
      
      // Save to cache
      const stmt = db.prepare(`
        INSERT INTO detection_cache (id, result, updated_at) 
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          result = excluded.result, 
          updated_at = excluded.updated_at
      `)
      
      stmt.run(JSON.stringify(result), Date.now().toString())

      return result
    } catch (err) {
      console.error('Hardware detection failed:', err)
      throw err
    }
  })
}
