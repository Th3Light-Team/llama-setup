import si from 'systeminformation'
import { SystemInfo, CPUInfo, MemoryInfo, DiskInfo, OSInfo } from '../../types'

/**
 * System probe — gathers enriched hardware details beyond backend detection.
 * This data feeds the Hardware page's detailed tables.
 *
 * Collects:
 * - CPU: brand, cores, threads, clock speeds, instruction set features (AVX2, AVX-512, FMA)
 * - Memory: total/used/free RAM + swap
 * - Disks: mount points, capacity, available space (critical for model storage)
 * - OS: distro, kernel version, hostname
 */
export async function probeSystem(): Promise<SystemInfo> {
  const [cpuData, memData, diskData, osData] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.fsSize(),
    si.osInfo()
  ])

  // Parse CPU instruction set features relevant to llama.cpp
  const rawFlags = (cpuData.flags || '').toLowerCase()
  const relevantFeatures: string[] = []
  const featureChecks = ['avx2', 'avx512', 'avx512f', 'avx', 'fma', 'f16c', 'sse4_2', 'sse4_1', 'neon']
  for (const feat of featureChecks) {
    if (rawFlags.includes(feat)) {
      relevantFeatures.push(feat.toUpperCase())
    }
  }
  // ARM NEON is always present on arm64 but may not appear in flags
  if (process.arch === 'arm64' && !relevantFeatures.includes('NEON')) {
    relevantFeatures.push('NEON')
  }

  const cpu: CPUInfo = {
    brand: cpuData.brand || 'Unknown',
    manufacturer: cpuData.manufacturer || 'Unknown',
    cores: cpuData.physicalCores || cpuData.cores || 0,
    threads: cpuData.cores || 0,
    speedGHz: cpuData.speed || 0,
    speedMaxGHz: cpuData.speedMax || null,
    features: relevantFeatures
  }

  const toMB = (bytes: number) => Math.round(bytes / (1024 * 1024))

  const memory: MemoryInfo = {
    totalMB: toMB(memData.total),
    usedMB: toMB(memData.used),
    freeMB: toMB(memData.free),
    swapTotalMB: toMB(memData.swaptotal),
    swapUsedMB: toMB(memData.swapused)
  }

  const disks: DiskInfo[] = diskData.map((d: any) => ({
    mount: d.mount || d.fs || 'Unknown',
    type: d.type || 'Unknown',
    sizeMB: toMB(d.size || 0),
    usedMB: toMB(d.used || 0),
    availableMB: toMB((d.size || 0) - (d.used || 0))
  }))

  const osInfo: OSInfo = {
    platform: osData.platform || 'Unknown',
    distro: osData.distro || 'Unknown',
    release: osData.release || 'Unknown',
    kernel: osData.kernel || 'Unknown',
    hostname: osData.hostname || 'Unknown'
  }

  return { cpu, memory, disks, osInfo }
}
