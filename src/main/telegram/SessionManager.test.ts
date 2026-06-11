/**
 * RED tests for SessionManager.ts (AUTH-04 session lifecycle, AUTH-05 logout, D-17).
 * These tests import the NOT-YET-EXISTING implementation by its exact intended path.
 * They WILL FAIL with "Cannot find module" — that is the correct RED state.
 * Plans 03/04 turn them GREEN by implementing the actual SessionManager module.
 *
 * Test map (01-RESEARCH §Validation Architecture + §Pattern 6):
 *   - dead session (AUTH_KEY_UNREGISTERED on connect) → wipe + login [-t "dead session"]
 *   - logout server-revoke success → local wiped [-t "logout ok"]
 *   - logout server-revoke FAILS → local STILL wiped + serverRevoked:false (D-17) [-t "logout server fail"]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockTelegramClient } from './__mocks__/telegramClient'
import { createMockSafeStorage } from '../storage/__mocks__/safeStorage'

// RED: This import will fail — SessionManager.ts does not exist yet (Wave 0).
// Plans 03/04 create: src/main/telegram/SessionManager.ts
import { SessionManager } from './SessionManager'

describe('SessionManager — dead session handling', () => {
  it('dead session: AUTH_KEY_UNREGISTERED on connect → wipes session + routes to login', async () => {
    const storage = createMockSafeStorage({ available: true })
    const client = createMockTelegramClient({
      connectError: 'AUTH_KEY_UNREGISTERED',
      sessionString: 'stale-session-string',
    })

    const states: string[] = []
    const wipeCalled = { value: false }

    const manager = new SessionManager({
      client,
      storage,
      onStateChange: (s) => states.push(s.step),
      onSessionWipe: () => { wipeCalled.value = true },
    })

    await manager.initialize('stale-session-string')

    expect(wipeCalled.value).toBe(true)
    // Should end up in idle (login screen) after wiping dead session
    expect(states[states.length - 1]).toBe('idle')
  })
})

describe('SessionManager — logout behavior (AUTH-05, D-17)', () => {
  it('logout ok: server revoke succeeds → local session wiped, serverRevoked: true', async () => {
    const storage = createMockSafeStorage({ available: true })
    const client = createMockTelegramClient({ isAuthorized: true })

    const wipeCalled = { value: false }
    const manager = new SessionManager({
      client,
      storage,
      onStateChange: () => {},
      onSessionWipe: () => { wipeCalled.value = true },
    })

    const result = await manager.logout()

    expect(result.serverRevoked).toBe(true)
    expect(wipeCalled.value).toBe(true) // local always wiped
  })

  it('logout server fail: server revoke throws → local STILL wiped, serverRevoked: false (D-17)', async () => {
    const storage = createMockSafeStorage({ available: true })
    const client = createMockTelegramClient({
      isAuthorized: true,
      logoutErrorCode: 'SESSION_REVOKED',
    })

    const wipeCalled = { value: false }
    const manager = new SessionManager({
      client,
      storage,
      onStateChange: () => {},
      onSessionWipe: () => { wipeCalled.value = true },
    })

    const result = await manager.logout()

    // Local session ALWAYS wiped, even if server call fails (D-17)
    expect(wipeCalled.value).toBe(true)
    // Server revocation flagged as failed — renderer should warn user
    expect(result.serverRevoked).toBe(false)
  })

  it('logout server fail: after wipe, manager state is idle (user must re-login)', async () => {
    const storage = createMockSafeStorage({ available: true })
    const client = createMockTelegramClient({
      isAuthorized: true,
      logoutErrorCode: 'SESSION_REVOKED',
    })

    const states: string[] = []
    const manager = new SessionManager({
      client,
      storage,
      onStateChange: (s) => states.push(s.step),
      onSessionWipe: () => {},
    })

    await manager.logout()

    // Manager must be in idle state after logout regardless of server failure
    expect(states[states.length - 1]).toBe('idle')
  })
})
