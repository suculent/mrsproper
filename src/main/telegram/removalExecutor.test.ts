/**
 * Wave 0 RED stubs for RemovalExecutor.ts (RMV-01, RMV-02, EXE-04, EXE-05).
 *
 * All tests are it.todo() — Nyquist compliance gate before implementation.
 * Vitest treats todo stubs as pending (not failing) and exits 0.
 *
 * Test map:
 *   RMV-01: ban mechanic — single EditBanned call with viewMessages=true untilDate=0
 *   RMV-01: kick mechanic — two EditBanned calls (restrict + unban) with 500ms sleep between
 *   RMV-02: basic group — DeleteChatUser regardless of severity
 *   RMV-02: basic group ban fallback annotation
 *   RMV-02: USER_NOT_PARTICIPANT → already-gone outcome
 *   RMV-02: USER_ADMIN_INVALID → per-group failed, run continues
 *   RMV-02: CHAT_ADMIN_REQUIRED → per-group failed, run continues
 *   EXE-04: live progress onStateChange before each group API call
 *   EXE-04: progress.processed increments after each group checkpoint
 *   EXE-03: PEER_FLOOD mid-run → hard-stopped, remaining groups not skipped (resumable)
 *   CONTEXT: abort mid-run — current call completes, remaining marked skipped
 *   CONTEXT: generation guard — stale retry result never emitted
 */

import { describe, it } from 'vitest'

// ---------------------------------------------------------------------------
// RMV-01 — Ban mechanic
// ---------------------------------------------------------------------------

describe('RemovalExecutor — ban mechanic', () => {
  it.todo('ban on supergroup: single EditBanned call with viewMessages=true untilDate=0')
  it.todo('ban on supergroup: editBannedCalls.length === 1 after execute')
})

// ---------------------------------------------------------------------------
// RMV-01 — Kick mechanic
// ---------------------------------------------------------------------------

describe('RemovalExecutor — kick mechanic', () => {
  it.todo('kick on supergroup: two EditBanned calls (restrict + unban) with 500ms sleep between')
  it.todo('kick second call: ChatBannedRights with untilDate=0 and all flags omitted')
})

// ---------------------------------------------------------------------------
// RMV-02 — Basic group
// ---------------------------------------------------------------------------

describe('RemovalExecutor — basic group', () => {
  it.todo('basic group: DeleteChatUser called regardless of severity')
  it.todo('basic group ban: outcome note is basic-group-ban-fallback')
  it.todo('basic group: revokeHistory never passed as true')
})

// ---------------------------------------------------------------------------
// RMV-02 — Outcome classification
// ---------------------------------------------------------------------------

describe('RemovalExecutor — outcome classification', () => {
  it.todo('USER_NOT_PARTICIPANT: outcome status is already-gone (not failed)')
  it.todo('USER_ADMIN_INVALID: per-group outcome failed with code RMV_TARGET_IS_ADMIN; run continues to next group')
  it.todo('CHAT_ADMIN_REQUIRED: per-group outcome failed with code RMV_NO_RIGHTS; run continues')
})

// ---------------------------------------------------------------------------
// EXE-04 — Live progress
// ---------------------------------------------------------------------------

describe('RemovalExecutor — live progress (EXE-04)', () => {
  it.todo('onStateChange fires with step=running and currentGroupId before each group API call')
  it.todo('progress.processed increments after each group checkpoint')
})

// ---------------------------------------------------------------------------
// EXE-03 — PEER_FLOOD hard-stop
// ---------------------------------------------------------------------------

describe('RemovalExecutor — PEER_FLOOD hard-stop (EXE-03)', () => {
  it.todo('PEER_FLOOD on group 2 of 3: step transitions to hard-stopped; group 3 not marked skipped (resumable)')
})

// ---------------------------------------------------------------------------
// CONTEXT — Abort (Stop removal)
// ---------------------------------------------------------------------------

describe('RemovalExecutor — abort (Stop removal)', () => {
  it.todo('abortExecution() during group 2 of 3: current call completes; groups 3+ marked skipped; step=stopped')
})

// ---------------------------------------------------------------------------
// CONTEXT — Generation guard
// ---------------------------------------------------------------------------

describe('RemovalExecutor — generation guard', () => {
  it.todo('stale retry: discarded job result from outdated generation never emitted')
})
