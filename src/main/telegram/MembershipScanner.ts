/**
 * MembershipScanner — per-target membership scan with streaming progress.
 *
 * Owns:
 *   - Iterating all known admin dialogs from GroupEnumerator
 *   - Per-group membership check via appropriate GramJS call (GetParticipant for
 *     supergroup/channel, GetFullChat for basic group)
 *   - Streaming ScanState progress events (idle → scanning → complete | error)
 *   - Per-group failure isolation: a single group error sets status=failed without
 *     aborting the scan
 *   - Generation-token pattern (D-15): each scan() call invalidates prior in-flight work
 *   - abortScan(): increments generation + AbortController → emits idle
 *   - retryGroup(dialogId): single-group re-check, merges result into existing complete state
 *
 * Security (T-04-04):
 *   - Target is read ONLY from resolver.getResolvedUser() in the main process
 *   - scan:start IPC channel carries NO payload — renderer cannot inject target ID or accessHash
 *
 * All Telegram API calls route through _governor.run() (mirrors GroupEnumerator pattern).
 *
 * RESEARCH Pitfall 1: after GetParticipant succeeds, check className for
 * ChannelParticipantLeft / ChannelParticipantBanned before declaring member=true.
 *
 * USER_NOT_PARTICIPANT: caught via errorMessage === 'USER_NOT_PARTICIPANT' in the
 * inner catch block (raw RPC string), not via classifyRpcError.
 */

import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { ScanState, MembershipResultDTO, AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import type { GroupEnumerator } from './GroupEnumerator'

// ── Injectable client interface ────────────────────────────────────────────

export interface MembershipScannerClient {
  invoke(request: unknown): Promise<unknown>
}

// ── Constructor options ─────────────────────────────────────────────────────

export interface MembershipScannerOptions {
  /** The TelegramClient (real or mock). */
  client: MembershipScannerClient
  /** Shared account-wide RateLimitGovernor — all Telegram calls must go through it. */
  governor: RateLimitGovernor
  /** GroupEnumerator — provides dialog list and entity map. */
  enumerator: GroupEnumerator
  /** TargetResolver — provides resolved user id and accessHash (main only, never renderer). */
  resolver: { getResolvedUser(): { id: bigint; accessHash: bigint } | null }
  /** Called whenever ScanState changes. Wired to win.webContents.send in production. */
  onStateChange: (state: ScanState) => void
}

// ── MembershipScanner ───────────────────────────────────────────────────────

export class MembershipScanner {
  private readonly _client: MembershipScannerClient
  private readonly _governor: RateLimitGovernor
  private readonly _enumerator: GroupEnumerator
  private readonly _resolver: { getResolvedUser(): { id: bigint; accessHash: bigint } | null }
  private readonly _emit: (state: ScanState) => void

  private _currentState: ScanState = { step: 'idle' }
  /** Generation token (D-15): each scan() call increments this to invalidate prior in-flight scans. */
  private _generation = 0
  private _abortController: AbortController | null = null

  constructor(options: MembershipScannerOptions) {
    this._client = options.client
    this._governor = options.governor
    this._enumerator = options.enumerator
    this._resolver = options.resolver
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Run a full membership scan across all known admin dialogs.
   *
   * Security (T-04-04): reads target from this._resolver.getResolvedUser() — NO renderer
   * payload is accepted. The scan:start IPC channel carries no target information.
   *
   * D-15: increments _generation at the start; each loop iteration checks if generation
   * has been superseded (by a newer scan() or abortScan()) and exits early.
   */
  async scan(): Promise<void> {
    // D-15: increment generation to invalidate any prior in-flight scan
    const gen = ++this._generation

    // Create a new AbortController for this scan
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    // Read target from resolver (T-04-04: never from renderer payload)
    const resolved = this._resolver.getResolvedUser()
    if (resolved === null) {
      this._emit({ step: 'error', code: 'UNKNOWN' })
      return
    }

    // Construct InputPeerUser from RESEARCH §Pattern 4
    const inputUser = new Api.InputPeerUser({
      userId: bigInt(resolved.id.toString()),
      accessHash: bigInt(resolved.accessHash.toString()),
    })

    // Get dialogs from enumerator
    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') {
      this._emit({ step: 'error', code: 'UNKNOWN' })
      return
    }

    const dialogs = groupsState.dialogs
    const total = dialogs.length
    const results: MembershipResultDTO[] = []

    // Emit initial scanning state
    this._emit({ step: 'scanning', progress: { checked: 0, total }, results: [] })

    for (const dialog of dialogs) {
      // D-15: check if this scan has been superseded or aborted
      if (gen !== this._generation || signal.aborted) {
        return
      }

      let status: MembershipResultDTO['status']
      try {
        status = await this._checkMembership(dialog, inputUser, resolved)
      } catch (_err) {
        // Per-group failure isolation: mark as failed, continue scan
        status = 'failed'
      }

      results.push({ dialogId: dialog.id, status })

      // D-15: re-check after await
      if (gen !== this._generation || signal.aborted) {
        return
      }

      // Emit progress update
      this._emit({
        step: 'scanning',
        progress: { checked: results.length, total },
        results: [...results],
      })
    }

    // D-15: final check before emitting complete
    if (gen !== this._generation || signal.aborted) {
      return
    }

    this._emit({ step: 'complete', results })
  }

  /** Abort the current scan — increments generation, aborts controller, emits idle. */
  abortScan(): void {
    this._generation++
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    this._emit({ step: 'idle' })
  }

  /** Return the current ScanState. */
  getState(): ScanState {
    return this._currentState
  }

  /**
   * Re-run membership check for a single group.
   * Merges the updated result into the current complete state's results array.
   * No-op if current state is not 'complete' or resolver returns null.
   */
  async retryGroup(dialogId: string): Promise<void> {
    if (this._currentState.step !== 'complete') return

    // CR-02: capture generation token before the async gap so we can detect if
    // abortScan() or scan() was called during the await (both increment _generation).
    const gen = this._generation

    const resolved = this._resolver.getResolvedUser()
    if (resolved === null) return

    const inputUser = new Api.InputPeerUser({
      userId: bigInt(resolved.id.toString()),
      accessHash: bigInt(resolved.accessHash.toString()),
    })

    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') return

    const dialog = groupsState.dialogs.find(d => d.id === dialogId)
    if (!dialog) return

    let status: MembershipResultDTO['status']
    try {
      status = await this._checkMembership(dialog, inputUser, resolved)
    } catch (_err) {
      status = 'failed'
    }

    // CR-02: generation guard — if abortScan() or scan() was called during the
    // await above, _generation will have incremented past gen. Merging stale
    // results would either crash (TypeError on this._currentState.results when
    // state is now 'idle') or corrupt the new scan's results with old data.
    if (gen !== this._generation || this._currentState.step !== 'complete') return

    // Merge updated result into the existing results array
    const updatedResults = this._currentState.results.map(r =>
      r.dialogId === dialogId ? { ...r, status } : r
    )

    this._emit({ step: 'complete', results: updatedResults })
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Check membership for a single dialog.
   *
   * Dispatch:
   *   - Supergroup/channel: channels.GetParticipant
   *     - USER_NOT_PARTICIPANT error → 'not-member'
   *     - ChannelParticipantBanned with left unset/false → 'banned'; with left===true → 'not-member' (D-01)
   *     - ChannelParticipantLeft → 'not-member' (RESEARCH Pitfall 1)
   *     - Any other participant type → 'member'
   *   - Basic group: messages.GetFullChat
   *     - Scan participants array by .userId.toString() === target id → 'member' | 'not-member'
   *     - Bans are never visible via this API path (D-03) — 'banned' is never returned here
   *   - Unexpected errors are re-thrown (outer scan loop catches → status=failed)
   */
  private async _checkMembership(
    dialog: AdminDialogDTO,
    inputUser: Api.InputPeerUser,
    resolved: { id: bigint; accessHash: bigint }
  ): Promise<MembershipStatus> {
    const entity = this._enumerator.getDialogEntity(dialog.id)

    if (dialog.type === 'supergroup' || dialog.type === 'broadcast-channel') {
      // Use channels.GetParticipant for supergroups and channels.
      //
      // Build InputChannel from the stored Api.Channel entity's own id and
      // accessHash rather than using bigInt.zero. The entity was returned by
      // getDialogs() and has the real accessHash set by the Telegram server.
      // Using bigInt.zero causes a GramJS CastError during invoke → resolve()
      // when it auto-casts the InputChannel field (InputChannel is in AUTO_CASTS)
      // because getInputEntity() may fail or return a mistyped peer (Defect 3).
      const channelEntity = entity as { id?: { toString(): string; value?: unknown }; accessHash?: { toString(): string; value?: unknown } } | null
      const channelId = bigInt(channelEntity?.id?.toString() ?? dialog.id)
      const accessHash = channelEntity?.accessHash
        ? bigInt(channelEntity.accessHash.toString())
        : bigInt.zero

      try {
        const result = await this._governor.run(() =>
          this._client.invoke(
            new Api.channels.GetParticipant({
              channel: new Api.InputChannel({
                channelId,
                accessHash,
              }),
              participant: inputUser,
            })
          )
        ) as { participant: { className?: string } }

        const participant = result.participant
        // RESEARCH Pitfall 1: check for non-member participant subtypes before declaring member
        const className = participant?.className ?? ''
        if (className === 'ChannelParticipantBanned') {
          // D-01 (revised 2026-10-03): TL `channelParticipantBanned.left` = "whether the
          // user has left the group".
          //   left=true  → kicked, NOT in the group, cannot rejoin (Add mode needs unban-first) → 'banned'
          //   left=false → restricted but STILL a participant → 'member'
          const isLeft = (participant as { left?: boolean }).left === true
          return isLeft ? 'banned' : 'member'
        }
        if (className === 'ChannelParticipantLeft') {
          return 'not-member'
        }
        return 'member'
      } catch (err) {
        // USER_NOT_PARTICIPANT → not a member (not an error)
        if ((err as { errorMessage?: string })?.errorMessage === 'USER_NOT_PARTICIPANT') {
          return 'not-member'
        }
        // Re-throw other errors — outer loop marks as failed
        throw err
      }
    }

    if (dialog.type === 'basic-group') {
      // Use messages.GetFullChat for basic groups.
      //
      // Use entity.id directly (the bigInt from the stored Api.Chat entity)
      // rather than re-constructing bigInt(dialog.id) from the string DTO field.
      // This guarantees a big-integer library instance reaches GetFullChat.chatId
      // and avoids the GramJS CastError that fires when a plain JS number is
      // passed (Defect 3).
      const chatEntity = entity as { id?: { toString(): string } } | null
      const chatId = chatEntity?.id
        ? bigInt(chatEntity.id.toString())
        : bigInt(dialog.id)

      const result = await this._governor.run(() =>
        this._client.invoke(
          new Api.messages.GetFullChat({
            chatId,
          })
        )
      ) as {
        fullChat: {
          participants?: {
            participants?: Array<{ userId?: { toString(): string } }>
          }
        }
      }

      const participants = result.fullChat?.participants?.participants ?? []
      const targetIdStr = resolved.id.toString()
      // D-03: basic groups never surface bans via this API — 'member' | 'not-member' only.
      return participants.some(p => p.userId?.toString() === targetIdStr) ? 'member' : 'not-member'
    }

    // Unknown type — return 'not-member' (safe default)
    return 'not-member'
  }
}
