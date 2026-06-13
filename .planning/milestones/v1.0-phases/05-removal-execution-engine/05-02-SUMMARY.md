---
phase: 05-removal-execution-engine
plan: 02
subsystem: testing
tags: [vitest, gramjs, mock-client, tdd, red-stubs, editbanned, deletechatuser]

# Dependency graph
requires:
  - phase: 05-removal-execution-engine
    provides: Plan 01 — shared types (removalTypes.ts), channel constants, opTypes RMV_* codes

provides:
  - Extended MockClientConfig with removeSuccessDialogIds, removeAlreadyGoneDialogIds, removeErrorDialogIds controls
  - editBannedCalls and deleteChatUserCalls call-recording arrays on mock client (sequence assertions)
  - EditBanned and DeleteChatUser invoke() dispatch branches in mock (configurable error/success)
  - Wave 0 RED it.todo stubs: removalExecutor.test.ts (16 stubs), auditStore.test.ts (7 stubs), removalChannels.test.ts (6 stubs)

affects: [05-removal-execution-engine Wave 1+ implementation plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 5 mock pattern: call-recording arrays initialized in factory and exposed on returned client object"
    - "Wave 0 RED stubs: it.todo() for Nyquist compliance before implementation; vitest exits 0"

key-files:
  created:
    - src/main/telegram/removalExecutor.test.ts
    - src/main/storage/auditStore.test.ts
    - src/main/ipc/removalChannels.test.ts
  modified:
    - src/main/telegram/__mocks__/telegramClient.ts

key-decisions:
  - "editBannedCalls and deleteChatUserCalls exposed directly on returned mock client (not just on config) so tests read them via client.editBannedCalls after execute()"
  - "Call-recording arrays always reset (= []) in factory so each createMockTelegramClient() call starts fresh — prevents cross-test pollution"
  - "MockClientConfig fields editBannedCalls/deleteChatUserCalls are optional (?) in the interface to preserve caller ergonomics; factory unconditionally initializes them"

patterns-established:
  - "Pattern: mock control arrays optional in interface, initialized in factory — same pattern to follow for any future call-recording fields"
  - "Pattern: it.todo() Wave 0 stubs use describe blocks matching the feature area (mechanic, outcome, progress, abort, generation guard)"

requirements-completed:
  - RMV-01
  - RMV-02
  - EXE-04
  - EXE-05

# Metrics
duration: 8min
completed: 2026-06-12
---

# Phase 5 Plan 02: Mock Client Extension + Wave 0 RED Stubs Summary

**Extended mock GramJS client with EditBanned/DeleteChatUser call-recording and wrote 29 Wave 0 RED it.todo stubs across three test files — Nyquist compliance gate before removal engine implementation.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-12T10:29:00Z
- **Completed:** 2026-06-12T10:32:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Mock client now records EditBanned call sequences (ban=1 call, kick=2 calls) and DeleteChatUser calls for sequence assertions
- Three configurable error-injection controls added: removeAlreadyGoneDialogIds throws USER_NOT_PARTICIPANT, removeErrorDialogIds maps dialogId → errorMessage, removeSuccessDialogIds documented
- All Wave 0 test gaps from VALIDATION.md covered: 16 stubs for RemovalExecutor, 7 for AuditStore, 6 for IPC channel security
- vitest run exits 0 on all three new test files; tsc --noEmit exits 0

## Task Commits

1. **Task 1: Extend mock GramJS client** - `2702e6f` (feat)
2. **Task 2: Wave 0 RED test stubs** - `604bf30` (test)

## Files Created/Modified

- `src/main/telegram/__mocks__/telegramClient.ts` — Added Phase 5 mock controls and call-recording arrays; EditBanned/DeleteChatUser invoke dispatch branches
- `src/main/telegram/removalExecutor.test.ts` — 16 it.todo stubs (ban, kick, basic group, outcomes, progress, PEER_FLOOD, abort, generation guard)
- `src/main/storage/auditStore.test.ts` — 7 it.todo stubs (atomic write, checkpoint, readJob edge cases, resume)
- `src/main/ipc/removalChannels.test.ts` — 6 it.todo stubs (Zod validation, auth gate, retryGroup security)

## Decisions Made

- editBannedCalls/deleteChatUserCalls exposed directly on returned mock client (not just on config) so Wave 1+ tests can read `client.editBannedCalls` naturally after calling execute().
- Arrays always reset in factory via `config.editBannedCalls = []` so each createMockTelegramClient() call starts fresh — prevents cross-test pollution without needing beforeEach cleanup.
- MockClientConfig interface uses optional fields (`?`) for call-recording to preserve backward compatibility with existing callers that don't pass them.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

All 29 stubs are intentional Wave 0 RED placeholders. They will be replaced with GREEN implementations in Wave 1 (Plans 03-05) following TDD protocol.

## Threat Flags

None — this plan only modifies test infrastructure (mock client, test stub files). No new network endpoints, auth paths, file access, or schema changes introduced.

## Next Phase Readiness

- Mock client ready for Wave 1 implementation tests to use sequence assertions
- Three test files with it.todo stubs establish the behavioral contract for RemovalExecutor, AuditStore, and removalChannels
- Wave 1 plans (03+) can now write GREEN implementations against these RED stubs

---
*Phase: 05-removal-execution-engine*
*Completed: 2026-06-12*

## Self-Check: PASSED
