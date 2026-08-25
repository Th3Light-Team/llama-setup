/// <reference types="vite/client" />

interface Window {
  electron: {
    ping: () => Promise<string>
    detectHardware: (forceRecheck?: boolean) => Promise<import('../core/types').DetectionResult>
    binaries: {
      listReleases: (forceRefresh?: boolean) => Promise<import('../core/binaries/types').ReleaseWithAssets[]>
      getInstalled: () => Promise<import('../core/binaries/types').InstallRecord[]>
      install: (tag: string, asset: import('../core/binaries/types').ParsedAsset) => Promise<string>
      uninstall: (id: string) => Promise<void>
    }
    launcher: {
      getFlagCatalog: () => Promise<import('../core/launcher/types').FlagDef[]>
      getDefaultValues: () => Promise<Record<string, any>>
      buildCliPreview: (binaryPath: string, values: Record<string, any>) => Promise<string>
      start: (installPath: string, flagValues: Record<string, any>) => Promise<import('../core/launcher/types').ServerStatus>
      stop: () => Promise<import('../core/launcher/types').ServerStatus>
      status: () => Promise<import('../core/launcher/types').ServerStatus>
      onLog: (callback: (line: string) => void) => () => void
      listProfiles: () => Promise<import('../core/launcher/types').Profile[]>
      createProfile: (name: string, desc: string, backend: string, flags?: Record<string, any>) => Promise<import('../core/launcher/types').Profile>
      updateProfile: (id: string, updates: any) => Promise<void>
      deleteProfile: (id: string) => Promise<void>
      duplicateProfile: (id: string) => Promise<import('../core/launcher/types').Profile>
      exportProfile: (id: string) => Promise<string | null>
      importProfile: () => Promise<import('../core/launcher/types').Profile | null>
      recordRun: (profileId: string) => Promise<string>
      stopRun: (runId: string, exitCode: number) => Promise<void>
      listRuns: (profileId: string) => Promise<{ id: string; profile_id: string; started_at: string; stopped_at: string | null; exit_code: number | null }[]>
    }
    library: {
      list: () => Promise<{
        modelId: string
        filename: string
        path: string
        sizeMb: number
        downloadedAt: string | null
        meta: Record<string, unknown> | null
        folderPath: string
        isDefaultFolder: boolean
      }[]>
      folders: () => Promise<{ path: string; isDefault: boolean }[]>
      reveal: (path: string) => Promise<void>
      delete: (path: string) => Promise<void>
      addFolder: (folderPath: string) => Promise<string[]>
      removeFolder: (folderPath: string) => Promise<string[]>
    }
    registry: {
      search: (query: string, sort?: string) => Promise<import('../core/registry/types').HfModelSummary[]>
      detail: (modelId: string) => Promise<import('../core/registry/types').HfModelDetail>
      download: (
        modelId: string,
        filename: string,
        url: string,
        sha256?: string | null,
        shards?: import('../core/registry/types').ShardFile[]
      ) => Promise<string>
      getModelsDir: () => Promise<string>
    }
    discovery: {
      scan: (options?: import('../core/discovery/types').ScanOptions & { forceRescan?: boolean }) => Promise<import('../core/discovery/types').InstallationScan>
      verify: (binaryPath: string) => Promise<import('../core/discovery/types').BinaryHealth>
      importBinary: (binaryPath: string, backend?: string) => Promise<import('../core/binaries/types').InstallRecord>
      getLastScan: () => Promise<import('../core/discovery/types').InstallationScan | null>
    }
    engines: {
      list: (force?: boolean) => Promise<import('../core/engines/types').EngineRow[]>
      setDefault: (path: string) => Promise<string>
      getDefault: () => Promise<string | null>
      verify: (installPath: string) => Promise<import('../core/discovery/types').BinaryHealth>
    }
    bench: {
      start: (spec: import('../core/bench/types').BenchSpec) => Promise<string>
      cancel: (id: string) => Promise<void>
      remove: (id: string) => Promise<void>
      clearDone: () => Promise<void>
      list: () => Promise<import('../core/bench/types').BenchJob[]>
      get: (id: string) => Promise<import('../core/bench/types').BenchJob | null>
      onList: (cb: (jobs: import('../core/bench/types').BenchJob[]) => void) => () => void
      onProgress: (cb: (e: { id: string; progress: number; log: string }) => void) => () => void
      onState: (cb: (e: { id: string; state: string; errorMessage: string | null; exitCode: number | null }) => void) => () => void
    }
    downloads: {
      enqueue: (spec: import('../core/downloads/types').EnqueueSpec) => Promise<string>
      cancel: (id: string) => Promise<void>
      pause: (id: string) => Promise<void>
      resume: (id: string) => Promise<void>
      remove: (id: string) => Promise<void>
      clearDone: () => Promise<void>
      list: () => Promise<import('../core/downloads/types').DownloadJob[]>
      onList: (cb: (jobs: import('../core/downloads/types').DownloadJob[]) => void) => () => void
      onProgress: (cb: (e: import('../core/downloads/types').DownloadProgressEvent) => void) => () => void
      onState: (cb: (e: import('../core/downloads/types').DownloadStateEvent) => void) => () => void
      onDone: (cb: (e: import('../core/downloads/types').DownloadDoneEvent) => void) => () => void
    }
    app: {
      getOnboardingState: () => Promise<any>
      setOnboardingState: (state: any) => Promise<void>
      resetOnboarding: () => Promise<void>
      getSettings: () => Promise<{
        modelsDir: string
        extraModelsDirs: string[]
        binariesDir: string
        licensePolicy: 'unrestricted' | 'standard' | 'strict'
        telemetry: boolean
      }>
      setSettings: (s: Partial<{
        modelsDir: string
        extraModelsDirs: string[]
        binariesDir: string
        licensePolicy: 'unrestricted' | 'standard' | 'strict'
        telemetry: boolean
      }>) => Promise<unknown>
      pickFolder: (opts?: { title?: string }) => Promise<string | null>
      diskFree: (targetPath?: string) => Promise<number | null>
    }
  }
}
