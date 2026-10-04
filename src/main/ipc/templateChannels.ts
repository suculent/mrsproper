/**
 * DM template preference store and renderer (D-15, ADD-16 main half).
 *
 * TEMPLATE_GET / TEMPLATE_SET IPC handlers persist a single user-edited DM template
 * across app launches via electron-store, mirroring severityChannels.ts's ESM-safe
 * lazy singleton exactly. renderTemplate() is a pure, two-replace function — no
 * templating library — substituting the single-brace {name}/{links} placeholders
 * without colliding with i18next's {{ }} double-brace interpolation syntax.
 *
 * AddExecutor never imports this module directly: main/index.ts wires a
 * DmTextProvider closure (vars) => renderTemplate(currentTemplateForLanguage(), vars)
 * so the executor stays decoupled from electron-store (Plan 14-11).
 *
 * ESM/CJS compatibility: electron-store 11.x ships as ESM-only, so it cannot be
 * require()'d. We use a dynamic await import() wrapped in a lazy factory (getStore)
 * to safely load it at runtime after the Electron app is ready.
 *
 * Security:
 *   - T-14-07: TEMPLATE_SET payload validated with TemplateSetSchema before
 *     store.set() — z.string().min(1).max(4000) rejects empty/oversized strings,
 *     mirroring T-06-02-01's SeveritySchema precedent.
 *   - T-14-08: renderTemplate() only ever substitutes the admin-chosen template
 *     text and server-issued invite links/target name — no untrusted third-party
 *     content is interpolated, and no auth gate is required for the preference
 *     itself (non-secret, non-destructive).
 *
 * Modeled on src/main/ipc/severityChannels.ts.
 */

import { ipcMain } from 'electron'
import { z } from 'zod'
import { TEMPLATE_GET, TEMPLATE_SET } from '@shared/channels'
import { DM_TEMPLATE_MAX_LENGTH } from '@shared/dmTemplate'

// ── Pure render function + defaults (D-15) ──────────────────────────────────
// Relocated to src/shared/dmTemplate.ts (Plan 15-01) so the renderer's Add review
// screen DM preview (Plan 15-10) can import the exact same byte-identical rendering
// logic (D-13). Re-exported here so every existing import of these three symbols
// (main/index.ts, templateChannels.test.ts) keeps working with zero call-site changes.

export { renderTemplate, DEFAULT_TEMPLATE_EN, DEFAULT_TEMPLATE_CS } from '@shared/dmTemplate'

// ── Zod schema for inbound TEMPLATE_SET payload ─────────────────────────────
// T-14-07: length-bounded 1-DM_TEMPLATE_MAX_LENGTH chars — any value outside that
// range throws ZodError before the store is touched. The bound itself lives in
// src/shared/dmTemplate.ts (single source of truth, T-15-04) so it cannot drift
// apart from the renderer's validateDmTemplate.

const TemplateSetSchema = z.object({ template: z.string().min(1).max(DM_TEMPLATE_MAX_LENGTH) })

// ── ESM-safe lazy store factory ──────────────────────────────────────────────
// electron-store 11.x is ESM-only; dynamic import is the only valid load path.
// Singleton pattern: the store is created once and reused for all subsequent calls.
// No default template: TEMPLATE_GET returns null on first launch so the caller
// falls back to DEFAULT_TEMPLATE_EN/DEFAULT_TEMPLATE_CS for the current app language.

type TemplateStore = import('electron-store').default<{ template: string | null }>
let _store: TemplateStore | null = null

async function getStore(): Promise<TemplateStore> {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store<{ template: string | null }>({ defaults: { template: null } })
  }
  return _store
}

// ── Synchronous template cache (Plan 14-11) ─────────────────────────────────
// DmTextProvider (src/shared/addTypes.ts) is a SYNCHRONOUS function, but electron-store
// access is async — AddExecutor cannot await a store read at DM-send time. preloadTemplateCache()
// is called once at app startup (main/index.ts, before any AddExecutor.execute() can run) to
// warm this cache; getCachedTemplate() then gives the DmTextProvider closure a synchronous read.

let _cachedTemplate: string | null = null

/** Warm the synchronous template cache from the persisted store. Call once at app startup. */
export async function preloadTemplateCache(): Promise<void> {
  const store = await getStore()
  _cachedTemplate = store.get('template', null)
}

/** Synchronous read of the warmed template cache — null when none is persisted. */
export function getCachedTemplate(): string | null {
  return _cachedTemplate
}

// ── IPC handler registration ─────────────────────────────────────────────────

/**
 * Register TEMPLATE_GET and TEMPLATE_SET IPC handlers on ipcMain.
 *
 * Handlers (invoke — request/response):
 *   TEMPLATE_GET — returns the persisted template, or null on first launch so
 *                  the caller falls back to the built-in default for the
 *                  current app language.
 *   TEMPLATE_SET — Zod-validates the payload (1-4000 chars), writes the value
 *                  to the store, and returns the now-current template.
 *
 * No 'win' parameter: these are pure request/response channels.
 * No auth gate: the template preference itself is non-secret (T-14-07/T-14-08).
 */
export function registerTemplateChannels(): void {
  // ── Handle: template:get ──────────────────────────────────────────────
  ipcMain.handle(TEMPLATE_GET, async () => {
    const store = await getStore()
    return store.get('template', null)
  })

  // ── Handle: template:set ──────────────────────────────────────────────
  // T-14-07: TemplateSetSchema.parse() throws ZodError for any string outside
  // 1-4000 chars, preventing empty or oversized writes to electron-store.
  ipcMain.handle(TEMPLATE_SET, async (_event, payload: unknown) => {
    const { template } = TemplateSetSchema.parse(payload)
    const store = await getStore()
    store.set('template', template)
    // Keep the synchronous cache in sync so a template edited mid-session is reflected
    // in the next DM render without requiring an app restart.
    _cachedTemplate = template
    return template
  })
}
