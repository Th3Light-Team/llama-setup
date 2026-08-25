import { contextBridge, ipcRenderer } from 'electron'

if (!process.contextIsolated) {
  throw new Error('contextIsolation must be enabled in the BrowserWindow')
}

try {
  contextBridge.exposeInMainWorld('electron', {
    ping: () => ipcRenderer.invoke('ping'),
    detectHardware: (forceRecheck?: boolean) => ipcRenderer.invoke('detectHardware', forceRecheck),
    binaries: {
      listReleases: (forceRefresh?: boolean) => ipcRenderer.invoke('binaries:listReleases', forceRefresh),
      getInstalled: () => ipcRenderer.invoke('binaries:getInstalled'),
      install: (tag: string, asset: any) => ipcRenderer.invoke('binaries:install', tag, asset),
      uninstall: (id: string) => ipcRenderer.invoke('binaries:uninstall', id)
    },
    launcher: {
      getFlagCatalog: () => ipcRenderer.invoke('launcher:getFlagCatalog'),
      getDefaultValues: () => ipcRenderer.invoke('launcher:getDefaultValues'),
      buildCliPreview: (binaryPath: string, values: any) => ipcRenderer.invoke('launcher:buildCliPreview', binaryPath, values),
      start: (installPath: string, flagValues: any) => ipcRenderer.invoke('launcher:start', installPath, flagValues),
      stop: () => ipcRenderer.invoke('launcher:stop'),
      status: () => ipcRenderer.invoke('launcher:status'),
      onLog: (callback: (line: string) => void) => {
        const handler = (_event: any, line: string) => callback(line)
        ipcRenderer.on('launcher:log', handler)
        return () => ipcRenderer.removeListener('launcher:log', handler)
      },
      listProfiles: () => ipcRenderer.invoke('launcher:listProfiles'),
      createProfile: (name: string, desc: string, backend: string, flags?: any) => ipcRenderer.invoke('launcher:createProfile', name, desc, backend, flags),
      updateProfile: (id: string, updates: any) => ipcRenderer.invoke('launcher:updateProfile', id, updates),
      deleteProfile: (id: string) => ipcRenderer.invoke('launcher:deleteProfile', id),
      duplicateProfile: (id: string) => ipcRenderer.invoke('launcher:duplicateProfile', id),
      exportProfile: (id: string) => ipcRenderer.invoke('launcher:exportProfile', id),
      importProfile: () => ipcRenderer.invoke('launcher:importProfile'),
      recordRun: (profileId: string) => ipcRenderer.invoke('launcher:recordRun', profileId),
      stopRun: (runId: string, exitCode: number) => ipcRenderer.invoke('launcher:stopRun', runId, exitCode),
      listRuns: (profileId: string) => ipcRenderer.invoke('launcher:listRuns', profileId)
    },
    registry: {
      search: (query: string, sort?: string) => ipcRenderer.invoke('registry:search', query, sort),
      detail: (modelId: string) => ipcRenderer.invoke('registry:detail', modelId),
      download: (modelId: string, filename: string, url: string, sha256?: string | null, shards?: unknown[]) =>
        ipcRenderer.invoke('registry:download', modelId, filename, url, sha256, shards),
      getModelsDir: () => ipcRenderer.invoke('registry:getModelsDir')
    },
    library: {
      list: () => ipcRenderer.invoke('library:list'),
      folders: () => ipcRenderer.invoke('library:folders'),
      reveal: (filePath: string) => ipcRenderer.invoke('library:reveal', filePath),
      delete: (filePath: string) => ipcRenderer.invoke('library:delete', filePath),
      addFolder: (folderPath: string) => ipcRenderer.invoke('library:addFolder', folderPath),
      removeFolder: (folderPath: string) => ipcRenderer.invoke('library:removeFolder', folderPath),
    },
    app: {
      getOnboardingState: () => ipcRenderer.invoke('app:getOnboardingState'),
      setOnboardingState: (state: any) => ipcRenderer.invoke('app:setOnboardingState', state),
      resetOnboarding: () => ipcRenderer.invoke('app:resetOnboarding'),
      getSettings: () => ipcRenderer.invoke('app:getSettings'),
      setSettings: (s: any) => ipcRenderer.invoke('app:setSettings', s),
      pickFolder: (opts?: { title?: string }) => ipcRenderer.invoke('app:pickFolder', opts),
      diskFree: (targetPath?: string) => ipcRenderer.invoke('app:diskFree', targetPath),
    },
    discovery: {
      scan: (options?: any) => ipcRenderer.invoke('discovery:scan', options),
      verify: (binaryPath: string) => ipcRenderer.invoke('discovery:verify', binaryPath),
      importBinary: (binaryPath: string, backend?: string) => ipcRenderer.invoke('discovery:import', binaryPath, backend),
      getLastScan: () => ipcRenderer.invoke('discovery:getLastScan')
    },
    engines: {
      list: (force?: boolean) => ipcRenderer.invoke('engines:list', force),
      setDefault: (path: string) => ipcRenderer.invoke('engines:setDefault', path),
      getDefault: () => ipcRenderer.invoke('engines:getDefault'),
      verify: (installPath: string) => ipcRenderer.invoke('engines:verify', installPath),
    },
    bench: {
      start: (spec: unknown) => ipcRenderer.invoke('bench:start', spec),
      cancel: (id: string) => ipcRenderer.invoke('bench:cancel', id),
      remove: (id: string) => ipcRenderer.invoke('bench:remove', id),
      clearDone: () => ipcRenderer.invoke('bench:clearDone'),
      list: () => ipcRenderer.invoke('bench:list'),
      get: (id: string) => ipcRenderer.invoke('bench:get', id),
      onList: (cb: (jobs: unknown[]) => void) => {
        const handler = (_e: unknown, data: unknown[]) => cb(data)
        ipcRenderer.on('bench:list', handler)
        return () => ipcRenderer.removeListener('bench:list', handler)
      },
      onProgress: (cb: (e: { id: string; progress: number; log: string }) => void) => {
        const handler = (_e: unknown, data: { id: string; progress: number; log: string }) => cb(data)
        ipcRenderer.on('bench:progress', handler)
        return () => ipcRenderer.removeListener('bench:progress', handler)
      },
      onState: (cb: (e: { id: string; state: string; errorMessage: string | null; exitCode: number | null }) => void) => {
        const handler = (_e: unknown, data: { id: string; state: string; errorMessage: string | null; exitCode: number | null }) => cb(data)
        ipcRenderer.on('bench:state', handler)
        return () => ipcRenderer.removeListener('bench:state', handler)
      },
    },
    downloads: {
      enqueue: (spec: any) => ipcRenderer.invoke('download:enqueue', spec),
      cancel: (id: string) => ipcRenderer.invoke('download:cancel', id),
      pause: (id: string) => ipcRenderer.invoke('download:pause', id),
      resume: (id: string) => ipcRenderer.invoke('download:resume', id),
      remove: (id: string) => ipcRenderer.invoke('download:remove', id),
      clearDone: () => ipcRenderer.invoke('download:clearDone'),
      list: () => ipcRenderer.invoke('download:list'),
      onList: (cb: (jobs: any[]) => void) => {
        const handler = (_e: any, data: any) => cb(data)
        ipcRenderer.on('download:list', handler)
        return () => ipcRenderer.removeListener('download:list', handler)
      },
      onProgress: (cb: (e: any) => void) => {
        const handler = (_e: any, data: any) => cb(data)
        ipcRenderer.on('download:progress', handler)
        return () => ipcRenderer.removeListener('download:progress', handler)
      },
      onState: (cb: (e: any) => void) => {
        const handler = (_e: any, data: any) => cb(data)
        ipcRenderer.on('download:state', handler)
        return () => ipcRenderer.removeListener('download:state', handler)
      },
      onDone: (cb: (e: any) => void) => {
        const handler = (_e: any, data: any) => cb(data)
        ipcRenderer.on('download:done', handler)
        return () => ipcRenderer.removeListener('download:done', handler)
      }
    }
  })
} catch (error) {
  console.error(error)
}
