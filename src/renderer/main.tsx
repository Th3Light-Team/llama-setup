import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initUiPrefs, useUiPrefsStore } from './lib/stores/ui-prefs'

initUiPrefs()

// In the dev sandbox, automatic tours would cover every page on each launch.
// Manual replays from the ? menu still work.
window.electron?.app.getDevFlags().then(({ sandbox }) => {
  if (sandbox) useUiPrefsStore.getState().setToursDisabled(true)
}).catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (window.electron) {
  window.electron.ping().then((result: string) => {
    console.log('IPC test: ping ->', result)
  })
}
