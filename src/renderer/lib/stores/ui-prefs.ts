import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DensityMode = 'comfortable' | 'compact'
export type ThemeMode = 'system' | 'light' | 'dark'

interface UiPrefsState {
  density: DensityMode
  theme: ThemeMode
  lastProfileId: string | null

  setDensity: (d: DensityMode) => void
  setTheme: (t: ThemeMode) => void
  setLastProfileId: (id: string | null) => void
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

      setDensity: (density) => {
        applyDensity(density)
        set({ density })
      },

      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },

      setLastProfileId: (id) => set({ lastProfileId: id }),
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
