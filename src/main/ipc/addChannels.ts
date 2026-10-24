/**
 * IPC handler registrations for the add execution engine (Phase 14, ADD-06/ADD-08/ADD-05).
 * The ONLY renderer surface for add operations.
 *
 * Security gates:
 *   - T-14-15 (add:start): AddStartSchema admits only { dialogIds } — no identity fields.
 *     Identity (targetId, targetName, the target's access hash) is read from
 *     resolver.getResolvedUser() inside AddExecutor.execute(). Renderer can never inject
 *     target identity (T-05-04-B).
 *   - T-14-15 (add:start): dialogIds cross-checked against enumerator.getState().dialogs map.
 *     Renderer cannot inject groups not in the current enumeration.
 *   - add:start — auth gate: authState.step must be 'authorized'; unauthenticated calls return
 *     executor.getState() without dispatching execute().
 *   - add:start — double-start guard: if step is 'running' or 'stopping', return current state
 *     without re-dispatching. Prevents overwriting the active job file on disk.
 *   - T-14-16 (add:start resume): `resume` is NEVER accepted from the renderer payload — the
 *     Zod schema admits only dialogIds. This handler computes resume intent itself from the
 *     on-disk job (auditStore.readJob()); AddExecutor independently re-validates targetId /
 *     dialogId-set equality (D-20) before actually continuing.
 *   - add:retryGroup — dialogId cross-checked against the CURRENT job's dialogIds (not the
 *     live enumeration) — prevents retrying a group that was never part of this run.
 *   - T-14-17 (add:getJob): the target's access hash is stripped before the job ever
 *     serializes across contextBridge.
 *   - T-14-18 (target:addContact): wraps contactService.addIfMissing() in try/catch; a
 *     rejection never propagates as an IPC error (D-08's non-blocking contract enforced at the
 *     boundary too, in case contactService itself is ever modified to throw). Also gated on the
 *     auth state so an unauthenticated renderer cannot trigger a contact write.
 *   - Push guard: emitAddState gates on !win.isDestroyed().
 *
 * Modeled exactly on src/main/ipc/tagChannels.ts (ADD_START/ADD_GET_JOB) and
 * src/main/ipc/removalChannels.ts (ADD_RETRY_GROUP's job-dialogId gate, which tagChannels.ts
 * omits since Tag has no retryGroup).
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import type { GroupEnumerator } from '../telegram/GroupEnumerator'
import {
  ADD_START,
  ADD_RESUME,
  ADD_ABORT,
  ADD_RETRY_GROUP,
  ADD_GET_STATE,
  ADD_STATE,
  ADD_GET_JOB,
  ADD_DISCARD_JOB,
  ADD_EXPORT_LOG,
  TARGET_ADD_CONTACT,
} from '@shared/channels'
import type { AddState, AddJobFile, AddJobFileSafe } from '@shared/addTypes'
import { isJobFinished } from '@shared/addResume'
import type { AddAuditStore } from '../storage/addAuditStore'

// ── AddExecutorLike interface ────────────────────────────────────────────────
// Decouples this IPC module from a direct AddExecutor import (mirrors TagExecutorLike
// in tagChannels.ts). The real AddExecutor (Plans 14-08/14-09) satisfies this shape.

export interface AddExecutorLike {
  getState(): AddState
  abortExecution(): void
  /** Called fire-and-forget from the ADD_RETRY_GROUP handler. */
  retryGroup(dialogId: string): Promise<void>
  /** Called fire-and-forget from the ADD_START handler. `resume` is computed by THIS module
   *  from auditStore.readJob() — never accepted from the renderer payload (T-14-16). */
  execute(args: { dialogIds: string[]; resume?: boolean }): Promise<void>
  /** D-07: identity-aware ADD_START decision. 'reject' = never act (job untouched, no RPC). */
  checkResumeIdentity(existing: AddJobFile | null): 'resume' | 'fresh' | 'reject'
  /** D-07: ADD_RESUME gate. 'reject' = no non-complete job, or a live resolver user that
   *  differs from the job's targetId. */
  checkExplicitResume(job: AddJobFile | null): 'resume' | 'reject'
}

// ── ContactServiceLike interface ─────────────────────────────────────────────

export interface ContactServiceLike {
  addIfMissing(): Promise<{ ok: boolean; code?: string }>
}

// ── AddLogStoreLike interface ────────────────────────────────────────────────
// Minimal structural type (not a full import) to avoid a circular dependency with
// addLogStore.ts — only the path accessor the ADD_EXPORT_LOG handler needs.

export interface AddLogStoreLike {
  getLogPath(): string
}

// ── Zod schemas for inbound payloads ─────────────────────────────────────────
// T-14-15: dialogIds min(1) requires at least one group; max(500) rejects unbounded arrays.
// Per-item: min(1) rejects empty strings; max(30) rejects strings too long for a real Telegram
// chat ID. No `resume` field — resume is computed server-side from auditStore.readJob(), never
// accepted from the renderer (T-14-16).

const AddStartSchema = z.object({
  dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500),
})

const AddRetryGroupSchema = z.object({
  dialogId: z.string().min(1).max(30),
})

// ── IPC handler registration ───────────────────────────────────────────────────

/**
 * Register all add execution + contact-add IPC handlers on ipcMain.
 *
 * Handlers (invoke — request/response):
 *   ADD_START         — Zod-validates payload, auth gate, double-start guard, dialog-map gate,
 *                        computes `resume` from auditStore.readJob(), calls executor.execute()
 *                        (fire-and-forget), returns AddState
 *   ADD_RESUME        — no payload; auth gate, double-start guard, explicit-resume identity
 *                        gate, enumeration gate; continues the on-disk job with its full
 *                        dialogIds (fire-and-forget), returns AddState
 *   ADD_ABORT         — calls executor.abortExecution(), returns AddState
 *   ADD_RETRY_GROUP   — Zod-validates payload, auth gate, job-dialogId gate,
 *                        calls executor.retryGroup(dialogId) (fire-and-forget), returns AddState
 *   ADD_GET_STATE     — returns current AddState from executor.getState()
 *   ADD_GET_JOB       — returns AddJobFileSafe | null from auditStore.readJob() (accessHash stripped)
 *   ADD_DISCARD_JOB   — calls auditStore.clearJob(), returns null
 *   TARGET_ADD_CONTACT — auth gate, then wraps contactService.addIfMissing() in try/catch;
 *                        never throws across IPC (D-08)
 *
 * State push (add:state) is wired in main/index.ts via AddExecutor's onStateChange callback →
 * emitAddState(). Handlers do NOT push state themselves.
 *
 * @param win            The main BrowserWindow
 * @param executor       The AddExecutorLike instance (constructed in main/index.ts)
 * @param enumerator     The GroupEnumerator instance (for dialog-map security gate)
 * @param auditStore     The AddAuditStore instance (for resume computation + job-dialogId gate + getJob/discardJob)
 * @param contactService The ContactServiceLike instance (for target:addContact)
 * @param addLogStore    The AddLogStoreLike instance (for the ADD_EXPORT_LOG source path)
 * @param getAuthState   Function returning the current AuthState (allows testing without SessionManager)
 */
export function registerAddChannels(
  win: BrowserWindow,
  executor: AddExecutorLike,
  enumerator: GroupEnumerator,
  auditStore: AddAuditStore,
  contactService: ContactServiceLike,
  addLogStore: AddLogStoreLike,
  getAuthState: () => { step: string }
): void {

  // ── Handle: add:start ────────────────────────────────────────────────────
  // Four-layer security gate chain (mirrors tagChannels.ts's TAG_START exactly), followed by
  // server-side resume-intent computation (T-14-16).
  ipcMain.handle(ADD_START, async (_event, payload: unknown) => {
    // Layer 1: Zod validation — throws ZodError on malformed input.
    // Identity fields AND `resume` are absent from the schema (T-05-04-B, T-14-16).
    const parsed = AddStartSchema.parse(payload)

    // Layer 2: Auth gate — must be authorized.
    if (getAuthState().step !== 'authorized') {
      return executor.getState()
    }

    // Layer 3: Double-start guard — if executor is already running or stopping,
    // silently return current state without dispatching a new execute().
    // Prevents a second add:start from overwriting the active job file on disk.
    const currentStep = executor.getState().step
    if (currentStep === 'running' || currentStep === 'stopping') {
      return executor.getState()
    }

    // Layer 4: Dialog security gate — each dialogId must be in enumerator's known dialog map.
    // Prevents renderer from injecting groups not in the current enumeration (T-14-15).
    const groupsState = enumerator.getState()
    if (groupsState.step !== 'loaded') {
      // Enumerator not ready: return current state without dispatching (mirrors auth-gate
      // and double-start-guard rejection paths — no execute(), no throw).
      return executor.getState()
    }
    const knownIds = new Set(groupsState.dialogs.map((d) => d.id))
    const unknownIds = parsed.dialogIds.filter((id) => !knownIds.has(id))
    if (unknownIds.length > 0) {
      throw new Error(
        `Payload contains unknown dialogId(s) — not in current enumeration: ${unknownIds.join(', ')}`
      )
    }

    // T-14-16: `resume` is computed HERE from the on-disk job, never from the renderer payload.
    // AddExecutor independently re-validates targetId/dialogId-set equality (D-20) before
    // actually continuing — this handler only signals intent via a boolean.
    const existingJob = auditStore.readJob()
    // D-07: ADD_START always means "start what the admin reviewed". The same confirmed target
    // with the same dialog-id set continues its own job; a different reviewed target starts a
    // fresh job; a different identity is rejected only while a live in-memory job exists.
    // Resuming job A without a reviewed target goes through ADD_RESUME instead.
    const decision = executor.checkResumeIdentity(existingJob)
    if (decision === 'reject') {
      return executor.getState()
    }
    const resume =
      decision === 'resume' && existingJob !== null && existingJob.status !== 'complete'

    // Fire-and-forget — identity sourced from resolver.getResolvedUser() inside execute().
    // Only { dialogIds, resume } are forwarded — NEVER identity from renderer payload (T-05-04-B).
    executor.execute({ dialogIds: parsed.dialogIds, resume }).catch(() => {
      // Errors handled inside execute() which emits error/stopped state via onStateChange
    })

    return executor.getState()
  })

  // ── Handle: add:resume ───────────────────────────────────────────────────
  // D-07: explicit, main-owned resume intent. No payload — the job (and therefore the dialog
  // set and the identity) is read from disk here, never from the renderer (T-14-16, T-05-04-B).
  // Every rejection returns executor.getState() with no execute, no initJob and no RPC.
  ipcMain.handle(ADD_RESUME, async () => {
    if (getAuthState().step !== 'authorized') {
      return executor.getState()
    }
    const currentStep = executor.getState().step
    if (currentStep === 'running' || currentStep === 'stopping') {
      return executor.getState()
    }
    const job = auditStore.readJob()
    if (job === null || executor.checkExplicitResume(job) === 'reject') {
      return executor.getState()
    }
    // WR-03 (iter 2): a job with nothing left to process is never resumed — a continuation
    // would add nothing and could only re-run the end-of-run DM tail (mirrors the renderer's
    // resumeJobFromDisk filter, which is UX only).
    if (isJobFinished(job)) {
      return executor.getState()
    }
    // Enumeration gate (Phase 16 D-04): every job group must still be in the loaded
    // enumeration, otherwise the continuation would silently drop groups.
    const groupsState = enumerator.getState()
    if (groupsState.step !== 'loaded') {
      return executor.getState()
    }
    const knownIds = new Set(groupsState.dialogs.map((d) => d.id))
    if (!job.dialogIds.every((id) => knownIds.has(id))) {
      return executor.getState()
    }
    // D-01 (Phase 16): always the FULL job dialog-id set so the continuation gate matches.
    executor.execute({ dialogIds: [...job.dialogIds], resume: true }).catch(() => {
      // Errors handled inside execute() which emits error/stopped state via onStateChange
    })
    return executor.getState()
  })

  // ── Handle: add:abort ─────────────────────────────────────────────────────
  ipcMain.handle(ADD_ABORT, async () => {
    executor.abortExecution()
    return executor.getState()
  })

  // ── Handle: add:retryGroup ────────────────────────────────────────────────
  // Two-layer security gate: Zod → job-dialogId gate (mirrors removalChannels.ts's
  // REMOVAL_RETRY_GROUP, which tagChannels.ts has no equivalent for).
  ipcMain.handle(ADD_RETRY_GROUP, async (_event, payload: unknown) => {
    // Layer 1: Zod validation — throws ZodError on malformed input.
    const parsed = AddRetryGroupSchema.parse(payload)

    // Layer 2: Auth gate — must be authorized.
    if (getAuthState().step !== 'authorized') {
      return executor.getState()
    }

    // Layer 3: Job-dialogId gate — dialogId must be in the CURRENT job's dialogIds list, not
    // the live enumeration. Prevents renderer from triggering a retry for a group that was
    // never part of this run.
    const job = auditStore.readJob()
    if (!job || !job.dialogIds.includes(parsed.dialogId)) {
      throw new Error('Unknown dialogId — not in current job')
    }

    // Fire-and-forget — state updates arrive via onStateChange.
    executor.retryGroup(parsed.dialogId).catch(() => {
      // Errors handled inside retryGroup() which emits updated state via onStateChange
    })

    return executor.getState()
  })

  // ── Handle: add:getState ──────────────────────────────────────────────────
  ipcMain.handle(ADD_GET_STATE, async () => {
    return executor.getState()
  })

  // ── Handle: add:getJob ────────────────────────────────────────────────────
  // Returns AddJobFileSafe | null — used by renderer on launch to detect pending jobs.
  // Security boundary (T-14-17): the access hash field is stripped before crossing IPC.
  // It lives on disk (0o600) and in main-process memory only; the renderer receives every
  // other job field for display but never the access hash.
  ipcMain.handle(ADD_GET_JOB, async (): Promise<AddJobFileSafe | null> => {
    const job: AddJobFile | null = auditStore.readJob()
    if (!job) return null
    // Destructure to exclude the access hash field — TypeScript verifies the remainder
    // matches AddJobFileSafe (which Omits it from AddJobFile).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { targetAccessHash: _stripped, bannedDialogIds: _banned, ...safe } = job
    return safe
  })

  // ── Handle: add:discardJob ────────────────────────────────────────────────
  ipcMain.handle(ADD_DISCARD_JOB, async () => {
    auditStore.clearJob()
    return null
  })

  // ── Handle: target:addContact ─────────────────────────────────────────────
  // D-08: the contact-add is NOT part of the AddExecutor run — this is a standalone,
  // non-blocking handler Phase 15's "Add to contacts" checkbox calls at target confirmation.
  // Never throws across IPC: every failure (including an unauthenticated caller or a rejected
  // contactService call) resolves to { ok: false }.
  ipcMain.handle(TARGET_ADD_CONTACT, async () => {
    if (getAuthState().step !== 'authorized') {
      return { ok: false }
    }
    try {
      return await contactService.addIfMissing()
    } catch {
      return { ok: false }
    }
  })

  // ── Handle: add:exportLog ─────────────────────────────────────────────────
  // D-20: opens a native save dialog and copies add-log.txt to the chosen path. The source
  // path always comes from addLogStore.getLogPath() (fixed, main-computed); the destination
  // always comes from dialog.showSaveDialog's return value — the renderer supplies neither
  // (T-15-02).
  ipcMain.handle(ADD_EXPORT_LOG, async () => {
    if (getAuthState().step !== 'authorized') {
      return { ok: false as const }
    }
    // Dynamic import (not require) — vi.mock('node:fs', ...) only intercepts the ESM/
    // dynamic-import module graph in this test runner, not a literal CommonJS require() call.
    const { copyFileSync, existsSync } = await import('node:fs')
    const logPath = addLogStore.getLogPath()
    if (!existsSync(logPath)) {
      return { ok: false as const, reason: 'no-log' as const }
    }
    const targetWin = BrowserWindow.getFocusedWindow() ?? win
    const { canceled, filePath } = await dialog.showSaveDialog(targetWin, {
      defaultPath: 'mrproper-add-log.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }],
    })
    if (canceled || !filePath) {
      return { ok: false as const, reason: 'canceled' as const }
    }
    // WR-02: never throws across IPC, matching every sibling handler in this file — a
    // permission error, a full disk, or a benign race (the log file is deleted between the
    // existsSync check above and the user finishing the save dialog) must not reject the
    // ipcMain.handle promise.
    try {
      copyFileSync(logPath, filePath)
      return { ok: true as const }
    } catch {
      return { ok: false as const, reason: 'canceled' as const }
    }
  })
}

// ── State push helper ─────────────────────────────────────────────────────────

/**
 * Emit an AddState event to the renderer.
 * Called by AddExecutor's onStateChange callback (wired in main/index.ts).
 * Push guard: gated on !win.isDestroyed() (mirrors emitTagState/emitRemovalState).
 */
export function emitAddState(win: BrowserWindow, state: AddState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(ADD_STATE, state)
  }
}

// Re-export AddJobFile and AddJobFileSafe for consumers (avoids direct addTypes import in main/index.ts)
export type { AddJobFile, AddJobFileSafe }
