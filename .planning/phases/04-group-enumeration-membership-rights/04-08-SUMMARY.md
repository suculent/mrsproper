---
phase: 04-group-enumeration-membership-rights
plan: "08"
subsystem: renderer-groups-pane
tags:
  - renderer
  - groups-pane
  - browse-mode
  - checklist-mode
  - scan-progress
  - i18n-hygiene
  - group-enumeration
  - membership-scan
dependency_graph:
  requires:
    - "04-02-SUMMARY.md (groupTypes.ts — AdminDialogDTO, MembershipStatus, GroupsState, ScanState)"
    - "04-06-SUMMARY.md (useGroupsStore, groupsActions, ScrollArea)"
    - "04-07-SUMMARY.md (GroupRow, groupsCopy — SCAN_COPY, EMPTY_STATE_COPY, GROUP_ERROR_COPY)"
  provides:
    - "src/renderer/groups/GroupsPane.tsx (browse + checklist modes groups display)"
  affects:
    - "04-09-PLAN.md (AppShell.tsx — imports GroupsPane for right pane)"
tech_stack:
  added: []
  patterns:
    - "useEffect for auto-start scan on target confirm (mode==='checklist' && scan.step==='idle')"
    - "useEffect for abort-on-mode-change (mode==='browse' && scan.step==='scanning')"
    - "Partition + sort pattern: actionable dialogs first, non-actionable below, each sorted independently"
    - "Derived empty state function returning JSX | null based on mode + store step"
key_files:
  created:
    - src/renderer/groups/GroupsPane.tsx
  modified: []
decisions:
  - "Auto-start scan: useEffect triggers groupsActions.startScan() when mode=checklist AND scan.step=idle — mirrors D-13/D-15 (no caching, re-runs on every confirm)"
  - "Abort-on-browse: useEffect aborts in-progress scan when mode switches back to browse — prevents stale scan results on target change"
  - "Checklist row partitioning: actionable = canAct=true AND (status=member OR status=null/pending); non-actionable = canAct=false OR status=not-member OR status=failed"
  - "Scan progress omitted from checklist mode toolbar flex when scan.step=scanning — progress indicator is always-visible shrink-0 div above ScrollArea"
metrics:
  duration_minutes: 8
  completed_date: "2026-06-12"
  tasks_completed: 1
  files_modified: 1
---

# Phase 4 Plan 8: GroupsPane.tsx — Browse and Checklist Modes Summary

GroupsPane.tsx implemented with full browse mode (filter input + sort toggle + refresh) and checklist mode (scan auto-start + progress indicator + D-01 row ordering), consuming useGroupsStore + useTargetStore with all empty/error states and accessibility attributes per UI-SPEC.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement GroupsPane.tsx with browse and checklist modes | 8a368e7 | src/renderer/groups/GroupsPane.tsx |

## What Was Built

**GroupsPane.tsx** (new file, 293 lines):

- `mode` derived from `targetState.target.step === 'confirmed' ? 'checklist' : 'browse'`
- Local state: `sort: 'az' | 'size'` and `filter: string` for browse-mode controls
- Store consumption: `useGroupsStore()` → `{ groups, scan, checkedDialogIds }` and `useTargetStore()` → `targetState`
- `getMembershipStatus(dialogId)` helper: returns `MembershipStatus | null` from `scan.results` when scan is scanning or complete
- `sortDialogs(dialogs, sort)` helper: sorts by `title.localeCompare` (az) or descending `memberCount` (size)

**Browse mode:**
- Renders filter `<Input placeholder="Filter groups" />` with `<Search>` icon in toolbar
- Filters `groups.dialogs` by `title.toLowerCase().includes(filter.toLowerCase())`
- Applies `sortDialogs` to the filtered list

**Checklist mode:**
- Partitions all dialogs into `actionable` (canAct=true AND status=member|null) and `nonActionable` (everything else)
- Concatenates `sortDialogs(actionable)` + `sortDialogs(nonActionable)` — D-01 ordering
- `useEffect`: auto-starts scan when `mode === 'checklist' && scan.step === 'idle'` — D-13/D-15
- `useEffect`: aborts scan when `mode === 'browse' && scan.step === 'scanning'` — D-13

**Toolbar (sticky above ScrollArea):**
- Browse mode only: filter Input with Search icon, flex-1
- Both modes: sort toggle Button with `aria-pressed={sort==='size'}`, label toggles 'A–Z' / 'By size'
- Both modes: refresh Button with `aria-label="Refresh group list"` and `title="Re-fetch your group list from Telegram"` — D-14

**Scan progress (checklist mode, scan.step=scanning):**
- `<div role="status" aria-live="polite">` wrapper — D-05 accessibility
- "Scanning your groups…" label (`SCAN_COPY.scanning`) + "checked N / M" counter
- Thin `h-1 bg-muted` progress bar with `bg-primary` fill at `(checked/total)*100%` width

**Failed summary (checklist mode, scan.step=complete, failedCount>0):**
- `SCAN_COPY.failedN(failedCount)` rendered as `text-label text-muted-foreground`

**Group list:**
- `<ScrollArea className="flex-1">` wrapping `<div className="divide-y divide-border">`
- Maps `displayedDialogs` → `<GroupRow>` with `dialog`, `membershipStatus`, `isChecked`, `onToggle`, `onRetry`

**Empty states (all 5 per UI-SPEC):**
- Browse loading: 3× `h-14 animate-pulse bg-muted rounded` skeleton rows
- Browse error: `GROUP_ERROR_COPY[groups.code]`
- Browse loaded + filter non-empty + 0 results: `EMPTY_STATE_COPY.noMatches.heading + body`
- Browse loaded + 0 total dialogs: `EMPTY_STATE_COPY.noGroups.heading + body`
- Checklist scan complete + 0 member rows: `EMPTY_STATE_COPY.notInAny(targetName).heading + body`

## Verification Results

```
npx tsc --noEmit → 0 errors (clean)
grep "useTargetStore|useGroupsStore|groupsActions" → all three present
grep "SCAN_COPY|EMPTY_STATE_COPY|GROUP_ERROR_COPY" → all three present
grep "aria-live|role=\"status\"" → present on scan progress div
grep "useEffect" with startScan + idle check → present at line 72-75
npm test → 2 failed | 150 passed — same pre-existing AUTH-03 baseline as Plans 06 and 07
```

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. GroupsPane renders all modes with real store data — browse filter, sort, scan progress, row partitioning, and all empty/error states are fully wired.

## Threat Flags

None. Per threat model:
- T-04-13: `groupsActions.retryScanGroup(dialogId)` call — dialogId originates from `AdminDialogDTO.id` which came from main's GroupEnumerator; IPC handler validates server-side — accepted.
- T-04-14: scan auto-start useEffect — `scan:start` IPC handler delegates to `MembershipScanner.scan()` which uses generation token; rapid target changes cannot stack concurrent scans — accepted.

## Self-Check: PASSED

Files created:
- FOUND: src/renderer/groups/GroupsPane.tsx

Commits verified:
- FOUND: 8a368e7 (Task 1 — GroupsPane.tsx)
