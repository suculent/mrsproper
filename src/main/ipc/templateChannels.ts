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

// ── Pure render function (D-15) ────────────────────────────────────────────
// Single-brace regex only: {{ }} i18next double-brace syntax is left untouched
// because each pattern requires exactly one literal '{' and one literal '}'
// around the placeholder name — there is no greedy cross-matching into/out of
// a doubled brace pair.

export function renderTemplate(template: string, vars: { name: string; links: string }): string {
  return template.replace(/\{name\}/g, vars.name).replace(/\{links\}/g, vars.links)
}

// ── Built-in defaults (used when no template is yet persisted) ─────────────

export const DEFAULT_TEMPLATE_EN =
  "Hi {name}! I'd like to add you to a few groups, but your privacy settings are blocking a direct invite. Here are single-use invite links instead (each one expires in 5 days):\n\n{links}"

export const DEFAULT_TEMPLATE_CS =
  'Dobrý den, {name}, rádi bychom Vás přidali do několika skupin, ale Vaše nastavení soukromí brání přímému pozvání. Zde jsou jednorázové pozvánkové odkazy (každý platí 5 dní):\n\n{links}'

// ── Zod schema for inbound TEMPLATE_SET payload ─────────────────────────────
// T-14-07: length-bounded 1-4000 chars — any value outside that range throws
// ZodError before the store is touched.

const TemplateSetSchema = z.object({ template: z.string().min(1).max(4000) })

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
    return template
  })
}
