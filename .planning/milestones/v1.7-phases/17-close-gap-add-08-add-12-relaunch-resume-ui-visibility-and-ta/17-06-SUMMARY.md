---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
plan: 06
subsystem: renderer
tags: [add-mode, resume, retry-dm, ui]
requires: [17-02, 17-04, 17-05]
provides:
  - Stopped-band "Resume adding" button (in-session Resume after Stop)
  - resumeFailedBand feedback on stopped band and PEER_FLOOD banner
  - GroupRow retry-DM status line and checkbox-free jobView
affects: []
key-files:
  modified:
    - src/renderer/groups/GroupRow.tsx
    - src/renderer/groups/GroupRow.test.tsx
    - src/renderer/groups/GroupsPane.tsx
    - src/renderer/groups/GroupsPane.job.test.tsx
decisions:
  - "Resumable = add.dialogIds non-empty and not isJobFinished(dialogIds, outcomes); never for complete"
  - "GroupRow jobView prop hides the checkbox slot for queued/idle rows (D-03); passed as isJob from GroupsPane"
  - "Resume state (idle/inflight/failed) shared by stopped band and PEER_FLOOD button; success is the boolean from resumeJobFromDisk"
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 17 Plan 06: Stopped-band Resume and retry DM line Summary

A user Stop is now resumable in-session via a "Resume adding" button on the stopped band, with inflight/disabled/failed feedback, and retry-DM sent/refused results render on privacy-blocked rows named from add.targetName.

## Commits
- d5276af: GroupRow retry DM line, jobView prop
- e166f25: GroupsPane stopped-band Resume, PEER_FLOOD failure line, row wiring

## Deviations from Plan
Orchestrator additions applied: `jobView` prop on GroupRow removes the checkbox on job-view rows (static-render assertions added in both test files); resume failure uses the Promise<boolean> from Plan 05. No other deviations.

## Known Stubs
None.

## Self-Check: PASSED
vitest src/renderer (241) and node/web typechecks pass; no stray .js/.d.ts in src.
