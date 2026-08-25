import { describe, it, expect } from 'vitest'
import { getCudaSuffix } from './probes/cuda.probe'
import { selectAsset } from './asset-selector'
import { BackendResult } from '../types'

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
    expect(result).toContain('cuda-cu12.4')
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
})
