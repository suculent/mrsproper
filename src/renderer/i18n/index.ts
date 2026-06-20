// i18n instance — offline, bundled statically via Vite (no HTTP backend, CSP connect-src: none).
// All 12 JSON files are statically imported so Vite bundles them at build time.
// initI18n(lng) must be awaited before ReactDOM.createRoot to prevent FOUI.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Static imports — bundled by Vite, no fetch() at runtime (offline + CSP constraint)
import enAuth from './locales/en/auth.json'
import enTarget from './locales/en/target.json'
import enGroups from './locales/en/groups.json'
import enWizard from './locales/en/wizard.json'
import enRemoval from './locales/en/removal.json'
import enShell from './locales/en/shell.json'
import csAuth from './locales/cs/auth.json'
import csTarget from './locales/cs/target.json'
import csGroups from './locales/cs/groups.json'
import csWizard from './locales/cs/wizard.json'
import csRemoval from './locales/cs/removal.json'
import csShell from './locales/cs/shell.json'
import enTag from './locales/en/tag.json'
import csTag from './locales/cs/tag.json'

export const resources = {
  en: {
    auth: enAuth,
    target: enTarget,
    groups: enGroups,
    wizard: enWizard,
    removal: enRemoval,
    shell: enShell,
    tag: enTag,
  },
  cs: {
    auth: csAuth,
    target: csTarget,
    groups: csGroups,
    wizard: csWizard,
    removal: csRemoval,
    shell: csShell,
    tag: csTag,
  },
} as const

/**
 * Initialize the i18n instance with the given language.
 * Must be awaited before ReactDOM.createRoot to prevent flash of untranslated interface.
 * Safe to call multiple times — returns early if already initialized.
 */
export async function initI18n(lng: 'en' | 'cs'): Promise<void> {
  if (i18n.isInitialized) {
    // Already initialized — just switch language if needed
    if (i18n.language !== lng) {
      await i18n.changeLanguage(lng)
    }
    return
  }
  await i18n
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: 'en',
      resources,
      defaultNS: 'shell',
      interpolation: {
        escapeValue: false, // React already escapes — react-i18next standard setting
      },
      react: {
        useSuspense: false, // Pre-mount await handles loading; no Suspense boundaries needed
      },
    })
}

export default i18n
