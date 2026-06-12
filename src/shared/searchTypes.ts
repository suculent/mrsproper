// Shared types for name-based target search (Phase 4.1, TGT-05).
// Imported by both main (ParticipantSearcher, searchChannels) and renderer (searchStore, CandidateList).
// Single source of truth for SearchState, CandidateDTO, SearchErrorCode, and SearchProgressDTO.
// Modeled exactly on src/shared/groupTypes.ts.

/**
 * Renderer-safe representation of a candidate found during a name search.
 *
 * Security boundary (T-04.1-01, mirrors T-03-01):
 *   accessHash intentionally omitted — stored in ParticipantSearcher._candidateAccessHashes (main-only).
 *   id is bigint.toString() — Telegram user IDs exceed Number.MAX_SAFE_INTEGER.
 */
export interface CandidateDTO {
  /** Stable numeric user ID as a decimal string (bigint.toString() — NEVER Number()). */
  id: string
  /** Display name (firstName + optional lastName). */
  name: string
  /** Telegram username without @, or null if not set. */
  username: string | null
  /** True if the account has been deleted. */
  deleted: boolean
  /** Group titles the candidate was found in (no accessHash — stays in main). */
  foundIn: string[]
  /** Avatar photo bytes, or null if hidden/missing. */
  avatar: Uint8Array | null
}

/**
 * Typed error codes for name search failures.
 * Mirrors GroupErrorCode taxonomy for consistent governor error handling.
 */
export type SearchErrorCode = 'GROUPS_NOT_LOADED' | 'FLOOD_WAIT' | 'NETWORK' | 'UNKNOWN'

/**
 * Progress snapshot for the name search — streamed to renderer as group searches complete.
 */
export interface SearchProgressDTO {
  searched: number
  total: number
}

/**
 * Name search state machine — discriminated union used by both main and renderer.
 *
 * Steps:
 *   idle      — no search running; waiting for user input
 *   searching — per-group participant checks in progress; candidates stream in
 *   complete  — all groups searched; candidates contains final deduplicated list
 *   stopped   — search was aborted by the user; partial candidates available
 *   error     — search failed fatally; inline error visible
 */
export type SearchState =
  | { step: 'idle' }
  | { step: 'searching'; progress: SearchProgressDTO; candidates: CandidateDTO[]; errorCount: number }
  | { step: 'complete'; candidates: CandidateDTO[]; total: number; errorCount: number }
  | { step: 'stopped'; candidates: CandidateDTO[]; errorCount: number }
  | { step: 'error'; code: SearchErrorCode }
