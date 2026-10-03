/**
 * tagClient.ts — isolated tag-write connection wrapper (Phase 9 Plan 02; layer-neutral since TL229)
 *
 * `TagClient` is an isolated connection wrapper (separate from the main client,
 * same `StringSession`) that routes all invokes through the shared
 * `RateLimitGovernor`. It no longer mutates any global TL layer because the
 * whole package now runs at layer 229 (via `scripts/tl-apply.mjs`, see
 * `vendor/telegram-api.tl`), so `editChatParticipantRank`'s layer-229
 * constructors deserialize normally through the main deserializer.
 *
 * Write-only: do NOT invoke getDialogs/getParticipants on this client.
 *
 * Production wiring (Phase 11): TagExecutor constructs a TagClient with the
 * real TelegramClient (same StringSession as the main client) and the shared
 * governor from src/main/index.ts. That wiring is NOT part of this module.
 *
 * The `_connecting` flag prevents a concurrent double-connect; it is an
 * independent protection unrelated to any TL layer concern. NOTE: main-client
 * reconnect-race mitigation (TagClient opened only when the main client is
 * quiescent) is handled by the higher-level open/close lifecycle contract in
 * Phase 11 — this flag is the TagClient-local guard only.
 */

import type { RateLimitGovernor } from './governor'

// ── Unparseable-response detection ─────────────────────────────────────────────

/**
 * True when `err` is GramJS's TypeNotFoundError for an unparseable response.
 * This fallback is retained defensively for any future unparseable response,
 * independent of layer (the client now runs at the package's ambient global
 * layer, 229, set once by `scripts/tl-apply.mjs`, not patched per-connection).
 * Detection mirrors the Phase 0 spike exactly: `.invalidConstructorId` (set by
 * TypeNotFoundError) or a message naming the Constructor ID. A real RPCError
 * has `.errorMessage` instead and must NOT match this.
 */
function isUnparseableUpdatesResponse(err: unknown): boolean {
  if ((err as { invalidConstructorId?: unknown })?.invalidConstructorId != null) return true
  const msg =
    (err as { errorMessage?: string })?.errorMessage ??
    (err as { message?: string })?.message ??
    ''
  return /Constructor ID/i.test(msg)
}

// ── Injectable inner client interface ─────────────────────────────────────────

/**
 * Minimal surface of the inner TelegramClient that TagClient needs.
 * The real TelegramClient satisfies this; tests inject a mock.
 */
export interface TagClientInner {
  connect(): Promise<void>
  disconnect(): Promise<void>
  invoke(request: unknown): Promise<unknown>
}

// ── Constructor options ────────────────────────────────────────────────────────

export interface TagClientOptions {
  /** Injectable inner TelegramClient (real or mock). */
  inner: TagClientInner
  /** Shared account-wide RateLimitGovernor — all invokes MUST route through it. */
  governor: RateLimitGovernor
}

// ── TagClient ──────────────────────────────────────────────────────────────────

export class TagClient {
  private readonly _inner: TagClientInner
  private readonly _governor: RateLimitGovernor

  /**
   * Guard flag: true while a connect() call is in flight.
   *
   * Prevents a second concurrent connect() from racing with the first. This is
   * an independent protection from any TL layer concern.
   *
   * NOTE: Phase 11 adds the higher-level contract that TagClient is opened only
   * when the main client is quiescent — this flag is the TagClient-local guard.
   */
  private _connecting = false

  constructor(options: TagClientOptions) {
    this._inner = options.inner
    this._governor = options.governor
  }

  /**
   * Connect the inner client.
   *
   * Guard: throws if called while a prior connect() is in flight — prevents
   * a double-connection.
   */
  async connect(): Promise<void> {
    if (this._connecting) {
      throw new Error('TagClient: connect() already in progress')
    }
    this._connecting = true

    try {
      await this._inner.connect()
    } finally {
      this._connecting = false
    }
  }

  /**
   * Invoke a request through the shared governor.
   *
   * ALL tag writes MUST pass through governor.run() — never call _inner.invoke()
   * directly. The governor serializes this call behind any in-flight removal or
   * enumeration calls (EXE-01 concurrency=1 guarantee is account-wide).
   *
   * Write-only: do NOT pass getDialogs/getParticipants requests here.
   */
  async invoke(request: unknown): Promise<unknown> {
    return this._governor.run(async () => {
      try {
        return await this._inner.invoke(request)
      } catch (err) {
        // This fallback is retained defensively for any future unparseable response,
        // independent of layer (the client now runs at the package's ambient global
        // layer, 229, set once by scripts/tl-apply.mjs, not patched per-connection).
        // If GramJS ever throws a TypeNotFoundError-shaped error here
        // (.invalidConstructorId set; message contains "Constructor ID"), we treat it
        // as an accepted write and swallow it HERE, inside the governor callback, so
        // the governor does not classify it as NETWORK and retry an already-applied
        // write. Genuine RPC errors (CHAT_ADMIN_REQUIRED, USER_NOT_PARTICIPANT,
        // FLOOD_WAIT, PEER_FLOOD) carry an `errorMessage` and are re-thrown for the
        // governor / executor to handle.
        if (isUnparseableUpdatesResponse(err)) {
          return { _tagWriteAccepted: true }
        }
        throw err
      }
    })
  }

  /**
   * Disconnect and tear down the inner client.
   * Call this after the tag run completes to release the isolated connection.
   */
  async disconnect(): Promise<void> {
    await this._inner.disconnect()
  }
}
