import os from 'os'
import { DetectionResult, BackendResult, VRAMInfo, GPUInfo, SystemInfo } from '../types'
import { probeCuda } from './probes/cuda.probe'
import { probeMetal } from './probes/metal.probe'
import { probeVulkan } from './probes/vulkan.probe'
import { probeOpenCL } from './probes/opencl.probe'
import { probeCpu } from './probes/cpu.probe'
import { probeSystem } from './probes/system.probe'
import { selectAsset } from './asset-selector'

/** Maximum time the entire detection pass is allowed to take (spec: 3 seconds) */
const DETECTION_BUDGET_MS = 3000
/** Independent budget for the systeminformation probe (CPU/RAM/disk enrichment).
 *  Run in parallel with backend probes so it doesn't get starved out. */
const SYSTEM_PROBE_BUDGET_MS = 5000

type OSType = 'windows' | 'macos' | 'linux'
type ArchType = 'x64' | 'arm64'

function resolveOS(): OSType {
  const platform = os.platform()
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  return 'linux'
}

function resolveArch(): ArchType {
  return os.arch() === 'arm64' ? 'arm64' : 'x64'
}

/**
 * Runs a detection probe with a timeout budget. If the probe exceeds the
 * remaining budget, returns a timeout-safe fallback result.
 */
async function withBudget<T>(
  probe: () => Promise<T>,
  fallback: T,
  remainingMs: number
): Promise<T> {
  if (remainingMs <= 0) return fallback

  return Promise.race([
    probe(),
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(fallback), remainingMs)
    )
  ])
}

/**
 * Main detection orchestrator.
 * 
 * Runs backend probes in the order specified by DETECTOR.md:
 * 1. CUDA (Windows + Linux)
 * 2. Metal (macOS)
 * 3. Vulkan (Windows + Linux)
 * 4. OpenCL (Linux only, when CUDA + Vulkan unavailable)
 * 5. CPU (always)
 * 
 * Enforces a global 3-second budget across all probes.
 * Assembles a unified DetectionResult with merged VRAM and asset recommendation.
 */
export async function detectHardware(): Promise<DetectionResult> {
  const startTime = performance.now()
  const osType = resolveOS()
  const archType = resolveArch()

  // Kick off the system probe in parallel with backend probes so it isn't
  // starved by the 3-second backend budget on slow Windows machines where
  // systeminformation can take 1–2s by itself.  It has its own budget.
  const systemPromise: Promise<SystemInfo | null> = withBudget(
    () => probeSystem(),
    null,
    SYSTEM_PROBE_BUDGET_MS
  ).catch(() => null)

  const backends: BackendResult[] = []
  const allGpus: GPUInfo[] = []

  function elapsed(): number {
    return Math.round(performance.now() - startTime)
  }

  function remaining(): number {
    return DETECTION_BUDGET_MS - elapsed()
  }

  // --- 1. CUDA (Windows + Linux) ---
  if (osType === 'windows' || osType === 'linux') {
    const cudaResult = await withBudget(
      () => probeCuda(osType as 'windows' | 'linux'),
      {
        backend: { id: 'cuda' as const, available: false, confidence: 'uncertain' as const, reason: 'Detection timed out', warnings: ['CUDA probe exceeded time budget'] },
        gpus: []
      },
      remaining()
    )
    backends.push(cudaResult.backend)
    allGpus.push(...cudaResult.gpus)
  }

  // --- 2. Metal (macOS) ---
  if (osType === 'macos') {
    const metalResult = await withBudget(
      () => probeMetal(),
      {
        backend: { id: 'metal' as const, available: false, confidence: 'uncertain' as const, reason: 'Detection timed out', warnings: ['Metal probe exceeded time budget'] },
        gpus: []
      },
      remaining()
    )
    backends.push(metalResult.backend)
    allGpus.push(...metalResult.gpus)
  }

  // --- 3. Vulkan (Windows + Linux) ---
  if (osType === 'windows' || osType === 'linux') {
    const vulkanResult = await withBudget(
      () => probeVulkan(osType as 'windows' | 'linux'),
      {
        backend: { id: 'vulkan' as const, available: false, confidence: 'uncertain' as const, reason: 'Detection timed out', warnings: ['Vulkan probe exceeded time budget'] },
        gpus: []
      },
      remaining()
    )
    backends.push(vulkanResult.backend)

    // Only add Vulkan GPUs if we don't already have VRAM data from CUDA
    // (CUDA is more reliable for NVIDIA cards)
    if (allGpus.length === 0) {
      allGpus.push(...vulkanResult.gpus)
    }
  }

  // --- 4. OpenCL (Linux only, when CUDA + Vulkan both unavailable) ---
  if (osType === 'linux') {
    const hasCuda = backends.some(b => b.id === 'cuda' && b.available)
    const hasVulkan = backends.some(b => b.id === 'vulkan' && b.available)

    if (!hasCuda && !hasVulkan) {
      const openclResult = await withBudget(
        () => probeOpenCL(),
        { id: 'opencl' as const, available: false, confidence: 'uncertain' as const, reason: 'Detection timed out', warnings: [] },
        remaining()
      )
      backends.push(openclResult)
    }
  }

  // --- 5. CPU (always) ---
  const cpuResult = await withBudget(
    () => probeCpu(),
    { id: 'cpu' as const, available: true, confidence: 'confirmed' as const, reason: 'CPU fallback (detection budget exceeded)', warnings: [] },
    remaining()
  )
  backends.push(cpuResult)

  // --- Assemble VRAM ---
  const vram: VRAMInfo | null = allGpus.length > 0
    ? { gpus: allGpus, totalMB: allGpus.reduce((sum, g) => sum + g.vramMB, 0) }
    : null

  // --- System info (CPU, RAM, disk, OS) — awaited from the parallel kick-off ---
  const system: SystemInfo | null = await systemPromise

  // --- Asset recommendation ---
  const recommendedAsset = selectAsset(osType, archType, backends)

  return {
    os: osType,
    arch: archType,
    backends,
    vram,
    system,
    recommendedAsset,
    detectedAt: Date.now()
  }
}
