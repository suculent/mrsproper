/**
 * RED tests for operationErrors.ts (EXE-03, D-04 taxonomy).
 * Import of './operationErrors' will fail until Plan 02-02 creates operationErrors.ts.
 * Test map (02-VALIDATION.md):
 *   - EXE-03: PEER_FLOOD classified distinctly as hard-stop, not FLOOD_WAIT
 *   - D-04: full taxonomy — FLOOD_WAIT→wait, network→retry, session-invalid→fail, unknown→fail
 */

import { describe, it, expect } from 'vitest'
import type { OperationErrorCode, Disposition } from '@shared/opTypes'

// RED: This import will fail — operationErrors.ts does not exist yet (Wave 0).
// Plan 02-02 creates: src/main/telegram/operationErrors.ts
import { classifyRpcError } from './operationErrors'

/** Helper to create an RPC-shaped error matching GramJS RPCError. */
function makeRPCError(
  errorMessage: string,
  seconds?: number
): Error & { errorMessage: string; seconds?: number } {
  const err = new Error(errorMessage) as Error & { errorMessage: string; seconds?: number }
  err.errorMessage = errorMessage
  if (seconds !== undefined) err.seconds = seconds
  return err
}

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

/** Helper to create a PEER_FLOOD error. */
function makePeerFloodError(): Error & { errorMessage: string } {
  const err = new Error('PEER_FLOOD') as Error & { errorMessage: string }
  err.errorMessage = 'PEER_FLOOD'
  return err
}

// ---------------------------------------------------------------------------
// EXE-03: PEER_FLOOD distinct classification
// ---------------------------------------------------------------------------

describe('classifyRpcError — PEER_FLOOD distinct classification (EXE-03)', () => {
  it('PEER_FLOOD → code is PEER_FLOOD, disposition is hard-stop', () => {
    const result = classifyRpcError(makePeerFloodError())
    expect(result.code).toBe<OperationErrorCode>('PEER_FLOOD')
    expect(result.disposition).toBe<Disposition>('hard-stop')
  })

  it('FLOOD_WAIT_30 → code is FLOOD_WAIT, disposition is wait (not hard-stop — they are distinct)', () => {
    const result = classifyRpcError(makeFloodError(30))
    expect(result.code).toBe<OperationErrorCode>('FLOOD_WAIT')
    expect(result.disposition).toBe<Disposition>('wait')
    expect(result.disposition).not.toBe<Disposition>('hard-stop')
  })
})

// ---------------------------------------------------------------------------
// D-04: Full taxonomy
// ---------------------------------------------------------------------------

describe('classifyRpcError — full taxonomy (D-04)', () => {
  it('FLOOD_WAIT_30 → disposition wait, retryAfterSeconds equals 30', () => {
    const result = classifyRpcError(makeRPCError('FLOOD_WAIT_30', 30))
    expect(result.disposition).toBe<Disposition>('wait')
    expect(result.retryAfterSeconds).toBe(30)
  })

  it('FloodWaitError with seconds=45 → disposition wait, retryAfterSeconds equals 45', () => {
    const result = classifyRpcError(makeFloodError(45))
    expect(result.disposition).toBe<Disposition>('wait')
    expect(result.retryAfterSeconds).toBe(45)
  })

  it('no errorMessage (network error) → code NETWORK, disposition retry', () => {
    const result = classifyRpcError(new Error('fetch failed'))
    expect(result.code).toBe<OperationErrorCode>('NETWORK')
    expect(result.disposition).toBe<Disposition>('retry')
  })

  it('AUTH_KEY_UNREGISTERED → code SESSION_INVALID, disposition fail', () => {
    const result = classifyRpcError(makeRPCError('AUTH_KEY_UNREGISTERED'))
    expect(result.code).toBe<OperationErrorCode>('SESSION_INVALID')
    expect(result.disposition).toBe<Disposition>('fail')
  })

  it('SESSION_REVOKED → code SESSION_INVALID, disposition fail', () => {
    const result = classifyRpcError(makeRPCError('SESSION_REVOKED'))
    expect(result.code).toBe<OperationErrorCode>('SESSION_INVALID')
    expect(result.disposition).toBe<Disposition>('fail')
  })

  it('unmapped RPCError (e.g. RANDOM_ERROR) → disposition fail', () => {
    const result = classifyRpcError(makeRPCError('RANDOM_ERROR'))
    expect(result.disposition).toBe<Disposition>('fail')
  })
})
