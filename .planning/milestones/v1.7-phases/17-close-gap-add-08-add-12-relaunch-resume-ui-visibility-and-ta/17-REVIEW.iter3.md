---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
reviewed: 2026-10-24T21:00:00Z
depth: standard
iteration: 2
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
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 17: Code Review Report (iteration 2)

**Reviewed:** 2026-10-24T21:00:00Z
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

This is a re-review of `733af3b..HEAD -- src/` after the iteration-1 fixes (17-REVIEW-FIX.md). I checked each prior finding against the code. I also traced the new code: the `ADD_RESUME` channel, `checkResumeIdentity` / `checkExplicitResume`, `runAddConfirm`, `_hardStopRetry` (now gen-guarded and bumping the generation), the WR-03 log-before-guard reordering, `_retriesInFlight`, and the WR-05 post-await re-check.

Checks run: `vitest` on main/telegram, main/ipc, renderer store/wizard/groups gives 639 passed and 2 failed (only the known env-dependent `config.test.ts`). `tsc --noEmit` passes for both the node and web projects.

**Prior findings:**

| ID | Status | Notes |
|----|--------|-------|
| CR-01 | Resolved | `ADD_START` → `checkResumeIdentity`: a different identity gets `fresh` when idle and `reject` when non-idle; no resolver target gets `reject`. `ADD_RESUME` reads the job from disk, calls `checkExplicitResume` (rejects when the live user ≠ `job.targetId`), and runs the enumeration gate. `execute()` rejects a mismatch when `resume === true` or the executor is non-idle. `runAddConfirm` skips contacts and navigation when `startAdd` returns false. Matches the D-07 narrow rule. |
| CR-02 | Resolved | The hard-stopped band now renders "Add someone else". |
| WR-01 | Resolved, with a race gap | See WR-01 below. |
| WR-02 | Resolved | `_hardStopRetry` is gen-guarded and bumps `_generation`. The status is re-read before `setStatus`. |
| WR-03 | Resolved for the add log, but the checkpoint gap remains | Folded into WR-01 below. |
| WR-04 | Partially resolved | Retry vs Resume is guarded. Retry vs retry on the same row is still unguarded and now duplicates DMs (WR-02 below). |
| WR-05 | Resolved | Both handlers re-check the lock after the await and reset. |
| WR-06 | Resolved | `useEffect` on `[add.step, add.targetId]`. |
| IN-01..IN-05 | Resolved | |

**Identity lock:** I found no path in the new code that adds or DMs a person other than the job's target. The `ADD_RESUME` identity comes only from the job file or a matching resolver.

The remaining defects are all in the D-12 retry-DM tail and how it interacts with the continuation logic. Each one can send the target a link they already received.

## Warnings

### WR-01: A retry DM that was delivered is not persisted as `retryDmStatus: 'sent'` when the generation changes during the send, so a later Resume DMs the same link again

**File:** `src/main/telegram/AddExecutor.ts:756-781` (consumer: `:521-523`)
**Issue:** WR-03 moved `appendBlock` before the generation guard, but the `retryDmStatus` checkpoint at 780-781 still sits behind `if (gen !== this._generation) return`. The generation now changes in two realistic ways while a retry DM is in flight:
- another concurrent retry hits PEER_FLOOD (`_hardStopRetry` bumps `_generation`, the WR-02 fix);
- the admin clicks "Add someone else" (`abortExecution`).

In both cases the message really went out, but the on-disk outcome stays `privacy-blocked` + `link` with no `retryDmStatus`. The job file is still `stopped` or `hard-stopped` and not finished. When the admin later resumes it (PEER_FLOOD banner, stopped band, or the relaunch dialog), the continuation reaches the end-of-run tail. There, `linkedOutcomes` includes the row (its `retryDmStatus !== 'sent'`), so the target receives the same link a second time. This is exactly the duplicate that WR-01 was meant to close, now reachable through the race that WR-02 introduced. The add log also records the first send, so the audit trail and the DM history will disagree.
**Fix:** Persist the side-effect fact independently of the state-emission guard. Only skip it if the on-disk job was replaced. No new job can start while a retry is in flight (WR-04 guard), but check anyway:
```ts
// after appendBlock, before the gen guard
if (dm === 'sent' || dm === 'refused') {
  const onDisk = this._auditStore.readJob()
  if (onDisk !== null && onDisk.jobId === job.jobId) {
    this._auditStore.checkpoint(dialogId, { ...newOutcome, retryDmStatus: dm })
  }
}
if (hardStop) { this._hardStopRetry(dialogId, gen); return }
if (gen !== this._generation) return
// ...then the existing setStatus re-read + emit (drop the second checkpoint)
```
Add a test: two concurrent retries, X privacy-blocked with its DM resolving after Y's PEER_FLOOD. Then assert that the X outcome on disk carries `retryDmStatus: 'sent'`, and that a subsequent `ADD_RESUME` sends no SendMessage containing X's link.

### WR-02: Two retries of the same failed row run concurrently and each DMs the target a different invite link

**File:** `src/main/telegram/AddExecutor.ts:650-665`, `src/renderer/groups/GroupsPane.tsx:1059-1064`
**Issue:** `retryGroup` only counts in-flight retries (`_retriesInFlight`). It does not de-duplicate by `dialogId`. The row keeps showing `failed` with its retry link while the retry is in flight (no "retrying" state, and IN-02 removed the `sending` key). The renderer's only guard is `resumeState === 'inflight'`. A double-click, or a second click during a long governor wait (FLOOD_WAIT up to the threshold), therefore dispatches two retries for the same group:
- two `InviteToChannel` / `AddChatUser` calls;
- if the group is privacy-restricted, two `ExportChatInvite` calls, so two different links;
- two `SendMessage` DMs to the target (the new D-12 tail).

Each retry also writes its own add-log block, and the last checkpoint overwrites the first link. The disk record then shows only one of the two links the target received. This is duplicate outbound messaging and extra RPC traffic, which runs against the project's rate-limit constraint.
**Fix:** De-duplicate in main, which is authoritative because the IPC call is fire-and-forget:
```ts
private readonly _retryingDialogIds = new Set<string>()
async retryGroup(dialogId: string): Promise<void> {
  if (!['complete', 'stopped', 'hard-stopped'].includes(this._currentState.step)) return
  if (this._retryingDialogIds.has(dialogId)) return
  this._retryingDialogIds.add(dialogId)
  this._retriesInFlight++
  try { await this._retryGroupInner(dialogId) }
  finally { this._retriesInFlight--; this._retryingDialogIds.delete(dialogId) }
}
```
Optionally also track in-flight row ids in GroupsPane and disable that row's retry link.

### WR-03: A retry PEER_FLOOD rewrites a completed job to `hard-stopped` on disk, which turns a later fresh `ADD_START` for the same person into a no-op continuation that re-sends old links

**File:** `src/main/telegram/AddExecutor.ts:817-823` (`_hardStopRetry`), `:771-774` (new D-12 DM-tail hard-stop), `:214-215` (`checkResumeIdentity`), `:374-379` and `:517-565` (continuation and end-of-run DM)
**Issue:** `retryGroup` is allowed in `complete`. If the retry (or its new D-12 DM) hits PEER_FLOOD, `_hardStopRetry` calls `setStatus('hard-stopped')` on a job that already finished and already sent its end-of-run DM (`dmStatus: 'sent'`). The job file is now "non-complete". Example: job A had groups G1 and G2, both privacy-blocked. The end-of-run DM sent L1 and L2. A retry of G1 then hit PEER_FLOOD in its DM. Later the admin picks A again via "Add someone else", selects the same G1+G2 (still actionable because A is not a member), and confirms:
1. `checkResumeIdentity` returns `'resume'` (same id, status not complete), and `ADD_START` passes `resume: true`.
2. `isContinuation` is true (same set). Every outcome is already finished, so `dialogsToProcess` is empty and **no add attempt is made**. The admin asked for a fresh attempt and silently gets none.
3. The end-of-run tail treats L2 (and G1's retry link, which has no `retryDmStatus` because the hard-stop path never checkpoints one) as undelivered and DMs them **again**. The account was just PEER_FLOOD-flagged.

In the same state, the PEER_FLOOD banner shows a Resume button that always fails (`resumeJobFromDisk` → `isJobFinished` → false → "Couldn't resume"). `ADD_RESUME` in main has no finished-job check of its own, so only that renderer filter blocks the same duplicate-DM path.
**Fix:** Don't demote a terminal job on disk, and make the end-of-run DM idempotent per lineage:
```ts
private _hardStopRetry(dialogId: string, gen: number): void {
  ...
  this._generation++
  const onDisk = this._auditStore.readJob()
  if (onDisk?.status !== 'complete') this._auditStore.setStatus('hard-stopped')
  this._emit({ ...this._currentState, step: 'hard-stopped', floodWaitRemaining: null })
}
// execute(), end-of-run: skip the DM entirely if this lineage already attempted it
if (isContinuation && (existing!.dmStatus === 'sent' || existing!.dmStatus === 'refused')) { /* no SendMessage */ }
```
Also add `isJobFinished(job)` to the `ADD_RESUME` rejection list in `addChannels.ts`, and hide the b-add Resume button when the job is finished (mirror `canResume`).

## Info

### IN-01: `addActions.startAdd` treats any non-idle returned state as "started"

**File:** `src/renderer/store/addStore.ts:125-137`
**Issue:** Several main refusals return the *unchanged* executor state: the `_retriesInFlight` early return in `execute()`, `checkResumeIdentity` returning `'reject'` while non-idle, and the auth and enumeration gates. If that state is non-idle, `startAdd` returns true, and `runAddConfirm` then writes contacts and advances to the run stage with no run. Today this can't happen, because the Review button only renders when `add.step === 'idle'`. But it is an implicit precondition that `resumeAdd` already handles more robustly (`stepBefore` comparison).
**Fix:** Use the same `stepBefore` / `running` heuristic as `resumeAdd`, or have main return an explicit `{ started: boolean, state }`.

### IN-02: `checkResumeIdentity` keeps an unused `_dialogIds` parameter

**File:** `src/main/telegram/AddExecutor.ts:208-211`, `src/main/ipc/addChannels.ts:66-69`
**Issue:** The dialog-set heuristic was removed in CR-01, but the parameter is still declared in the class and in `AddExecutorLike`, and is still passed by `ADD_START`. This misleads readers into thinking the decision still depends on the set.
**Fix:** Remove the parameter from the method, the interface, the call site and the tests.

### IN-03: The `execute()` refusal while a retry is in flight leaves no trace

**File:** `src/main/telegram/AddExecutor.ts:255`
**Issue:** The early return emits nothing and logs nothing. After "Add someone else" (abort → idle), a still-awaiting retry (up to a full FLOOD_WAIT) makes the fresh `ADD_START` for target B fail with the generic `add.startFailed` copy ("account or groups may not be ready"), which doesn't describe the real cause. The generation bump has already superseded that retry's outcome, so WR-04's data-loss rationale no longer applies in the idle case. The guard does still keep RPCs from overlapping.
**Fix:** At minimum, `console.warn('[AddExecutor] start refused: retry in flight')`. Consider a distinct renderer message.

---

_Reviewed: 2026-10-24T21:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
