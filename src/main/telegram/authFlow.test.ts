/**
 * RED tests for authFlow.ts (AUTH-01, AUTH-02).
 * These tests import the NOT-YET-EXISTING implementation by its exact intended path.
 * They WILL FAIL with "Cannot find module" — that is the correct RED state.
 * Plans 03/04 turn them GREEN by implementing the actual authFlow module.
 *
 * Test map (01-RESEARCH §Validation Architecture):
 *   AUTH-01: phone→code happy path advances state machine to authorized
 *   AUTH-01: wrong/expired code stays on code step (D-12) [-t "code error"]
 *   AUTH-02: SESSION_PASSWORD_NEEDED → needPassword → authorized [-t "2fa"]
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockTelegramClient } from './__mocks__/telegramClient'
import type { AuthState } from '@shared/authTypes'

// RED: This import will fail — authFlow.ts does not exist yet (Wave 0).
// Plans 03/04 create: src/main/telegram/authFlow.ts
import { AuthFlow } from './authFlow'

describe('AuthFlow — AUTH-01: phone → code happy path', () => {
  let states: AuthState[]
  let client: ReturnType<typeof createMockTelegramClient>

  beforeEach(() => {
    states = []
    client = createMockTelegramClient({ isAuthorized: false })
  })

  it('AUTH-01: submitPhone transitions to sendingCode then needCode', async () => {
    const flow = new AuthFlow(client, { apiId: 1, apiHash: 'hash' }, (s) => states.push(s))
    await flow.submitPhone({ dialCode: '+1', national: '2025551234' })

    expect(states.some((s) => s.step === 'sendingCode')).toBe(true)
    expect(states[states.length - 1]).toMatchObject({
      step: 'needCode',
      canResend: true,
    })
  })

  it('AUTH-01: submitCode after sendCode advances to authorized (happy path)', async () => {
    const flow = new AuthFlow(client, { apiId: 1, apiHash: 'hash' }, (s) => states.push(s))
    await flow.submitPhone({ dialCode: '+1', national: '2025551234' })
    await flow.submitCode({ code: '12345' })

    const last = states[states.length - 1]
    expect(last.step).toBe('authorized')
    if (last.step === 'authorized') {
      expect(last.identity.name).toBeTruthy()
    }
  })

  it('AUTH-01 code error: wrong code → stays on code step with inline error (D-12)', async () => {
    client = createMockTelegramClient({ signInError: 'PHONE_CODE_INVALID' })
    const flow = new AuthFlow(client, { apiId: 1, apiHash: 'hash' }, (s) => states.push(s))
    await flow.submitPhone({ dialCode: '+1', national: '2025551234' })
    await flow.submitCode({ code: 'wrong' })

    const last = states[states.length - 1]
    // Must NOT bounce back to phone step (D-12)
    expect(last.step).toBe('error')
    if (last.step === 'error') {
      expect(last.code).toBe('PHONE_CODE_INVALID')
      expect(last.retryStep).toBe('code') // stays on code step
    }
  })

  it('AUTH-01 code error: expired code → stays on code step with resend offered (D-12)', async () => {
    client = createMockTelegramClient({ signInError: 'PHONE_CODE_EXPIRED' })
    const flow = new AuthFlow(client, { apiId: 1, apiHash: 'hash' }, (s) => states.push(s))
    await flow.submitPhone({ dialCode: '+1', national: '2025551234' })
    await flow.submitCode({ code: '00000' })

    const last = states[states.length - 1]
    expect(last.step).toBe('error')
    if (last.step === 'error') {
      expect(last.code).toBe('PHONE_CODE_EXPIRED')
      expect(last.retryStep).toBe('code') // stays on code step — NOT phone
    }
  })
})

describe('AuthFlow — AUTH-02: 2FA path', () => {
  it('2fa: SESSION_PASSWORD_NEEDED → state advances to needPassword', async () => {
    const states: AuthState[] = []
    const client = createMockTelegramClient({ signInError: 'SESSION_PASSWORD_NEEDED' })
    const flow = new AuthFlow(client, { apiId: 1, apiHash: 'hash' }, (s) => states.push(s))

    await flow.submitPhone({ dialCode: '+1', national: '2025551234' })
    await flow.submitCode({ code: '12345' })

    expect(states.some((s) => s.step === 'needPassword')).toBe(true)
  })

  it('2fa: submitPassword after SESSION_PASSWORD_NEEDED → authorized', async () => {
    const states: AuthState[] = []
    const client = createMockTelegramClient({ signInError: 'SESSION_PASSWORD_NEEDED' })
    const flow = new AuthFlow(client, { apiId: 1, apiHash: 'hash' }, (s) => states.push(s))

    await flow.submitPhone({ dialCode: '+1', national: '2025551234' })
    await flow.submitCode({ code: '12345' })
    // Reset to allow signInWithPassword to succeed
    ;(client as { signInError?: unknown }).signInError = undefined
    await flow.submitPassword({ password: 'correct-2fa-password' })

    const last = states[states.length - 1]
    expect(last.step).toBe('authorized')
  })
})
