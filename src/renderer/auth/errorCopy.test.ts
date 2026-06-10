// Unit tests for errorCopy.ts — each AuthErrorCode maps to jargon-free UI copy.
// UI-SPEC §Error states is the source of truth for these strings.

import { describe, it, expect } from 'vitest'
import { getErrorCopy, ERROR_COPY, INVALID_PHONE_FORMAT_COPY } from './errorCopy'
import type { AuthErrorCode } from '@shared/authTypes'

describe('errorCopy — AuthErrorCode mappings', () => {
  const ALL_CODES: AuthErrorCode[] = [
    'PHONE_NUMBER_INVALID',
    'PHONE_CODE_INVALID',
    'PHONE_CODE_EXPIRED',
    'PASSWORD_HASH_INVALID',
    'FLOOD_WAIT',
    'NETWORK',
    'UNKNOWN',
  ]

  it('covers every AuthErrorCode (no missing entries)', () => {
    for (const code of ALL_CODES) {
      expect(ERROR_COPY[code], `Missing copy for ${code}`).toBeDefined()
      expect(ERROR_COPY[code].length, `Empty copy for ${code}`).toBeGreaterThan(0)
    }
  })

  it('PHONE_NUMBER_INVALID — no jargon, mentions "number"', () => {
    const copy = getErrorCopy('PHONE_NUMBER_INVALID')
    expect(copy).not.toContain('PHONE_NUMBER_INVALID')
    expect(copy.toLowerCase()).toContain('number')
  })

  it('PHONE_CODE_INVALID — no jargon, mentions "code"', () => {
    const copy = getErrorCopy('PHONE_CODE_INVALID')
    expect(copy).not.toContain('PHONE_CODE_INVALID')
    expect(copy.toLowerCase()).toContain('code')
  })

  it('PHONE_CODE_EXPIRED — no jargon, mentions resend', () => {
    const copy = getErrorCopy('PHONE_CODE_EXPIRED')
    expect(copy).not.toContain('PHONE_CODE_EXPIRED')
    // Should mention resend for the expired case (D-12)
    expect(copy.toLowerCase()).toMatch(/resend|new/)
  })

  it('PASSWORD_HASH_INVALID — no jargon, mentions "password"', () => {
    const copy = getErrorCopy('PASSWORD_HASH_INVALID')
    expect(copy).not.toContain('PASSWORD_HASH_INVALID')
    expect(copy.toLowerCase()).toContain('password')
  })

  it('FLOOD_WAIT — no jargon, mentions waiting/attempts', () => {
    const copy = getErrorCopy('FLOOD_WAIT')
    expect(copy).not.toContain('FLOOD_WAIT')
    expect(copy.toLowerCase()).toMatch(/attempt|wait/)
  })

  it('NETWORK — mentions connection', () => {
    const copy = getErrorCopy('NETWORK')
    expect(copy.toLowerCase()).toContain('connection')
  })

  it('UNKNOWN — fallback is non-empty and jargon-free', () => {
    const copy = getErrorCopy('UNKNOWN')
    expect(copy.length).toBeGreaterThan(0)
    expect(copy).not.toContain('AUTH_KEY')
    expect(copy).not.toContain('UNKNOWN')
  })

  it('no copy string contains raw Telegram error code names', () => {
    const jargon = ['FLOOD_WAIT', 'PHONE_NUMBER_INVALID', 'PHONE_CODE_INVALID', 'PHONE_CODE_EXPIRED', 'AUTH_KEY', 'SESSION_PASSWORD_NEEDED', 'PASSWORD_HASH_INVALID']
    for (const [code, copy] of Object.entries(ERROR_COPY)) {
      for (const j of jargon) {
        // Allow the code key itself to appear only in context that is not user-facing
        if (j !== code) {
          expect(copy, `Copy for ${code} contains jargon "${j}"`).not.toContain(j)
        }
      }
    }
  })
})

describe('INVALID_PHONE_FORMAT_COPY', () => {
  it('is defined and non-empty', () => {
    expect(INVALID_PHONE_FORMAT_COPY).toBeDefined()
    expect(INVALID_PHONE_FORMAT_COPY.length).toBeGreaterThan(0)
  })

  it('mentions "phone number" and "country"', () => {
    expect(INVALID_PHONE_FORMAT_COPY.toLowerCase()).toContain('phone')
    expect(INVALID_PHONE_FORMAT_COPY.toLowerCase()).toContain('country')
  })

  it('contains no Telegram jargon', () => {
    expect(INVALID_PHONE_FORMAT_COPY).not.toContain('PHONE_NUMBER_INVALID')
    expect(INVALID_PHONE_FORMAT_COPY).not.toContain('AUTH_KEY')
  })
})
