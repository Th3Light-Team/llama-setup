import { GithubRelease, ParsedAsset, ReleaseWithAssets } from './types'

const GITHUB_API_URL = 'https://api.github.com/repos/ggerganov/llama.cpp/releases'

export function parseAsset(filename: string, url: string, size: number, downloadCount: number): ParsedAsset | null {
  // Only care about pre-compiled binaries
  if (!filename.endsWith('.zip') && !filename.endsWith('.tar.gz')) {
    return null
  }

  // Skip cudart DLL bundles (separate dependency packages, not the engine itself)
  if (filename.startsWith('cudart-')) {
    return null
  }

  // Skip xcframework (iOS SDK, not desktop)
  if (filename.includes('xcframework')) {
    return null
  }

  const lower = filename.toLowerCase()

  // --- OS detection ---
  let os: ParsedAsset['os'] = 'unknown'
  if (lower.includes('-win-')) os = 'windows'
  else if (lower.includes('-macos-')) os = 'macos'
  else if (lower.includes('-ubuntu-') || lower.includes('-linux-')) os = 'linux'

  // --- Arch detection ---
  let arch: ParsedAsset['arch'] = 'unknown'
  if (lower.includes('-x64') || lower.includes('-amd64') || lower.includes('-x86')) arch = 'x64'
  else if (lower.includes('-arm64') || lower.includes('-aarch64')) arch = 'arm64'

  // --- Backend detection (expanded to match real release filenames) ---
  let backend = 'cpu'
  if (lower.includes('-cuda-13.1') || lower.includes('-cuda-13')) backend = 'cuda-cu13.1'
  else if (lower.includes('-cuda-12.4') || lower.includes('-cuda-cu12.4')) backend = 'cuda-cu12.4'
  else if (lower.includes('-cuda-12.0') || lower.includes('-cuda-cu12.0')) backend = 'cuda-cu12.0'
  else if (lower.includes('-cuda-cu11') || lower.includes('-cuda-11')) backend = 'cuda-cu11'
  else if (lower.includes('-hip-') || lower.includes('-rocm-')) backend = 'rocm'
  else if (lower.includes('-vulkan')) backend = 'vulkan'
  else if (lower.includes('-opencl')) backend = 'opencl'
  else if (lower.includes('-sycl-fp16')) backend = 'sycl-fp16'
  else if (lower.includes('-sycl-fp32') || lower.includes('-sycl-')) backend = 'sycl'
  else if (lower.includes('-openvino')) backend = 'openvino'
  else if (lower.includes('-kleidiai')) backend = 'metal-kleidiai'
  else if (lower.includes('-aclgraph')) backend = 'aclgraph'
  else if (os === 'macos') backend = 'metal'

  if (os === 'unknown' || arch === 'unknown') {
    return null
  }

  return { filename, url, size, downloadCount, os, arch, backend }
}

export async function fetchReleases(page = 1, perPage = 10): Promise<ReleaseWithAssets[]> {
  const res = await fetch(`${GITHUB_API_URL}?page=${page}&per_page=${perPage}`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Llama-Studio-App'
    }
  })

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.statusText}`)
  }

  const data: GithubRelease[] = await res.json()

  return data.map(release => {
    const parsedAssets = release.assets
      .map(a => parseAsset(a.name, a.browser_download_url, a.size, a.download_count))
      .filter((a): a is ParsedAsset => a !== null)

    const totalDownloads = release.assets.reduce((sum, a) => sum + a.download_count, 0)

    return {
      tag: release.tag_name,
      name: release.name || release.tag_name,
      publishedAt: release.published_at,
      htmlUrl: release.html_url,
      changelog: release.body || '',
      totalAssets: release.assets.length,
      totalDownloads,
      assets: parsedAssets
    }
  })
}
