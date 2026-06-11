---
phase: 04-group-enumeration-membership-rights
plan: "04"
subsystem: membership-scan
tags:
  - tdd
  - membership-scan
  - gramjs
  - rate-limiting
  - security
dependency_graph:
  requires:
    - "04-01-SUMMARY.md (test stubs + mock client)"
    - "04-02-SUMMARY.md (groupTypes.ts — ScanState, MembershipResultDTO, AdminDialogDTO)"
    - "04-03-SUMMARY.md (GroupEnumerator — getState, getDialogEntity)"
  provides:
    - "src/main/telegram/MembershipScanner.ts (per-target membership scan service)"
  affects:
    - "04-05-PLAN.md (groupChannels IPC — wires MembershipScanner to renderer)"
tech_stack:
  added: []
  patterns:
    - "Generation-token D-15 pattern: _generation counter invalidates prior in-flight scans on scan() / abortScan()"
    - "AbortController per scan() call — abort signal checked at loop boundaries"
    - "Per-group failure isolation: inner try/catch marks failed without aborting the scan loop"
    - "USER_NOT_PARTICIPANT via errorMessage check (not classifyRpcError) — raw RPC string before governor sees it"
    - "RESEARCH Pitfall 1: ChannelParticipantLeft / ChannelParticipantBanned checked before declaring member=true"
    - "Test error shape: use errorMessage field so governor classifies as UNKNOWN/fail (not NETWORK/retry)"
key_files:
  created:
    - src/main/telegram/MembershipScanner.ts
  modified:
    - src/main/telegram/membershipScanner.test.ts
decisions:
  - "USER_NOT_PARTICIPANT caught via errorMessage === 'USER_NOT_PARTICIPANT' in inner try/catch, not via classifyRpcError — this keeps the non-member path fast (no governor classification overhead) and avoids re-throw into the failure isolation path"
  - "Test errors must use errorMessage field (not plain Error) — governor classifies plain Error (no errorMessage) as NETWORK/retry, causing 3-attempt backoff before failure; errorMessage='SOME_RPC_ERROR' maps to UNKNOWN/fail and is immediate"
  - "RESEARCH Pitfall 1 handled: participant.className checked for ChannelParticipantLeft/Banned after successful GetParticipant return"
  - "retryGroup() merges result via Array.map over existing results — preserves order and all other group results"
metrics:
  duration_minutes: 3
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_modified: 2
---

# Phase 4 Plan 4: MembershipScanner — per-target membership scan with streaming progress Summary

MembershipScanner.ts implemented using RED→GREEN TDD: checks membership per group type (GetParticipant for supergroups/channels, GetFullChat for basic groups), streams ScanState progress events, isolates per-group failures, handles all three non-member signals, and uses generation-token abort.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Convert it.todo stubs to failing tests for MembershipScanner | 02efe1c | src/main/telegram/membershipScanner.test.ts |
| 2 (GREEN) | Implement MembershipScanner.ts — all tests pass green | 370a591 | src/main/telegram/MembershipScanner.ts, membershipScanner.test.ts |

## What Was Built

**MembershipScanner.ts** (new file, ~220 lines):
- `MembershipScannerClient` interface: `invoke(request: unknown): Promise<unknown>`
- `MembershipScannerOptions` interface: `client`, `governor`, `enumerator`, `resolver`, `onStateChange`
- `MembershipScanner` class:
  - `scan()`: increments _generation (gen token D-15), creates AbortController, reads target from resolver.getResolvedUser(), iterates enumerator dialogs with per-group try/catch, emits scanning progress updates, emits complete
  - `_checkMembership(dialog, inputUser, resolved)`: supergroup → channels.GetParticipant via governor.run; basic-group → messages.GetFullChat via governor.run; handles USER_NOT_PARTICIPANT, ChannelParticipantLeft, ChannelParticipantBanned
  - `abortScan()`: increments _generation, calls abort on AbortController, emits idle
  - `getState()`: returns current ScanState
  - `retryGroup(dialogId)`: re-runs _checkMembership for single group, merges into complete state

**membershipScanner.test.ts** (expanded from 11 todo stubs to 11 real test cases):
- 4 supergroup/channel tests: member, USER_NOT_PARTICIPANT, ChannelParticipantLeft, ChannelParticipantBanned
- 2 basic group tests: userId present/absent in GetFullChat participants
- 2 progress emission tests: scanning with checked/total, complete when done
- 1 failure isolation test: per-group SOME_RPC_ERROR → failed, scan continues
- 1 abortScan test: generation incremented, emits idle
- 1 retryGroup test: initial failure → retry succeeds → member

## Verification Results

```
npm test -- --reporter=verbose | grep "membershipScanner" → 11 passing, 0 failing
npx tsc --noEmit → 0 errors
grep "getResolvedUser" src/main/telegram/MembershipScanner.ts → 5 matches (target from resolver only)
grep "USER_NOT_PARTICIPANT|ChannelParticipantLeft|ChannelParticipantBanned" src/main/telegram/MembershipScanner.ts → all handled
```

Full suite: `Tests  2 failed | 137 passed | 12 todo (151)` — only pre-existing AUTH-03 failures remain.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test error shape caused governor retry loop and test failure**
- **Found during:** Task 2 (GREEN) — failure isolation and retryGroup tests taking ~1 second and failing
- **Issue:** Tests used `throw new Error('UNEXPECTED_ERROR')` — a plain Error with no `errorMessage` field. The governor's `classifyRpcError` maps no-errorMessage errors to `NETWORK/retry` disposition, causing 3 attempts with exponential backoff (1s total) before throwing. After 3 retries the second call in `callCount` check returned a member response, so status was 'member' not 'failed'.
- **Fix:** Changed test errors to `throw Object.assign(new Error('SOME_RPC_ERROR'), { errorMessage: 'SOME_RPC_ERROR' })` — this maps to `UNKNOWN/fail` disposition (immediate throw, no retry), which exercises the failure isolation path correctly.
- **Files modified:** src/main/telegram/membershipScanner.test.ts
- **Commit:** 370a591 (included in GREEN commit)

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | 02efe1c | PASSED — tests failed with "Cannot find module './MembershipScanner'" before implementation |
| GREEN (feat) | 370a591 | PASSED — all 11 tests pass after implementation |
| REFACTOR | — | Not needed — code is clean from initial write |

## Known Stubs

None. MembershipScanner produces real membership status for all group types.

## Threat Flags

None. T-04-04 confirmed: `MembershipScanner.scan()` reads target from `this._resolver.getResolvedUser()` in the main process — no renderer-supplied target ID or accessHash is accepted. The scan:start IPC channel carries no payload (enforced in Plan 05).

## Self-Check: PASSED

Files created:
- FOUND: src/main/telegram/MembershipScanner.ts

Files modified:
- FOUND: src/main/telegram/membershipScanner.test.ts

Commits verified:
- FOUND: 02efe1c (Task 1 — RED tests)
- FOUND: 370a591 (Task 2 — GREEN implementation)
