import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import './styles/globals.css'
import App from './App'

// Follow the OS appearance (UI-SPEC: default to system theme). The main process
// only toggled `.dark` on nativeTheme *changes*, never on first paint, leaving the
// initial render in light-mode tokens (dark text) over the dark window. Set it here
// on load and keep it synced with the system preference.
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = (isDark: boolean): void => {
  document.documentElement.classList.toggle('dark', isDark)
}
applyTheme(prefersDark.matches)
prefersDark.addEventListener('change', (e) => applyTheme(e.matches))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
