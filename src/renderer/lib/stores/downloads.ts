import { create } from 'zustand'
import type {
  DownloadJob,
  EnqueueSpec
} from '../../../core/downloads/types'

interface DownloadsState {
  jobs: Record<string, DownloadJob>
  drawerOpen: boolean
  inited: boolean

  init: () => Promise<() => void>
  enqueue: (spec: EnqueueSpec) => Promise<string>
  cancel: (id: string) => Promise<void>
  pause: (id: string) => Promise<void>
  resume: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  clearDone: () => Promise<void>

  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
}

function indexJobs(list: DownloadJob[]): Record<string, DownloadJob> {
  const out: Record<string, DownloadJob> = {}
  for (const j of list) out[j.id] = j
  return out
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  jobs: {},
  drawerOpen: false,
  inited: false,

  init: async () => {
    if (get().inited) return () => {}
    set({ inited: true })
    const initial = await window.electron.downloads.list()
    set({ jobs: indexJobs(initial) })

    const offList = window.electron.downloads.onList(jobs => {
      set({ jobs: indexJobs(jobs) })
    })

    const offProgress = window.electron.downloads.onProgress(evt => {
      set(state => {
        const job = state.jobs[evt.id]
        if (!job) return state
        return {
          jobs: {
            ...state.jobs,
            [evt.id]: { ...job, bytesDone: evt.bytesDone, bytesTotal: evt.bytesTotal, state: evt.state }
          }
        }
      })
    })

    const offState = window.electron.downloads.onState(evt => {
      set(state => {
        const job = state.jobs[evt.id]
        if (!job) return state
        return {
          jobs: {
            ...state.jobs,
            [evt.id]: {
              ...job,
              state: evt.state,
              errorMessage: evt.errorMessage ?? job.errorMessage,
              attempts: evt.attempts ?? job.attempts
            }
          }
        }
      })
    })

    const offDone = window.electron.downloads.onDone(() => {
      // List event will follow with full state — nothing special to do here.
    })

    return () => {
      offList()
      offProgress()
      offState()
      offDone()
    }
  },

  enqueue: (spec) => window.electron.downloads.enqueue(spec),
  cancel: (id) => window.electron.downloads.cancel(id),
  pause: (id) => window.electron.downloads.pause(id),
  resume: (id) => window.electron.downloads.resume(id),
  remove: (id) => window.electron.downloads.remove(id),
  clearDone: () => window.electron.downloads.clearDone(),

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set(s => ({ drawerOpen: !s.drawerOpen }))
}))

// ─── Selectors ──────────────────────────────────────────────────────

export function selectJobs(state: DownloadsState): DownloadJob[] {
  return Object.values(state.jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function selectActiveCount(state: DownloadsState): number {
  return Object.values(state.jobs).filter(
    j => j.state === 'queued' || j.state === 'downloading' || j.state === 'verifying' || j.state === 'extracting' || j.state === 'paused'
  ).length
}

export function selectFailedCount(state: DownloadsState): number {
  return Object.values(state.jobs).filter(j => j.state === 'failed').length
}
