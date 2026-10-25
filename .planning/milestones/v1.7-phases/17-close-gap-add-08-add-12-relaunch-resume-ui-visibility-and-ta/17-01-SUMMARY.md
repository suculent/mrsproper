---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
plan: 01
subsystem: ipc
tags: [electron, ipc, add-executor, guard]
requires: []
provides:
  - Main-process lookup lock on TARGET_RESOLVE, TARGET_CONFIRM, TARGET_RESOLVE_CANDIDATE while AddExecutor step != idle
affects: [17-04, 17-05]
key-files:
  modified:
    - src/main/ipc/targetChannels.ts
    - src/main/ipc/targetChannels.test.ts
    - src/main/ipc/searchChannels.ts
    - src/main/ipc/searchChannels.test.ts
    - src/main/index.ts
decisions:
  - "Lock enforced in main (authority); TARGET_RESET untouched as the only exit"
  - "searchChannels gets a lazy getAddStep getter because AddExecutor is constructed after search wiring"
metrics:
  tasks: 2
  files: 5
completed: 2026-10-24
---

# Phase 17 Plan 01: Add-job lookup lock Summary

Main-process guards make target resolve, confirm and name-search candidate resolution no-ops (returning resolver.getState()) while an add job is non-idle, with Zod validation still first and TARGET_RESET unchanged.

## Commits
- 7872b13: guards plus tests in targetChannels and searchChannels
- 2e40431: wire lazy getter in main/index.ts

## Deviations from Plan
None - plan executed as written.

## Verification
vitest src/main/ipc (129 passed); both tsc --noEmit projects clean; no stray .js/.d.ts in src.

## Self-Check: PASSED
