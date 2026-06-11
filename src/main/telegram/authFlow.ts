/**
 * Stepped GramJS auth flow — RESEARCH Pattern 2.
 *
 * Does NOT use client.start() (its blocking-callback model fights the stepped D-06 UI).
 * Lower-level path:
 *   startPhone → sendCode → returns { phoneCodeHash, isCodeViaApp }
 *   submitCode → invoke(Api.auth.SignIn) → catch SESSION_PASSWORD_NEEDED (Pitfall 4) → needPassword
 *   submitPassword → signInWithPassword (callback form per A2 resolution)
 *   fetchIdentity → getMe + downloadProfilePhoto
 *
 * The AuthFlow class is constructed with the TelegramClient injected, so tests
 * can substitute the plan-02 mock client without any Electron/GramJS overhead.
 *
 * Security (D-02): no session string, no api credentials leave this module.
 * All state transitions are emitted via the injected `onStateChange` callback
 * which the SessionManager wires to win.webContents.send.
 */

import { Api } from 'telegram'
import type { AuthState, SubmitPhone, SubmitCode, SubmitPassword } from '@shared/authTypes'
import { classifyTelegramError } from './errors'
import { floodWaitSeconds, FloodWaitController } from './floodWait'

// ── API credentials shape ───────────────────────────────────────────────────

export interface ApiCredentials {
  apiId: number
  apiHash: string
}

// ── Minimal client surface used by AuthFlow ─────────────────────────────────

export interface AuthFlowClient {
  sendCode(
    apiCreds: ApiCredentials,
    phoneNumber: string
  ): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }>

  invoke(request: unknown): Promise<unknown>

  signInWithPassword(
    apiCreds: ApiCredentials,
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

// ── AuthFlow class ──────────────────────────────────────────────────────────

/**
 * Stepped auth flow for one login session.
 * Constructed with the client injected so tests use the plan-02 mock.
 *
 * Usage:
 *   const flow = new AuthFlow(client, { apiId, apiHash }, (state) => emit(state))
 *   await flow.submitPhone({ dialCode: '+1', national: '2025551234' })
 *   await flow.submitCode({ code: '12345' })
 *   // or if 2FA:
 *   await flow.submitPassword({ password: 'mypassword' })
 */
export class AuthFlow {
  private readonly _client: AuthFlowClient
  private readonly _apiCreds: ApiCredentials
  private readonly _emit: (state: AuthState) => void
  private readonly _floodController: FloodWaitController

  private _phoneNumber: string | null = null
  private _phoneCodeHash: string | null = null

  constructor(
    client: AuthFlowClient,
    apiCreds: ApiCredentials,
    onStateChange: (state: AuthState) => void
  ) {
    this._client = client
    this._apiCreds = apiCreds
    this._emit = onStateChange
    this._floodController = new FloodWaitController()
  }

  /**
   * Submit the phone number. Transitions: idle → sendingCode → needCode.
   */
  async submitPhone(payload: SubmitPhone): Promise<void> {
    const phoneNumber = `${payload.dialCode}${payload.national}`
    this._phoneNumber = phoneNumber

    this._emit({ step: 'sendingCode' })

    try {
      const { phoneCodeHash, isCodeViaApp } =
        await this._client.sendCode(this._apiCreds, phoneNumber)
      this._phoneCodeHash = phoneCodeHash
      this._emit({
        step: 'needCode',
        sentTo: isCodeViaApp ? 'Telegram app' : 'SMS',
        canResend: true,
      })
    } catch (err) {
      this._handleError(err, 'phone')
    }
  }

  /**
   * Submit the login code. Transitions:
   *   → verifying → authorized (happy path)
   *   → verifying → needPassword (SESSION_PASSWORD_NEEDED)
   *   → error (PHONE_CODE_INVALID / PHONE_CODE_EXPIRED, stays on code step per D-12)
   */
  async submitCode(payload: SubmitCode): Promise<void> {
    if (!this._phoneNumber || !this._phoneCodeHash) {
      this._emit({ step: 'error', code: 'UNKNOWN', retryStep: 'phone' })
      return
    }

    this._emit({ step: 'verifying' })

    try {
      await this._client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this._phoneNumber,
          phoneCodeHash: this._phoneCodeHash,
          phoneCode: payload.code,
        })
      )
      // Happy path: authorized
      await this._authorizeAndEmitIdentity()
    } catch (err: unknown) {
      // RESEARCH Pitfall 4: branch on errorMessage === 'SESSION_PASSWORD_NEEDED' exactly
      if ((err as { errorMessage?: string })?.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        this._emit({ step: 'needPassword' })
        return
      }
      // PHONE_CODE_INVALID / PHONE_CODE_EXPIRED / FLOOD_WAIT → classify and emit
      this._handleError(err, 'code')
    }
  }

  /**
   * Submit the 2FA password. Transitions:
   *   → authorized (happy path)
   *   → error (PASSWORD_HASH_INVALID stays on password step per D-12)
   *
   * Uses signInWithPassword callback form (A2 resolution — password is (hint?)=>Promise<string>).
   */
  async submitPassword(payload: SubmitPassword): Promise<void> {
    this._emit({ step: 'verifying' })

    try {
      await this._client.signInWithPassword(this._apiCreds, {
        password: async (_hint?: string) => payload.password,
        onError: async (err: Error) => {
          // Classification handled below in the catch; return false to let error propagate
          return false
        },
      })
      // Authorized via 2FA
      await this._authorizeAndEmitIdentity()
    } catch (err) {
      this._handleError(err, 'password')
    }
  }

  /**
   * Resend the login code for the phone already submitted (D-12 "Resend").
   * Actually re-issues sendCode and refreshes the phoneCodeHash — without this
   * the Resend button emitted state but no new Telegram message was sent.
   */
  async resend(): Promise<void> {
    if (!this._phoneNumber) {
      this._emit({ step: 'error', code: 'UNKNOWN', retryStep: 'phone' })
      return
    }

    this._emit({ step: 'sendingCode' })

    try {
      const { phoneCodeHash, isCodeViaApp } =
        await this._client.sendCode(this._apiCreds, this._phoneNumber)
      this._phoneCodeHash = phoneCodeHash
      this._emit({
        step: 'needCode',
        sentTo: isCodeViaApp ? 'Telegram app' : 'SMS',
        canResend: true,
      })
    } catch (err) {
      this._handleError(err, 'code')
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Fetch identity after successful sign-in and emit the authorized state.
   * Persists the session (caller is responsible for persistence if needed via SessionManager).
   */
  private async _authorizeAndEmitIdentity(): Promise<void> {
    const identity = await fetchIdentity(this._client)
    this._emit({ step: 'authorized', identity })
  }

  /**
   * Handle a caught error:
   * - FLOOD_WAIT: start countdown, emit floodWait state
   * - other: classify and emit error state (retryStep keeps user on correct screen D-12)
   */
  private _handleError(err: unknown, defaultRetryStep: 'phone' | 'code' | 'password'): void {
    const waitSeconds = floodWaitSeconds(err)
    if (waitSeconds !== null) {
      // FLOOD_WAIT — start countdown (D-13). Keep the ACTUAL step the flood
      // happened on: a flood during sendCode must return to the phone step
      // afterward (no code was ever sent), not jump to a code step.
      const retryStep = defaultRetryStep
      this._emit({
        step: 'floodWait',
        retryStep,
        secondsRemaining: waitSeconds,
      })
      this._floodController.start(
        waitSeconds,
        (tick) => {
          // onTick: caller (SessionManager) wires this to IPC flood tick events
          // AuthFlow itself does not have access to win.webContents — emit updated state
          this._emit({
            step: 'floodWait',
            retryStep,
            secondsRemaining: tick.remaining,
          })
        },
        () => {
          // onDone: re-enable submit by returning to the originating step
          if (retryStep === 'phone') {
            // No code was sent — go back to phone entry, not a phantom code step
            this._emit({ step: 'idle' })
          } else if (retryStep === 'code') {
            this._emit({
              step: 'needCode',
              sentTo: 'Telegram app',
              canResend: true,
            })
          } else {
            this._emit({ step: 'needPassword' })
          }
        }
      )
      return
    }

    const classified = classifyTelegramError(err)
    const retryStep =
      classified.retryStep === 'phone' && defaultRetryStep !== 'phone'
        ? defaultRetryStep
        : classified.retryStep
    this._emit({
      step: 'error',
      code: classified.code,
      retryStep,
    })
  }
}

// ── Module-level auth functions (used by SessionManager directly) ──────────

/**
 * Start phone authentication — sends the code via Telegram.
 * Returns { phoneCodeHash, isCodeViaApp } for use in submitCode.
 */
export async function startPhone(
  client: AuthFlowClient,
  apiCreds: ApiCredentials,
  phoneNumber: string
): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> {
  return client.sendCode(apiCreds, phoneNumber)
}

/**
 * Submit the login code.
 * Returns { authorized: true } on success or { authorized: false, needPassword: true }
 * when the account has 2FA.
 * Rethrows other RPCErrors (PHONE_CODE_INVALID, PHONE_CODE_EXPIRED, FLOOD_WAIT_x).
 */
export async function submitCode(
  client: AuthFlowClient,
  phoneNumber: string,
  phoneCodeHash: string,
  phoneCode: string
): Promise<{ authorized: true } | { authorized: false; needPassword: true }> {
  try {
    await client.invoke(
      new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode })
    )
    return { authorized: true }
  } catch (err: unknown) {
    // RESEARCH Pitfall 4: exact GramJS string check
    if ((err as { errorMessage?: string })?.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      return { authorized: false, needPassword: true }
    }
    throw err
  }
}

/**
 * Submit the 2FA password.
 * Uses the callback form for signInWithPassword (A2 resolution).
 * Do NOT hand-roll SRP — GramJS's computeCheck does it.
 */
export async function submitPassword(
  client: AuthFlowClient,
  apiCreds: ApiCredentials,
  password: string
): Promise<{ authorized: true; user: unknown }> {
  const user = await client.signInWithPassword(apiCreds, {
    password: async (_hint?: string) => password,
    onError: async (_err: Error) => false,
  })
  return { authorized: true, user }
}

/**
 * Fetch identity after successful login (D-11).
 * Returns { name, username|null, id, avatar|null }.
 */
export async function fetchIdentity(client: AuthFlowClient): Promise<{
  name: string
  username: string | null
  id: string
  avatar: Uint8Array | null
}> {
  const me = await client.getMe()
  const photo = await client.downloadProfilePhoto(me)

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
