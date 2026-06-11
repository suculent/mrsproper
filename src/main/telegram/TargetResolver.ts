/**
 * TargetResolver — the single service for target resolution and state management.
 *
 * Owns:
 *   - username resolution via contacts.ResolveUsername
 *   - phone resolution via contacts.ResolvePhone (D-07 REVISED — no contact import)
 *   - bio fetch via users.GetFullUser (graceful — bio is null on any failure)
 *   - avatar download via downloadProfilePhoto (empty buffer → null)
 *   - resolved target state machine (idle → resolving → resolved | error)
 *   - confirm gate: resolved → confirmed (D-11)
 *   - reset: any state → idle (D-14)
 *
 * Security (T-03-01, T-03-05):
 *   - accessHash is stored ONLY in private fields (_resolvedAccessHash)
 *   - accessHash is NEVER included in emitted TargetState or ResolvedTargetDTO
 *   - getResolvedUser() is the ONLY way to retrieve accessHash — callable from main only
 *
 * All Telegram API calls route through _governor.run() (T-03-07, EXE-01).
 * Direct _client.invoke() calls are FORBIDDEN — all must be wrapped in _governor.run().
 *
 * bigint serialization (TGT-03, T-03-08):
 *   - user.id.toString() for DTO id — NEVER Number(user.id)
 *   - accessHash stored as bigint, reconstructed from bigint for Phase 4 API calls
 *
 * Modeled on SessionManager.ts — same DI pattern, same _emit helper convention.
 */

import { Api } from 'telegram'
import type { BigInteger } from 'big-integer'
import type { TargetState, ResolvedTargetDTO, TargetErrorCode } from '@shared/targetTypes'
import type { GovernorEvent } from '@shared/opTypes'
import { RateLimitGovernor } from './governor'
import { classifyRpcError } from './operationErrors'

// ── Injectable client interface ───────────────────────────────────────────────

/**
 * Minimal client surface required by TargetResolver.
 * Intentionally minimal — resolver only needs invoke + downloadProfilePhoto.
 * Matches the GovernorClient interface so both can be wired to the same client.
 */
export interface TargetResolverClient {
  invoke(request: unknown): Promise<unknown>
  downloadProfilePhoto(entity: unknown): Promise<Buffer | Uint8Array | null>
}

// ── Constructor options ────────────────────────────────────────────────────────

export interface TargetResolverOptions {
  /** The TelegramClient (real or mock). */
  client: TargetResolverClient
  /** Called whenever the target state changes (wired to win.webContents.send in production). */
  onStateChange: (state: TargetState) => void
  /**
   * The shared account-wide RateLimitGovernor (WR-01). In production this is
   * the SAME instance SessionManager uses — EXE-01's concurrency=1 guarantee
   * is per-instance, so all features over one client MUST share one governor.
   * Optional only as a test convenience: when omitted, a private instance is
   * constructed (wired to onGovernorEvent).
   */
  governor?: RateLimitGovernor
  /** Called on governor events (FLOOD_WAIT ticks, hard-stop, retry) — only used when `governor` is not injected. */
  onGovernorEvent?: (event: GovernorEvent) => void
}

// ── TargetResolver ─────────────────────────────────────────────────────────────

export class TargetResolver {
  private readonly _client: TargetResolverClient
  private readonly _governor: RateLimitGovernor
  private readonly _emit: (state: TargetState) => void

  private _currentState: TargetState = { step: 'idle' }
  private _resolvedUserId: bigint | null = null
  private _resolvedAccessHash: bigint | null = null

  /**
   * Generation token (WR-03): incremented by every resolve() and reset().
   * An in-flight resolution whose generation no longer matches is STALE — it
   * must not emit state and must not write _resolvedUserId/_resolvedAccessHash.
   * This makes displayed-identity vs acted-identity divergence impossible by
   * construction (a reset() or newer resolve() always invalidates older work).
   */
  private _generation = 0

  constructor(options: TargetResolverOptions) {
    this._client = options.client
    // WR-01: prefer the injected account-wide governor; construct a private
    // one only when none is supplied (unit tests).
    this._governor =
      options.governor ??
      new RateLimitGovernor({
        client: options.client,
        onEvent: options.onGovernorEvent,
      })
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Resolve a target by username or phone number.
   *
   * Input routing (D-01, D-02, D-04):
   *   - starts with '+' or all-digits → phone path
   *   - otherwise → username path
   *
   * Link normalization (D-04):
   *   - strip https://, http://
   *   - strip t.me/
   *   - strip leading @
   *   - t.me/+phone → phone path
   *
   * Emits: resolving → (resolved | error)
   */
  async resolve(input: string): Promise<void> {
    // WR-03: claim a new generation — invalidates any older in-flight resolve.
    const gen = ++this._generation
    const normalized = normalizeInput(input.trim())

    this._emit({ step: 'resolving' })

    try {
      let dto: ResolvedTargetDTO
      if (isPhoneInput(normalized)) {
        dto = await this._resolveByPhone(normalized, gen)
      } else {
        dto = await this._resolveByUsername(stripLeadingAt(normalized), gen)
      }
      // WR-03: a reset() or newer resolve() superseded this resolution while it
      // was in flight — discard silently (the newer state already won).
      if (gen !== this._generation) return
      this._emit({ step: 'resolved', target: dto })
    } catch (err) {
      if (gen !== this._generation) return // WR-03: stale — never emit
      const classified = classifyRpcError(err)
      this._emit({
        step: 'error',
        code: classified.code as TargetErrorCode,
        input,
      })
    }
  }

  /**
   * Advance state from resolved → confirmed.
   * No-op if not in resolved state.
   * D-11: explicit confirm gate before Phase 4 can use the resolved target.
   */
  confirm(): void {
    if (this._currentState.step === 'resolved') {
      this._emit({ step: 'confirmed', target: this._currentState.target })
    }
  }

  /**
   * Reset to idle state; clear private access hash and user ID.
   * D-14: "Change target" resets flow and all downstream state.
   */
  reset(): void {
    // WR-03: invalidate any in-flight resolve BEFORE clearing state, so a
    // pending resolution cannot resurrect the cleared target afterwards.
    this._generation++
    this._resolvedUserId = null
    this._resolvedAccessHash = null
    this._emit({ step: 'idle' })
  }

  /** Return the current target state. */
  getState(): TargetState {
    return this._currentState
  }

  /**
   * Return the resolved user's bigint id + accessHash for Phase 4 API calls.
   * Returns null if not yet resolved or after reset().
   *
   * Security (T-03-01, T-03-05): this method is for MAIN PROCESS USE ONLY.
   * It MUST NOT be called from renderer-facing code or IPC handlers.
   * The accessHash must never cross to the renderer.
   */
  getResolvedUser(): { id: bigint; accessHash: bigint } | null {
    if (this._resolvedUserId === null || this._resolvedAccessHash === null) {
      return null
    }
    return { id: this._resolvedUserId, accessHash: this._resolvedAccessHash }
  }

  // ── Private resolution paths ───────────────────────────────────────────────

  /**
   * Resolve by @username via contacts.ResolveUsername.
   *
   * Pattern 1 (RESEARCH): Direct invoke preserves RPCError.errorMessage intact so
   * classifyRpcError can map USERNAME_NOT_OCCUPIED → TARGET_USERNAME_NOT_FOUND.
   * NEVER use client.getEntity() here — it wraps the error and defeats the classifier.
   */
  private async _resolveByUsername(username: string, gen: number): Promise<ResolvedTargetDTO> {
    const resolved = await this._governor.run(() =>
      this._client.invoke(new Api.contacts.ResolveUsername({ username }))
    ) as { peer: unknown; users: unknown[] }

    // Verify peer is a user (not a channel/group). CR-02: GramJS `long` fields
    // are `big-integer` library objects (typeof === 'object'), NEVER native
    // bigint — duck-type on presence and compare via decimal-string form.
    const peerUserId = (resolved.peer as { userId?: LongLike } | null | undefined)?.userId
    if (peerUserId === undefined || peerUserId === null) {
      // Peer is not a user — treat as no public profile. CR-03: the thrown
      // error must carry errorMessage so the outer catch in resolve() can
      // classify it (an error without errorMessage misclassifies as NETWORK).
      throw Object.assign(new Error('TARGET_NO_PUBLIC_PROFILE'), {
        errorMessage: 'TARGET_NO_PUBLIC_PROFILE',
      })
    }
    const peerIdStr = peerUserId.toString()

    // CR-02: big-integer objects are never reference-equal — compare toString().
    const targetUser = (resolved.users as Array<{ id: LongLike }>).find(
      (u) => u.id.toString() === peerIdStr
    ) as ApiUserShape | undefined

    if (!targetUser) {
      const err = { errorMessage: 'USERNAME_NOT_OCCUPIED' }
      throw Object.assign(new Error('USERNAME_NOT_OCCUPIED'), err)
    }

    // WR-03: a reset()/newer resolve() invalidated this resolution mid-flight —
    // do NOT write the private identity fields, do NOT spend further governed
    // API calls on bio/avatar. resolve()'s catch sees the stale gen and stays silent.
    if (gen !== this._generation) {
      throw STALE_RESOLUTION
    }

    // Store access hash privately (T-03-05 — never in DTO).
    // Normalized to native bigint via decimal string (works for both GramJS
    // BigInteger objects and the mock's values) — Phase 4 reconstructs the
    // GramJS long with bigInt(id.toString()) when building Api.InputPeerUser.
    this._resolvedUserId = BigInt(targetUser.id.toString())
    this._resolvedAccessHash =
      targetUser.accessHash != null ? BigInt(targetUser.accessHash.toString()) : BigInt(0)

    const bio = await this._fetchBio(targetUser)
    const avatar = await this._fetchAvatar(targetUser)

    return this._buildDTO(targetUser, bio, avatar)
  }

  /**
   * Resolve by phone via contacts.ResolvePhone (D-07 REVISED).
   * No contact import, no contact pollution, no cleanup path.
   * RPCError 'PHONE_NOT_OCCUPIED' is caught by classifyRpcError → TARGET_PHONE_NOT_FOUND.
   */
  private async _resolveByPhone(phone: string, gen: number): Promise<ResolvedTargetDTO> {
    const resolved = await this._governor.run(() =>
      this._client.invoke(new Api.contacts.ResolvePhone({ phone }))
    ) as { peer: unknown; users: unknown[] }

    // CR-02: same big-integer duck-typing as the username path — see comments there.
    const peerUserId = (resolved.peer as { userId?: LongLike } | null | undefined)?.userId
    if (peerUserId === undefined || peerUserId === null) {
      // CR-03: carry errorMessage so the outer catch classifies correctly.
      throw Object.assign(new Error('TARGET_NO_PUBLIC_PROFILE'), {
        errorMessage: 'TARGET_NO_PUBLIC_PROFILE',
      })
    }
    const peerIdStr = peerUserId.toString()

    const targetUser = (resolved.users as Array<{ id: LongLike }>).find(
      (u) => u.id.toString() === peerIdStr
    ) as ApiUserShape | undefined

    if (!targetUser) {
      const err = { errorMessage: 'PHONE_NOT_OCCUPIED' }
      throw Object.assign(new Error('PHONE_NOT_OCCUPIED'), err)
    }

    // WR-03: stale-resolution guard — see username path.
    if (gen !== this._generation) {
      throw STALE_RESOLUTION
    }

    // Store access hash privately (T-03-05 — never in DTO); normalized to
    // native bigint via decimal string (see username path).
    this._resolvedUserId = BigInt(targetUser.id.toString())
    this._resolvedAccessHash =
      targetUser.accessHash != null ? BigInt(targetUser.accessHash.toString()) : BigInt(0)

    const bio = await this._fetchBio(targetUser)
    const avatar = await this._fetchAvatar(targetUser)

    return this._buildDTO(targetUser, bio, avatar)
  }

  /**
   * Fetch bio from users.GetFullUser (VRF-02).
   * Graceful degradation: any failure → bio = null; resolution still proceeds (Pitfall 5).
   */
  private async _fetchBio(user: ApiUserShape): Promise<string | null> {
    // Without an access hash GetFullUser cannot address the user — skip the
    // call entirely (graceful: bio stays null) rather than sending a zero hash.
    if (user.accessHash === undefined || user.accessHash === null) return null
    try {
      // CR-02: user.id/accessHash come straight from the GramJS response, so in
      // production they already ARE big-integer objects — pass them through
      // unchanged (the casts only bridge the LongLike duck-type to the TL type).
      const inputPeer = new Api.InputPeerUser({
        userId: user.id as BigInteger,
        accessHash: user.accessHash as BigInteger,
      })
      const fullResult = await this._governor.run(() =>
        this._client.invoke(new Api.users.GetFullUser({ id: inputPeer }))
      ) as { fullUser: { about?: string | null } }
      return fullResult.fullUser.about ?? null
    } catch {
      return null
    }
  }

  /**
   * Fetch avatar via downloadProfilePhoto (VRF-01).
   * Empty buffer (length === 0) or null → avatar: null (D-12 fallback).
   * Graceful degradation (WR-02, mirrors _fetchBio): a thrown download error
   * (expired file reference, transient network failure after the governor's
   * retry budget) must NOT abort an already-successful identity resolution —
   * D-12 documents the no-photo fallback (initials avatar + notice) for
   * exactly this case.
   */
  private async _fetchAvatar(user: ApiUserShape): Promise<Uint8Array | null> {
    try {
      const photoBuffer = await this._governor.run(() =>
        this._client.downloadProfilePhoto(user)
      )
      if (photoBuffer && (photoBuffer as Buffer | Uint8Array).length > 0) {
        return new Uint8Array(photoBuffer as Buffer | Uint8Array)
      }
      return null
    } catch {
      return null // D-12: fall back to initials avatar + no-photo notice
    }
  }

  /**
   * Build a renderer-safe ResolvedTargetDTO from a resolved Api.User.
   *
   * Security (T-03-01, T-03-08):
   *   - id = user.id.toString() — NEVER Number(user.id) (bigint precision loss)
   *   - accessHash is NOT included in the DTO (stays in main only)
   *   - deleted + bot populated for renderer badge display (D-18)
   */
  private _buildDTO(user: ApiUserShape, bio: string | null, avatar: Uint8Array | null): ResolvedTargetDTO {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || (user.firstName ?? '')

    return {
      id: user.id.toString(),  // TGT-03: bigint.toString(), NEVER Number()
      name,
      username: user.username ?? null,
      bio,
      avatar,
      deleted: user.deleted ?? false,   // D-18: renderer badge
      bot: user.bot ?? false,           // D-18: renderer badge
      premium: user.premium ?? false,
      lastSeen: humanizeLastSeen(user.status),
    }
  }
}

// ── Stale-resolution sentinel (WR-03) ─────────────────────────────────────────
// Thrown inside the private resolution paths when the generation token no longer
// matches. resolve()'s catch block checks the generation BEFORE classifying, so
// this sentinel never reaches the user — it only short-circuits stale work.

const STALE_RESOLUTION = new Error('STALE_RESOLUTION')

// ── Minimal shapes for API objects ────────────────────────────────────────────

/**
 * Duck-type for GramJS `long` values (CR-02): the runtime deserializer produces
 * `big-integer` library objects — plain objects with a decimal toString(), NOT
 * native bigint. The mock client mirrors this shape. Never use `typeof x ===
 * 'bigint'` or `===` on these values — duck-type on toString() instead.
 */
interface LongLike {
  toString(): string
}

// Minimal shape for API user objects —
// used internally to type both real Api.User and mock user objects

interface ApiUserShape {
  id: LongLike
  accessHash?: LongLike | null
  firstName?: string
  lastName?: string
  username?: string | null
  deleted?: boolean
  bot?: boolean
  premium?: boolean
  status?: Api.TypeUserStatus | undefined
}

// ── Input normalization ────────────────────────────────────────────────────────

/**
 * Normalize a raw user input to a canonical form.
 * Strips protocol, t.me/ prefix, and handles t.me/+phone forms.
 * D-04 normalization rules.
 */
function normalizeInput(raw: string): string {
  let s = raw

  // Strip protocol
  s = s.replace(/^https?:\/\//i, '')

  // Strip t.me/ prefix
  s = s.replace(/^t\.me\//i, '')

  // After t.me/ strip, a '+' means phone: t.me/+420... → +420...
  // This is already handled — remaining '+...' will be detected as phone

  return s
}

/**
 * Return true if input should be treated as a phone number.
 * D-01/D-02: starts with '+', or is all digits.
 */
function isPhoneInput(s: string): boolean {
  return s.startsWith('+') || /^\d+$/.test(s)
}

/** Strip leading '@' from username inputs. */
function stripLeadingAt(s: string): string {
  return s.startsWith('@') ? s.slice(1) : s
}

// ── UserStatus humanization ────────────────────────────────────────────────────

/**
 * Convert a UserStatus to a human-readable last-seen string.
 * Pattern 6 from RESEARCH.md — UI-SPEC wording.
 *
 * Maps:
 *   UserStatusOnline       → 'Online'
 *   UserStatusOffline      → 'Last seen {humanized date}'
 *   UserStatusRecently     → 'Last seen recently'
 *   UserStatusLastWeek     → 'Last seen a long time ago'
 *   UserStatusLastMonth    → 'Last seen a long time ago'
 *   null/undefined/Empty   → null
 */
function humanizeLastSeen(status: Api.TypeUserStatus | undefined | null): string | null {
  if (!status) return null
  if (status instanceof Api.UserStatusOnline) return 'Online'
  if (status instanceof Api.UserStatusOffline) {
    const date = new Date(status.wasOnline * 1000)
    return `Last seen ${date.toLocaleDateString()}`
  }
  if (status instanceof Api.UserStatusRecently) return 'Last seen recently'
  if (status instanceof Api.UserStatusLastWeek) return 'Last seen a long time ago'
  if (status instanceof Api.UserStatusLastMonth) return 'Last seen a long time ago'
  if (status instanceof Api.UserStatusEmpty) return null
  return null
}
