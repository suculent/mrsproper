/**
 * Telegram error classification (T-03-03 / UI-SPEC Copywriting Contract).
 *
 * classifyTelegramError() is the SINGLE translation layer between raw GramJS RPCErrors
 * and the typed AuthErrorCode domain. NO raw Telegram string reaches the renderer UI.
 *
 * Every RPCError maps to:
 *   - code:      typed AuthErrorCode from src/shared/authTypes.ts
 *   - uiCopyKey: a UI-layer key the renderer uses for its copy table (NO Telegram jargon)
 *   - retryStep: which step to stay on after the error (D-12 — never bounce to phone step)
 *   - seconds:   only present for FLOOD_WAIT — how long to wait
 *
 * GramJS error shapes (RESEARCH Pitfall 4):
 *   - RPCError with .errorMessage (string) — the canonical field to branch on
 *   - FloodWaitError adds .seconds (number)
 *   - Network errors may lack .errorMessage entirely
 */

import type { AuthErrorCode } from '@shared/authTypes'

// ── Result type ────────────────────────────────────────────────────────────

export interface ClassifiedError {
  /** Typed error code — never a raw Telegram string. */
  code: AuthErrorCode
  /** UI copy key — renderer looks this up in its copy table; NO jargon. */
  uiCopyKey: string
  /** Which auth step to remain on after this error (D-12). */
  retryStep: 'phone' | 'code' | 'password'
  /** Seconds to wait — only present for FLOOD_WAIT errors. */
  seconds?: number
}

// ── UI copy key constants ──────────────────────────────────────────────────
// These match the Error-states copy table in 01-UI-SPEC.md.
// Keys are opaque to errors.ts — copy values live in the renderer.

const COPY_KEYS = {
  PHONE_NUMBER_INVALID: 'auth.error.phoneNumberInvalid',
  PHONE_CODE_INVALID: 'auth.error.codeInvalid',
  PHONE_CODE_EXPIRED: 'auth.error.codeExpired',
  PASSWORD_HASH_INVALID: 'auth.error.passwordInvalid',
  FLOOD_WAIT: 'auth.error.floodWait',
  NETWORK: 'auth.error.network',
  UNKNOWN: 'auth.error.unknown',
} as const

// ── Classifier ─────────────────────────────────────────────────────────────

/**
 * Translate a raw GramJS error into a typed ClassifiedError.
 *
 * Branch order:
 *   1. Check errorMessage for exact GramJS RPCError string matches (Pitfall 4 — must use errorMessage)
 *   2. Check FLOOD_WAIT_n pattern
 *   3. No errorMessage at all → network/connection failure
 *   4. Anything else → UNKNOWN
 */
export function classifyTelegramError(
  err: unknown
): ClassifiedError {
  const errorMessage: string =
    (err as { errorMessage?: string })?.errorMessage ?? ''

  // ── Exact RPCError string matches (RESEARCH Pitfall 4: use errorMessage, not message) ──

  if (errorMessage === 'PHONE_NUMBER_INVALID') {
    return {
      code: 'PHONE_NUMBER_INVALID',
      uiCopyKey: COPY_KEYS.PHONE_NUMBER_INVALID,
      retryStep: 'phone',
    }
  }

  if (errorMessage === 'PHONE_CODE_INVALID') {
    return {
      code: 'PHONE_CODE_INVALID',
      uiCopyKey: COPY_KEYS.PHONE_CODE_INVALID,
      retryStep: 'code',
    }
  }

  if (errorMessage === 'PHONE_CODE_EXPIRED') {
    return {
      code: 'PHONE_CODE_EXPIRED',
      uiCopyKey: COPY_KEYS.PHONE_CODE_EXPIRED,
      retryStep: 'code', // stay on code step; offer resend (D-12)
    }
  }

  if (errorMessage === 'PASSWORD_HASH_INVALID') {
    return {
      code: 'PASSWORD_HASH_INVALID',
      uiCopyKey: COPY_KEYS.PASSWORD_HASH_INVALID,
      retryStep: 'password', // never bounce back to phone (D-12)
    }
  }

  // ── FLOOD_WAIT_n — timed, retryable (RESEARCH Pattern 5 / D-13) ──

  const floodMatch = /FLOOD_WAIT_(\d+)/.exec(errorMessage)
  if (floodMatch) {
    const seconds =
      typeof (err as { seconds?: number })?.seconds === 'number'
        ? (err as { seconds: number }).seconds
        : Number(floodMatch[1])
    return {
      code: 'FLOOD_WAIT',
      uiCopyKey: COPY_KEYS.FLOOD_WAIT,
      retryStep: 'code', // most FLOOD_WAITs happen during code/password submission
      seconds,
    }
  }

  // ── Network / connection errors — no errorMessage field ──

  if (!errorMessage) {
    return {
      code: 'NETWORK',
      uiCopyKey: COPY_KEYS.NETWORK,
      retryStep: 'phone',
    }
  }

  // ── Unmapped RPCError → UNKNOWN ──
  // SESSION_PASSWORD_NEEDED is a flow-control signal handled upstream in authFlow,
  // NOT an error to classify. If called with it anyway, falls here → UNKNOWN.

  return {
    code: 'UNKNOWN',
    uiCopyKey: COPY_KEYS.UNKNOWN,
    retryStep: 'phone',
  }
}
