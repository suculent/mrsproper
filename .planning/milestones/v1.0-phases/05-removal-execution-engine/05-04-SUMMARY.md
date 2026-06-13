---
phase: 05-removal-execution-engine
plan: 04
subsystem: removal-engine
tags: [gramjs, state-machine, tdd, editbanned, deletechatuser, generation-guard, pacing, peer-flood, abort]

# Dependency graph
requires:
  - phase: 05-removal-execution-engine
    provides: Plan 01 — shared types (removalTypes.ts), channel constants, opTypes RMV_* codes
  - phase: 05-removal-execution-engine
    provides: Plan 02 — mock client extension (editBannedCalls, deleteChatUserCalls, removeErrorDialogIds)
  - phase: 05-removal-execution-engine
    provides: Plan 03 — AuditStore interface (checkpoint, setStatus, initJob, getRemaining)

provides:
  - RemovalExecutor class with execute(), abortExecution(), retryGroup(), getState()
  - RemovalExecutorClient and RemovalExecutorOptions interfaces
  - All 15 removalExecutor.test.ts stubs GREEN

affects: [05-removal-execution-engine Wave 3 IPC wiring, 05-05 removalChannels]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RemovalExecutor mirrors MembershipScanner state-machine: generation guard (D-15), abort, retryGroup (CR-02)"
    - "Kick mechanic: two separate governor.run() EditBanned calls with 500ms sleep between (from chats.js lines 329-343)"
    - "Ban mechanic: single EditBanned(viewMessages=true, untilDate=0)"
    - "Basic group: DeleteChatUser without revokeHistory (T-05-04-A security invariant)"
    - "PEER_FLOOD: classifyRpcError(err).disposition === 'hard-stop' → hard-stop, remaining groups NOT skipped"
    - "Abort: generation++ + AbortController.abort() → execute() loop marks remaining as skipped"
    - "Inter-group pacing: 2000ms + random(1000ms) setTimeout AFTER checkpoint, BEFORE next group"
    - "Generation guard test: inject execute() mid-invoke() so guard fires after async gap"

key-files:
  created:
    - src/main/telegram/RemovalExecutor.ts
  modified:
    - src/main/telegram/removalExecutor.test.ts

key-decisions:
  - "Generation guard test uses real timers + invoke() interception to increment generation mid-await — fake timers caused timing issues with governor's serial tail-chain"
  - "abortExecution() only emits 'stopped' when state is not already stopped/complete — consistent with semantics of abort on an idle/complete executor being a no-op"
  - "Pacing (2s+jitter) fires AFTER checkpoint, BEFORE next group — NOT between the two kick EditBanned calls"
  - "revokeHistory intentionally absent from DeleteChatUser — T-05-04-A security invariant, constructor omission enforced by TypeScript"
  - "PEER_FLOOD outer catch re-throws from _classifyRemovalError so execute() loop detects hard-stop disposition and exits without marking remaining groups"

requirements-completed:
  - RMV-01
  - RMV-02
  - EXE-04
  - EXE-05

# Metrics
duration: 30min
completed: 2026-06-12
---

# Phase 5 Plan 04: RemovalExecutor State Machine Summary

**RemovalExecutor implemented as a generation-guarded state machine: ban uses single EditBanned call, kick uses restrict-then-unban with 500ms sleep, basic group always uses DeleteChatUser — all 15 TDD test stubs GREEN.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-06-12
- **Tasks:** 1 (TDD: RED commit + GREEN commit)
- **Files created/modified:** 2

## Accomplishments

- Full TDD cycle: RED phase (test stubs converted + committed as failing), GREEN phase (RemovalExecutor.ts created)
- All 15 tests GREEN: ban/kick/basic-group mechanics, outcome classification, live progress, PEER_FLOOD hard-stop, abort, generation guard
- Security invariants enforced: revokeHistory absent from DeleteChatUser, accessHash from resolver only, PEER_FLOOD exits loop without marking remaining groups
- Anti-patterns absent: no `client.kickParticipant()`, no `revokeHistory: true`, no `bigInt.zero` for target accessHash
- Kick mechanic mirrors verified GramJS chats.js pattern: two separate governor.run() calls with 500ms sleep between

## Task Commits

1. **RED phase** - `73f5405` (test): convert 15 it.todo() stubs to real failing tests
2. **GREEN phase** - `4c70afb` (feat): implement RemovalExecutor with all behaviors

## Files Created/Modified

- `src/main/telegram/RemovalExecutor.ts` — RemovalExecutor class with execute(), abortExecution(), retryGroup(), getState(); exports RemovalExecutorClient, RemovalExecutorOptions
- `src/main/telegram/removalExecutor.test.ts` — 15 tests: ban mechanic, kick mechanic, basic group, outcome classification, live progress, PEER_FLOOD hard-stop, abort, generation guard

## Decisions Made

1. **Generation guard test uses real timers + invoke() injection**: Fake timers caused governor's serial tail-chain to block. Instead, a new `execute()` call is injected synchronously inside `invoke()` so it increments `_generation` before `retryGroup`'s guard check fires.

2. **abortExecution() only emits 'stopped' when not already stopped/complete**: Calling `abortExecution()` on an executor in 'complete' or 'stopped' state is semantically a no-op for state emission. The generation increment still happens, which is what the guard tests rely on.

3. **Pacing after checkpoint, not between kick calls**: Inter-group 2s+jitter fires AFTER the group's outcome is checkpointed. The 500ms sleep between the two kick EditBanned calls is part of the kick mechanic, not pacing.

4. **PEER_FLOOD re-throw pattern**: `_classifyRemovalError` re-throws when `classifyRpcError(err).disposition === 'hard-stop'` so the outer `execute()` catch block can detect it and call `setStatus('hard-stopped')`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All behaviors are fully implemented and tested.

## Threat Flags

No new security-relevant surface beyond the plan's threat model:
- T-05-04-A: revokeHistory absent ✓ (constructor call omits the field, TypeScript-enforced)
- T-05-04-B: accessHash from resolver only ✓ (IPC payload carries dialogIds only)
- T-05-04-C: PEER_FLOOD hard-stop exits loop ✓ (remaining groups not skipped/marked)
- T-05-04-D: generation guard prevents stale retries ✓ (tested with invoke() injection)

## Self-Check: PASSED
