// Shared types for the rate-limit governor and operation error classifier.
// Imported by both main (governor, operationErrors) and renderer (Phase 5 progress).
// Single source of truth for Disposition, OperationErrorCode, and GovernorEvent shapes.
// Plans 02-02 and 02-03 implement against these exact shapes.

/**
 * Disposition — the outcome the governor/classifier assigns to an operation error.
 * Phase 5's executor consumes these values to decide per-group behavior.
 *
 *   wait      — FLOOD_WAIT: sleep server-specified duration and resume
 *   retry     — transient network/timeout: bounded retry with backoff
 *   skip      — reserved for Phase 5 (e.g. USER_NOT_PARTICIPANT — skip this group, continue job)
 *   fail      — unrecoverable but non-fatal: surface error, continue job
 *   hard-stop — PEER_FLOOD: abort the job immediately, no retry (SESSION_INVALID maps to 'fail' — see operationErrors.ts)
 */
export type Disposition = 'wait' | 'retry' | 'skip' | 'fail' | 'hard-stop'

/**
 * Typed error codes for operational (post-auth) Telegram errors.
 * The classifier maps raw GramJS RPCError strings to these codes — NO raw string
 * ever crosses a layer boundary.
 */
export type OperationErrorCode =
  | 'FLOOD_WAIT'
  | 'PEER_FLOOD'
  | 'SESSION_INVALID'
  | 'NETWORK'
  | 'UNKNOWN'
  // Phase 3 additions — cause-specific target resolution codes (D-16, TGT-04).
  // These carry disposition 'fail' (non-retryable resolution failures — T-03-02).
  | 'TARGET_USERNAME_NOT_FOUND'
  | 'TARGET_PHONE_NOT_FOUND'
  | 'TARGET_NO_PUBLIC_PROFILE'
// Phase 6 extends this with: USER_PRIVACY_RESTRICTED, CHAT_ADMIN_REQUIRED, etc.

/**
 * The classified result returned by classifyRpcError().
 * retryAfterSeconds is only present when disposition is 'wait'.
 */
export interface ClassifiedOperationError {
  /** Typed error code — never a raw Telegram string. */
  code: OperationErrorCode
  /** How the governor/executor should handle this error. */
  disposition: Disposition
  /** Seconds to wait — only present when disposition is 'wait' (FLOOD_WAIT). */
  retryAfterSeconds?: number
}

/**
 * Discriminated union of events the RateLimitGovernor emits to consumers.
 * Every member carries only typed codes and numeric values — no raw GramJS payload.
 *
 * Consumed by Phase 5/6 for live progress UI. Emitted during governor.run() execution.
 */
export type GovernorEvent =
  | {
      /** 1-Hz countdown tick during a FLOOD_WAIT sleep. */
      type: 'flood-tick'
      remaining: number
    }
  | {
      /** PEER_FLOOD surfaced — job must hard-stop. SESSION_INVALID maps to 'fail' disposition (operationErrors.ts). */
      type: 'hard-stop'
      code: OperationErrorCode
    }
  | {
      /** FLOOD_WAIT above the 3600s ceiling (D-12) — job should pause and inform user. */
      type: 'wait-too-long'
      seconds: number
    }
  | {
      /** Transient error retry in progress (D-14). */
      type: 'retry-attempt'
      attempt: number
      maxAttempts: number
    }
