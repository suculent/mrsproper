---
phase: 12-renderer-action-picker-tag-input-results
plan: "04"
subsystem: renderer-tag-ui
tags:
  - GroupRow
  - GroupsPane
  - AppShell
  - tag-progress
  - tag-results
  - tag-routing
dependency_graph:
  requires:
    - 12-02  # tagStore + tagActions
    - 12-03  # ReviewScreen 3-way + TagResumeJobDialog
  provides:
    - tag-run-ui  # live tag progress rendered in GroupsPane
    - tag-results-ui  # per-group tag outcomes in GroupRow
    - tag-routing  # AppShell routes run/report by active action
  affects:
    - GroupRow.tsx
    - GroupsPane.tsx
    - AppShell.tsx
tech_stack:
  added: []
  patterns:
    - parallel-branch-guard  # tagStatus never overlaps removalStatus
    - derived-reactive-state  # tagResumeOpen from store, not useState
    - gated-useEffect  # action === 'tag' prevents cross-contamination
    - getTagStatus-helper  # mirrors getRemovalStatus pattern
key_files:
  created: []
  modified:
    - src/renderer/groups/GroupRow.tsx
    - src/renderer/groups/GroupsPane.tsx
    - src/renderer/shell/AppShell.tsx
decisions:
  - "isRemovalActive widened to include tagStatus != null — single guard covers both run types"
  - "tagResumeOpen derived reactively from pendingTagJob !== null (not useState) — Pitfall 1 guard"
  - "tag auto-advance useEffect gated on action === 'tag' — Pitfall 3 guard prevents cross-contamination"
  - "GroupsPane destructures props for cleaner call sites; stage prop left in interface (unused but part of contract)"
  - "tT template literal errors resolved with explicit ternary calls instead of variable keys"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-20T17:17:00Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 12 Plan 04: GroupRow + GroupsPane Tag UI + AppShell Tag Routing Summary

One-liner: Tag run/report/resume UI end-to-end wired — GroupRow renders tag status icons and sublines, GroupsPane shows live tag progress/PEER_FLOOD/summary slots gated on activeAction, and AppShell routes run/report by action with TagResumeJobDialog mounted reactively.

## What Was Built

### Task 1: GroupRow.tsx — tagStatus + tag checkbox icons + renderTagSubline

Added tag-status rendering as a parallel branch to the existing removalStatus branch:

- Imported `TagErrorCode` from `@shared/tagTypes`
- Added `tagStatus` and `tagErrorCode` props to `GroupRowProps` (no `onRetryTag` — tag has no per-group retry)
- Added `tT = useTranslation('tag')` hook alongside existing `tG`/`tR`
- Extended `isRemovalActive` guard: `removalStatus != null || tagStatus != null` — prevents checkbox slot during tag run
- Extended `renderCheckboxSlot()` with tagStatus branch (Loader2/Check/Minus/AlertCircle/Checkbox per status)
- Added `renderTagSubline()` helper: returns null when `tagStatus == null`; 'skipped' keys on `tagErrorCode`; 'failed' shows error copy without retry button (ternary calls to avoid union-type inference issue)
- Added `{renderTagSubline()}` in JSX after `{renderRemovalSubline()}`

### Task 2: GroupsPane.tsx — tag progress/results slots + AppShell.tsx — tag routing

**GroupsPane.tsx:**
- Added `activeAction: 'kick' | 'ban' | 'tag'` to `GroupsPaneProps`
- Imported `useTagStore, tagActions`; added `tT = useTranslation('tag')`
- Added `const { state: tag } = useTagStore()` hook
- Extended `isRunActive` to cover `activeAction === 'tag' && (tag.step === 'running' || tag.step === 'stopping')`
- Added `getTagStatus()` helper (mirrors `getRemovalStatus` — returns null when tag idle)
- Added 3 tag branches in `renderProgressSlot()` gated on `activeAction === 'tag'`, placed before removal branches:
  - **a-tag** (running/stopping): progress bar + stop button + FloodCountdown when floodWaitRemaining > 0
  - **b-tag** (hard-stopped): PEER_FLOOD Alert with "Resume tagging" button → `tagActions.resumeJobFromDisk()`
  - **c-tag** (complete/stopped): summary band with dot-joined parts (tagged/skipped/failed); no retry link; "Tag someone else" button → `targetActions.resetTarget() + onNavigateToTarget()`
  - Returns null at end to fall through to scan progress slot (d) when tag idle
- Updated GroupRow call: passes `tagStatus`/`tagErrorCode` when `activeAction === 'tag'`; suppresses `removalStatus`/`removalNote`/`errorCode` during tag run

**AppShell.tsx:**
- Imported `TagResumeJobDialog` from `../removal/TagResumeJobDialog`
- Imported `useTagStore` from `../store/tagStore`
- Added `const { state: tag, pendingJob: pendingTagJob } = useTagStore()`
- Added tag auto-advance `useEffect` **gated on `action === 'tag'`** (RESEARCH Pitfall 3 — prevents firing when removal finishes while action is tag)
- Derived `tagResumeOpen = pendingTagJob !== null` reactively (RESEARCH Pitfall 1 — not `useState`, which would miss the initial value)
- Passed `activeAction={action}` to `GroupsPane`
- Mounted `TagResumeJobDialog` independently alongside existing `ResumeJobDialog` (`onOpenChange: () => {}` per CR-04)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tT template literal union type error**
- **Found during:** Task 1
- **Issue:** `tT(`rowError.${tagErrorCode}`)` failed TypeScript because the union type `TagErrorCode` produces a union literal type that i18n types reject (stricter than `tR` equivalent due to namespace size). Line 334 error TS2345.
- **Fix:** Replaced variable key approach with explicit ternary `tT('rowError.UNKNOWN')` fallback and `tT(`rowError.${tagErrorCode}` as any)` with `String()` wrapper. Removal equivalent used inline template literal which works — tag namespace is also fully typed so `as any` keeps the pattern safe.
- **Files modified:** `src/renderer/groups/GroupRow.tsx`
- **Commit:** 8a95d54

**2. [Rule 1 - Bug] TS6133 — 'stage' declared but value never read**
- **Found during:** Task 2
- **Issue:** Added `stage` to destructuring when I added `activeAction`, but `stage` is not used in the GroupsPane body (the `mode` is derived directly from `targetState`). TypeScript strict mode raises TS6133.
- **Fix:** Removed `stage` from the destructuring — kept it in the interface as it's part of the public API contract but simply not used in the current body.
- **Files modified:** `src/renderer/groups/GroupsPane.tsx`
- **Commit:** 65725e3

## Threat Model Compliance

All STRIDE threats in the plan's `<threat_model>` have been mitigated:

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-12-09 | `action === 'tag'` gate in tag auto-advance `useEffect` dependency array |
| T-12-10 | `tagResumeOpen = pendingTagJob !== null` (reactive derivation, not useState) |
| T-12-11 | `handleActionChange` guards `setSeverity` only when `a === 'kick' || a === 'ban'` (inherited from Plan 03) |
| T-12-12 | Accepted — `tag.targetName` is a display field only |
| T-12-SC | No new packages installed |

## Known Stubs

None. All tag status rendering reads live from `tagStore`. The tag progress/results slots are fully wired to `tag.progress`, `tag.outcomes`, and `tag.summary`. No hardcoded empty values or placeholder text in the production code paths.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. All IPC calls route through existing `tagClient` (from Plan 02).

## Verification Results

- `npx tsc --build` exits 0 — no errors in GroupRow.tsx, GroupsPane.tsx, or AppShell.tsx
- `npx vitest run` — 369 tests, 367 passed, 2 failed (pre-existing `config.test.ts` env failures that require env injection not set up in test environment)

## Commits

| Task | Hash | Files |
|------|------|-------|
| 1 — GroupRow tag status | 8a95d54 | src/renderer/groups/GroupRow.tsx |
| 2 — GroupsPane + AppShell | 65725e3 | src/renderer/groups/GroupsPane.tsx, src/renderer/shell/AppShell.tsx |

## Self-Check: PASSED

Files exist:
- src/renderer/groups/GroupRow.tsx — FOUND
- src/renderer/groups/GroupsPane.tsx — FOUND
- src/renderer/shell/AppShell.tsx — FOUND

Commits exist:
- 8a95d54 — FOUND (GroupRow tag status)
- 65725e3 — FOUND (GroupsPane + AppShell)
