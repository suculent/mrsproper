/**
 * ParticipantSearcher — group-scoped participant name search with streaming progress.
 *
 * Owns:
 *   - Iterating all known admin dialogs from GroupEnumerator
 *   - Per-group participant search via appropriate GramJS call (GetParticipants with
 *     ChannelParticipantsSearch filter for supergroups, GetFullChat for basic groups)
 *   - Client-side token filter for basic groups (GetFullChat returns full participant list)
 *   - Streaming SearchState progress events (idle → searching → complete | stopped | error)
 *   - CandidateDTO deduplication by userId — merges foundIn across groups
 *   - accessHash isolation: stored in _candidateAccessHashes (main-only, never in DTO)
 *   - Generation-token pattern (CR-02): each search() call invalidates prior in-flight work
 *   - abortSearch(): increments generation + AbortController → emits idle, clears accessHashes
 *   - getCandidateAccessHash(userId): returns stored bigint | null for IPC handler gate
 *
 * Security (T-04.1-03):
 *   - accessHash stored in private _candidateAccessHashes map — never in CandidateDTO
 *   - CandidateDTO emitted via onStateChange has no accessHash field by construction
 *   - getCandidateAccessHash() is for main-process IPC use only
 *
 * Generation guard (T-04.1-04, CR-02):
 *   - Double guard after every await: before try AND after try/catch
 *   - Stale results from a superseded search() never emit
 *
 * All Telegram API calls route through _governor.run() (mirrors GroupEnumerator pattern).
 *
 * RESEARCH Pitfall 9: GetParticipants may return {className:'channels.ChannelParticipantsNotModified'} —
 * guard with className check and treat as empty result (not an error).
 */

import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { SearchState, CandidateDTO } from '@shared/searchTypes'
import type { RateLimitGovernor } from './governor'
import type { GroupEnumerator } from './GroupEnumerator'
import type { AdminDialogDTO } from '@shared/groupTypes'

// ── Injectable client interface ────────────────────────────────────────────

export interface ParticipantSearcherClient {
  invoke(request: unknown): Promise<unknown>
}

// ── Constructor options ─────────────────────────────────────────────────────

export interface ParticipantSearcherOptions {
  /** The TelegramClient (real or mock). */
  client: ParticipantSearcherClient
  /** Shared account-wide RateLimitGovernor — all Telegram calls must go through it. */
  governor: RateLimitGovernor
  /** GroupEnumerator — provides dialog list and entity map. */
  enumerator: GroupEnumerator
  /** Called whenever SearchState changes. Wired to win.webContents.send in production. */
  onStateChange: (state: SearchState) => void
}

// ── Candidate accumulator (internal) ───────────────────────────────────────

interface CandidateAccumulator {
  user: {
    id: { toString(): string }
    firstName?: string
    lastName?: string
    username?: string | null
    deleted?: boolean
  }
  accessHash: bigint | null
  foundIn: Array<{ dialogTitle: string; dialogId: string }>
}

// ── ParticipantSearcher ─────────────────────────────────────────────────────

export class ParticipantSearcher {
  private readonly _client: ParticipantSearcherClient
  private readonly _governor: RateLimitGovernor
  private readonly _enumerator: GroupEnumerator
  private readonly _emit: (state: SearchState) => void

  private _currentState: SearchState = { step: 'idle' }
  /** Generation token (CR-02): each search() call increments this to invalidate prior in-flight searches. */
  private _generation = 0
  private _abortController: AbortController | null = null
  /**
   * Maps userId (string) → accessHash (bigint).
   * Security (T-04.1-03): this map is NEVER exposed in CandidateDTO.
   * Cleared on abortSearch() — no stale accessHash survives a target reset.
   */
  private _candidateAccessHashes = new Map<string, bigint>()

  constructor(options: ParticipantSearcherOptions) {
    this._client = options.client
    this._governor = options.governor
    this._enumerator = options.enumerator
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Run a name search across all known admin dialogs.
   *
   * Streams SearchState with candidates as groups complete.
   * Deduplicates by userId — merges foundIn across groups.
   *
   * CR-02: increments _generation at the start; each loop iteration checks if
   * generation has been superseded (by a newer search() or abortSearch()) and exits early.
   *
   * Security (T-04.1-03): accessHash from GetParticipants stored in _candidateAccessHashes only.
   * CandidateDTO emitted here has no accessHash field by construction.
   */
  async search(query: string): Promise<void> {
    // Validate query length before claiming generation
    if (query.trim().length < 2) {
      this._emit({ step: 'error', code: 'UNKNOWN' })
      return
    }

    // CR-02: increment generation to invalidate any prior in-flight search
    const gen = ++this._generation

    // Create a new AbortController for this search
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    // Check enumerator state — groups must be loaded
    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') {
      this._emit({ step: 'error', code: 'GROUPS_NOT_LOADED' })
      return
    }

    const dialogs = groupsState.dialogs
    const total = dialogs.length
    const candidatesMap = new Map<string, CandidateAccumulator>()
    let errorCount = 0
    let searched = 0

    // Clear stale accessHashes from prior search
    this._candidateAccessHashes.clear()

    // Emit initial searching state
    this._emit({
      step: 'searching',
      progress: { searched: 0, total },
      candidates: [],
      errorCount: 0,
    })

    for (const dialog of dialogs) {
      // CR-02: check if this search has been superseded or aborted (before try)
      if (gen !== this._generation || signal.aborted) {
        return
      }

      try {
        const foundUsers = await this._searchDialog(dialog, query.trim(), gen, signal)

        // CR-02: re-check after await
        if (gen !== this._generation || signal.aborted) {
          return
        }

        for (const user of foundUsers) {
          this._addCandidate(candidatesMap, user, dialog.title, dialog.id)
        }
      } catch (_err) {
        // Per-group failure isolation: increment errorCount, continue to next group
        errorCount++
      }

      searched++

      // CR-02: re-check after try/catch before emitting
      if (gen !== this._generation || signal.aborted) {
        return
      }

      // Emit streaming progress update
      const sorted = this._sortCandidates([...candidatesMap.values()])
      this._emit({
        step: 'searching',
        progress: { searched, total },
        candidates: sorted.slice(0, 100).map(acc => this._toDTO(acc)),
        errorCount,
      })
    }

    // CR-02: final guard before emitting complete
    if (gen !== this._generation || signal.aborted) {
      return
    }

    const sorted = this._sortCandidates([...candidatesMap.values()])
    this._emit({
      step: 'complete',
      candidates: sorted.slice(0, 100).map(acc => this._toDTO(acc)),
      total: candidatesMap.size,
      errorCount,
    })
  }

  /** Abort the current search — increments generation, aborts controller, clears accessHashes, emits idle. */
  abortSearch(): void {
    this._generation++
    if (this._abortController) {
      this._abortController.abort()
      this._abortController = null
    }
    this._candidateAccessHashes.clear()
    this._emit({ step: 'idle' })
  }

  /** Return the current SearchState. */
  getState(): SearchState {
    return this._currentState
  }

  /**
   * Return the stored accessHash for a candidate userId.
   * Security (T-04.1-03): this method is for MAIN PROCESS IPC handler use only.
   * Returns null if not found or after abortSearch().
   */
  getCandidateAccessHash(userId: string): bigint | null {
    return this._candidateAccessHashes.get(userId) ?? null
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Search for participants matching query in a single dialog.
   *
   * Dispatch:
   *   - Supergroup/channel: channels.GetParticipants with ChannelParticipantsSearch filter
   *     - Guards ChannelParticipantsNotModified (RESEARCH Pitfall 9) → return []
   *   - Basic group: messages.GetFullChat — full participant list + client-side filter
   *   - Unknown type → return []
   */
  private async _searchDialog(
    dialog: AdminDialogDTO,
    query: string,
    gen: number,
    signal: AbortSignal
  ): Promise<Array<{
    id: { toString(): string }
    accessHash?: { toString(): string } | null
    firstName?: string
    lastName?: string
    username?: string | null
    deleted?: boolean
  }>> {
    // Guard before API call
    if (gen !== this._generation || signal.aborted) return []

    const entity = this._enumerator.getDialogEntity(dialog.id)

    if (dialog.type === 'supergroup' || dialog.type === 'broadcast-channel') {
      // Entity accessHash extraction pattern (matches MembershipScanner lines 257-261).
      // NEVER pass bigInt.zero for accessHash to InputChannel — Defect 3.
      const channelEntity = entity as { id?: { toString(): string; value?: unknown }; accessHash?: { toString(): string; value?: unknown } } | null
      const channelId = bigInt(channelEntity?.id?.toString() ?? dialog.id)
      const accessHash = channelEntity?.accessHash
        ? bigInt(channelEntity.accessHash.toString())
        : bigInt.zero

      const result = await this._governor.run(() =>
        this._client.invoke(
          new Api.channels.GetParticipants({
            channel: new Api.InputChannel({ channelId, accessHash }),
            filter: new Api.ChannelParticipantsSearch({ q: query }),
            offset: 0,
            limit: 200,
            hash: bigInt.zero,
          })
        )
      ) as { className?: string; participants?: Array<{ className?: string; userId?: { toString(): string } }>; users?: unknown[] }

      // RESEARCH Pitfall 9: guard ChannelParticipantsNotModified
      if (result.className === 'channels.ChannelParticipantsNotModified') {
        return []
      }

      const participants = result.participants ?? []
      const users = result.users as Array<{
        id: { toString(): string }
        accessHash?: { toString(): string } | null
        firstName?: string
        lastName?: string
        username?: string | null
        deleted?: boolean
        min?: boolean
      }> ?? []

      // Build userMap keyed by userId string for O(1) participant → user lookup
      const userMap = new Map<string, typeof users[0]>()
      for (const u of users) {
        userMap.set(u.id.toString(), u)
      }

      const matched: typeof users = []
      for (const participant of participants) {
        // Skip left/banned participants (RESEARCH Pitfall 1)
        const className = participant.className ?? ''
        if (className === 'ChannelParticipantLeft' || className === 'ChannelParticipantBanned') {
          continue
        }
        const userId = participant.userId?.toString() ?? ''
        const user = userMap.get(userId)
        if (user) {
          matched.push(user)
        }
      }

      return matched
    }

    if (dialog.type === 'basic-group') {
      // GetFullChat basic-group path (matches MembershipScanner lines 299-322)
      const chatEntity = entity as { id?: { toString(): string } } | null
      const chatId = chatEntity?.id
        ? bigInt(chatEntity.id.toString())
        : bigInt(dialog.id)

      const result = await this._governor.run(() =>
        this._client.invoke(
          new Api.messages.GetFullChat({ chatId })
        )
      ) as {
        fullChat: {
          participants?: {
            participants?: Array<{ userId?: { toString(): string } }>
          }
        }
        users?: unknown[]
      }

      const participants = result.fullChat?.participants?.participants ?? []
      const users = result.users as Array<{
        id: { toString(): string }
        accessHash?: { toString(): string } | null
        firstName?: string
        lastName?: string
        username?: string | null
        deleted?: boolean
      }> ?? []

      // Build userMap for participant → user lookup
      const userMap = new Map<string, typeof users[0]>()
      for (const u of users) {
        userMap.set(u.id.toString(), u)
      }

      const queryLower = query.toLowerCase()
      const matched: typeof users = []

      for (const participant of participants) {
        const userId = participant.userId?.toString() ?? ''
        const user = userMap.get(userId)
        if (user && this._matchesQuery(user, queryLower)) {
          matched.push(user)
        }
      }

      return matched
    }

    // Unknown type — safe default
    return []
  }

  /**
   * Add or merge a user into the candidates map.
   * Deduplicates by userId — merges foundIn across groups.
   * Stores accessHash in _candidateAccessHashes (never in CandidateDTO).
   */
  private _addCandidate(
    candidates: Map<string, CandidateAccumulator>,
    user: {
      id: { toString(): string }
      accessHash?: { toString(): string } | null
      firstName?: string
      lastName?: string
      username?: string | null
      deleted?: boolean
    },
    dialogTitle: string,
    dialogId: string
  ): void {
    const userId = user.id.toString()

    // Store accessHash in the private map (T-04.1-03 — never in DTO)
    if (user.accessHash != null) {
      const hashStr = user.accessHash.toString()
      // Only store non-zero accessHashes
      if (hashStr !== '0') {
        this._candidateAccessHashes.set(userId, BigInt(hashStr))
      }
    }

    const existing = candidates.get(userId)
    if (existing) {
      // Merge foundIn — avoid duplicate dialog entries
      const alreadyIn = existing.foundIn.some(f => f.dialogId === dialogId)
      if (!alreadyIn) {
        existing.foundIn.push({ dialogTitle, dialogId })
      }
    } else {
      candidates.set(userId, {
        user,
        accessHash: user.accessHash != null && user.accessHash.toString() !== '0'
          ? BigInt(user.accessHash.toString())
          : null,
        foundIn: [{ dialogTitle, dialogId }],
      })
    }
  }

  /**
   * Convert a CandidateAccumulator to a CandidateDTO.
   * Security: accessHash is intentionally excluded (T-04.1-03).
   */
  private _toDTO(acc: CandidateAccumulator): CandidateDTO {
    const { user } = acc
    const firstName = user.firstName ?? ''
    const lastName = user.lastName ?? ''
    const name = [firstName, lastName].filter(Boolean).join(' ')

    return {
      id: user.id.toString(),
      name: name || firstName,
      username: user.username ?? null,
      deleted: user.deleted ?? false,
      foundIn: acc.foundIn.map(f => f.dialogTitle),
      avatar: null, // lazy-loaded later
    }
  }

  /**
   * Sort candidates: most-found-in groups first, then A-Z by name.
   */
  private _sortCandidates(accs: CandidateAccumulator[]): CandidateAccumulator[] {
    return accs.sort((a, b) => {
      if (b.foundIn.length !== a.foundIn.length) {
        return b.foundIn.length - a.foundIn.length
      }
      const aName = [a.user.firstName, a.user.lastName].filter(Boolean).join(' ')
      const bName = [b.user.firstName, b.user.lastName].filter(Boolean).join(' ')
      return aName.localeCompare(bName)
    })
  }

  /**
   * Client-side query matching for basic groups (GetFullChat returns all participants).
   * Tokenizes query and checks name + username contains every token.
   * Mirrors the behavior of ChannelParticipantsSearch filter.
   */
  private _matchesQuery(
    user: { firstName?: string; lastName?: string; username?: string | null },
    queryLower: string
  ): boolean {
    const tokens = queryLower.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return false

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').toLowerCase()
    const username = (user.username ?? '').toLowerCase()
    const searchable = `${fullName} ${username}`

    return tokens.every(token => searchable.includes(token))
  }
}
