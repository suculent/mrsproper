---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
reviewed: 2026-10-24T23:10:00Z
depth: standard
iteration: 3
files_reviewed: 35
files_reviewed_list:
  - src/main/index.ts
  - src/main/ipc/addChannels.ts
  - src/main/ipc/languageChannels.ts
  - src/main/ipc/searchChannels.ts
  - src/main/ipc/targetChannels.ts
  - src/main/storage/addAuditStore.ts
  - src/main/telegram/AddExecutor.ts
  - src/main/telegram/MembershipScanner.ts
  - src/preload/index.ts
  - src/renderer/groups/GroupRow.tsx
  - src/renderer/groups/GroupsPane.tsx
  - src/renderer/groups/ModeSwitch.tsx
  - src/renderer/groups/addPaneState.ts
  - src/renderer/i18n/locales/en/add.json
  - src/renderer/i18n/locales/en/groups.json
  - src/renderer/i18n/locales/en/target.json
  - src/renderer/i18n/locales/cs/add.json
  - src/renderer/i18n/locales/cs/groups.json
  - src/renderer/i18n/locales/cs/target.json
  - src/renderer/ipc/addClient.ts
  - src/renderer/ipc/languageClient.ts
  - src/renderer/main.tsx
  - src/renderer/removal/AddResumeJobDialog.tsx
  - src/renderer/shell/AppShell.tsx
  - src/renderer/store/addStore.ts
  - src/renderer/target/JobTargetCard.tsx
  - src/renderer/target/TargetCard.tsx
  - src/renderer/target/TargetInput.tsx
  - src/renderer/target/avatarFallback.ts
  - src/renderer/wizard/ReviewScreen.tsx
  - src/shared/addTypes.ts
  - src/shared/channels.ts
  - src/main/telegram/addResume.ipc.integration.test.ts
  - src/main/telegram/addExecutor.test.ts
  - src/main/ipc/addChannels.test.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 17: Code Review Report (iteration 3)

**Reviewed:** 2026-10-24T23:10:00Z
**Depth:** standard
**Files Reviewed:** 35
**Status:** clean

## Narrative Findings (AI reviewer)

## Summary

This re-review covers `733af3b..HEAD -- src/`, focusing on the iteration-2 fixes (commits 6aeb98e..7da8f08). I traced:
- `_retryingDialogIds`;
- the jobId-guarded `retryDmStatus` persist in `_retryGroupInner`;
- the complete-status preservation in `_hardStopRetry`;
- the lineage end-of-run DM guard in `execute()`;
- the `ADD_RESUME` `isJobFinished` rejection;
- the hard-stopped banner's `canResumeHardStopped`;
- the `startAdd` `stepBefore` rule.

I also checked the store semantics these fixes depend on: `checkpoint` dedups per dialogId and never touches `status`, and `setStatus` keeps `completedAt` when it is passed as undefined.

Checks run: `vitest` on main/telegram, main/ipc, renderer/store and renderer/groups gives 571 passed and 2 failed. Both failures are the known env-dependent `config.test.ts` API_HASH test. `tsc --noEmit` passes for both `tsconfig.node.json` and `tsconfig.web.json`.

**Prior findings:**

| ID | Status | Notes |
|----|--------|-------|
| WR-01 | Resolved | The `retryDmStatus` checkpoint now runs after `appendBlock` and before both the hard-stop branch and the generation guard. It runs only when the on-disk `jobId` still matches, and it is skipped for a hard-stopped (undelivered) send. Abort while a DM is in flight: the job file is still the same lineage (no new job can start while a retry is in flight, because `execute()` refuses), so the fact is persisted. If the file was cleared, `readJob()` returns null and the write is skipped, so the store cannot throw. A concurrent retry's `_hardStopRetry` has already set `hard-stopped` in the store's in-memory `_currentJob`, and the later checkpoint keeps that status. |
| WR-02 | Resolved | `_retryingDialogIds` is checked and added synchronously before the first await, and deleted in `finally`, so a throw in `_retryGroupInner` cannot leak the entry. A duplicate retry of the same row cannot interleave. |
| WR-03 | Resolved | `_hardStopRetry` no longer demotes a `complete` file. So `checkResumeIdentity` returns `fresh` for the same person afterwards, and the no-op-continuation duplicate-DM path is closed. `ADD_RESUME` rejects finished jobs in main. The banner hides Resume for a finished job. `_jobDialogIds` is always set by `execute()` before any in-session hard-stopped state, so `add.dialogIds` is populated and the banner does not hide Resume for a legitimately resumable job. The lineage DM guard is defensive (see IN-01). |
| IN-01 | Resolved | `startAdd` uses the same rule as `resumeAdd`. An unchanged non-idle refusal returns false. |
| IN-02 | Resolved | The parameter is removed from the method, the interface, the call site and the tests. |
| IN-03 | Resolved | `console.warn` is emitted on refusal. |

I found no new path that adds or DMs anyone other than the job's target. I also found no new path that sends a link to the target twice. No Critical or Warning findings remain.

## Info

### IN-01: The lineage end-of-run DM guard can only be reached by legacy job files

**File:** `src/main/telegram/AddExecutor.ts:531-539`
**Issue:** `lineageDmAttempted` requires `isContinuation`, which in turn requires `existing.status !== 'complete'`, together with `existing.dmStatus` of `sent` or `refused`. In current code, `dmStatus` is only written as `sent` or `refused` on the `complete` transition, or by a retry when the job's `dmStatus` was `not-needed` (which also implies `complete`). `complete` is no longer demoted (WR-03). So this branch is reachable only for files that the pre-fix `_hardStopRetry` demoted. It is harmless defense-in-depth, but the comment reads as if this were a normal flow.
**Fix:** Optional: note in the comment that this branch protects job files written before iteration 2 (demoted `complete` jobs).

### IN-02: A job hard-stopped during its end-of-run DM can never deliver that DM via Resume

**File:** `src/main/ipc/addChannels.ts:220-225`, `src/renderer/groups/GroupsPane.tsx:579-581`
**Issue:** When PEER_FLOOD hits the end-of-run `SendMessage`, every group has been processed, `dmStatus` stays `pending`, and the status is `hard-stopped`. `isJobFinished` is true, so both `ADD_RESUME` and the banner's Resume button refuse it. The pending links are only delivered if the admin re-confirms the same person with the same group set through `ADD_START`, which becomes a continuation that runs only the DM tail. The fix report documents this, and the behavior matches what the renderer did before. The admin gets no cue that the DM is still owed, though.
**Fix:** Optional: when `step === 'hard-stopped'` and the job is finished but has undelivered links, show a hint such as "invite links not yet sent". Alternatively, allow `ADD_RESUME` when `isJobFinished(job) && job.dmStatus === 'pending' && job.outcomes.some((o) => o.status === 'privacy-blocked' && o.link && o.retryDmStatus !== 'sent')`.

---

_Reviewed: 2026-10-24T23:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
