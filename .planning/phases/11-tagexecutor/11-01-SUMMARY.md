---
phase: 11-tagexecutor
plan: "01"
subsystem: testing
tags: [vitest, tdd, red, tagexecutor, gramjs, electron-main]

requires:
  - phase: 09-tag-api-layer-224-connection
    provides: TagClient (connect/invoke/disconnect), tagApi.ts (makeEditChatParticipantRankRequest)
  - phase: 10
    provides: TagAuditStore interface, tagTypes.ts (TagState, TagGroupOutcome, TagErrorCode, TagJobFile)

provides:
  - Failing tagExecutor.test.ts with all behavioral contracts for TagExecutor expressed as RED tests
  - makeTagAuditStore() test factory with checkpointCalls/setStatusCalls/initJobCalled inspection
  - makeTagExecutor() test factory with separate mockTagClient and mockMainClient
  - 18 it() blocks covering TAG-03, TAG-04, and §4.3 lifecycle requirements

affects:
  - 11-02 (GREEN phase — TagExecutor.ts implementation must satisfy these tests)
  - 11-03 (index.ts wiring — replaces stub with real TagExecutor)

tech-stack:
  added: []
  patterns:
    - "Separate mockTagClient (connect/invoke/disconnect) and mockMainClient (GetParticipant) — two-client test factory mirroring removalExecutor.test.ts style"
    - "makeTagAuditStore() with in-memory checkpointCalls/setStatusCalls/initJobCalled for assertion-friendly inspection"
    - "vi.useFakeTimers() + vi.runAllTimersAsync() before awaiting execute() to advance pacing sleeps without wall-clock delay"
    - "PEER_FLOOD injection via { errorMessage: 'PEER_FLOOD' } plain object (matches classifyRpcError() branch in operationErrors.ts line 83)"

key-files:
  created:
    - src/main/telegram/tagExecutor.test.ts
  modified: []

key-decisions:
  - "mockTagClient and mockMainClient are separate objects (unlike RemovalExecutor which uses a single mockClient) — TagExecutor's two-client architecture requires distinct spies to verify write-only tagClient and read-only mainClient contracts"
  - "PEER_FLOOD injected as { errorMessage: 'PEER_FLOOD' } — operationErrors.ts reads (err as { errorMessage? }).errorMessage and branches on exact string match; no class, message, or seconds fields needed"
  - "afterEach(() => vi.useRealTimers()) added to every describe block alongside beforeEach fake timers — prevents timer state leaking between test suites"

patterns-established:
  - "TagExecutor test factory pattern: makeTagExecutor({ dialogs, adminDialogIds?, auditStore? }) returns { executor, mockTagClient, mockMainClient, states, auditStore, dialogIds }"

requirements-completed:
  - TAG-03
  - TAG-04
---

# Phase 11 Plan 01: TagExecutor RED Tests Summary

**All 18 failing tests for TagExecutor written as TDD RED phase — behavioral contracts covering per-group dispatch, admin skip, basic-group skip, PEER_FLOOD hard-stop, abort/generation-guard, checkpoint ordering, governor event forwarding, and §4.3 tagClient lifecycle**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-20T15:22:26Z
- **Completed:** 2026-06-20T15:24:35Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `src/main/telegram/tagExecutor.test.ts` with 18 `it()` blocks across 8 `describe()` groups
- `makeTagAuditStore()` factory tracks `checkpointCalls`, `setStatusCalls`, and `initJobCalled` in-memory
- `makeTagExecutor()` factory injects separate `mockTagClient` (connect/invoke/disconnect) and `mockMainClient` (GetParticipant) to enforce the write-only/read-only client boundary
- `npx vitest run src/main/telegram/tagExecutor.test.ts` exits non-zero with "Cannot find module './TagExecutor'" — confirmed RED state

## Task Commits

1. **Task 1: Write all failing tagExecutor tests (RED)** — `8627036` (test)

## Files Created/Modified

- `src/main/telegram/tagExecutor.test.ts` — 677 lines; all behavioral contracts for TAG-03, TAG-04, §4.3 lifecycle; imports `{ TagExecutor }` from `./TagExecutor` (missing module — RED state)

## Decisions Made

- Separate `mockTagClient` and `mockMainClient` objects rather than a single mock client — TagExecutor's architecture uses two distinct Telegram clients (write-only layer-224 tagClient, read-only main client for GetParticipant) and the tests must verify each client's call contract independently.
- `afterEach(() => vi.useRealTimers())` added in every describe block — prevents fake timer state from leaking between describe blocks and causing flaky failures in neighboring suites.
- PEER_FLOOD error injected as a plain `{ errorMessage: 'PEER_FLOOD' }` object (no class, no `seconds`) — matches the exact branch in `operationErrors.ts` line 83 that classifies it as `hard-stop`.

## Deviations from Plan

None — plan executed exactly as written. The test file matches the factory blueprints in `11-PATTERNS.md` and all test cases listed in the `<behavior>` block of the plan.

## Issues Encountered

None.

## Known Stubs

None — this is a pure test file (RED phase). No implementation stubs exist in the created file.

## Threat Flags

None — test-only file; no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Next Phase Readiness

- RED tests committed at `8627036`; `TagExecutor.ts` does not yet exist
- Plan 02 (GREEN) can now implement `TagExecutor.ts` targeting these exact test cases
- All 18 test cases are non-trivial (no `.toBe(true)` no-ops); each asserts specific behavioral outcomes

## Self-Check: PASSED

- `src/main/telegram/tagExecutor.test.ts` exists (677 lines)
- Commit `8627036` exists in git log
- `npx vitest run src/main/telegram/tagExecutor.test.ts` exits non-zero with import error for `./TagExecutor`

---
*Phase: 11-tagexecutor*
*Completed: 2026-06-20*
