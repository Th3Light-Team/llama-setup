import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INITIAL_TOUR_STATE, markPartDone, resetTourState } from '../tour/state'

export type DensityMode = 'comfortable' | 'compact'
export type ThemeMode = 'system' | 'light' | 'dark'

interface UiPrefsState {
  density: DensityMode
  theme: ThemeMode
  lastProfileId: string | null
  /** Product tour: part ids already finished or closed (never auto-start again). */
  tourCompleted: string[]
  /** Product tour: when true no tour starts automatically. */
  toursDisabled: boolean

  setDensity: (d: DensityMode) => void
  setTheme: (t: ThemeMode) => void
  setLastProfileId: (id: string | null) => void
  completeTourPart: (id: string) => void
  setToursDisabled: (disabled: boolean) => void
  /** Forget all progress and re-enable automatic tours. */
  resetTours: () => void
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

function applyDensity(density: DensityMode) {
  document.documentElement.setAttribute('data-density', density)
}

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      density: 'comfortable',
      theme: 'system',
      lastProfileId: null,
      ...INITIAL_TOUR_STATE,

      setDensity: (density) => {
        applyDensity(density)
        set({ density })
      },

      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },

      setLastProfileId: (id) => set({ lastProfileId: id }),

      completeTourPart: (id) => set((s) => ({ tourCompleted: markPartDone(s.tourCompleted, id) })),
      setToursDisabled: (toursDisabled) => set({ toursDisabled }),
      resetTours: () => set(resetTourState()),
    }),
    { name: 'llama-studio-ui-prefs' }
  )
)

export function initUiPrefs() {
  const { density, theme } = useUiPrefsStore.getState()
  applyDensity(density)
  applyTheme(theme)

  if (theme === 'system') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const { theme: current } = useUiPrefsStore.getState()
      if (current === 'system') {
        document.documentElement.classList.toggle('dark', e.matches)
      }
    })
  }
}
