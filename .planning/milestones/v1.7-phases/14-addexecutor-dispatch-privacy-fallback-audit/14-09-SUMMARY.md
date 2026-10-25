---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
plan: 09
subsystem: telegram
tags: [typescript, gramjs, executor, resume, privacy-fallback, dm-dispatch, audit-log]

# Dependency graph
requires:
  - phase: 14-addexecutor-dispatch-privacy-fallback-audit
    provides: "14-08: AddExecutor.ts fresh-job dispatch core (per-group mechanics, unban-before-invite, D-05/D-06/D-07/D-09/D-10/D-12/D-19); 14-03: addAuditStore.ts + sameDialogIdSet(); 14-04: addLogStore.ts appendBlock(); 14-07: addExecutor.test.ts's full 54-test behavioral contract"
provides:
  - "AddExecutor.execute() extended with the D-20 continuation branch (resume:true + matching targetId + sameDialogIdSet(dialogIds) reuses the on-disk jobId/outcomes instead of minting a fresh job)"
  - "AddExecutor's post-loop sequence: D-13/D-14 end-of-run DM dispatch (stale-link regeneration, single SendMessage, refusal classification) and D-17/D-18 add-log append, both gated to the 'complete' terminal state only"
  - "AddAuditStore.setStatus() extended with an additive, optional dmStatus parameter so 'complete' persists the DM outcome alongside status/completedAt"
affects: [14-10, 14-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Continuation-aware job init: readJob() + sameDialogIdSet() decide reuse-vs-fresh before any dispatch; 'skipped' outcomes (abort/hard-stop guard fill-in) are excluded from the seeded set so a resumed segment reprocesses dialogs it never actually attempted, not just dialogs it never finished"
    - "dialogsToProcess (filtered) drives the per-group loop while `total` and the full `selectedDialogs` (used by _markRemainingSkippedAndStop) stay unfiltered, keeping progress reporting and stop-time skip-marking correct across a multi-segment job"
    - "End-of-run DM and add-log append share one post-loop block, gated behind the same post-loop abort/generation guard that already existed — neither runs unless the loop reaches its natural, uninterrupted end"

key-files:
  created: []
  modified:
    - src/main/telegram/AddExecutor.ts
    - src/main/storage/addAuditStore.ts

key-decisions:
  - "Seeded continuation outcomes exclude entries with status 'skipped' (not a literal `[...existing.outcomes]` copy) — required for the two-segment DM test to pass: dialogs left 'skipped' by a prior abort are placeholders for unattempted work, not finished work, so they must stay eligible for dialogsToProcess rather than being permanently excluded."
  - "dmStatus is declared as a mutable local narrowed by TypeScript to 'sent'|'refused'|'not-needed' by the time the add-log entry is built (every assignment path excludes 'pending', and the 'pending'-propagating path throws instead) — the add-log entry passes dmStatus directly rather than a defensive ternary, since TS correctly flags a 'pending' comparison as having no overlap at that point."
  - "Stale-link regeneration (>5 days) reuses _buildPrivacyBlockedOutcome verbatim (same helper Plan 14-08 built for the inline per-group export), looked up against the already-narrowed groupsState.dialogs rather than re-calling enumerator.getState()."

requirements-completed: [ADD-08, ADD-11]

# Metrics
duration: 25min
completed: 2026-10-03
---

# Phase 14 Plan 09: AddExecutor Continuation Resume, End-of-Run DM, Add-Log Append (GREEN-B) Summary

**Replaced AddExecutor's always-fresh job init with the D-20 continuation branch and added the post-loop DM/add-log sequence, turning the remaining 8 red tests in `addExecutor.test.ts` green — all 54/54 now pass.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `AddExecutor.execute()` now reads the on-disk job via `this._auditStore.readJob()` and computes `isContinuation` from `params.resume === true && existing.status !== 'complete' && existing.targetId === targetId && sameDialogIdSet(existing.dialogIds, params.dialogIds)`; a continuation reuses the existing `jobId` and seeds `outcomes` from disk (never calling `initJob()`), a non-continuation mints a fresh `jobId` exactly as Plan 14-08 did.
- Added a `dialogsToProcess` filter (seeded-outcome dialog ids excluded) so a resumed segment only processes dialogs it has not yet finished, while `total` (captured before the filter) keeps progress reporting scoped to the whole job.
- Added the post-loop D-13/D-14 sequence: compute `linkedOutcomes` (privacy-blocked + link), skip the DM entirely with `dmStatus: 'not-needed'` when empty, otherwise regenerate any link older than 5 days via `_buildPrivacyBlockedOutcome`, send exactly one `messages.SendMessage` with every accumulated link, and classify `USER_PRIVACY_RESTRICTED | USER_IS_BLOCKED | YOU_BLOCKED_USER | PRIVACY_PREMIUM_REQUIRED` as `dmStatus: 'refused'` (anything else rethrows as a genuine run failure).
- Added the D-17/D-18 add-log append: `addLogStore.appendBlock()` called exactly once, only in the 'complete' tail (never in the abort/hard-stop helper methods), with `isFollowUp` set from `isContinuation` and `jobId` from the (possibly reused) job id.
- Extended `AddAuditStore.setStatus()` with an additive third parameter (`dmStatus?: AddDmStatus`), spread into the persisted job alongside the existing `completedAt` spread — the 11 existing `addAuditStore.test.ts` tests still pass unmodified.
- `npx vitest run src/main/telegram/addExecutor.test.ts`: **54/54 passing** (was 46/54 after Plan 14-08). `npx vitest run src/main/storage/addAuditStore.test.ts`: 11/11. `npx tsc --build`: exits 0. Full suite (`.env` loaded): 36 files, 471 tests, all passing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement continuation-based resume + end-of-run DM + add-log (GREEN-B)** - `267d248` (feat)

**Plan metadata:** (this commit, created after this summary)

## Files Created/Modified
- `src/main/telegram/AddExecutor.ts` - `execute()` extended with the D-20 continuation branch and the D-13/D-14/D-17/D-18 post-loop DM/add-log sequence; `AddExecutorOptions.addLogStore`/`_addLogStore` retyped from the Plan 14-08 placeholder to `{ appendBlock(entry: AddLogBlockEntry): void }`; new imports (`randomBytes` from `node:crypto`, `sameDialogIdSet` from `../storage/addAuditStore`, `AddDmStatus`/`AddLogBlockEntry` from `@shared/addTypes`); removed the now-obsolete `void this._addLogStore; void this._getDmText` no-ops (both fields are genuinely used now).
- `src/main/storage/addAuditStore.ts` - `AddAuditStore.setStatus()` interface and implementation extended with an additive, optional `dmStatus?: AddDmStatus` third parameter.

## Decisions Made
- Seeded continuation outcomes exclude `status === 'skipped'` entries rather than copying `existing.outcomes` verbatim. The plan's prose literally says "seed outcomes = `[...existing.outcomes]`", but a dialog marked `skipped` by `_markRemainingSkippedAndStop` after an abort was never actually attempted — it is a placeholder, not a finished outcome. Filtering it out of the seeded set (and therefore out of the `dialogsToProcess` exclusion set) is what lets the two-segment DM test ("a resumed run... the single end-of-run SendMessage call's message contains links from BOTH segments") actually reprocess the second segment's dialog and accumulate its link. A literal verbatim-copy implementation would have left `dialogsToProcess` empty on that resume call, producing a DM with only the first segment's link and failing the test's dual-link assertion.
- `dmStatus` is written directly (not via a defensive `dmStatus === 'pending' ? 'not-needed' : dmStatus` ternary) into the add-log entry, because TypeScript correctly narrows `dmStatus`'s type to `'sent' | 'refused' | 'not-needed'` by that point in the function (every assignment path excludes `'pending'`, and the only path that would otherwise leave it `'pending'` throws instead) — the ternary form was rejected by `tsc --build` with TS2367 ("no overlap") and removed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Seeded continuation outcomes exclude 'skipped' entries, not a verbatim copy**
- **Found during:** Task 1 (writing the D-20 continuation branch, then running `addExecutor.test.ts`'s two-segment DM test)
- **Issue:** The plan's `<action>` text specifies seeding `outcomes = [...existing.outcomes]` literally and then excluding "any dialog id already present in the seeded outcomes" from `dialogsToProcess`. Because `_markRemainingSkippedAndStop` (built in Plan 14-08, unchanged here) fills every not-yet-reached dialog into `outcomes` as `status: 'skipped'` the moment a run is aborted or hard-stopped, EVERY dialog id in a stopped job's `dialogIds` set ends up present in `outcomes` — including ones that were never actually attempted. A verbatim seed + presence-only exclusion would leave `dialogsToProcess` empty on the very next resume call, so the resumed segment would do nothing, never produce its second link, and the end-to-end DM test asserting links from BOTH segments would fail.
- **Fix:** Seed `outcomes` from `existing.outcomes.filter(o => o.status !== 'skipped')` instead of a verbatim copy, so a dialog that was only ever marked `skipped` (never dispatched) stays eligible for `dialogsToProcess` and gets genuinely processed in the resumed segment.
- **Files modified:** `src/main/telegram/AddExecutor.ts` (same file this plan owns — no scope creep).
- **Verification:** The two-segment DM test ("a resumed run (two segments: first stopped with 1 link, second resumed+completed with a 2nd link): the single end-of-run SendMessage call's message contains links from BOTH segments") now passes, along with all 54/54 tests in the file.
- **Committed in:** `267d248` (Task 1 commit — fix applied before the single commit for this task).

---

**Total deviations:** 1 auto-fixed (1 bug, confined to the file this plan owns)
**Impact on plan:** Behavioral correction to match the actual test contract (the test file is the primary spec per this plan's `<read_first>` instructions); no scope creep, no architectural change.

## Issues Encountered
- `npx tsc --build` initially flagged `dmStatus === 'pending' ? 'not-needed' : dmStatus` as TS2367 (no overlap) in the add-log `appendBlock()` call, because TypeScript had already narrowed `dmStatus` to exclude `'pending'` by that point in the function. Resolved by passing `dmStatus` directly (see Decisions Made) rather than suppressing or widening the type.
- `npx tsc --build` emitted 4 stray `.js`/`.d.ts` files beside the two modified sources (`addAuditStore.js/.d.ts`, `AddExecutor.js/.d.ts`) — deleted before each `vitest run`, consistent with the project's documented `tsc --build` behavior. Confirmed no other stray emitted files existed project-wide before running the full suite.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `AddExecutor.ts` is now feature-complete for Phase 14: every ADD-06 through ADD-11 behavior, including the continuation-resume and end-of-run DM/add-log steps that have no analog in RemovalExecutor/TagExecutor, is implemented and fully tested (54/54 in `addExecutor.test.ts`).
- `AddAuditStore.setStatus()`'s additive `dmStatus` parameter is available for any future caller (e.g. a retry/resume IPC handler in Plan 14-10/14-11) that needs to persist a DM-outcome transition outside the main `execute()` flow.
- No blockers for Plans 14-10/14-11.

## Self-Check: PASSED

- FOUND: src/main/telegram/AddExecutor.ts
- FOUND: src/main/storage/addAuditStore.ts
- FOUND: 267d248 (Task 1 commit)

---
*Phase: 14-addexecutor-dispatch-privacy-fallback-audit*
*Completed: 2026-10-03*
