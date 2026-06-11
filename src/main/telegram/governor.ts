/**
 * Rate-Limit Governor (EXE-01, EXE-02, EXE-03, D-05 through D-14).
 *
 * RateLimitGovernor.run(fn) is the SINGLE entry point for all post-auth Telegram calls.
 * Every feature built in Phase 3+ funnels through this class — "no feature can flood the
 * account" because the governor enforces:
 *
 *   EXE-01 Serialization: hand-rolled tail-chain (_tail) enforces concurrency=1 — a second
 *          call cannot start until the first resolves (T-02-05 mitigation).
 *   EXE-02 FLOOD_WAIT: sleeps seconds + jitter, drives a 1-Hz countdown via FloodWaitController
 *          (D-07/D-09), enforces a 3600s ceiling (D-12 / T-02-04 mitigation).
 *   EXE-03 PEER_FLOOD: classifyRpcError() returns hard-stop disposition — governor throws
 *          immediately with zero retries (D-13 / T-02-03 mitigation).
 *   D-14 Transient retry: bounded 3-attempt exponential backoff [1s, 2s, 4s] for NETWORK/
 *          transient errors; throws after MAX_TRANSIENT_RETRIES (T-02-07 mitigation).
 *
 * T-02-06: onEvent emits only typed GovernorEvent objects — NO raw errorMessage strings,
 *          NO GramJS Error objects. classifyRpcError normalizes all raw errors before emission.
 *
 * FLOOD_WAIT sleep: FloodWaitController drives the 1-Hz countdown tick (TimingSource seam).
 * The governor ALSO sleeps for the full duration via globalThis.setTimeout. The sleep and
 * countdown run independently — after setTimeout resolves, this._floodController.stop() cancels
 * any remaining ticks. vi.useFakeTimers() replaces globalThis.setTimeout globally (Assumption A4).
 */

import type { GovernorEvent, ClassifiedOperationError } from '@shared/opTypes'
import { FloodWaitController, TimingSource } from './floodWait'
import { classifyRpcError } from './operationErrors'

// ── Injectable client interface ────────────────────────────────────────────
// Minimal surface — governor.run() calls the caller-supplied fn(), not the client directly.
// The interface exists for type-safe dependency injection; methods beyond invoke are optional
// since the governor itself only passes the client to callers via GovernorOptions.

export interface GovernorClient {
  invoke(request: unknown): Promise<unknown>
  getMe?: () => Promise<unknown>
  downloadProfilePhoto?: (entity: unknown) => Promise<Buffer | Uint8Array | null>
}

// ── Constructor options ────────────────────────────────────────────────────

export interface GovernorOptions {
  /** The Telegram client (real or mock). Only invoke() is required by the governor itself. */
  client: GovernorClient
  /** Injectable timing source for FloodWaitController (D-18 seam). Tests supply fake timers. */
  timingSource?: TimingSource
  /** Optional event callback — receives GovernorEvents during run() execution. */
  onEvent?: (event: GovernorEvent) => void
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum FLOOD_WAIT seconds the governor will sleep for (D-12 / T-02-04). */
const FLOOD_CEILING_S = 3600

/**
 * Maximum FLOOD_WAITs absorbed for a SINGLE operation before giving up (review WR-06).
 * Without this cap, a server returning FLOOD_WAIT on every attempt loops forever —
 * and because EXE-01 serializes everything through _tail, one pathological call would
 * starve every subsequently enqueued operation (including logout) indefinitely.
 * Exceeding the budget emits a 'wait-too-long' event and re-throws the flood error.
 * NOTE: an AbortSignal-based cancellation lever is deliberately deferred to Phase 5
 * (job-abort API) — this budget is the Phase 2 safety net.
 */
const MAX_FLOOD_WAITS_PER_OP = 3

/** Maximum transient (NETWORK/retry) retry attempts before throwing (D-14 / T-02-07). */
const MAX_TRANSIENT_RETRIES = 3

/** Exponential backoff base delays for transient retries [attempt 0, 1, 2] (D-14). */
const BACKOFF_BASE_MS = [1000, 2000, 4000]

// ── RateLimitGovernor ──────────────────────────────────────────────────────

export class RateLimitGovernor {
  private readonly _onEvent: (event: GovernorEvent) => void
  private readonly _floodController: FloodWaitController

  /** Hand-rolled serial tail-chain — concurrency=1 without any external queue library (T-02-05). */
  private _tail: Promise<void> = Promise.resolve()

  constructor(options: GovernorOptions) {
    // options.client is accepted for type-safe DI and future Phase 3+ governor-wired calls.
    // governor.run() calls caller-supplied fn() directly — the client is not invoked by the
    // governor itself (Phase 3+ callers capture their client reference via closure).
    void options.client
    this._onEvent = options.onEvent ?? (() => {})
    this._floodController = new FloodWaitController(options.timingSource)
  }

  /**
   * Run fn() under governor policy (serialization + FLOOD_WAIT + PEER_FLOOD + retry).
   *
   * Chains fn onto _tail to enforce serialization (EXE-01): a second call waits until
   * the first fully resolves before starting. Returns the result promise directly.
   *
   * @param fn  The async operation to execute (e.g., () => client.invoke(request))
   */
  run<T>(fn: () => Promise<T>): Promise<T> {
    // Create a promise that resolves/rejects with the result of _executeWithPolicy(fn),
    // chained AFTER the current _tail so execution is strictly sequential (EXE-01).
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const resultPromise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    // Chain onto tail — when the previous operation completes, start this one.
    // The tail never rejects (swallow errors), so subsequent operations always start.
    this._tail = this._tail.then(() =>
      this._executeWithPolicy(fn).then(resolve, reject)
    )

    // Attach an immediate no-op rejection handler to suppress Node.js "unhandled rejection"
    // warnings when the promise rejects before the caller attaches their handler (e.g., inside
    // vi.advanceTimersByTimeAsync). The caller's handler still fires normally.
    resultPromise.catch(() => {})

    return resultPromise
  }

  /**
   * Execute fn() with full governor policy: FLOOD_WAIT sleep, PEER_FLOOD hard-stop,
   * transient retry backoff. Private — called by run() after serialization.
   */
  private async _executeWithPolicy<T>(fn: () => Promise<T>): Promise<T> {
    let transientAttempts = 0
    let floodWaits = 0

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await fn()
      } catch (err) {
        const classified: ClassifiedOperationError = classifyRpcError(err)

        if (classified.disposition === 'hard-stop') {
          // PEER_FLOOD — abort immediately, no retry (EXE-03 / D-13).
          // Emit hard-stop event BEFORE re-throwing so Phase 5 can abort the job.
          this._onEvent({ type: 'hard-stop', code: classified.code })
          throw err
        }

        if (classified.disposition === 'wait') {
          // FLOOD_WAIT — sleep server-specified duration + jitter, then retry (EXE-02 / D-10).
          const seconds = classified.retryAfterSeconds ?? 0

          // D-12 / T-02-04: ceiling check — waits above 3600s throw rather than blocking.
          if (seconds > FLOOD_CEILING_S) {
            this._onEvent({ type: 'wait-too-long', seconds })
            throw err
          }

          // WR-06: bounded flood budget per operation — a persistently flooding call
          // must not retry forever and starve the serialized pipeline (EXE-01).
          floodWaits += 1
          if (floodWaits > MAX_FLOOD_WAITS_PER_OP) {
            this._onEvent({ type: 'wait-too-long', seconds })
            throw err
          }

          // Start countdown (D-09: emits flood-tick events at 1 Hz via FloodWaitController).
          // The countdown and the sleep run independently.
          this._floodController.start(
            seconds,
            (tick) => this._onEvent({ type: 'flood-tick', remaining: tick.remaining }),
            () => {}
          )

          // D-10: sleep for seconds + additive jitter.
          // Jitter J = clamp(0.1 * seconds, 1s, 5s); sleep = (seconds + random * J) * 1000ms.
          const J = Math.min(Math.max(0.1 * seconds, 1), 5)
          const totalMs = (seconds + Math.random() * J) * 1000
          await new Promise<void>((resolve) => globalThis.setTimeout(resolve, totalMs))

          // Stop any remaining countdown ticks after sleep completes.
          this._floodController.stop()

          // Continue loop — FLOOD_WAIT retries are NOT counted against transient budget.
          continue
        }

        if (classified.disposition === 'retry') {
          // Transient (NETWORK) error — bounded retry with exponential backoff (D-14 / T-02-07).
          if (transientAttempts >= MAX_TRANSIENT_RETRIES) {
            throw err
          }

          // Emit retry event before sleeping.
          this._onEvent({
            type: 'retry-attempt',
            attempt: transientAttempts + 1,
            maxAttempts: MAX_TRANSIENT_RETRIES,
          })

          // Exponential backoff: [1000, 2000, 4000] ms + up to 500ms jitter.
          const backoffMs = BACKOFF_BASE_MS[transientAttempts] + Math.random() * 500
          await new Promise<void>((resolve) => globalThis.setTimeout(resolve, backoffMs))

          transientAttempts++
          continue
        }

        // disposition === 'fail' | 'skip' | anything else — propagate immediately.
        throw err
      }
    }
  }
}
