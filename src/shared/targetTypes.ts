// Shared types imported by both main and renderer.
// Single source of truth for target resolution state, IPC DTOs, and error codes.
// Phase 3 plans implement against these exact shapes.
// Modeled exactly on src/shared/authTypes.ts — discriminated union + DTO interface pattern.

/**
 * Typed error codes for target resolution failures.
 * Cause-specific codes back actionable error copy in the renderer (D-16, TGT-04).
 * FLOOD_WAIT and NETWORK mirror the governor error taxonomy for consistent handling (D-17).
 */
export type TargetErrorCode =
  | 'TARGET_USERNAME_NOT_FOUND'
  | 'TARGET_PHONE_NOT_FOUND'
  | 'TARGET_NO_PUBLIC_PROFILE'
  | 'FLOOD_WAIT'
  | 'NETWORK'
  | 'UNKNOWN'

/**
 * Renderer-safe representation of a resolved Telegram user.
 *
 * Security boundary (T-03-01, RESEARCH Pitfall 4, Pattern 5):
 *   - accessHash is intentionally ABSENT — it stays in main's TargetResolver service only.
 *   - id is bigint.toString() — Telegram user IDs exceed Number.MAX_SAFE_INTEGER (TGT-03).
 *
 * All fields sourced from the resolved User object + users.GetFullUser for bio.
 * No extra API calls needed for name/username/deleted/bot/premium/lastSeen (D-13).
 */
export interface ResolvedTargetDTO {
  /** Stable numeric user ID as a decimal string (bigint.toString()). */
  id: string
  /** Display name (firstName + lastName). */
  name: string
  /** Telegram @username, or null if none. */
  username: string | null
  /** Profile bio from users.GetFullUser, or null if none/unavailable. */
  bio: string | null
  /** Profile photo bytes, or null if hidden/missing (VRF-01, D-12). */
  avatar: Uint8Array | null
  /** True if the account has been deleted. Shown as warning (D-18). */
  deleted: boolean
  /** True if the account is a bot. Shown as warning (D-18). */
  bot: boolean
  /** True if the account has Telegram Premium. */
  premium: boolean
  /** Last-seen hint from the User object, or null if hidden (D-13). */
  lastSeen: string | null
}

/**
 * Target resolution state machine — discriminated union used by both main and renderer.
 *
 * Steps:
 *   idle       — no target set; waiting for user input
 *   resolving  — Find button pressed; API calls in progress
 *   resolved   — API calls complete; target card visible, awaiting confirmation (D-11)
 *   confirmed  — user clicked "Yes, this is the person"; target locked for Phase 4
 *   error      — resolution failed; inline error visible; input stays editable (D-15)
 *
 * "Change target" resets to idle and clears all downstream state (D-14).
 */
export type TargetState =
  | { step: 'idle' }
  | { step: 'resolving' }
  | { step: 'resolved'; target: ResolvedTargetDTO }
  | { step: 'confirmed'; target: ResolvedTargetDTO }
  | { step: 'error'; code: TargetErrorCode; input: string }
