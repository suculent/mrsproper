/**
 * IPC handlers for severity preference (kick vs ban).
 * Persists the user's choice across app launches via electron-store in the main process.
 * Severity is a non-secret preference — stored as plain JSON in userData (not safeStorage).
 * safeStorage is reserved for the session credential only (CLAUDE.md).
 *
 * ESM/CJS compatibility: electron-store 11.x ships as ESM-only, so it cannot be
 * require()'d. We use a dynamic await import() wrapped in a lazy factory (getStore)
 * to safely load it at runtime after the Electron app is ready.
 *
 * Security:
 *   - T-06-02-01: SEVERITY_SET payload validated with SeveritySchema before store.set().
 *     z.enum(['kick','ban']) rejects any value not in the enum — renderer cannot inject
 *     arbitrary strings into electron-store.
 *   - T-06-02-02: No auth gate required — severity is a non-secret, non-destructive
 *     preference toggle. The actual removal is gated by the existing REMOVAL_START auth guards.
 *
 * Modeled on src/main/ipc/searchChannels.ts.
 */

import { ipcMain } from 'electron'
import { z } from 'zod'
import { SEVERITY_GET, SEVERITY_SET } from '@shared/channels'

// ── Zod schema for inbound SEVERITY_SET payload ────────────────────────────
// T-06-02-01: strict enum — any non-'kick'/'ban' value throws ZodError before
// the store is touched. Protects against a compromised renderer injecting
// arbitrary preference strings.

const SeveritySchema = z.object({ severity: z.enum(['kick', 'ban']) })

// ── ESM-safe lazy store factory ────────────────────────────────────────────
// electron-store 11.x is ESM-only; dynamic import is the only valid load path.
// Singleton pattern: the store is created once and reused for all subsequent calls.

type SeverityStore = import('electron-store').default<{ severity: 'kick' | 'ban' }>
let _store: SeverityStore | null = null

async function getStore(): Promise<SeverityStore> {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store<{ severity: 'kick' | 'ban' }>({ defaults: { severity: 'ban' } })
  }
  return _store
}

// ── IPC handler registration ───────────────────────────────────────────────

/**
 * Register SEVERITY_GET and SEVERITY_SET IPC handlers on ipcMain.
 *
 * Handlers (invoke — request/response):
 *   SEVERITY_GET — returns the persisted severity value ('kick' | 'ban');
 *                  defaults to 'ban' on first launch (electron-store default).
 *   SEVERITY_SET — Zod-validates the payload, writes the value to the store,
 *                  and returns the now-current severity value.
 *
 * No 'win' parameter: these are pure request/response channels.
 * No auth gate: severity is a non-secret preference (T-06-02-02).
 */
export function registerSeverityChannels(): void {
  // ── Handle: severity:get ───────────────────────────────────────────────
  ipcMain.handle(SEVERITY_GET, async () => {
    const store = await getStore()
    return store.get('severity', 'ban')
  })

  // ── Handle: severity:set ───────────────────────────────────────────────
  // T-06-02-01: SeveritySchema.parse() throws ZodError for any value not in
  // the ['kick','ban'] enum, preventing arbitrary writes to electron-store.
  ipcMain.handle(SEVERITY_SET, async (_event, payload: unknown) => {
    const { severity } = SeveritySchema.parse(payload)
    const store = await getStore()
    store.set('severity', severity)
    return severity
  })
}
