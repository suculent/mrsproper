---
phase: 08-localization-i18n-czech
plan: "06"
subsystem: renderer/target
tags: [localization, i18n, migration, target-namespace]
dependency_graph:
  requires: [08-04]
  provides: [target-namespace-localized]
  affects: [src/renderer/target]
tech_stack:
  added: []
  patterns: [useTranslation hook, t() interpolation, formatFoundInTitles from lib/format]
key_files:
  created: []
  modified:
    - src/renderer/target/TargetInput.tsx
    - src/renderer/target/TargetCard.tsx
    - src/renderer/target/CandidateRow.tsx
    - src/renderer/target/CandidateList.tsx
  deleted:
    - src/renderer/target/resolveCopy.ts
    - src/renderer/target/searchCopy.ts
decisions:
  - TargetCard uses tTr alias for useTranslation to avoid collision with the existing local t variable (the resolved target object)
metrics:
  duration_seconds: 280
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_changed: 6
---

# Phase 08 Plan 06: Target Namespace Migration Summary

**One-liner:** Migrated TargetInput, TargetCard, CandidateRow, CandidateList from copy-module string constants to useTranslation('target') hook, then deleted resolveCopy.ts and searchCopy.ts with zero remaining consumers.

## What Was Built

The target namespace components (4 files) were migrated from static copy-module imports to the i18next `useTranslation('target')` hook, completing Wave 3 of the localization migration. All user-facing strings in the target resolution and name-search UI now render via `t()` calls backed by `target.json`, enabling Czech translation.

**TargetInput.tsx:** Replaced imports of `getResolveCopy`, `INVALID_USERNAME_FORMAT_COPY`, `INVALID_PHONE_FORMAT_COPY`, `PHONE_MODE_DISCLOSURE_HINT`, `FLOOD_WAIT_SUBTEXT` (from resolveCopy) and `SEARCH_COPY` (from searchCopy) with `useTranslation('target')`. All string references — resolve errors, search progress, aria-live announcements, button text — replaced with `t()` calls.

**TargetCard.tsx:** Added `useTranslation('target')` aliased as `tTr` (to avoid collision with the local `t` variable holding the resolved target). Replaced two tooltip strings with `tTr('stopRemovalFirst')` and `tTr('clearTargetTooltip')`.

**CandidateRow.tsx:** Replaced `formatFoundIn` import from `./searchCopy` with `formatFoundInTitles` from `@renderer/lib/format`. Computes overflow count, appends `t('foundInMore', { count: overflow })` for the "+N more" suffix (renders as "dalších" in Czech). Replaced hardcoded aria-label template literal with `t('candidateRowAria', { name, count })`.

**CandidateList.tsx:** Replaced all `SEARCH_COPY.*` function calls and `SEARCH_ERROR_COPY[code]` lookups with `t()` calls throughout — progress label, flood subline, stopped line, cap notice, failedN (plural), emptyHeading, emptyBody, and terminal search error.

**Deletions:** After verifying zero remaining imports (grep returned 0 results for `from.*resolveCopy` and `from.*searchCopy`), deleted both copy modules. `formatFoundIn` utility from searchCopy was superseded by `formatFoundInTitles` in `lib/format.ts` (migrated in Plan 04). A comment in `groupsCopy.ts` referenced `resolveCopy.ts` as a pattern example — comment only, not an import; no action needed.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate 4 target components to useTranslation | d33e4de | TargetInput.tsx, TargetCard.tsx, CandidateRow.tsx, CandidateList.tsx |
| 2 | Delete resolveCopy.ts and searchCopy.ts | 3883fe4 | resolveCopy.ts (deleted), searchCopy.ts (deleted) |

## Verification

- `grep -rn "from.*resolveCopy\|from.*searchCopy" src/renderer` → 0 results
- CandidateRow imports `formatFoundInTitles` from `@renderer/lib/format`
- `npm test` → 257 passed | 19 todo (276 total), 25 test files GREEN
- `tsc --build` → clean (no output)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Variable name collision in TargetCard.tsx**
- **Found during:** Task 1 — tsc --build reported TS2451 (cannot redeclare block-scoped variable 't')
- **Issue:** TargetCard.tsx already uses `t` as a local variable for the resolved target object (`const t = target.step === 'resolved' || ...`). Adding `const { t } = useTranslation('target')` caused a collision.
- **Fix:** Aliased the translation function as `tTr`: `const { t: tTr } = useTranslation('target')` and used `tTr(...)` for all translation calls.
- **Files modified:** src/renderer/target/TargetCard.tsx
- **Commit:** d33e4de

**2. [Rule 1 - Bug] CandidateDTO.foundIn is string[] not object array**
- **Found during:** Task 1 code review — plan interface comment described `candidate.foundIn.map(g => g.title)` implying objects with `.title` property
- **Issue:** `CandidateDTO.foundIn` is typed as `string[]` (group titles directly), not an array of objects. The `.map(g => g.title)` would fail at type-check.
- **Fix:** Used `const titles = candidate.foundIn` directly (already string array); no map needed.
- **Files modified:** src/renderer/target/CandidateRow.tsx
- **Commit:** d33e4de

## Known Stubs

None. All strings are wired to live `target.json` keys with Czech translations in `target.json` (cs locale).

## Threat Flags

None. No new network endpoints, auth paths, or schema changes. Dynamic Telegram data (candidate names, group titles) flows through `t()` as interpolation variables only — never as translation keys (T-08-11 mitigated by construction).

## Self-Check: PASSED

- src/renderer/target/TargetInput.tsx — modified, no resolveCopy/searchCopy imports
- src/renderer/target/TargetCard.tsx — modified, no resolveCopy/searchCopy imports
- src/renderer/target/CandidateRow.tsx — modified, imports formatFoundInTitles from @renderer/lib/format
- src/renderer/target/CandidateList.tsx — modified, no searchCopy imports
- src/renderer/target/resolveCopy.ts — DELETED (confirmed absent)
- src/renderer/target/searchCopy.ts — DELETED (confirmed absent)
- Commit d33e4de — exists
- Commit 3883fe4 — exists
