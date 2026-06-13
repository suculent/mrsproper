---
phase: 08-localization-i18n-czech
plan: "08"
subsystem: renderer/wizard + renderer/removal
tags: [i18n, localization, copy-module-deletion, react-i18next, wizard, removal]
dependency_graph:
  requires: [08-05, 08-06]
  provides: [wizardCopy-deleted, removalCopy-deleted, LOC-02-complete]
  affects: [ReviewScreen, StepIndicator, ResumeJobDialog]
tech_stack:
  added: []
  patterns: [useTranslation hook, t() with pluralization count/interpolation, TranslateFn type for pure-function t injection]
key_files:
  modified:
    - src/renderer/wizard/ReviewScreen.tsx
    - src/renderer/wizard/StepIndicator.tsx
    - src/renderer/removal/ResumeJobDialog.tsx
  deleted:
    - src/renderer/wizard/wizardCopy.ts
    - src/renderer/removal/removalCopy.ts
decisions:
  - computePlannedActions accepts optional TranslateFn parameter (loose type alias) for mechanicNote 4-branch t() lookup; cast at call site to avoid react-i18next TFunction overload mismatch; identity fallback keeps unit tests green without React context
metrics:
  duration: 8
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_changed: 5
---

# Phase 08 Plan 08: Wave 4 Wizard + Removal Copy Module Migration Summary

**One-liner:** Migrated ReviewScreen, StepIndicator, and ResumeJobDialog from wizardCopy/removalCopy static strings to useTranslation() hooks, deleted both copy modules, completing LOC-02 for the wizard and removal namespaces.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate StepIndicator and ResumeJobDialog | 24dacdb | StepIndicator.tsx, ResumeJobDialog.tsx |
| 2 | Migrate ReviewScreen + delete wizardCopy.ts and removalCopy.ts | 6477032 | ReviewScreen.tsx, wizardCopy.ts (deleted), removalCopy.ts (deleted) |

## What Was Built

**StepIndicator.tsx:** Replaced `wizardCopy` import with `useTranslation('wizard')`. `stepIndicatorAria` and `stageLabel.${stage}` rendered via `t()`.

**ResumeJobDialog.tsx:** Replaced `removalCopy` import with `useTranslation('removal')`. `resumeTitle`/`resumeBody` use `t()` with name/x/n interpolation; `resumeNeutral`/`resumeDestructive` use plain `t()`.

**ReviewScreen.tsx:** Replaced both `wizardCopy` and `removalCopy` imports with `useTranslation('wizard')` (as `t`) and `useTranslation('removal')` (as `tR`). All 15+ string usages migrated including:
- wizard namespace: reviewTitle, severityLabel, severityGroupAria, severityKick/Ban, totalsEmpty, totalsRemoving/Excluded/CantBlock, groupListAria, memberCount, editSelection, confirmLabelBan/Kick, confirmAriaLabelBan/Kick
- removal namespace: severityLineBan/Kick, confirmDispatching

**computePlannedActions:** The exported pure function (used in unit tests without React context) was updated to accept an optional `TranslateFn` parameter. The `mechanicNote` field now uses the 4-branch t() key pattern: `mechanicNote.${basicGroup|supergroup}${Ban|Kick}`. The identity fallback `(key) => key` keeps tests passing without a React i18n context. The `t` function is cast via `t as TranslateFn` at the call site to avoid react-i18next's strict TFunction overload incompatibility.

**Copy module deletions:**
- `wizardCopy.ts` deleted — confirmed zero non-test consumers before deletion
- `removalCopy.ts` deleted — confirmed zero non-test consumers before deletion

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript overload incompatibility between TranslateFn and react-i18next TFunction**
- **Found during:** Task 2 tsc --build verification
- **Issue:** `TFunction<"wizard", undefined>` from `useTranslation('wizard')` could not be passed as `(key: string) => string` due to react-i18next's heavily overloaded type signatures
- **Fix:** Introduced `TranslateFn = (key: string, options?: Record<string, unknown>) => string` type alias in ReviewScreen.tsx, and cast `t as TranslateFn` at the `computePlannedActions` call site — keeps the pure function testable without jsdom and satisfies TypeScript
- **Files modified:** src/renderer/wizard/ReviewScreen.tsx
- **Commit:** 6477032

## Verification

- grep for wizardCopy/removalCopy imports (excluding tests) → 0 lines confirmed
- wizardCopy.ts deleted: confirmed (ls returns ENOENT)
- removalCopy.ts deleted: confirmed (ls returns ENOENT)
- npm test GREEN: 257 passed | 19 todo (276 total)
- tsc --build GREEN: no output (clean)
- reviewScreen.test.ts: all 10 tests pass (mechanic/warning checks unaffected by mechanicNote key change)

## Known Stubs

None — all string keys exist in en/wizard.json and en/removal.json; no placeholder values.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- src/renderer/wizard/ReviewScreen.tsx: FOUND (modified)
- src/renderer/wizard/StepIndicator.tsx: FOUND (modified)
- src/renderer/removal/ResumeJobDialog.tsx: FOUND (modified)
- src/renderer/wizard/wizardCopy.ts: DELETED as expected
- src/renderer/removal/removalCopy.ts: DELETED as expected
- Commit 24dacdb: FOUND
- Commit 6477032: FOUND
