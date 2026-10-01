import { describe, it, expect } from 'vitest'
import { pickBestAsset, findRecommendedBackendId, cudaMaxForHardware, findRuntimeFor } from './select'
import { parseAsset, parseRuntimeAsset } from './github'
import type { ParsedAsset } from './types'
import type { BackendResult } from '../types'

const mk = (name: string): ParsedAsset => {
  const a = parseAsset(name, `https://example.com/${name}`, 1, 0)
  if (!a) throw new Error(`fixture not parseable: ${name}`)
  return a
}

// A realistic mixed release, deliberately ordered so that a naive "first asset"
// choice would be wrong on most hosts (arm64 + windows come first).
const RELEASE: ParsedAsset[] = [
  'llama-b1-bin-macos-arm64.tar.gz',
  'llama-b1-bin-macos-x64.tar.gz',
  'llama-b1-bin-ubuntu-vulkan-arm64.tar.gz',
  'llama-b1-bin-ubuntu-arm64.tar.gz',
  'llama-b1-bin-ubuntu-vulkan-x64.tar.gz',
  'llama-b1-bin-ubuntu-x64.tar.gz',
  'llama-b1-bin-win-cuda-12.4-x64.zip',
  'llama-b1-bin-win-vulkan-x64.zip',
  'llama-b1-bin-win-cpu-x64.zip',
  'llama-b1-bin-win-cpu-arm64.zip'
].map(mk)

const backend = (id: BackendResult['id'], available = true): BackendResult =>
  ({ id, available, confidence: 'confirmed', reason: '', warnings: [] })

describe('pickBestAsset: OS / arch filtering', () => {
  it('never picks an arm64 asset on x64 (regression: first-run arm64 pick)', () => {
    const a = pickBestAsset(RELEASE, { os: 'linux', arch: 'x64' }, 'vulkan')
    expect(a?.filename).toBe('llama-b1-bin-ubuntu-vulkan-x64.tar.gz')
    expect(a?.arch).toBe('x64')
  })

  it('picks arm64 on arm64 hosts', () => {
    const a = pickBestAsset(RELEASE, { os: 'linux', arch: 'arm64' }, 'vulkan')
    expect(a?.filename).toBe('llama-b1-bin-ubuntu-vulkan-arm64.tar.gz')
  })

  it('never crosses operating systems', () => {
    for (const os of ['linux', 'windows', 'macos'] as const) {
      for (const arch of ['x64', 'arm64'] as const) {
        const a = pickBestAsset(RELEASE, { os, arch }, undefined)
        expect(a?.os).toBe(os)
        expect(a?.arch).toBe(arch)
      }
    }
  })

  it('returns undefined when nothing was built for the host', () => {
    const linuxOnly = RELEASE.filter(a => a.os === 'linux')
    expect(pickBestAsset(linuxOnly, { os: 'windows', arch: 'x64' }, 'cuda')).toBeUndefined()
    expect(pickBestAsset(RELEASE.filter(a => a.arch === 'arm64'), { os: 'windows', arch: 'x64' }, undefined)).toBeUndefined()
  })

  it('returns undefined for an empty asset list', () => {
    expect(pickBestAsset([], { os: 'linux', arch: 'x64' }, 'cuda')).toBeUndefined()
  })
})

describe('pickBestAsset: backend selection and fallbacks', () => {
  const win = { os: 'windows', arch: 'x64' } as const

  it('prefers the recommended backend', () => {
    expect(pickBestAsset(RELEASE, win, 'cuda')?.backend).toBe('cuda-cu12.4')
    expect(pickBestAsset(RELEASE, win, 'vulkan')?.backend).toBe('vulkan')
  })

  it('is case-insensitive on the recommended id', () => {
    expect(pickBestAsset(RELEASE, win, 'CUDA')?.backend).toBe('cuda-cu12.4')
  })

  it('falls back to the cpu build when the recommended backend has no asset', () => {
    expect(pickBestAsset(RELEASE, { os: 'linux', arch: 'x64' }, 'cuda')?.filename)
      .toBe('llama-b1-bin-ubuntu-x64.tar.gz')
  })

  it('uses the cpu build when no backend is recommended', () => {
    expect(pickBestAsset(RELEASE, win, undefined)?.backend).toBe('cpu')
    expect(pickBestAsset(RELEASE, win, null)?.backend).toBe('cpu')
  })

  it('falls back to the first host asset when there is neither a match nor a cpu build', () => {
    // macOS builds are "metal" / "metal-kleidiai": no 'cpu' asset exists.
    const mac = pickBestAsset(RELEASE, { os: 'macos', arch: 'arm64' }, undefined)
    expect(mac?.filename).toBe('llama-b1-bin-macos-arm64.tar.gz')
    expect(pickBestAsset(RELEASE, { os: 'macos', arch: 'x64' }, 'cuda')?.filename)
      .toBe('llama-b1-bin-macos-x64.tar.gz')
  })

  it('metal recommendation matches the metal build', () => {
    expect(pickBestAsset(RELEASE, { os: 'macos', arch: 'arm64' }, 'metal')?.backend).toBe('metal')
  })
})

describe('pickBestAsset: no hardware info', () => {
  it('does not filter by os/arch when hw is null', () => {
    expect(pickBestAsset(RELEASE, null, undefined)?.backend).toBe('cpu')
    // first cpu asset in list order, since nothing is filtered
    expect(pickBestAsset(RELEASE, null, undefined)?.filename).toBe('llama-b1-bin-ubuntu-arm64.tar.gz')
  })

  it('still honours the recommended backend when hw is undefined', () => {
    expect(pickBestAsset(RELEASE, undefined, 'cuda')?.backend).toBe('cuda-cu12.4')
  })
})

describe('findRecommendedBackendId', () => {
  const backends = [backend('cuda', false), backend('vulkan'), backend('cpu')]

  it('extracts the backend named in the recommended asset', () => {
    expect(findRecommendedBackendId({ backends, recommendedAsset: 'ubuntu-vulkan-x64.zip' })).toBe('vulkan')
    expect(findRecommendedBackendId({ backends, recommendedAsset: 'Win-CUDA-12.4-x64.zip' })).toBe('cuda')
  })

  it('returns undefined for a generic CPU recommendation', () => {
    expect(findRecommendedBackendId({ backends, recommendedAsset: 'ubuntu-x64.zip' })).toBeUndefined()
  })

  it('returns undefined without hardware info', () => {
    expect(findRecommendedBackendId(null)).toBeUndefined()
    expect(findRecommendedBackendId(undefined)).toBeUndefined()
  })
})

describe('CUDA build selection by driver (regression: first CUDA asset / cuda-12.8 read as cpu)', () => {
  // Names as published by llama.cpp b11312, newest toolkit first like the release listing.
  const CUDA_RELEASE: ParsedAsset[] = [
    'llama-b1-bin-win-cuda-13.4-x64.zip',
    'llama-b1-bin-win-cuda-12.4-x64.zip',
    'llama-b1-bin-win-vulkan-x64.zip',
    'llama-b1-bin-win-cpu-x64.zip',
    'llama-b1-bin-ubuntu-cuda-13.4-x64.tar.gz',
    'llama-b1-bin-ubuntu-cuda-12.8-x64.tar.gz',
    'llama-b1-bin-ubuntu-x64.tar.gz'
  ].map(mk)
  const win = { os: 'windows', arch: 'x64' } as const
  const linux = { os: 'linux', arch: 'x64' } as const
  const hw = (version: string) => ({ backends: [backend('cuda', true), backend('cpu')].map(b => b.id === 'cuda' ? { ...b, version } : b) })
  const pick = (host: typeof win | typeof linux, driver: string) =>
    pickBestAsset(CUDA_RELEASE, host, 'cuda', { cudaMax: cudaMaxForHardware(hw(driver)) })

  it('parses ubuntu-cuda-12.8 as CUDA, not cpu', () => {
    expect(mk('llama-b1-bin-ubuntu-cuda-12.8-x64.tar.gz').backend).toBe('cuda-cu12.8')
    expect(mk('llama-b1-bin-win-cuda-13.4-x64.zip').backend).toBe('cuda-cu13.4')
  })

  it('a CPU-only Linux host never gets a CUDA build as its "cpu" build', () => {
    expect(pickBestAsset(CUDA_RELEASE, linux, undefined)?.backend).toBe('cpu')
  })

  it('driver 551 (CUDA 12.4) gets the 12.4 build, not the newer 13.4', () => {
    expect(pick(win, '551.61')?.backend).toBe('cuda-cu12.4')
  })

  it('driver 580+ gets the newest build', () => {
    expect(pick(win, '580.11')?.backend).toBe('cuda-cu13.4')
    expect(pick(linux, '581.00')?.backend).toBe('cuda-cu13.4')
  })

  it('driver 570 on Linux gets cu12.8; on Windows (only 12.4 published) cu12.4', () => {
    expect(pick(linux, '570.86')?.backend).toBe('cuda-cu12.8')
    expect(pick(win, '570.86')?.backend).toBe('cuda-cu12.4')
  })

  it('falls back to a non-CUDA build when the driver is too old for every CUDA build', () => {
    expect(pick(win, '535.10')?.backend).toBe('cpu') // supports 12.0 only
    expect(pick(win, '460.30')?.backend).toBe('cpu')
  })

  it('an nvcc-only host (toolkit version, not driver) is read as a toolkit', () => {
    expect(pick(win, '12.4')?.backend).toBe('cuda-cu12.4')
    expect(pick(linux, '12.9')?.backend).toBe('cuda-cu12.8')
  })

  it('an explicit toolkit hint ("cuda-cu12.4") is honoured when no driver info is given', () => {
    expect(pickBestAsset(CUDA_RELEASE, win, 'cuda-cu12.4')?.backend).toBe('cuda-cu12.4')
  })

  it('without any version info prefers cu12.4, then any CUDA build', () => {
    expect(pickBestAsset(CUDA_RELEASE, win, 'cuda')?.backend).toBe('cuda-cu12.4')
    expect(pickBestAsset(CUDA_RELEASE, linux, 'cuda')?.backend).toBe('cuda-cu13.4')
  })
})

describe('findRuntimeFor', () => {
  const runtimes = [
    'cudart-llama-bin-win-cuda-12.4-x64.zip',
    'cudart-llama-bin-win-cuda-13.4-x64.zip',
    'cudart-llama-b1-bin-ubuntu-cuda-12.8-x64.tar.gz'
  ].map(n => parseRuntimeAsset(n, `https://example.com/${n}`, 1)!)

  it('matches OS, arch and CUDA version', () => {
    expect(findRuntimeFor(runtimes, mk('llama-b1-bin-win-cuda-12.4-x64.zip'))?.filename).toBe('cudart-llama-bin-win-cuda-12.4-x64.zip')
    expect(findRuntimeFor(runtimes, mk('llama-b1-bin-ubuntu-cuda-12.8-x64.tar.gz'))?.filename).toBe('cudart-llama-b1-bin-ubuntu-cuda-12.8-x64.tar.gz')
  })

  it('returns undefined for non-CUDA engines and for versions without a bundle', () => {
    expect(findRuntimeFor(runtimes, mk('llama-b1-bin-win-vulkan-x64.zip'))).toBeUndefined()
    expect(findRuntimeFor(runtimes, mk('llama-b1-bin-ubuntu-cuda-13.4-x64.tar.gz'))).toBeUndefined()
    expect(findRuntimeFor(undefined, mk('llama-b1-bin-win-cuda-12.4-x64.zip'))).toBeUndefined()
  })
})
