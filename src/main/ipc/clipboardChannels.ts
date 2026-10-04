/**
 * IPC handler for generic clipboard writes (Phase 15, D-18).
 *
 * First use is the Add-mode Copy-link button on a privacy-blocked row: the renderer's
 * `navigator.clipboard.writeText()` is gated by Chromium's permission-request handler, which
 * this app does not register — the call silently fails. Electron's synchronous `clipboard`
 * module has no permission layer, so this handler wraps it instead.
 *
 * Security:
 *   - T-15-01: payload bounded via `z.object({ text: z.string().max(2000) })` — generous for
 *     a Telegram invite link, prevents a compromised renderer using this as a clipboard-stuffing
 *     vector.
 *   - T-15-03: gated on `getAuthState().step === 'authorized'`, consistent with every other
 *     handler in addChannels.ts.
 *
 * Modeled on src/main/ipc/severityChannels.ts's one-handler-per-file, no-win-param shape.
 */

import { ipcMain, clipboard } from 'electron'
import { z } from 'zod'
import { CLIPBOARD_WRITE_TEXT } from '@shared/channels'

// ── Zod schema for inbound CLIPBOARD_WRITE_TEXT payload ────────────────────
// T-15-01: max(2000) bounds payload size — generous for an invite link, rejects abuse.

const ClipboardWriteSchema = z.object({ text: z.string().max(2000) })

// ── IPC handler registration ───────────────────────────────────────────────

/**
 * Register the CLIPBOARD_WRITE_TEXT IPC handler on ipcMain.
 *
 * Handler (invoke — request/response):
 *   CLIPBOARD_WRITE_TEXT — Zod-validates the payload, auth gate, then writes to the OS
 *                           clipboard via Electron's synchronous clipboard module.
 *
 * @param getAuthState Function returning the current AuthState (allows testing without SessionManager)
 */
export function registerClipboardChannels(getAuthState: () => { step: string }): void {
  ipcMain.handle(CLIPBOARD_WRITE_TEXT, async (_event, payload: unknown) => {
    const { text } = ClipboardWriteSchema.parse(payload)

    if (getAuthState().step !== 'authorized') {
      return { ok: false as const }
    }

    clipboard.writeText(text)
    return { ok: true as const }
  })
}
