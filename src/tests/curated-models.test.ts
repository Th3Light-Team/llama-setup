/**
 * Offline sanity checks for the hand-curated model catalog. Stale or malformed
 * entries here surface to users as 404s in the Featured tab. The online
 * existence check lives in curated-models.network.test.ts (opt-in).
 */
import { describe, it, expect } from 'vitest'
import {
  CURATED_MODELS,
  CURATED_AUTHORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER
} from '../renderer/data/curated-models'

const CATEGORIES = ['small', 'chat', 'code', 'general']
const REPO_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/

describe('CURATED_MODELS', () => {
  it('is non-empty', () => {
    expect(CURATED_MODELS.length).toBeGreaterThan(0)
  })

  it('has unique ids (case-insensitive)', () => {
    const ids = CURATED_MODELS.map(m => m.id.toLowerCase())
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(dupes).toEqual([])
  })

  it.each(CURATED_MODELS.map(m => [m.id, m] as const))('%s is well-formed', (_id, m) => {
    expect(m.id).toMatch(REPO_ID)
    expect(CATEGORIES).toContain(m.category)
    expect(typeof m.minVramGB).toBe('number')
    expect(Number.isFinite(m.minVramGB)).toBe(true)
    expect(m.minVramGB).toBeGreaterThan(0)
    expect(typeof m.contextK).toBe('number')
    expect(m.contextK).toBeGreaterThan(0)
    expect(m.recQuant.trim()).not.toBe('')
    expect(m.recQuant).not.toMatch(/\s/)
    expect(m.family.trim()).not.toBe('')
    expect(m.author.trim()).not.toBe('')
    expect(m.description.trim()).not.toBe('')
    expect(Array.isArray(m.tags)).toBe(true)
  })

  it('every entry points at a GGUF repo (the downloader needs .gguf files)', () => {
    const bad = CURATED_MODELS.filter(m => !/gguf/i.test(m.id)).map(m => m.id)
    expect(bad).toEqual([])
  })

  it('every category has at least one model', () => {
    for (const c of CATEGORIES) {
      expect(CURATED_MODELS.some(m => m.category === c), c).toBe(true)
    }
  })
})

describe('category metadata', () => {
  it('CATEGORY_ORDER and CATEGORY_LABELS cover exactly the valid categories', () => {
    expect([...CATEGORY_ORDER].sort()).toEqual([...CATEGORIES].sort())
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORIES].sort())
  })
})

describe('CURATED_AUTHORS', () => {
  it('has unique, slash-free HF org slugs', () => {
    const ids = CURATED_AUTHORS.map(a => a.id.toLowerCase())
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of CURATED_AUTHORS) {
      expect(a.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
      expect(a.label.trim()).not.toBe('')
    }
  })
})
