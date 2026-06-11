---
phase: 03
plan: 01
subsystem: shared-types
tags: [types, ipc-channels, error-classification, tdd, mock-client]
dependency_graph:
  requires:
    - src/shared/authTypes.ts
    - src/main/telegram/operationErrors.ts
    - src/main/telegram/__mocks__/telegramClient.ts
  provides:
    - src/shared/targetTypes.ts
    - src/shared/channels.ts (TARGET_* constants)
    - src/shared/opTypes.ts (TARGET_* OperationErrorCode members)
    - src/main/telegram/operationErrors.ts (USERNAME_NOT_OCCUPIED, PHONE_NOT_OCCUPIED branches)
    - src/main/telegram/__mocks__/telegramClient.ts (ResolveUsername/ResolvePhone/GetFullUser dispatch)
  affects:
    - All Phase 3 plans (Wave 2+): depend on stable TargetState, ResolvedTargetDTO, TARGET_* channels
    - Phase 5/6: OperationErrorCode extended with 3 TARGET_* codes; forward comment updated
tech_stack:
  added: []
  patterns:
    - Discriminated union state machine (TargetState) — exact analog of AuthState pattern
    - DTO interface with security boundary (ResolvedTargetDTO — no accessHash by construction)
    - Typed error codes with disposition 'fail' for non-retryable resolution errors
    - TDD RED/GREEN for classifier extension (2 tests RED → GREEN)
key_files:
  created:
    - src/shared/targetTypes.ts
  modified:
    - src/shared/channels.ts
    - src/shared/opTypes.ts
    - src/main/telegram/operationErrors.ts
    - src/main/telegram/operationErrors.test.ts
    - src/main/telegram/__mocks__/telegramClient.ts
decisions:
  - T-03-01: ResolvedTargetDTO has no accessHash field by construction — TypeScript type prevents accidental addition; main holds accessHash internally for Phase 4 use
  - T-03-02: TARGET_* codes carry disposition 'fail' (non-retryable) — resolution errors must not cause governor retry loops
  - Phase 6 comment: opTypes.ts forward comment updated from "Phase 5" to "Phase 6" to reflect Phase 3 additions
metrics:
  duration_minutes: 3
  completed_date: "2026-06-11"
  tasks: 2
  files: 6
---

# Phase 3 Plan 01: Shared Type Contracts Summary

Wave 1 foundation for target resolution: TargetState discriminated union, ResolvedTargetDTO (renderer-safe, no accessHash), IPC channel constants, extended OperationErrorCode with 3 TARGET_* resolution codes, classifier branches for USERNAME_NOT_OCCUPIED / PHONE_NOT_OCCUPIED, and extended mock client for Wave 2 test authoring.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create targetTypes.ts, extend channels.ts + opTypes.ts | c63206e |
| 2 (RED) | Add failing TGT-04 tests for USERNAME_NOT_OCCUPIED + PHONE_NOT_OCCUPIED | df19e84 |
| 2 (GREEN) | Extend operationErrors.ts classifier + mock client invoke dispatch | 9c646d7 |

## Verification Results

- tsc --noEmit: exits 0 (clean)
- operationErrors.test.ts: 14/14 tests GREEN (12 existing + 2 new TGT-04)
- Full suite: 80/82 tests pass; 2 failures in config.test.ts are pre-existing RED tests (env injection for API keys, out of scope)
- No accessHash field in ResolvedTargetDTO interface (security check PASS — T-03-01)
- TARGET_RESOLVE constant in channels.ts CHANNELS object: confirmed
- TARGET_USERNAME_NOT_FOUND in opTypes.ts OperationErrorCode union: confirmed

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. This plan creates type definitions and extends a classifier — no UI stubs or placeholder data.

## Threat Flags

No new security-relevant surface introduced. All threat model items addressed:
- T-03-01: ResolvedTargetDTO has no accessHash — verified by TypeScript type and automated check
- T-03-02: TARGET_* codes have disposition 'fail' — verified by TGT-04 tests
- T-03-SC: No new npm packages installed

## Self-Check: PASSED

All created/modified files exist and all commits confirmed.

| Check | Result |
|-------|--------|
| src/shared/targetTypes.ts exists | PASS |
| src/shared/channels.ts has TARGET_RESOLVE | PASS |
| src/shared/opTypes.ts has TARGET_USERNAME_NOT_FOUND | PASS |
| src/main/telegram/operationErrors.ts has USERNAME_NOT_OCCUPIED branch | PASS |
| src/main/telegram/__mocks__/telegramClient.ts has ResolveUsername dispatch | PASS |
| Commit c63206e exists | PASS |
| Commit df19e84 exists | PASS |
| Commit 9c646d7 exists | PASS |
