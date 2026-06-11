/**
 * IPC handler registrations for target resolution — the ONLY renderer surface for target ops.
 *
 * Security (V5):
 *   - Every inbound IPC payload is zod-validated BEFORE delegating to TargetResolver.
 *   - Malformed payloads throw ZodError and NEVER reach resolver.resolve().
 *   - Handlers return serializable DTOs only (TargetState) — never GramJS objects or accessHash.
 *
 * Trust boundary (T-03-06):
 *   - The renderer sends only whitelisted TARGET_* channels with typed payloads.
 *   - No accessHash, no client reference, no GramJS object crosses this boundary.
 *   - ResolvedTargetDTO has no accessHash field by construction (T-03-01).
 *
 * Channel constants from src/shared/channels.ts (single source of truth).
 * Zod schema mirrors the IPC DTO from src/shared/targetTypes.ts.
 *
 * Modeled exactly on src/main/ipc/authChannels.ts.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { TargetResolver } from '../telegram/TargetResolver'
import {
  TARGET_RESOLVE,
  TARGET_CONFIRM,
  TARGET_RESET,
  TARGET_GET_STATE,
  TARGET_STATE,
} from '@shared/channels'
import type { TargetState } from '@shared/targetTypes'

// ── Zod schema for inbound IPC payloads (V5 — validate every payload) ────────
// WR-04: bounded — Telegram usernames max out at 32 chars and E.164 phones at
// 15 digits; 64 comfortably covers `https://t.me/` + username/phone forms.
// An unbounded string from a compromised renderer would otherwise flow into a
// governed ResolveUsername/ResolvePhone call on the wire. `.trim()` also
// rejects whitespace-only payloads (IN-03) before they waste an API call.

const ResolveTargetSchema = z.object({
  input: z.string().trim().min(1).max(64),
})

// ── IPC handler registration ───────────────────────────────────────────────────

/**
 * Register all target IPC handlers on ipcMain.
 *
 * Handlers:
 *   TARGET_RESOLVE   — validates payload (Zod), calls resolver.resolve(), returns new state
 *   TARGET_CONFIRM   — calls resolver.confirm(), returns new state
 *   TARGET_RESET     — calls scanner.abortScan() then resolver.reset(), returns new state
 *   TARGET_GET_STATE — returns current state
 *
 * State push (target:state) is wired in main/index.ts via the TargetResolver onStateChange
 * callback → emitTargetState(). Handlers do NOT push state themselves.
 *
 * @param win       The main BrowserWindow (used for webContents.send via emitTargetState)
 * @param resolver  The TargetResolver instance (constructed in main/index.ts)
 * @param scanner   Structural type — only abortScan() is needed; avoids importing
 *                  MembershipScanner and creating a circular dependency (CR-01-MAIN).
 */
export function registerTargetChannels(
  win: BrowserWindow,
  resolver: TargetResolver,
  scanner: { abortScan(): void }
): void {
  // Suppress unused warning — win is used indirectly by push helpers wired in main/index.ts
  void win

  // ── Handle: target:resolve ───────────────────────────────────────────────
  ipcMain.handle(TARGET_RESOLVE, async (_event, payload: unknown) => {
    const parsed = ResolveTargetSchema.parse(payload) // throws ZodError on malformed input
    await resolver.resolve(parsed.input)
    return resolver.getState()
  })

  // ── Handle: target:confirm ───────────────────────────────────────────────
  ipcMain.handle(TARGET_CONFIRM, () => {
    resolver.confirm()
    return resolver.getState()
  })

  // ── Handle: target:reset ─────────────────────────────────────────────────
  // CR-01-MAIN: abortScan() must fire before resolver.reset() so that scan
  // state transitions to 'idle'. The GroupsPane auto-start effect watches for
  // scan.step === 'idle'; without this, a completed scan would never reset and
  // confirming a new target would not re-trigger the scan.
  ipcMain.handle(TARGET_RESET, () => {
    scanner.abortScan()
    resolver.reset()
    return resolver.getState()
  })

  // ── Handle: target:getState ──────────────────────────────────────────────
  ipcMain.handle(TARGET_GET_STATE, () => {
    return resolver.getState()
  })
}

// ── State push helper ─────────────────────────────────────────────────────────

/**
 * Emit a TargetState event to the renderer.
 * Called by the TargetResolver's onStateChange callback (wired in main/index.ts).
 * Identical pattern to emitAuthState in authChannels.ts.
 */
export function emitTargetState(win: BrowserWindow, state: TargetState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(TARGET_STATE, state)
  }
}
