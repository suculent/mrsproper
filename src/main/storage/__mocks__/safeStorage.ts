/**
 * Mock safeStorage for unit tests.
 * Supports available/unavailable modes with in-memory encrypt/decrypt.
 *
 * When available:
 *   - encryptString(plain) → Buffer (XOR obfuscation for test purposes; round-trips identically)
 *   - decryptString(buf) → original plain string
 *
 * When unavailable:
 *   - encryptString() → throws Error('ENCRYPTION_UNAVAILABLE')
 *   - decryptString() → returns null (cannot decrypt)
 *   - isEncryptionAvailable() → false
 *
 * Usage in tests:
 *   import { createMockSafeStorage, setEncryptionAvailable } from '.../__mocks__/safeStorage'
 *   const storage = createMockSafeStorage({ available: true })
 *   storage.setAvailable(false) // toggle mid-test
 */

export interface MockSafeStorage {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encryptedData: Buffer): string
  /** Toggle the available/unavailable mode at runtime (for test setup). */
  setAvailable(available: boolean): void
}

/**
 * XOR-based obfuscation key for round-trip test encryption.
 * NOT cryptographic — only used for unit test correctness assertions.
 */
const TEST_KEY = 0x42

function encryptBuffer(plain: string): Buffer {
  const bytes = Buffer.from(plain, 'utf8')
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = bytes[i] ^ TEST_KEY
  }
  return bytes
}

function decryptBuffer(buf: Buffer): string {
  const bytes = Buffer.from(buf)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = bytes[i] ^ TEST_KEY
  }
  return bytes.toString('utf8')
}

export interface MockSafeStorageOptions {
  /** Whether encryption is available (default: true). */
  available?: boolean
}

export function createMockSafeStorage(options: MockSafeStorageOptions = {}): MockSafeStorage {
  let _available = options.available !== undefined ? options.available : true

  return {
    isEncryptionAvailable(): boolean {
      return _available
    },

    encryptString(plainText: string): Buffer {
      if (!_available) {
        throw new Error('ENCRYPTION_UNAVAILABLE')
      }
      return encryptBuffer(plainText)
    },

    decryptString(encryptedData: Buffer): string {
      if (!_available) {
        // When unavailable, cannot decrypt — route to login
        throw new Error('ENCRYPTION_UNAVAILABLE')
      }
      return decryptBuffer(encryptedData)
    },

    setAvailable(available: boolean): void {
      _available = available
    },
  }
}

/** Default singleton instance for tests that don't need custom config. */
export const mockSafeStorage = createMockSafeStorage({ available: true })
