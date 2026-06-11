/**
 * Configurable mock GramJS TelegramClient for unit tests.
 *
 * Open Question A2 resolved (telegram@2.26.22 .d.ts):
 *   signInWithPassword(client, apiCredentials, authParams: UserPasswordAuthParams)
 *   UserPasswordAuthParams = { password?: (hint?: string) => Promise<string>; onError: (err: Error) => Promise<boolean> | void }
 *   The `password` field is a CALLBACK form: (hint?: string) => Promise<string>
 *   NOT a plain value. The mock is shaped to accept this callback form.
 *
 * RPCError shapes (sourced from installed telegram@2.26.22 + RESEARCH Pitfall 4):
 *   - err.errorMessage === 'SESSION_PASSWORD_NEEDED' (exact string — Pitfall 4)
 *   - err.errorMessage === 'PHONE_CODE_INVALID'
 *   - err.errorMessage === 'PHONE_CODE_EXPIRED'
 *   - err.errorMessage === 'PASSWORD_HASH_INVALID'
 *   - err.errorMessage === 'AUTH_KEY_UNREGISTERED'
 *   - err.errorMessage === 'FLOOD_WAIT_<n>' AND err.seconds === n (FloodWaitError shape)
 */

export type MockRPCErrorCode =
  | 'SESSION_PASSWORD_NEEDED'
  | 'PHONE_CODE_INVALID'
  | 'PHONE_CODE_EXPIRED'
  | 'PASSWORD_HASH_INVALID'
  | 'AUTH_KEY_UNREGISTERED'
  | 'SESSION_REVOKED'
  | { type: 'FLOOD_WAIT'; seconds: number }

/** Create an RPC-shaped error that matches GramJS RPCError + FloodWaitError shapes. */
function makeRPCError(code: MockRPCErrorCode): Error & { errorMessage: string; seconds?: number } {
  if (typeof code === 'object' && code.type === 'FLOOD_WAIT') {
    const err = new Error(`FLOOD_WAIT_${code.seconds}`) as Error & {
      errorMessage: string
      seconds: number
    }
    err.errorMessage = `FLOOD_WAIT_${code.seconds}`
    err.seconds = code.seconds
    return err
  }
  const codeStr = code as string
  const err = new Error(codeStr) as Error & { errorMessage: string }
  err.errorMessage = codeStr
  return err
}

export interface MockClientConfig {
  /** If set, sendCode will throw this error code. */
  sendCodeError?: MockRPCErrorCode
  /** If set, invoke (SignIn) will throw this error code. */
  signInError?: MockRPCErrorCode
  /** If set, signInWithPassword will throw this error code. */
  signInWithPasswordError?: MockRPCErrorCode
  /** If set, checkAuthorization resolves to this value (default: false). */
  isAuthorized?: boolean
  /** If set, connect will throw this error code. */
  connectError?: MockRPCErrorCode
  /**
   * If set, connect will throw a PLAIN Error (no errorMessage field) with this
   * message — simulates an offline launch / network failure (not an RPC error).
   */
  connectPlainError?: string
  /** Simulated identity to return from getMe / downloadProfilePhoto. */
  identity?: {
    firstName: string
    lastName?: string
    username?: string
    id: string
    hasPhoto: boolean
  }
  /** Simulated session string (for session.save()). */
  sessionString?: string
  /** If set, invoke (LogOut) will throw an RPC-shaped error with this code. */
  logoutErrorCode?: MockRPCErrorCode
}

const DEFAULT_IDENTITY = {
  firstName: 'Test',
  lastName: 'User',
  username: 'testuser',
  id: '123456789',
  hasPhoto: false,
}

/**
 * Create a configurable mock TelegramClient.
 * Exposes the same surface as the real client that our auth/session code calls.
 */
export function createMockTelegramClient(config: MockClientConfig = {}) {
  const sessionStr = config.sessionString ?? 'mock-session-string'

  const client = {
    // ── Connection ──────────────────────────────────────────────────────────
    connect: async () => {
      if (config.connectPlainError) {
        throw new Error(config.connectPlainError)
      }
      if (config.connectError) {
        throw makeRPCError(config.connectError)
      }
    },

    disconnect: async () => {
      // no-op in tests
    },

    checkAuthorization: async (): Promise<boolean> => {
      return config.isAuthorized ?? false
    },

    // ── Session ──────────────────────────────────────────────────────────────
    session: {
      save: (): string => sessionStr,
    },

    // ── Auth: sendCode ────────────────────────────────────────────────────────
    sendCode: async (
      _apiCreds: { apiId: number; apiHash: string },
      _phoneNumber: string
    ): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> => {
      if (config.sendCodeError) {
        throw makeRPCError(config.sendCodeError)
      }
      return { phoneCodeHash: 'mock-phone-code-hash', isCodeViaApp: true }
    },

    // ── Auth: invoke (used for Api.auth.SignIn and Api.auth.LogOut) ───────────
    invoke: async (request: unknown): Promise<unknown> => {
      // Detect by constructor name to avoid importing GramJS directly in tests
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''

      if (ctorName === 'SignIn' || (request as { className?: string })?.className === 'auth.SignIn') {
        if (config.signInError) {
          throw makeRPCError(config.signInError)
        }
        return { _: 'auth.authorization', user: { _: 'user', id: config.identity?.id ?? DEFAULT_IDENTITY.id } }
      }

      if (ctorName === 'LogOut' || (request as { className?: string })?.className === 'auth.LogOut') {
        if (config.logoutErrorCode) {
          throw makeRPCError(config.logoutErrorCode)
        }
        return { futureAuthToken: null }
      }

      // Fallback: return a mock result for unrecognised requests
      return {}
    },

    // ── Auth: signInWithPassword ──────────────────────────────────────────────
    // telegram@2.26.22: signInWithPassword(client, apiCredentials, authParams: UserPasswordAuthParams)
    // UserPasswordAuthParams.password is a CALLBACK: (hint?: string) => Promise<string>
    signInWithPassword: async (
      _apiCreds: { apiId: number; apiHash: string },
      authParams: {
        password?: (hint?: string) => Promise<string>
        onError: (err: Error) => Promise<boolean> | void
      }
    ): Promise<unknown> => {
      if (config.signInWithPasswordError) {
        const err = makeRPCError(config.signInWithPasswordError)
        const shouldStop = await authParams.onError(err)
        if (shouldStop !== false) throw err
      }
      // Call the password callback to simulate the GramJS SRP flow
      if (authParams.password) {
        await authParams.password(undefined) // no hint in tests
      }
      const identity = config.identity ?? DEFAULT_IDENTITY
      return { _: 'user', id: identity.id }
    },

    // ── Identity ──────────────────────────────────────────────────────────────
    getMe: async (): Promise<{
      firstName: string
      lastName?: string
      username?: string
      id: { toString: () => string }
    }> => {
      const id = config.identity ?? DEFAULT_IDENTITY
      return {
        firstName: id.firstName,
        lastName: id.lastName,
        username: id.username,
        id: { toString: () => id.id },
      }
    },

    downloadProfilePhoto: async (_entity: unknown): Promise<Buffer | null> => {
      const id = config.identity ?? DEFAULT_IDENTITY
      if (!id.hasPhoto) return null
      return Buffer.from([0x89, 0x50, 0x4e, 0x47]) // minimal PNG magic bytes
    },
  }

  return client
}

export type MockTelegramClient = ReturnType<typeof createMockTelegramClient>
