---
phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - src/main/index.ts
  - src/main/ipc/languageChannels.test.ts
  - src/main/ipc/languageChannels.ts
  - src/main/telegram/AddExecutor.ts
  - src/main/telegram/GroupEnumerator.ts
  - src/main/telegram/addExecutor.test.ts
  - src/main/telegram/addResume.integration.test.ts
  - src/renderer/groups/GroupRow.test.tsx
  - src/renderer/groups/GroupRow.tsx
  - src/renderer/groups/GroupsPane.tsx
  - src/renderer/groups/addPaneState.test.ts
  - src/renderer/groups/addPaneState.ts
  - src/renderer/groups/modeRules.ts
  - src/renderer/i18n/locales/cs/add.json
  - src/renderer/i18n/locales/cs/groups.json
  - src/renderer/i18n/locales/cs/target.json
  - src/renderer/i18n/locales/en/add.json
  - src/renderer/i18n/locales/en/groups.json
  - src/renderer/i18n/locales/en/target.json
  - src/renderer/removal/AddResumeJobDialog.tsx
  - src/renderer/removal/resumeDialogState.test.ts
  - src/renderer/removal/resumeDialogState.ts
  - src/renderer/shell/AppShell.tsx
  - src/renderer/store/addStore.test.ts
  - src/renderer/store/addStore.ts
  - src/renderer/target/TargetCard.tsx
  - src/renderer/wizard/addValidation.ts
  - src/shared/addResume.ts
  - src/shared/addTypes.ts
  - src/shared/groupTypes.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 16: Code Review Report

**Depth:** standard

## Summary

Security invariants hold: `targetAccessHash` is read only in `AddExecutor.execute()` from the job file and never placed in `AddState`; `resume` is still computed in `addChannels.ts` and absent from the Zod schema; only booleans (`canUnban`) cross the bridge; the language cache is written after `LanguageSchema.parse`; no hashes are logged. `'skipped'` handling in `countProcessedOutcomes`/`isJobFinished` is consistent with the executor's continuation filter. en/cs key parity for the changed files is intact (`stopRunFirst`, `resumeLoadingGroups`, the four new `emptyState` keys). Defects are in robustness of the resume path.

## Warnings

### WR-01: Resume dead-ends silently when a job group is no longer enumerated
**File:** `src/main/ipc/addChannels.ts:160-168`, `src/renderer/store/addStore.ts:121-139`, `src/renderer/removal/AddResumeJobDialog.tsx:53-58`
**Issue:** The renderer now sends the FULL `job.dialogIds`. If the admin lost rights or left any group since the job was written, the handler throws "unknown dialogId", `startAdd` catches it, logs to console and returns false. The dialog stays open (onOpenChange is a no-op) with no message, and Resume does nothing; the only exit is Discard. The same happens silently on an idle return (auth/enumerator/target failure).
**Fix:** Surface a failure state in the dialog (e.g. `startAdd` returning a reason, shown via an i18n error line), or have main drop unknown ids from the resume set, relaxing `sameDialogIdSet` for continuation to compare against the job's set intersected with the known dialogs.

### WR-02: Rebuilt target accepts an empty/garbage access hash without error
**File:** `src/main/telegram/AddExecutor.ts:218-230`
**Issue:** `BigInt('')` returns `0n` and does not throw, so a job file with an empty or missing `targetAccessHash` yields a target with accessHash 0, and the run proceeds to Telegram calls with an invalid InputPeerUser (failing per group with a confusing error, or hitting the wrong peer path). The `catch` only covers non-numeric strings. `existing.targetName` is also not null-guarded.
**Fix:**
```ts
if (!/^-?\d+$/.test(existing.targetId) || !/^-?\d+$/.test(existing.targetAccessHash)) throw new Error('bad job')
```
before building `resolved`, so malformed jobs fall into the idle path.

### WR-03: Early-return idle emits carry stale `dialogIds` and other state of the previous run
**File:** `src/main/telegram/AddExecutor.ts:231-243`
**Issue:** The two early exits emit `{ ...this._currentState, step: 'idle' }`. If the prior state was `complete`/`stopped`, the idle state keeps `dialogIds`, outcomes and target identity (the `_emit` merge skips idle, but the spread does not clear a field already present). This leaks job `dialogIds` into idle state (contradicting the "idle carries no dialogIds" intent) and `_runActive`/`_abortController` are left set on the early-return paths. The `_abortController` is also reassigned on every call before the checks.
**Fix:** Emit a clean idle state (as the finalizer does at lines ~553-565) and clear `_abortController` on these exits.

### WR-04: `computeAddGroups` defaults unknown membership to `'not-member'`, diverging from `isActionableForMode`
**File:** `src/renderer/wizard/addValidation.ts:41`
**Issue:** `isActionableForMode` deliberately treats `null`/pending as NOT actionable in Add mode (D-05), but the safety re-filter substitutes `'not-member'` for a missing status, so a checked dialog with unknown status passes the "defensive" filter. This defeats the filter's stated purpose for the stale-selection case.
**Fix:** Pass `membershipByDialogId.get(d.id) ?? null` (cast to the status type as `isActionableForMode` accepts) so unknown statuses are rejected.

## Info

### IN-01: JSDoc of `_computeCanAdd` now attaches to `_computeCanUnban`
**File:** `src/main/telegram/GroupEnumerator.ts:268-282`
**Issue:** The new method was inserted between the `_computeCanAdd` doc comment and its definition, so the Add-rights docs describe the wrong function and `_computeCanUnban` has none.
**Fix:** Move `_computeCanUnban` above the comment block and give it its own one-line doc.

### IN-02: `max(500)` dialogIds cap blocks resuming very large jobs
**File:** `src/main/ipc/addChannels.ts:87`
**Issue:** The full set is now always sent on resume; a job with more than 500 groups would fail Zod and be unresumable (see WR-01 for the silent failure).
**Fix:** Acceptable if 500 is a hard product bound; otherwise raise the cap or document it.

### IN-03: Lines exceed the file's wrapping convention / magic coupling
**File:** `src/main/telegram/AddExecutor.ts:200-201`, `src/renderer/groups/modeRules.ts:18-19`
**Issue:** Edited doc comments were appended mid-line, producing very long lines mixing two unrelated sentences. Cosmetic.
**Fix:** Re-wrap.

---

_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
