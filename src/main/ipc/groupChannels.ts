/**
 * IPC handler registrations for group enumeration and membership scan.
 * The ONLY renderer surface for group and scan operations.
 *
 * Security gates:
 *   - T-04-06 (scan:retryGroup): dialogId is validated with Zod (string 1–32 chars)
 *     THEN cross-checked against GroupEnumerator's in-memory dialog list.
 *     Unknown IDs are rejected before any scanner call.
 *   - T-04-01 (no accessHash in DTO): AdminDialogDTO has no accessHash by construction
 *     (TypeScript interface enforces this; main-only _dialogMap holds raw entities).
 *   - T-04-07 (scan:start carries no payload): MembershipScanner reads target from
 *     TargetResolver in the main process — renderer cannot inject a different target.
 *   - T-04-08 (win.isDestroyed guard): all emitGroupsState/emitScanState calls gate
 *     on !win.isDestroyed() before calling win.webContents.send (RESEARCH Pitfall 6).
 *
 * Modeled exactly on src/main/ipc/targetChannels.ts.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { GroupEnumerator } from '../telegram/GroupEnumerator'
import type { MembershipScanner } from '../telegram/MembershipScanner'
import {
  GROUPS_GET_STATE,
  GROUPS_STATE,
  GROUPS_REFRESH,
  SCAN_START,
  SCAN_ABORT,
  SCAN_RETRY_GROUP,
  SCAN_STATE,
  SCAN_GET_STATE,
} from '@shared/channels'
import type { GroupsState, ScanState } from '@shared/groupTypes'

// ── Zod schema for scan:retryGroup payload (T-04-06) ─────────────────────────
// dialogId is a decimal-string Telegram chat ID. Telegram IDs are at most 19
// digits (bigint range), so max(32) comfortably covers any real ID while
// rejecting unbounded inputs from a compromised renderer. min(1) rejects empty.

const RetryGroupSchema = z.object({
  dialogId: z.string().min(1).max(32),
})

// ── IPC handler registration ───────────────────────────────────────────────────

/**
 * Register all group enumeration and membership scan IPC handlers on ipcMain.
 *
 * Handlers (invoke — request/response):
 *   GROUPS_GET_STATE   — returns current GroupsState from enumerator.getState()
 *   GROUPS_REFRESH     — calls enumerator.refresh(), returns new GroupsState
 *   SCAN_START         — calls scanner.scan() (no payload accepted), returns ScanState
 *   SCAN_ABORT         — calls scanner.abortScan(), returns ScanState
 *   SCAN_GET_STATE     — returns current ScanState from scanner.getScanState()
 *   SCAN_RETRY_GROUP   — Zod-validates payload, security-checks dialogId (T-04-06),
 *                        calls scanner.retryGroup(dialogId)
 *
 * State push (groups:state, scan:state) is wired in main/index.ts via the respective
 * onStateChange callbacks → emitGroupsState() / emitScanState(). Handlers do NOT push
 * state themselves.
 *
 * @param win         The main BrowserWindow
 * @param enumerator  The GroupEnumerator instance (constructed in main/index.ts)
 * @param scanner     The MembershipScanner instance (constructed in main/index.ts)
 */
export function registerGroupChannels(
  win: BrowserWindow,
  enumerator: GroupEnumerator,
  scanner: MembershipScanner
): void {
  // Suppress unused warning — win used by emitGroupsState/emitScanState wired in main/index.ts
  void win

  // ── Handle: groups:getState ──────────────────────────────────────────────
  ipcMain.handle(GROUPS_GET_STATE, () => {
    return enumerator.getState()
  })

  // ── Handle: groups:refresh ───────────────────────────────────────────────
  ipcMain.handle(GROUPS_REFRESH, async () => {
    await enumerator.refresh()
    return enumerator.getState()
  })

  // ── Handle: scan:start ───────────────────────────────────────────────────
  // No payload accepted — target comes from TargetResolver in main process (T-04-07)
  ipcMain.handle(SCAN_START, async () => {
    await scanner.scan()
    return scanner.getScanState()
  })

  // ── Handle: scan:abort ───────────────────────────────────────────────────
  ipcMain.handle(SCAN_ABORT, () => {
    scanner.abortScan()
    return scanner.getScanState()
  })

  // ── Handle: scan:getState ────────────────────────────────────────────────
  ipcMain.handle(SCAN_GET_STATE, () => {
    return scanner.getScanState()
  })

  // ── Handle: scan:retryGroup ──────────────────────────────────────────────
  // T-04-06: two-layer validation — Zod schema first, then in-memory dialog list
  ipcMain.handle(SCAN_RETRY_GROUP, async (_event, payload: unknown) => {
    // Layer 1: Zod validation — throws ZodError on malformed input
    const parsed = RetryGroupSchema.parse(payload)

    // Layer 2: Security gate — dialogId must be in the loaded dialog list
    const groupsState = enumerator.getState()
    if (groupsState.step !== 'loaded') {
      throw new Error('Groups not loaded')
    }
    const known = groupsState.dialogs.find((d) => d.id === parsed.dialogId)
    if (!known) {
      throw new Error('Unknown dialogId')
    }

    await scanner.retryGroup(parsed.dialogId)
  })
}

// ── State push helpers ────────────────────────────────────────────────────────

/**
 * Emit a GroupsState event to the renderer.
 * Called by GroupEnumerator's onStateChange callback (wired in main/index.ts).
 * T-04-08: gated on !win.isDestroyed() (RESEARCH Pitfall 6).
 */
export function emitGroupsState(win: BrowserWindow, state: GroupsState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(GROUPS_STATE, state)
  }
}

/**
 * Emit a ScanState event to the renderer.
 * Called by MembershipScanner's onStateChange callback (wired in main/index.ts).
 * T-04-08: gated on !win.isDestroyed() (RESEARCH Pitfall 6).
 */
export function emitScanState(win: BrowserWindow, state: ScanState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(SCAN_STATE, state)
  }
}
