/**
 * IPC handlers for language preference (en | cs).
 * Persists the user's choice across app launches via electron-store in the main process.
 * Language is a non-secret preference — stored as plain JSON in userData (not safeStorage).
 * safeStorage is reserved for the session credential only (CLAUDE.md).
 *
 * ESM/CJS compatibility: electron-store 11.x ships as ESM-only, so it cannot be
 * require()'d. We use a dynamic await import() wrapped in a lazy factory (getStore)
 * to safely load it at runtime after the Electron app is ready.
 *
 * Security:
 *   - T-08-01: LANGUAGE_SET payload validated with LanguageSchema before store.set().
 *     z.enum(['en','cs']) rejects any value not in the enum — renderer cannot inject
 *     arbitrary strings into electron-store.
 *   - No auth gate required — language is a non-secret, non-destructive preference.
 *
 * Modeled on src/main/ipc/severityChannels.ts.
 */

import { ipcMain } from 'electron'
import { z } from 'zod'
import { LANGUAGE_GET, LANGUAGE_SET } from '@shared/channels'

// ── Zod schema for inbound LANGUAGE_SET payload ────────────────────────────
// T-08-01: strict enum — any non-'en'/'cs' value throws ZodError before
// the store is touched. Protects against a compromised renderer injecting
// arbitrary locale strings into electron-store.

const LanguageSchema = z.object({ language: z.enum(['en', 'cs']) })

// ── ESM-safe lazy store factory ────────────────────────────────────────────
// electron-store 11.x is ESM-only; dynamic import is the only valid load path.
// Singleton pattern: the store is created once and reused for all subsequent calls.
// No defaults: LANGUAGE_GET returns null on first launch so the renderer can
// detect the unset state and apply OS locale detection (LOC-01).

type LanguageStore = import('electron-store').default<{ language: 'en' | 'cs' }>
let _store: LanguageStore | null = null

async function getStore(): Promise<LanguageStore> {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store<{ language: 'en' | 'cs' }>()
  }
  return _store
}

// ── IPC handler registration ───────────────────────────────────────────────

/**
 * Register LANGUAGE_GET and LANGUAGE_SET IPC handlers on ipcMain.
 *
 * Handlers (invoke — request/response):
 *   LANGUAGE_GET — returns the persisted language value ('en' | 'cs') or null
 *                  on first launch (no default — caller applies OS locale detection).
 *   LANGUAGE_SET — Zod-validates the payload, writes the value to the store,
 *                  and returns the now-current language value.
 *
 * No 'win' parameter: these are pure request/response channels.
 * No auth gate: language is a non-secret preference (T-08-01).
 */
export function registerLanguageChannels(): void {
  // ── Handle: language:get ───────────────────────────────────────────────
  ipcMain.handle(LANGUAGE_GET, async () => {
    const store = await getStore()
    return store.get('language') ?? null
  })

  // ── Handle: language:set ───────────────────────────────────────────────
  // T-08-01: LanguageSchema.parse() throws ZodError for any value not in
  // the ['en','cs'] enum, preventing arbitrary writes to electron-store.
  ipcMain.handle(LANGUAGE_SET, async (_event, payload: unknown) => {
    const { language } = LanguageSchema.parse(payload)
    const store = await getStore()
    store.set('language', language)
    return language
  })
}
