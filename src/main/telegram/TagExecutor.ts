/**
 * TagExecutor — throttled, generation-guarded, tag-write state machine.
 *
 * Mirrors RemovalExecutor's state machine, generation-token guard (D-15), abort semantics,
 * per-group checkpoint ordering, and PEER_FLOOD hard-stop behavior. The per-group write issues
 * `Api.messages.EditChatParticipantRank` directly on the single shared main client through
 * `governor.run()` — no second client, no connect/disconnect lifecycle, and no TL-layer
 * mutation (D-10). The whole GramJS package now speaks TL layer 229 ambiently, so the
 * two-phase, dual-connection TL-layer isolation this class previously required is no longer needed.
 *
 * Security:
 *   - T-05-04-B: target identity read from resolver.getResolvedUser() only — never from execute() args.
 *   - T-11-05: PEER_FLOOD hard-stops the run; remaining groups left pending (resumable).
 *   - T-11-06: All D-15 guard checkpoints replicated; guard #2 BEFORE checkpoint (Pitfall 7).
 *   - Only SHIPPED TagErrorCode values used (no TAG_USER_NOT_PARTICIPANT, TAG_RANK_INVALID, TAG_CHANNEL_PRIVATE).
 *   - bigInt(resolved.accessHash.toString()) — never bigInt.zero for target (T-05-04-B).
 *   - D-11: a parse failure on the EditChatParticipantRank write is NOT swallowed as success —
 *     any thrown error falls straight into _classifyTagError, which already falls through to
 *     UNKNOWN for unrecognized errors. No "unparseable response = success" tolerance exists.
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

// ── Injectable client interface ────────────────────────────────────────────

export interface TagExecutorClient {
  invoke(request: unknown): Promise<unknown>
}

// ── Constructor options ─────────────────────────────────────────────────────

export interface TagExecutorOptions {
  /** The single shared main TelegramClient (real or mock). */
  client: TagExecutorClient
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
  private readonly _client: TagExecutorClient
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

  constructor(options: TagExecutorOptions) {
    this._client = options.client
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
   * Security (T-05-04-B): reads target from this._resolver.getResolvedUser() — NO renderer
   * payload is accepted for target identity. The IPC payload carries only dialogIds and tag.
   *
   * D-15: increments _generation at the start; each loop iteration checks if generation has been
   * superseded (by a newer execute() or abortExecution()) and exits early.
   */
  async execute(params: { dialogIds: string[]; tag: string }): Promise<void> {
    // D-15: increment generation to invalidate any prior in-flight run
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

    const allDialogs = groupsState.dialogs
    const selectedDialogs = params.dialogIds
      .map(id => allDialogs.find(d => d.id === id))
      .filter((d): d is AdminDialogDTO => d !== undefined)

    const total = selectedDialogs.length
    const targetId = resolved.id.toString()
    const targetName = resolved.name ?? '' // T-05-04-B: identity always from resolver
    const ctx = { tag: params.tag, targetId, targetName, total }

    // Initialize the durable job up front so abort/hard-stop mid-run is checkpointed.
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
      // Generation/abort guard: top of loop
      if (gen !== this._generation || signal.aborted) {
        this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
        return
      }

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
        outcome = await this._tagGroup(dialog, resolved, params.tag)
      } catch (err) {
        // PEER_FLOOD check MUST come first (Pitfall 1)
        const classified = classifyRpcError(err)
        if (classified.disposition === 'hard-stop') {
          // Hard-stop: remaining groups left pending (NOT skipped); failed group not checkpointed.
          this._emitHardStopped(outcomes, ctx)
          return
        }
        outcome = this._classifyTagError(err, dialog.id)
      }

      // Generation guard: BEFORE checkpoint (Pitfall 7 — gen can change during await)
      if (gen !== this._generation || signal.aborted) {
        this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
        return
      }

      // Checkpoint the outcome (BEFORE pacing sleep)
      this._auditStore.checkpoint(dialog.id, outcome)
      outcomes.push(outcome)

      // Inter-group pacing: 2s base + up to 1s jitter (fires AFTER outcome checkpointed)
      await new Promise<void>(r => setTimeout(r, 2000 + Math.random() * 1000))

      // Generation guard: after pacing sleep
      if (gen !== this._generation || signal.aborted) {
        this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
        return
      }
    }

    // Generation guard: post-loop, before emitting complete.
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
   * Tag a single dialog using the correct mechanic.
   *   - basic-group: skip with TAG_UNSUPPORTED_BASIC_GROUP (no API call)
   *   - supergroup/broadcast-channel: GetParticipant precheck (governor-wrapped, shared client);
   *       ChannelParticipantAdmin → skip with TAG_TARGET_IS_ADMIN; otherwise issue
   *       EditChatParticipantRank (governor-wrapped, shared client).
   * May throw (RPC error) — the caller classifies it (hard-stop vs per-group failure).
   */
  private async _tagGroup(
    dialog: AdminDialogDTO,
    resolved: { id: bigint; accessHash: bigint },
    tag: string
  ): Promise<TagGroupOutcome> {
    const timestamp = new Date().toISOString()

    // basic-group skip — detect from AdminDialogDTO.type (no API call)
    if (dialog.type === 'basic-group') {
      return { dialogId: dialog.id, status: 'skipped', errorCode: 'TAG_UNSUPPORTED_BASIC_GROUP', timestamp }
    }

    // Build InputPeerChannel / InputChannel from the enumerator entity map
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

    // Build InputPeerUser from resolver (T-05-04-B: never bigInt.zero)
    const inputUser = new Api.InputPeerUser({
      userId: bigInt(resolved.id.toString()),
      accessHash: bigInt(resolved.accessHash.toString()),
    })

    // Already-admin pre-flight via the shared client + governor.
    const participantResult = (await this._governor.run(() =>
      this._client.invoke(
        new Api.channels.GetParticipant({ channel: inputChannel, participant: inputUser })
      )
    )) as { participant?: { className?: string } }

    if (participantResult?.participant?.className === 'ChannelParticipantAdmin') {
      return { dialogId: dialog.id, status: 'skipped', errorCode: 'TAG_TARGET_IS_ADMIN', timestamp }
    }

    // Eligible: issue EditChatParticipantRank on the shared client + governor.
    // D-11: no catch here — any thrown error (including an unparseable response) propagates
    // to the caller's try/catch and is classified by _classifyTagError (falls through to UNKNOWN).
    await this._governor.run(() =>
      this._client.invoke(
        new Api.messages.EditChatParticipantRank({ peer: inputPeer, participant: inputUser, rank: tag })
      )
    )

    return { dialogId: dialog.id, status: 'done', timestamp }
  }

  /**
   * Mark all not-yet-processed dialogs as skipped, persist, and emit the authoritative
   * 'stopped' state. Used by the generation/abort guards.
   */
  private _markRemainingSkippedAndStop(
    selectedDialogs: AdminDialogDTO[],
    outcomes: TagGroupOutcome[],
    ctx: { tag: string; targetId: string; targetName: string; total: number }
  ): void {
    const processedIds = new Set(outcomes.map(o => o.dialogId))
    const remaining = selectedDialogs.filter(d => !processedIds.has(d.id))
    for (const d of remaining) {
      const skipped: TagGroupOutcome = {
        dialogId: d.id,
        status: 'skipped',
        timestamp: new Date().toISOString(),
      }
      this._auditStore.checkpoint(skipped.dialogId, skipped)
      outcomes.push(skipped)
    }
    this._auditStore.setStatus('stopped')
    this._runActive = false
    this._emit({
      step: 'stopped',
      tag: ctx.tag,
      targetId: ctx.targetId,
      targetName: ctx.targetName,
      progress: { processed: outcomes.filter(o => o.status !== 'skipped').length, total: ctx.total },
      outcomes: [...outcomes],
      summary: this._buildSummary(outcomes, new Date().toISOString()),
      floodWaitRemaining: null,
    })
  }

  /**
   * PEER_FLOOD hard-stop: remaining groups left pending (NOT skipped), run resumable.
   */
  private _emitHardStopped(
    outcomes: TagGroupOutcome[],
    ctx: { tag: string; targetId: string; targetName: string; total: number }
  ): void {
    this._auditStore.setStatus('hard-stopped')
    this._runActive = false
    this._emit({
      step: 'hard-stopped',
      tag: ctx.tag,
      targetId: ctx.targetId,
      targetName: ctx.targetName,
      progress: { processed: outcomes.length, total: ctx.total },
      outcomes: [...outcomes],
      summary: this._buildSummary(outcomes, new Date().toISOString()),
      floodWaitRemaining: null,
    })
  }

  /**
   * Classify a per-group tag error into a TagGroupOutcome.
   *
   * CRITICAL branch order (Pitfall 1): hard-stop re-throw FIRST.
   * Uses ONLY shipped TagErrorCode values.
   */
  private _classifyTagError(err: unknown, dialogId: string): TagGroupOutcome {
    const timestamp = new Date().toISOString()

    // (1) HARD-STOP FIRST — re-throw so the caller handles PEER_FLOOD.
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

    // (4) UNKNOWN fallthrough — also covers an unparseable/unrecognized response (D-11)
    return { dialogId, status: 'failed', errorCode: 'UNKNOWN', timestamp }
  }

  /**
   * Build a TagSummary from accumulated outcomes.
   */
  private _buildSummary(outcomes: TagGroupOutcome[], completedAt: string) {
    return {
      tagged: outcomes.filter(o => o.status === 'done').length,
      skipped: outcomes.filter(o => o.status === 'skipped').length,
      failed: outcomes.filter(o => o.status === 'failed').length,
      completedAt,
    }
  }
}
