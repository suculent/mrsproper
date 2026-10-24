---
phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state
fixed_at: 2026-10-24T21:39:00Z
review_path: .planning/phases/16-close-gap-add-08-resume-path-and-add-02-empty-state/16-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-10-24T21:39:00Z
**Source review:** .planning/phases/16-close-gap-add-08-resume-path-and-add-02-empty-state/16-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (Critical/Warning; Info IN-01..IN-03 out of scope)
- Fixed: 4
- Skipped: 0

Verification: `npx tsc --build` clean; full Vitest suite 52 files / 667 tests green (baseline 661; +6 new tests).

## Fixed Issues

### WR-02: Rebuilt target accepts an empty/garbage access hash without error

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addResume.integration.test.ts`
**Commit:** d4e8501
**Applied fix:** Before rebuilding the relaunch-resume target from add-job.json, `targetId` and `targetAccessHash` must both be integer strings (`/^-?\d+$/`, typeof-guarded); otherwise `resolved` stays null and execute() takes the idle path. `targetName` is null-guarded (falls back to `''`). Added 3 integration tests (empty hash, non-numeric hash, empty id) that fail before the fix and pass after.

### WR-03: Early-return idle emits carry stale state of the previous run

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** 15926e0
**Applied fix:** New private `_emitEarlyIdle()` used by both early exits (no target / enumerator not loaded): emits a clean idle state (empty targetId/targetName/outcomes, zero progress, no dialogIds — same shape as abortExecution's idle reset) and clears `_runActive`, `_abortController`, `_resolvedTarget`, `_jobDialogIds`. The AbortController is now created only after the early checks pass. Added a test: complete run, then an early-idle execute, asserting no leaked dialogIds/outcomes/target.

### WR-04: `computeAddGroups` defaults unknown membership to `'not-member'`

**Files modified:** `src/renderer/wizard/addValidation.ts`, `src/renderer/wizard/addValidation.test.ts`
**Commit:** 6c2e6ff
**Status:** fixed: requires human verification (safety-semantics change)
**Applied fix:** The defensive re-filter now passes `membershipByDialogId.get(d.id) ?? null` to `isActionableForMode`, so unscanned/unknown membership is NOT actionable in Add mode (D-05).
**BEHAVIOUR CHANGE:** A checked dialog with no scan result (scan not started, or result absent) is now excluded from the Add review list and never reaches `startAdd`. Before, it was treated as `'not-member'` and included. If ReviewScreen can be reached in Add mode before the scan has produced results, the actionable count will be 0 for those rows. This matches the checklist rule (rows only become pre-checked once status resolves). Existing tests that used an empty map and expected rows to survive now pass explicit `'not-member'` results. The old "absent entry treated as not-banned" test became "absent entry is excluded". New tests cover pending/failed/member exclusion and the empty-map case. The resume dialog path is not affected: it calls `startAdd(job.dialogIds)` directly.

### WR-01: Resume dead-ends silently when a job group is no longer enumerated

**Files modified:** `src/renderer/removal/AddResumeJobDialog.tsx`, `src/renderer/i18n/locales/en/add.json`, `src/renderer/i18n/locales/cs/add.json`
**Commit:** d49ba4c
**Status:** fixed: requires human verification (UI behaviour, no automated render test)
**Applied fix:** Took the "surface a failure state" option from the review. When `addActions.startAdd` returns false (main threw "unknown dialogId", or returned idle because auth, enumerator or target was not ready), the dialog shows an inline `role="alert"` line (`text-destructive`) with the new `add:resumeFailed` key. The line clears on the next Resume attempt. Copy: en "Couldn't resume this job. You may no longer manage one of its groups, or your account isn't ready yet. Try again, or discard the job."; cs (formal) "Úlohu se nepodařilo obnovit. Možná již nespravujete některou z jejích skupin nebo váš účet ještě není připraven. Zkuste to znovu, nebo úlohu zrušte." The main-side handling was deliberately left alone: unknown ids are still rejected, not silently dropped, to keep the `sameDialogIdSet` continuation gate strict.

---

_Fixed: 2026-10-24T21:39:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
