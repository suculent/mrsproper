/**
 * IPC handler registrations for the removal execution engine.
 * The ONLY renderer surface for removal operations.
 *
 * Security gates:
 *   - T-05-05-C (removal:start): severity validated with z.enum(['kick','ban']) — rejects
 *     any invalid enum value including 'nuke' before reaching executor.
 *   - T-05-05-A (removal:start): dialogIds validated with Zod array bounds (min 1, max 500),
 *     then each dialogId cross-checked against enumerator.getState().dialogs map before
 *     dispatching to executor. Renderer cannot inject groups not in the current enumeration.
 *   - T-05-05-B (removal:start): auth gate — authState.step must be 'authorized';
 *     unauthenticated calls return executor.getState() without dispatching execute().
 *   - T-05-05-D (removal:retryGroup): dialogId cross-checked against the current job's
 *     dialogIds list (auditStore.readJob()?.dialogIds). Renderer cannot retry a group not in
 *     the original job.
 *   - Push guard: emitRemovalState gates on !win.isDestroyed() (T-04-08 pattern).
 *
 * Modeled exactly on src/main/ipc/searchChannels.ts.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { RemovalExecutor } from '../telegram/RemovalExecutor'
import type { GroupEnumerator } from '../telegram/GroupEnumerator'
import type { AuditStore } from '../storage/auditStore'
import {
  REMOVAL_START,
  REMOVAL_ABORT,
  REMOVAL_RETRY_GROUP,
  REMOVAL_GET_STATE,
  REMOVAL_STATE,
  REMOVAL_GET_JOB,
  REMOVAL_DISCARD_JOB,
} from '@shared/channels'
import type { RemovalState } from '@shared/removalTypes'

// ── Zod schemas for inbound IPC payloads ─────────────────────────────────────

// T-05-05-C: severity must be exactly 'kick' or 'ban' — z.enum rejects all other values.
// T-05-05-A: dialogIds min(1) requires at least one group; max(500) rejects unbounded arrays.
// Per-item: min(1) rejects empty strings; max(30) rejects strings too long for a real Telegram chat ID.

const RemovalStartSchema = z.object({
  severity: z.enum(['kick', 'ban']),
  dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500),
})

// T-05-05-D: dialogId is a decimal-string Telegram chat ID.
// max(30) covers bigint-range IDs with margin; min(1) rejects empty.

const RemovalRetryGroupSchema = z.object({
  dialogId: z.string().min(1).max(30),
})

// ── IPC handler registration ───────────────────────────────────────────────────

/**
 * Register all removal execution IPC handlers on ipcMain.
 *
 * Handlers (invoke — request/response):
 *   REMOVAL_START      — Zod-validates payload, auth gate, dialog-map gate,
 *                        calls executor.execute() (fire-and-forget), returns RemovalState
 *   REMOVAL_ABORT      — calls executor.abortExecution(), returns RemovalState
 *   REMOVAL_RETRY_GROUP — Zod-validates payload, auth gate, job-dialogId gate,
 *                         calls executor.retryGroup(dialogId) (fire-and-forget), returns RemovalState
 *   REMOVAL_GET_STATE  — returns current RemovalState from executor.getState()
 *   REMOVAL_GET_JOB    — returns RemovalJobFile | null from auditStore.readJob()
 *   REMOVAL_DISCARD_JOB — calls auditStore.clearJob(), returns null
 *
 * State push (removal:state) is wired in main/index.ts via RemovalExecutor's
 * onStateChange callback → emitRemovalState(). Handlers do NOT push state themselves.
 *
 * @param win           The main BrowserWindow
 * @param executor      The RemovalExecutor instance (constructed in main/index.ts)
 * @param enumerator    The GroupEnumerator instance (for dialog-map security gate)
 * @param auditStore    The AuditStore instance (for job-dialogId gate + getJob/discardJob)
 * @param getAuthState  Function returning the current AuthState (allows testing without SessionManager)
 */
export function registerRemovalChannels(
  win: BrowserWindow,
  executor: RemovalExecutor,
  enumerator: GroupEnumerator,
  auditStore: AuditStore,
  getAuthState: () => { step: string }
): void {
  // Suppress unused warning — win used by emitRemovalState wired in main/index.ts
  void win

  // ── Handle: removal:start ────────────────────────────────────────────────
  // Three-layer security gate: Zod → auth → enumerator dialog-map.
  // executor.execute() is fire-and-forget; live updates arrive via onStateChange.
  ipcMain.handle(REMOVAL_START, async (_event, payload: unknown) => {
    // Layer 1: Zod validation — throws ZodError on malformed input (T-05-05-C, T-05-05-A)
    const parsed = RemovalStartSchema.parse(payload)

    // Layer 2: Auth gate — must be authorized (T-05-05-B)
    if (getAuthState().step !== 'authorized') {
      return executor.getState()
    }

    // Layer 3: Double-start guard (CR-01) — if executor is already running or stopping,
    // silently return current state without dispatching a new execute().
    // Prevents a second removal:start from overwriting the active job file on disk.
    const currentStep = executor.getState().step
    if (currentStep === 'running' || currentStep === 'stopping') {
      return executor.getState()
    }

    // Layer 4: Dialog security gate — each dialogId must be in enumerator's known dialog map
    // Prevents renderer from injecting groups not in the current enumeration (T-05-05-A).
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

    // Fire-and-forget — state updates arrive via onStateChange → emitRemovalState
    executor.execute({ severity: parsed.severity, dialogIds: parsed.dialogIds }).catch(() => {
      // Errors handled inside execute() which emits error/stopped state via onStateChange
    })

    return executor.getState()
  })

  // ── Handle: removal:abort ─────────────────────────────────────────────────
  ipcMain.handle(REMOVAL_ABORT, async () => {
    executor.abortExecution()
    return executor.getState()
  })

  // ── Handle: removal:retryGroup ───────────────────────────────────────────
  // Two-layer security gate: Zod → job-dialogId gate (T-05-05-D).
  ipcMain.handle(REMOVAL_RETRY_GROUP, async (_event, payload: unknown) => {
    // Layer 1: Zod validation — throws ZodError on malformed input
    const parsed = RemovalRetryGroupSchema.parse(payload)

    // Layer 2: Auth gate — must be authorized
    if (getAuthState().step !== 'authorized') {
      return executor.getState()
    }

    // Layer 3: Job-dialogId gate — dialogId must be in the current job's dialogIds list.
    // Prevents renderer from triggering a retry for a group not in the original job (T-05-05-D).
    const job = auditStore.readJob()
    if (!job || !job.dialogIds.includes(parsed.dialogId)) {
      throw new Error('Unknown dialogId — not in current job')
    }

    // Fire-and-forget — state updates arrive via onStateChange
    executor.retryGroup(parsed.dialogId).catch(() => {
      // Errors handled inside retryGroup() which emits updated state via onStateChange
    })

    return executor.getState()
  })

  // ── Handle: removal:getState ─────────────────────────────────────────────
  ipcMain.handle(REMOVAL_GET_STATE, async () => {
    return executor.getState()
  })

  // ── Handle: removal:getJob ───────────────────────────────────────────────
  // Returns RemovalJobFile | null — used by renderer on launch to detect pending jobs.
  ipcMain.handle(REMOVAL_GET_JOB, async () => {
    return auditStore.readJob()
  })

  // ── Handle: removal:discardJob ───────────────────────────────────────────
  ipcMain.handle(REMOVAL_DISCARD_JOB, async () => {
    auditStore.clearJob()
    return null
  })
}

// ── State push helper ─────────────────────────────────────────────────────────

/**
 * Emit a RemovalState event to the renderer.
 * Called by RemovalExecutor's onStateChange callback (wired in main/index.ts).
 * Push guard: gated on !win.isDestroyed() (T-04-08 pattern, mirrors emitSearchState).
 */
export function emitRemovalState(win: BrowserWindow, state: RemovalState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(REMOVAL_STATE, state)
  }
}
