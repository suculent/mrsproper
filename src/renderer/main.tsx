import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import './styles/globals.css'
import App from './App'
import { initI18n } from './i18n'

async function main(): Promise<void> {
  // Fetch persisted prefs BEFORE React mounts — eliminates flash of wrong language/theme.
  // Both calls return null on first launch (no stored pref yet).
  const [storedLang, storedTheme] = await Promise.all([
    window.mrsproper.getLanguage().catch(() => null),
    window.mrsproper.getTheme().catch(() => null),
  ])

  // Resolve language: stored pref → OS locale detection → 'en' fallback
  const lng = storedLang ?? (navigator.language.startsWith('cs') ? 'cs' : 'en')
  await initI18n(lng as 'en' | 'cs')

  // Apply theme before first paint — main process syncRendererTheme fires on did-finish-load,
  // which is after paint. Direct classList toggle here is the only way to avoid flash.
  const theme = storedTheme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.classList.toggle('dark', theme === 'dark')

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void main()
