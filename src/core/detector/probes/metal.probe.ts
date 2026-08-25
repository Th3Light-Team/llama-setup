import { BackendResult, GPUInfo } from '../../types'
import { runCommand } from '../runner'
import si from 'systeminformation'

export interface MetalProbeResult {
  backend: BackendResult
  gpus: GPUInfo[]
}

/**
 * Metal detection for macOS. Follows DETECTOR.md §3.
 * 1. Checks macOS version gate (≥ 12.0 required, warn < 13.0)
 * 2. Queries system_profiler for GPU data
 * 3. Estimates VRAM (75% of unified memory for Apple Silicon)
 */
export async function probeMetal(): Promise<MetalProbeResult> {
  const warnings: string[] = []

  // Step 3b — macOS version check (run first: if OS is too old, skip profiler)
  const swVersResult = await runCommand('sw_vers', ['-productVersion'], { timeoutMs: 1000 })
  if (swVersResult.ok) {
    const versionStr = swVersResult.stdout.trim()
    const majorVersion = parseInt(versionStr.split('.')[0], 10)

    if (!isNaN(majorVersion) && majorVersion < 12) {
      return {
        backend: {
          id: 'metal',
          available: false,
          confidence: 'confirmed',
          version: versionStr,
          reason: `macOS ${versionStr} does not support Metal for llama.cpp (requires 12.0+)`,
          warnings: []
        },
        gpus: []
      }
    }

    if (!isNaN(majorVersion) && majorVersion < 13) {
      warnings.push(`macOS ${versionStr} detected. macOS 13.0+ is recommended for optimal llama.cpp Metal performance.`)
    }
  }

  // Step 3a — system_profiler
  const profilerResult = await runCommand(
    'system_profiler',
    ['SPDisplaysDataType', '-json'],
    { timeoutMs: 2000 }
  )

  if (!profilerResult.ok) {
    return {
      backend: {
        id: 'metal',
        available: false,
        confidence: 'uncertain',
        reason: `system_profiler failed: ${profilerResult.error}`,
        warnings: ['GPU data could not be retrieved. Metal may still be available.']
      },
      gpus: []
    }
  }

  // Parse JSON safely
  let displayData: any
  try {
    displayData = JSON.parse(profilerResult.stdout)
  } catch (parseErr) {
    return {
      backend: {
        id: 'metal',
        available: false,
        confidence: 'uncertain',
        reason: 'system_profiler returned invalid JSON',
        warnings: [`Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`]
      },
      gpus: []
    }
  }

  const displays = displayData?.SPDisplaysDataType
  if (!Array.isArray(displays) || displays.length === 0) {
    return {
      backend: {
        id: 'metal',
        available: false,
        confidence: 'uncertain',
        reason: 'system_profiler returned no display/GPU entries',
        warnings: []
      },
      gpus: []
    }
  }

  // Determine if Apple Silicon (unified memory) or discrete GPU
  const gpus: GPUInfo[] = []
  const isAppleSilicon = displays.some((d: any) =>
    (d.sppci_model || '').toLowerCase().includes('apple') ||
    (d.sppci_model || '').match(/m\d/i)
  )

  if (isAppleSilicon) {
    // Unified memory: use 75% of system RAM as conservative VRAM ceiling
    try {
      const memData = await si.mem()
      const totalSysRamMB = Math.floor(memData.total / (1024 * 1024))
      const estimatedVramMB = Math.floor(totalSysRamMB * 0.75)
      const gpuName = displays[0]?.sppci_model || 'Apple Silicon GPU'

      gpus.push({ name: gpuName, vramMB: estimatedVramMB, backend: 'metal' })
    } catch {
      // If systeminformation fails, still report Metal available but without VRAM
      const gpuName = displays[0]?.sppci_model || 'Apple Silicon GPU'
      gpus.push({ name: gpuName, vramMB: 0, backend: 'metal' })
      warnings.push('Could not determine system memory. VRAM estimation unavailable.')
    }
  } else {
    // Discrete GPU: try to parse VRAM from spdisplays_vram
    for (const display of displays) {
      const name = display.sppci_model || 'Unknown GPU'
      const vramStr = display.spdisplays_vram || '0'
      // spdisplays_vram can be like "4096 MB" or "4 GB"
      const vramMatch = vramStr.match(/(\d+)\s*(MB|GB)/i)
      let vramMB = 0
      if (vramMatch) {
        vramMB = parseInt(vramMatch[1], 10)
        if (vramMatch[2].toUpperCase() === 'GB') vramMB *= 1024
      }
      gpus.push({ name, vramMB, backend: 'metal' })
    }
  }

  return {
    backend: {
      id: 'metal',
      available: true,
      confidence: 'confirmed',
      reason: `Metal GPU detected: ${gpus.map(g => g.name).join(', ')}`,
      warnings
    },
    gpus
  }
}
