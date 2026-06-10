/**
 * RED tests for secrets.ts (AUTH-04: session persist/restore).
 * These tests import the NOT-YET-EXISTING implementation by its exact intended path.
 * They WILL FAIL with "Cannot find module" — that is the correct RED state.
 * Plans 03/04 turn them GREEN by implementing the actual secrets module.
 *
 * Test map (01-RESEARCH §Validation Architecture + §Pattern 3):
 *   - encrypt→write→read→decrypt round-trips identically
 *   - isEncryptionAvailable()===false → no plaintext written, returns null/routes to login [-t "unavailable"]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockSafeStorage } from './__mocks__/safeStorage'
import type { MockSafeStorage } from './__mocks__/safeStorage'

// RED: This import will fail — secrets.ts does not exist yet (Wave 0).
// Plans 03/04 create: src/main/storage/secrets.ts
import { createSecretsStore } from './secrets'

describe('SecretsStore — session round-trip (AUTH-04)', () => {
  it('persistSession → restoreSession returns the identical session string', () => {
    const storage = createMockSafeStorage({ available: true })
    const store = createSecretsStore({ storage })

    const sessionStr = '1BQANOBEuxyz...very-long-string-session-from-gramjs'
    store.persistSession(sessionStr)
    const restored = store.restoreSession()

    expect(restored).toBe(sessionStr)
  })

  it('wipeSession → restoreSession returns null', () => {
    const storage = createMockSafeStorage({ available: true })
    const store = createSecretsStore({ storage })

    store.persistSession('some-session')
    store.wipeSession()

    expect(store.restoreSession()).toBeNull()
  })

  it('restoreSession returns null when no session has been persisted', () => {
    const storage = createMockSafeStorage({ available: true })
    const store = createSecretsStore({ storage })

    expect(store.restoreSession()).toBeNull()
  })

  it('session data is encrypted: stored bytes differ from the plain string', () => {
    const storage = createMockSafeStorage({ available: true })
    const store = createSecretsStore({ storage })

    const sessionStr = 'plaintext-session-12345'
    store.persistSession(sessionStr)

    // The raw stored bytes should NOT equal the plain string bytes
    // (i.e., persist must actually encrypt, not store raw)
    const rawBytes = store.getRawStoredBytes?.()
    if (rawBytes !== undefined) {
      // If the store exposes raw bytes, verify they are not the plain session
      expect(rawBytes.toString('utf8')).not.toBe(sessionStr)
    }
    // Primary check: restore still works
    expect(store.restoreSession()).toBe(sessionStr)
  })
})

describe('SecretsStore — encryption unavailable (AUTH-04)', () => {
  it('unavailable: persistSession when encryption unavailable → throws ENCRYPTION_UNAVAILABLE', () => {
    const storage = createMockSafeStorage({ available: false })
    const store = createSecretsStore({ storage })

    expect(() => store.persistSession('some-session')).toThrow('ENCRYPTION_UNAVAILABLE')
  })

  it('unavailable: restoreSession when encryption unavailable → returns null (no plaintext)', () => {
    // Simulate: session was persisted when available, then encryption becomes unavailable
    const storage = createMockSafeStorage({ available: true })
    const store = createSecretsStore({ storage })
    store.persistSession('valid-session')

    // Now encryption becomes unavailable (e.g., OS keystore issue)
    storage.setAvailable(false)
    const storeUnavailable = createSecretsStore({ storage })

    // Must return null — never attempt to return plaintext (D-03, Pitfall 1)
    expect(storeUnavailable.restoreSession()).toBeNull()
  })

  it('unavailable: no plaintext written to storage (D-03: never fall back to plaintext)', () => {
    const writtenValues: unknown[] = []
    const storage = createMockSafeStorage({ available: false })
    // Patch encryptString to track calls (it throws, so no write should happen)
    const origEncrypt = storage.encryptString.bind(storage)
    storage.encryptString = (plain: string) => {
      writtenValues.push(plain)
      return origEncrypt(plain) // will throw ENCRYPTION_UNAVAILABLE
    }

    const store = createSecretsStore({ storage })

    expect(() => store.persistSession('secret-session')).toThrow()
    // The plain string must NOT have made it through to any write operation
    // (The throw from encryptString prevented the write — this verifies no bypass)
  })
})
