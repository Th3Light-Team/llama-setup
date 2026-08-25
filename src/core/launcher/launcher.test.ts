import { describe, it, expect } from 'vitest'
import { buildCliArgs, getDefaultValues, FLAG_CATALOG } from './flags'
import { estimateVram } from './vram'

describe('Flag Builder', () => {
  it('returns empty args when all values are default', () => {
    const defaults = getDefaultValues()
    const args = buildCliArgs(defaults)
    expect(args).toEqual([])
  })

  it('emits boolean flags only when true and non-default', () => {
    const values = { ...getDefaultValues(), verbose: true }
    const args = buildCliArgs(values)
    expect(args).toContain('-v')
  })

  it('omits boolean flags that are default-true and still true', () => {
    // flash_attn defaults to true, so setting it true should NOT emit
    const values = { ...getDefaultValues(), flash_attn: true }
    const args = buildCliArgs(values)
    expect(args).not.toContain('-fa')
  })

  it('emits number flags when changed from default', () => {
    const values = { ...getDefaultValues(), ctx_size: 8192, temp: 0.6 }
    const args = buildCliArgs(values)
    expect(args).toContain('-c')
    expect(args).toContain('8192')
    expect(args).toContain('--temp')
    expect(args).toContain('0.6')
  })

  it('skips empty string values', () => {
    const values = { ...getDefaultValues(), api_key: '' }
    const args = buildCliArgs(values)
    expect(args).not.toContain('--api-key')
  })

  it('emits string flags when set', () => {
    const values = { ...getDefaultValues(), model: '/path/to/model.gguf' }
    const args = buildCliArgs(values)
    expect(args).toContain('-m')
    expect(args).toContain('/path/to/model.gguf')
  })

  it('emits select flags when changed', () => {
    const values = { ...getDefaultValues(), cache_type_k: 'q8_0' }
    const args = buildCliArgs(values)
    expect(args).toContain('-ctk')
    expect(args).toContain('q8_0')
  })

  it('catalog has no duplicate keys', () => {
    const keys = FLAG_CATALOG.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('catalog has no duplicate flags', () => {
    const flags = FLAG_CATALOG.map(f => f.flag)
    expect(new Set(flags).size).toBe(flags.length)
  })

  it('all flags have valid groups', () => {
    const validGroups = ['core', 'gpu', 'context', 'sampling', 'server', 'experimental']
    for (const flag of FLAG_CATALOG) {
      expect(validGroups).toContain(flag.group)
    }
  })
})

describe('VRAM Estimator', () => {
  it('estimates VRAM for a 7B model with defaults', () => {
    const defaults = getDefaultValues()
    const result = estimateVram(4096, 24576, defaults)

    expect(result.modelMB).toBeGreaterThan(0)
    expect(result.kvCacheMB).toBeGreaterThan(0)
    expect(result.overheadMB).toBeGreaterThan(0)
    expect(result.totalMB).toBe(result.modelMB + result.kvCacheMB + result.overheadMB)
    expect(result.fitsInVram).toBe(true) // 4GB model in 24GB VRAM
    expect(result.utilizationPercent).toBeGreaterThan(0)
    expect(result.utilizationPercent).toBeLessThan(100)
  })

  it('reports not fitting when model exceeds VRAM', () => {
    const defaults = getDefaultValues()
    const result = estimateVram(30000, 8192, defaults) // 30GB model in 8GB VRAM

    expect(result.fitsInVram).toBe(false)
    expect(result.utilizationPercent).toBeGreaterThan(100)
  })

  it('reduces VRAM when fewer GPU layers are offloaded', () => {
    const defaults = getDefaultValues()
    const fullOffload = estimateVram(4096, 24576, { ...defaults, n_gpu_layers: -1 })
    const halfOffload = estimateVram(4096, 24576, { ...defaults, n_gpu_layers: 16 })

    expect(halfOffload.modelMB).toBeLessThan(fullOffload.modelMB)
    expect(halfOffload.totalMB).toBeLessThan(fullOffload.totalMB)
  })

  it('increases VRAM with larger context size', () => {
    const defaults = getDefaultValues()
    const small = estimateVram(4096, 24576, { ...defaults, ctx_size: 2048 })
    const large = estimateVram(4096, 24576, { ...defaults, ctx_size: 32768 })

    expect(large.kvCacheMB).toBeGreaterThan(small.kvCacheMB)
  })

  it('reduces KV cache with quantized cache types', () => {
    const defaults = getDefaultValues()
    const f16 = estimateVram(4096, 24576, { ...defaults, cache_type_k: 'f16', cache_type_v: 'f16' })
    const q4 = estimateVram(4096, 24576, { ...defaults, cache_type_k: 'q4_0', cache_type_v: 'q4_0' })

    expect(q4.kvCacheMB).toBeLessThan(f16.kvCacheMB)
  })

  it('flash attention reduces KV cache estimate', () => {
    const defaults = getDefaultValues()
    const withFlash = estimateVram(4096, 24576, { ...defaults, flash_attn: true })
    const withoutFlash = estimateVram(4096, 24576, { ...defaults, flash_attn: false })

    expect(withFlash.kvCacheMB).toBeLessThan(withoutFlash.kvCacheMB)
  })

  it('more parallel slots increases KV cache', () => {
    const defaults = getDefaultValues()
    const oneSlot = estimateVram(4096, 24576, { ...defaults, n_parallel: 1 })
    const fourSlots = estimateVram(4096, 24576, { ...defaults, n_parallel: 4 })

    expect(fourSlots.kvCacheMB).toBeGreaterThan(oneSlot.kvCacheMB)
  })

  it('handles zero VRAM gracefully', () => {
    const defaults = getDefaultValues()
    const result = estimateVram(4096, 0, defaults)

    expect(result.fitsInVram).toBe(true) // No VRAM = no constraint (CPU mode)
    expect(result.utilizationPercent).toBe(0)
  })
})
