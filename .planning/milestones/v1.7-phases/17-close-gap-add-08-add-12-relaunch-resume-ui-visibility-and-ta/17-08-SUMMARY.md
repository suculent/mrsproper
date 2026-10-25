---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
plan: 08
subsystem: testing
tags: [vitest, ipc, integration-test, add-mode, resume]
requires: ["17-01", "17-02", "17-03", "17-05"]
provides:
  - IPC-level relaunch resume and identity-lock regression test (F1, F2, D-07)
affects: [ADD-08, ADD-12]
key-files:
  created:
    - src/main/telegram/addResume.ipc.integration.test.ts
  modified:
    - src/main/telegram/MembershipScanner.ts
    - .planning/phases/16-close-gap-add-08-resume-path-and-add-02-empty-state/16-VERIFICATION.md
    - .planning/phases/16-close-gap-add-08-resume-path-and-add-02-empty-state/16-VALIDATION.md
    - .planning/phases/17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta/17-VALIDATION.md
decisions:
  - "Test 3 uses an aborted (stopped, non-complete) job as the live job; a completed job intentionally allows a fresh add (checkResumeIdentity returns 'fresh')"
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 17 Plan 08: IPC relaunch-resume test and docs Summary

Six-test integration suite drives the real registerAddChannels, registerTargetChannels and AddExecutor through captured ipcMain handlers, covering F1, F2 and the revised D-07 rule. It also fixes the stale MembershipScanner docblock and updates the Phase 16/17 status docs.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1. IPC integration test | 9d2cba6 | 6 tests: F1 resume + state fields, F1 Stop, F2 live-job mismatch no-op (ADD_START, ADD_RETRY_GROUP), F2 lookup lock + TARGET_RESET release, D-07 narrow fresh start (Test 5, different set), D-07 Resume-of-A rejected (Test 6, exact ids, job file unchanged, no client call) |
| 2. Docblock + docs | 4b681de | Scanner comment now says left === true gives 'banned', otherwise 'member' (comment-only diff); 16-VERIFICATION status passed (16-HUMAN-UAT 3/3); 16-VALIDATION and 17-VALIDATION updated |

## Deviations from Plan

- Test 3: a job that ran to `complete` allows a fresh add for another target by design, so the "live job" is produced by aborting the resumed run to a stopped state. Not a code bug.
- 17-VALIDATION task IDs in the Per-Task map are best-effort mappings of decisions to plans and should be checked against each plan's task numbering. Status flipped to green for all rows because their test files exist and the full suite passes. `nyquist_compliant` left unchanged in both validation files (the full suite has 2 known failures).
- 16-VALIDATION: only the checklist items with clear evidence were ticked; `status` and `nyquist_compliant` were left as is.

## Deferred (optional D-14 items)

- Post-scan refresh excluded from Review.
- Dead DmTextProvider / wizardStage ADD_* consumers cleanup.

## Verification

- `npx vitest run`: 54 files passed, 1 failed (55); 729 tests passed, 2 failed (731). The 2 failures are the known pre-existing src/main/telegram/config.test.ts env-var cases.
- `npx tsc --noEmit -p tsconfig.node.json` and `-p tsconfig.web.json`: clean.
- `git status` shows no stray .js/.d.ts under src/.

## Self-Check: PASSED
