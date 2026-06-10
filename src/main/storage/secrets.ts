/**
 * Encrypted session persistence via Electron safeStorage (AUTH-04, D-03).
 *
 * CONTRACT: When used with the real Electron safeStorage (production), the caller MUST
 * invoke these functions only after `app.whenReady()` resolves. safeStorage requires the
 * app 'ready' event before use (RESEARCH Pitfall 3).
 *
 * SECURITY: NEVER log the session string. It is equivalent to a full account credential
 * (RESEARCH Pitfall 1). This module treats it as an opaque secret at all times.
 *
 * THREAT T-03-01: session blob at rest → encrypted via safeStorage (Keychain/DPAPI) + 0o600 perms.
 * THREAT T-03-02: never write plaintext when keystore unavailable (D-03/Pitfall 8).
 *   persistSession throws ENCRYPTION_UNAVAILABLE; caller keeps session in-memory only.
 */

// ── Dependency types ────────────────────────────────────────────────────────

/** Minimal safeStorage surface needed by this module. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encryptedData: Buffer): string
}

/** Injectable dependencies for testability (production defaults to real electron/fs). */
export interface SecretsStoreDeps {
  /** safeStorage implementation (defaults to Electron's safeStorage when not injected). */
  storage?: SafeStorageLike
}

// ── SecretsStore interface ─────────────────────────────────────────────────

export interface SecretsStore {
  /** Encrypt and persist the GramJS StringSession.
   *  In production: writes to disk with 0o600 perms.
   *  Throws Error('ENCRYPTION_UNAVAILABLE') if safeStorage is not available — never writes plaintext (D-03). */
  persistSession(stringSession: string): void

  /** Restore the session. Returns null if:
   *  - No session has been persisted
   *  - Encryption is unavailable (cannot decrypt safely)
   *  - Stored data is corrupt or was encrypted with a different key */
  restoreSession(): string | null

  /** Delete the persisted session. No-op if absent. */
  wipeSession(): void

  /** Expose raw stored bytes for test assertions (encryption verification). */
  getRawStoredBytes?(): Buffer | undefined
}

// ── Production store (uses real Electron + fs) ─────────────────────────────

function createProductionStore(storage: SafeStorageLike): SecretsStore {
  // Lazy imports to avoid loading electron/fs at module parse time in test env
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeFs = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as { app: { getPath(name: string): string } }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { join } = require('node:path') as typeof import('node:path')

  const sessionFile = () => join(app.getPath('userData'), 'session.bin')

  return {
    persistSession(stringSession: string): void {
      if (!storage.isEncryptionAvailable()) {
        throw new Error('ENCRYPTION_UNAVAILABLE')
      }
      const cipher: Buffer = storage.encryptString(stringSession)
      nodeFs.writeFileSync(sessionFile(), cipher, { mode: 0o600 })
    },

    restoreSession(): string | null {
      const filePath = sessionFile()
      if (!nodeFs.existsSync(filePath)) return null
      if (!storage.isEncryptionAvailable()) return null
      try {
        return storage.decryptString(nodeFs.readFileSync(filePath))
      } catch {
        return null
      }
    },

    wipeSession(): void {
      const filePath = sessionFile()
      if (nodeFs.existsSync(filePath)) {
        nodeFs.rmSync(filePath, { force: true })
      }
    },
  }
}

// ── In-memory store (used in tests, or when no file path can be resolved) ─

function createInMemoryStore(storage: SafeStorageLike): SecretsStore {
  let _stored: Buffer | undefined

  return {
    persistSession(stringSession: string): void {
      // D-03 / Pitfall 8: NEVER write plaintext. Throw so caller keeps session in-memory only.
      if (!storage.isEncryptionAvailable()) {
        throw new Error('ENCRYPTION_UNAVAILABLE')
      }
      // encryptString may also throw ENCRYPTION_UNAVAILABLE — let it propagate
      _stored = storage.encryptString(stringSession)
    },

    restoreSession(): string | null {
      if (_stored === undefined) return null
      // D-03: cannot decrypt safely when keystore is unavailable → route to login
      if (!storage.isEncryptionAvailable()) return null
      try {
        return storage.decryptString(_stored)
      } catch {
        // Corrupt or from a different key → treat as no session
        return null
      }
    },

    wipeSession(): void {
      _stored = undefined
    },

    getRawStoredBytes(): Buffer | undefined {
      return _stored
    },
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create a SecretsStore with injectable dependencies.
 *
 * In production (Electron main process after app.whenReady()):
 *   import { createSecretsStore } from './secrets'
 *   const store = createSecretsStore()   // uses real safeStorage + userData file
 *
 * In tests (inject mock safeStorage → in-memory store, no disk I/O):
 *   const store = createSecretsStore({ storage: mockSafeStorage })
 */
export function createSecretsStore(deps: SecretsStoreDeps = {}): SecretsStore {
  if (deps.storage) {
    // Test mode: injected storage → use in-memory store (no file system, no Electron required)
    return createInMemoryStore(deps.storage)
  }

  // Production mode: resolve real Electron safeStorage
  // Lazy import so this module can be parsed in test environments
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { safeStorage } = require('electron') as { safeStorage: SafeStorageLike }
    return createProductionStore(safeStorage)
  } catch {
    // Electron not available (e.g., running in a pure Node/test environment without injection)
    throw new Error(
      'SecretsStore: No storage provided and Electron is not available. ' +
        'In tests, inject a mock via createSecretsStore({ storage: mockSafeStorage }). ' +
        'In production, call createSecretsStore() after app.whenReady().'
    )
  }
}

// ── Convenience singleton for production use ──────────────────────────────

/**
 * Get the production SecretsStore backed by Electron safeStorage.
 * Call only after app.whenReady() (Pitfall 3).
 */
export function getProductionSecretsStore(): SecretsStore {
  return createSecretsStore()
}
