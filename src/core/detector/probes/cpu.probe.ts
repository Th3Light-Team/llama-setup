import { BackendResult } from '../../types'
import si from 'systeminformation'

/**
 * CPU baseline detection — always available.
 * Enriches with manufacturer/brand and AVX2 check.
 * Follows DETECTOR.md §6.
 */
export async function probeCpu(): Promise<BackendResult> {
  const warnings: string[] = []
  let manufacturer = 'Unknown'
  let brand = 'CPU'

  try {
    const cpuData = await si.cpu()
    manufacturer = cpuData.manufacturer || 'Unknown'
    brand = cpuData.brand || 'CPU'

    // AVX2 detection via systeminformation flags
    const flags = (cpuData.flags || '').toLowerCase()
    const hasAvx2 = flags.includes('avx2')

    if (!hasAvx2) {
      // On some platforms systeminformation doesn't return flags.
      // Only warn if we got flags back but AVX2 wasn't among them.
      if (flags.length > 0) {
        warnings.push('CPU lacks AVX2. llama.cpp CPU performance will be very limited.')
      } else {
        warnings.push('CPU feature flags unavailable — AVX2 support could not be verified.')
      }
    }
  } catch (err) {
    warnings.push(`CPU detection partially failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return {
    id: 'cpu',
    available: true,
    confidence: 'confirmed',
    reason: `Detected ${manufacturer} ${brand}`,
    warnings
  }
}
