/**
 * RemovalExecutor — throttled, type-branching, generation-guarded state machine
 * for removing the target from each selected group.
 *
 * Owns:
 *   - Iterating selected dialogs from GroupEnumerator (in checklist order)
 *   - Per-group removal dispatch: correct GramJS mechanic by type + severity
 *     - supergroup/channel: channels.EditBanned (ban = 1 call, kick = 2 calls + 500ms sleep)
 *     - basic-group: messages.DeleteChatUser (always, regardless of severity)
 *   - Per-group failure isolation: USER_ADMIN_INVALID / CHAT_ADMIN_REQUIRED → continue
 *   - PEER_FLOOD hard-stop: exits loop immediately, remaining groups NOT marked skipped
 *   - Abort (abortExecution): current call finishes, remaining groups marked skipped
 *   - Generation-token pattern (D-15): incremented on execute() and abortExecution()
 *   - Per-group outcome checkpointed in AuditStore before moving to next group
 *   - Inter-group pacing: 2s base + up to 1s jitter between groups
 *
 * Security:
 *   - T-05-04-B: target accessHash read from resolver.getResolvedUser() only
 *   - T-05-04-A: revokeHistory intentionally absent from DeleteChatUser call
 *   - T-05-04-C: PEER_FLOOD hard-stop — loop exits, no ordinary failure recorded
 *   - T-05-04-D: generation guard invalidates stale retries (TARGET_RESET mid-run)
 *
 * All Telegram API calls route through _governor.run() (mirrors MembershipScanner/GroupEnumerator).
 *
 * CRITICAL ANTI-PATTERNS (must not appear):
 *   - NEVER call client.kickParticipant() — always client.invoke() directly
 *   - NEVER pass bigInt.zero as accessHash for the removal target
 *   - NEVER set revokeHistory: true in DeleteChatUser
 *   - NEVER call both EditBanned calls inside a single governor.run()
 *   - NEVER fire inter-group pacing BETWEEN the two kick calls
 */

import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { RemovalState, RemovalGroupOutcome, RemovalJobFile } from '@shared/removalTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import type { GroupEnumerator } from './GroupEnumerator'
import type { AuditStore } from '../storage/auditStore'
import { classifyRpcError } from './operationErrors'
import type { GovernorEvent } from '@shared/opTypes'

// ── Injectable client interface ────────────────────────────────────────────

export interface RemovalExecutorClient {
  invoke(request: unknown): Promise<unknown>
}

// ── Constructor options ─────────────────────────────────────────────────────

export interface RemovalExecutorOptions {
  /** The TelegramClient (real or mock). */
  client: RemovalExecutorClient
  /** Shared account-wide RateLimitGovernor — all Telegram calls must go through it. */
  governor: RateLimitGovernor
  /** GroupEnumerator — provides dialog list and entity map. */
  enumerator: GroupEnumerator
  /** TargetResolver — provides resolved user id, accessHash, and display name (main only, never renderer). */
  resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string } | null }
  /** AuditStore — durable job-file persistence (checkpointed after every group). */
  auditStore: AuditStore
  /** Called whenever RemovalState changes. Wired to win.webContents.send in production. */
  onStateChange: (state: RemovalState) => void
}

// ── RemovalExecutor ─────────────────────────────────────────────────────────

export class RemovalExecutor {
  private readonly _client: RemovalExecutorClient
  private readonly _governor: RateLimitGovernor
  private readonly _enumerator: GroupEnumerator
  private readonly _resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string } | null }
  private readonly _auditStore: AuditStore
  private readonly _emit: (state: RemovalState) => void

  private _currentState: RemovalState = {
    step: 'idle',
    severity: 'ban',
    targetId: '',
    targetName: '',
    progress: { processed: 0, total: 0 },
    outcomes: [],
  }

  /** Generation token (D-15): incremented on execute() and abortExecution() to invalidate prior in-flight work. */
  private _generation = 0
  private _abortController: AbortController | null = null
  /** True while a removal run is active — gates flood-tick forwarding (T-06-02-04). */
  private _runActive = false

  constructor(options: RemovalExecutorOptions) {
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
   * Captures flood-tick events during a removal run and emits them as floodWaitRemaining
   * on RemovalState — scoped to removal-only flood events (RESEARCH Pitfall 6 / T-06-02-04).
   *
   * No-op when _runActive is false so that target-resolution and name-search governor
   * events never leak into the removal state machine.
   */
  _handleGovernorEvent(event: GovernorEvent): void {
    if (!this._runActive) return
    if (event.type === 'flood-tick') {
      this._emit({ ...this._currentState, floodWaitRemaining: event.remaining })
    }
  }

  /**
   * Execute the removal run across the specified dialog IDs.
   *
   * Security (T-05-04-B): reads target from this._resolver.getResolvedUser() — NO renderer
   * payload is accepted for target identity. The IPC payload carries only dialogIds.
   *
   * D-15: increments _generation at the start; each loop iteration checks if generation
   * has been superseded (by a newer execute() or abortExecution()) and exits early.
   */
  async execute(params: { severity: 'kick' | 'ban'; dialogIds: string[] }): Promise<void> {
    // D-15: increment generation to invalidate any prior in-flight run
    const gen = ++this._generation
    // Phase 6 flood plumbing: mark run active so _handleGovernorEvent forwards flood-ticks
    this._runActive = true

    // Create a new AbortController for this run
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    // Read target from resolver (T-05-04-B: never from renderer payload)
    const resolved = this._resolver.getResolvedUser()
    if (resolved === null) {
      this._runActive = false
      this._emit({
        ...this._currentState,
        step: 'idle',
        severity: params.severity,
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
        severity: params.severity,
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
    // CR-02: read display name from resolver (T-05-04-B: identity always from main, never renderer)
    const targetName = resolved.name ?? ''

    // Initialize job in AuditStore
    const jobId = new Date().toISOString()
    const job: RemovalJobFile = {
      schemaVersion: 1,
      jobId,
      severity: params.severity,
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
    const outcomes: RemovalGroupOutcome[] = []

    // Emit initial running state
    this._emit({
      step: 'running',
      severity: params.severity,
      targetId,
      targetName,
      progress: { processed: 0, total },
      outcomes: [],
    })

    for (const dialog of selectedDialogs) {
      // D-15: check if this run has been superseded or aborted
      if (gen !== this._generation || signal.aborted) {
        // Mark remaining groups as skipped
        const processedIds = new Set(outcomes.map(o => o.dialogId))
        const remainingDialogs = selectedDialogs.filter(d => !processedIds.has(d.id))
        const skippedOutcomes: RemovalGroupOutcome[] = remainingDialogs.map(d => ({
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
          severity: params.severity,
          targetId,
          targetName,
          progress: { processed: outcomes.filter(o => o.status !== 'skipped').length, total },
          outcomes: [...outcomes],
          summary: this._buildSummary(outcomes, new Date().toISOString()),
          floodWaitRemaining: null,
        })
        return
      }

      // Emit running state with current group before the API call (EXE-04).
      // floodWaitRemaining is reset to null here so the renderer clears any
      // prior flood countdown after each group's governor.run() resolves (SAF-02).
      this._emit({
        step: 'running',
        severity: params.severity,
        targetId,
        targetName,
        progress: { processed: outcomes.length, total },
        outcomes: [...outcomes],
        currentGroupId: dialog.id,
        floodWaitRemaining: null,
      })

      let outcome: RemovalGroupOutcome
      try {
        outcome = await this._removeFromGroup(dialog, resolved, params.severity)
      } catch (err) {
        // Check for PEER_FLOOD hard-stop first
        const classified = classifyRpcError(err)
        if (classified.disposition === 'hard-stop') {
          // Hard-stop: do NOT mark remaining groups as skipped (resumable)
          // Do NOT checkpoint the failed group either
          this._auditStore.setStatus('hard-stopped')
          this._runActive = false
          this._emit({
            step: 'hard-stopped',
            severity: params.severity,
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
        outcome = this._classifyRemovalError(err, dialog.id)
      }

      // Pitfall 7: gen guard BEFORE checkpoint — if generation changed during await, skip checkpoint
      if (gen !== this._generation || signal.aborted) {
        // Mark remaining groups as skipped
        const processedIds = new Set(outcomes.map(o => o.dialogId))
        const remainingDialogs = selectedDialogs.filter(d => !processedIds.has(d.id))
        const skippedOutcomes: RemovalGroupOutcome[] = remainingDialogs.map(d => ({
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
          severity: params.severity,
          targetId,
          targetName,
          progress: { processed: outcomes.filter(o => o.status !== 'skipped').length, total },
          outcomes: [...outcomes],
          summary: this._buildSummary(outcomes, new Date().toISOString()),
          floodWaitRemaining: null,
        })
        return
      }

      // Checkpoint the outcome
      this._auditStore.checkpoint(dialog.id, outcome)
      outcomes.push(outcome)

      // Inter-group pacing: 2s base + up to 1s jitter (fires AFTER outcome checkpointed)
      await new Promise<void>(r => setTimeout(r, 2000 + Math.random() * 1000))

      // D-15: re-check after pacing sleep
      if (gen !== this._generation || signal.aborted) {
        // Mark remaining groups as skipped
        const processedIds = new Set(outcomes.map(o => o.dialogId))
        const remainingDialogs = selectedDialogs.filter(d => !processedIds.has(d.id))
        const skippedOutcomes: RemovalGroupOutcome[] = remainingDialogs.map(d => ({
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
          severity: params.severity,
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

    // D-15: final check before emitting complete
    if (gen !== this._generation || signal.aborted) {
      return
    }

    const completedAt = new Date().toISOString()
    this._auditStore.setStatus('complete', completedAt)
    this._runActive = false
    this._emit({
      step: 'complete',
      severity: params.severity,
      targetId,
      targetName,
      progress: { processed: outcomes.length, total },
      outcomes: [...outcomes],
      summary: this._buildSummary(outcomes, completedAt),
      floodWaitRemaining: null,
    })
  }

  /**
   * Abort the current removal run.
   * Increments generation and aborts the AbortController.
   * The abortExecution caller is responsible for remaining groups getting marked skipped
   * (the execute() loop checks the generation guard and handles it).
   *
   * Per PATTERNS.md: emit 'stopped' (not 'idle') — job is resumable.
   */
  abortExecution(): void {
    this._generation++
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    // WR-02: for an active run (running/stopping), do NOT emit here — the execute() loop's
    // generation guard will detect the increment, mark remaining groups skipped, and emit
    // the authoritative 'stopped' state with correct outcomes. Emitting here too would
    // produce a double-emit with potentially stale outcomes (the loop may have added
    // outcomes after the last _emit() call).
    //
    // For idle/complete/stopped/hard-stopped: reset to idle immediately (TARGET_RESET path).
    // Aborting a non-active executor must not leave a phantom 'stopped' summary band.
    if (this._currentState.step !== 'running' && this._currentState.step !== 'stopping') {
      this._emit({
        step: 'idle',
        severity: this._currentState.severity,
        targetId: '',
        targetName: '',
        progress: { processed: 0, total: 0 },
        outcomes: [],
      })
    }
    // For active runs: the execute() loop handles the 'stopped' emission
  }

  /**
   * Re-run removal for a single group.
   * Available when step is 'complete', 'stopped', or 'hard-stopped'.
   * WR-04: 'hard-stopped' is included so failed-group retries are functional after
   * a PEER_FLOOD pause (groups processed before the flood may have failed).
   * Generation-guarded (CR-02): captures gen before the async gap, guards after.
   */
  async retryGroup(dialogId: string): Promise<void> {
    if (
      this._currentState.step !== 'complete' &&
      this._currentState.step !== 'stopped' &&
      this._currentState.step !== 'hard-stopped'
    ) {
      return
    }

    // CR-02: capture generation token BEFORE the async gap
    const gen = this._generation

    const resolved = this._resolver.getResolvedUser()
    if (resolved === null) return

    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') return

    const dialog = groupsState.dialogs.find(d => d.id === dialogId)
    if (!dialog) return

    const severity = this._currentState.severity

    let newOutcome: RemovalGroupOutcome
    try {
      newOutcome = await this._removeFromGroup(dialog, resolved, severity)
    } catch (err) {
      newOutcome = this._classifyRemovalError(err, dialogId)
    }

    // CR-02: generation guard AFTER await, BEFORE updating state
    if (gen !== this._generation) return
    if (
      this._currentState.step !== 'complete' &&
      this._currentState.step !== 'stopped' &&
      this._currentState.step !== 'hard-stopped'
    ) {
      return
    }

    // Checkpoint the retry outcome
    this._auditStore.checkpoint(dialogId, newOutcome)

    // Merge updated outcome into current state's outcomes array
    const updatedOutcomes = this._currentState.outcomes.map(o =>
      o.dialogId === dialogId ? { ...o, ...newOutcome, dialogId } : o
    )

    const current = this._currentState
    this._emit({
      ...current,
      outcomes: updatedOutcomes,
      summary: this._buildSummary(updatedOutcomes, new Date().toISOString()),
    })
  }

  /** Return the current RemovalState. */
  getState(): RemovalState {
    return this._currentState
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Remove the target from a single dialog using the correct mechanic.
   *
   * Dispatch:
   *   - basic-group: messages.DeleteChatUser (always, regardless of severity)
   *     - ban on basic group: records note='basic-group-ban-fallback' (T-05-04-A)
   *     - revokeHistory is intentionally NOT set
   *   - supergroup | broadcast-channel: channels.EditBanned
   *     - ban: single EditBanned(viewMessages=true, untilDate=0)
   *     - kick: EditBanned(restrict) → sleep(500ms) → EditBanned(unban, empty rights)
   *
   * Entity accessHash extracted via duck-typed getDialogEntity() (PATTERNS.md line 177).
   *
   * ANTI-PATTERN GUARDS:
   *   - NEVER use client.kickParticipant() — always client.invoke() directly
   *   - NEVER pass bigInt.zero for target accessHash — use resolved.accessHash
   *   - NEVER set revokeHistory: true in DeleteChatUser
   *   - NEVER call both EditBanned in a single governor.run()
   *   - NEVER fire pacing BETWEEN the two kick calls
   */
  private async _removeFromGroup(
    dialog: AdminDialogDTO,
    resolved: { id: bigint; accessHash: bigint },
    severity: 'kick' | 'ban'
  ): Promise<RemovalGroupOutcome> {
    const timestamp = new Date().toISOString()

    // Construct InputPeerUser from resolver — T-05-04-B: never bigInt.zero
    const inputUser = new Api.InputPeerUser({
      userId: bigInt(resolved.id.toString()),
      accessHash: bigInt(resolved.accessHash.toString()),
    })

    if (dialog.type === 'basic-group') {
      // Basic group: messages.DeleteChatUser (ban semantics not available → fallback)
      // T-05-04-A: revokeHistory intentionally absent
      const entity = this._enumerator.getDialogEntity(dialog.id) as {
        id?: { toString(): string }
      } | null
      const chatId = entity?.id
        ? bigInt(entity.id.toString())
        : bigInt(dialog.id)

      await this._governor.run(() =>
        this._client.invoke(
          new Api.messages.DeleteChatUser({
            chatId,
            userId: inputUser,
            // revokeHistory: intentionally NOT set (T-05-04-A security invariant)
          })
        )
      )

      return {
        dialogId: dialog.id,
        status: 'done',
        note: severity === 'ban' ? 'basic-group-ban-fallback' : null,
        timestamp,
      }
    }

    if (dialog.type === 'supergroup' || dialog.type === 'broadcast-channel') {
      // Supergroup/channel: channels.EditBanned
      // Extract entity id+accessHash via duck-typed entity map (PATTERNS.md line 177)
      const channelEntity = this._enumerator.getDialogEntity(dialog.id) as {
        id?: { toString(): string; value?: unknown }
        accessHash?: { toString(): string; value?: unknown }
      } | null

      const channelId = bigInt(channelEntity?.id?.toString() ?? dialog.id)
      const channelAccessHash = channelEntity?.accessHash
        ? bigInt(channelEntity.accessHash.toString())
        : bigInt.zero

      const inputChannel = new Api.InputChannel({
        channelId,
        accessHash: channelAccessHash,
      })

      if (severity === 'ban') {
        // Ban: single EditBanned call with viewMessages=true, untilDate=0 (permanent)
        await this._governor.run(() =>
          this._client.invoke(
            new Api.channels.EditBanned({
              channel: inputChannel,
              participant: inputUser,
              bannedRights: new Api.ChatBannedRights({
                viewMessages: true,
                untilDate: 0,
              }),
            })
          )
        )
      } else {
        // Kick: two EditBanned calls with 500ms sleep between them
        // Call 1: restrict (viewMessages=true, untilDate=0)
        await this._governor.run(() =>
          this._client.invoke(
            new Api.channels.EditBanned({
              channel: inputChannel,
              participant: inputUser,
              bannedRights: new Api.ChatBannedRights({
                viewMessages: true,
                untilDate: 0,
              }),
            })
          )
        )

        // 500ms sleep between the two kick calls (NOT pacing — this is part of the kick mechanic)
        await new Promise<void>(r => setTimeout(r, 500))

        // Call 2: unban (empty rights — all flags omitted/false, untilDate=0)
        await this._governor.run(() =>
          this._client.invoke(
            new Api.channels.EditBanned({
              channel: inputChannel,
              participant: inputUser,
              bannedRights: new Api.ChatBannedRights({
                untilDate: 0,
                // All ban flags omitted → all default to false (unban)
              }),
            })
          )
        )
      }

      return {
        dialogId: dialog.id,
        status: 'done',
        note: null,
        timestamp,
      }
    }

    // Unknown type — defensive throw
    throw new Error(`RemovalExecutor: unknown dialog type '${(dialog as { type: string }).type}'`)
  }

  /**
   * Classify a per-group removal error into a RemovalGroupOutcome.
   *
   * Maps known Telegram error strings to typed RmvErrorCode values.
   * For PEER_FLOOD (hard-stop disposition): re-throws so the outer loop handler can exit.
   * For all others: returns a 'failed' outcome with the appropriate code.
   */
  private _classifyRemovalError(err: unknown, dialogId: string): RemovalGroupOutcome {
    const timestamp = new Date().toISOString()
    const msg: string = (err as { errorMessage?: string })?.errorMessage ?? ''

    if (msg === 'USER_NOT_PARTICIPANT') {
      return { dialogId, status: 'already-gone', timestamp }
    }

    if (msg === 'USER_ADMIN_INVALID') {
      return { dialogId, status: 'failed', errorCode: 'RMV_TARGET_IS_ADMIN', timestamp }
    }

    if (msg === 'CHAT_ADMIN_REQUIRED') {
      return { dialogId, status: 'failed', errorCode: 'RMV_NO_RIGHTS', timestamp }
    }

    if (msg === 'USER_ID_INVALID') {
      return { dialogId, status: 'failed', errorCode: 'RMV_USER_INVALID', timestamp }
    }

    if (msg === 'CHANNEL_PRIVATE') {
      return { dialogId, status: 'failed', errorCode: 'RMV_CHANNEL_PRIVATE', timestamp }
    }

    // Fall through to classifyRpcError for PEER_FLOOD / FLOOD_WAIT / NETWORK
    const classified = classifyRpcError(err)
    if (classified.disposition === 'hard-stop') {
      // Re-throw — outer execute() catch block handles PEER_FLOOD
      throw err
    }

    if (classified.disposition === 'retry' || classified.code === 'NETWORK') {
      return { dialogId, status: 'failed', errorCode: 'NETWORK', timestamp }
    }

    return { dialogId, status: 'failed', errorCode: 'UNKNOWN', timestamp }
  }

  /**
   * Build a RemovalSummary from accumulated outcomes.
   */
  private _buildSummary(
    outcomes: RemovalGroupOutcome[],
    completedAt: string
  ) {
    return {
      removed: outcomes.filter(o => o.status === 'done').length,
      alreadyGone: outcomes.filter(o => o.status === 'already-gone').length,
      failed: outcomes.filter(o => o.status === 'failed').length,
      skipped: outcomes.filter(o => o.status === 'skipped').length,
      completedAt,
    }
  }
}
