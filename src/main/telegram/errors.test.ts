/**
 * RED tests for errors.ts (AUTH-02, AUTH-01 error classification).
 * These tests import the NOT-YET-EXISTING implementation by its exact intended path.
 * They WILL FAIL with "Cannot find module" — that is the correct RED state.
 * Plans 03/04 turn them GREEN by implementing the actual errors module.
 *
 * Test map (01-RESEARCH §Validation Architecture):
 *   - each RPCError code → correct AuthErrorCode + UI copy key
 *   - wrong 2FA password classification [-t "password"]
 */

import { describe, it, expect } from 'vitest'
import type { AuthErrorCode } from '@shared/authTypes'

// RED: This import will fail — errors.ts does not exist yet (Wave 0).
// Plans 03/04 create: src/main/telegram/errors.ts
import { classifyTelegramError } from './errors'

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

describe('classifyTelegramError — error code mapping', () => {
  it('PHONE_CODE_INVALID → AuthErrorCode.PHONE_CODE_INVALID', () => {
    const result = classifyTelegramError(makeRPCError('PHONE_CODE_INVALID'))
    expect(result.code).toBe<AuthErrorCode>('PHONE_CODE_INVALID')
    expect(result.retryStep).toBe('code')
    expect(result.uiCopyKey).toBeTruthy() // has a UI copy key for renderer
  })

  it('PHONE_CODE_EXPIRED → AuthErrorCode.PHONE_CODE_EXPIRED', () => {
    const result = classifyTelegramError(makeRPCError('PHONE_CODE_EXPIRED'))
    expect(result.code).toBe<AuthErrorCode>('PHONE_CODE_EXPIRED')
    expect(result.retryStep).toBe('code') // stays on code step (D-12)
  })

  it('PHONE_NUMBER_INVALID → AuthErrorCode.PHONE_NUMBER_INVALID', () => {
    const result = classifyTelegramError(makeRPCError('PHONE_NUMBER_INVALID'))
    expect(result.code).toBe<AuthErrorCode>('PHONE_NUMBER_INVALID')
    expect(result.retryStep).toBe('phone')
  })

  it('password: PASSWORD_HASH_INVALID → AuthErrorCode.PASSWORD_HASH_INVALID, stays on password step', () => {
    const result = classifyTelegramError(makeRPCError('PASSWORD_HASH_INVALID'))
    expect(result.code).toBe<AuthErrorCode>('PASSWORD_HASH_INVALID')
    expect(result.retryStep).toBe('password') // stays on password step, not bounced to phone
  })

  it('FLOOD_WAIT_x → AuthErrorCode.FLOOD_WAIT, preserves seconds', () => {
    const result = classifyTelegramError(makeRPCError('FLOOD_WAIT_60', 60))
    expect(result.code).toBe<AuthErrorCode>('FLOOD_WAIT')
    expect(result.seconds).toBe(60)
  })

  it('unknown RPC error → AuthErrorCode.UNKNOWN', () => {
    const result = classifyTelegramError(makeRPCError('SOME_UNKNOWN_ERROR'))
    expect(result.code).toBe<AuthErrorCode>('UNKNOWN')
  })

  it('network/generic error (no errorMessage) → AuthErrorCode.NETWORK', () => {
    const result = classifyTelegramError(new Error('fetch failed'))
    expect(result.code).toBe<AuthErrorCode>('NETWORK')
  })

  it('SESSION_PASSWORD_NEEDED is NOT classified as an error (handled upstream as 2FA branch)', () => {
    // classifyTelegramError should NOT be called with SESSION_PASSWORD_NEEDED —
    // that is a flow-control signal handled in authFlow. But if called, it returns UNKNOWN.
    const result = classifyTelegramError(makeRPCError('SESSION_PASSWORD_NEEDED'))
    // The important thing: it doesn't throw and returns a valid code
    expect(['UNKNOWN', 'PHONE_CODE_INVALID', 'PASSWORD_HASH_INVALID']).toContain(result.code)
  })
})
