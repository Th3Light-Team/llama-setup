export interface GithubRelease {
  id: number
  tag_name: string
  name: string
  published_at: string
  html_url: string
  body: string
  assets: GithubAsset[]
}

export interface GithubAsset {
  id: number
  name: string
  size: number
  download_count: number
  browser_download_url: string
}

export interface InstallRecord {
  id: string
  tag: string
  backend: string
  install_date: string
  verified: boolean
  path: string
}

export interface ParsedAsset {
  filename: string
  url: string
  size: number
  downloadCount: number
  os: 'windows' | 'macos' | 'linux' | 'unknown'
  arch: 'x64' | 'arm64' | 'unknown'
  backend: string
}

export interface ReleaseWithAssets {
  tag: string
  name: string
  publishedAt: string
  htmlUrl: string
  changelog: string
  totalAssets: number
  totalDownloads: number
  assets: ParsedAsset[]
}
