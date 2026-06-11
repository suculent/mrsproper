// Shared types imported by both main and renderer.
// Single source of truth for group enumeration state, IPC DTOs, and error codes.
// Phase 4 plans implement against these exact shapes.
// Modeled exactly on src/shared/targetTypes.ts.

/**
 * Group type discriminator — determines which GramJS entity class backs this dialog
 * and which removal API to use (deleteChatUser for basic-group, editBanned for channels/supergroups).
 */
export type GroupType = 'basic-group' | 'supergroup' | 'broadcast-channel'

/**
 * Reason why a group row is greyed out (non-actionable).
 * Cause-specific codes back actionable copy in the renderer (D-03).
 */
export type GreyReason =
  | 'not-creator'
  | 'no-ban-right'
  | 'broadcast-channel'
  | 'not-admin'
  | 'verify-failed'

/**
 * Renderer-safe representation of a Telegram dialog (group/supergroup/channel)
 * that the logged-in admin is a member of.
 *
 * Security boundary (T-04-01, mirrors T-03-01):
 *   accessHash intentionally omitted — stays in GroupEnumerator internal map (T-04-01, mirrors T-03-01).
 *   id is bigint.toString() — Telegram chat IDs exceed Number.MAX_SAFE_INTEGER.
 */
export interface AdminDialogDTO {
  /** Stable numeric chat/channel ID as a decimal string (bigint.toString()). */
  id: string
  /** Display name of the group/supergroup/channel. */
  title: string
  /** Group avatar photo bytes, or null if hidden/missing. */
  avatar: Uint8Array | null
  /** Current member count, or null if unavailable. */
  memberCount: number | null
  /** Group type — basic-group, supergroup, or broadcast-channel. */
  type: GroupType
  /** True if the admin has rights to remove members from this group. */
  canAct: boolean
  /** Reason why this group is non-actionable, or null if actionable. */
  greyReason: GreyReason | null
}

/**
 * Membership check result for a single group.
 */
export type MembershipStatus = 'pending' | 'member' | 'not-member' | 'failed'

/**
 * Result of a membership check for one dialog during the scan.
 */
export interface MembershipResultDTO {
  dialogId: string
  status: MembershipStatus
}

/**
 * Progress snapshot for the membership scan — streamed to renderer as checks complete.
 */
export type ScanProgressDTO = { checked: number; total: number }

/**
 * Typed error codes for group enumeration and membership scan failures.
 * Mirrors TargetErrorCode taxonomy for consistent governor error handling.
 */
export type GroupErrorCode = 'FLOOD_WAIT' | 'NETWORK' | 'UNKNOWN'

/**
 * Group enumeration state machine — discriminated union used by both main and renderer.
 *
 * Steps:
 *   idle     — not yet loaded; waiting for login to complete
 *   loading  — getDialogs() call in progress
 *   loaded   — dialog list ready; dialogs array holds all admin-accessible groups
 *   error    — enumeration failed; inline error visible
 */
export type GroupsState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; dialogs: AdminDialogDTO[] }
  | { step: 'error'; code: GroupErrorCode }

/**
 * Membership scan state machine — discriminated union used by both main and renderer.
 *
 * Steps:
 *   idle      — no scan running; waiting for target confirmation
 *   scanning  — per-group membership checks in progress; results stream in
 *   complete  — all groups checked; results contains final membership list
 *   error     — scan failed fatally; per-group retries available via SCAN_RETRY_GROUP
 */
export type ScanState =
  | { step: 'idle' }
  | { step: 'scanning'; progress: ScanProgressDTO; results: MembershipResultDTO[] }
  | { step: 'complete'; results: MembershipResultDTO[] }
  | { step: 'error'; code: GroupErrorCode }
