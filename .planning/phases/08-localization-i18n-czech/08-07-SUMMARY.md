---
phase: 08-localization-i18n-czech
plan: "07"
subsystem: groups-pane-i18n
tags:
  - localization
  - i18n
  - groups
  - czech
dependency_graph:
  requires:
    - 08-05
    - 08-06
  provides:
    - groups-namespace-fully-migrated
    - groupsCopy-deleted
  affects:
    - src/renderer/groups/GroupRow.tsx
    - src/renderer/groups/GroupsPane.tsx
tech_stack:
  added: []
  patterns:
    - useTranslation('groups') with tG alias
    - useTranslation('removal') with tR alias
    - useTranslation('wizard') with tW alias
    - formatMemberCount from @renderer/lib/format
    - formatTime from @renderer/lib/format for summaryTimestamp
key_files:
  created: []
  modified:
    - src/renderer/groups/GroupRow.tsx
    - src/renderer/groups/GroupsPane.tsx
    - src/renderer/i18n/locales/en/groups.json
    - src/renderer/i18n/locales/cs/groups.json
  deleted:
    - src/renderer/groups/groupsCopy.ts
decisions:
  - GroupsPane uses three aliased hooks (tG/tR/tW) to avoid ambiguity in a large component with three namespace dependencies
  - summaryLineParts() function replaced with inline logic using tR('summaryPart.*') keys — avoids passing untranslated labels from a function return value
  - summaryTimestamp() replaced with tR('finishedAt', { time: formatTime(iso) }) — Czech renders 'Dokončeno HH:MM' as designed
metrics:
  duration_minutes: 12
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_changed: 5
---

# Phase 08 Plan 07: Groups Pane Migration (Wave 4) Summary

Wave 4 complete: GroupRow.tsx and GroupsPane.tsx fully migrated from copy-module imports to react-i18next useTranslation, and groupsCopy.ts deleted with zero remaining consumers.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate GroupRow.tsx — groups + removal namespaces + formatMemberCount from lib/format | 232d87b | GroupRow.tsx, en/groups.json, cs/groups.json |
| 2 | Migrate GroupsPane.tsx (all 3 namespaces) + delete groupsCopy.ts | abdc6d7 | GroupsPane.tsx, groupsCopy.ts (deleted) |

## What Was Built

**Task 1 — GroupRow.tsx migration:**
- Removed `./groupsCopy` and `../removal/removalCopy` imports
- Added `useTranslation('groups')` (alias `tG`) and `useTranslation('removal')` (alias `tR`)
- Imported `formatMemberCount` from `@renderer/lib/format` instead of groupsCopy
- Migrated `GROUP_GREY_COPY[reason]` → `tG('greyReason.${reason}')` (hyphenated keys preserved in JSON)
- Migrated `GROUP_TYPE_LABEL[type]` → `tG('groupTypeLabel.${type}')`
- Migrated all `removalCopy.rowStatus.*` → `tR('rowStatus.*')`
- Migrated `RMV_ERROR_COPY[code]` → `tR('rowError.${code}')`
- Migrated `removalCopy.retryRowLabel` → `tR('retryRowLabel')`
- Migrated all inline aria-labels to `tG('includeInRemovalAria')`, `tG('retryRemovalAria')`, `tG('retryScanAria')`
- Added missing aria-label keys to `en/groups.json` and `cs/groups.json`

**Task 2 — GroupsPane.tsx migration + groupsCopy.ts deletion:**
- Removed all three copy module imports (groupsCopy, removalCopy, wizardCopy)
- Added three aliased hooks: `tG` (groups), `tR` (removal), `tW` (wizard)
- Imported `formatTime` from `@renderer/lib/format`
- Migrated all `GROUP_ERROR_COPY`, `SCAN_COPY`, `EMPTY_STATE_COPY` usages to `tG(*)` calls
- Migrated all `removalCopy.*` usages including `summaryLineParts()` (replaced with inline logic using `tR('summaryPart.*')`)
- Migrated `removalCopy.summaryTimestamp(iso)` → `tR('finishedAt', { time: formatTime(iso) })` — Czech renders 'Dokončeno HH:MM'
- Migrated all `wizardCopy.*` usages to `tW(*)` calls
- Replaced inline `aria-label="Filter groups"` and `aria-label="Refresh group list"` with `tG('filterPlaceholder')` and `tG('refreshAria')`
- Deleted `src/renderer/groups/groupsCopy.ts` after confirming zero consumers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added missing aria-label keys to groups.json**
- **Found during:** Task 1
- **Issue:** `groups.json` (both en and cs) were missing `includeInRemovalAria`, `retryRemovalAria`, and `retryScanAria` keys referenced by the plan's interface inventory
- **Fix:** Added English strings and Czech translations to both locale files before migrating GroupRow
- **Files modified:** `src/renderer/i18n/locales/en/groups.json`, `src/renderer/i18n/locales/cs/groups.json`
- **Commit:** 232d87b

## Known Stubs

None — all data flows from i18n JSON keys with full Czech translations.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. Dynamic Telegram data (`dialog.title`) flows only as interpolation variables per T-08-13 threat model.

## Self-Check: PASSED

- GroupRow.tsx: no groupsCopy or removalCopy imports — CONFIRMED
- GroupsPane.tsx: no groupsCopy, removalCopy, or wizardCopy imports — CONFIRMED
- groupsCopy.ts deleted: `[ -f src/renderer/groups/groupsCopy.ts ]` → MISSING (correct)
- grep for groupsCopy imports (excluding tests) → 0 — CONFIRMED
- Commit 232d87b exists — CONFIRMED
- Commit abdc6d7 exists — CONFIRMED
- npm test: 257 passed, 19 todo — GREEN
- tsc --build: no errors — GREEN
