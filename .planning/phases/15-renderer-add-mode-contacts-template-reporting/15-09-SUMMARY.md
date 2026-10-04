---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 09
subsystem: ui
tags: [react, groups-pane, mode-switch, add-mode, i18next]

# Dependency graph
requires:
  - phase: 15-renderer-add-mode-contacts-template-reporting (Plan 03)
    provides: "isActionableForMode(dialog, status, mode) and groupsActions.recomputeCheckedForMode(mode)"
  - phase: 15-renderer-add-mode-contacts-template-reporting (Plan 04)
    provides: "groups:modeSwitch.*/modeSwitchAria/modeSwitchDisabledTooltip + add namespace (progressLabel/peerFloodBanner/summaryPart.*/dmStatus*/exportLogButton/exportLogNoLogYet/runTriggerLabel/runTriggerAria)"
  - phase: 15-renderer-add-mode-contacts-template-reporting (Plan 07)
    provides: "useAddStore()/addActions (startAdd/abortAdd/retryGroup/resumeJobFromDisk) + addClient.exportAddLog()"
  - phase: 15-renderer-add-mode-contacts-template-reporting (Plan 08)
    provides: "GroupRow's addStatus/addErrorCode/addLink/premiumWouldAllow/onRetryAdd rendering contract"
provides:
  - "src/renderer/groups/ModeSwitch.tsx — the Remove/Tag/Add 3-segment radiogroup (D-01), always recomputing the checklist selection before notifying its parent"
  - "GroupsPane.tsx's checklist partition, isRunActive, run-trigger button, and GroupRow call site driven entirely by isActionableForMode + the derived activeMode/handleModeChange locals"
  - "GroupsPane.tsx's Add-mode run/report slot — progress bar, PEER_FLOOD banner, complete/stopped summary band with the D-19 DM status line and the D-20 Export add log button"
affects: [15-10 (ReviewScreen/DmTemplateEditor consume mode read-only), 15-13 (AppShell wires activeMode/onModeChange for real and deletes the deprecated activeAction prop)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GroupsPaneProps carries both the deprecated unused activeAction prop and the new optional activeMode/onModeChange props simultaneously, bridged via derived locals (activeMode = props.activeMode ?? 'remove'), so a consuming component can upgrade one plan ahead of its call site"
    - "Add-mode progress/PEER_FLOOD/summary block is a structural clone of the shipped Tag block, placed in the same position (before the Removal branches) inside renderProgressSlot()"

key-files:
  created:
    - src/renderer/groups/ModeSwitch.tsx
  modified:
    - src/renderer/groups/GroupsPane.tsx

key-decisions:
  - "isRunActive's three per-mode step checks (removal/tag/add running-or-stopping) are now unconditional ORs rather than gated by the active mode, since the ModeSwitch's own disabled condition already prevents switching away from an active run — simpler and symmetric across all three modes with no behavior change"
  - "rowRemovalStatus/removalNote/errorCode are now gated on activeMode === 'remove' (previously activeAction !== 'tag', which implicitly meant 'not tag' since Add mode didn't exist yet) — correct generalization to the three-way mode, not a behavior change for the two modes that existed before"
  - "Export add log's transient 'No add log yet' message auto-clears after 4s via a local GroupsPane-level useState + setTimeout, placed in the summary band next to the button, per D-20's inline-non-modal feedback convention"

patterns-established: []

requirements-completed: [ADD-01, ADD-13, ADD-14]

# Metrics
duration: 15min
completed: 2026-10-04
---

# Phase 15 Plan 09: GroupsPane Add-Mode Wiring — ModeSwitch, Partition, Run/Report Summary

**New `ModeSwitch.tsx` (Remove/Tag/Add radiogroup) mounted in `GroupsPane`'s toolbar, the checklist partition/pre-check and `GroupRow` call site re-keyed from the legacy `activeAction` prop to the new optional `activeMode`/`isActionableForMode`, and a full Add-mode run/report slot (progress, PEER_FLOOD, DM status line, Export add log button) cloned from the shipped Tag pattern.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `ModeSwitch.tsx` gives D-01's three-way mode switch a home: a `role="radiogroup"` button row identical in markup to `ReviewScreen.tsx`'s existing severity picker, which synchronously calls `groupsActions.recomputeCheckedForMode(next)` before bubbling `onChange` (D-03), and is disabled with a tooltip during any active scan/run/the run+report stages.
- `GroupsPane.tsx`'s checklist partition loop now calls the single shared `isActionableForMode` predicate for all three modes instead of a hard-coded Remove-only rule — Add mode's inverted checklist (D-05) now renders correctly, and Remove/Tag behavior is provably unchanged since the predicate returns identical booleans for those two modes.
- `GroupsPaneProps` gained optional `activeMode`/`onModeChange` (default `'remove'`) while the legacy `activeAction` prop stays declared-but-unread, so `AppShell.tsx`'s current call site (`activeAction={action}`) keeps type-checking unmodified until Plan 15-13.
- `renderProgressSlot()` gained a full Add-mode branch — running/stopping progress bar with Stop/Stopping and the flood-wait subline, the PEER_FLOOD banner with "Resume adding", and a complete/stopped summary band carrying the D-19 DM status line (`dmStatusSent`/`dmStatusRefused`, no line for `not-needed`) and the D-20 "Export add log…" button wired to `addClient.exportAddLog()`.
- The run-trigger button's label/aria and visibility gate are now a three-way Remove/Tag/Add check, requiring `add.step === 'idle'` alongside the existing removal/tag idle checks.

## Task Commits

Each task was committed atomically:

1. **Task 1: ModeSwitch.tsx** - `a32cc71` (feat)
2. **Task 2: GroupsPane.tsx — mount ModeSwitch, mode-aware partition, prop rename** - `7edc500` (feat)
3. **Task 3: GroupsPane.tsx — add progress/PEER_FLOOD/summary slot + run-trigger + export button** - `aad52da` (feat)

_No TDD tasks in this plan — all three are `type="auto"` composition/wiring tasks over already-tested pure helpers and stores from Plans 03/04/07/08._

## Files Created/Modified
- `src/renderer/groups/ModeSwitch.tsx` - New: the Remove/Tag/Add 3-segment `role="radiogroup"` control, calling `groupsActions.recomputeCheckedForMode` on every selection
- `src/renderer/groups/GroupsPane.tsx` - `activeMode`/`onModeChange` optional props + deprecated unused `activeAction`; checklist partition via `isActionableForMode`; `useAddStore()`/`addActions` wired in; new `getAddStatus()` helper; `ModeSwitch` mounted in the toolbar; Add-mode progress/PEER_FLOOD/summary block in `renderProgressSlot()`; run-trigger button and `GroupRow` call site extended to the three-way mode

## Decisions Made
- Simplified `isRunActive` to unconditional `removal/tag/add` running-or-stopping ORs (previously the tag check was gated behind `activeAction === 'tag'`) — the three run states are already mutually exclusive by construction (the `ModeSwitch` disables switching away from an active mode), so this is a simplification, not a behavior change.
- Placed the new Add block directly after the Tag block inside `renderProgressSlot()` (both before the Removal branches), matching the plan's "same position as the existing Tag block" instruction literally.
- The transient "No add log yet" message is rendered as a line in the summary band (local `useState` cleared after 4s) rather than swapping the button's own label, since the button sits in a `flex` row alongside "Add someone else" and a dedicated message line reads more clearly in that layout — still inline, still non-modal, consistent with D-20.

## Deviations from Plan

None — plan executed exactly as written. One self-correction during execution: an initial draft imported `useTranslation('add')` in Task 2 (needed only by Task 3's `tAdd` usages), which made Task 2 fail to compile standalone (`tAdd` declared-but-unread, `noUnusedLocals`). Moved the import to Task 3 so each task's commit compiles independently — no behavior change, caught before either commit.

## Issues Encountered

`npx tsc --build` emitted stray `.d.ts` build artifacts beside `ModeSwitch.tsx`/`GroupsPane.tsx` on each verification run (per the project's documented tsc-no-op pitfall); deleted after each pass, no code change needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `GroupsPane.tsx` fully supports Add mode end-to-end for the groups pane half of the feature: mode switch, inverted partition/pre-check, live progress, PEER_FLOOD hard-stop, and the report band with DM status + export button.
- `AppShell.tsx` remains unmodified, confirmed by `git status` and a clean `tsc --build` — Plan 15-13 can now wire `activeMode`/`onModeChange` for real and delete the deprecated `activeAction` prop with no GroupsPane-side changes required.
- Full verification: `npx tsc --build` exits 0; `npx vitest run` (with `.env` injected) — 44 files / 585 tests green, matching the Plan 15-07 baseline exactly (no new tests added by this pure-wiring plan); `npm run build` succeeds.
- No blockers for Plan 15-10 (ReviewScreen/DmTemplateEditor) or Plan 15-13 (AppShell wiring).

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*
