// Maps typed AuthErrorCode values to human-readable, jargon-free UI copy.
// This is the canonical translation layer from GramJS error codes to plain language.
// NO Telegram jargon ("FLOOD_WAIT", "PHONE_NUMBER_INVALID", "AUTH_KEY") ever reaches the user.
// UI-SPEC §Error states is the source of truth for these strings.

import type { AuthErrorCode } from '@shared/authTypes'

export const ERROR_COPY: Record<AuthErrorCode, string> = {
  PHONE_NUMBER_INVALID:
    "Telegram didn't recognize that number. Double-check it and try again.",
  PHONE_CODE_INVALID:
    'That code wasn’t right. Check it and try again.',
  PHONE_CODE_EXPIRED:
    'That code expired. Tap Resend code to get a new one.',
  PASSWORD_HASH_INVALID:
    'That password wasn’t right. Try again.',
  FLOOD_WAIT:
    'Too many attempts. Please wait for the countdown to finish before trying again.',
  NETWORK:
    'Couldn’t reach Telegram. Check your connection and try again.',
  UNKNOWN:
    'Something went wrong. Please try again.',
}

/**
 * Returns the user-facing error copy for a given AuthErrorCode.
 * Falls back to the UNKNOWN copy if the code is not recognized.
 */
export function getErrorCopy(code: AuthErrorCode): string {
  return ERROR_COPY[code] ?? ERROR_COPY.UNKNOWN
}

/**
 * Pre-send phone validation error (client-side, before submitPhone call).
 * Distinct from PHONE_NUMBER_INVALID which is the server-side rejection.
 */
export const INVALID_PHONE_FORMAT_COPY =
  "That phone number doesn’t look right. Check the country and number, then try again."
