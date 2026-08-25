import { create } from 'zustand'
import type { BenchJob, BenchSpec, BenchState } from '../../../core/bench/types'

interface BenchStoreState {
  jobs: Record<string, BenchJob>
  drawerOpen: boolean
  detailsId: string | null
  initialized: boolean

  init: () => () => void
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
  openDetails: (id: string) => void
  closeDetails: () => void

  start: (spec: BenchSpec) => Promise<string>
  cancel: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  clearDone: () => Promise<void>
}

export const useBenchStore = create<BenchStoreState>((set, get) => ({
  jobs: {},
  drawerOpen: false,
  detailsId: null,
  initialized: false,

  init: () => {
    if (!get().initialized) {
      window.electron.bench.list().then(list => {
        const jobs: Record<string, BenchJob> = {}
        for (const j of list) jobs[j.id] = j
        set({ jobs, initialized: true })
      })
    }

    const offList = window.electron.bench.onList(list => {
      const jobs: Record<string, BenchJob> = {}
      for (const j of list) jobs[j.id] = j
      set({ jobs })
    })

    const offProgress = window.electron.bench.onProgress(e => {
      set(s => {
        const j = s.jobs[e.id]
        if (!j) return s
        return { jobs: { ...s.jobs, [e.id]: { ...j, progress: e.progress, log: e.log } } }
      })
    })

    const offState = window.electron.bench.onState(e => {
      set(s => {
        const j = s.jobs[e.id]
        if (!j) return s
        return {
          jobs: {
            ...s.jobs,
            [e.id]: { ...j, state: e.state as BenchState, errorMessage: e.errorMessage, exitCode: e.exitCode }
          }
        }
      })
    })

    return () => { offList(); offProgress(); offState() }
  },

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set(s => ({ drawerOpen: !s.drawerOpen })),
  openDetails: (id) => set({ detailsId: id, drawerOpen: true }),
  closeDetails: () => set({ detailsId: null }),

  start: async (spec) => {
    const id = await window.electron.bench.start(spec)
    set({ drawerOpen: true })
    return id
  },
  cancel: async (id) => { await window.electron.bench.cancel(id) },
  remove: async (id) => { await window.electron.bench.remove(id) },
  clearDone: async () => { await window.electron.bench.clearDone() },
}))
