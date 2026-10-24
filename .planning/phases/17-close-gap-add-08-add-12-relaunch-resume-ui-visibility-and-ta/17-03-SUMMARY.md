---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
plan: 03
subsystem: add-executor
tags: [electron, add-executor, dm, add-log]
requires: [17-02]
provides:
  - AddExecutor._sendDm shared DM helper
  - Privacy-blocked retry tail (log block + one-link DM, retryDmStatus)
affects: [17-06]
key-files:
  modified:
    - src/main/telegram/AddExecutor.ts
    - src/main/telegram/addExecutor.test.ts
decisions:
  - "Link outcome is checkpointed and emitted before the DM; hard-stop writes the log block (refused) then _hardStopRetry"
  - "Generation re-checked after the DM await before any state write"
  - "Job-level dmStatus is replaced by the retry DM result only when it was 'not-needed'"
metrics:
  tasks: 2
  files: 2
completed: 2026-10-24
---

# Phase 17 Plan 03: Retry log and DM Summary

A retry that ends privacy-blocked now persists its new link, DMs it to the job target with the saved or default template, appends a follow-up add-log block, and records retryDmStatus on the row. The DM code is one shared `_sendDm` used by both the end-of-run and retry paths.

## Commits
- 78cbd5e: extract end-of-run DM block into `_sendDm` (no behavior change, existing tests unchanged)
- feat commit (HEAD after 78cbd5e): retry tail with log block, DM, hard-stop handling, 6 new tests

## Deviations from Plan
None. The test audit-store fake's `setStatus` was extended to record `dmStatus` (test-only).

## Deferred Issues
- src/main/telegram/config.test.ts (2 tests) fails without MRSPROPER_API_ID/HASH env; pre-existing.

## Verification
vitest src/main/telegram: 289 pass, only the 2 pre-existing config failures. Both tsc projects clean. No stray .js/.d.ts under src/.

## Self-Check: PASSED
