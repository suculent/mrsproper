---
phase: 04-group-enumeration-membership-rights
plan: "01"
subsystem: test-infrastructure
tags:
  - tdd
  - mock
  - group-enumeration
  - membership-scan
dependency_graph:
  requires:
    - "03-06-SUMMARY.md"
  provides:
    - "src/main/telegram/__mocks__/telegramClient.ts (Phase 4 controls)"
    - "src/main/telegram/groupEnumerator.test.ts"
    - "src/main/telegram/membershipScanner.test.ts"
    - "src/main/ipc/groupChannels.test.ts"
  affects:
    - "04-02-PLAN.md (GroupEnumerator implementation)"
    - "04-03-PLAN.md (MembershipScanner implementation)"
    - "04-04-PLAN.md (groupChannels IPC implementation)"
tech_stack:
  added: []
  patterns:
    - "it.todo() stub pattern for Nyquist-compliant Wave 0 test creation"
    - "vi.mock('electron') pattern for IPC handler test isolation"
    - "Api.Chat / Api.Channel construction via Object.assign for mock entities"
key_files:
  created:
    - src/main/telegram/groupEnumerator.test.ts
    - src/main/telegram/membershipScanner.test.ts
    - src/main/ipc/groupChannels.test.ts
  modified:
    - src/main/telegram/__mocks__/telegramClient.ts
decisions:
  - "Used it.todo() (not it.skip()) for all Wave 0 stubs — these are not implemented yet, todo is the correct marker"
  - "Added Api import from 'telegram' to mock client to construct Api.Chat/Api.Channel entity instances in getDialogs()"
  - "GetParticipant/GetFullChat dispatch branches use ctorName OR className check (same dual-check pattern as existing Phase 3 branches)"
metrics:
  duration_minutes: 2
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_modified: 4
---

# Phase 4 Plan 1: Wave 0 Test Stubs and Mock Client Extension Summary

Extended mock Telegram client with Phase 4 dialog/membership controls and created three RED test stub files for group enumeration, membership scanning, and IPC handler testing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend mock client with Phase 4 dialog and membership controls | 8de5215 | src/main/telegram/__mocks__/telegramClient.ts |
| 2 | Create RED test stubs for all four Phase 4 test files | 5b4ad6e | groupEnumerator.test.ts, membershipScanner.test.ts, groupChannels.test.ts |

## What Was Built

**Mock client extensions** (`telegramClient.ts`):
- `MockClientConfig` gains four new optional fields: `getDialogsResult`, `notMemberDialogIds`, `basicGroupParticipants`, `getDialogsError`
- New `getDialogs()` async method returns `Api.Chat` or `Api.Channel` entity instances based on config
- New `channels.GetParticipant` dispatch branch: throws USER_NOT_PARTICIPANT for IDs in `notMemberDialogIds`, otherwise returns ChannelParticipant
- New `messages.GetFullChat` dispatch branch: returns participant list from `basicGroupParticipants` config
- Added `import { Api } from 'telegram'` for entity construction

**Test stubs** (3 files, 35 todo items, zero failures):
- `groupEnumerator.test.ts` (57 lines): stubs for GRP-04/GRP-05 (type detection, rights, enumerateAtLogin)
- `membershipScanner.test.ts` (67 lines): stubs for GRP-01 (membership checks, progress, abort, retry)
- `groupChannels.test.ts` (115 lines): stubs for GRP-02/GRP-03 IPC + T-04 security gate + Zod validation + window guard

## Verification Results

```
Test Files  1 failed | 11 passed | 3 skipped (15)
     Tests  2 failed | 112 passed | 35 todo (149)
```

- 2 pre-existing failures (config.test.ts AUTH-03 — env vars not set, known baseline)
- 112 existing Phase 1-3 tests continue to pass
- 35 new todo items in 3 skipped test files
- Zero TypeScript compilation errors (`tsc --noEmit` clean)

## Deviations from Plan

None - plan executed exactly as written.

## Threat Flags

None. This plan creates test infrastructure only — no production code paths or trust boundaries introduced.

## Self-Check: PASSED

Files created:
- FOUND: src/main/telegram/groupEnumerator.test.ts
- FOUND: src/main/telegram/membershipScanner.test.ts
- FOUND: src/main/ipc/groupChannels.test.ts

Commits verified:
- FOUND: 8de5215 (Task 1 — mock client extension)
- FOUND: 5b4ad6e (Task 2 — RED test stubs)
