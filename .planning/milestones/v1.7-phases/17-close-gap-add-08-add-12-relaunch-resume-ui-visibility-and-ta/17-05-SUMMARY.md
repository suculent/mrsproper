---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
plan: 05
subsystem: renderer
tags: [add-mode, relaunch-resume, ui]
requires: [17-04]
provides:
  - addActions.resumeJobFromDisk returns boolean (true only if run actually started)
  - AppShell forces Add mode, locks TargetInput, hides CandidateList, shows JobTargetCard
  - GroupsPane job view (getPaneView/getJobRows), add.targetName labels, no-groups state
affects: [17-06]
key-files:
  modified:
    - src/renderer/store/addStore.ts
    - src/renderer/store/addStore.test.ts
    - src/renderer/shell/AppShell.tsx
    - src/renderer/groups/GroupsPane.tsx
  created:
    - src/renderer/groups/GroupsPane.job.test.tsx
decisions:
  - "resumeJobFromDisk success = startAdd non-idle AND step is running/stopping or differs from pre-call step (unchanged stopped state after main rejection counts as failure)"
  - "GroupsPane derives activeMode = 'add' whenever add.step !== 'idle' so the band renders on first render"
metrics:
  tasks: 3
  completed: 2026-10-24
---

# Phase 17 Plan 05: Compose job view and identity lock Summary

After a relaunch Resume, the groups pane shows the Add progress/Stop/PEER_FLOOD/summary band named from add.targetName, only the job's rows in job order, with ModeSwitch, TargetInput, CandidateList and refresh locked.

## Commits
- store: resumeJobFromDisk -> Promise<boolean>, always re-reads job (D-11)
- AppShell: force add mode effect, locked TargetInput, JobTargetCard vs TargetCard
- GroupsPane: view = getPaneView; scan effects key on view; job rows; D-14 noGroups

## Deviations from Plan
None beyond the orchestrator-requested stricter success check. Job rows still show GroupRow's disabled queued checkbox as a status indicator (not selection); toggle is a no-op and isChecked false. Sort toggle is hidden in job view. Scan-effect non-firing is verified via getPaneView tests and render (effects do not run in static render).

## Known Stubs
None. Resume button on stopped band and resumeFailedBand wiring remain for Plan 06.

## Self-Check: PASSED
vitest src/renderer (234) and node/web typechecks pass; no stray .js/.d.ts in src.
