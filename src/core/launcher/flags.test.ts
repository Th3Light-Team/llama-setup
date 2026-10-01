import { describe, it, expect } from 'vitest'
import { FLAG_CATALOG, buildCliArgs, buildCliPreview, getDefaultValues, getFlagsByGroup, FLAG_GROUPS } from './flags'

describe('FLAG_CATALOG consistency', () => {
  it('every number default lies within its own min/max', () => {
    for (const f of FLAG_CATALOG.filter(f => f.type === 'number')) {
      if (f.min !== undefined) expect(f.default as number, f.key).toBeGreaterThanOrEqual(f.min)
      if (f.max !== undefined) expect(f.default as number, f.key).toBeLessThanOrEqual(f.max)
    }
  })

  it('every select default is one of its options', () => {
    for (const f of FLAG_CATALOG.filter(f => f.type === 'select')) {
      expect(f.options?.map(o => o.value), f.key).toContain(f.default)
    }
  })

  it('every flag looks like a CLI flag and every group has a catalog entry', () => {
    for (const f of FLAG_CATALOG) expect(f.flag, f.key).toMatch(/^-{1,2}[a-z][a-z-]*$/)
    for (const g of FLAG_GROUPS) expect(getFlagsByGroup(g.id).length, g.id).toBeGreaterThan(0)
  })
})

describe('buildCliArgs', () => {
  it('emits flag and value as separate argv entries, in catalog order, regardless of key order in input', () => {
    const args = buildCliArgs({ port: 9000, model: '/m.gguf', ctx_size: 8192 })
    expect(args).toEqual(['-m', '/m.gguf', '-c', '8192', '--port', '9000'])
  })

  it('emits a legitimate zero when the default is non-zero (temp 0 = greedy)', () => {
    expect(buildCliArgs({ temp: 0 })).toEqual(['--temp', '0'])
  })

  it('does not emit a zero that equals the default (threads 0 = auto)', () => {
    expect(buildCliArgs({ threads: 0 })).toEqual([])
  })

  it('treats whitespace-only strings as empty', () => {
    expect(buildCliArgs({ api_key: '   ', model: '  ' })).toEqual([])
  })

  it('ignores unknown keys and undefined values', () => {
    expect(buildCliArgs({ not_a_flag: 1, ctx_size: undefined })).toEqual([])
  })

  it('keeps a model path with spaces as ONE argv entry (no shell splitting)', () => {
    expect(buildCliArgs({ model: '/My Models/a b.gguf' })).toEqual(['-m', '/My Models/a b.gguf'])
  })

  it('emits negative numbers (n_gpu_layers 0 = CPU only, seed)', () => {
    expect(buildCliArgs({ n_gpu_layers: 0, seed: 42 })).toEqual(['-ngl', '0', '-s', '42'])
  })
})

describe('buildCliPreview', () => {
  it('quotes a binary path containing spaces', () => {
    expect(buildCliPreview('/opt/My Llama/llama-server', { port: 9000 }))
      .toBe('"/opt/My Llama/llama-server" --port 9000')
  })

  it('leaves a simple path unquoted and with no args is just the binary', () => {
    expect(buildCliPreview('/opt/llama-server', getDefaultValues())).toBe('/opt/llama-server')
  })
})
