/**
 * SessionManager — the single service facade for auth + session lifecycle (RESEARCH Pattern 4/6).
 *
 * Owns:
 *   - one TelegramClient (injected or constructed from config)
 *   - the AuthState machine (idle → sendingCode → needCode → [needPassword] → authorized | error | floodWait)
 *   - persist/restore/logout orchestration
 *
 * Composes:
 *   - authFlow (startPhone/submitCode/submitPassword/fetchIdentity)
 *   - classifyTelegramError (errors.ts)
 *   - RateLimitGovernor (governor.ts) — all post-auth Telegram calls
 *   - storage backend (safeStorage in production) — injectable for tests
 *
 * Security (D-02):
 *   - Session string never crosses to the renderer
 *   - Logout always wipes local session regardless of server revocation outcome (D-17)
 *
 * Dead session handling (AUTH-04 / RESEARCH Pattern 3):
 *   - restore() / initialize(): on AUTH_KEY_UNREGISTERED / SESSION_REVOKED / AUTH_KEY_DUPLICATED
 *     → wipeSession() + route to idle (login screen)
 *
 * The client and secrets store are injectable (constructor deps) for unit tests.
 * In production, SessionManager is constructed in main/index.ts after app.whenReady().
 */

import { Api } from 'telegram'
import type { AuthState, SubmitPhone, SubmitCode, SubmitPassword, LogoutResult, Identity } from '@shared/authTypes'
import type { GovernorEvent } from '@shared/opTypes'
import { AuthFlow } from './authFlow'
import { classifyTelegramError } from './errors'
import { RateLimitGovernor } from './governor'

// ── Dead session error codes (RESEARCH Pattern 3 + Code Examples) ─────────

const DEAD_SESSION_ERRORS = new Set([
  'AUTH_KEY_UNREGISTERED',
  'SESSION_REVOKED',
  'AUTH_KEY_DUPLICATED',
])

function isDeadSessionError(err: unknown): boolean {
  const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
  return DEAD_SESSION_ERRORS.has(msg)
}

// ── Minimal client surface (injectable) ───────────────────────────────────

export interface SessionManagerClient {
  connect(): Promise<void>
  disconnect(): Promise<void>
  checkAuthorization(): Promise<boolean>
  sendCode(
    apiCreds: { apiId: number; apiHash: string },
    phoneNumber: string
  ): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }>
  invoke(request: unknown): Promise<unknown>
  signInWithPassword(
    apiCreds: { apiId: number; apiHash: string },
    authParams: {
      password?: (hint?: string) => Promise<string>
      onError: (err: Error) => Promise<boolean> | void
    }
  ): Promise<unknown>
  getMe(): Promise<{
    firstName: string
    lastName?: string
    username?: string
    id: { toString(): string }
  }>
  downloadProfilePhoto(entity: unknown): Promise<Buffer | Uint8Array | null>
  session: { save(): string }
}

// ── Injectable SecretsStore (matches the MockSafeStorage interface for tests) ─

export interface SessionManagerStorage {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encryptedData: Buffer): string
}

// ── SessionManager constructor options ────────────────────────────────────

export interface SessionManagerOptions {
  /** The TelegramClient (real or mock). */
  client: SessionManagerClient
  /** Storage backend for encrypting/decrypting sessions (real safeStorage or mock). */
  storage: SessionManagerStorage
  /** Called whenever the auth state changes (wired to win.webContents.send in production). */
  onStateChange: (state: AuthState) => void
  /** Called when the local session is wiped (after dead session detection or logout). */
  onSessionWipe?: () => void
  /** Called to durably persist the session string (wired to the on-disk SecretsStore in production). */
  onSessionPersist?: (sessionString: string) => void
  /** API credentials — used by AuthFlow for sendCode / signInWithPassword. */
  apiCreds?: { apiId: number; apiHash: string }
  /** Called on governor events (FLOOD_WAIT ticks, hard-stop, retry) — wired to IPC in production. */
  onGovernorEvent?: (event: GovernorEvent) => void
}

// ── SessionManager ─────────────────────────────────────────────────────────

export class SessionManager {
  private readonly _client: SessionManagerClient
  private readonly _storage: SessionManagerStorage
  private readonly _emit: (state: AuthState) => void
  private readonly _onSessionWipe: (() => void) | undefined
  private readonly _onSessionPersist: ((sessionString: string) => void) | undefined
  private readonly _apiCreds: { apiId: number; apiHash: string }
  private readonly _governor: RateLimitGovernor

  private _currentState: AuthState = { step: 'idle' }
  private _authFlow: AuthFlow | null = null
  private _connected = false
  private _connectPromise: Promise<void> | null = null

  // In-memory encrypted session store (mirrors SecretsStore behaviour)
  private _encryptedSession: Buffer | undefined = undefined

  constructor(options: SessionManagerOptions) {
    this._client = options.client
    this._storage = options.storage
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
    this._onSessionWipe = options.onSessionWipe
    this._onSessionPersist = options.onSessionPersist
    this._apiCreds = options.apiCreds ?? { apiId: 0, apiHash: '' }
    this._governor = new RateLimitGovernor({
      client: options.client,
      onEvent: options.onGovernorEvent,
    })
  }

  // ── State accessor ─────────────────────────────────────────────────────────

  getState(): AuthState {
    return this._currentState
  }

  // ── Initialize / restore ───────────────────────────────────────────────────

  /**
   * Try to restore a persisted session (called on app launch with a saved session string).
   * On dead session → wipeSession() + route to idle (login screen).
   *
   * @param sessionString Optional existing session string to restore; if omitted, starts fresh.
   */
  async initialize(sessionString?: string): Promise<void> {
    if (!sessionString) {
      // No saved session — start at idle
      this._emit({ step: 'idle' })
      return
    }

    try {
      await this._client.connect()
      this._connected = true
      const isAuthorized = await this._client.checkAuthorization()

      if (!isAuthorized) {
        // Connected but session is not authorized — treat as dead
        this._wipeSessionLocally()
        this._emit({ step: 'idle' })
        return
      }

      // Session is live — fetch identity and emit authorized
      const identity = await this._fetchIdentity()
      // Persist the live session
      this._persistSession(this._client.session.save())
      this._emit({ step: 'authorized', identity })
    } catch (err) {
      if (isDeadSessionError(err)) {
        // Dead session (AUTH_KEY_UNREGISTERED etc.) — wipe and route to login
        this._wipeSessionLocally()
        this._emit({ step: 'idle' })
        return
      }
      // Transient error (offline launch, network failure, FLOOD_WAIT on getMe…) —
      // the persisted session may still be perfectly valid. Do NOT wipe it; just
      // route to idle so the user can retry. Wiping here destroyed a fully valid
      // login on any offline launch (review CR-01).
      this._emit({ step: 'idle' })
    }
  }

  /**
   * Restore session for use in production main/index.ts.
   * Reads the persisted session string from the secrets store.
   */
  async restore(): Promise<void> {
    const sessionString = this._restoreSession()
    await this.initialize(sessionString ?? undefined)
  }

  // ── Auth flow delegation ───────────────────────────────────────────────────

  /**
   * Submit phone number (step 1 of login).
   * Creates a fresh AuthFlow for this login session.
   */
  async submitPhone(payload: SubmitPhone): Promise<void> {
    // GramJS requires a connected client before sendCode. On a fresh launch
    // initialize() routes straight to idle without connecting, so connect lazily
    // here (idempotent via the _connected guard) before the login path runs.
    try {
      await this._ensureConnected()
    } catch (err) {
      const classified = classifyTelegramError(err)
      this._emit({ step: 'error', code: classified.code, retryStep: 'phone' })
      return
    }

    this._authFlow = new AuthFlow(
      // cast: AuthFlowClient is compatible with SessionManagerClient
      this._client as unknown as import('./authFlow').AuthFlowClient,
      this._apiCreds,
      (state) => {
        // On authorized: persist session
        if (state.step === 'authorized') {
          try {
            this._persistSession(this._client.session.save())
          } catch {
            // ENCRYPTION_UNAVAILABLE — session stays in-memory this run
          }
        }
        this._emit(state)
      }
    )
    await this._authFlow.submitPhone(payload)
  }

  /**
   * Submit the login code (step 2).
   */
  async submitCode(payload: SubmitCode): Promise<void> {
    if (!this._authFlow) {
      this._emit({ step: 'error', code: 'UNKNOWN', retryStep: 'phone' })
      return
    }
    await this._authFlow.submitCode(payload)
  }

  /**
   * Submit the 2FA password (step 3 — conditional).
   */
  async submitPassword(payload: SubmitPassword): Promise<void> {
    if (!this._authFlow) {
      this._emit({ step: 'error', code: 'UNKNOWN', retryStep: 'phone' })
      return
    }
    await this._authFlow.submitPassword(payload)
  }

  /**
   * Resend the login code (re-issue sendCode for the same phone).
   * Returns to needCode state.
   */
  async resendCode(): Promise<void> {
    if (!this._authFlow) {
      this._emit({ step: 'error', code: 'UNKNOWN', retryStep: 'phone' })
      return
    }
    // Delegate to AuthFlow.resend(), which actually re-calls sendCode for the
    // stored phone number and refreshes the phoneCodeHash. (Previously this only
    // emitted needCode without dispatching a new code.)
    await this._authFlow.resend()
  }

  // ── Logout ─────────────────────────────────────────────────────────────────

  /**
   * Revoke the server-side authorization and ALWAYS wipe the local session (D-17).
   *
   * Pattern 6: try LogOut → finally disconnect + wipeSession.
   * Returns { serverRevoked: true } on success, { serverRevoked: false } on server failure.
   * The local session is ALWAYS wiped regardless of server outcome.
   */
  async logout(): Promise<LogoutResult> {
    let serverRevoked = false

    try {
      // Api.auth.LogOut takes NO constructor argument (telegram@2.26.22 api.d.ts:
      // class LogOut extends Request<void, auth.TypeLoggedOut>).
      await this._governor.run(() => this._client.invoke(new Api.auth.LogOut()))
      serverRevoked = true
    } catch {
      serverRevoked = false
    } finally {
      try {
        await this._client.disconnect()
      } catch {
        // Best-effort disconnect — don't let this block the wipe
      }
      this._connected = false
      // ALWAYS wipe (D-17)
      this._wipeSessionLocally()
      this._emit({ step: 'idle' })
    }

    return { serverRevoked }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Connect the GramJS client once. Idempotent — subsequent calls are no-ops
   * while the connection is live. Required before sendCode on a fresh login.
   */
  private async _ensureConnected(): Promise<void> {
    if (this._connected) return
    // Cache the in-flight connect so two concurrent IPC calls don't both call
    // client.connect() after passing the _connected=false guard.
    if (!this._connectPromise) {
      this._connectPromise = (async () => {
        await this._client.connect()
        this._connected = true
      })().finally(() => {
        this._connectPromise = null
      })
    }
    await this._connectPromise
  }

  private _persistSession(sessionString: string): void {
    try {
      if (!this._storage.isEncryptionAvailable()) {
        // D-03: do NOT write plaintext — keep in memory only
        return
      }
      this._encryptedSession = this._storage.encryptString(sessionString)
      // Durably persist to the on-disk SecretsStore (in production) so the session
      // survives an app restart. Without this the session lived only in memory.
      this._onSessionPersist?.(sessionString)
    } catch {
      // ENCRYPTION_UNAVAILABLE or other error — in-memory only
    }
  }

  private _restoreSession(): string | null {
    if (!this._encryptedSession) return null
    if (!this._storage.isEncryptionAvailable()) return null
    try {
      return this._storage.decryptString(this._encryptedSession)
    } catch {
      return null
    }
  }

  private _wipeSessionLocally(): void {
    this._encryptedSession = undefined
    this._onSessionWipe?.()
  }

  private async _fetchIdentity(): Promise<Identity> {
    const me = await this._governor.run(() => this._client.getMe()) as Awaited<ReturnType<SessionManagerClient['getMe']>>
    const photo = await this._governor.run(() => this._client.downloadProfilePhoto(me))

    const name = [me.firstName, me.lastName].filter(Boolean).join(' ').trim() || me.firstName || ''
    const avatar =
      photo && (photo as Buffer | Uint8Array).length > 0
        ? new Uint8Array(photo as Buffer | Uint8Array)
        : null

    return {
      name,
      username: me.username ?? null,
      id: me.id.toString(),
      avatar,
    }
  }
}
