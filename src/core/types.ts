export interface DetectionResult {
  os: 'windows' | 'macos' | 'linux'
  arch: 'x64' | 'arm64'
  backends: BackendResult[]
  vram: VRAMInfo | null
  system: SystemInfo | null
  recommendedAsset: string
  detectedAt: number
}

export interface BackendResult {
  id: 'cuda' | 'metal' | 'vulkan' | 'opencl' | 'cpu'
  available: boolean
  confidence: 'confirmed' | 'likely' | 'uncertain'
  version?: string
  reason: string
  warnings: string[]
}

export interface VRAMInfo {
  gpus: GPUInfo[]
  totalMB: number
}

export interface GPUInfo {
  name: string
  vramMB: number
  backend: 'cuda' | 'metal' | 'vulkan' | 'cpu'
}

/** Enriched system information for the Hardware page */
export interface SystemInfo {
  cpu: CPUInfo
  memory: MemoryInfo
  disks: DiskInfo[]
  osInfo: OSInfo
}

export interface CPUInfo {
  brand: string
  manufacturer: string
  cores: number
  threads: number
  speedGHz: number
  speedMaxGHz: number | null
  features: string[]
}

export interface MemoryInfo {
  totalMB: number
  usedMB: number
  freeMB: number
  swapTotalMB: number
  swapUsedMB: number
}

export interface DiskInfo {
  mount: string
  type: string
  sizeMB: number
  usedMB: number
  availableMB: number
}

export interface OSInfo {
  platform: string
  distro: string
  release: string
  kernel: string
  hostname: string
}

