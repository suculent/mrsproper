/**
 * TagExecutor — throttled, generation-guarded, tag-write state machine.
 *
 * Mirrors RemovalExecutor's state machine, generation-token guard (D-15), abort semantics,
 * per-group checkpoint ordering, and PEER_FLOOD hard-stop behavior. The per-group write is
 * `tagClient.invoke(makeEditChatParticipantRankRequest(...))` over an isolated layer-224 connection.
 *
 * TWO-PHASE LAYER ISOLATION (root-cause fix for the live "Spojení bylo přerušeno" failure):
 *   A layer-224 connection on the SHARED session upgrades the whole session to layer 224 server-side.
 *   While it is open, the MAIN layer-198 client's responses come back 224-encoded and GramJS (198)
 *   cannot parse them (TypeNotFoundError → misclassified NETWORK). Therefore:
 *     - Phase A: run ALL main-client reads (GetParticipant already-admin checks, basic-group detection)
 *                BEFORE opening the tagClient — session is still 198, responses parse fine.
 *     - Phase B: open the layer-224 tagClient and issue ONLY editChatParticipantRank writes
 *                (their unparseable 224 responses are swallowed in TagClient.invoke).
 *     - Phase C: disconnect the tagClient and restore the main client to layer 198
 *                (restoreMainClientLayer) so subsequent enumeration/removal works again.
 *
 * Critical constraints (enforced):
 *   - No main-client request is issued while the layer-224 tagClient is connected.
 *   - tagClient.invoke() is already governor-wrapped — do NOT double-wrap in governor.run().
 *   - GetParticipant pre-flight goes through main client + governor.run() (Phase A only).
 *   - _classifyTagError() re-throws on hard-stop FIRST (Pitfall 1).
 *   - Generation guard #2 runs BEFORE auditStore.checkpoint() (Pitfall 7).
 *   - tagClient.disconnect() + restoreMainClientLayer() in finally — all terminal paths.
 *   - Only SHIPPED TagErrorCode values used (no TAG_USER_NOT_PARTICIPANT, TAG_RANK_INVALID, TAG_CHANNEL_PRIVATE).
 *   - bigInt(resolved.accessHash.toString()) — never bigInt.zero for target (T-05-04-B).
 *
 * Security:
 *   - T-05-04-B: target identity read from resolver.getResolvedUser() only — never from execute() args.
 *   - T-11-05: PEER_FLOOD hard-stops the run; remaining groups left pending (resumable).
 *   - T-11-06: All D-15 guard checkpoints replicated; guard #2 BEFORE checkpoint (Pitfall 7).
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

// ── Precheck result (Phase A output, consumed by Phase B) ────────────────────
type Precheck =
  // basic-group or already-admin — recorded as a skipped outcome, no write
  | { kind: 'skip'; outcome: TagGroupOutcome }
  // precheck RPC error (non-hard-stop) — recorded as a failed outcome, no write
  | { kind: 'failed'; outcome: TagGroupOutcome }
  // eligible for the tag write — carries the prebuilt input peers
  | { kind: 'write'; inputPeer: Api.InputPeerChannel; inputUser: Api.InputPeerUser }

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
  /** Main layer-198 client — for the already-admin GetParticipant check (Phase A read only). */
  mainClient: { invoke(request: unknown): Promise<unknown> }
  /**
   * Phase C: restore the main client's connection to layer 198 after the layer-224 tag run.
   * Opening the tagClient upgrades the shared session to 224 server-side; without this the
   * main client keeps receiving unparseable 224 responses. Wired in main/index.ts to reconnect
   * the main client (re-sends invokeWithLayer(198)). Optional — omitted in unit tests.
   */
  restoreMainClientLayer?: () => Promise<void>
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
  private readonly _restoreMainClientLayer?: () => Promise<void>
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
    this._restoreMainClientLayer = options.restoreMainClientLayer
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

    // Reconnect-race idle assertion (CONTEXT §4.3): bail if a connect is already in flight.
    if (this._connectingTagClient) {
      this._runActive = false
      this._emit({ ...this._currentState, step: 'idle', floodWaitRemaining: null })
      return
    }

    // Initialize the durable job up front so abort/hard-stop during Phase A is checkpointed.
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

    let tagClient: TagClient | null = null
    let tagClientOpened = false

    try {
      // ───────── PHASE A: pre-scan on the MAIN client (session still layer 198) ─────────
      // No layer-224 connection is open yet, so GetParticipant responses parse correctly.
      const prechecks = new Map<string, Precheck>()
      for (const dialog of selectedDialogs) {
        // Generation/abort guard during pre-scan
        if (gen !== this._generation || signal.aborted) {
          this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
          return
        }
        try {
          prechecks.set(dialog.id, await this._precheckGroup(dialog, resolved))
        } catch (err) {
          // PEER_FLOOD (hard-stop) MUST come first (Pitfall 1) — no tagClient opened yet.
          const classified = classifyRpcError(err)
          if (classified.disposition === 'hard-stop') {
            this._emitHardStopped(outcomes, ctx)
            return
          }
          prechecks.set(dialog.id, { kind: 'failed', outcome: this._classifyTagError(err, dialog.id) })
        }
      }

      // ───────── PHASE B: open the layer-224 tagClient and issue writes only ─────────
      this._connectingTagClient = true
      tagClient = this._tagClientFactory()
      await tagClient.connect()
      tagClientOpened = true
      this._connectingTagClient = false

      for (const dialog of selectedDialogs) {
        // Generation guard #1: top of loop
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

        const pre = prechecks.get(dialog.id)
        let outcome: TagGroupOutcome
        if (!pre || pre.kind === 'skip' || pre.kind === 'failed') {
          // Skipped (basic-group / already-admin) or precheck failure — no write, no API call.
          outcome = pre ? pre.outcome : this._classifyTagError(new Error('missing precheck'), dialog.id)
        } else {
          // Eligible: issue editChatParticipantRank. tagClient.invoke() is already governor-wrapped.
          try {
            await tagClient.invoke(
              makeEditChatParticipantRankRequest(pre.inputPeer, pre.inputUser, params.tag)
            )
            outcome = { dialogId: dialog.id, status: 'done', timestamp: new Date().toISOString() }
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
        }

        // Generation guard #2: BEFORE checkpoint (Pitfall 7 — gen can change during await)
        if (gen !== this._generation || signal.aborted) {
          this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
          return
        }

        // Checkpoint the outcome (BEFORE pacing sleep)
        this._auditStore.checkpoint(dialog.id, outcome)
        outcomes.push(outcome)

        // Inter-group pacing: 2s base + up to 1s jitter (fires AFTER outcome checkpointed)
        await new Promise<void>(r => setTimeout(r, 2000 + Math.random() * 1000))

        // Generation guard #3: after pacing sleep
        if (gen !== this._generation || signal.aborted) {
          this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
          return
        }
      }

      // Generation guard #4: post-loop, before emitting complete. (finally still resets flags.)
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
      // CR-01: always clear mutex + run-active so future runs are never wedged.
      this._connectingTagClient = false
      this._runActive = false
      // Phase C: tear down the layer-224 connection and restore the main client to layer 198.
      // Only needed when we actually opened the tagClient (Phase A failures never went to 224).
      if (tagClientOpened && tagClient) {
        try {
          await tagClient.disconnect()
        } catch {
          /* best-effort teardown */
        }
        if (this._restoreMainClientLayer) {
          try {
            await this._restoreMainClientLayer()
          } catch {
            /* best-effort layer restore — main client will renegotiate on its next reconnect */
          }
        }
      }
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
   * Phase A pre-check for a single dialog — MAIN client only (no layer-224 connection open).
   *   - basic-group: skip with TAG_UNSUPPORTED_BASIC_GROUP (no API call)
   *   - supergroup/broadcast-channel: GetParticipant (governor-wrapped, main client);
   *       ChannelParticipantAdmin → skip with TAG_TARGET_IS_ADMIN; otherwise eligible for the write.
   * Builds the InputPeerChannel + InputPeerUser used later by the Phase B write.
   * May throw (RPC error) — the caller classifies it (hard-stop vs per-group failure).
   */
  private async _precheckGroup(
    dialog: AdminDialogDTO,
    resolved: { id: bigint; accessHash: bigint }
  ): Promise<Precheck> {
    const timestamp = new Date().toISOString()

    // basic-group skip — detect from AdminDialogDTO.type (no API call)
    if (dialog.type === 'basic-group') {
      return {
        kind: 'skip',
        outcome: { dialogId: dialog.id, status: 'skipped', errorCode: 'TAG_UNSUPPORTED_BASIC_GROUP', timestamp },
      }
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

    // Already-admin pre-flight via the MAIN client + governor (NOT tagClient — and Phase A only,
    // so the session is still layer 198 and the response parses correctly).
    const participantResult = (await this._governor.run(() =>
      this._mainClient.invoke(
        new Api.channels.GetParticipant({ channel: inputChannel, participant: inputUser })
      )
    )) as { participant?: { className?: string } }

    if (participantResult?.participant?.className === 'ChannelParticipantAdmin') {
      return {
        kind: 'skip',
        outcome: { dialogId: dialog.id, status: 'skipped', errorCode: 'TAG_TARGET_IS_ADMIN', timestamp },
      }
    }

    return { kind: 'write', inputPeer, inputUser }
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

    // (4) UNKNOWN fallthrough
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
