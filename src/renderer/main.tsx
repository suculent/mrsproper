import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import './styles/globals.css'
import App from './App'
import { initI18n } from './i18n'
import { languageClient } from './ipc/languageClient'

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
  // D-13: tell main which language the renderer chose (not persisted) so the default DM matches the preview.
  await languageClient.setDetectedLanguage(lng as 'en' | 'cs').catch(() => undefined)

  // Apply theme before first paint — main process syncRendererTheme fires on did-finish-load,
  // which is after paint. Direct classList toggle here is the only way to avoid flash.
  const theme = storedTheme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.classList.toggle('dark', theme === 'dark')

  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('Root element #root not found')
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

// WR-03: failure containment — any pre-mount rejection (initI18n, missing #root)
// must not leave a permanently blank window for a non-technical user.
main().catch((err) => {
  console.error('Renderer bootstrap failed', err)
  try {
    // Last-resort mount with defaults (English / OS theme) so the app is usable.
    const rootEl = document.getElementById('root')
    if (!rootEl) throw new Error('Root element #root not found')
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  } catch (fallbackErr) {
    console.error('Fallback mount failed', fallbackErr)
    // Absolute last resort: plain-text message instead of a blank window.
    document.body.textContent =
      'Mrs. Proper failed to start. Please restart the application. / Aplikaci Mrs. Proper se nepodařilo spustit. Restartujte ji prosím.'
  }
})
