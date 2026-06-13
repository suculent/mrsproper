---
phase: 04-group-enumeration-membership-rights
plan: "09"
subsystem: renderer-app-shell
tags:
  - renderer
  - app-shell
  - two-pane-layout
  - country-picker
  - cmdk-fix
  - group-enumeration
dependency_graph:
  requires:
    - "04-08-SUMMARY.md (GroupsPane.tsx — browse + checklist modes)"
    - "04-06-SUMMARY.md (useGroupsStore, groupsActions)"
    - "03-SUMMARY.md (TargetInput, TargetCard — Phase 3)"
  provides:
    - "src/renderer/shell/AppShell.tsx (two-pane authenticated shell layout per D-09/D-10/D-11/D-12)"
    - "src/renderer/auth/CountryPicker.tsx (CZ default + cmdk double-filter fix)"
  affects:
    - "All Phase 4 components now integrated in the running app via AppShell"
tech_stack:
  added: []
  patterns:
    - "Two-pane layout: flex-[1] left / flex-[2] right with overflow-hidden main and per-pane overflow control"
    - "shouldFilter={false} on cmdk Command root to disable internal filtering when manual filtering is applied"
key_files:
  created: []
  modified:
    - src/renderer/shell/AppShell.tsx
    - src/renderer/auth/CountryPicker.tsx
  deleted:
    - src/renderer/shell/StubbedWorkflowRegions.tsx
decisions:
  - "Two-pane proportions: flex-[1] left (1/3) + flex-[2] right (2/3) per D-09 layout contract"
  - "GroupsPane imported as named export (not default) — both are available; named preferred for clarity"
  - "StubbedWorkflowRegions deleted after confirming only AppShell imported it (TargetCard had a comment reference only)"
  - "shouldFilter={false} on Command root disables cmdk internal filtering; manual filter in useMemo still applies — no bypass of country validation"
metrics:
  duration_minutes: 5
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_modified: 2
---

# Phase 4 Plan 9: AppShell Two-Pane Layout + CountryPicker Fixes Summary

AppShell restructured to a two-pane horizontal split (left 1/3 TargetInput+TargetCard, right 2/3 GroupsPane), StubbedWorkflowRegions deleted, and two folded CountryPicker todos applied (CZ default + cmdk shouldFilter fix).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Restructure AppShell.tsx to two-pane layout, delete StubbedWorkflowRegions | eecfe0b | src/renderer/shell/AppShell.tsx (modified), src/renderer/shell/StubbedWorkflowRegions.tsx (deleted) |
| 2 | Apply CountryPicker folded todos (CZ default + cmdk fix) | be492cc | src/renderer/auth/CountryPicker.tsx |

## What Was Built

**AppShell.tsx** (modified):

- Removed `StubbedWorkflowRegions` import and usage
- Added imports for `TargetInput`, `TargetCard`, `GroupsPane`
- Replaced single-column `<main className="flex-1 overflow-auto">` stub with two-pane layout
- Left pane: `flex flex-col flex-[1] min-w-0 border-r border-border overflow-y-auto p-4` containing `<TargetInput />` + `<div className="mt-4"><TargetCard /></div>`
- Right pane: `flex flex-col flex-[2] min-w-0 overflow-hidden` containing `<GroupsPane />`
- Header (IdentityDisplay + SettingsMenu) and outer wrapper unchanged — login screen (auth flow) is unaffected

**StubbedWorkflowRegions.tsx** (deleted):
- Confirmed only AppShell imported it before deletion
- TargetCard.tsx had a comment reference only, not a code import

**CountryPicker.tsx** (modified):
- `DEFAULT_COUNTRY`: changed from `'US'` to `'CZ'` (Czech Republic, +420) — phone login pre-selects +420
- `<Command shouldFilter={false}>`: disables cmdk's internal string filter so rows managed by the manual `useMemo` filter are directly clickable without double-filtering

## Verification Results

```
grep "StubbedWorkflowRegions" src/renderer/shell/AppShell.tsx → EMPTY (good)
grep "flex-[1]|flex-[2]" src/renderer/shell/AppShell.tsx → both present
grep "GroupsPane|TargetInput|TargetCard" src/renderer/shell/AppShell.tsx → all three present
grep -r "StubbedWorkflowRegions" src/ → no imports (TargetCard comment only)
grep "DEFAULT_COUNTRY|CZ" src/renderer/auth/CountryPicker.tsx → CZ present
grep "shouldFilter" src/renderer/auth/CountryPicker.tsx → present
npx tsc --noEmit → 0 errors (clean)
npm test → 2 failed | 150 passed (same pre-existing AUTH-03 baseline)
```

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. AppShell now renders all real components — TargetInput, TargetCard, and GroupsPane are all wired to live stores and IPC.

## Threat Flags

None. Per threat model:
- T-04-15: Layout change is pure renderer CSS/component wiring; no new trust boundaries — accepted.
- T-04-16: shouldFilter={false} disables cmdk internal string match only; manual useMemo filter still applies — no bypass of phone number validation — accepted.

## Self-Check: PASSED

Files modified/deleted:
- FOUND: src/renderer/shell/AppShell.tsx (modified, two-pane layout)
- CONFIRMED DELETED: src/renderer/shell/StubbedWorkflowRegions.tsx
- FOUND: src/renderer/auth/CountryPicker.tsx (CZ + shouldFilter)

Commits verified:
- FOUND: eecfe0b (Task 1 — AppShell two-pane + StubbedWorkflowRegions deletion)
- FOUND: be492cc (Task 2 — CountryPicker CZ default + cmdk fix)
