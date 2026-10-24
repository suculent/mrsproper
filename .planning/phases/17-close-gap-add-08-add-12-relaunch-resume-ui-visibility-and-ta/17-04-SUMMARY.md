---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
plan: 04
subsystem: renderer
tags: [add-mode, relaunch-resume, i18n, ui]
requires: []
provides:
  - getPaneView / getJobRows / 'no-groups' empty state helpers
  - JobTargetCard and shared avatarFallback helpers
  - ModeSwitch lockedByAddJob prop, TargetInput locked prop
  - en/cs strings from 17-UI-SPEC (incl. resumeFailedBand)
affects: [17-05, 17-06]
key-files:
  created:
    - src/renderer/target/avatarFallback.ts
    - src/renderer/target/JobTargetCard.tsx
    - src/renderer/target/JobTargetCard.test.tsx
  modified:
    - src/renderer/groups/addPaneState.ts
    - src/renderer/groups/ModeSwitch.tsx
    - src/renderer/target/TargetCard.tsx
    - src/renderer/target/TargetInput.tsx
    - src/renderer/i18n/locales/{en,cs}/{add,groups,target}.json
decisions:
  - "TargetInput lock folded into handleSubmit and onChange guards (no separate paste/Enter handlers exist; Enter submits the form)"
metrics:
  tasks: 2
  completed: 2026-10-24
---

# Phase 17 Plan 04: Renderer leaf pieces for job view and identity lock Summary

Pure view helpers, a read-only JobTargetCard, locked ModeSwitch/TargetInput and all new en/cs copy, ready for Plans 05/06 to compose.

## Commits
- 3220bc5: helpers, avatarFallback extraction, JobTargetCard (+tests)
- d2d649e: locked ModeSwitch/TargetInput, en/cs strings (+tests)

## Deviations from Plan
- Task 1 commit alone left web typecheck failing (JobTargetCard uses i18n keys added in Task 2); resolved by the Task 2 commit. No other deviations.
- TargetInput has no dedicated Enter/paste handlers; the lock guards handleSubmit (Enter and button) and handleInputChange (typing/paste).

## Known Stubs
None. Components are not yet wired into GroupsPane/AppShell (Plans 05/06). GroupsPane does not yet handle the new 'no-groups' AddEmptyState value.

## Self-Check: PASSED
Both commits exist; vitest src/renderer (225) and node/web typechecks pass; no stray .js/.d.ts in src.
