---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
fixed_at: 2026-10-24T23:15:00Z
review_path: .planning/phases/17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta/17-REVIEW.md
iteration: 2
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 17: Code Review Fix Report (iteration 2)

**Fixed at:** 2026-10-24T23:15:00Z
**Source review:** .planning/phases/17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta/17-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 6 (WR-01..WR-03, IN-01..IN-03)
- Fixed: 6
- Skipped: 0

**Verification:** full `npx vitest run` gives 755 passed and 2 failed. Both failures are the known env-dependent `src/main/telegram/config.test.ts`. `npx tsc --noEmit -p tsconfig.node.json` and `-p tsconfig.web.json` both pass. Fixes were applied on the main working tree as instructed, with no worktree.

## Fixed Issues

### WR-01: A delivered retry DM was not persisted as `retryDmStatus: 'sent'` when the generation changed mid-send

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** 6aeb98e
**Applied fix:** In `_retryGroupInner`, the `retryDmStatus` checkpoint now runs after `appendBlock` and before both the hard-stop branch and the generation guard. It runs only when the on-disk job still has the same `jobId`, and never for a hard-stopped send (that send was not delivered). The duplicate checkpoint after the guard was removed. The guard now protects state emission only. The unit-test fake audit store now mirrors the real store's per-dialogId dedup in `checkpoint`. The "generation change during the DM await" test now expects `retryDmStatus: 'sent'` on disk. A new test covers a DM delivered while another retry hard-stops: `sent` is persisted, and a later Resume sends no second DM.
**Status:** fixed: requires human verification (state-ordering logic)

### WR-02: Two retries of the same failed row ran concurrently

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** d57b032
**Applied fix:** Added a `_retryingDialogIds` set. `retryGroup` refuses a dialogId that is already in flight and clears it in `finally`. New test: a second retry of the same row during the first gives one invite, one link export, one DM and one log block. After the first retry settles, the row can be retried again. The optional renderer per-row disabling was not added, since main is authoritative.

### WR-03: A retry PEER_FLOOD rewrote a completed job to `hard-stopped` on disk

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`, `src/main/ipc/addChannels.ts`, `src/main/ipc/addChannels.test.ts`, `src/renderer/groups/GroupsPane.tsx`
**Commit:** e198e3e
**Applied fix:**
- `_hardStopRetry` re-reads the job and calls `setStatus('hard-stopped')` only if the on-disk status is not `complete`. The in-memory view still shows the PEER_FLOOD banner.
- End-of-run in `execute()`: if this is a continuation and the lineage's `dmStatus` is already `sent` or `refused`, no SendMessage is made and that status is carried forward.
- `ADD_RESUME` now also rejects jobs where `isJobFinished(job)` is true.
- The b-add PEER_FLOOD banner hides its Resume button when the job is finished, mirroring `canResume`. "Add someone else" stays.
- Tests: a completed job is never demoted; a continuation with lineage `dmStatus: 'sent'` sends no DM; ADD_RESUME R5 covers a finished job (rejected) and a job with a skipped row (resumed).
- Two existing concurrency tests now set the job to `stopped` first, so they still exercise the non-terminal demotion.

**Note:** A hard-stop that hits during the end-of-run DM leaves every group processed. That job can now not be resumed in main either, so its pending DM is never sent automatically. The renderer already blocked this path before, so behavior is unchanged in practice.
**Status:** fixed: requires human verification (state and lineage logic)

### IN-01: `addActions.startAdd` treated any non-idle returned state as "started"

**Files modified:** `src/renderer/store/addStore.ts`, `src/renderer/store/addStore.test.ts`
**Commit:** 755130f
**Applied fix:** `startAdd` now uses the same `stepBefore` rule as `resumeAdd`: started = running, stopping, or a non-idle step that differs from the step before the call. New test: an unchanged `complete` result returns false, and `running` returns true.

### IN-02: `checkResumeIdentity` kept an unused `_dialogIds` parameter

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/ipc/addChannels.ts`, `src/main/ipc/addChannels.test.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** c7074e2
**Applied fix:** Removed the parameter from the method, the `AddExecutorLike` interface, the `ADD_START` call site, the mock and the tests. Two decision-table lines that differed only by dialog set were merged into one.

### IN-03: The `execute()` refusal while a retry is in flight left no trace

**Files modified:** `src/main/telegram/AddExecutor.ts`
**Commit:** 7da8f08
**Applied fix:** Added `console.warn('[AddExecutor] start refused: retry in flight')` before the early return. The optional distinct renderer message was not added.

---

_Fixed: 2026-10-24T23:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
