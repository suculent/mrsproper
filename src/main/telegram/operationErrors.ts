/**
 * Operation RPC error classification (EXE-03, D-04 taxonomy).
 *
 * classifyRpcError() is the SINGLE translation layer between raw GramJS RPCErrors
 * and the typed OperationErrorCode/Disposition domain. NO raw Telegram string
 * crosses a layer boundary after this function.
 *
 * Every RPCError maps to:
 *   - code:              typed OperationErrorCode from src/shared/opTypes.ts
 *   - disposition:       how the governor/executor handles this error
 *   - retryAfterSeconds: only present when disposition is 'wait' (FLOOD_WAIT)
 *
 * GramJS error shapes (RESEARCH Pitfall 4):
 *   - RPCError with .errorMessage (string) — the canonical field to branch on
 *   - FloodWaitError adds .seconds (number)
 *   - Network errors may lack .errorMessage entirely
 *
 * PITFALL GUARDS:
 *   - Pitfall 1: PEER_FLOOD has no class — branch on errorMessage === 'PEER_FLOOD'
 *     BEFORE the FloodWaitError check; PEER_FLOOD must NEVER fall into the 'wait' path.
 *   - Pitfall 4: Use errorMessage (RPCError canonical field), never err.message.
 */

import type { ClassifiedOperationError } from '@shared/opTypes'
import { floodWaitSeconds } from './floodWait'

// ── Session-invalid error codes ────────────────────────────────────────────
// Mirrors DEAD_SESSION_ERRORS in SessionManager.ts — same GramJS errorMessage strings.
// AUTH_KEY_INVALID added (broader coverage for dead-session conditions).

const SESSION_INVALID_ERRORS = new Set([
  'AUTH_KEY_UNREGISTERED',
  'SESSION_REVOKED',
  'AUTH_KEY_DUPLICATED',
  'AUTH_KEY_INVALID',
])

// ── Classifier ─────────────────────────────────────────────────────────────

/**
 * Translate a raw GramJS RPCError into a typed ClassifiedOperationError.
 *
 * Branch order (CRITICAL — Pitfall 1 demands PEER_FLOOD check BEFORE FloodWaitError):
 *   1. errorMessage === 'PEER_FLOOD'        → hard-stop (Pitfall 1 protection)
 *   2. floodWaitSeconds(err) !== null        → wait (shared primitive per D-03)
 *   3. SESSION_INVALID_ERRORS.has(errorMsg) → fail
 *   4. !errorMessage (network failure)      → retry
 *   5. unmapped RPCError                    → fail
 *
 * 'skip' disposition is NOT in Phase 2 taxonomy — Phase 5 extension point per D-04.
 */
export function classifyRpcError(err: unknown): ClassifiedOperationError {
  // RESEARCH Pitfall 4: always use errorMessage (RPCError canonical field), not message
  const errorMessage: string =
    (err as { errorMessage?: string })?.errorMessage ?? ''

  // ── 1. PEER_FLOOD — hard-stop (Pitfall 1: MUST precede FloodWaitError check) ──
  // PEER_FLOOD has no dedicated GramJS class — check errorMessage exactly before
  // any flood-wait pattern matching. Falling through to 'wait' would be wrong.

  if (errorMessage === 'PEER_FLOOD') {
    return { code: 'PEER_FLOOD', disposition: 'hard-stop' }
  }

  // ── 2. FLOOD_WAIT_n — timed wait, retryable (D-03: shared primitive) ──
  // Uses floodWaitSeconds() from floodWait.ts — one source of truth for wait duration.

  const waitSeconds = floodWaitSeconds(err)
  if (waitSeconds !== null) {
    return {
      code: 'FLOOD_WAIT',
      disposition: 'wait',
      retryAfterSeconds: waitSeconds,
    }
  }

  // ── 3. Session-invalid codes — unrecoverable, non-retryable ──

  if (SESSION_INVALID_ERRORS.has(errorMessage)) {
    return { code: 'SESSION_INVALID', disposition: 'fail' }
  }

  // ── 4. Network / connection errors — no errorMessage field ──
  // Plain Error objects (e.g., fetch failed, connection reset) have no .errorMessage.

  if (!errorMessage) {
    return { code: 'NETWORK', disposition: 'retry' }
  }

  // ── 5. Unmapped RPCError → UNKNOWN ──
  // Any GramJS RPCError with an errorMessage that doesn't match the above patterns.

  return { code: 'UNKNOWN', disposition: 'fail' }
}
