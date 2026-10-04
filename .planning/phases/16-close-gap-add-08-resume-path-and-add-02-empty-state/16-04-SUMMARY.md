---
phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state
plan: 04
subsystem: groups / add-mode actionability
tags: [canUnban, add-mode, modeRules, GroupEnumerator]
requires: [16-01]
provides: [AdminDialogDTO.canUnban, add predicate with canUnban]
affects: [16-05]
key-files:
  modified:
    - src/shared/groupTypes.ts
    - src/main/telegram/GroupEnumerator.ts
    - src/renderer/groups/modeRules.ts
    - src/renderer/wizard/addValidation.ts
    - 15 test fixture files (incl. addResume.integration.test.ts)
decisions:
  - "canUnban computed in main as creator || banUsers; basic groups false; broadcast independent of canAct"
  - "computeAddGroups treats an absent membership entry as not-member (preserves prior semantics) while banned rows require canUnban"
metrics:
  completed: 2026-10-04
---

# Phase 16 Plan 04: canUnban Summary

Main-computed `canUnban` DTO boolean (creator || banUsers; false for basic groups; independent of canAct for broadcast channels) now drives the Add predicate, so banned rows without the unban right are greyed up front and filtered from the review list.

## Tasks
1. DTO + GroupEnumerator `_computeCanUnban` + all fixtures + 4 enumerator tests — 27d23af
2. `isActionableForMode('add')` = canAdd && (not-member || banned && canUnban); `computeAddGroups` uses the shared predicate; new modeRules/addValidation tests — 9763b0f

groupsStore already used `isActionableForMode` at both call sites (verified, no change).

## Deviations from Plan
- [Rule 1 - Bug] `computeAddGroups` passes `membershipByDialogId.get(id) ?? 'not-member'` rather than `?? null`: with null the predicate (intentionally false for pending in Add mode) broke 7 existing tests where the map is empty; an absent entry means not banned, so this keeps prior behavior while still excluding banned-without-canUnban.
- Fixture grep found no unlisted files.

## Verification
Full suite with .env sourced: 51 files / 649 tests passing; `tsc --build` clean; no emitted artifacts left in src/.

## Notes
`state.record-metric`, `state.add-decision`, `state.update-progress` may no-op per known tooling quirks.

## Self-Check: PASSED
