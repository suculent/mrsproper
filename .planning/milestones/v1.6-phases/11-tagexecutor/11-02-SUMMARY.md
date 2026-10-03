---
phase: 11-tagexecutor
plan: 02
subsystem: tag-executor
tags: [tdd-green, state-machine, tag-write, generation-guard, flood-protection]
dependency_graph:
  requires:
    - "11-01"  # RED test file
    - "09-02"  # TagClient (connect/invoke/disconnect)
    - "10-01"  # tagTypes.ts (TagState, TagGroupOutcome, TagJobFile, TagErrorCode)
    - "10-04"  # tagAuditStore.ts (initJob/checkpoint/setStatus)
  provides:
    - "TagExecutor class satisfying TagExecutorLike"
    - "GREEN phase: all tagExecutor.test.ts tests pass"
  affects:
    - "src/main/index.ts — wiring site for TagExecutor (Plan 03)"
tech_stack:
  added: []
  patterns:
    - "Generation-token guard (D-15) — 4 guard checkpoints mirroring RemovalExecutor exactly"
    - "tagClient lifecycle — connect() at run start, disconnect() in try/finally (all terminal paths)"
    - "_classifyTagError — hard-stop re-throw FIRST before named RPC string matching (Pitfall 1)"
    - "_connectingTagClient mutex — boolean field on TagExecutor prevents double-connect under concurrent execute() calls"
    - "GetParticipant pre-flight via main client + governor.run() (NOT tagClient — write-only)"
    - "tagClient.invoke() called directly — already governor-wrapped inside TagClient (Pitfall 3)"
key_files:
  created:
    - src/main/telegram/TagExecutor.ts
  modified:
    - src/main/telegram/tagExecutor.test.ts
decisions:
  - "Fixed pre-existing vi.fn<> type-arg syntax in test file (old 2-arg API → current 1-arg callback API) to satisfy tsc --build; no behavioral change"
  - "Guard #2 runs BEFORE auditStore.checkpoint() — mirrors Pitfall 7 from RemovalExecutor to prevent stale outcome persistence"
  - "PEER_FLOOD in _classifyTagError() re-throws before any outcome is returned — execute() catch block is the sole PEER_FLOOD handler"
  - "_connectingTagClient checked synchronously before await connect() — JavaScript single-thread ensures second concurrent execute() sees it set by the first"
metrics:
  duration: "~15min"
  completed: "2026-06-20"
  tasks_completed: 1
  files_changed: 2
---

# Phase 11 Plan 02: TagExecutor Implementation (GREEN) Summary

**One-liner:** TagExecutor state machine — throttled, generation-guarded, per-group tag-write dispatcher with layer-224 tagClient lifecycle, already-admin skip, and PEER_FLOOD hard-stop; all 18 tests green.

## What Was Built

`src/main/telegram/TagExecutor.ts` — 548-line class implementing `TagExecutorLike` (`getState/abortExecution/execute`). Structural mirror of `RemovalExecutor` with per-group call replaced by `tagClient.invoke(makeEditChatParticipantRankRequest(...))`.

Key behaviors:
- **tagClient lifecycle:** `connect()` called once at run start (after early-exit guards pass, before `initJob`); `disconnect()` in `finally` block covering all terminal paths (complete, stopped, hard-stopped, unexpected error)
- **4 generation-token guard checkpoints** (D-15): top-of-loop, after `await _tagGroup()` (before checkpoint), after pacing sleep, post-loop (before complete emission)
- **_tagGroup() dispatch:** basic-group → `TAG_UNSUPPORTED_BASIC_GROUP` skip (no API call); `GetParticipant` pre-flight via `governor.run(mainClient.invoke(...))` → `ChannelParticipantAdmin` → `TAG_TARGET_IS_ADMIN` skip; `tagClient.invoke(editChatParticipantRank)` for all others
- **_classifyTagError():** re-throws on `hard-stop` first; named RPC strings → `TAG_NO_RIGHTS`, `TAG_USER_INVALID`, `TAG_CHANNEL_INVALID`; NETWORK disposition → `NETWORK`; fallthrough → `UNKNOWN`
- **PEER_FLOOD hard-stop:** remaining groups left pending (not marked skipped); resumable via `tag-job.json`
- **_connectingTagClient boolean mutex:** prevents second concurrent `execute()` from issuing a second `connect()` during the first's layer-patch window

## Test Results

```
npx vitest run src/main/telegram/tagExecutor.test.ts
  18 tests passed
  0 tests failed
```

```
npx tsc --build
  (clean — no errors)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vi.fn<> type-arg syntax in tagExecutor.test.ts (Plan 01 deliverable)**
- **Found during:** tsc --build verification
- **Issue:** Test file used old Vitest 2-arg generic form `vi.fn<[], Promise<void>>()` which current Vitest (4.x) rejects with TS2558 "Expected 0-1 type arguments"
- **Fix:** Updated to current single callback-type form `vi.fn<() => Promise<void>>()` and removed unused `bigInt` import
- **Files modified:** `src/main/telegram/tagExecutor.test.ts`
- **Commit:** 3009def (included in the main feat commit)
- **Behavior change:** None — test assertions and mock implementations unchanged

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| All 18 tests pass | PASS |
| `tsc --build` clean | PASS |
| Exports `TagExecutor` and `TagExecutorOptions` | PASS |
| No import from `RemovalExecutor.ts` | PASS — references only in comments |
| `governor.run` appears exactly 1× in implementation code | PASS — line 466 (GetParticipant pre-flight) |
| `tagClient.disconnect` in finally block | PASS — line 284 |
| No shipped-invalid TagErrorCode values in code | PASS — comment mentions only; no code use |
| `TAG_UNSUPPORTED_BASIC_GROUP`, `TAG_TARGET_IS_ADMIN` skips correct | PASS |
| PEER_FLOOD → hard-stop, remaining NOT skipped | PASS |
| _connectingTagClient guard prevents double-connect | PASS |
| Commit format correct | PASS — `feat(11-02): implement TagExecutor...` |

## Known Stubs

None. `TagExecutor.ts` is a complete implementation with no placeholder values or TODO stubs. All state transitions emit real TagState values.

## Threat Flags

None. All threat model mitigations from the plan's `<threat_model>` are implemented:
- T-11-02: target identity from `resolver.getResolvedUser()` only
- T-11-03: `connect()` after guards pass; `disconnect()` in finally
- T-11-04: GetParticipant pre-flight before any tagClient call
- T-11-05: PEER_FLOOD hard-stop, remaining left pending
- T-11-06: all 4 active D-15 guard checkpoints; guard #2 before checkpoint

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/main/telegram/TagExecutor.ts` exists | FOUND |
| `11-02-SUMMARY.md` exists | FOUND |
| Commit 3009def exists | FOUND |
| 18 tests pass | VERIFIED |
| `tsc --build` clean | VERIFIED |
