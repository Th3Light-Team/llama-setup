import { describe, it, expect } from 'vitest'
import { extractQuantization, parseGgufVariants } from './hf-client'

describe('HuggingFace GGUF Parsing', () => {
  describe('extractQuantization', () => {
    it('extracts standard Q variants', () => {
      expect(extractQuantization('model-Q4_K_M.gguf')).toBe('Q4_K_M')
      expect(extractQuantization('model-Q5_K_S.gguf')).toBe('Q5_K_S')
      expect(extractQuantization('model-Q8_0.gguf')).toBe('Q8_0')
      expect(extractQuantization('model-Q6_K.gguf')).toBe('Q6_K')
    })

    it('extracts IQ variants', () => {
      expect(extractQuantization('model-IQ2_XXS.gguf')).toBe('IQ2_XXS')
      expect(extractQuantization('model-IQ3_S.gguf')).toBe('IQ3_S')
      expect(extractQuantization('model-IQ4_NL.gguf')).toBe('IQ4_NL')
    })

    it('extracts float types', () => {
      expect(extractQuantization('model-F16.gguf')).toBe('F16')
      expect(extractQuantization('model-BF16.gguf')).toBe('BF16')
      expect(extractQuantization('model-F32.gguf')).toBe('F32')
    })

    it('extracts from path-prefixed filenames', () => {
      expect(extractQuantization('BF16/model-BF16-00001-of-00002.gguf')).toBe('BF16')
    })

    it('extracts UD prefix variants', () => {
      // IQ patterns match before UD pattern, so IQ wins
      expect(extractQuantization('model-UD-IQ2_M.gguf')).toBe('IQ2_M')
      // UD-Q pattern matches before plain Q pattern
      expect(extractQuantization('model-UD-Q4_K_M.gguf')).toBe('UD-Q4_K_M')
    })

    it('extracts MXFP4 variants', () => {
      expect(extractQuantization('model-MXFP4_MOE.gguf')).toBe('MXFP4_MOE')
    })

    it('returns Unknown for unrecognized patterns', () => {
      expect(extractQuantization('random-file.gguf')).toBe('Unknown')
    })

    it('extracts XL variants', () => {
      expect(extractQuantization('model-Q4_K_XL.gguf')).toBe('Q4_K_XL')
      expect(extractQuantization('model-Q6_K_XL.gguf')).toBe('Q6_K_XL')
    })
  })

  describe('parseGgufVariants', () => {
    const mockSiblings = [
      { rfilename: 'README.md', size: 1000 },
      { rfilename: 'config.json', size: 500 },
      { rfilename: 'model-Q4_K_M.gguf', size: 4294967296, lfs: { oid: 'aaaa' } },   // ~4GB
      { rfilename: 'model-Q8_0.gguf', size: 8589934592 },     // ~8GB
      { rfilename: 'model-F16.gguf', size: 17179869184 },      // ~16GB
      { rfilename: 'imatrix_data.gguf', size: 100000 },        // Should be filtered
      { rfilename: 'mmproj-F16.gguf', size: 1000000 },         // Should be filtered
    ]

    it('filters only GGUF model files', () => {
      const variants = parseGgufVariants('test/model', mockSiblings)
      expect(variants).toHaveLength(3)
    })

    it('excludes imatrix and mmproj files', () => {
      const variants = parseGgufVariants('test/model', mockSiblings)
      const filenames = variants.map(v => v.filename)
      expect(filenames).not.toContain('imatrix_data.gguf')
      expect(filenames).not.toContain('mmproj-F16.gguf')
    })

    it('sorts by size ascending', () => {
      const variants = parseGgufVariants('test/model', mockSiblings)
      for (let i = 1; i < variants.length; i++) {
        expect(variants[i].sizeMB).toBeGreaterThanOrEqual(variants[i - 1].sizeMB)
      }
    })

    it('generates correct download URLs', () => {
      const variants = parseGgufVariants('test/model', mockSiblings)
      expect(variants[0].downloadUrl).toBe('https://huggingface.co/test/model/resolve/main/model-Q4_K_M.gguf')
    })

    it('extracts quantization for each variant', () => {
      const variants = parseGgufVariants('test/model', mockSiblings)
      const quants = variants.map(v => v.quantization)
      expect(quants).toContain('Q4_K_M')
      expect(quants).toContain('Q8_0')
      expect(quants).toContain('F16')
    })

    it('handles LFS size fallback', () => {
      const siblings = [
        { rfilename: 'model-Q4_0.gguf', size: 0, lfs: { size: 4294967296 } }
      ]
      const variants = parseGgufVariants('test/model', siblings)
      expect(variants[0].sizeMB).toBe(4096)
    })

    it('handles empty siblings array', () => {
      const variants = parseGgufVariants('test/model', [])
      expect(variants).toEqual([])
    })

    it('captures sha256 from lfs.oid', () => {
      const variants = parseGgufVariants('test/model', mockSiblings)
      const q4 = variants.find(v => v.filename === 'model-Q4_K_M.gguf')!
      expect(q4.sha256).toBe('aaaa')
      const q8 = variants.find(v => v.filename === 'model-Q8_0.gguf')!
      expect(q8.sha256).toBeNull()
    })

    it('groups sharded files into a single variant', () => {
      const siblings = [
        { rfilename: 'big-Q5_K_M-00001-of-00003.gguf', size: 6 * 1024 * 1024 * 1024, lfs: { oid: 'p1' } },
        { rfilename: 'big-Q5_K_M-00002-of-00003.gguf', size: 6 * 1024 * 1024 * 1024, lfs: { oid: 'p2' } },
        { rfilename: 'big-Q5_K_M-00003-of-00003.gguf', size: 6 * 1024 * 1024 * 1024, lfs: { oid: 'p3' } },
      ]
      const variants = parseGgufVariants('owner/big', siblings)
      expect(variants).toHaveLength(1)
      expect(variants[0].filename).toBe('big-Q5_K_M-00001-of-00003.gguf')
      expect(variants[0].quantization).toBe('Q5_K_M')
      expect(variants[0].sizeMB).toBe(18 * 1024) // sum of 3 shards
      expect(variants[0].sha256).toBe('p1')
      expect(variants[0].shards).toHaveLength(2)
      expect(variants[0].shards.map(s => s.sha256)).toEqual(['p2', 'p3'])
    })

    it('extracts UD quant cleanly from sharded UD filename', () => {
      const siblings = [
        { rfilename: 'm-UD-Q4_K_M-00001-of-00002.gguf', size: 1000, lfs: { oid: 'a' } },
        { rfilename: 'm-UD-Q4_K_M-00002-of-00002.gguf', size: 1000, lfs: { oid: 'b' } },
      ]
      const variants = parseGgufVariants('o/m', siblings)
      expect(variants).toHaveLength(1)
      expect(variants[0].quantization).toBe('UD-Q4_K_M')
    })
  })
})
