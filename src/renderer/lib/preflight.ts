import type { PreflightResult } from '@/components/DownloadConfirmDialog'

export interface PreflightInput {
  sizeMB: number
  sha256?: string | null
  authorVerified?: boolean
  license?: string | null
}

type LicensePolicy = 'unrestricted' | 'standard' | 'strict'

const STANDARD_LICENSES = new Set([
  'mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause', 'gpl-2.0', 'gpl-3.0',
  'lgpl-2.0', 'lgpl-2.1', 'lgpl-3.0', 'mpl-2.0', 'isc', 'cc0-1.0', 'unlicense',
  'openrail', 'openrail++',
])

const STRICT_LICENSES = new Set([
  'mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause', 'isc', 'cc0-1.0', 'unlicense',
])

function checkLicense(
  license: string | null | undefined,
  policy: LicensePolicy
): { ok: boolean; blocked?: string } {
  if (policy === 'unrestricted') return { ok: true }
  if (!license) return { ok: true } // no license info → allow (warn separately if needed)
  const normalized = license.toLowerCase().trim()
  if (policy === 'standard') {
    if (STANDARD_LICENSES.has(normalized)) return { ok: true }
    return { ok: false, blocked: `License "${license}" is not allowed under Standard policy` }
  }
  // strict
  if (STRICT_LICENSES.has(normalized)) return { ok: true }
  return { ok: false, blocked: `License "${license}" is not allowed under Strict policy` }
}

/**
 * Run preflight checks before starting a download:
 * 1. Disk space — calls main via IPC
 * 2. License compliance — reads policy from settings
 * 3. SHA-256 availability
 */
export async function preflightCheck(input: PreflightInput): Promise<PreflightResult> {
  const sizeGB = input.sizeMB / 1024
  // Require 10% headroom above the file size, minimum 0.5 GB
  const requiredGB = Math.max(sizeGB * 1.1, sizeGB + 0.5)

  // ── Disk space ──────────────────────────────────────────────────────────────
  let diskAvailableGB: number | null = null
  let diskOk = true
  try {
    diskAvailableGB = await window.electron.app.diskFree()
    if (diskAvailableGB !== null) {
      diskOk = diskAvailableGB >= requiredGB
    }
  } catch {
    // IPC unavailable — allow download (fail open)
  }

  // ── License compliance ──────────────────────────────────────────────────────
  let licensePolicy: LicensePolicy = 'unrestricted'
  try {
    const settings = await window.electron.app.getSettings()
    licensePolicy = (settings?.licensePolicy as LicensePolicy | undefined) ?? 'unrestricted'
  } catch {
    // ignore
  }
  const licenseCheck = checkLicense(input.license, licensePolicy)

  return {
    diskOk,
    diskAvailableGB,
    diskRequiredGB: requiredGB,
    licenseOk: licenseCheck.ok,
    licenseBlocked: licenseCheck.blocked,
    compatibilityWarnings: [],
    authorVerified: !!input.authorVerified,
    sha256Available: !!input.sha256,
  }
}
