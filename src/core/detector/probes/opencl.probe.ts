import { BackendResult } from '../../types'
import { runCommand } from '../runner'

/**
 * OpenCL detection — Linux-only last-resort fallback.
 * Only checked when CUDA and Vulkan are both unavailable.
 * Follows DETECTOR.md §5.
 */
export async function probeOpenCL(): Promise<BackendResult> {
  const result = await runCommand('clinfo', ['--list'], { timeoutMs: 1500 })

  if (result.ok && result.stdout.trim()) {
    // Check if output actually lists a GPU platform (not just CPU)
    const hasGpuPlatform = result.stdout.toLowerCase().includes('gpu')

    if (hasGpuPlatform) {
      return {
        id: 'opencl',
        available: true,
        confidence: 'likely',
        reason: 'clinfo detected a GPU-capable OpenCL platform',
        warnings: [
          'OpenCL detected. Performance may be significantly lower than CUDA or Vulkan.',
          'Consider installing Vulkan drivers for better performance.'
        ]
      }
    }

    // clinfo ran but only found CPU platforms
    return {
      id: 'opencl',
      available: false,
      confidence: 'confirmed',
      reason: 'clinfo found only CPU OpenCL platforms — no GPU acceleration available',
      warnings: []
    }
  }

  return {
    id: 'opencl',
    available: false,
    confidence: 'confirmed',
    reason: 'clinfo not found or returned no output',
    warnings: result.ok ? [] : [`clinfo: ${result.error}`]
  }
}
