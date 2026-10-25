---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 13
subsystem: ui
tags: [react, electron, app-shell, mode-switch, add-mode]

# Dependency graph
requires:
  - phase: 15-renderer-add-mode-contacts-template-reporting
    provides: "GroupsPane activeMode/onModeChange contract (15-09), ReviewScreen mode/severity/onSeverityChange contract (15-10), TargetCard mode prop (15-11), AddResumeJobDialog + addStore (15-12)"
provides:
  - "AppShell's mode ('remove'|'tag'|'add', session-only) and severity ('kick'|'ban', persisted) as two independent state variables, replacing the conflated three-way action state"
  - "Add run-to-report auto-advance effect gated on mode === 'add', mirroring the existing tag gate"
  - "AddResumeJobDialog mounted independently of removal/tag resume dialogs"
  - "Full wiring of mode/severity through ReviewScreen, GroupsPane, and TargetCard"
  - "Deletion of the deprecated activeAction?/action?/onActionChange? bridge props from GroupsPane and ReviewScreen — no dead props remain"
affects: [16-, future phases touching AppShell wizard state or the Remove/Tag/Add mode switch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Independent session-only UI mode state (never persisted) kept separate from persisted severity state, avoiding a conflated three-way enum"
    - "Per-mode terminal-state auto-advance effect cloned identically for removal/tag/add, each gated on its own mode check to prevent cross-contamination"

key-files:
  created: []
  modified:
    - src/renderer/shell/AppShell.tsx
    - src/renderer/groups/GroupsPane.tsx
    - src/renderer/wizard/ReviewScreen.tsx

key-decisions:
  - "Split AppShell's single action state into mode (session-only) + severity (persisted) exactly per D-02, with handleSeverityChange now unconditionally persisting since severity is always exactly one of two values post-split"
  - "Deleted the deprecated activeAction?, action?, and onActionChange? bridge props immediately after wiring the real values through, per the plan's explicit retirement of the mid-phase compile bridge"

requirements-completed: [ADD-01, ADD-05, ADD-12, ADD-13]

# Metrics
duration: 20min
completed: 2026-10-04
---

# Phase 15 Plan 13: AppShell mode/severity wiring Summary

**Split AppShell's conflated action state into independent mode/severity state, wired Add auto-advance + AddResumeJobDialog, and deleted the deprecated bridge props from GroupsPane/ReviewScreen**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-10-04T01:55:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- AppShell now holds `mode` ('remove'|'tag'|'add', session-only, never persisted, defaults to 'remove') and `severity` ('kick'|'ban', persisted via `severityClient`) as two independent state variables, replacing the old conflated `action` state.
- Added the `useAddStore()` subscription and the add run→report auto-advance effect (gated on `mode === 'add'`), identical in structure to the existing removal and tag auto-advance effects.
- Mounted `AddResumeJobDialog` independently of the removal and tag resume dialogs; its `onResume` sets `mode` to `'add'` and `stage` to `'run'`.
- Wired the real `mode`/`severity`/`onSeverityChange` into `ReviewScreen`, `activeMode`/`onModeChange` into `GroupsPane`, and `mode` into `TargetCard`.
- Deleted the deprecated, unused `activeAction?` field from `GroupsPaneProps` and the deprecated `action?`/`onActionChange?` fields from `ReviewScreenProps` — no dead bridge prop survives the phase.

## Task Commits

Each task was committed atomically:

1. **Task 1: mode/severity split + add auto-advance effect** - `a323726` (feat)
2. **Task 2: wire mode/severity to GroupsPane/ReviewScreen/TargetCard, mount AddResumeJobDialog, delete the deprecated bridge props** - `9232eff` (feat)

_Note: both tasks touch `AppShell.tsx`; the diff was split by hunk so each commit maps exactly to its task's stated scope (state/effects in Task 1, render-body wiring + deprecated-prop deletion in Task 2)._

## Files Created/Modified
- `src/renderer/shell/AppShell.tsx` - mode/severity state split, add store subscription + auto-advance effect, AddResumeJobDialog mount, all consumer mounts updated
- `src/renderer/groups/GroupsPane.tsx` - deleted deprecated `activeAction?` field from `GroupsPaneProps`
- `src/renderer/wizard/ReviewScreen.tsx` - deleted deprecated `action?`/`onActionChange?` fields from `ReviewScreenProps`

## Decisions Made
- Followed the plan's interfaces section exactly: `mode`/`severity` as two `useState` calls, `handleSeverityChange` unconditionally persisting, the add effect/dialog cloned structurally from the tag equivalent.
- No `onModeChange` handler passed to `ReviewScreen` — per plan, the mode picker lives exclusively in `GroupsPane`'s `ModeSwitch`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AppShell's wizard state is now fully split and every Wave 2-4 contract (GroupsPane, ReviewScreen, TargetCard, AddResumeJobDialog, addStore) is wired through with zero dead bridge props remaining in the renderer.
- Full suite green (44 files / 585 tests), `npx tsc --build` exits 0, `npm run build` succeeds — this is the final wiring plan of Phase 15.

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*
