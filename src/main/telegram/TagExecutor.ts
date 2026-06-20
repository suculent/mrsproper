/**
 * TagExecutor — throttled, generation-guarded, tag-write state machine.
 *
 * Mirrors RemovalExecutor exactly — same state machine structure, same generation-token
 * guard (D-15), same abort semantics, same per-group checkpoint ordering, same PEER_FLOOD
 * hard-stop behavior. The per-group call is `tagClient.invoke(makeEditChatParticipantRankRequest(...))`.
 *
 * Key differences from RemovalExecutor:
 *   - Per-group call is editChatParticipantRank via the layer-224 tagClient (not EditBanned).
 *   - tagClient must be connected at run start and disconnected at run end (all terminal paths).
 *   - Already-admin pre-flight: GetParticipant via main client (governor-wrapped) before tag write.
 *   - Basic-group skip: detect from AdminDialogDTO.type, no API call.
 *
 * Critical constraints (enforced):
 *   - tagClient.invoke() is already governor-wrapped — do NOT double-wrap in governor.run().
 *   - GetParticipant pre-flight goes through main client + governor.run() (not tagClient).
 *   - _classifyTagError() re-throws on hard-stop FIRST (Pitfall 1).
 *   - Generation guard #2 runs BEFORE auditStore.checkpoint() (Pitfall 7).
 *   - tagClient.disconnect() in finally block — all terminal paths (complete, stopped, hard-stopped).
 *   - Only SHIPPED TagErrorCode values used (no TAG_USER_NOT_PARTICIPANT, TAG_RANK_INVALID, TAG_CHANNEL_PRIVATE).
 *   - bigInt(resolved.accessHash.toString()) — never bigInt.zero for target (T-05-04-B).
 *
 * Security:
 *   - T-05-04-B: target identity read from resolver.getResolvedUser() only — never from execute() args.
 *   - T-11-03: tagClient.connect() called only after early-exit guards pass; disconnect in finally.
 *   - T-11-04: GetParticipant pre-flight before any tagClient.invoke(); ChannelParticipantAdmin → skipped.
 *   - T-11-05: PEER_FLOOD hard-stops the run; remaining groups left pending (resumable).
 *   - T-11-06: All 5 D-15 guard checkpoints replicated; guard #2 BEFORE checkpoint (Pitfall 7).
 */

import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { TagState, TagGroupOutcome, TagJobFile } from '@shared/tagTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import type { GroupEnumerator } from './GroupEnumerator'
import type { TagAuditStore } from '../storage/tagAuditStore'
import { classifyRpcError } from './operationErrors'
import type { GovernorEvent } from '@shared/opTypes'
import { makeEditChatParticipantRankRequest } from './tagApi'
import type { TagClient } from './tagClient'

// ── Constructor options ─────────────────────────────────────────────────────

export interface TagExecutorOptions {
  /**
   * Factory that constructs a fresh TagClient (snapshotting the CURRENT session) at each
   * run start. Using a factory rather than a pre-built instance fixes two bugs (CR-02):
   *   1. Session snapshot: calling new TagClient() at app-startup captures an empty session
   *      (before login). The factory is called inside execute(), post-login, so the session
   *      is always populated.
   *   2. floodSleepThreshold: the factory is the right place to set floodSleepThreshold:0
   *      on the inner TelegramClient so FLOOD_WAITs reach the governor rather than being
   *      silently absorbed by GramJS.
   * The returned TagClient is ephemeral: connect → use → disconnect per run.
   */
  tagClientFactory: () => TagClient
  /** Main layer-198 client — for already-admin GetParticipant check (read, not write). */
  mainClient: { invoke(request: unknown): Promise<unknown> }
  /** Shared account-wide RateLimitGovernor — all Telegram calls must go through it. */
  governor: RateLimitGovernor
  /** GroupEnumerator — provides dialog list and entity map. */
  enumerator: GroupEnumerator
  /** TargetResolver — provides resolved user id, accessHash, and display name. */
  resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string } | null }
  /** TagAuditStore — durable job-file persistence. */
  auditStore: TagAuditStore
  /** Called whenever TagState changes. Wired to emitTagState in production. */
  onStateChange: (state: TagState) => void
}

// ── TagExecutor ─────────────────────────────────────────────────────────────

export class TagExecutor {
  private readonly _tagClientFactory: () => TagClient
  private readonly _mainClient: { invoke(request: unknown): Promise<unknown> }
  private readonly _governor: RateLimitGovernor
  private readonly _enumerator: GroupEnumerator
  private readonly _resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string } | null }
  private readonly _auditStore: TagAuditStore
  private readonly _emit: (state: TagState) => void

  private _currentState: TagState = {
    step: 'idle',
    tag: '',
    targetId: '',
    targetName: '',
    progress: { processed: 0, total: 0 },
    outcomes: [],
  }

  /** Generation token (D-15): incremented on execute() and abortExecution() to invalidate prior in-flight work. */
  private _generation = 0
  private _abortController: AbortController | null = null
  /** True while a tag run is active — gates flood-tick forwarding (T-06-02-04). */
  private _runActive = false
  /** Reconnect-race mutex (CONTEXT §4.3): true during tagClient.connect() call window. */
  private _connectingTagClient = false

  constructor(options: TagExecutorOptions) {
    this._tagClientFactory = options.tagClientFactory
    this._mainClient = options.mainClient
    this._governor = options.governor
    this._enumerator = options.enumerator
    this._resolver = options.resolver
    this._auditStore = options.auditStore
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Called from main/index.ts governor.onEvent when _runActive is true.
   * Captures flood-tick events during a tag run and emits them as floodWaitRemaining
   * on TagState — scoped to tag-only flood events.
   *
   * No-op when _runActive is false so that target-resolution and enumeration
   * governor events never leak into the tag state machine.
   */
  _handleGovernorEvent(event: GovernorEvent): void {
    if (!this._runActive) return
    if (event.type === 'flood-tick') {
      this._emit({ ...this._currentState, floodWaitRemaining: event.remaining })
    }
  }

  /**
   * Execute the tag run across the specified dialog IDs.
   *
   * Security (T-05-04-B): reads target from this._resolver.getResolvedUser() —
   * NO renderer payload is accepted for target identity. The IPC payload carries
   * only dialogIds and tag.
   *
   * D-15: increments _generation at the start; each loop iteration checks if generation
   * has been superseded (by a newer execute() or abortExecution()) and exits early.
   */
  async execute(params: { dialogIds: string[]; tag: string }): Promise<void> {
    // D-15: increment generation to invalidate any prior in-flight run
    const gen = ++this._generation
    // Mark run active so _handleGovernorEvent forwards flood-ticks
    this._runActive = true

    // Create a new AbortController for this run
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    // T-05-04-B: read target from resolver, never from params
    const resolved = this._resolver.getResolvedUser()
    if (resolved === null) {
      this._runActive = false
      this._emit({
        ...this._currentState,
        step: 'idle',
        floodWaitRemaining: null,
      })
      return
    }

    // Get dialogs from enumerator
    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') {
      this._runActive = false
      this._emit({
        ...this._currentState,
        step: 'idle',
        floodWaitRemaining: null,
      })
      return
    }

    // Filter and order dialogs to match the requested dialogIds (preserve checklist order)
    const allDialogs = groupsState.dialogs
    const selectedDialogs = params.dialogIds
      .map(id => allDialogs.find(d => d.id === id))
      .filter((d): d is AdminDialogDTO => d !== undefined)

    const total = selectedDialogs.length
    const targetId = resolved.id.toString()
    // T-05-04-B: identity always from resolver, never renderer
    const targetName = resolved.name ?? ''

    // Reconnect-race idle assertion (CONTEXT §4.3 — Q2 RESOLVED):
    // Assert no tag run is in flight AND no concurrent connect attempt.
    // _runActive is set true at the top of this method — if another execute() call
    // is already in-flight, both will have incremented _generation; only the latest
    // will succeed (earlier gen checks will exit). But we also guard connect() itself
    // so the second concurrent call never issues a second connect.
    if (this._connectingTagClient) {
      this._runActive = false
      this._emit({
        ...this._currentState,
        step: 'idle',
        floodWaitRemaining: null,
      })
      return
    }

    // CR-02: construct a fresh TagClient from the factory (snapshots the CURRENT session,
    // which is only populated post-login; a pre-built instance would carry an empty session).
    const tagClient = this._tagClientFactory()

    // Connect the layer-224 tagClient (brief mutex around the connect window).
    // CR-01: _connectingTagClient is set true BEFORE the try so the finally block can
    // always clear it — even if connect() throws before we get to the post-await reset.
    // The entire connect + run is inside a single try/finally so disconnect() is called
    // on ALL terminal paths (connect throw, hard-stop, abort, complete) with no wedge.
    this._connectingTagClient = true

    // Wrap connect + entire run in try/finally so:
    //   (a) tagClient.disconnect() runs on ALL terminal paths (complete, stopped, hard-stopped, error)
    //   (b) _connectingTagClient and _runActive are always cleared on exit — no permanent wedge
    //       if connect() throws (CR-01).
    try {
      await tagClient.connect()
      this._connectingTagClient = false

      // Initialize job in TagAuditStore
      const jobId = new Date().toISOString()
      const job: TagJobFile = {
        schemaVersion: 1,
        jobId,
        tag: params.tag,
        targetId,
        targetName,
        targetAccessHash: resolved.accessHash.toString(),
        dialogIds: params.dialogIds,
        outcomes: [],
        startedAt: jobId,
        status: 'running',
      }
      this._auditStore.initJob(job)

      // Track outcomes accumulated so far (for state emission)
      const outcomes: TagGroupOutcome[] = []

      // Emit initial running state
      this._emit({
        step: 'running',
        tag: params.tag,
        targetId,
        targetName,
        progress: { processed: 0, total },
        outcomes: [],
        floodWaitRemaining: null,
      })

      for (const dialog of selectedDialogs) {
        // Generation guard #1: top of loop
        if (gen !== this._generation || signal.aborted) {
          const processedIds = new Set(outcomes.map(o => o.dialogId))
          const remainingDialogs = selectedDialogs.filter(d => !processedIds.has(d.id))
          const skippedOutcomes: TagGroupOutcome[] = remainingDialogs.map(d => ({
            dialogId: d.id,
            status: 'skipped' as const,
            timestamp: new Date().toISOString(),
          }))
          for (const skipped of skippedOutcomes) {
            this._auditStore.checkpoint(skipped.dialogId, skipped)
            outcomes.push(skipped)
          }
          this._auditStore.setStatus('stopped')
          this._runActive = false
          this._emit({
            step: 'stopped',
            tag: params.tag,
            targetId,
            targetName,
            progress: { processed: outcomes.filter(o => o.status !== 'skipped').length, total },
            outcomes: [...outcomes],
            summary: this._buildSummary(outcomes, new Date().toISOString()),
            floodWaitRemaining: null,
          })
          return
        }

        // Emit running state with current group before the API call
        this._emit({
          step: 'running',
          tag: params.tag,
          targetId,
          targetName,
          progress: { processed: outcomes.length, total },
          outcomes: [...outcomes],
          currentGroupId: dialog.id,
          floodWaitRemaining: null,
        })

        let outcome: TagGroupOutcome
        try {
          outcome = await this._tagGroup(dialog, resolved, params.tag, tagClient)
        } catch (err) {
          // PEER_FLOOD check MUST come first (Pitfall 1)
          const classified = classifyRpcError(err)
          if (classified.disposition === 'hard-stop') {
            // Hard-stop: do NOT mark remaining groups as skipped (resumable)
            // Do NOT checkpoint the failed group
            this._auditStore.setStatus('hard-stopped')
            this._runActive = false
            this._emit({
              step: 'hard-stopped',
              tag: params.tag,
              targetId,
              targetName,
              progress: { processed: outcomes.length, total },
              outcomes: [...outcomes],
              summary: this._buildSummary(outcomes, new Date().toISOString()),
              floodWaitRemaining: null,
            })
            return
          }
          // Per-group failure isolation: classify and continue
          outcome = this._classifyTagError(err, dialog.id)
        }

        // Generation guard #2: BEFORE checkpoint (Pitfall 7 — gen can change during await _tagGroup)
        if (gen !== this._generation || signal.aborted) {
          const processedIds = new Set(outcomes.map(o => o.dialogId))
          const remainingDialogs = selectedDialogs.filter(d => !processedIds.has(d.id))
          const skippedOutcomes: TagGroupOutcome[] = remainingDialogs.map(d => ({
            dialogId: d.id,
            status: 'skipped' as const,
            timestamp: new Date().toISOString(),
          }))
          for (const skipped of skippedOutcomes) {
            this._auditStore.checkpoint(skipped.dialogId, skipped)
            outcomes.push(skipped)
          }
          this._auditStore.setStatus('stopped')
          this._runActive = false
          this._emit({
            step: 'stopped',
            tag: params.tag,
            targetId,
            targetName,
            progress: { processed: outcomes.filter(o => o.status !== 'skipped').length, total },
            outcomes: [...outcomes],
            summary: this._buildSummary(outcomes, new Date().toISOString()),
            floodWaitRemaining: null,
          })
          return
        }

        // Checkpoint the outcome (BEFORE pacing sleep)
        this._auditStore.checkpoint(dialog.id, outcome)
        outcomes.push(outcome)

        // Inter-group pacing: 2s base + up to 1s jitter (fires AFTER outcome checkpointed)
        await new Promise<void>(r => setTimeout(r, 2000 + Math.random() * 1000))

        // Generation guard #3: after pacing sleep
        if (gen !== this._generation || signal.aborted) {
          const processedIds = new Set(outcomes.map(o => o.dialogId))
          const remainingDialogs = selectedDialogs.filter(d => !processedIds.has(d.id))
          const skippedOutcomes: TagGroupOutcome[] = remainingDialogs.map(d => ({
            dialogId: d.id,
            status: 'skipped' as const,
            timestamp: new Date().toISOString(),
          }))
          for (const skipped of skippedOutcomes) {
            this._auditStore.checkpoint(skipped.dialogId, skipped)
            outcomes.push(skipped)
          }
          this._auditStore.setStatus('stopped')
          this._runActive = false
          this._emit({
            step: 'stopped',
            tag: params.tag,
            targetId,
            targetName,
            progress: { processed: outcomes.filter(o => o.status !== 'skipped').length, total },
            outcomes: [...outcomes],
            summary: this._buildSummary(outcomes, new Date().toISOString()),
            floodWaitRemaining: null,
          })
          return
        }
      }

      // Generation guard #4: post-loop, before emitting complete.
      // WR-01 (accepted as-is): this early return does not reset _runActive or emit 'stopped' —
      // matches RemovalExecutor.ts:343 (the shipped reference). The finally block will reset
      // _connectingTagClient and _runActive unconditionally, so no wedge results.
      if (gen !== this._generation || signal.aborted) {
        return
      }

      const completedAt = new Date().toISOString()
      this._auditStore.setStatus('complete', completedAt)
      this._runActive = false
      this._emit({
        step: 'complete',
        tag: params.tag,
        targetId,
        targetName,
        progress: { processed: outcomes.length, total },
        outcomes: [...outcomes],
        summary: this._buildSummary(outcomes, completedAt),
        floodWaitRemaining: null,
      })
    } finally {
      // CR-01: always clear mutex and run-active flag so future runs are never wedged —
      // this handles the connect() throw path where the normal post-await resets are skipped.
      this._connectingTagClient = false
      this._runActive = false
      // Disconnect on ALL terminal paths (complete, stopped, hard-stopped, error, connect throw)
      await tagClient.disconnect()
    }
  }

  /**
   * Abort the current tag run.
   * Increments generation and aborts the AbortController.
   * The execute() loop detects the increment and emits the authoritative 'stopped' state.
   */
  abortExecution(): void {
    this._generation++
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    // WR-02: for an active run (running/stopping), do NOT emit here — the execute() loop's
    // generation guard will detect the increment and emit the authoritative 'stopped' state.
    // For idle/complete/stopped/hard-stopped: reset to idle immediately (TARGET_RESET path).
    if (this._currentState.step !== 'running' && this._currentState.step !== 'stopping') {
      this._emit({
        step: 'idle',
        tag: '',
        targetId: '',
        targetName: '',
        progress: { processed: 0, total: 0 },
        outcomes: [],
      })
    }
  }

  /** Return the current TagState. */
  getState(): TagState {
    return this._currentState
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Tag the target in a single dialog.
   *
   * Dispatch:
   *   - basic-group: skipped with TAG_UNSUPPORTED_BASIC_GROUP (no API call)
   *   - supergroup/broadcast-channel:
   *     1. GetParticipant pre-flight via main client (already-admin check)
   *     2. tagClient.invoke(editChatParticipantRank) if not admin
   *
   * Critical: tagClient.invoke() is already governor-wrapped — do NOT wrap in governor.run() again.
   */
  private async _tagGroup(
    dialog: AdminDialogDTO,
    resolved: { id: bigint; accessHash: bigint },
    tag: string,
    tagClient: TagClient
  ): Promise<TagGroupOutcome> {
    const timestamp = new Date().toISOString()

    // Step 1: basic-group skip — detect from AdminDialogDTO.type (no API call)
    if (dialog.type === 'basic-group') {
      return {
        dialogId: dialog.id,
        status: 'skipped',
        errorCode: 'TAG_UNSUPPORTED_BASIC_GROUP',
        timestamp,
      }
    }

    // Step 2: build InputPeerChannel from enumerator entity map
    const channelEntity = this._enumerator.getDialogEntity(dialog.id) as {
      id?: { toString(): string }
      accessHash?: { toString(): string }
    } | null

    const channelId = bigInt(channelEntity?.id?.toString() ?? dialog.id)
    const channelAccessHash = channelEntity?.accessHash
      ? bigInt(channelEntity.accessHash.toString())
      : bigInt.zero

    const inputPeer = new Api.InputPeerChannel({ channelId, accessHash: channelAccessHash })
    const inputChannel = new Api.InputChannel({ channelId, accessHash: channelAccessHash })

    // Step 3: build InputPeerUser from resolver (T-05-04-B: never bigInt.zero)
    const inputUser = new Api.InputPeerUser({
      userId: bigInt(resolved.id.toString()),
      accessHash: bigInt(resolved.accessHash.toString()),
    })

    // Step 4: already-admin pre-flight check via main client + governor (NOT tagClient — write-only)
    const participantResult = await this._governor.run(() =>
      this._mainClient.invoke(
        new Api.channels.GetParticipant({ channel: inputChannel, participant: inputUser })
      )
    ) as { participant?: { className?: string } }

    if (participantResult?.participant?.className === 'ChannelParticipantAdmin') {
      return {
        dialogId: dialog.id,
        status: 'skipped',
        errorCode: 'TAG_TARGET_IS_ADMIN',
        timestamp,
      }
    }

    // Step 5: issue editChatParticipantRank — tagClient.invoke() is already governor-wrapped
    // DO NOT wrap in governor.run() again (Pitfall 3)
    await tagClient.invoke(
      makeEditChatParticipantRankRequest(inputPeer, inputUser, tag)
    )

    return { dialogId: dialog.id, status: 'done', timestamp }
  }

  /**
   * Classify a per-group tag error into a TagGroupOutcome.
   *
   * CRITICAL branch order (Pitfall 1): hard-stop re-throw FIRST.
   * For PEER_FLOOD (hard-stop disposition): re-throws so the outer loop handler can exit.
   * For all others: returns a 'failed' outcome with the appropriate TagErrorCode.
   *
   * Uses ONLY shipped TagErrorCode values — no TAG_USER_NOT_PARTICIPANT, TAG_RANK_INVALID,
   * TAG_CHANNEL_PRIVATE.
   */
  private _classifyTagError(err: unknown, dialogId: string): TagGroupOutcome {
    const timestamp = new Date().toISOString()

    // (1) HARD-STOP FIRST — re-throw so execute() catch block handles PEER_FLOOD.
    // Never return an outcome for PEER_FLOOD — it must bubble to the outer catch.
    // WR-03 (accepted defensive depth): the outer catch in execute() pre-filters hard-stop errors
    // before calling _classifyTagError, so this re-throw is normally unreachable. It is kept
    // as defensive depth to satisfy the documented "hard-stop first" contract.
    const classified = classifyRpcError(err)
    if (classified.disposition === 'hard-stop') {
      throw err
    }

    // (2) Named RPC error strings → mapped TagErrorCode
    const msg: string = (err as { errorMessage?: string })?.errorMessage ?? ''

    if (msg === 'CHAT_ADMIN_REQUIRED' || msg === 'RIGHT_FORBIDDEN') {
      return { dialogId, status: 'failed', errorCode: 'TAG_NO_RIGHTS', timestamp }
    }

    if (msg === 'USER_NOT_PARTICIPANT' || msg === 'USER_ID_INVALID') {
      return { dialogId, status: 'failed', errorCode: 'TAG_USER_INVALID', timestamp }
    }

    if (msg === 'CHANNEL_PRIVATE') {
      return { dialogId, status: 'failed', errorCode: 'TAG_CHANNEL_INVALID', timestamp }
    }

    // (3) NETWORK disposition (no errorMessage → connection failure)
    if (classified.disposition === 'retry' || classified.code === 'NETWORK') {
      return { dialogId, status: 'failed', errorCode: 'NETWORK', timestamp }
    }

    // (4) UNKNOWN fallthrough
    return { dialogId, status: 'failed', errorCode: 'UNKNOWN', timestamp }
  }

  /**
   * Build a TagSummary from accumulated outcomes.
   */
  private _buildSummary(
    outcomes: TagGroupOutcome[],
    completedAt: string
  ) {
    return {
      tagged: outcomes.filter(o => o.status === 'done').length,
      skipped: outcomes.filter(o => o.status === 'skipped').length,
      failed: outcomes.filter(o => o.status === 'failed').length,
      completedAt,
    }
  }
}
