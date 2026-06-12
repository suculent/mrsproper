/**
 * GroupEnumerator — dialog enumeration with type classification and admin rights detection.
 *
 * Owns:
 *   - getDialogs() via governor.run() (all Telegram calls serialized through rate limiter)
 *   - Dialog classification: Api.Chat → basic-group, Api.Channel(megagroup) → supergroup,
 *     Api.Channel(!megagroup) → broadcast-channel
 *   - Admin rights detection per type (OQ-2: OR logic for basic groups)
 *   - GroupsState machine: idle → loading → loaded | error
 *   - _dialogMap: stores full dialog entities in main only (T-04-01 — never crosses IPC)
 *
 * Security (T-04-01):
 *   - _dialogMap stores full entity objects in the main process only (never crosses IPC)
 *   - AdminDialogDTO emitted to renderer is sanitised — see groupTypes.ts for the interface
 *   - TypeScript interface enforces the safety boundary by construction
 *
 * All Telegram API calls route through _governor.run() (mirrors TargetResolver.ts pattern).
 *
 * Avatar fetch is intentionally DEFERRED here (avatar=null) — fetching per-dialog avatar
 * would serialise through the governor for each group, blocking enumeration for potentially
 * dozens of groups. Avatar hydration is a Phase 4.x concern.
 */

import { Api } from 'telegram'
import type { GroupsState, AdminDialogDTO, GroupType, GreyReason } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import { classifyRpcError } from './operationErrors'

// ── Injectable client interface ────────────────────────────────────────────────

/**
 * Minimal client surface required by GroupEnumerator.
 * Matches the subset of TelegramClient that enumeration needs.
 */
export interface GroupEnumeratorClient {
  invoke(request: unknown): Promise<unknown>
  getDialogs(params?: unknown): Promise<unknown[]>
  downloadProfilePhoto(entity: unknown): Promise<Buffer | Uint8Array | null>
}

// ── Constructor options ─────────────────────────────────────────────────────────

export interface GroupEnumeratorOptions {
  /** The TelegramClient (real or mock). */
  client: GroupEnumeratorClient
  /** Shared account-wide RateLimitGovernor — all Telegram calls must go through it. */
  governor: RateLimitGovernor
  /** Called whenever GroupsState changes. Wired to win.webContents.send in production. */
  onStateChange: (state: GroupsState) => void
}

// ── GroupEnumerator ─────────────────────────────────────────────────────────────

export class GroupEnumerator {
  private readonly _client: GroupEnumeratorClient
  private readonly _governor: RateLimitGovernor
  private readonly _emit: (state: GroupsState) => void

  private _currentState: GroupsState = { step: 'idle' }

  /**
   * Stores full dialog entities keyed by id.toString().
   * Security (T-04-01): these objects MUST NOT cross the IPC boundary.
   * Only the sanitised AdminDialogDTO is sent to the renderer.
   */
  private _dialogMap: Map<string, unknown> = new Map()

  constructor(options: GroupEnumeratorOptions) {
    this._client = options.client
    this._governor = options.governor
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Enumerate all admin dialogs at login time.
   *
   * Emits: loading → (loaded | error)
   *
   * Uses ignoreMigrated=true to skip migrated basic groups (those have a Channel
   * supersession — enumerating both would create duplicates in the list).
   * Non-group dialogs (DMs, bots) are silently filtered out by _classifyDialog().
   */
  async enumerateAtLogin(): Promise<void> {
    this._emit({ step: 'loading' })

    try {
      // NOTE: do NOT use getDialogs({ ignoreMigrated: true }) — in telegram@2.26.x the
      // filter is inverted ("migratedTo" in entity keeps only Api.Chat objects), which
      // silently drops every supergroup/channel and keeps the migrated basic-group husks.
      // We fetch everything and filter migrated/deactivated husks in _classifyDialog.
      const dialogs = await this._governor.run(() =>
        this._client.getDialogs({})
      ) as unknown[]


      const classified: AdminDialogDTO[] = []
      for (const dialog of dialogs) {
        const dto = this._classifyDialog(dialog)
        if (dto !== null) {
          classified.push(dto)
        }
      }

      this._emit({ step: 'loaded', dialogs: classified })
    } catch (err) {
      const classified = classifyRpcError(err)
      // Map governor error taxonomy to GroupErrorCode
      const code =
        classified.code === 'FLOOD_WAIT' ? 'FLOOD_WAIT' :
        classified.code === 'NETWORK' ? 'NETWORK' :
        'UNKNOWN'
      this._emit({ step: 'error', code })
    }
  }

  /** Return the current GroupsState. */
  getState(): GroupsState {
    return this._currentState
  }

  /**
   * Return the full dialog entity stored for a given dialogId (main only).
   * Returns null if the id is unknown or enumeration hasn't run.
   *
   * Security (T-04-01): for main process use only — never pass the return value
   * to IPC handlers or serialise it for the renderer.
   */
  getDialogEntity(dialogId: string): unknown | null {
    return this._dialogMap.get(dialogId) ?? null
  }

  /**
   * Re-run enumeration (e.g., after login refresh or manual reload).
   * Clears the dialog map before re-enumerating.
   */
  async refresh(): Promise<void> {
    this._dialogMap.clear()
    await this.enumerateAtLogin()
  }

  // ── Private classification ───────────────────────────────────────────────────

  /**
   * Classify a single dialog into an AdminDialogDTO.
   *
   * Returns null for non-group dialogs (DMs, user-to-user chats) — these are filtered
   * from the enumerated list so only groups/channels appear.
   *
   * Uses instanceof discrimination per RESEARCH §Pattern 1 — NOT dialog.isGroup/isChannel
   * flags which can misclassify. The instanceof check is the authoritative GramJS pattern.
   *
   * OQ-2 (open question 2) resolved: For basic groups, use OR logic:
   *   canAct = entity.creator === true || entity.adminRights?.banUsers === true
   */
  private _classifyDialog(dialog: unknown): AdminDialogDTO | null {
    const entity = (dialog as { entity?: unknown })?.entity
    if (!entity) return null

    const title: string = (dialog as { title?: string })?.title ?? ''

    if (entity instanceof Api.Chat) {
      // Skip migrated/deactivated basic-group husks — the live supergroup appears
      // as its own Api.Channel dialog. GetFullChat on a husk returns
      // ChatParticipantsForbidden, so keeping it would create dead duplicates.
      const chatFlags = entity as unknown as { migratedTo?: unknown; deactivated?: boolean }
      if (chatFlags.migratedTo != null || chatFlags.deactivated === true) {
        return null
      }

      // Basic group
      const id = entity.id.toString()
      this._dialogMap.set(id, entity)

      const canAct = entity.creator === true || (entity.adminRights as { banUsers?: boolean } | null | undefined)?.banUsers === true
      const greyReason: GreyReason | null = canAct ? null : 'not-creator'

      return this._buildDTO({
        id,
        title,
        entity,
        type: 'basic-group',
        canAct,
        greyReason,
        // Api.Chat has no participantsCount in GramJS — it's on the full chat object
        memberCount: null,
      })
    }

    if (entity instanceof Api.Channel) {
      const id = entity.id.toString()
      this._dialogMap.set(id, entity)

      if (entity.megagroup) {
        // Supergroup (megagroup channel)
        // OQ-2 mirror: channel creators have adminRights=null in the Telegram API (all rights
        // are implicit). Use OR logic — same as basic-group — so creator-owned supergroups
        // are actionable even when adminRights is absent.
        const canAct = entity.creator === true || (entity.adminRights as { banUsers?: boolean } | null | undefined)?.banUsers === true
        const greyReason: GreyReason | null = canAct ? null : 'no-ban-right'
        const memberCount: number | null =
          typeof entity.participantsCount === 'number' ? entity.participantsCount : null

        return this._buildDTO({
          id,
          title,
          entity,
          type: 'supergroup',
          canAct,
          greyReason,
          memberCount,
        })
      } else {
        // Broadcast channel — admin can never remove members by kicking (different removal semantics)
        const memberCount: number | null =
          typeof entity.participantsCount === 'number' ? entity.participantsCount : null

        return this._buildDTO({
          id,
          title,
          entity,
          type: 'broadcast-channel',
          canAct: false,
          greyReason: 'broadcast-channel',
          memberCount,
        })
      }
    }

    // Not a group/channel (e.g., DM, user dialog) — skip
    return null
  }

  /**
   * Build a renderer-safe AdminDialogDTO.
   *
   * Security (T-04-01): the DTO type has no sensitive fields by construction.
   * The avatar field is always null here — avatar hydration is deferred (see module docblock).
   */
  private _buildDTO(params: {
    id: string
    title: string
    entity: Api.Chat | Api.Channel
    type: GroupType
    canAct: boolean
    greyReason: GreyReason | null
    memberCount: number | null
  }): AdminDialogDTO {
    return {
      id: params.id,
      title: params.title,
      avatar: null,  // Deferred — avatar fetch would serialize through governor per-group
      memberCount: params.memberCount,
      type: params.type,
      canAct: params.canAct,
      greyReason: params.greyReason,
    }
  }
}
