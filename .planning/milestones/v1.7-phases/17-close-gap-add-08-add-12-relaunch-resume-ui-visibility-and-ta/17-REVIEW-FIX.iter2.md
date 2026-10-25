---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
fixed_at: 2026-10-24T20:53:52Z
review_path: .planning/phases/17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta/17-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 17: Code Review Fix Report

**Fixed at:** 2026-10-24T20:53:52Z
**Source review:** .planning/phases/17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta/17-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (2 critical, 6 warning, 5 info)
- Fixed: 13
- Skipped: 0

**Verification after all fixes:**
- `npx vitest run`: 749 passed, 2 failed. Both failures are the known env-dependent `src/main/telegram/config.test.ts` (AUTH-03 API_ID/API_HASH).
- `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`: clean.
- No stray emitted `.js`/`.d.ts` under `src/`. The only `.d.ts` there is the tracked `src/renderer/i18n/i18next.d.ts`.
- New regression tests for WR-01, WR-02, WR-03 and WR-04 were checked against the pre-fix `AddExecutor.ts`: they fail without the fix and pass with it.

## Fixed Issues

### CR-01: D-07 "narrow rule" silently rejects a legitimate fresh start for target B, and the UI reports nothing

**Files modified:** `src/shared/channels.ts`, `src/preload/index.ts`, `src/renderer/ipc/addClient.ts`, `src/main/ipc/addChannels.ts`, `src/main/telegram/AddExecutor.ts`, `src/renderer/store/addStore.ts`, `src/renderer/removal/AddResumeJobDialog.tsx`, `src/renderer/wizard/ReviewScreen.tsx`, `src/renderer/i18n/locales/{en,cs}/add.json`, plus tests (`addChannels.test.ts`, `addExecutor.test.ts`, `addResume.ipc.integration.test.ts`, `addStore.test.ts`, `reviewScreen.test.ts`)
**Commit:** 0d44ea2
**Applied fix:** Applied the orchestrator fix direction.
- **New `ADD_RESUME` channel.** It takes no payload and is whitelisted in `CHANNELS`, bridged as `resumeAdd` in preload, and added to `addClient`. The handler gates on auth, double-start, `executor.checkExplicitResume(job)` and the enumeration. It then calls `execute({ dialogIds: job.dialogIds, resume: true })`. It rejects (returns state, no execute, no initJob, no RPC) when there is no non-complete job, or when the live resolver user differs from `job.targetId`.
- **`ADD_START` semantics (`checkResumeIdentity`).**
  - The same target id resumes; the continuation gate still checks the dialog-id set.
  - A different identity starts `fresh` when the executor is idle and is rejected when it is non-idle.
  - A start with no resolver target is now rejected, so resuming without a reviewed target goes only through `ADD_RESUME`.
  - The idle + mismatch + same-set rejection is gone.
- **`execute()` defense-in-depth.** It now rejects a mismatched identity only when `resume === true` or the executor is non-idle. A mismatched resume can never fall through to `initJob`.
- **Renderer callers.**
  - `addActions.resumeAdd()` was added; it returns true only when a run started, and clears `pendingJob`.
  - `AddResumeJobDialog` and `resumeJobFromDisk` (stopped band and PEER_FLOOD banner) call it. `resumeJobFromDisk` still re-reads the job to skip finished or complete jobs.
- **ReviewScreen.** The add confirm sequence was extracted into an exported `runAddConfirm()`. When `startAdd` returns false it does not call `maybeAddToContacts()` or `onConfirm()`, and ReviewScreen shows an inline `add.startFailed` alert (new en/cs key; the Czech copy uses formal vykání).
- **Tests.**
  - Integration Test 6 now checks that, after a relaunch with B confirmed, `ADD_RESUME` is rejected and the job is untouched.
  - New case: B confirmed plus `ADD_START` with A's exact set starts a fresh job for B.
  - New case: `ADD_START` with no target never resumes.
  - The F1 tests use `ADD_RESUME`.
  - Added: `ADD_RESUME` handler tests R1–R4, `resumeAdd` store tests, and `runAddConfirm` false/true tests.
**Status:** fixed, but needs human verification because this is a logic change. Please confirm the D-07 semantics at UAT. In particular, `ADD_START` with no confirmed target now returns `reject`, where it used to return `resume`.

### CR-02: The relaunch job view has no exit after a PEER_FLOOD hard-stop

**Files modified:** `src/renderer/groups/GroupsPane.tsx`, `src/renderer/groups/GroupsPane.job.test.tsx`
**Commit:** c5e6fad
**Applied fix:** The PEER_FLOOD (hard-stopped) band now renders an outline "Add someone else" button next to Resume. It calls `targetActions.resetTarget()` and then `onNavigateToTarget()`, and is disabled while a Resume is in flight. The stopped and complete bands already had this exit. Running and stopping keep only Stop. A new job-view test asserts that the exit is present for hard-stopped, stopped and complete, and absent for running and stopping.

### WR-01: A retry-DM link is sent twice

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** 3d1eeec
**Applied fix:** The end-of-run `linkedOutcomes` now excludes rows with `retryDmStatus === 'sent'`. Those rows are also left out of the end-of-run add-log `linkedDialogs`, because the retry already wrote its own block for them. If every link was already delivered by retry DMs, no SendMessage is made and `dmStatus` is `'sent'` rather than `'not-needed'`. Two new tests cover this.
**Status:** fixed, but needs human verification. Choosing `'sent'` instead of `'not-needed'` when every link already went out is a judgement call.

### WR-02: Retry DM tail can send after another retry hard-stopped, and overwrites `hard-stopped` with a stale status

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** fdcc4c7 (shared with WR-03; both edit the same retry-tail block)
**Applied fix:**
- `_hardStopRetry(dialogId, gen)` now returns early if the retry was superseded (gen mismatch), so it never writes over an abort or a newer run. Otherwise it bumps `_generation`, so any other in-flight retry drops out at its post-await guard and sends no DM.
- The retry tail re-reads the job (`auditStore.readJob()`) after the awaits before calling `setStatus`, instead of writing back the status captured before the await.
- New concurrency test: retry Y (privacy-blocked) and retry X (PEER_FLOOD) run together. It asserts no SendMessage, `'hard-stopped'` on disk, and `'hard-stopped'` in state.

### WR-03: A DM that was actually sent leaves no add-log record when the generation changed during the send

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** fdcc4c7
**Applied fix:** The retry add-log block is now appended right after the DM attempt, before the generation guard. The guard now protects only checkpoint and emit. The existing "generation change during the DM await" test was updated: it now expects one `'sent'` log block, and still expects no `retryDmStatus` checkpoint and an idle state.

### WR-04: Concurrent retry and stopped-band Resume discard a real retry outcome

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`, `src/renderer/groups/GroupsPane.tsx`
**Commit:** 4412aa4
**Applied fix:**
- `AddExecutor` counts in-flight retries (`_retriesInFlight`, wrapped in try/finally around a new `_retryGroupInner`). While a retry is in flight, `execute()` returns without changing state, so `ADD_RESUME`/`ADD_START` report the unchanged step and the renderer shows its existing "Couldn't resume" message.
- GroupsPane ignores row retry while `resumeState === 'inflight'`.
- New test: a Resume during an in-flight retry is refused, and the retry's outcome is kept.
- Because the renderer's `retryGroup` IPC call is fire-and-forget, the renderer cannot tell when a retry is still running. The main-side guard is the authoritative one.

### WR-05: TARGET_RESOLVE / TARGET_RESOLVE_CANDIDATE lock is check-then-await (TOCTOU)

**Files modified:** `src/main/ipc/targetChannels.ts`, `src/main/ipc/searchChannels.ts`, `src/main/ipc/targetChannels.test.ts`, `src/main/ipc/searchChannels.test.ts`
**Commit:** cc1abda
**Applied fix:** Both handlers check the add step again after `resolver.resolve()` / `resolveByCandidate()`. If a job started in the meantime, they call `resolver.reset()`. New tests cover both the reset and the no-reset case.

### WR-06: `resumeState` is never reset between jobs or state transitions

**Files modified:** `src/renderer/groups/GroupsPane.tsx`
**Commit:** 43b4610
**Applied fix:** Added `useEffect(() => setResumeState('idle'), [add.step, add.targetId])`. There is no automated test, because GroupsPane tests use a static render (`renderToStaticMarkup`) and effects never run there.
**Status:** fixed, but needs human verification at UAT: a failed Resume, then "Add someone else", then a new job should not show a stale "Couldn't resume" message.

### IN-01: Dead `'no-groups'` branch in the checklist/scan-complete empty state

**Files modified:** `src/renderer/groups/GroupsPane.tsx`
**Commit:** d576933
**Applied fix:** Extracted a `renderNoGroups()` helper and used it in all three places that had duplicated markup: the Add checklist early return, browse, and scan-complete Add. Behavior is unchanged. The scan-complete branch can still be reached while groups are not loaded, so it was kept instead of deleted.

### IN-02: Unused i18n key `rowStatus.retryDmSending`

**Files modified:** `src/renderer/i18n/locales/en/add.json`, `src/renderer/i18n/locales/cs/add.json`
**Commit:** 90714f3
**Applied fix:** Removed the key from en and cs. Wiring a transient `'sending'` value instead would need a new `retryDmStatus` type value that must never be persisted (the Zod schema allows only `'sent' | 'refused'`), plus clearing it on hard-stop and generation changes. That was not cheap, so the key was removed.

### IN-03: `getState` is optional on the `addExecutor` structural type

**Files modified:** `src/main/ipc/targetChannels.ts`, `src/main/ipc/searchChannels.ts`, `src/main/ipc/targetChannels.test.ts`, `src/main/ipc/searchChannels.test.ts`
**Commit:** f8242e1
**Applied fix:** `getState()` is now required on the `addExecutor` type. The parameter itself stays optional, because many legacy tests omit it. `getAddStep` is now a required parameter of `registerSearchChannels`, and the tests pass `() => 'idle'`. The test that passed an executor without `getState` was replaced with one that passes no executor at all.

### IN-04: Type-unsafe cast and misleading add-log status in the retry tail

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/shared/addTypes.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** f678bb4
**Applied fix:**
- `_effectiveScanStatus` now takes `{ bannedDialogIds?: string[] } | null`, so the `as AddJobFile` cast is gone.
- `AddLogBlockEntry.dmStatus` gains a `'hard-stopped'` value. A PEER_FLOOD during the retry DM is now logged as `DM status: hard-stopped`, not `refused`, and the test asserts this.

### IN-05: The integration test's fake audit store diverges from the real store

**Files modified:** `src/main/telegram/addResume.ipc.integration.test.ts`
**Commit:** bb7f2a1
**Applied fix:**
- The fake `checkpoint` now mirrors the real store's CR-01 dedup (filter by dialogId, then append), and the fake `setStatus` persists `dmStatus`.
- F1 now asserts that the reprocessed `skipped` row is replaced, not duplicated.
- The renderer `startAdd`-false path is covered by the new `runAddConfirm` tests (CR-01).

---

_Fixed: 2026-10-24T20:53:52Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
