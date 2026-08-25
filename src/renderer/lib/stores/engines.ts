import { create } from 'zustand'
import type { EngineRow } from '../../../core/engines/types'

interface EnginesState {
  engines: EngineRow[]
  loading: boolean
  load: (force?: boolean) => Promise<void>
  setDefault: (path: string) => Promise<void>
  verify: (installPath: string) => Promise<void>
}

export const useEnginesStore = create<EnginesState>((set, get) => ({
  engines: [],
  loading: false,

  load: async (force = false) => {
    set({ loading: true })
    try {
      const engines = await window.electron.engines.list(force)
      set({ engines })
    } finally {
      set({ loading: false })
    }
  },

  setDefault: async (path) => {
    await window.electron.engines.setDefault(path)
    await get().load(false)
  },

  verify: async (installPath) => {
    await window.electron.engines.verify(installPath)
    await get().load(true) // verify invalidates discovery cache → force re-list
  },
}))
