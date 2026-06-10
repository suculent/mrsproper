/**
 * FLOOD_WAIT parsing and countdown controller (D-13, D-18, RESEARCH Pattern 5).
 *
 * Two exported utilities:
 *
 * 1. floodWaitSeconds(err) — parse the wait duration from a GramJS FloodWaitError or RPCError.
 *    Reads err.seconds first (FloodWaitError shape), falls back to FLOOD_WAIT_<n> regex on
 *    errorMessage/message. Returns null for non-flood errors.
 *
 * 2. startFloodCountdown(seconds, onTick, onDone) — start a 1-Hz countdown.
 *    Emits onTick(remaining) each second from seconds-1 down to 0.
 *    Calls onDone() when the countdown reaches 0, then stops.
 *    Returns a stop() function for early cancellation.
 *
 * D-18 seam: the timing source is injectable via the optional `timingSource` parameter on
 * startFloodCountdown. Phase 2's governor can supply its own setInterval/clearInterval so
 * both auth-login floods and bulk-operation floods share the same countdown mechanism without
 * UI rework. Tests drive it with vi.useFakeTimers() which replaces globalThis.setInterval.
 *
 * The countdown emission is intentionally decoupled from any UI concern — callers decide
 * what to do with each FloodTick (emit over IPC, update React state, etc.).
 */

import type { FloodTick } from '@shared/authTypes'

// ── floodWaitSeconds ────────────────────────────────────────────────────────

/**
 * Parse the FLOOD_WAIT duration from a GramJS error.
 *
 * Priority:
 *   1. err.seconds (FloodWaitError shape — GramJS already parsed the value)
 *   2. /FLOOD_WAIT_(\d+)/ on errorMessage (RPCError shape)
 *   3. /FLOOD_WAIT_(\d+)/ on message (plain Error shape)
 *   4. null — not a flood-wait error
 */
export function floodWaitSeconds(err: unknown): number | null {
  if (err === null || err === undefined) return null

  // Primary: GramJS FloodWaitError exposes .seconds directly
  const seconds = (err as { seconds?: unknown })?.seconds
  if (typeof seconds === 'number') return seconds

  // Fallback: parse FLOOD_WAIT_<n> from errorMessage (RPCError) or message (plain Error)
  const haystack =
    (err as { errorMessage?: string })?.errorMessage ??
    (err as { message?: string })?.message ??
    ''

  const m = /FLOOD_WAIT_(\d+)/.exec(haystack)
  if (m) return Number(m[1])

  return null
}

// ── Timing source injection (D-18) ─────────────────────────────────────────

export interface TimingSource {
  setInterval(callback: () => void, ms: number): ReturnType<typeof globalThis.setInterval>
  clearInterval(handle: ReturnType<typeof globalThis.setInterval>): void
}

const DEFAULT_TIMING: TimingSource = {
  setInterval: (cb, ms) => globalThis.setInterval(cb, ms),
  clearInterval: (h) => globalThis.clearInterval(h),
}

// ── startFloodCountdown ─────────────────────────────────────────────────────

/**
 * Start a 1-Hz countdown from `seconds`.
 *
 * Tick schedule (confirmed by floodWait.test.ts):
 *   After 1s:  onTick(seconds - 1)
 *   After 2s:  onTick(seconds - 2)
 *   …
 *   After Ns:  onTick(0) then onDone()
 *
 * Returns a stop() function that cancels the interval early.
 *
 * @param seconds       Number of seconds to wait (from floodWaitSeconds(err))
 * @param onTick        Called each second with the remaining seconds
 * @param onDone        Called once when the countdown reaches 0 (re-enable submit — D-13)
 * @param timingSource  Injectable timing source (D-18); defaults to globalThis.setInterval
 */
export function startFloodCountdown(
  seconds: number,
  onTick: (remaining: number) => void,
  onDone: () => void,
  timingSource: TimingSource = DEFAULT_TIMING
): { stop(): void } {
  let remaining = seconds
  let done = false

  const handle = timingSource.setInterval(() => {
    remaining -= 1
    onTick(remaining)

    if (remaining <= 0 && !done) {
      done = true
      timingSource.clearInterval(handle)
      onDone()
    }
  }, 1000)

  return {
    stop(): void {
      if (!done) {
        timingSource.clearInterval(handle)
        done = true
      }
    },
  }
}

// ── FloodWaitController class (D-18 seam for Phase 2 governor) ─────────────

/**
 * Object-oriented wrapper around startFloodCountdown.
 * Phase 2's rate-limit governor can construct this with its own timing source
 * to drive both login FLOOD_WAITs and bulk-operation FLOOD_WAITs uniformly.
 *
 * The timing source is constructor-injectable — tests pass fake timers; Phase 2
 * passes its own clock without any UI code changes (D-18 option a).
 */
export class FloodWaitController {
  private readonly _timing: TimingSource
  private _stopFn: (() => void) | null = null

  constructor(timingSource: TimingSource = DEFAULT_TIMING) {
    this._timing = timingSource
  }

  /**
   * Start the countdown. Stops any running countdown first.
   */
  start(
    seconds: number,
    onTick: (tick: FloodTick) => void,
    onDone: () => void
  ): void {
    this.stop()
    const { stop } = startFloodCountdown(
      seconds,
      (remaining) => onTick({ remaining }),
      onDone,
      this._timing
    )
    this._stopFn = stop
  }

  /** Cancel the current countdown (if running). */
  stop(): void {
    if (this._stopFn) {
      this._stopFn()
      this._stopFn = null
    }
  }
}
