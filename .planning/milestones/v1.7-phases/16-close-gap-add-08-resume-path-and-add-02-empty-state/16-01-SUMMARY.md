---
phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state
plan: 01
subsystem: add-executor
tags: [resume, add-mode, main-process, tests]
requires: []
provides:
  - src/shared/addResume.ts (getResumeDialogIds, countProcessedOutcomes, isJobFinished)
  - AddState.dialogIds (non-secret job dialog ids)
  - AddExecutor relaunch-resume target rebuild from add-job.json
affects: [16-03, 16-05]
tech-stack:
  added: []
  patterns: [pure shared helper consumed by renderer and main tests]
key-files:
  created:
    - src/shared/addResume.ts
    - src/main/telegram/addResume.integration.test.ts
  modified:
    - src/shared/addTypes.ts
    - src/main/telegram/AddExecutor.ts
    - src/main/telegram/addExecutor.test.ts
key-decisions:
  - "Target rebuilt only from add-job.json when resolver is null, resume true, job non-complete and dialog-id set matches (D-03)"
  - "Group titles added to add-log entries from the enumerator list (D-14)"
requirements-completed: [ADD-08, ADD-14]
duration: 10min
completed: 2026-10-04
---

# Phase 16 Plan 01: Main-side ADD-08 resume path Summary

Relaunch resume now rebuilds the add target from add-job.json inside main and continues the same jobId, with a shared pure resume helper module, group titles in the add log, and `dialogIds` exposed on AddState.

## Tasks

1. Shared helpers, AddState.dialogIds, executor rebuild + titles: commit 1b1b7db
2. Executor unit tests + cross-process resume test: commit 6b6901e

## Details

- `execute()` hoists a single `readJob()`; null resolver + `resume:true` + non-complete matching job rebuilds `{id, accessHash, name}` from the job (BigInt parse wrapped in try/catch, falls back to idle). Non-resume or mismatched sets still return idle without `initJob`.
- `_resolvedTarget` / `_jobDialogIds` fields: `retryGroup` falls back to the rebuilt target; `_emit` merges `dialogIds` into non-idle states; both reset on idle abort.
- `addedDialogs` / `linkedDialogs` carry `title` via `titleOf`.
- addChannels.ts and addLogStore.ts untouched. No identity is added to AddState.
- Tests: 5 new executor tests (null resolver x3, dialogIds, titles) and new integration test file (3 helper unit tests, 2 cross-process variants). The copied makeDialog omits `canUnban` per wave note.

## Deviations from Plan

None. (Integration test's enumerator stub needed `getDialogEntity`; a test-fixture detail only.)

## Verification

tsc --build clean; addExecutor.test.ts + addResume.integration.test.ts: 72/72 pass.

## Self-Check: PASSED
