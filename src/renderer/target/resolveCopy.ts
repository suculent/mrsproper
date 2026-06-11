// Maps typed TargetErrorCode values to human-readable, jargon-free UI copy.
// This is the canonical translation layer from resolution error codes to plain language.
// NO Telegram jargon ("USERNAME_NOT_OCCUPIED", "FLOOD_WAIT", "contacts.ImportContacts") ever reaches the user.
// UI-SPEC §Error states is the source of truth for these strings.

import type { TargetErrorCode } from '@shared/targetTypes'

export const RESOLVE_ERROR_COPY: Record<TargetErrorCode, string> = {
  TARGET_USERNAME_NOT_FOUND:
    'No one has that username. Check the spelling — usernames can change or be deleted.',
  TARGET_PHONE_NOT_FOUND:
    "That number isn't on Telegram, or their privacy settings block phone lookup. If you know their @username, try that instead.",
  TARGET_NO_PUBLIC_PROFILE:
    "This person can't be looked up publicly. Telegram only allows lookup when their settings permit it — try their @username if you have it.",
  FLOOD_WAIT:
    'Too many lookups. Please wait for the countdown to finish.',
  NETWORK:
    "Couldn't reach Telegram. Check your connection and try again.",
  UNKNOWN:
    'Something went wrong looking that up. Please try again.',
}

/**
 * Returns the user-facing error copy for a given TargetErrorCode.
 * Falls back to the UNKNOWN copy if the code is not recognized.
 */
export function getResolveCopy(code: TargetErrorCode): string {
  return RESOLVE_ERROR_COPY[code] ?? RESOLVE_ERROR_COPY.UNKNOWN
}

/**
 * Client-side validation error for malformed usernames (before send).
 * Distinct from TARGET_USERNAME_NOT_FOUND which is the server-side not-found response.
 */
export const INVALID_USERNAME_FORMAT_COPY =
  "That doesn't look like a valid username. Usernames have 5–32 letters, numbers, and underscores."

/**
 * Client-side validation error for malformed phone numbers (before send).
 * Distinct from TARGET_PHONE_NOT_FOUND which is the server-side not-found response.
 */
export const INVALID_PHONE_FORMAT_COPY =
  "That phone number doesn't look right. Check the country and number, then try again."

/**
 * Inline disclosure hint shown below the input when phone mode is detected (D-10).
 * Simplified per D-07 (REVISED): no contact import, just a privacy-based lookup caveat.
 */
export const PHONE_MODE_DISCLOSURE_HINT =
  'Phone lookup only works if their privacy settings allow being found by phone number.'

/**
 * Subtext shown below the inline error when FLOOD_WAIT is active (D-17).
 */
export const FLOOD_WAIT_SUBTEXT =
  'Telegram asked us to slow down. The search will unlock automatically.'
