import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseAsset, fetchReleases } from './github'

const URL = 'https://github.com/ggml-org/llama.cpp/releases/download/b8757/'
const parse = (name: string) => parseAsset(name, URL + name, 1234, 7)

describe('parseAsset: archive filtering', () => {
  it('rejects non-archive files', () => {
    expect(parse('llama-b8757-bin-win-cpu-x64.zip.sha256')).toBeNull()
    expect(parse('llama-b8757-bin-macos-arm64.dmg')).toBeNull()
    expect(parse('llama-b8757-bin-ubuntu-x64.tar.xz')).toBeNull()
  })

  it('rejects cudart dependency bundles', () => {
    expect(parse('cudart-llama-bin-win-cuda-12.4-x64.zip')).toBeNull()
  })

  it('rejects the iOS xcframework', () => {
    expect(parse('llama-b8757-xcframework.zip')).toBeNull()
  })

  it('rejects archives whose OS or arch cannot be determined (e.g. source bundles)', () => {
    expect(parse('llama-b8757-source.zip')).toBeNull()
    expect(parse('llama-b8757-bin-ubuntu-s390x.tar.gz')).toBeNull() // OS known, arch not
    expect(parse('llama-b8757-bin-x64.zip')).toBeNull() // arch known, OS not
  })
})

describe('parseAsset: OS, arch and backend detection', () => {
  const cases: Array<[string, string, string, string]> = [
    // filename, os, arch, backend
    ['llama-b8757-bin-ubuntu-x64.tar.gz', 'linux', 'x64', 'cpu'],
    ['llama-b8757-bin-ubuntu-arm64.tar.gz', 'linux', 'arm64', 'cpu'],
    ['llama-b8757-bin-ubuntu-vulkan-x64.tar.gz', 'linux', 'x64', 'vulkan'],
    ['llama-b8757-bin-ubuntu-vulkan-arm64.tar.gz', 'linux', 'arm64', 'vulkan'],
    ['llama-b8757-bin-ubuntu-rocm-7.2-x64.tar.gz', 'linux', 'x64', 'rocm'],
    ['llama-b8757-bin-win-cpu-x64.zip', 'windows', 'x64', 'cpu'],
    ['llama-b8757-bin-win-cpu-arm64.zip', 'windows', 'arm64', 'cpu'],
    ['llama-b8757-bin-win-cuda-12.4-x64.zip', 'windows', 'x64', 'cuda-cu12.4'],
    ['llama-b8757-bin-win-cuda-13.1-x64.zip', 'windows', 'x64', 'cuda-cu13.1'],
    ['llama-b8757-bin-win-vulkan-x64.zip', 'windows', 'x64', 'vulkan'],
    ['llama-b8757-bin-win-hip-radeon-x64.zip', 'windows', 'x64', 'rocm'],
    ['llama-b8757-bin-win-sycl-x64.zip', 'windows', 'x64', 'sycl'],
    ['llama-b8757-bin-win-opencl-adreno-arm64.zip', 'windows', 'arm64', 'opencl'],
    ['llama-b8757-bin-macos-arm64.tar.gz', 'macos', 'arm64', 'metal'],
    ['llama-b8757-bin-macos-x64.tar.gz', 'macos', 'x64', 'metal'],
    ['llama-b8757-bin-macos-arm64-kleidiai.tar.gz', 'macos', 'arm64', 'metal-kleidiai'],
  ]

  it.each(cases)('%s -> %s/%s/%s', (name, os, arch, backend) => {
    const a = parse(name)
    expect(a).not.toBeNull()
    expect(a).toMatchObject({ os, arch, backend, filename: name, url: URL + name, size: 1234, downloadCount: 7 })
  })

  it('does not confuse arm64 with x64 (a Linux arm64 asset is never reported as x64)', () => {
    expect(parse('llama-b8757-bin-ubuntu-vulkan-arm64.tar.gz')?.arch).toBe('arm64')
    expect(parse('llama-b8757-bin-ubuntu-vulkan-x64.tar.gz')?.arch).toBe('x64')
  })

  it('accepts .tar.gz as well as .zip', () => {
    expect(parse('llama-b8757-bin-ubuntu-x64.tar.gz')).not.toBeNull()
    expect(parse('llama-b8757-bin-win-cpu-x64.zip')).not.toBeNull()
  })
})

describe('fetchReleases', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('parses assets, drops unusable ones and sums downloads over ALL assets', async () => {
    const asset = (name: string, n: number) => ({
      id: n, name, size: 10, download_count: n, browser_download_url: URL + name
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        id: 1, tag_name: 'b8757', name: '', published_at: '2026-01-01T00:00:00Z',
        html_url: 'https://example.com', body: null,
        assets: [
          asset('llama-b8757-bin-ubuntu-x64.tar.gz', 5),
          asset('cudart-llama-bin-win-cuda-12.4-x64.zip', 3),
          asset('llama-b8757-xcframework.zip', 2)
        ]
      }]
    }))
    const [rel] = await fetchReleases()
    expect(rel.tag).toBe('b8757')
    expect(rel.name).toBe('b8757') // falls back to tag
    expect(rel.changelog).toBe('')
    expect(rel.totalAssets).toBe(3)
    expect(rel.totalDownloads).toBe(10)
    expect(rel.assets.map(a => a.filename)).toEqual(['llama-b8757-bin-ubuntu-x64.tar.gz'])
  })

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'rate limit exceeded' }))
    await expect(fetchReleases()).rejects.toThrow(/rate limit exceeded/)
  })
})
