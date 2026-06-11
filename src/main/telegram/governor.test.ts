/**
 * RED tests for governor.ts (EXE-01, EXE-02, EXE-03, D-14).
 * Import of './governor' will fail until Plan 02-02 creates governor.ts — that is the correct RED state.
 * Test map (02-VALIDATION.md §Per-Task Verification Map):
 *   - EXE-01: serialization — concurrent calls execute one-at-a-time
 *   - EXE-02: FLOOD_WAIT — governor sleeps seconds+jitter and resumes; countdown event emitted
 *   - EXE-02: ceiling — FLOOD_WAIT > 3600s surfaced, not slept
 *   - EXE-03: PEER_FLOOD — hard-stop disposition, zero retries
 *   - D-14: transient retry — 3 retries with backoff, then fail
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import type { GovernorEvent, Disposition } from '@shared/opTypes'

// RED: This import will fail — governor.ts does not exist yet (Wave 0).
// Plan 02-02 creates: src/main/telegram/governor.ts
import { RateLimitGovernor } from './governor'

/** Helper to create a FloodWaitError-shaped error matching GramJS RPCError. */
function makeFloodError(seconds: number): Error & { errorMessage: string; seconds: number } {
  const err = new Error(`FLOOD_WAIT_${seconds}`) as Error & {
    errorMessage: string
    seconds: number
  }
  err.errorMessage = `FLOOD_WAIT_${seconds}`
  err.seconds = seconds
  return err
}

/** Helper to create a PEER_FLOOD error. */
function makePeerFloodError(): Error & { errorMessage: string } {
  const err = new Error('PEER_FLOOD') as Error & { errorMessage: string }
  err.errorMessage = 'PEER_FLOOD'
  return err
}

/** Helper to create a transient network error (no errorMessage field). */
function makeTransientError(): Error {
  return new Error('Network timeout')
}

/** Inline mock client factory — minimal surface, just invoke. */
function createMockClient(invokeImpl?: () => Promise<unknown>) {
  return {
    invoke: invokeImpl ? vi.fn(invokeImpl) : vi.fn().mockResolvedValue({}),
  }
}

// ---------------------------------------------------------------------------
// EXE-01: Serialization
// ---------------------------------------------------------------------------

describe('RateLimitGovernor — serialization (EXE-01)', () => {
  it('two concurrent governor.run() calls execute in sequence, not parallel', async () => {
    const executionOrder: string[] = []
    let resolveFirst!: () => void

    const firstDone = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })

    const client = createMockClient()
    const governor = new RateLimitGovernor({ client })

    // First call: blocks until resolveFirst() is called
    const first = governor.run(async () => {
      executionOrder.push('first-start')
      await firstDone
      executionOrder.push('first-end')
      return {}
    })

    // Second call: enqueued after first
    const second = governor.run(async () => {
      executionOrder.push('second-start')
      return {}
    })

    // Unblock first after second is enqueued
    resolveFirst()

    await Promise.all([first, second])

    // Second must start only after first ends
    expect(executionOrder).toEqual(['first-start', 'first-end', 'second-start'])
  })
})

// ---------------------------------------------------------------------------
// EXE-02: FLOOD_WAIT handling
// ---------------------------------------------------------------------------

describe('RateLimitGovernor — FLOOD_WAIT handling (EXE-02)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('FloodWaitError → governor sleeps and resumes (call eventually resolves)', async () => {
    vi.useFakeTimers()

    let callCount = 0
    const floodSeconds = 5
    const client = createMockClient(vi.fn()
      .mockImplementationOnce(async () => {
        callCount++
        throw makeFloodError(floodSeconds)
      })
      .mockImplementationOnce(async () => {
        callCount++
        return { success: true }
      }) as () => Promise<unknown>)

    const governor = new RateLimitGovernor({ client })

    const runPromise = governor.run(() => client.invoke({}))

    // Advance past the flood wait duration (+ jitter buffer)
    await vi.advanceTimersByTimeAsync((floodSeconds + 10) * 1000)

    const result = await runPromise
    expect(result).toBeDefined()
    expect(callCount).toBe(2)
  })

  it('FloodWaitError → governor emits a flood-tick GovernorEvent', async () => {
    vi.useFakeTimers()

    const events: GovernorEvent[] = []
    const floodSeconds = 3

    const client = createMockClient(vi.fn()
      .mockImplementationOnce(async () => {
        throw makeFloodError(floodSeconds)
      })
      .mockResolvedValue({}) as () => Promise<unknown>)

    const governor = new RateLimitGovernor({
      client,
      onEvent: (event) => events.push(event),
    })

    const runPromise = governor.run(() => client.invoke({}))

    // Advance time to trigger countdown ticks
    await vi.advanceTimersByTimeAsync((floodSeconds + 5) * 1000)

    await runPromise

    const floodTicks = events.filter((e) => e.type === 'flood-tick')
    expect(floodTicks.length).toBeGreaterThan(0)
    expect(floodTicks[0]).toMatchObject({ type: 'flood-tick' })
  })
})

// ---------------------------------------------------------------------------
// EXE-02: FLOOD_WAIT ceiling (D-12)
// ---------------------------------------------------------------------------

describe('RateLimitGovernor — FLOOD_WAIT ceiling (EXE-02)', () => {
  it('FLOOD_WAIT > 3600s → governor throws rather than sleeping', async () => {
    const aboveCeiling = 3601
    const client = createMockClient(async () => {
      throw makeFloodError(aboveCeiling)
    })

    const governor = new RateLimitGovernor({ client })

    await expect(governor.run(() => client.invoke({}))).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// EXE-03: PEER_FLOOD hard-stop
// ---------------------------------------------------------------------------

describe('RateLimitGovernor — PEER_FLOOD hard-stop (EXE-03)', () => {
  it('PEER_FLOOD → governor throws immediately with no retry (invoke called exactly once)', async () => {
    const invokeMock = vi.fn(async () => {
      throw makePeerFloodError()
    })
    const client = { invoke: invokeMock }

    const governor = new RateLimitGovernor({ client })

    await expect(governor.run(() => client.invoke({}))).rejects.toThrow()

    // No retry — invoke called exactly once
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// D-14: Transient retry
// ---------------------------------------------------------------------------

describe('RateLimitGovernor — transient retry (D-14)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('transient error retries up to 3 times then throws', async () => {
    vi.useFakeTimers()

    const invokeMock = vi.fn(async () => {
      throw makeTransientError()
    })
    const client = { invoke: invokeMock }

    const governor = new RateLimitGovernor({ client })

    const runPromise = governor.run(() => client.invoke({}))

    // Advance time past all retry backoff intervals (1s + 2s + 4s = 7s)
    await vi.advanceTimersByTimeAsync(30_000)

    await expect(runPromise).rejects.toThrow()

    // 1 initial attempt + 3 retries = 4 total calls
    expect(invokeMock).toHaveBeenCalledTimes(4)
  })

  it('transient error that succeeds on retry 2 resolves successfully', async () => {
    vi.useFakeTimers()

    const invokeMock = vi.fn()
      .mockImplementationOnce(async () => {
        throw makeTransientError()
      })
      .mockImplementationOnce(async () => {
        return { success: true }
      })

    const client = { invoke: invokeMock }
    const governor = new RateLimitGovernor({ client })

    const runPromise = governor.run(() => client.invoke({}))

    // Advance past first retry backoff (~1s)
    await vi.advanceTimersByTimeAsync(5_000)

    const result = await runPromise
    expect(result).toBeDefined()
    expect(invokeMock).toHaveBeenCalledTimes(2)
  })
})
