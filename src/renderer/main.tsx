import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initUiPrefs } from './lib/stores/ui-prefs'

initUiPrefs()

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
