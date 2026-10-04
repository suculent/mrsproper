---
phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state
plan: 03
subsystem: renderer-add-resume
tags: [resume, add-mode, renderer, tests]
requires: [16-01]
provides:
  - addActions.startAdd returns Promise<boolean> (run started)
  - getResumeDialogState helper (groups-loaded gate)
affects: [16-05]
key-files:
  created:
    - src/renderer/removal/resumeDialogState.ts
    - src/renderer/removal/resumeDialogState.test.ts
  modified:
    - src/renderer/store/addStore.ts
    - src/renderer/store/addStore.test.ts
    - src/renderer/removal/AddResumeJobDialog.tsx
    - src/renderer/shell/AppShell.tsx
    - src/renderer/i18n/locales/en/add.json
    - src/renderer/i18n/locales/cs/add.json
key-decisions:
  - "Resume sends full job.dialogIds; skipped outcomes count as unprocessed (D-01, D-02)"
  - "pendingJob kept while startAdd returns idle; dialog closes only once a run started (D-04)"
requirements-completed: [ADD-08]
duration: 8min
completed: 2026-10-04
---

# Phase 16 Plan 03: Renderer ADD-08 resume path Summary

Renderer resume now sends the full job dialog set, treats skipped groups as resumable, gates the Resume button on groups being loaded, and keeps the dialog until a run actually starts.

## Tasks

1. addStore full-set resume, skipped handling, pendingJob retention: commit e522f9a
2. Dialog loading gate, AppShell wiring, i18n, helper + test: see git log (feat(16-03) second commit)

## Deviations from Plan

None. Payload to ADD_START remains dialogIds only; addChannels.ts untouched.

## Verification

tsc --build clean; full suite 51 files / 640 tests passing. Manual UAT (relaunch, Resume) remains per 16-VALIDATION.

## Tooling notes

state.record-metric / add-decision / update-progress may no-op in this environment.

## Self-Check: PASSED
