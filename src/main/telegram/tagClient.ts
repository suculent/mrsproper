/**
 * tagClient.ts — layer-224 isolated connection helper (Phase 9 Plan 02)
 *
 * Provides a `TagClient` wrapper that performs "patch-connect-restore" of the
 * `AllTLObjects.LAYER` global and routes all invokes through the shared
 * `RateLimitGovernor`. This is the ONLY place in the codebase where the LAYER
 * global is mutated; it is tightly scoped and immediately restored after connect
 * resolves (or throws), so the main layer-198 client is never affected.
 *
 * Design (LOCKED — proven by Phase 0 spike, §4.3 of design spec):
 *   1. `require('telegram/tl/AllTLObjects').LAYER = 224` immediately before connect()
 *   2. `await this._inner.connect()` — GramJS reads LAYER at connect-time
 *   3. `require('telegram/tl/AllTLObjects').LAYER = <prevLayer>` in finally block
 *
 * The finally block guarantees LAYER is restored to its prior value (always 198
 * in production) even if connect() throws. The `_connecting` flag prevents a
 * concurrent double-connect from mutating LAYER twice simultaneously.
 *
 * Write-only: do NOT invoke getDialogs/getParticipants on this client.
 *
 * Production wiring (Phase 11): TagExecutor constructs a TagClient with the
 * real TelegramClient (same StringSession as the main client) and the shared
 * governor from src/main/index.ts. That wiring is NOT part of this module.
 *
 * NOTE: main-client reconnect-race mitigation is deferred to Phase 11 per spec
 * §4.3 — a full cross-client mutex would couple TagClient to the main client's
 * internals, which is outside Phase 9 scope. The `_connecting` flag prevents
 * double-mutation within TagClient itself; Phase 11 adds the open/close lifecycle
 * contract (TagClient is opened only when no removal run is in flight).
 */

import type { RateLimitGovernor } from './governor'

// ── Unparseable-response detection ─────────────────────────────────────────────

/**
 * True when `err` is GramJS's TypeNotFoundError for an unparseable response — i.e. the
 * layer-224 `Updates` returned by editChatParticipantRank could not be deserialized at
 * layer 198. This is the EXPECTED, harmless outcome of a successful write (Phase 0 spike):
 * the server applied the tag, only the response is unreadable here. Detection mirrors the
 * spike exactly: `.invalidConstructorId` (set by TypeNotFoundError) or a message naming the
 * Constructor ID. A real RPCError has `.errorMessage` instead and must NOT match this.
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
   * Prevents a second concurrent connect() from patching LAYER to 224 while the
   * first patch window is still open. Also prevents the first call from racing
   * with the restore step of a concurrently finishing connect.
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
   * Connect the inner client at layer 224 using patch-connect-restore.
   *
   * Guard: throws if called while a prior connect() is in flight — prevents
   * double-connection and double LAYER mutation.
   *
   * Patch-connect-restore sequence (LOCKED — proven by Phase 0 spike):
   *   1. allTl.LAYER = 224
   *   2. await this._inner.connect()   ← server handshake at layer 224
   *   3. allTl.LAYER = prevLayer (198) ← restore IMMEDIATELY, in finally block
   *
   * The finally block ensures LAYER is always restored even if connect() throws.
   * `require('telegram/tl/AllTLObjects')` is called INSIDE this method body so
   * vi.mock() can intercept it in tests (module-scope imports bypass the mock).
   */
  async connect(): Promise<void> {
    if (this._connecting) {
      throw new Error('TagClient: connect() already in progress')
    }
    this._connecting = true

    // Read AllTLObjects inside the method body so vi.mock intercepts correctly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const allTl: { LAYER: number } = require('telegram/tl/AllTLObjects')
    const prevLayer = allTl.LAYER // capture current (should always be 198 in production)

    try {
      allTl.LAYER = 224
      await this._inner.connect()
    } finally {
      // Restore unconditionally — even if connect() threw.
      allTl.LAYER = prevLayer
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
        // editChatParticipantRank returns an `Updates` that carries layer-224 constructors.
        // After connect(), AllTLObjects.LAYER is restored to 198, so the layer-198 deserializer
        // cannot parse the response and GramJS throws TypeNotFoundError (.invalidConstructorId
        // set; message contains "Constructor ID"). The WRITE was already accepted server-side —
        // this is the EXPECTED success path, proven by the Phase 0 spike
        // (scripts/spike-member-tag.mjs). We must swallow it HERE, inside the governor callback,
        // so the governor does not classify it as NETWORK and retry the (already-applied) write.
        // Genuine RPC errors (CHAT_ADMIN_REQUIRED, USER_NOT_PARTICIPANT, FLOOD_WAIT, PEER_FLOOD)
        // carry an `errorMessage` and are re-thrown for the governor / executor to handle.
        if (isUnparseableUpdatesResponse(err)) {
          return { _tagWriteAccepted: true }
        }
        throw err
      }
    })
  }

  /**
   * Disconnect and tear down the inner client.
   * Call this after the tag run completes to release the layer-224 connection.
   */
  async disconnect(): Promise<void> {
    await this._inner.disconnect()
  }
}
