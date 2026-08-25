import { create } from 'zustand'

import type { FlagDef, FlagValues, Profile, ServerStatus } from '../../../core/launcher/types'
export { useDownloadsStore } from './downloads'

interface LauncherState {
  flagCatalog: FlagDef[]
  flagValues: FlagValues
  profiles: Profile[]
  serverStatus: ServerStatus
  logs: string[]
  selectedInstallPath: string
  isLoadingProfiles: boolean

  init: () => Promise<void>
  setFlagValue: (key: string, value: any) => void
  resetFlags: () => Promise<void>

  startServer: (installPath: string) => Promise<void>
  stopServer: () => Promise<void>
  pollStatus: () => Promise<void>
  initLogListener: () => () => void
  clearLogs: () => void

  loadProfiles: () => Promise<void>
  createProfile: (name: string, desc: string, backend: string) => Promise<void>
  updateProfile: (id: string, flags: FlagValues) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  loadProfile: (profile: Profile) => void

  setInstallPath: (path: string) => void
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  flagCatalog: [],
  flagValues: {},
  profiles: [],
  serverStatus: { state: 'stopped', pid: null, port: null, error: null, uptime: null },
  logs: [],
  selectedInstallPath: '',
  isLoadingProfiles: false,

  init: async () => {
    const [catalog, defaults] = await Promise.all([
      window.electron.launcher.getFlagCatalog(),
      window.electron.launcher.getDefaultValues()
    ])
    set({ flagCatalog: catalog, flagValues: defaults })
    await get().loadProfiles()
  },

  setFlagValue: (key, value) => {
    set(state => ({
      flagValues: { ...state.flagValues, [key]: value }
    }))
  },

  resetFlags: async () => {
    const defaults = await window.electron.launcher.getDefaultValues()
    set({ flagValues: defaults })
  },

  startServer: async (installPath) => {
    const status = await window.electron.launcher.start(installPath, get().flagValues)
    set({ serverStatus: status, selectedInstallPath: installPath })
  },

  stopServer: async () => {
    const status = await window.electron.launcher.stop()
    set({ serverStatus: status })
  },

  pollStatus: async () => {
    const status = await window.electron.launcher.status()
    set({ serverStatus: status })
  },

  initLogListener: () => {
    return window.electron.launcher.onLog((line) => {
      set(state => ({
        logs: [...state.logs.slice(-500), line] // Keep last 500 lines
      }))
    })
  },

  clearLogs: () => set({ logs: [] }),

  loadProfiles: async () => {
    set({ isLoadingProfiles: true })
    const profiles = await window.electron.launcher.listProfiles()
    set({ profiles, isLoadingProfiles: false })
  },

  createProfile: async (name, desc, backend) => {
    await window.electron.launcher.createProfile(name, desc, backend, get().flagValues)
    await get().loadProfiles()
  },

  updateProfile: async (id, flags) => {
    await window.electron.launcher.updateProfile(id, { flags })
    await get().loadProfiles()
  },

  deleteProfile: async (id) => {
    await window.electron.launcher.deleteProfile(id)
    await get().loadProfiles()
  },

  loadProfile: (profile) => {
    set({ flagValues: { ...profile.flags } })
  },

  setInstallPath: (path) => set({ selectedInstallPath: path })
}))

import type { ReleaseWithAssets, InstallRecord, ParsedAsset } from '../../../core/binaries/types'

interface BinariesState {
  releases: ReleaseWithAssets[]
  installed: InstallRecord[]
  isLoadingReleases: boolean
  isLoadingInstalled: boolean
  error: string | null

  fetchReleases: (force?: boolean) => Promise<void>
  fetchInstalled: () => Promise<void>
  install: (tag: string, asset: ParsedAsset) => Promise<string>
  uninstall: (id: string) => Promise<void>
}

export const useBinariesStore = create<BinariesState>((set) => ({
  releases: [],
  installed: [],
  isLoadingReleases: false,
  isLoadingInstalled: false,
  error: null,

  fetchReleases: async (force = false) => {
    set({ isLoadingReleases: true, error: null })
    try {
      const releases = await window.electron.binaries.listReleases(force)
      set({ releases, isLoadingReleases: false })
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch releases', isLoadingReleases: false })
    }
  },

  fetchInstalled: async () => {
    set({ isLoadingInstalled: true, error: null })
    try {
      const installed = await window.electron.binaries.getInstalled()
      set({ installed, isLoadingInstalled: false })
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch installed binaries', isLoadingInstalled: false })
    }
  },

  /** Enqueues the install via the unified DownloadManager. Progress is observed in the downloads drawer. */
  install: async (tag, asset) => {
    set({ error: null })
    try {
      return await window.electron.binaries.install(tag, asset)
    } catch (err: any) {
      set({ error: err.message || 'Failed to install binary' })
      throw err
    }
  },

  uninstall: async (id) => {
    set({ error: null })
    try {
      await window.electron.binaries.uninstall(id)
      const installed = await window.electron.binaries.getInstalled()
      set({ installed })
    } catch (err: any) {
      set({ error: err.message || 'Failed to uninstall binary' })
    }
  }
}))

import type { DetectionResult } from '../../../core/types'

interface DetectorState {
  result: DetectionResult | null
  isLoading: boolean
  error: string | null
  detect: (force?: boolean) => Promise<void>
}

export const useDetectorStore = create<DetectorState>((set) => ({
  result: null,
  isLoading: false,
  error: null,
  detect: async (force = false) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electron.detectHardware(force)
      set({ result, isLoading: false })
    } catch (err: any) {
      set({ error: err.message || 'Detection failed', isLoading: false })
    }
  }
}))

// ─── Discovery Store ─────────────────────────────────────────────

import type { InstallationScan, BinaryHealth, ScanOptions, DiscoveredInstall } from '../../../core/discovery/types'

interface DiscoveryState {
  scan: InstallationScan | null
  isScanning: boolean
  lastError: string | null

  runScan: (options?: ScanOptions & { forceRescan?: boolean }) => Promise<void>
  verifyBinary: (path: string) => Promise<BinaryHealth>
  importExternal: (binaryPath: string, backend?: string) => Promise<void>
  clearScan: () => void

  /** Computed getters */
  healthyCount: () => number
  issueCount: () => number
  externalInstalls: () => DiscoveredInstall[]
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  scan: null,
  isScanning: false,
  lastError: null,

  runScan: async (options) => {
    set({ isScanning: true, lastError: null })
    try {
      const scan = await window.electron.discovery.scan(options)
      set({ scan, isScanning: false })
    } catch (err: any) {
      set({ lastError: err.message || 'Discovery scan failed', isScanning: false })
    }
  },

  verifyBinary: async (path: string) => {
    return window.electron.discovery.verify(path)
  },

  importExternal: async (binaryPath: string, backend?: string) => {
    try {
      await window.electron.discovery.importBinary(binaryPath, backend)
      // Re-run scan to refresh the list
      await get().runScan({ forceRescan: true })
    } catch (err: any) {
      set({ lastError: err.message || 'Import failed' })
      throw err
    }
  },

  clearScan: () => set({ scan: null, lastError: null }),

  healthyCount: () => {
    const scan = get().scan
    if (!scan) return 0
    return scan.installations.filter(i => i.health.status === 'healthy').length
  },

  issueCount: () => {
    const scan = get().scan
    if (!scan) return 0
    return scan.issues.filter(i => i.severity === 'error' || i.severity === 'warning').length
  },

  externalInstalls: () => {
    const scan = get().scan
    if (!scan) return []
    return scan.installations.filter(i => !i.managed)
  }
}))

