import { describe, it, expect } from 'vitest'
import {
  parseCudaVersion, cudaBackendId, cudaVersionOfBackend, compareCuda,
  maxToolkitForDriver, maxToolkitForBackendVersion, NO_CUDA
} from './cuda'

describe('parseCudaVersion / cudaBackendId', () => {
  it.each([
    ['llama-b1-bin-win-cuda-12.4-x64.zip', 12, 4],
    ['llama-b1-bin-ubuntu-cuda-12.8-x64.tar.gz', 12, 8],
    ['llama-b1-bin-win-cuda-13.4-arm64.zip', 13, 4],
    ['llama-b1-bin-win-cuda-cu12.0-x64.zip', 12, 0],
    ['cudart-llama-bin-win-cuda-12.4-x64.zip', 12, 4]
  ])('%s -> %i.%i', (name, major, minor) => {
    expect(parseCudaVersion(name)).toEqual({ major, minor })
  })

  it('accepts a major-only version', () => {
    expect(parseCudaVersion('llama-b1-bin-win-cuda-11-x64.zip')).toEqual({ major: 11, minor: null })
    expect(cudaBackendId({ major: 11, minor: null })).toBe('cuda-cu11')
  })

  it('returns null when there is no CUDA version', () => {
    expect(parseCudaVersion('llama-b1-bin-win-vulkan-x64.zip')).toBeNull()
    expect(parseCudaVersion('llama-b1-bin-win-cpu-x64.zip')).toBeNull()
  })

  it('round-trips through the backend id', () => {
    for (const v of [{ major: 12, minor: 4 }, { major: 13, minor: 4 }, { major: 11, minor: null }]) {
      expect(cudaVersionOfBackend(cudaBackendId(v))).toEqual(v)
    }
    expect(cudaVersionOfBackend('vulkan')).toBeNull()
    expect(cudaVersionOfBackend('cuda')).toBeNull()
  })
})

describe('compareCuda', () => {
  it('orders by major then minor, with a missing minor as .0', () => {
    expect(compareCuda({ major: 12, minor: 8 }, { major: 12, minor: 4 })).toBeGreaterThan(0)
    expect(compareCuda({ major: 11, minor: 8 }, { major: 12, minor: 0 })).toBeLessThan(0)
    expect(compareCuda({ major: 11, minor: null }, { major: 11, minor: 0 })).toBe(0)
  })
})

describe('maxToolkitForDriver', () => {
  it.each([
    ['580.65', 13],
    ['570.86', 12],
    ['551.61', 12],
    ['535.10', 12],
    ['470.80', 11]
  ])('driver %s supports toolkit major %i', (driver, major) => {
    expect(maxToolkitForDriver(driver)?.major).toBe(major)
  })

  it('maps the minor boundaries', () => {
    expect(maxToolkitForDriver('570.1')).toEqual({ major: 12, minor: 8 })
    expect(maxToolkitForDriver('550.54')).toEqual({ major: 12, minor: 4 })
    expect(maxToolkitForDriver('525.60')).toEqual({ major: 12, minor: 0 })
  })

  it('is null for drivers older than 470 and for garbage', () => {
    expect(maxToolkitForDriver('460.30')).toBeNull()
    expect(maxToolkitForDriver('unknown')).toBeNull()
  })
})

describe('maxToolkitForBackendVersion', () => {
  it('treats a first component >= 100 as a driver, below as a toolkit', () => {
    expect(maxToolkitForBackendVersion('551.61')).toEqual({ major: 12, minor: 4 })
    expect(maxToolkitForBackendVersion('12.4')).toEqual({ major: 12, minor: 4 })
    expect(maxToolkitForBackendVersion('13')).toEqual({ major: 13, minor: Infinity })
  })

  it('a known driver older than every published build maps to "no CUDA" (not "unknown")', () => {
    expect(maxToolkitForBackendVersion('460.30')).toEqual(NO_CUDA)
  })

  it('is null without a usable version', () => {
    expect(maxToolkitForBackendVersion(undefined)).toBeNull()
    expect(maxToolkitForBackendVersion('')).toBeNull()
    expect(maxToolkitForBackendVersion('abc')).toBeNull()
  })
})
