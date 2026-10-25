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
 * D-20 (continuation-based resume, Plan 14-09): execute() checks the on-disk job via
 * auditStore.readJob(); when params.resume is true AND that job is non-complete AND its
 * targetId + dialogId set (sameDialogIdSet) match this call, the SAME jobId and its seeded
 * outcomes are reused (no initJob() call) — otherwise a fresh job is minted exactly as
 * before. 'skipped' outcomes left behind by a prior abort/hard-stop are excluded from the
 * seeded set so the resumed segment actually reprocesses them.
 *
 * D-13/D-14 (end-of-run DM, Plan 14-09): once the loop reaches 'complete' (never on
 * stopped/hard-stopped), any privacy-blocked link older than 5 days is regenerated, then
 * exactly one messages.SendMessage carries every accumulated link across every segment.
 * A privacy/block refusal sets dmStatus:'refused' without clearing the outcomes/links;
 * zero links means dmStatus:'not-needed' and no SendMessage call.
 *
 * D-17/D-18 (add-log append, Plan 14-09): addLogStore.appendBlock() is called exactly once
 * per terminal 'complete', never on stopped/hard-stopped, with isFollowUp set from the D-20
 * continuation decision.
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
import { randomBytes } from 'node:crypto'
import { Api } from 'telegram'
import type { AddState, AddGroupOutcome, AddJobFile, AddSummary, AddDmStatus, AddLogBlockEntry } from '@shared/addTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import type { GroupEnumerator } from './GroupEnumerator'
import { type AddAuditStore, sameDialogIdSet } from '../storage/addAuditStore'
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
  /** Add-log store — appendBlock() is called once per terminal 'complete' (D-17/D-18). */
  addLogStore: { appendBlock(entry: AddLogBlockEntry): void }
  /** DM text renderer — builds the end-of-run DM body from the target name + links (D-15). */
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
  private readonly _addLogStore: { appendBlock(entry: AddLogBlockEntry): void }
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
  /** Set by resetForSessionWipe(); makes an aborted in-flight loop inert (no audit writes / 'stopped' emit). */
  private _wiped = false
  /** True while an add run is active — gates flood-tick forwarding. */
  private _runActive = false
  /** Target rebuilt/resolved for the active run; lets retryGroup work after a relaunch resume. */
  private _resolvedTarget: ResolvedAddUser | null = null
  /** Dialog ids of the active job, merged into emitted AddState (D-16). */
  private _jobDialogIds: string[] | null = null
  /** WR-04: number of retryGroup() calls currently awaiting Telegram. */
  private _retriesInFlight = 0
  // WR-02 (iter 2): dialog ids with a retry still awaiting Telegram — a second retry of the
  // same row (double-click, click during a FLOOD_WAIT) is refused so the target never gets
  // two different invite links / two DMs for one group.
  private readonly _retryingDialogIds = new Set<string>()

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
      if (this._jobDialogIds !== null && state.dialogIds === undefined && state.step !== 'idle') {
        state = { ...state, dialogIds: this._jobDialogIds }
      }
      this._currentState = state
      options.onStateChange(state)
    }
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
   * D-07 (narrow rule), ADD_START semantics: ADD_START always means "start what the admin
   * reviewed". 'resume' = the confirmed target owns the non-complete job A (same id) — the
   * continuation gate in execute() then decides by dialog-id set; 'fresh' = start a new job
   * (replacing any leftover file); 'reject' = never act (job untouched, no RPC).
   *
   * A different identity is never treated as a resume. It is rejected only while the executor
   * still holds a live in-memory job (non-idle). With no resolver target ADD_START is rejected:
   * resuming without a reviewed target goes through the explicit ADD_RESUME channel only.
   */
  checkResumeIdentity(existing: AddJobFile | null): 'resume' | 'fresh' | 'reject' {
    const live = this._resolver.getResolvedUser()
    if (live === null) return 'reject'
    if (existing === null || existing.status === 'complete') return 'fresh'
    if (live.id.toString() === existing.targetId) return 'resume'
    return this._currentState.step !== 'idle' ? 'reject' : 'fresh'
  }

  /**
   * D-07, ADD_RESUME semantics: may the on-disk job be continued? 'reject' when there is no
   * non-complete job, or when the live resolver holds a user whose id differs from the job's
   * targetId (a Resume of job A while B is confirmed). Identity comes only from the job file
   * or a matching resolver — never from the renderer.
   */
  checkExplicitResume(job: AddJobFile | null): 'resume' | 'reject' {
    if (job === null || job.status === 'complete') return 'reject'
    const live = this._resolver.getResolvedUser()
    if (live !== null && live.id.toString() !== job.targetId) return 'reject'
    return 'resume'
  }

  /** D-10: live scan status wins; else a persisted ban flag from the job file. */
  private _effectiveScanStatus(
    dialogId: string,
    job: { bannedDialogIds?: string[] } | null,
    live: string | undefined
  ): string | undefined {
    if (live !== undefined) return live
    return job?.bannedDialogIds?.includes(dialogId) ? 'banned' : undefined
  }

  /**
   * Execute the add run across the specified dialog IDs.
   *
   * Security (T-05-04-B): reads target from this._resolver.getResolvedUser() — never from
   * params. On a relaunch resume (resolver null, resume:true, matching non-complete job) the
   * target is rebuilt from add-job.json inside main only (D-03). D-20: a matching on-disk job
   * (same targetId + dialogId set) is continued when
   * `params.resume` is true; otherwise a fresh job is started via initJob().
   */
  async execute(params: { dialogIds: string[]; resume?: boolean }): Promise<void> {
    // WR-04: never start/resume while a single-group retry is still awaiting Telegram — the
    // generation bump would discard the retry's real outcome, and the two runs would overlap.
    // State is left untouched; the caller sees the unchanged step as a refusal.
    if (this._retriesInFlight > 0) {
      // IN-03 (iter 2): leave a trace — the renderer only sees the generic start/resume failure.
      console.warn('[AddExecutor] start refused: retry in flight')
      return
    }

    // T-05-04-B: read target from resolver, never from params
    const existing = this._auditStore.readJob()
    let resolved: ResolvedAddUser | null = this._resolver.getResolvedUser()

    // D-07 defense-in-depth: a different live identity must never continue job A (resume
    // intent) and must never replace a live in-memory job (non-idle). Reject before any state
    // change, initJob, or RPC. An idle fresh start for a reviewed target B is allowed.
    if (
      resolved !== null &&
      existing !== null &&
      existing.status !== 'complete' &&
      resolved.id.toString() !== existing.targetId &&
      (params.resume === true || this._currentState.step !== 'idle')
    ) {
      // Pitfall 3: never wipe a live job view — only emit idle when already idle.
      if (this._currentState.step === 'idle') this._emitEarlyIdle()
      return
    }

    const gen = ++this._generation
    this._wiped = false
    this._runActive = true

    if (
      resolved === null &&
      params.resume === true &&
      existing !== null &&
      existing.status !== 'complete' &&
      sameDialogIdSet(existing.dialogIds, params.dialogIds)
    ) {
      // WR-02: BigInt('') is 0n (no throw), so validate both ids as integer strings first —
      // a malformed/truncated job file must fall into the idle path, never reach Telegram
      // with an invalid InputPeerUser.
      const isIntString = (v: unknown): v is string => typeof v === 'string' && /^-?\d+$/.test(v)
      if (isIntString(existing.targetId) && isIntString(existing.targetAccessHash)) {
        try {
          resolved = {
            id: BigInt(existing.targetId),
            accessHash: BigInt(existing.targetAccessHash),
            name: typeof existing.targetName === 'string' ? existing.targetName : '',
            deleted: false,
            bot: false,
          }
        } catch {
          resolved = null
        }
      }
    }
    if (resolved === null) {
      this._emitEarlyIdle()
      return
    }

    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') {
      this._emitEarlyIdle()
      return
    }

    // WR-03: the AbortController is only created once the run is actually going ahead —
    // the early-idle exits above must not leave a live controller behind.
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    this._resolvedTarget = resolved
    this._jobDialogIds = [...params.dialogIds]

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

    // D-20 CONTINUATION-AWARE JOB INIT: a matching on-disk job (resume:true, same targetId,
    // same dialogId set via sameDialogIdSet) reuses its jobId/outcomes instead of minting a
    // fresh job — required so the end-of-run DM (D-13) and add-log follow-up block (D-18)
    // can reference the SAME lineage across a stop/resume cycle.
    const isContinuation =
      params.resume === true &&
      existing !== null &&
      existing.status !== 'complete' &&
      existing.targetId === targetId &&
      sameDialogIdSet(existing.dialogIds, params.dialogIds)

    let jobId: string
    let outcomes: AddGroupOutcome[]
    let persistedBanned: string[] | undefined
    if (isContinuation) {
      jobId = existing!.jobId
      // 'skipped' entries only mark dialogs the PREVIOUS segment never actually attempted
      // (abort/hard-stop guard fill-in) — they are eligible for reprocessing this segment,
      // so they are excluded from the seeded outcomes and from the already-finished set
      // used to compute dialogsToProcess below.
      outcomes = existing!.outcomes.filter((o) => o.status !== 'skipped')
      persistedBanned = existing!.bannedDialogIds
    } else {
      jobId = new Date().toISOString()
      outcomes = []
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
      const bannedIds = (this._scanner.getState().results ?? [])
        .filter((r) => r.status === 'banned' && params.dialogIds.includes(r.dialogId))
        .map((r) => r.dialogId)
      if (bannedIds.length > 0) job.bannedDialogIds = bannedIds
      this._auditStore.initJob(job)
    }

    // A resumed run must not reprocess a group it already finished (D-20), but `total`
    // (captured above, before this filter) still reflects the whole job for progress.
    const finishedIds = new Set(outcomes.map((o) => o.dialogId))
    const dialogsToProcess = selectedDialogs.filter((d) => !finishedIds.has(d.id))

    this._emit({
      step: 'running',
      targetId,
      targetName,
      progress: { processed: outcomes.length, total },
      outcomes: [...outcomes],
      floodWaitRemaining: null,
      dmStatus: 'pending',
    })

    const scanResults = this._scanner.getState().results ?? []
    const scanStatusFor = (dialogId: string): string | undefined =>
      this._effectiveScanStatus(
        dialogId,
        persistedBanned ? { bannedDialogIds: persistedBanned } : null,
        scanResults.find((r) => r.dialogId === dialogId)?.status
      )

    const ctx = { targetId, targetName, total }

    for (const dialog of dialogsToProcess) {
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
            this._handleLoopHardStop(selectedDialogs, outcomes, ctx, signal, gen)
            return
          }
          try {
            outcome = await this._classifyAddError(err, dialog, resolved, targetName)
          } catch (err2) {
            // CR-03: _classifyAddError's own privacy/channel-full branches invoke
            // ExportChatInvite internally and can themselves surface a hard-stop —
            // route it through the same hard-stop handling as the check above instead
            // of letting it propagate uncaught out of the loop.
            if (classifyRpcError(err2).disposition === 'hard-stop') {
              this._handleLoopHardStop(selectedDialogs, outcomes, ctx, signal, gen)
              return
            }
            throw err2
          }
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

    // D-13/D-14: end-of-run DM — attempted exactly once, only on 'complete', aggregating
    // links from every segment (seeded-from-disk plus this segment's).
    // WR-01: a link a retry already delivered (D-12, retryDmStatus 'sent') is never sent a
    // second time in this DM; the retry also wrote its own add-log block for it.
    const linkedOutcomes = outcomes.filter(
      (o) => o.status === 'privacy-blocked' && o.link && o.retryDmStatus !== 'sent'
    )
    const anyRetryDmSent = outcomes.some((o) => o.retryDmStatus === 'sent')
    let dmStatus: AddDmStatus = 'pending'
    // WR-03 (iter 2): the end-of-run DM is attempted once per lineage. If this continuation's
    // job already sent (or was refused) its DM, never send another — old links carry no
    // per-link marker, so re-sending would duplicate them.
    const lineageDm = isContinuation ? existing!.dmStatus : undefined
    const lineageDmAttempted = lineageDm === 'sent' || lineageDm === 'refused'

    if (lineageDmAttempted) {
      dmStatus = lineageDm
    } else if (linkedOutcomes.length === 0) {
      // D-13: no DM when the run has no undelivered links. If every link already went out via
      // a retry DM, the target did get a DM — report 'sent', not 'not-needed'.
      dmStatus = anyRetryDmSent ? 'sent' : 'not-needed'
    } else {
      // Regenerate any link older than 5 days before sending (D-13).
      for (const o of linkedOutcomes) {
        const ageMs = Date.now() - new Date(o.timestamp).getTime()
        if (ageMs > 432000 * 1000) {
          const dialogForLink = groupsState.dialogs.find((d) => d.id === o.dialogId)
          if (dialogForLink) {
            try {
              const regenerated = await this._buildPrivacyBlockedOutcome(
                dialogForLink,
                resolved,
                targetName,
                o.premiumWouldAllow ?? false,
                o.reason ?? 'privacy'
              )
              o.link = regenerated.link
              o.timestamp = regenerated.timestamp
              this._auditStore.checkpoint(o.dialogId, o)
            } catch (err) {
              // CR-03: a hard-stop (PEER_FLOOD) during link regeneration must abort the
              // DM-send tail cleanly — never continue to the next regeneration call or
              // to SendMessage while the account is flagged.
              if (classifyRpcError(err).disposition === 'hard-stop') {
                this._emitHardStopped(outcomes, ctx)
                return
              }
              // Any other regeneration failure — keep the stale link; the DM still includes it.
            }
          }
        }
      }

      const links = linkedOutcomes.map((o) => o.link).join('\n')
      try {
        dmStatus = await this._sendDm(resolved, links, targetName)
      } catch (err) {
        const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
        if (classifyRpcError(err).disposition === 'hard-stop') {
          // PEER_FLOOD during the DM send (T-14-11): the per-group work already
          // completed successfully — hard-stop the run exactly like the main dispatch
          // loop rather than letting it fall through to the generic branch below.
          this._emitHardStopped(outcomes, ctx)
          return
        } else {
          // CR-02: FLOOD_WAIT / NETWORK / any unrecognized RPC error used to propagate
          // out of execute() uncaught here, which addChannels.ts's fire-and-forget
          // .catch() silently discards — leaving step stuck at 'running' forever and
          // permanently wedging the double-start guard. The add work itself already
          // succeeded; only the notification DM failed, so finish in a terminal,
          // resumable state instead.
          console.error('[AddExecutor] end-of-run DM send failed:', msg || '(no errorMessage)')
          dmStatus = 'refused'
        }
      }
    }

    const completedAt = new Date().toISOString()
    this._auditStore.setStatus('complete', completedAt, dmStatus)
    this._runActive = false

    this._emit({
      step: 'complete',
      targetId,
      targetName,
      progress: { processed: outcomes.length, total },
      outcomes: [...outcomes],
      summary: this._buildSummary(outcomes, completedAt),
      floodWaitRemaining: null,
      dmStatus,
    })

    // D-14: group titles from the enumerator list (dialogId stays the printed fallback).
    const titleOf = (id: string): string | undefined => groupsState.dialogs.find((d) => d.id === id)?.title

    // D-17/D-18: one add-log block per run, written ONLY when the run reaches 'complete'.
    this._addLogStore.appendBlock({
      jobId,
      isFollowUp: isContinuation,
      targetId,
      targetName,
      addedDialogs: outcomes.filter((o) => o.status === 'done').map((o) => ({ dialogId: o.dialogId, title: titleOf(o.dialogId) })),
      linkedDialogs: linkedOutcomes.map((o) => ({ dialogId: o.dialogId, link: o.link!, title: titleOf(o.dialogId) })),
      // dmStatus is always resolved to 'sent' | 'refused' | 'not-needed' by this point —
      // every code path above that assigns it excludes 'pending' (TS narrows accordingly).
      dmStatus,
      timestamp: completedAt,
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
      this._resolvedTarget = null
      this._jobDialogIds = null
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
   * Logout / session wipe: unconditionally return to idle from any state (including a
   * running run) and make the aborted in-flight loop inert so it cannot write checkpoints
   * or emit 'stopped' after the wipe (audit W4, ADD-08/12).
   */
  resetForSessionWipe(): void {
    this._wiped = true
    this._generation++
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    this._runActive = false
    this._resolvedTarget = null
    this._jobDialogIds = null
    this._emit({
      step: 'idle',
      targetId: '',
      targetName: '',
      progress: { processed: 0, total: 0 },
      outcomes: [],
    })
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
    // WR-02 (iter 2): main is authoritative (the IPC call is fire-and-forget) — refuse a
    // duplicate retry of a row whose previous retry is still in flight.
    if (this._retryingDialogIds.has(dialogId)) return
    this._retryingDialogIds.add(dialogId)
    // WR-04: tracked so execute() refuses to start a Resume while this retry is in flight.
    this._retriesInFlight++
    try {
      await this._retryGroupInner(dialogId)
    } finally {
      this._retriesInFlight--
      this._retryingDialogIds.delete(dialogId)
    }
  }

  private async _retryGroupInner(dialogId: string): Promise<void> {
    const gen = this._generation

    // D-06: act only on the job's target — never on a live resolver user for someone else.
    const resolved = this._resolvedTarget
    if (resolved === null) return
    const liveUser = this._resolver.getResolvedUser()
    if (liveUser !== null && liveUser.id.toString() !== resolved.id.toString()) return
    const job = this._auditStore.readJob()
    if (job === null || job.targetId !== resolved.id.toString()) return

    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') return

    const dialog = groupsState.dialogs.find((d) => d.id === dialogId)
    if (!dialog) return

    const scanResults = this._scanner.getState().results ?? []
    const scanStatus = this._effectiveScanStatus(
      dialogId,
      job,
      scanResults.find((r) => r.dialogId === dialogId)?.status
    )
    const targetName = resolved.name ?? ''

    let newOutcome: AddGroupOutcome
    try {
      newOutcome = await this._addToGroup(dialog, resolved, scanStatus)
    } catch (err) {
      // WR-01: a hard-stop (PEER_FLOOD) must never vanish into the fire-and-forget
      // .catch() at the IPC boundary with zero feedback — explicitly transition to
      // hard-stopped instead.
      if (classifyRpcError(err).disposition === 'hard-stop') {
        this._hardStopRetry(dialogId, gen)
        return
      }
      try {
        newOutcome = await this._classifyAddError(err, dialog, resolved, targetName)
      } catch (err2) {
        // CR-03: _classifyAddError's own privacy/channel-full branches can also
        // surface a hard-stop via their inline ExportChatInvite call.
        if (classifyRpcError(err2).disposition === 'hard-stop') {
          this._hardStopRetry(dialogId, gen)
          return
        }
        throw err2
      }
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

    // D-12: a retry that ends privacy-blocked with a fresh link logs it and DMs it at once.
    // The link is already checkpointed above (Pitfall 2) so a failed DM never loses it.
    if (newOutcome.status !== 'privacy-blocked' || !newOutcome.link) return

    let dm: 'sent' | 'refused'
    let hardStop = false
    try {
      dm = await this._sendDm(resolved, newOutcome.link, job.targetName)
    } catch (err) {
      if (classifyRpcError(err).disposition === 'hard-stop') {
        hardStop = true
      } else {
        console.error('[AddExecutor] retry DM send failed')
      }
      dm = 'refused'
    }

    // WR-03: the DM attempt already happened — record it in the append-only add log BEFORE the
    // generation guard, so a message that really went out is never missing from the admin's
    // durable record. The guard below protects state emission only.
    this._addLogStore.appendBlock({
      jobId: job.jobId,
      isFollowUp: true,
      targetId: job.targetId,
      targetName: job.targetName,
      addedDialogs: [],
      linkedDialogs: [{ dialogId, link: newOutcome.link, title: dialog.title ?? dialogId }],
      // IN-04: a PEER_FLOOD during the send is an account hard-stop, not a privacy refusal.
      dmStatus: hardStop ? 'hard-stopped' : dm,
      timestamp: new Date().toISOString(),
    })

    // WR-01 (iter 2): the DM outcome is a side-effect fact — persist retryDmStatus on the job
    // file BEFORE the generation guard, so a link that really went out is never re-sent by a
    // later Resume's end-of-run DM when the generation changed mid-send (a concurrent retry's
    // PEER_FLOOD, or abort). Only skip it if the on-disk job was replaced by another lineage.
    // A hard-stopped send was not delivered, so nothing is recorded for it.
    const withDm: AddGroupOutcome = { ...newOutcome, retryDmStatus: dm }
    if (!hardStop) {
      const onDisk = this._auditStore.readJob()
      if (onDisk !== null && onDisk.jobId === job.jobId) {
        this._auditStore.checkpoint(dialogId, withDm)
      }
    }

    if (hardStop) {
      // CR-03: never continue after a hard-stop (_hardStopRetry applies its own gen guard).
      this._hardStopRetry(dialogId, gen)
      return
    }

    // Generation guard AFTER the DM await, BEFORE any state emission.
    if (gen !== this._generation) return

    // WR-02: re-read the job after the awaits — never write back a status captured before
    // them (a concurrent hard-stop or resume may have changed it on disk).
    const fresh = this._auditStore.readJob()
    const jobDmWasNotNeeded = fresh !== null && fresh.dmStatus === 'not-needed'
    if (fresh !== null && jobDmWasNotNeeded) {
      this._auditStore.setStatus(fresh.status, undefined, dm)
    }

    const finalOutcomes = this._currentState.outcomes.map((o) =>
      o.dialogId === dialogId ? { ...o, ...withDm, dialogId } : o
    )
    this._emit({
      ...this._currentState,
      outcomes: finalOutcomes,
      summary: this._buildSummary(finalOutcomes, new Date().toISOString()),
      ...(jobDmWasNotNeeded ? { dmStatus: dm } : {}),
    })
  }

  /** Return the current AddState. */
  getState(): AddState {
    return this._currentState
  }

  /**
   * WR-01: explicit hard-stop transition for retryGroup() — a PEER_FLOOD-classified
   * error during a single-group retry must be surfaced (logged + state transition)
   * rather than silently discarded by the fire-and-forget .catch() at the IPC boundary.
   * The retried group's prior outcome is left unchanged (no checkpoint write).
   *
   * WR-02: a superseded retry (abort / new run since it started) never writes over the newer
   * state. Otherwise the generation is bumped so any OTHER in-flight retry drops out at its
   * post-await guard — no further Telegram call (no retry DM) on a PEER_FLOOD-flagged account,
   * and no stale status written over 'hard-stopped' on disk.
   */
  private _hardStopRetry(dialogId: string, gen: number): void {
    console.error('[AddExecutor] retryGroup hard-stopped (PEER_FLOOD-classified error) for dialog:', dialogId)
    if (gen !== this._generation) return
    this._generation++
    // WR-03 (iter 2): never demote a finished job on disk. A 'complete' job already ran its
    // end-of-run DM; rewriting it to 'hard-stopped' would make a later ADD_START for the same
    // person a no-op continuation that re-sends old links. The in-memory view still shows the
    // PEER_FLOOD banner so the admin sees the account flag.
    const onDisk = this._auditStore.readJob()
    if (onDisk !== null && onDisk.status !== 'complete') this._auditStore.setStatus('hard-stopped')
    this._emit({ ...this._currentState, step: 'hard-stopped', floodWaitRemaining: null })
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Shared DM send (end-of-run and retry tail). Returns 'sent', or 'refused' for the four
   * privacy/block refusal errors; rethrows anything else so the caller applies hard-stop
   * or generic handling.
   */
  private async _sendDm(resolved: ResolvedAddUser, links: string, targetName: string): Promise<'sent' | 'refused'> {
    const text = this._getDmText({ name: targetName, links })
    const inputPeerUser = new Api.InputPeerUser({
      userId: bigInt(resolved.id.toString()),
      accessHash: bigInt(resolved.accessHash.toString()),
    })
    const randomId = bigInt(randomBytes(8).toString('hex'), 16)

    try {
      await this._governor.run(() =>
        this._client.invoke(new Api.messages.SendMessage({ peer: inputPeerUser, message: text, randomId }))
      )
      return 'sent'
    } catch (err) {
      const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
      if (['USER_PRIVACY_RESTRICTED', 'USER_IS_BLOCKED', 'YOU_BLOCKED_USER', 'PRIVACY_PREMIUM_REQUIRED'].includes(msg)) {
        return 'refused'
      }
      throw err
    }
  }


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
        } catch (err) {
          // CR-03: a hard-stop (PEER_FLOOD) from the inline ExportChatInvite call must
          // propagate — never swallow it into an ordinary per-group failure.
          if (classifyRpcError(err).disposition === 'hard-stop') throw err
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
      } catch (err) {
        // CR-03: a hard-stop (PEER_FLOOD) from the inline ExportChatInvite call must
        // propagate — never swallow it into an ordinary per-group failure.
        if (classifyRpcError(err).disposition === 'hard-stop') throw err
        return { dialogId: dialog.id, status: 'failed', errorCode: 'UNKNOWN', timestamp }
      }
    }
    return { dialogId: dialog.id, status: 'done', timestamp }
  }

  /** True when `err` is a recognized terminal RPC error that must NOT trigger a fwd_limit retry. */
  private _isKnownAddTerminalError(err: unknown): boolean {
    const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
    if (KNOWN_ADD_TERMINAL_ERRORS.has(msg)) return true
    // WR-02: only a genuinely-unrecognized, non-retryable error ('fail' disposition —
    // i.e. an unmapped/UNKNOWN RPCError, presumably the undocumented fwd_limit
    // rejection) is presumed eligible for the one-shot D-03 retry. 'hard-stop'
    // (PEER_FLOOD), 'wait' (FLOOD_WAIT not fully absorbed by the governor), and
    // 'retry' (NETWORK) must never trigger extra traffic right when the account may
    // already be under rate-limit pressure.
    return classifyRpcError(err).disposition !== 'fail'
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
      } catch (err) {
        // CR-03: a hard-stop (PEER_FLOOD) from the inline ExportChatInvite call must
        // propagate — never swallow it into an ordinary per-group failure.
        if (classifyRpcError(err).disposition === 'hard-stop') throw err
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
      } catch (err) {
        // CR-03: a hard-stop (PEER_FLOOD) from the inline ExportChatInvite call must
        // propagate — never swallow it into an ordinary per-group failure.
        if (classifyRpcError(err).disposition === 'hard-stop') throw err
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
    if (this._wiped) return
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
   * Shared hard-stop resolution for the main dispatch loop (CR-03): applies the
   * abort-first-then-generation guard before emitting the authoritative terminal state.
   * Used both when _addToGroup()'s own call hard-stops and when a hard-stop surfaces
   * from the nested ExportChatInvite call inside _classifyAddError()'s privacy/
   * channel-full branches.
   */
  private _handleLoopHardStop(
    selectedDialogs: AdminDialogDTO[],
    outcomes: AddGroupOutcome[],
    ctx: { targetId: string; targetName: string; total: number },
    signal: AbortSignal,
    gen: number
  ): void {
    if (signal.aborted) {
      this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
      return
    }
    if (gen !== this._generation) return
    this._emitHardStopped(outcomes, ctx)
  }

  /**
   * PEER_FLOOD hard-stop: remaining groups left pending (NOT skipped), run resumable.
   */
  /**
   * WR-03: early-return idle from execute() (no target / enumerator not loaded). Emits a CLEAN
   * idle state — mirrors abortExecution()'s idle reset — so a prior complete/stopped run's
   * dialogIds, outcomes and target identity never leak into idle, and clears run bookkeeping.
   */
  private _emitEarlyIdle(): void {
    this._runActive = false
    this._abortController = null
    this._resolvedTarget = null
    this._jobDialogIds = null
    this._emit({
      step: 'idle',
      targetId: '',
      targetName: '',
      progress: { processed: 0, total: 0 },
      outcomes: [],
      floodWaitRemaining: null,
    })
  }

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
