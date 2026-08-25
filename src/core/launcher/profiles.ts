import { db } from '../../main/db'
import { Profile, FlagValues } from './types'
import { getDefaultValues } from './flags'
import { randomUUID } from 'crypto'

export function listProfiles(): Profile[] {
  const rows = db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all() as any[]
  return rows.map(r => ({
    ...r,
    flags: JSON.parse(r.flags)
  }))
}

export function getProfile(id: string): Profile | null {
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as any
  if (!row) return null
  return { ...row, flags: JSON.parse(row.flags) }
}

export function createProfile(name: string, description: string, backend: string, flags?: FlagValues): Profile {
  const id = randomUUID()
  const now = new Date().toISOString()
  const profileFlags = flags || getDefaultValues()

  db.prepare(`
    INSERT INTO profiles (id, name, description, backend, created_at, flags)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, description, backend, now, JSON.stringify(profileFlags))

  return { id, name, description, backend, created_at: now, flags: profileFlags }
}

export function updateProfile(id: string, updates: Partial<Pick<Profile, 'name' | 'description' | 'flags'>>): void {
  const existing = getProfile(id)
  if (!existing) throw new Error('Profile not found')

  const name = updates.name ?? existing.name
  const description = updates.description ?? existing.description
  const flags = updates.flags ?? existing.flags

  db.prepare(`
    UPDATE profiles SET name = ?, description = ?, flags = ? WHERE id = ?
  `).run(name, description, JSON.stringify(flags), id)
}

export function deleteProfile(id: string): void {
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
}
