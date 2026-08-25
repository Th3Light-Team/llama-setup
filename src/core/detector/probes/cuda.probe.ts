import { BackendResult, GPUInfo } from '../../types'
import { runCommand, resolveNvidiaSmiPath, runCommandWithFallbackPaths } from '../runner'

export interface CudaProbeResult {
  backend: BackendResult
  gpus: GPUInfo[]
}

/** CUDA driver version → toolkit mapping from DETECTOR.md */
export function getCudaSuffix(driverVersion: string): string {
  const major = parseInt(driverVersion.split('.')[0], 10)
  if (isNaN(major)) return 'cuda-cu12.4' // default to latest if unparseable

  if (major >= 550) return 'cuda-cu12.4'
  if (major >= 520) return 'cuda-cu12.0'
  if (major >= 470) return 'cuda-cu11'
  return '' // unsupported
}

/**
 * CUDA detection chain: nvidia-smi → nvcc → Windows registry.
 * Follows DETECTOR.md §2 exactly.
 */
export async function probeCuda(osType: 'windows' | 'linux'): Promise<CudaProbeResult> {
  // Step 2a — nvidia-smi with explicit path fallback
  const smiCandidates = resolveNvidiaSmiPath(osType)
  const smiResult = await runCommandWithFallbackPaths(
    smiCandidates,
    ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
    { timeoutMs: 2000 }
  )

  if (smiResult.ok && smiResult.stdout.trim()) {
    const gpus: GPUInfo[] = []
    const lines = smiResult.stdout.split('\n').filter(l => l.trim())

    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim())
      if (parts.length < 2) continue

      const [name, memStr] = parts
      const memMB = parseInt(memStr, 10)
      if (!isNaN(memMB)) {
        gpus.push({ name, vramMB: memMB, backend: 'cuda' })
      }
    }

    // If we parsed GPU lines but got no valid entries, something is wrong
    if (gpus.length === 0) {
      return {
        backend: {
          id: 'cuda',
          available: false,
          confidence: 'uncertain',
          reason: 'nvidia-smi responded but GPU output could not be parsed',
          warnings: [`Raw output: ${smiResult.stdout.substring(0, 200)}`]
        },
        gpus: []
      }
    }

    // Fetch driver version in a separate call
    let driverVersion = 'unknown'
    const driverResult = await runCommandWithFallbackPaths(
      smiCandidates,
      ['--query-gpu=driver_version', '--format=csv,noheader'],
      { timeoutMs: 2000 }
    )
    if (driverResult.ok) {
      driverVersion = driverResult.stdout.split('\n')[0].trim()
    }

    const warnings: string[] = []
    const cudaSuffix = getCudaSuffix(driverVersion)
    if (!cudaSuffix) {
      warnings.push(`NVIDIA driver version ${driverVersion} is too old (< 470). Consider updating your drivers or using CPU fallback.`)
    }

    return {
      backend: {
        id: 'cuda',
        available: true,
        confidence: 'confirmed',
        version: driverVersion,
        reason: `nvidia-smi detected ${gpus.length} GPU(s)`,
        warnings
      },
      gpus
    }
  }

  // Step 2b — nvcc fallback
  const nvccResult = await runCommand('nvcc', ['--version'], { timeoutMs: 2000 })
  if (nvccResult.ok && nvccResult.stdout) {
    // Try to extract CUDA version from nvcc output (e.g. "release 12.4")
    const versionMatch = nvccResult.stdout.match(/release\s+(\d+\.\d+)/i)
    const version = versionMatch ? versionMatch[1] : undefined

    return {
      backend: {
        id: 'cuda',
        available: true,
        confidence: 'likely',
        version,
        reason: 'nvcc found but nvidia-smi unavailable — GPU enumeration not possible',
        warnings: ['nvidia-smi not found; VRAM unknown. GPU layers may not work correctly.']
      },
      gpus: []
    }
  }

  // Step 2c — Windows registry fallback
  if (osType === 'windows') {
    const regResult = await runCommand(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\NVIDIA Corporation\\Global\\NVTweak', '/ve'],
      { timeoutMs: 1000 }
    )
    if (regResult.ok) {
      return {
        backend: {
          id: 'cuda',
          available: true,
          confidence: 'uncertain',
          reason: 'NVIDIA driver registry key found, but neither nvidia-smi nor nvcc are accessible',
          warnings: [
            'Detection confidence is low. CUDA may not function correctly.',
            'Try installing the NVIDIA CUDA Toolkit for reliable detection.'
          ]
        },
        gpus: []
      }
    }
  }

  // All checks failed
  const diagnostics: string[] = []
  if (!smiResult.ok) diagnostics.push(`nvidia-smi: ${smiResult.error}`)
  if (!nvccResult.ok) diagnostics.push(`nvcc: ${nvccResult.error}`)

  return {
    backend: {
      id: 'cuda',
      available: false,
      confidence: 'confirmed',
      reason: 'No NVIDIA driver or toolkit detected',
      warnings: diagnostics.length > 0
        ? [`Detection details: ${diagnostics.join('; ')}`]
        : []
    },
    gpus: []
  }
}
