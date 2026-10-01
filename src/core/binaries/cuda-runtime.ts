import { existsSync } from 'fs'
import { join } from 'path'
import type { CudaVersion } from './cuda'

export interface RuntimeProbeDeps {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  exists: (path: string) => boolean
}

const defaults: RuntimeProbeDeps = { platform: process.platform, env: process.env, exists: existsSync }

/**
 * Is a CUDA runtime of this major version already installed system-wide? If so
 * the engine can use it and the ~400 MB cudart bundle need not be downloaded.
 * Both cudart and cuBLAS must be present: the engine links against both.
 */
export function hasSystemCudaRuntime(version: CudaVersion, deps: Partial<RuntimeProbeDeps> = {}): boolean {
  const { platform, env, exists } = { ...defaults, ...deps }
  const major = version.major

  if (platform === 'win32') {
    const roots = Object.entries(env)
      .filter(([k, v]) => v && (k === 'CUDA_PATH' || k.startsWith(`CUDA_PATH_V${major}_`)))
      .map(([, v]) => v as string)
    return roots.some(root => {
      const bin = join(root, 'bin')
      // CUDA 13 moved the DLLs to bin/x64
      return [bin, join(bin, 'x64')].some(dir =>
        exists(join(dir, `cudart64_${major}.dll`)) && exists(join(dir, `cublas64_${major}.dll`))
      )
    })
  }

  if (platform === 'linux') {
    const dirs = [
      '/usr/local/cuda/lib64',
      `/usr/local/cuda-${major}/lib64`,
      '/usr/lib/x86_64-linux-gnu',
      '/usr/lib/aarch64-linux-gnu',
      '/usr/lib64'
    ]
    return dirs.some(dir =>
      exists(join(dir, `libcudart.so.${major}`)) && exists(join(dir, `libcublas.so.${major}`))
    )
  }

  return false
}
