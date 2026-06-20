/**
 * IPC handler registrations for the tag execution engine.
 * The ONLY renderer surface for tag operations.
 *
 * Security gates:
 *   - T-10-06 (tag:start): TagStartSchema admits only { dialogIds, tag } — no identity fields.
 *     Identity (targetId, targetName, targetAccessHash) is read from resolver.getResolvedUser()
 *     inside TagExecutor.execute() in Phase 11. Renderer can never inject target identity (T-05-04-B).
 *   - T-10-07 (tag:start): dialogIds cross-checked against enumerator.getState().dialogs map.
 *     Renderer cannot inject groups not in the current enumeration.
 *   - T-10-08 (tag:start): auth gate — authState.step must be 'authorized'; unauthenticated
 *     calls return executor.getState() without dispatching execute().
 *   - T-10-09 (tag:start): double-start guard — if step is 'running' or 'stopping', return
 *     current state without re-dispatching. Prevents overwriting the active job file on disk.
 *   - T-10-10 (emitTagState): push guard — gated on !win.isDestroyed().
 *
 * Modeled exactly on src/main/ipc/removalChannels.ts.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { GroupEnumerator } from '../telegram/GroupEnumerator'
import {
  TAG_START,
  TAG_ABORT,
  TAG_GET_STATE,
  TAG_STATE,
  TAG_GET_JOB,
  TAG_DISCARD_JOB,
} from '@shared/channels'
import type { TagState, TagJobFile, TagJobFileSafe } from '@shared/tagTypes'
import type { TagAuditStore } from '../storage/tagAuditStore'

// ── TagExecutorLike stub interface ────────────────────────────────────────────
// Phase 11 replaces this with the real TagExecutor class. The stub satisfies
// the tagChannels.ts type contract while keeping Phase 10 independent of Phase 11.
// execute() MUST be included — the TAG_START handler calls it.

export interface TagExecutorLike {
  getState(): TagState
  abortExecution(): void
  /** Called fire-and-forget from the TAG_START handler. Only { dialogIds, tag } are passed —
   *  identity is sourced from resolver.getResolvedUser() inside execute() in Phase 11. */
  execute(args: { dialogIds: string[]; tag: string }): Promise<void>
}

// ── Zod schema for inbound TAG_START payload ─────────────────────────────────
// T-10-06: tag field min(1) rejects empty string — prevents blank-label tagging.
// T-10-07: dialogIds min(1) requires at least one group; max(500) rejects unbounded arrays.
// Per-item: min(1) rejects empty strings; max(30) rejects strings too long for a real Telegram chat ID.
// Identity fields are intentionally absent — they are never accepted from the renderer.

const TagStartSchema = z.object({
  dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500),
  tag: z.string().min(1).max(255),
})

// ── IPC handler registration ───────────────────────────────────────────────────

/**
 * Register all tag execution IPC handlers on ipcMain.
 *
 * Handlers (invoke — request/response):
 *   TAG_START       — Zod-validates payload, auth gate, double-start guard, dialog-map gate,
 *                     calls executor.execute() (fire-and-forget), returns TagState
 *   TAG_ABORT       — calls executor.abortExecution(), returns TagState
 *   TAG_GET_STATE   — returns current TagState from executor.getState()
 *   TAG_GET_JOB     — returns TagJobFile | null from auditStore.readJob()
 *   TAG_DISCARD_JOB — calls auditStore.clearJob(), returns null
 *
 * State push (tag:state) is wired in main/index.ts via TagExecutor's
 * onStateChange callback → emitTagState(). Handlers do NOT push state themselves.
 *
 * @param win           The main BrowserWindow
 * @param executor      The TagExecutorLike instance (Phase 11 wires real TagExecutor)
 * @param enumerator    The GroupEnumerator instance (for dialog-map security gate)
 * @param auditStore    The TagAuditStore instance (for getJob/discardJob)
 * @param getAuthState  Function returning the current AuthState (allows testing without SessionManager)
 */
export function registerTagChannels(
  win: BrowserWindow,
  executor: TagExecutorLike,
  enumerator: GroupEnumerator,
  auditStore: TagAuditStore,
  getAuthState: () => { step: string }
): void {
  // Suppress unused warning — win used by emitTagState wired in main/index.ts
  void win

  // ── Handle: tag:start ────────────────────────────────────────────────────
  // Four-layer security gate chain (mirrors removalChannels.ts lines 92–128).
  // executor.execute() is fire-and-forget; live updates arrive via onStateChange.
  ipcMain.handle(TAG_START, async (_event, payload: unknown) => {
    // Layer 1: Zod validation — throws ZodError on malformed input (T-10-06, T-10-07)
    // Identity fields (targetId, targetName, targetAccessHash) are absent from schema (T-05-04-B)
    const parsed = TagStartSchema.parse(payload)

    // Layer 2: Auth gate — must be authorized (T-10-08)
    if (getAuthState().step !== 'authorized') {
      return executor.getState()
    }

    // Layer 3: Double-start guard (T-10-09) — if executor is already running or stopping,
    // silently return current state without dispatching a new execute().
    // Prevents a second tag:start from overwriting the active job file on disk.
    const currentStep = executor.getState().step
    if (currentStep === 'running' || currentStep === 'stopping') {
      return executor.getState()
    }

    // Layer 4: Dialog security gate — each dialogId must be in enumerator's known dialog map
    // Prevents renderer from injecting groups not in the current enumeration (T-10-07).
    const groupsState = enumerator.getState()
    if (groupsState.step === 'loaded') {
      const knownIds = new Set(groupsState.dialogs.map((d) => d.id))
      const unknownIds = parsed.dialogIds.filter((id) => !knownIds.has(id))
      if (unknownIds.length > 0) {
        throw new Error(
          `Payload contains unknown dialogId(s) — not in current enumeration: ${unknownIds.join(', ')}`
        )
      }
    }

    // Fire-and-forget — identity sourced from resolver.getResolvedUser() inside execute() (Phase 11)
    // Only { dialogIds, tag } are forwarded — NEVER identity from renderer payload (T-05-04-B)
    executor.execute({ dialogIds: parsed.dialogIds, tag: parsed.tag }).catch(() => {
      // Errors handled inside execute() which emits error/stopped state via onStateChange
    })

    return executor.getState()
  })

  // ── Handle: tag:abort ─────────────────────────────────────────────────────
  ipcMain.handle(TAG_ABORT, async () => {
    executor.abortExecution()
    return executor.getState()
  })

  // ── Handle: tag:getState ─────────────────────────────────────────────────
  ipcMain.handle(TAG_GET_STATE, async () => {
    return executor.getState()
  })

  // ── Handle: tag:getJob ───────────────────────────────────────────────────
  // Returns TagJobFileSafe | null — used by renderer on launch to detect pending jobs.
  // Security boundary (T-10-01): targetAccessHash is stripped before crossing IPC.
  // The field lives on disk (0o600) and in main-process memory only; the renderer
  // receives every other job field for display but never the accessHash.
  ipcMain.handle(TAG_GET_JOB, async (): Promise<TagJobFileSafe | null> => {
    const job = auditStore.readJob()
    if (!job) return null
    // Destructure to exclude targetAccessHash — TypeScript verifies the remainder
    // matches TagJobFileSafe (Omit<TagJobFile, 'targetAccessHash'>).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { targetAccessHash: _stripped, ...safe } = job
    return safe
  })

  // ── Handle: tag:discardJob ───────────────────────────────────────────────
  ipcMain.handle(TAG_DISCARD_JOB, async () => {
    auditStore.clearJob()
    return null
  })
}

// ── State push helper ─────────────────────────────────────────────────────────

/**
 * Emit a TagState event to the renderer.
 * Called by TagExecutor's onStateChange callback (wired in main/index.ts).
 * Push guard: gated on !win.isDestroyed() (T-10-10 pattern, mirrors emitRemovalState).
 */
export function emitTagState(win: BrowserWindow, state: TagState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(TAG_STATE, state)
  }
}

// Re-export TagJobFile and TagJobFileSafe for consumers (avoids direct tagTypes import in main/index.ts)
export type { TagJobFile, TagJobFileSafe }
