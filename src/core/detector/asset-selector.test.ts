import { describe, it, expect } from 'vitest'
import { getCudaSuffix } from './probes/cuda.probe'
import { selectAsset } from './asset-selector'
import { BackendResult } from '../types'
import { findRecommendedBackendId } from '../binaries/select'

describe('CUDA Driver Version Mapping', () => {
  it('maps driver >= 550 to cu12.4', () => {
    expect(getCudaSuffix('550.54')).toBe('cuda-cu12.4')
    expect(getCudaSuffix('560.10')).toBe('cuda-cu12.4')
  })

  it('maps driver 520-549 to cu12.0', () => {
    expect(getCudaSuffix('525.60')).toBe('cuda-cu12.0')
    expect(getCudaSuffix('535.10')).toBe('cuda-cu12.0')
  })

  it('maps driver 470-519 to cu11', () => {
    expect(getCudaSuffix('470.80')).toBe('cuda-cu11')
    expect(getCudaSuffix('510.47')).toBe('cuda-cu11')
  })

  it('returns empty string for unsupported drivers < 470', () => {
    expect(getCudaSuffix('460.30')).toBe('')
    expect(getCudaSuffix('390.10')).toBe('')
  })

  it('maps newer drivers: >= 570 -> cu12.8, >= 580 -> cu13.4', () => {
    expect(getCudaSuffix('570.86')).toBe('cuda-cu12.8')
    expect(getCudaSuffix('581.15')).toBe('cuda-cu13.4')
  })

  it('defaults to cu12.4 for unparseable version', () => {
    expect(getCudaSuffix('unknown')).toBe('cuda-cu12.4')
    expect(getCudaSuffix('')).toBe('cuda-cu12.4')
  })
})

describe('Asset Selector', () => {
  const makeBackend = (id: BackendResult['id'], available: boolean, version?: string): BackendResult => ({
    id, available, confidence: 'confirmed', reason: 'test', warnings: [], version
  })

  it('selects CUDA cu12.4 asset for NVIDIA driver >= 550', () => {
    const backends = [
      makeBackend('cuda', true, '550.54'),
      makeBackend('cpu', true)
    ]
    const result = selectAsset('windows', 'x64', backends)
    expect(result).toBe('win-cuda-12.4-x64.zip') // real release naming: "cuda-12.4", not "cuda-cu12.4"
    expect(findRecommendedBackendId({ backends, recommendedAsset: result })).toBe('cuda')
  })

  it('prefers CUDA over Vulkan when both available', () => {
    const backends = [
      makeBackend('cuda', true, '550.54'),
      makeBackend('vulkan', true),
      makeBackend('cpu', true)
    ]
    const result = selectAsset('linux', 'x64', backends)
    expect(result).toContain('cuda')
  })

  it('selects Metal asset on macOS', () => {
    const backends = [
      makeBackend('metal', true),
      makeBackend('cpu', true)
    ]
    const result = selectAsset('macos', 'arm64', backends)
    expect(result).toContain('macos-arm64')
  })

  it('falls back to CPU when no GPU backend is available', () => {
    const backends = [
      makeBackend('cuda', false),
      makeBackend('vulkan', false),
      makeBackend('cpu', true)
    ]
    const result = selectAsset('windows', 'x64', backends)
    expect(result).toContain('win-x64')
  })

  it('matches against real asset list when provided', () => {
    const backends = [
      makeBackend('cuda', true, '550.54'),
      makeBackend('cpu', true)
    ]
    const assets = [
      'llama-b8492-bin-win-cuda-cu12.4-x64.zip',
      'llama-b8492-bin-win-cpu-x64.zip',
      'llama-b8492-bin-ubuntu-cuda-cu12.4-x64.zip'
    ]
    const result = selectAsset('windows', 'x64', backends, assets)
    expect(result).toBe('llama-b8492-bin-win-cuda-cu12.4-x64.zip')
  })

  it('skips CUDA with unsupported driver and selects next backend', () => {
    const backends = [
      makeBackend('cuda', true, '460.00'), // too old
      makeBackend('vulkan', true),
      makeBackend('cpu', true)
    ]
    const result = selectAsset('linux', 'x64', backends)
    expect(result).toContain('vulkan')
  })

  it('recommends the newest toolkit the driver supports (570 -> 12.8, 580 -> 13.4)', () => {
    const rec = (driver: string) => selectAsset('linux', 'x64', [makeBackend('cuda', true, driver), makeBackend('cpu', true)])
    expect(rec('570.86')).toContain('cuda-12.8')
    expect(rec('580.65')).toContain('cuda-13.4')
  })

  it('reads an nvcc toolkit version ("12.4") as a toolkit, not as an ancient driver', () => {
    const backends = [makeBackend('cuda', true, '12.4'), makeBackend('cpu', true)]
    expect(selectAsset('windows', 'x64', backends)).toBe('win-cuda-12.4-x64.zip')
  })

  it('matches the real asset list for current names (cuda-12.4 / cuda-12.8)', () => {
    const assets = [
      'llama-b11312-bin-win-cpu-x64.zip',
      'llama-b11312-bin-win-cuda-12.4-x64.zip',
      'llama-b11312-bin-win-cuda-13.4-x64.zip',
      'llama-b11312-bin-ubuntu-cuda-12.8-x64.tar.gz'
    ]
    expect(selectAsset('windows', 'x64', [makeBackend('cuda', true, '551.61'), makeBackend('cpu', true)], assets))
      .toBe('llama-b11312-bin-win-cuda-12.4-x64.zip')
    expect(selectAsset('linux', 'x64', [makeBackend('cuda', true, '570.10'), makeBackend('cpu', true)], assets))
      .toBe('llama-b11312-bin-ubuntu-cuda-12.8-x64.tar.gz')
  })
})
