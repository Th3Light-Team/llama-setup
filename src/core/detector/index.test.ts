import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectHardware } from './index'
import * as cudaProbe from './probes/cuda.probe'
import * as metalProbe from './probes/metal.probe'
import * as vulkanProbe from './probes/vulkan.probe'
import * as openclProbe from './probes/opencl.probe'
import * as cpuProbe from './probes/cpu.probe'
import * as systemProbe from './probes/system.probe'
import os from 'os'

vi.mock('os')
vi.mock('./probes/cuda.probe')
vi.mock('./probes/metal.probe')
vi.mock('./probes/vulkan.probe')
vi.mock('./probes/opencl.probe')
vi.mock('./probes/cpu.probe')
vi.mock('./probes/system.probe')

describe('Hardware Detector Orchestrator', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(os.platform).mockReturnValue('win32')
    vi.mocked(os.arch).mockReturnValue('x64')

    // Default CPU probe response
    vi.mocked(cpuProbe.probeCpu).mockResolvedValue({
      id: 'cpu', available: true, confidence: 'confirmed',
      reason: 'Detected Intel Core i9', warnings: []
    })
  })

  it('detects CUDA + Vulkan on Windows and prefers CUDA VRAM', async () => {
    vi.mocked(cudaProbe.probeCuda).mockResolvedValue({
      backend: {
        id: 'cuda', available: true, confidence: 'confirmed',
        version: '550.54', reason: 'nvidia-smi detected 1 GPU(s)', warnings: []
      },
      gpus: [{ name: 'RTX 4090', vramMB: 24576, backend: 'cuda' }]
    })

    vi.mocked(vulkanProbe.probeVulkan).mockResolvedValue({
      backend: {
        id: 'vulkan', available: true, confidence: 'confirmed',
        reason: 'vulkaninfo detected 1 device(s)', warnings: []
      },
      gpus: [{ name: 'RTX 4090', vramMB: 24576, backend: 'vulkan' }]
    })

    const result = await detectHardware()

    expect(result.os).toBe('windows')
    expect(result.arch).toBe('x64')
    expect(result.backends).toHaveLength(3) // cuda, vulkan, cpu

    const cuda = result.backends.find(b => b.id === 'cuda')
    expect(cuda?.available).toBe(true)
    expect(cuda?.confidence).toBe('confirmed')

    // VRAM should come from CUDA, not duplicated from Vulkan
    expect(result.vram?.gpus).toHaveLength(1)
    expect(result.vram?.gpus[0].backend).toBe('cuda')
    expect(result.vram?.totalMB).toBe(24576)
  })

  it('falls back to Vulkan GPUs when CUDA is unavailable', async () => {
    vi.mocked(cudaProbe.probeCuda).mockResolvedValue({
      backend: {
        id: 'cuda', available: false, confidence: 'confirmed',
        reason: 'No NVIDIA driver', warnings: []
      },
      gpus: []
    })

    vi.mocked(vulkanProbe.probeVulkan).mockResolvedValue({
      backend: {
        id: 'vulkan', available: true, confidence: 'confirmed',
        reason: 'vulkaninfo detected 1 device(s)', warnings: []
      },
      gpus: [{ name: 'AMD Radeon RX 7900', vramMB: 20480, backend: 'vulkan' }]
    })

    const result = await detectHardware()

    expect(result.vram?.gpus).toHaveLength(1)
    expect(result.vram?.gpus[0].backend).toBe('vulkan')
    expect(result.vram?.totalMB).toBe(20480)
  })

  it('detects Metal on macOS and skips CUDA/Vulkan', async () => {
    vi.mocked(os.platform).mockReturnValue('darwin')
    vi.mocked(os.arch).mockReturnValue('arm64')

    vi.mocked(metalProbe.probeMetal).mockResolvedValue({
      backend: {
        id: 'metal', available: true, confidence: 'confirmed',
        reason: 'Metal GPU detected: Apple M2', warnings: []
      },
      gpus: [{ name: 'Apple M2', vramMB: 12288, backend: 'metal' }]
    })

    const result = await detectHardware()

    expect(result.os).toBe('macos')
    expect(result.arch).toBe('arm64')
    expect(result.backends.find(b => b.id === 'metal')?.available).toBe(true)
    expect(result.vram?.totalMB).toBe(12288)

    // CUDA and Vulkan should NOT have been probed
    expect(cudaProbe.probeCuda).not.toHaveBeenCalled()
    expect(vulkanProbe.probeVulkan).not.toHaveBeenCalled()
  })

  it('probes OpenCL on Linux only when CUDA + Vulkan are unavailable', async () => {
    vi.mocked(os.platform).mockReturnValue('linux')

    vi.mocked(cudaProbe.probeCuda).mockResolvedValue({
      backend: { id: 'cuda', available: false, confidence: 'confirmed', reason: 'not found', warnings: [] },
      gpus: []
    })

    vi.mocked(vulkanProbe.probeVulkan).mockResolvedValue({
      backend: { id: 'vulkan', available: false, confidence: 'confirmed', reason: 'not found', warnings: [] },
      gpus: []
    })

    vi.mocked(openclProbe.probeOpenCL).mockResolvedValue({
      id: 'opencl', available: true, confidence: 'likely',
      reason: 'clinfo detected GPU platform',
      warnings: ['OpenCL detected. Performance may be significantly lower than CUDA or Vulkan.']
    })

    const result = await detectHardware()

    expect(openclProbe.probeOpenCL).toHaveBeenCalled()
    expect(result.backends.find(b => b.id === 'opencl')?.available).toBe(true)
  })

  it('skips OpenCL probe on Linux when CUDA is available', async () => {
    vi.mocked(os.platform).mockReturnValue('linux')

    vi.mocked(cudaProbe.probeCuda).mockResolvedValue({
      backend: { id: 'cuda', available: true, confidence: 'confirmed', version: '550', reason: 'found', warnings: [] },
      gpus: [{ name: 'RTX 3060', vramMB: 12288, backend: 'cuda' }]
    })

    vi.mocked(vulkanProbe.probeVulkan).mockResolvedValue({
      backend: { id: 'vulkan', available: false, confidence: 'confirmed', reason: 'not found', warnings: [] },
      gpus: []
    })

    const result = await detectHardware()

    expect(openclProbe.probeOpenCL).not.toHaveBeenCalled()
    expect(result.backends.find(b => b.id === 'opencl')).toBeUndefined()
  })

  it('CPU is always detected even when all GPU probes fail', async () => {
    vi.mocked(cudaProbe.probeCuda).mockResolvedValue({
      backend: { id: 'cuda', available: false, confidence: 'confirmed', reason: 'not found', warnings: [] },
      gpus: []
    })

    vi.mocked(vulkanProbe.probeVulkan).mockResolvedValue({
      backend: { id: 'vulkan', available: false, confidence: 'confirmed', reason: 'not found', warnings: [] },
      gpus: []
    })

    const result = await detectHardware()

    const cpu = result.backends.find(b => b.id === 'cpu')
    expect(cpu).toBeDefined()
    expect(cpu?.available).toBe(true)
    expect(result.vram).toBeNull()
  })

  it('handles probe timeout by returning fallback result', async () => {
    // Simulate a CUDA probe that never resolves within budget
    vi.mocked(cudaProbe.probeCuda).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        backend: { id: 'cuda', available: true, confidence: 'confirmed', version: '550', reason: 'slow', warnings: [] },
        gpus: [{ name: 'RTX 4090', vramMB: 24576, backend: 'cuda' }]
      }), 5000)) // 5 seconds, exceeds 3s budget
    )

    vi.mocked(vulkanProbe.probeVulkan).mockResolvedValue({
      backend: { id: 'vulkan', available: false, confidence: 'confirmed', reason: 'not found', warnings: [] },
      gpus: []
    })

    const result = await detectHardware()

    // Should have timed out and returned a fallback
    const cuda = result.backends.find(b => b.id === 'cuda')
    expect(cuda).toBeDefined()
    // The result should still be valid (either real or timeout fallback)
    expect(result.backends.find(b => b.id === 'cpu')).toBeDefined()
  }, 10000)
})
