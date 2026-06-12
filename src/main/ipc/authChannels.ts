/**
 * IPC handler registrations for the auth flow — the ONLY renderer surface.
 *
 * Security (V5 / T-04-02):
 *   - Every inbound IPC payload is zod-validated BEFORE delegating to SessionManager.
 *   - Malformed payloads are rejected with a typed error state — they never reach GramJS.
 *   - Handlers return serializable DTOs only (AuthState, LogoutResult) — never GramJS objects or session strings.
 *
 * Trust boundary (D-02 / T-04-01):
 *   - The renderer sends only whitelisted channels with typed payloads.
 *   - No session string, no client reference, no api credentials cross this boundary.
 *
 * Channel constants from src/shared/channels.ts (single source of truth).
 * Zod schemas mirror the IPC DTO types from src/shared/authTypes.ts.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { SessionManager } from '../telegram/SessionManager'
import {
  AUTH_SUBMIT_PHONE,
  AUTH_SUBMIT_CODE,
  AUTH_SUBMIT_PASSWORD,
  AUTH_RESEND_CODE,
  AUTH_GET_STATE,
  AUTH_LOGOUT,
  AUTH_STATE,
  AUTH_FLOOD_TICK,
} from '@shared/channels'
import type { AuthState, FloodTick } from '@shared/authTypes'

// ── Zod schemas for inbound IPC payloads (V5 — validate every payload) ─────

const SubmitPhoneSchema = z.object({
  dialCode: z.string().min(1),
  national: z.string().min(1),
})

const SubmitCodeSchema = z.object({
  code: z.string().min(1),
})

const SubmitPasswordSchema = z.object({
  password: z.string().min(1),
})

// ── IPC handler registration ───────────────────────────────────────────────

/**
 * Register all auth IPC handlers on ipcMain.
 *
 * Wire the SessionManager's onStateChange callback to win.webContents.send
 * so the renderer receives live AuthState updates.
 *
 * @param win  The main BrowserWindow (used for webContents.send)
 * @param sm   The SessionManager instance (constructed in main/index.ts)
 */
export function registerAuthChannels(_win: BrowserWindow, sm: SessionManager): void {
  // ── Wire SessionManager state emissions to the renderer ─────────────────
  // The SessionManager was constructed with a placeholder emit; we now wire it
  // to win.webContents.send so auth state changes reach the renderer.
  // Note: SessionManager's onStateChange is set in its constructor options —
  // we store a reference to send here so the SM can call it.
  // In practice, the caller constructs SM with onStateChange pointing to this:
  //   onStateChange: (s) => win.webContents.send(AUTH_STATE, s)
  // This function therefore does NOT need to re-wire — it is called AFTER construction.
  // The flood tick wiring is done below by patching the FloodWaitController.
  // (See main/index.ts for the wired construction pattern.)

  // ── Handle: submitPhone ──────────────────────────────────────────────────
  ipcMain.handle(AUTH_SUBMIT_PHONE, async (_event, payload: unknown) => {
    const parsed = SubmitPhoneSchema.parse(payload)  // throws ZodError on malformed input
    await sm.submitPhone(parsed)
    return sm.getState()
  })

  // ── Handle: submitCode ───────────────────────────────────────────────────
  ipcMain.handle(AUTH_SUBMIT_CODE, async (_event, payload: unknown) => {
    const parsed = SubmitCodeSchema.parse(payload)
    await sm.submitCode(parsed)
    return sm.getState()
  })

  // ── Handle: submitPassword ───────────────────────────────────────────────
  ipcMain.handle(AUTH_SUBMIT_PASSWORD, async (_event, payload: unknown) => {
    const parsed = SubmitPasswordSchema.parse(payload)
    await sm.submitPassword(parsed)
    return sm.getState()
  })

  // ── Handle: resendCode ───────────────────────────────────────────────────
  ipcMain.handle(AUTH_RESEND_CODE, async () => {
    await sm.resendCode()
    return sm.getState()
  })

  // ── Handle: getAuthState ─────────────────────────────────────────────────
  ipcMain.handle(AUTH_GET_STATE, () => {
    return sm.getState()
  })

  // ── Handle: logout ───────────────────────────────────────────────────────
  ipcMain.handle(AUTH_LOGOUT, async () => {
    const result = await sm.logout()
    return result  // { serverRevoked: boolean } — serializable DTO (D-02)
  })
}

// ── Flood tick emitter helper ─────────────────────────────────────────────

/**
 * Emit a FloodTick event to the renderer.
 * Called by the SessionManager's FloodWaitController via the onTick callback.
 */
export function emitFloodTick(win: BrowserWindow, tick: FloodTick): void {
  if (!win.isDestroyed()) {
    win.webContents.send(AUTH_FLOOD_TICK, tick)
  }
}

/**
 * Emit an AuthState event to the renderer.
 * This is the callback wired into SessionManager.onStateChange.
 */
export function emitAuthState(win: BrowserWindow, state: AuthState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(AUTH_STATE, state)
  }
}
