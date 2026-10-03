/**
 * AddExecutor — throttled, generation-guarded state machine for adding (inviting) the
 * resolved target into every selected group (ADD-06..ADD-11).
 *
 * Mirrors RemovalExecutor/TagExecutor's shape (D-01): strictly sequential, every Telegram
 * call through governor.run() on the single shared client, FLOOD_WAIT absorbed by the
 * governor, PEER_FLOOD hard-stops the run with remaining groups left pending (resumable),
 * ~3s inter-group pacing fired AFTER the outcome is checkpointed, generation-token guard
 * with abort-first semantics (WR-01: a superseded run exits silently; only an explicit
 * abort marks remaining groups skipped), per-group checkpoint before advancing, and
 * retryGroup() for failed groups after complete/stopped/hard-stopped.
 *
 * Per-group dispatch (D-02):
 *   - supergroup / broadcast-channel: if the Phase 13 scan reported 'banned', lift the ban
 *     first via its OWN channels.EditBanned governor.run() call, THEN channels.InviteToChannel
 *     as a SEPARATE governor.run() call (D-04: a failed invite after a successful unban never
 *     triggers a re-ban — the ban simply stays lifted).
 *   - basic-group: messages.AddChatUser directly (no ban visibility per Phase 13 D-03).
 *     D-03: fwd_limit is sent as 1000 first; an UNRECOGNIZED first-attempt error triggers
 *     exactly one retry with fwd_limit 100. A RECOGNIZED terminal error (see
 *     _isKnownAddTerminalError) propagates immediately without the retry.
 *
 * D-05: before any dispatch, a deleted or bot target short-circuits every selected group to
 * failed(ADD_TARGET_INVALID) with ZERO API traffic.
 *
 * D-06 (dual signal): a group the Phase 13 scan already reported as 'member' short-circuits
 * to already-member with zero API calls; a runtime USER_ALREADY_PARTICIPANT does the same.
 *
 * D-07/D-09/D-10 (privacy block): both InviteToChannel and AddChatUser return
 * messages.InvitedUsers; a non-empty missingInvitees means the target was blocked. The same
 * classification applies to the legacy error strings USER_PRIVACY_RESTRICTED and
 * USER_NOT_MUTUAL_CONTACT (Pitfall 4: NEVER mapped to ADD_NOT_MUTUAL_CONTACT). In every case
 * a single-use, 5-day invite link is exported INLINE via messages.ExportChatInvite and
 * checkpointed together with the privacy-blocked outcome (D-11).
 *
 * D-12 (channel-full branching): USERS_TOO_MUCH on InviteToChannel takes the link fallback
 * (privacy-blocked, reason:'channel-full') unless the link export itself also fails, in which
 * case the outcome becomes failed(ADD_CHANNEL_FULL). USERS_TOO_MUCH on AddChatUser (basic
 * group) is always failed(ADD_CHANNEL_FULL) with no link attempt — basic groups have no
 * invite-link concept in this flow.
 *
 * SCOPE (this plan, 14-08): fresh-job execute() path only. Continuation-based resume (D-20),
 * the end-of-run DM (D-13/D-14), and the add-log append (D-17/D-18) are Plan 14-09's scope —
 * execute() always calls initJob() with a fresh jobId here; Plan 14-09 replaces that block
 * with the resume-aware branch and inserts its DM/log steps between the loop's natural end
 * and the final 'complete' emission.
 *
 * Security:
 *   - T-05-04-B: target identity read from resolver.getResolvedUser() only — never from
 *     execute() params.
 *   - T-04-01: group entity accessHash comes from the main-process-only enumerator entity
 *     map, never from a renderer payload.
 *   - T-14-10: EditBanned (unban) and InviteToChannel are two independent governor.run()
 *     calls in a fixed order; a failure after unban never triggers a re-ban.
 *   - T-14-11: classifyRpcError's hard-stop disposition is re-thrown before any outcome
 *     classification; the run hard-stops with remaining groups left pending (resumable).
 *   - T-14-12: ExportChatInvite is always usageLimit:1 with a 5-day expireDate.
 *   - bigInt(resolved.accessHash.toString()) — never a zero accessHash for the target
 *     (T-05-04-B).
 */

import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { AddState, AddGroupOutcome, AddJobFile, AddSummary } from '@shared/addTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import type { GroupEnumerator } from './GroupEnumerator'
import type { AddAuditStore } from '../storage/addAuditStore'
import { classifyRpcError } from './operationErrors'
import type { GovernorEvent } from '@shared/opTypes'

// ── Injectable client interface ────────────────────────────────────────────

export interface AddExecutorClient {
  invoke(request: unknown): Promise<unknown>
}

/** Minimal resolved-user shape AddExecutor needs — mirrors TargetResolver's getResolvedUser(). */
interface ResolvedAddUser {
  id: bigint
  accessHash: bigint
  name?: string
  deleted?: boolean
  bot?: boolean
}

/** Known terminal RPC error strings that must NEVER trigger the D-03 fwd_limit retry. */
const KNOWN_ADD_TERMINAL_ERRORS = new Set([
  'CHAT_ADMIN_REQUIRED',
  'USER_ALREADY_PARTICIPANT',
  'USER_PRIVACY_RESTRICTED',
  'USER_NOT_MUTUAL_CONTACT',
  'USERS_TOO_MUCH',
  'USER_KICKED',
  'INPUT_USER_DEACTIVATED',
])

// ── Constructor options ─────────────────────────────────────────────────────

export interface AddExecutorOptions {
  /** The single shared main TelegramClient (real or mock). */
  client: AddExecutorClient
  /** Shared account-wide RateLimitGovernor — all Telegram calls must go through it. */
  governor: RateLimitGovernor
  /** GroupEnumerator — provides dialog list and entity map. */
  enumerator: GroupEnumerator
  /** MembershipScanner-shaped — provides pre-run membership status per dialog (D-06 signal 1). */
  scanner: { getState(): { step: string; results?: Array<{ dialogId: string; status: string }> } }
  /** TargetResolver — provides resolved user id, accessHash, name, and deleted/bot flags. */
  resolver: { getResolvedUser(): ResolvedAddUser | null }
  /** AddAuditStore — durable job-file persistence. */
  auditStore: AddAuditStore
  /** Add-log store — duck-typed placeholder; Plan 14-09 wires appendBlock() into the run. */
  addLogStore: { appendBlock(entry: unknown): void }
  /** DM text renderer — accepted and stored only; unused by this plan's code paths. */
  getDmText: (vars: { name: string; links: string }) => string
  /** Called whenever AddState changes. Wired to win.webContents.send in production. */
  onStateChange: (state: AddState) => void
}

// ── AddExecutor ─────────────────────────────────────────────────────────────

export class AddExecutor {
  private readonly _client: AddExecutorClient
  private readonly _governor: RateLimitGovernor
  private readonly _enumerator: GroupEnumerator
  private readonly _scanner: { getState(): { step: string; results?: Array<{ dialogId: string; status: string }> } }
  private readonly _resolver: { getResolvedUser(): ResolvedAddUser | null }
  private readonly _auditStore: AddAuditStore
  private readonly _addLogStore: { appendBlock(entry: unknown): void }
  private readonly _getDmText: (vars: { name: string; links: string }) => string
  private readonly _emit: (state: AddState) => void

  private _currentState: AddState = {
    step: 'idle',
    targetId: '',
    targetName: '',
    progress: { processed: 0, total: 0 },
    outcomes: [],
  }

  /** Generation token (D-15/WR-01): incremented on execute() and abortExecution(). */
  private _generation = 0
  private _abortController: AbortController | null = null
  /** True while an add run is active — gates flood-tick forwarding. */
  private _runActive = false

  constructor(options: AddExecutorOptions) {
    this._client = options.client
    this._governor = options.governor
    this._enumerator = options.enumerator
    this._scanner = options.scanner
    this._resolver = options.resolver
    this._auditStore = options.auditStore
    this._addLogStore = options.addLogStore
    this._getDmText = options.getDmText
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
    // _addLogStore/_getDmText are stored for Plan 14-09's end-of-run DM/add-log steps —
    // unused by this plan's code paths (see class doc SCOPE note). Referenced here so
    // noUnusedLocals does not flag the fields while they await their Plan 14-09 call sites.
    void this._addLogStore
    void this._getDmText
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Called from main/index.ts governor.onEvent when _runActive is true.
   * Forwards flood-tick events as floodWaitRemaining on AddState — scoped to add-only
   * flood events (mirrors Tag/RemovalExecutor's _handleGovernorEvent exactly).
   */
  _handleGovernorEvent(event: GovernorEvent): void {
    if (!this._runActive) return
    if (event.type === 'flood-tick') {
      this._emit({ ...this._currentState, floodWaitRemaining: event.remaining })
    }
  }

  /**
   * Execute the add run across the specified dialog IDs.
   *
   * Security (T-05-04-B): reads target from this._resolver.getResolvedUser() — never from
   * params. THIS PLAN'S SCOPE: always starts a fresh job (initJob() unconditionally); the
   * continuation branch (D-20, `params.resume`) is Plan 14-09's scope.
   */
  async execute(params: { dialogIds: string[]; resume?: boolean }): Promise<void> {
    const gen = ++this._generation
    this._runActive = true
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    // T-05-04-B: read target from resolver, never from params
    const resolved = this._resolver.getResolvedUser()
    if (resolved === null) {
      this._runActive = false
      this._emit({ ...this._currentState, step: 'idle', floodWaitRemaining: null })
      return
    }

    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') {
      this._runActive = false
      this._emit({ ...this._currentState, step: 'idle', floodWaitRemaining: null })
      return
    }

    const selectedDialogs = params.dialogIds
      .map((id) => groupsState.dialogs.find((d) => d.id === id))
      .filter((d): d is AdminDialogDTO => d !== undefined)

    const total = selectedDialogs.length
    const targetId = resolved.id.toString()
    const targetName = resolved.name ?? ''

    // D-05 PRE-FLIGHT: deleted/bot target — zero API traffic for every selected group.
    if (resolved.deleted || resolved.bot) {
      const now = new Date().toISOString()
      const outcomes: AddGroupOutcome[] = selectedDialogs.map((d) => ({
        dialogId: d.id,
        status: 'failed' as const,
        errorCode: 'ADD_TARGET_INVALID' as const,
        timestamp: now,
      }))
      const jobId = new Date().toISOString()
      this._auditStore.initJob({
        schemaVersion: 1,
        jobId,
        targetId,
        targetName,
        targetAccessHash: resolved.accessHash.toString(),
        dialogIds: params.dialogIds,
        outcomes: [],
        dmStatus: 'pending',
        startedAt: jobId,
        status: 'running',
      })
      for (const o of outcomes) this._auditStore.checkpoint(o.dialogId, o)
      const completedAt = new Date().toISOString()
      this._auditStore.setStatus('complete', completedAt)
      this._runActive = false
      this._emit({
        step: 'complete',
        targetId,
        targetName,
        progress: { processed: outcomes.length, total },
        outcomes,
        summary: this._buildSummary(outcomes, completedAt),
        floodWaitRemaining: null,
        dmStatus: 'not-needed',
      })
      return
    }

    // FRESH JOB INIT (this plan's scope — Plan 14-09 replaces this with the D-20 branch).
    const jobId = new Date().toISOString()
    const job: AddJobFile = {
      schemaVersion: 1,
      jobId,
      targetId,
      targetName,
      targetAccessHash: resolved.accessHash.toString(),
      dialogIds: params.dialogIds,
      outcomes: [],
      dmStatus: 'pending',
      startedAt: jobId,
      status: 'running',
    }
    this._auditStore.initJob(job)
    const outcomes: AddGroupOutcome[] = []

    this._emit({
      step: 'running',
      targetId,
      targetName,
      progress: { processed: 0, total },
      outcomes: [],
      floodWaitRemaining: null,
      dmStatus: 'pending',
    })

    const scanResults = this._scanner.getState().results ?? []
    const scanStatusFor = (dialogId: string): string | undefined =>
      scanResults.find((r) => r.dialogId === dialogId)?.status

    const ctx = { targetId, targetName, total }

    for (const dialog of selectedDialogs) {
      // Abort-first-then-generation guard: top of loop.
      if (signal.aborted) {
        this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
        return
      }
      if (gen !== this._generation) return

      this._emit({
        step: 'running',
        targetId,
        targetName,
        progress: { processed: outcomes.length, total },
        outcomes: [...outcomes],
        currentGroupId: dialog.id,
        floodWaitRemaining: null,
        dmStatus: 'pending',
      })

      let outcome: AddGroupOutcome
      if (scanStatusFor(dialog.id) === 'member') {
        // D-06 signal 1: scanner already confirmed membership — zero API calls.
        outcome = { dialogId: dialog.id, status: 'already-member', timestamp: new Date().toISOString() }
      } else {
        try {
          outcome = await this._addToGroup(dialog, resolved, scanStatusFor(dialog.id))
        } catch (err) {
          // PEER_FLOOD check MUST come first (Pitfall 1)
          const classified = classifyRpcError(err)
          if (classified.disposition === 'hard-stop') {
            if (signal.aborted) {
              this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
              return
            }
            if (gen !== this._generation) return
            this._emitHardStopped(outcomes, ctx)
            return
          }
          outcome = await this._classifyAddError(err, dialog, resolved, targetName)
        }
      }

      // Abort/generation guard: BEFORE checkpoint (gen can change during the await above)
      if (signal.aborted) {
        this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
        return
      }
      if (gen !== this._generation) return

      // Checkpoint the outcome (BEFORE pacing sleep)
      this._auditStore.checkpoint(dialog.id, outcome)
      outcomes.push(outcome)

      // Inter-group pacing: 2s base + up to 1s jitter (fires AFTER outcome checkpointed)
      await new Promise<void>((r) => setTimeout(r, 2000 + Math.random() * 1000))

      // Abort/generation guard: after pacing sleep
      if (signal.aborted) {
        this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
        return
      }
      if (gen !== this._generation) return
    }

    // Abort/generation guard: post-loop, before emitting complete.
    if (signal.aborted) {
      this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
      return
    }
    if (gen !== this._generation) return

    const completedAt = new Date().toISOString()
    // Plan 14-09 inserts its DM/add-log steps between here and this emission — it does not
    // remove this setStatus('complete') call, which keeps the job file terminal even before
    // the DM logic lands on top.
    this._auditStore.setStatus('complete', completedAt)
    this._runActive = false
    this._emit({
      step: 'complete',
      targetId,
      targetName,
      progress: { processed: outcomes.length, total },
      outcomes: [...outcomes],
      summary: this._buildSummary(outcomes, completedAt),
      floodWaitRemaining: null,
      dmStatus: 'not-needed',
    })
  }

  /**
   * Abort the current add run.
   * Increments generation and aborts the AbortController. For an active run the execute()
   * loop's guard detects the increment and emits the authoritative 'stopped' state; for
   * idle/complete/stopped/hard-stopped, reset to idle immediately (TARGET_RESET path).
   */
  abortExecution(): void {
    this._generation++
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    if (this._currentState.step !== 'running' && this._currentState.step !== 'stopping') {
      this._emit({
        step: 'idle',
        targetId: '',
        targetName: '',
        progress: { processed: 0, total: 0 },
        outcomes: [],
      })
    }
  }

  /**
   * Re-run the add dispatch for a single group.
   * Available when step is 'complete', 'stopped', or 'hard-stopped'.
   * Generation-guarded: captures gen before the async gap, guards after.
   */
  async retryGroup(dialogId: string): Promise<void> {
    if (
      this._currentState.step !== 'complete' &&
      this._currentState.step !== 'stopped' &&
      this._currentState.step !== 'hard-stopped'
    ) {
      return
    }

    const gen = this._generation

    const resolved = this._resolver.getResolvedUser()
    if (resolved === null) return

    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') return

    const dialog = groupsState.dialogs.find((d) => d.id === dialogId)
    if (!dialog) return

    const scanResults = this._scanner.getState().results ?? []
    const scanStatus = scanResults.find((r) => r.dialogId === dialogId)?.status
    const targetName = resolved.name ?? ''

    let newOutcome: AddGroupOutcome
    try {
      newOutcome = await this._addToGroup(dialog, resolved, scanStatus)
    } catch (err) {
      newOutcome = await this._classifyAddError(err, dialog, resolved, targetName)
    }

    // Generation guard AFTER await, BEFORE updating state
    if (gen !== this._generation) return
    if (
      this._currentState.step !== 'complete' &&
      this._currentState.step !== 'stopped' &&
      this._currentState.step !== 'hard-stopped'
    ) {
      return
    }

    this._auditStore.checkpoint(dialogId, newOutcome)

    const updatedOutcomes = this._currentState.outcomes.map((o) =>
      o.dialogId === dialogId ? { ...o, ...newOutcome, dialogId } : o
    )

    const current = this._currentState
    this._emit({
      ...current,
      outcomes: updatedOutcomes,
      summary: this._buildSummary(updatedOutcomes, new Date().toISOString()),
    })
  }

  /** Return the current AddState. */
  getState(): AddState {
    return this._currentState
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Add the target to a single dialog using the correct Telegram mechanic.
   * May throw (RPC error) — the caller classifies it (hard-stop vs per-group failure).
   */
  private async _addToGroup(
    dialog: AdminDialogDTO,
    resolved: ResolvedAddUser,
    scanStatus: string | undefined
  ): Promise<AddGroupOutcome> {
    const timestamp = new Date().toISOString()
    const targetName = resolved.name ?? ''

    const inputUser = new Api.InputPeerUser({
      userId: bigInt(resolved.id.toString()),
      accessHash: bigInt(resolved.accessHash.toString()),
    })

    if (dialog.type === 'basic-group') {
      const entity = this._enumerator.getDialogEntity(dialog.id) as {
        id?: { toString(): string }
      } | null
      const chatId = entity?.id ? bigInt(entity.id.toString()) : bigInt(dialog.id)

      let response: unknown
      try {
        response = await this._governor.run(() =>
          this._client.invoke(new Api.messages.AddChatUser({ chatId, userId: inputUser, fwdLimit: 1000 }))
        )
      } catch (err) {
        if (this._isKnownAddTerminalError(err)) {
          throw err
        }
        // Unrecognized first-attempt error — presumably the undocumented fwd_limit
        // rejection (D-03). Retry exactly once with fwdLimit 100; propagate whatever that
        // second call does (success or throw) without a further retry.
        response = await this._governor.run(() =>
          this._client.invoke(new Api.messages.AddChatUser({ chatId, userId: inputUser, fwdLimit: 100 }))
        )
      }

      const missing = this._extractMissingInvitees(response)
      if (missing.length > 0) {
        try {
          return await this._buildPrivacyBlockedOutcome(
            dialog,
            resolved,
            targetName,
            missing[0]!.premiumWouldAllowInvite ?? false
          )
        } catch {
          return { dialogId: dialog.id, status: 'failed', errorCode: 'UNKNOWN', timestamp }
        }
      }
      return { dialogId: dialog.id, status: 'done', timestamp }
    }

    // supergroup | broadcast-channel
    const channelEntity = this._enumerator.getDialogEntity(dialog.id) as {
      id?: { toString(): string }
      accessHash?: { toString(): string }
    } | null

    const channelId = bigInt(channelEntity?.id?.toString() ?? dialog.id)
    const channelAccessHash = channelEntity?.accessHash ? bigInt(channelEntity.accessHash.toString()) : bigInt('0')
    const inputChannel = new Api.InputChannel({ channelId, accessHash: channelAccessHash })

    if (scanStatus === 'banned') {
      // D-04: unban is its OWN governor.run() call — any throw here propagates uncaught
      // (if the unban itself fails, the group is a failed outcome; no invite is attempted).
      await this._governor.run(() =>
        this._client.invoke(
          new Api.channels.EditBanned({
            channel: inputChannel,
            participant: inputUser,
            bannedRights: new Api.ChatBannedRights({ untilDate: 0 }),
          })
        )
      )
    }

    const response = await this._governor.run(() =>
      this._client.invoke(new Api.channels.InviteToChannel({ channel: inputChannel, users: [inputUser] }))
    )

    const missing = this._extractMissingInvitees(response)
    if (missing.length > 0) {
      try {
        return await this._buildPrivacyBlockedOutcome(
          dialog,
          resolved,
          targetName,
          missing[0]!.premiumWouldAllowInvite ?? false
        )
      } catch {
        return { dialogId: dialog.id, status: 'failed', errorCode: 'UNKNOWN', timestamp }
      }
    }
    return { dialogId: dialog.id, status: 'done', timestamp }
  }

  /** True when `err` is a recognized terminal RPC error that must NOT trigger a fwd_limit retry. */
  private _isKnownAddTerminalError(err: unknown): boolean {
    const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
    if (KNOWN_ADD_TERMINAL_ERRORS.has(msg)) return true
    return classifyRpcError(err).disposition === 'hard-stop'
  }

  /** Extract the missingInvitees array from an InvitedUsers-shaped response. */
  private _extractMissingInvitees(
    response: unknown
  ): Array<{ premiumWouldAllowInvite?: boolean }> {
    return (response as { missingInvitees?: Array<{ premiumWouldAllowInvite?: boolean }> })?.missingInvitees ?? []
  }

  /**
   * Classify a per-group add error into an AddGroupOutcome.
   *
   * CRITICAL branch order (Pitfall 1): hard-stop re-throw FIRST, before any string match.
   * Uses ONLY shipped AddErrorCode values.
   */
  private async _classifyAddError(
    err: unknown,
    dialog: AdminDialogDTO,
    resolved: ResolvedAddUser,
    targetName: string
  ): Promise<AddGroupOutcome> {
    const timestamp = new Date().toISOString()

    // (1) HARD-STOP FIRST — re-throw so the caller handles PEER_FLOOD.
    const classified = classifyRpcError(err)
    if (classified.disposition === 'hard-stop') {
      throw err
    }

    const msg: string = (err as { errorMessage?: string })?.errorMessage ?? ''

    // (2) Privacy block (D-07; never ADD_NOT_MUTUAL_CONTACT — Pitfall 4).
    if (msg === 'USER_PRIVACY_RESTRICTED' || msg === 'USER_NOT_MUTUAL_CONTACT') {
      try {
        return await this._buildPrivacyBlockedOutcome(dialog, resolved, targetName, false)
      } catch {
        return { dialogId: dialog.id, status: 'failed', errorCode: 'UNKNOWN', timestamp }
      }
    }

    // (3) Channel-full branching (D-12).
    if (msg === 'USERS_TOO_MUCH') {
      if (dialog.type === 'basic-group') {
        return { dialogId: dialog.id, status: 'failed', errorCode: 'ADD_CHANNEL_FULL', timestamp }
      }
      try {
        return await this._buildPrivacyBlockedOutcome(dialog, resolved, targetName, false, 'channel-full')
      } catch {
        return { dialogId: dialog.id, status: 'failed', errorCode: 'ADD_CHANNEL_FULL', timestamp }
      }
    }

    if (msg === 'CHAT_ADMIN_REQUIRED') {
      return { dialogId: dialog.id, status: 'failed', errorCode: 'ADD_NO_RIGHTS', timestamp }
    }

    // (D-06 signal 2)
    if (msg === 'USER_ALREADY_PARTICIPANT') {
      return { dialogId: dialog.id, status: 'already-member', timestamp }
    }

    if (msg === 'INPUT_USER_DEACTIVATED') {
      return { dialogId: dialog.id, status: 'failed', errorCode: 'ADD_TARGET_INVALID', timestamp }
    }

    if (msg === 'USER_CHANNELS_TOO_MUCH') {
      return { dialogId: dialog.id, status: 'failed', errorCode: 'ADD_USER_CHANNELS_TOO_MUCH', timestamp }
    }

    if (msg === 'USER_KICKED') {
      return { dialogId: dialog.id, status: 'failed', errorCode: 'ADD_USER_KICKED', timestamp }
    }

    // Open Question 3 resolved — no dedicated code for CHANNEL_PRIVATE.
    if (msg === 'CHANNEL_PRIVATE') {
      return { dialogId: dialog.id, status: 'failed', errorCode: 'UNKNOWN', timestamp }
    }

    if (classified.disposition === 'retry' || classified.code === 'NETWORK') {
      return { dialogId: dialog.id, status: 'failed', errorCode: 'NETWORK', timestamp }
    }

    return { dialogId: dialog.id, status: 'failed', errorCode: 'UNKNOWN', timestamp }
  }

  /**
   * Build the privacy-blocked outcome: export a single-use, 5-day invite link inline
   * (D-10/D-11) and return the outcome carrying it. Let a throw from ExportChatInvite
   * propagate to the caller — callers wrap this in their own try/catch (see Pitfall 3).
   */
  private async _buildPrivacyBlockedOutcome(
    dialog: AdminDialogDTO,
    _resolved: ResolvedAddUser,
    targetName: string,
    premiumWouldAllow: boolean,
    reason: 'privacy' | 'channel-full' = 'privacy'
  ): Promise<AddGroupOutcome> {
    const timestamp = new Date().toISOString()
    const entity = this._enumerator.getDialogEntity(dialog.id) as {
      id?: { toString(): string }
      accessHash?: { toString(): string }
    } | null

    const peer =
      dialog.type === 'basic-group'
        ? new Api.InputPeerChat({ chatId: bigInt(entity?.id?.toString() ?? dialog.id) })
        : new Api.InputPeerChannel({
            channelId: bigInt(entity?.id?.toString() ?? dialog.id),
            accessHash: entity?.accessHash ? bigInt(entity.accessHash.toString()) : bigInt('0'),
          })

    const expireDate = Math.floor(Date.now() / 1000) + 432000 // 5 days
    const title = ('Admin • ' + targetName).slice(0, 32)

    const exported = (await this._governor.run(() =>
      this._client.invoke(
        new Api.messages.ExportChatInvite({
          peer,
          usageLimit: 1,
          expireDate,
          title,
          requestNeeded: false,
        })
      )
    )) as { link: string }

    return {
      dialogId: dialog.id,
      status: 'privacy-blocked',
      reason,
      link: exported.link,
      premiumWouldAllow,
      timestamp,
    }
  }

  /**
   * Mark all not-yet-processed dialogs as skipped, persist, and emit the authoritative
   * 'stopped' state. Used by the generation/abort guards.
   */
  private _markRemainingSkippedAndStop(
    selectedDialogs: AdminDialogDTO[],
    outcomes: AddGroupOutcome[],
    ctx: { targetId: string; targetName: string; total: number }
  ): void {
    const processedIds = new Set(outcomes.map((o) => o.dialogId))
    const remaining = selectedDialogs.filter((d) => !processedIds.has(d.id))
    for (const d of remaining) {
      const skipped: AddGroupOutcome = { dialogId: d.id, status: 'skipped', timestamp: new Date().toISOString() }
      this._auditStore.checkpoint(skipped.dialogId, skipped)
      outcomes.push(skipped)
    }
    this._auditStore.setStatus('stopped')
    this._runActive = false
    this._emit({
      step: 'stopped',
      targetId: ctx.targetId,
      targetName: ctx.targetName,
      progress: { processed: outcomes.filter((o) => o.status !== 'skipped').length, total: ctx.total },
      outcomes: [...outcomes],
      summary: this._buildSummary(outcomes, new Date().toISOString()),
      floodWaitRemaining: null,
      dmStatus: 'pending',
    })
  }

  /**
   * PEER_FLOOD hard-stop: remaining groups left pending (NOT skipped), run resumable.
   */
  private _emitHardStopped(
    outcomes: AddGroupOutcome[],
    ctx: { targetId: string; targetName: string; total: number }
  ): void {
    this._auditStore.setStatus('hard-stopped')
    this._runActive = false
    this._emit({
      step: 'hard-stopped',
      targetId: ctx.targetId,
      targetName: ctx.targetName,
      progress: { processed: outcomes.length, total: ctx.total },
      outcomes: [...outcomes],
      summary: this._buildSummary(outcomes, new Date().toISOString()),
      floodWaitRemaining: null,
      dmStatus: 'pending',
    })
  }

  /**
   * Build an AddSummary from accumulated outcomes.
   */
  private _buildSummary(outcomes: AddGroupOutcome[], completedAt: string): AddSummary {
    return {
      added: outcomes.filter((o) => o.status === 'done').length,
      alreadyMember: outcomes.filter((o) => o.status === 'already-member').length,
      privacyBlocked: outcomes.filter((o) => o.status === 'privacy-blocked').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
      skipped: outcomes.filter((o) => o.status === 'skipped').length,
      completedAt,
    }
  }
}
