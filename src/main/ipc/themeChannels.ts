/**
 * IPC handlers for theme preference (light | dark).
 * Persists the user's choice across app launches via electron-store in the main process.
 * Theme is a non-secret preference — stored as plain JSON in userData (not safeStorage).
 * safeStorage is reserved for the session credential only (CLAUDE.md).
 *
 * ESM/CJS compatibility: electron-store 11.x ships as ESM-only, so it cannot be
 * require()'d. We use a dynamic await import() wrapped in a lazy factory (getStore)
 * to safely load it at runtime after the Electron app is ready.
 *
 * Security:
 *   - T-08-02: THEME_SET payload validated with ThemeSchema before store.set().
 *     z.enum(['light','dark']) rejects any value not in the enum — renderer cannot
 *     inject arbitrary strings into electron-store or nativeTheme.themeSource.
 *   - No auth gate required — theme is a non-secret, non-destructive preference.
 *
 * nativeTheme integration:
 *   THEME_SET sets nativeTheme.themeSource after store.set(). This overrides the
 *   OS appearance immediately. The existing syncRendererTheme listener (main/index.ts)
 *   fires via the nativeTheme 'updated' event, propagating the change to the renderer
 *   without additional coordination. See PATTERNS.md for the full theme flow.
 *
 * Modeled on src/main/ipc/severityChannels.ts.
 */

import { ipcMain, nativeTheme } from 'electron'
import { z } from 'zod'
import { THEME_GET, THEME_SET } from '@shared/channels'

// ── Zod schema for inbound THEME_SET payload ───────────────────────────────
// T-08-02: strict enum — any non-'light'/'dark' value throws ZodError before
// the store is touched. Protects against a compromised renderer injecting
// arbitrary values into nativeTheme.themeSource or electron-store.

const ThemeSchema = z.object({ theme: z.enum(['light', 'dark']) })

// ── ESM-safe lazy store factory ────────────────────────────────────────────
// electron-store 11.x is ESM-only; dynamic import is the only valid load path.
// Singleton pattern: the store is created once and reused for all subsequent calls.
// No defaults: THEME_GET returns null on first launch so the renderer can
// detect the unset state and fall through to OS nativeTheme (LOC-01).

type ThemeStore = import('electron-store').default<{ theme: 'light' | 'dark' }>
let _store: ThemeStore | null = null

async function getStore(): Promise<ThemeStore> {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store<{ theme: 'light' | 'dark' }>()
  }
  return _store
}

// ── Launch-time theme read (CR-02) ─────────────────────────────────────────

/**
 * Read the persisted theme preference for launch-time seeding of
 * nativeTheme.themeSource (main/index.ts, before createWindow()).
 * Returns null when no preference is stored (first launch) — caller leaves
 * themeSource at 'system' so the OS appearance applies.
 * Reuses the same lazy store singleton as the IPC handlers below.
 */
export async function getStoredTheme(): Promise<'light' | 'dark' | null> {
  const store = await getStore()
  return store.get('theme') ?? null
}

// ── IPC handler registration ───────────────────────────────────────────────

/**
 * Register THEME_GET and THEME_SET IPC handlers on ipcMain.
 *
 * Handlers (invoke — request/response):
 *   THEME_GET — returns the persisted theme value ('light' | 'dark') or null
 *               on first launch (no default — caller uses OS nativeTheme).
 *   THEME_SET — Zod-validates the payload, writes the value to the store,
 *               sets nativeTheme.themeSource to override the OS appearance,
 *               and returns the now-current theme value.
 *
 * No 'win' parameter: these are pure request/response channels.
 * No auth gate: theme is a non-secret preference (T-08-02).
 */
export function registerThemeChannels(): void {
  // ── Handle: theme:get ──────────────────────────────────────────────────
  ipcMain.handle(THEME_GET, async () => {
    const store = await getStore()
    return store.get('theme') ?? null
  })

  // ── Handle: theme:set ──────────────────────────────────────────────────
  // T-08-02: ThemeSchema.parse() throws ZodError for any value not in
  // the ['light','dark'] enum, preventing arbitrary writes to electron-store
  // or nativeTheme.themeSource.
  ipcMain.handle(THEME_SET, async (_event, payload: unknown) => {
    const { theme } = ThemeSchema.parse(payload)
    const store = await getStore()
    store.set('theme', theme)
    // Override OS appearance — the existing syncRendererTheme listener fires
    // via the nativeTheme 'updated' event, propagating the change to the renderer.
    nativeTheme.themeSource = theme
    return theme
  })
}
