---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
plan: 02
subsystem: add-executor
tags: [electron, add-executor, identity, resume, zod]
requires: []
provides:
  - AddExecutor.checkResumeIdentity (narrow D-07 rule) and AddExecutorLike member
  - Job-target-only retryGroup (D-06)
  - Persisted bannedDialogIds (D-10) and optional outcome retryDmStatus (for Plan 03)
affects: [17-03, 17-06]
key-files:
  modified:
    - src/shared/addTypes.ts
    - src/main/storage/addAuditStore.ts
    - src/main/storage/addAuditStore.test.ts
    - src/main/telegram/AddExecutor.ts
    - src/main/telegram/addExecutor.test.ts
    - src/main/ipc/addChannels.ts
    - src/main/ipc/addChannels.test.ts
decisions:
  - "execute() mismatch guard runs before generation bump and _runActive, so a rejected call never disturbs a live job view; emits idle only when already idle"
  - "retryGroup requires _resolvedTarget, live resolver id match (if any), and job file targetId match; zero RPC on refusal"
  - "Live scan status wins over persisted bannedDialogIds via _effectiveScanStatus"
metrics:
  tasks: 3
  files: 7
completed: 2026-10-24
---

# Phase 17 Plan 02: Identity lock and persisted unban-first Summary

Retry and resume now act only on the add job's own target (checkResumeIdentity in IPC plus a defense-in-depth check in execute), and a banned target is unbanned first after relaunch via bannedDialogIds persisted in add-job.json.

## Commits
- b4eff57: bannedDialogIds and retryDmStatus in types and Zod schemas; ADD_GET_JOB strips bannedDialogIds
- f0aa592: AddExecutor checkResumeIdentity, job-only retry, persisted-banned fallback, tests
- 77ddc31: ADD_START uses checkResumeIdentity, rejects mismatched resume

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Obsolete test contradicting D-07**
- **Found during:** Task 2
- **Issue:** Existing test "resume:true but the existing job's targetId does not match ... falls back to a fresh job" asserted the behavior D-07 forbids (same dialog set, different identity must not initJob).
- **Fix:** Updated to assert rejection (no initJob, job unchanged).
- **Files modified:** src/main/telegram/addExecutor.test.ts
- **Commit:** f0aa592

## Deferred Issues
- src/main/telegram/config.test.ts (2 tests, API_ID/API_HASH env not injected) fails in this environment; pre-existing and unrelated.

## Verification
vitest src/main/storage, telegram, ipc: all pass except the pre-existing config.test failures; tsc --noEmit for node and web projects clean; no stray .js/.d.ts under src/.

## Self-Check: PASSED
