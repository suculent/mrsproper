// Unit tests for auth error copy — each AuthErrorCode maps to jargon-free UI copy.
// Rewritten to import from the i18n layer instead of the deleted errorCopy module.
// UI-SPEC §Error states is the source of truth for these strings.
//
// RED: imports from '@renderer/i18n' which does not exist yet.
// Will fail with "Cannot find module" until LOC-02 GREEN implementation.

import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n } from '@renderer/i18n'
import type { AuthErrorCode } from '@shared/authTypes'

const ALL_CODES: AuthErrorCode[] = [
  'PHONE_NUMBER_INVALID',
  'PHONE_CODE_INVALID',
  'PHONE_CODE_EXPIRED',
  'PASSWORD_HASH_INVALID',
  'FLOOD_WAIT',
  'NETWORK',
  'UNKNOWN',
]

describe('errorCopy — AuthErrorCode mappings (English)', () => {
  beforeAll(async () => {
    await initI18n('en')
  })

  it('covers every AuthErrorCode (no missing entries)', () => {
    for (const code of ALL_CODES) {
      const copy = i18n.t(`auth:errorCode.${code}`)
      expect(copy, `Missing copy for ${code}`).toBeDefined()
      expect(copy.length, `Empty copy for ${code}`).toBeGreaterThan(0)
    }
  })

  it('PHONE_NUMBER_INVALID — no jargon, mentions "number"', () => {
    const copy = i18n.t('auth:errorCode.PHONE_NUMBER_INVALID')
    expect(copy).not.toContain('PHONE_NUMBER_INVALID')
    expect(copy.toLowerCase()).toContain('number')
  })

  it('PHONE_CODE_INVALID — no jargon, mentions "code"', () => {
    const copy = i18n.t('auth:errorCode.PHONE_CODE_INVALID')
    expect(copy).not.toContain('PHONE_CODE_INVALID')
    expect(copy.toLowerCase()).toContain('code')
  })

  it('PHONE_CODE_EXPIRED — no jargon, mentions resend', () => {
    const copy = i18n.t('auth:errorCode.PHONE_CODE_EXPIRED')
    expect(copy).not.toContain('PHONE_CODE_EXPIRED')
    // Should mention resend for the expired case (D-12)
    expect(copy.toLowerCase()).toMatch(/resend|new/)
  })

  it('PASSWORD_HASH_INVALID — no jargon, mentions "password"', () => {
    const copy = i18n.t('auth:errorCode.PASSWORD_HASH_INVALID')
    expect(copy).not.toContain('PASSWORD_HASH_INVALID')
    expect(copy.toLowerCase()).toContain('password')
  })

  it('FLOOD_WAIT — no jargon, mentions waiting/attempts', () => {
    const copy = i18n.t('auth:errorCode.FLOOD_WAIT')
    expect(copy).not.toContain('FLOOD_WAIT')
    expect(copy.toLowerCase()).toMatch(/attempt|wait/)
  })

  it('NETWORK — mentions connection', () => {
    const copy = i18n.t('auth:errorCode.NETWORK')
    expect(copy.toLowerCase()).toContain('connection')
  })

  it('UNKNOWN — fallback is non-empty and jargon-free', () => {
    const copy = i18n.t('auth:errorCode.UNKNOWN')
    expect(copy.length).toBeGreaterThan(0)
    expect(copy).not.toContain('AUTH_KEY')
    expect(copy).not.toContain('UNKNOWN')
  })

  it('no copy string contains raw Telegram error code names', () => {
    const jargon = [
      'FLOOD_WAIT',
      'PHONE_NUMBER_INVALID',
      'PHONE_CODE_INVALID',
      'PHONE_CODE_EXPIRED',
      'AUTH_KEY',
      'SESSION_PASSWORD_NEEDED',
      'PASSWORD_HASH_INVALID',
    ]
    for (const code of ALL_CODES) {
      const copy = i18n.t(`auth:errorCode.${code}`)
      for (const j of jargon) {
        // Allow the code key itself to appear only in context that is not user-facing
        if (j !== code) {
          expect(copy, `Copy for ${code} contains jargon "${j}"`).not.toContain(j)
        }
      }
    }
  })
})

describe('errorCopy — AuthErrorCode mappings (Czech)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('cs')
  })

  it('covers every AuthErrorCode in Czech (no missing entries)', () => {
    for (const code of ALL_CODES) {
      const copy = i18n.t(`auth:errorCode.${code}`)
      expect(copy, `Missing Czech copy for ${code}`).toBeDefined()
      expect(copy.length, `Empty Czech copy for ${code}`).toBeGreaterThan(0)
    }
  })

  it('Czech PHONE_NUMBER_INVALID — no jargon', () => {
    const copy = i18n.t('auth:errorCode.PHONE_NUMBER_INVALID')
    expect(copy).not.toContain('PHONE_NUMBER_INVALID')
    expect(copy.length).toBeGreaterThan(0)
  })

  it('Czech FLOOD_WAIT — no jargon, non-empty', () => {
    const copy = i18n.t('auth:errorCode.FLOOD_WAIT')
    expect(copy).not.toContain('FLOOD_WAIT')
    expect(copy.length).toBeGreaterThan(0)
  })

  it('Czech UNKNOWN — fallback is non-empty and jargon-free', () => {
    const copy = i18n.t('auth:errorCode.UNKNOWN')
    expect(copy.length).toBeGreaterThan(0)
    expect(copy).not.toContain('AUTH_KEY')
    expect(copy).not.toContain('UNKNOWN')
  })
})

describe('invalidPhoneFormat copy', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('is defined and non-empty', () => {
    const copy = i18n.t('auth:invalidPhoneFormat')
    expect(copy).toBeDefined()
    expect(copy.length).toBeGreaterThan(0)
  })

  it('mentions "phone number" and "country"', () => {
    const copy = i18n.t('auth:invalidPhoneFormat')
    expect(copy.toLowerCase()).toContain('phone')
    expect(copy.toLowerCase()).toContain('country')
  })

  it('contains no Telegram jargon', () => {
    const copy = i18n.t('auth:invalidPhoneFormat')
    expect(copy).not.toContain('PHONE_NUMBER_INVALID')
    expect(copy).not.toContain('AUTH_KEY')
  })
})
