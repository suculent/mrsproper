---
phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state
plan: 05
subsystem: renderer-groups
tags: [add-mode, empty-state, i18n, groups-pane]
requires: [16-01, 16-04]
provides: [add-empty-state, banned-no-unban-right-row, job-scoped-add-status]
affects: [GroupsPane, GroupRow]
tech-stack:
  added: []
  patterns: [pure helper module for pane decisions, shared isActionableForMode predicate]
key-files:
  created:
    - src/renderer/groups/addPaneState.ts
    - src/renderer/groups/addPaneState.test.ts
  modified:
    - src/renderer/groups/GroupRow.tsx
    - src/renderer/groups/GroupRow.test.tsx
    - src/renderer/groups/GroupsPane.tsx
    - src/renderer/i18n/locales/en/groups.json
    - src/renderer/i18n/locales/cs/groups.json
decisions:
  - "getAddEmptyState returns 'none' when failedCount > 0 so the checklist/retry banner stays reachable (confirm at UAT)"
  - "isAddStatusInJob treats undefined dialogIds as in-job (back-compat with idle/older state)"
metrics:
  tasks: 2
  completed: 2026-10-04
requirements-completed: [ADD-02, ADD-07]
---

# Phase 16 Plan 05: Add empty state and row rendering Summary

Add mode now shows a cause-aware empty state only when no row is actionable, banned rows without unban right render grey with the correct reason, Tag has its own empty body, and rows outside the job show no queued status.

## Tasks

1. GroupRow: `banned-no-unban-right` grey reason (banned + canAdd + !canUnban); lift-ban note requires `canUnban`. 4 static-render tests. Commit 12a3511.
2. GroupsPane + `addPaneState.ts` (`getAddEmptyState`, `isAddStatusInJob`): Add branch gated away from Remove/Tag "not in any" block; Tag body key `notInAnyBodyTag`; `getAddStatus` returns null for ids not in `add.dialogIds` (D-16); en/cs copy (cs formal vykání). Commit: see git log ("feat(16-05): Add empty state...").

## Verification

Full suite with .env: 52 files / 661 tests passing. tsc --build clean; no emitted artifacts left in src/.

## Deviations from Plan

None - plan executed as written.

## UAT items

- Confirm the `failedCount > 0 -> 'none'` guard in getAddEmptyState (checklist stays visible for retry).
- Review en/cs empty-state wording (D-07).

## Tooling notes

`state.record-metric`, `state.add-decision`, `state.update-progress` skipped per known quirks.

## Known Stubs

None.

## Self-Check: PASSED
