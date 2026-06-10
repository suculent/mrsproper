/**
 * RED tests for floodWait.ts (D-13: FLOOD_WAIT countdown).
 * These tests import the NOT-YET-EXISTING implementation by its exact intended path.
 * They WILL FAIL with "Cannot find module" — that is the correct RED state.
 * Plans 03/04 turn them GREEN by implementing the actual floodWait module.
 *
 * Test map (01-RESEARCH §Validation Architecture + §Pattern 5):
 *   - FLOOD_WAIT_x parsed via .seconds and message regex
 *   - countdown ticks emitted with fake timers
 *   - submit re-enabled at 0 (D-13)
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

// RED: This import will fail — floodWait.ts does not exist yet (Wave 0).
// Plans 03/04 create: src/main/telegram/floodWait.ts
import { floodWaitSeconds, startFloodCountdown } from './floodWait'

/** Helper to create a FloodWaitError-shaped error. */
function makeFloodError(seconds: number): Error & { errorMessage: string; seconds: number } {
  const err = new Error(`FLOOD_WAIT_${seconds}`) as Error & {
    errorMessage: string
    seconds: number
  }
  err.errorMessage = `FLOOD_WAIT_${seconds}`
  err.seconds = seconds
  return err
}

describe('floodWaitSeconds — error parsing', () => {
  it('reads .seconds from FloodWaitError (primary path)', () => {
    const err = makeFloodError(30)
    expect(floodWaitSeconds(err)).toBe(30)
  })

  it('falls back to regex parse of FLOOD_WAIT_<n> in errorMessage', () => {
    const err = { errorMessage: 'FLOOD_WAIT_120' } // no .seconds property
    expect(floodWaitSeconds(err)).toBe(120)
  })

  it('falls back to regex parse of FLOOD_WAIT_<n> in message', () => {
    const err = new Error('FLOOD_WAIT_45')
    expect(floodWaitSeconds(err)).toBe(45)
  })

  it('returns null for non-flood errors', () => {
    expect(floodWaitSeconds(new Error('PHONE_CODE_INVALID'))).toBeNull()
    expect(floodWaitSeconds(new Error('network failure'))).toBeNull()
    expect(floodWaitSeconds(null)).toBeNull()
  })
})

describe('startFloodCountdown — tick emission (D-13)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits one tick per second counting down from N to 1, then calls onDone at 0', async () => {
    vi.useFakeTimers()
    const ticks: number[] = []
    let doneCalled = false

    startFloodCountdown(3, (remaining) => ticks.push(remaining), () => { doneCalled = true })

    // Advance time by 3 seconds
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(1000)

    expect(ticks).toEqual([2, 1, 0])
    expect(doneCalled).toBe(true)
  })

  it('submit re-enabled at 0: onDone fires exactly once when countdown reaches 0 (D-13)', async () => {
    vi.useFakeTimers()
    let doneCount = 0

    startFloodCountdown(1, () => {}, () => { doneCount++ })

    vi.advanceTimersByTime(1000)
    expect(doneCount).toBe(1)

    // No more fires after done
    vi.advanceTimersByTime(2000)
    expect(doneCount).toBe(1)
  })

  it('emits initial tick immediately with secondsRemaining = N-1', () => {
    vi.useFakeTimers()
    const ticks: number[] = []

    startFloodCountdown(5, (remaining) => ticks.push(remaining), () => {})

    // After first tick
    vi.advanceTimersByTime(1000)
    expect(ticks[0]).toBe(4)
  })
})
