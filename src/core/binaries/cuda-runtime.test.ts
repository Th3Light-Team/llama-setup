import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { hasSystemCudaRuntime } from './cuda-runtime'

const files = (...paths: string[]) => (p: string) => paths.includes(p)

describe('hasSystemCudaRuntime (Windows)', () => {
  const win = (env: NodeJS.ProcessEnv, present: string[]) =>
    hasSystemCudaRuntime({ major: 12, minor: 4 }, { platform: 'win32', env, exists: files(...present) })

  it('is true when CUDA_PATH has both cudart and cublas of that major', () => {
    const root = 'C:\\CUDA\\v12.4'
    expect(win({ CUDA_PATH: root }, [join(root, 'bin', 'cudart64_12.dll'), join(root, 'bin', 'cublas64_12.dll')])).toBe(true)
  })

  it('accepts a versioned CUDA_PATH_V12_x variable', () => {
    const root = 'D:\\tools\\cuda'
    expect(win({ CUDA_PATH_V12_4: root }, [join(root, 'bin', 'cudart64_12.dll'), join(root, 'bin', 'cublas64_12.dll')])).toBe(true)
  })

  it('is false when cublas is missing (cudart alone is not enough)', () => {
    const root = 'C:\\CUDA'
    expect(win({ CUDA_PATH: root }, [join(root, 'bin', 'cudart64_12.dll')])).toBe(false)
  })

  it('is false for a different major, or with no CUDA_PATH', () => {
    const root = 'C:\\CUDA'
    expect(win({ CUDA_PATH: root }, [join(root, 'bin', 'cudart64_11.dll'), join(root, 'bin', 'cublas64_11.dll')])).toBe(false)
    expect(win({}, [])).toBe(false)
  })

  it('finds CUDA 13 libraries under bin/x64', () => {
    const root = 'C:\\CUDA13'
    expect(hasSystemCudaRuntime({ major: 13, minor: 4 }, {
      platform: 'win32', env: { CUDA_PATH: root },
      exists: files(join(root, 'bin', 'x64', 'cudart64_13.dll'), join(root, 'bin', 'x64', 'cublas64_13.dll'))
    })).toBe(true)
  })
})

describe('hasSystemCudaRuntime (Linux / other)', () => {
  const linux = (present: string[]) =>
    hasSystemCudaRuntime({ major: 12, minor: 8 }, { platform: 'linux', env: {}, exists: files(...present) })

  it('needs libcudart and libcublas of the same major', () => {
    expect(linux(['/usr/local/cuda/lib64/libcudart.so.12', '/usr/local/cuda/lib64/libcublas.so.12'])).toBe(true)
    expect(linux(['/usr/lib/x86_64-linux-gnu/libcudart.so.12', '/usr/lib/x86_64-linux-gnu/libcublas.so.12'])).toBe(true)
    expect(linux(['/usr/local/cuda/lib64/libcudart.so.12'])).toBe(false)
    expect(linux([])).toBe(false)
  })

  it('is false on macOS', () => {
    expect(hasSystemCudaRuntime({ major: 12, minor: 4 }, { platform: 'darwin', env: {}, exists: () => true })).toBe(false)
  })
})
