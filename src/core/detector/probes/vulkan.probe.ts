import { BackendResult, GPUInfo } from '../../types'
import { runCommand } from '../runner'
import { readFile } from 'fs/promises'
import { existsSync, readdirSync } from 'fs'

export interface VulkanProbeResult {
  backend: BackendResult
  gpus: GPUInfo[]
}

/**
 * Vulkan detection for Windows + Linux. Follows DETECTOR.md §4.
 * 1. Tries `vulkaninfo --summary`
 * 2. Falls back to /sys/class/drm on Linux
 */
export async function probeVulkan(osType: 'windows' | 'linux'): Promise<VulkanProbeResult> {
  // Step 4a — vulkaninfo
  const vulkanResult = await runCommand('vulkaninfo', ['--summary'], { timeoutMs: 1500 })

  if (vulkanResult.ok && vulkanResult.stdout.trim()) {
    const gpus: GPUInfo[] = []
    const stdout = vulkanResult.stdout

    // Parse GPU entries from vulkaninfo summary
    // Typical format: "GPU id = 0 (NVIDIA GeForce RTX 4090)"
    // or "deviceName = NVIDIA GeForce RTX 4090"
    const deviceMatches = stdout.matchAll(/(?:deviceName|GPU\s+id\s*=\s*\d+)\s*[=(]\s*(.+?)[\s)]*$/gmi)
    for (const match of deviceMatches) {
      const name = match[1].trim().replace(/\)$/, '')
      gpus.push({ name, vramMB: 0, backend: 'vulkan' })
    }

    // Try to extract memory from "deviceMemorySize" lines (in bytes)
    const memMatches = stdout.matchAll(/apiVersion\s*=.*|deviceMemorySize\s*=\s*(\d+)/gi)
    let gpuIdx = 0
    for (const match of memMatches) {
      if (match[1] && gpuIdx < gpus.length) {
        const bytes = parseInt(match[1], 10)
        if (!isNaN(bytes)) {
          gpus[gpuIdx].vramMB = Math.floor(bytes / (1024 * 1024))
        }
        gpuIdx++
      }
    }

    // If no GPUs were parsed from the text, still report Vulkan available
    if (gpus.length === 0) {
      gpus.push({ name: 'Vulkan-capable GPU', vramMB: 0, backend: 'vulkan' })
    }

    return {
      backend: {
        id: 'vulkan',
        available: true,
        confidence: 'confirmed',
        reason: `vulkaninfo detected ${gpus.length} device(s)`,
        warnings: []
      },
      gpus
    }
  }

  // Step 4b — Linux /sys/class/drm fallback
  if (osType === 'linux') {
    const drmResult = await probeDrmFallback()
    if (drmResult) return drmResult
  }

  // All checks failed
  return {
    backend: {
      id: 'vulkan',
      available: false,
      confidence: 'confirmed',
      reason: 'Vulkan runtime not detected',
      warnings: vulkanResult.ok
        ? []
        : [`vulkaninfo: ${vulkanResult.error}`]
    },
    gpus: []
  }
}

/** 
 * Linux DRM sysfs fallback. Reads GPU vendor IDs to infer Vulkan capability.
 * AMD (0x1002) cards also expose VRAM via mem_info_vram_total.
 */
async function probeDrmFallback(): Promise<VulkanProbeResult | null> {
  const drmBase = '/sys/class/drm'
  if (!existsSync(drmBase)) return null

  try {
    const cards = readdirSync(drmBase).filter(d => /^card\d+$/.test(d))
    const gpus: GPUInfo[] = []

    for (const card of cards) {
      const vendorPath = `${drmBase}/${card}/device/vendor`
      if (!existsSync(vendorPath)) continue

      const vendorId = (await readFile(vendorPath, 'utf-8')).trim()

      // 0x1002 = AMD, 0x10de = NVIDIA
      if (vendorId !== '0x1002' && vendorId !== '0x10de') continue

      let vramMB = 0
      const vramPath = `${drmBase}/${card}/device/mem_info_vram_total`
      if (existsSync(vramPath)) {
        try {
          const vramBytes = parseInt((await readFile(vramPath, 'utf-8')).trim(), 10)
          if (!isNaN(vramBytes)) vramMB = Math.floor(vramBytes / (1024 * 1024))
        } catch { /* non-fatal */ }
      }

      const vendorName = vendorId === '0x1002' ? 'AMD' : 'NVIDIA'
      gpus.push({ name: `${vendorName} GPU (${card})`, vramMB, backend: 'vulkan' })
    }

    if (gpus.length === 0) return null

    return {
      backend: {
        id: 'vulkan',
        available: true,
        confidence: 'likely',
        reason: `Found ${gpus.length} GPU(s) via /sys/class/drm`,
        warnings: ['Detected via sysfs — Vulkan runtime should be verified by installing vulkaninfo']
      },
      gpus
    }
  } catch {
    return null
  }
}
