import { describe, it, expect } from 'vitest'
import { bestHealth, deriveDevices } from './types'

describe('bestHealth', () => {
  it('returns the best health among binaries', () => {
    expect(bestHealth(['degraded', 'healthy', 'broken'])).toBe('healthy')
    expect(bestHealth(['degraded', 'broken'])).toBe('degraded')
    expect(bestHealth(['unknown', 'broken'])).toBe('broken')
    expect(bestHealth([])).toBe('unknown')
  })

  it('treats a working server + degraded bench as healthy engine', () => {
    // llama-server healthy, llama-bench degraded (no --version) → engine usable
    expect(bestHealth(['healthy', 'degraded', 'degraded'])).toBe('healthy')
  })
})

describe('deriveDevices', () => {
  const gpus = ['NVIDIA GeForce RTX 4070 Laptop GPU', 'AMD Radeon 890M Graphics']

  it('CUDA targets only NVIDIA GPUs (+ CPU)', () => {
    expect(deriveDevices('cuda-cu12.4', gpus)).toEqual([
      'NVIDIA GeForce RTX 4070 Laptop GPU', 'CPU',
    ])
  })

  it('Vulkan targets every visible GPU (+ CPU)', () => {
    expect(deriveDevices('vulkan', gpus)).toEqual([
      'NVIDIA GeForce RTX 4070 Laptop GPU', 'AMD Radeon 890M Graphics', 'CPU',
    ])
  })

  it('ROCm targets only AMD GPUs', () => {
    expect(deriveDevices('rocm', gpus)).toEqual(['AMD Radeon 890M Graphics', 'CPU'])
  })

  it('CPU backend is CPU only', () => {
    expect(deriveDevices('cpu', gpus)).toEqual(['CPU'])
  })

  it('unknown backend surfaces GPUs + CPU', () => {
    expect(deriveDevices('unknown', gpus)).toEqual([
      'NVIDIA GeForce RTX 4070 Laptop GPU', 'AMD Radeon 890M Graphics', 'CPU',
    ])
  })

  it('falls back to CPU when no GPUs detected', () => {
    expect(deriveDevices('cuda', [])).toEqual(['CPU'])
    expect(deriveDevices('vulkan', [])).toEqual(['CPU'])
  })
})
