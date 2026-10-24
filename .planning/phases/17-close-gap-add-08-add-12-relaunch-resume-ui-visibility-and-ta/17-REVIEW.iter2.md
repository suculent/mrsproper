---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
reviewed: 2026-10-24T20:38:45Z
depth: standard
files_reviewed: 32
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
  - src/renderer/ipc/languageClient.ts
  - src/renderer/main.tsx
  - src/renderer/shell/AppShell.tsx
  - src/renderer/store/addStore.ts
  - src/renderer/target/JobTargetCard.tsx
  - src/renderer/target/TargetCard.tsx
  - src/renderer/target/TargetInput.tsx
  - src/renderer/target/avatarFallback.ts
  - src/shared/addTypes.ts
  - src/shared/channels.ts
  - src/main/telegram/addResume.ipc.integration.test.ts
  - src/main/telegram/addExecutor.test.ts
  - src/main/ipc/addChannels.test.ts
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-24T20:38:45Z
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the Phase 17 diff (`733af3b..HEAD -- src/`) against 17-CONTEXT D-01..D-14, focusing on the identity lock, the generation guards in `retryGroup`, Zod persistence of the new fields, and log hygiene.

**Identity lock (wrong-person add):** I found no path that adds or DMs a person other than the job's target. `retryGroup` now acts only on `_resolvedTarget` and cross-checks both the live resolver id and the on-disk `job.targetId`. `execute()` refuses a matching-set start under a different live identity before it bumps the generation or calls `initJob`. `TARGET_RESOLVE`, `TARGET_CONFIRM` and `TARGET_RESOLVE_CANDIDATE` are gated in main.

**Zod persistence:** `bannedDialogIds` and `retryDmStatus` are both in `AddJobFileSchema` / `AddGroupOutcomeSchema`. `bannedDialogIds` is stripped from `ADD_GET_JOB` and excluded from `AddJobFileSafe`.

**Logs:** No invite links or names are added to console logs. Links go only to the add log, which D-12 intends.

The defects are in the surrounding behaviour:
- The narrow D-07 rule is implemented with a dialog-set heuristic. It silently refuses a legitimate fresh start for target B, and ReviewScreen then moves on as if the run started.
- The relaunch job view has no exit once the job hard-stops.
- The new D-12 retry DM tail can duplicate a link the end-of-run DM sends later, can drop its own add-log record, and can send a message after a PEER_FLOOD hard-stop.

## Critical Issues

### CR-01: D-07 "narrow rule" silently rejects a legitimate fresh start for target B, and the UI reports nothing (ReviewScreen proceeds to the run stage and adds B to contacts)

**File:** `src/main/telegram/AddExecutor.ts:209-212`, `src/main/telegram/AddExecutor.ts:242-252`, `src/main/ipc/addChannels.ts:181-184` (consumer: `src/renderer/wizard/ReviewScreen.tsx:266-280`)
**Issue:** D-07 (user decision 2026-10-24) says: *"If the executor is idle and the admin has reviewed and confirmed a different target B (e.g. after Stop → "Add someone else"), starting B begins a fresh job and replaces job A's leftover file."* The implementation instead returns `'reject'` whenever the executor is idle, the live user differs from `existing.targetId`, **and** B's selected set equals job A's dialog set. In `execute()` the same shape returns early. The unit test codifies this (`addExecutor.test.ts:1862`: "idle, same set → reject").

Selecting the same groups for B as for A is an ordinary case, for example when neither person is in any of a small set of groups. When it happens:
1. `ADD_START` returns the idle executor state, so `addActions.startAdd` returns `false`.
2. `ReviewScreen.handleConfirm` ignores the return value. It still calls `targetActions.maybeAddToContacts()`, which writes B to the admin's contacts as a side effect, and then `onConfirm()` moves to the `run` stage, where no run exists. The user sees no error.
3. Job A's file stays `stopped`, and the only discard UI is the relaunch `AddResumeJobDialog`. So **B can never be added to exactly that group set in this session**, and every retry fails silently in the same way.

The heuristic can't tell "Resume of A" from "fresh B with the same groups" because the decision is inferred from the payload's shape. The `idle` sub-case it guards against is "relaunch Resume of A while B is resolved". The modal `AddResumeJobDialog` prevents that in practice, and the PEER_FLOOD and stopped-band Resume buttons are already covered by the `step !== 'idle'` branch.
**Fix:** Make Resume intent explicit and main-owned instead of shape-inferred. For example, add a main-side `ADD_RESUME` channel (no payload; main reads the job file) that the resume dialog and band buttons use. Then `ADD_START` always means "fresh job for the confirmed resolver target":
```ts
// addChannels.ts
ipcMain.handle(ADD_RESUME, async () => {
  const job = auditStore.readJob()
  if (!job || job.status === 'complete') return executor.getState()
  if (executor.checkResumeIdentity(job) === 'reject') return executor.getState() // live id !== job.targetId
  executor.execute({ dialogIds: job.dialogIds, resume: true }).catch(() => {})
  return executor.getState()
})
// ADD_START: resume = existing?.targetId === liveId && sameDialogIdSet(...) — never 'reject' when idle.
```
Separately, `ReviewScreen.handleConfirm` must check `startAdd`'s boolean: if it is false, do not call `maybeAddToContacts()` or `onConfirm()`, and show an error.

### CR-02: The relaunch job view has no exit after a PEER_FLOOD hard-stop; the user is trapped until restart

**File:** `src/renderer/groups/GroupsPane.tsx:575-614` (b-add band), `src/renderer/groups/GroupsPane.tsx:869-880` (toolbar), `src/renderer/target/JobTargetCard.tsx:608-641`, `src/renderer/shell/AppShell.tsx:523-543`
**Issue:** D-02 and D-09 say the lock ends when the admin leaves the job, and that "Add someone else" (`targetActions.resetTarget()`) is the only exit. In the relaunch job view (`view === 'job'`, add non-idle, target not confirmed):
- the hard-stopped (PEER_FLOOD) band renders only a Resume button. There is no "Add someone else", unlike the c-add summary band;
- the toolbar "Change target" button renders only when `mode === 'checklist'`, and the job view maps to `mode = 'browse'`;
- `JobTargetCard` has no Change-target control, and `TargetCard` (which has one) is not rendered while `showJobCard` is true;
- `TargetInput` is locked, `ModeSwitch` is locked, and main rejects lookup.

So after a relaunch Resume hits PEER_FLOOD, the only control left is Resume. While the account is flagged, Resume re-triggers PEER_FLOOD, which runs against the project constraint about not hammering a flagged account. The locked-input hint (`target.lookupLockedAddJob`) tells the user to choose "Add someone else", but that button doesn't exist in this state. The only way out is to quit the app and pick Discard in the resume dialog.
**Fix:** Render the same exit in the b-add band (and, defensively, whenever `isJob && add.step !== 'running' && add.step !== 'stopping'`):
```tsx
<Button variant="outline" size="sm"
  onClick={async () => { await targetActions.resetTarget(); onNavigateToTarget() }}>
  {tAdd('addSomeoneElse')}
</Button>
```
Add a GroupsPane.job test that asserts an exit control exists for `step: 'hard-stopped'` in the job view.

## Warnings

### WR-01: A retry-DM link is sent twice: immediately by D-12, then again in the end-of-run DM after a Resume

**File:** `src/main/telegram/AddExecutor.ts:704-753` and `src/main/telegram/AddExecutor.ts:497-537`
**Issue:** `retryGroup` is allowed in `stopped` and `hard-stopped`, where `job.dmStatus` is still `'pending'`. A retry that ends privacy-blocked now DMs its link at once and checkpoints `retryDmStatus: 'sent'`. If the admin then resumes (via the new D-11 stopped-band Resume or the PEER_FLOOD Resume), the continuation re-seeds outcomes from disk, and the end-of-run aggregation `outcomes.filter((o) => o.status === 'privacy-blocked' && o.link)` includes that row again. The target receives the same link in two messages. This breaks the "one DM per job" lineage rule (Phase 14 D-13) and is extra outbound messaging to a user who may already be annoyed.
**Fix:** Exclude rows whose link has already been delivered:
```ts
const linkedOutcomes = outcomes.filter(
  (o) => o.status === 'privacy-blocked' && o.link && o.retryDmStatus !== 'sent'
)
```
Keep them in the add-log `linkedDialogs` if a full record is wanted. Alternatively, defer the D-12 immediate DM when `job.dmStatus === 'pending'`, since the end-of-run DM will carry it.

### WR-02: Retry DM tail can send a Telegram message after another retry already hard-stopped the account, and overwrites `hard-stopped` on disk with a stale status

**File:** `src/main/telegram/AddExecutor.ts:631-742`, `src/main/telegram/AddExecutor.ts:767-771`
**Issue:** Nothing stops two retries from running at once; the renderer allows clicking several failed rows. `_hardStopRetry` does not bump `_generation`. The post-await check at 681-687 explicitly accepts `'hard-stopped'`. So if retry X hits PEER_FLOOD while retry Y is in flight, Y continues: it checkpoints, then calls `_sendDm` (a new `messages.SendMessage`) on a PEER_FLOOD-flagged account, violating CR-03 ("never continue after a hard-stop"). Y then runs `this._auditStore.setStatus(job.status, undefined, dm)` with `job.status` read **before** any await (e.g. `'complete'`), which overwrites X's on-disk `'hard-stopped'`. After a relaunch the job looks complete and no resume prompt appears, even though the in-memory state showed hard-stopped.
**Fix:** Before the DM tail, bail out if the executor is hard-stopped. Never write a status captured before an await:
```ts
if (gen !== this._generation || this._currentState.step === 'hard-stopped') return
...
if (job.dmStatus === 'not-needed') {
  const fresh = this._auditStore.readJob()
  if (fresh) this._auditStore.setStatus(fresh.status, undefined, dm)
}
```
Also consider bumping `_generation` in `_hardStopRetry`, or adding a single in-flight retry guard.

### WR-03: A DM that was actually sent leaves no add-log record when the generation changed during the send

**File:** `src/main/telegram/AddExecutor.ts:719-731`
**Issue:** The generation guard runs **after** `_sendDm` resolves but **before** `appendBlock`. If the admin clicks "Add someone else" (TARGET_RESET → `abortExecution`, generation++) while the retry DM is in flight, which can last a full FLOOD_WAIT inside `governor.run`, the message is delivered but the D-12 add-log entry (title, timestamp, link) is never written. The add log is the admin's durable record of which links were sent. Dropping an entry for a message that really went out is an audit-trail gap. The generation guard should protect *state emission*, not an append-only record of a side effect that already happened.
**Fix:** Append the log block before the generation guard (only when `dm === 'sent' || dm === 'refused'` after a real attempt), then guard the state writes:
```ts
this._addLogStore.appendBlock({ ... })
if (gen !== this._generation) return
```

### WR-04: Concurrent retry and stopped-band Resume discard a real retry outcome

**File:** `src/main/telegram/AddExecutor.ts:654-687`, `src/renderer/groups/GroupsPane.tsx:638-690`
**Issue:** D-11 adds a Resume button to the stopped band, the same band whose rows offer retry. If the admin clicks retry on a failed row and then Resume while the retry's `_addToGroup` is still awaiting, `execute()` bumps the generation. The retry's post-await guard then drops the outcome. The failed row is not reprocessed by the continuation because `'failed'` outcomes count as finished. If Telegram actually added the user, the row stays `failed` on disk and in the UI, and a privacy-blocked link from the retry is lost before it is checkpointed. Both Telegram calls also overlap; the governor serializes them, but ordering is no longer "strictly sequential per run".
**Fix:** Disable row retry while `resumeState === 'inflight'`, and disable Resume while any retry is in flight. In main, reject `ADD_START` while a `retryGroup` is in flight (track `_retryInFlight`).

### WR-05: TARGET_RESOLVE / TARGET_RESOLVE_CANDIDATE lock is check-then-await (TOCTOU); an in-flight lookup lands after the job starts

**File:** `src/main/ipc/targetChannels.ts:90-95`, `src/main/ipc/searchChannels.ts:113-125`
**Issue:** The lock is only checked before `await resolver.resolve(...)` / `resolveByCandidate(...)`. A resolve can take a long time (the governor absorbs FLOOD_WAIT up to the threshold). If an add job starts meanwhile, for example through a relaunch Resume, the resolve still completes and puts B into the resolver while job A runs. This is not a wrong-person add: `execute` already captured A, `retryGroup` refuses on the mismatch, and `checkResumeIdentity` rejects. But job A then silently loses retry and Resume ("resumeFailedBand") until the admin leaves the job, and the left pane holds a resolved B the admin can't confirm or clear.
**Fix:** Re-check after the await and roll the resolver back:
```ts
await resolver.resolve(parsed.input)
if (addIsActive()) { resolver.reset(); }
return resolver.getState()
```
Or have `AddExecutor.execute` call `resolver.abort()` / bump the resolver generation when a relaunch-resume starts with a null resolver.

### WR-06: `resumeState` is never reset between jobs or state transitions, so a stale "Couldn't resume" error carries over

**File:** `src/renderer/groups/GroupsPane.tsx:95-100`, `:225-229`, `:264-268`
**Issue:** `resumeState` is component-local and only changes inside `handleResumeAdd`. After a failed Resume (`'failed'`), the error persists across "Add someone else" → new target → new job. If job B later hard-stops, the PEER_FLOOD banner immediately shows `resumeFailedBand` for a Resume nobody has attempted. The same happens for `complete → stopped` transitions within a session.
**Fix:**
```ts
useEffect(() => { setResumeState('idle') }, [add.step === 'idle', add.targetId])
```
Or reset on every `add.step` change that isn't the in-flight transition.

## Info

### IN-01: Dead `'no-groups'` branch in the checklist/scan-complete empty state

**File:** `src/renderer/groups/GroupsPane.tsx:158-165` vs `:351-358`
**Issue:** The new early return at 158 already handles `checklist && add && loaded && allDialogs.length === 0`, so the `addEmpty === 'no-groups'` branch inside `scan.step === 'complete'` can't be reached. The markup is duplicated.
**Fix:** Keep one branch. Extract a `renderNoGroups()` helper.

### IN-02: Unused i18n key `rowStatus.retryDmSending` (en + cs)

**File:** `src/renderer/i18n/locales/en/add.json`, `src/renderer/i18n/locales/cs/add.json`
**Issue:** No "sending" state exists in `AddGroupOutcome.retryDmStatus` ('sent' | 'refused'), and no component references the key. The row therefore shows nothing while the retry DM is in flight. D-12's "a refused DM is reported on the row" is met, but there is no in-progress feedback.
**Fix:** Remove the key, or add a transient `'sending'` state emitted before `_sendDm` and render it.

### IN-03: `getState` is optional on the `addExecutor` structural type, so the lock can silently turn off

**File:** `src/main/ipc/targetChannels.ts:77-87`
**Issue:** `addExecutor?: { abortExecution(): void; getState?(): { step: string } }`. If a caller passes an object without `getState`, `addIsActive()` returns false and the D-05 lock disappears with no type error. The same applies to `getAddStep?` in `registerSearchChannels`.
**Fix:** Make `getState` required on the type (main/index.ts already passes the real executor), and make `getAddStep` a required parameter.

### IN-04: Type-unsafe cast and misleading add-log status in the retry tail

**File:** `src/main/telegram/AddExecutor.ts:411`, `:706-731`
**Issue:** `({ bannedDialogIds: persistedBanned } as AddJobFile)` casts a partial object to the full job type just to reuse `_effectiveScanStatus`. Narrow the parameter to `{ bannedDialogIds?: string[] } | null` instead. Separately, a PEER_FLOOD during the retry DM is written to the add log as `dmStatus: 'refused'`. That reads as a privacy refusal, not an account hard-stop.
**Fix:** Change the helper signature. Log the hard-stop distinctly (or skip the log block for hard-stop and rely on the hard-stopped state).

### IN-05: The integration test's fake audit store diverges from the real store (no checkpoint dedup)

**File:** `src/main/telegram/addResume.ipc.integration.test.ts:66-68`
**Issue:** `checkpoint` appends instead of replacing by `dialogId`, unlike the real `addAuditStore` (CR-01 dedup). A test exercising retry or resume on the same dialog would see duplicate outcomes that production never produces, which can mask or invent failures. D-14 also asked for coverage through the *store logic*. The test drives the main IPC handlers well, but the renderer `resumeJobFromDisk` / `startAdd` boolean path (which CR-01 shows is mishandled in ReviewScreen) is not exercised.
**Fix:** Use `createAddAuditStore({ fs: fakeFs, app: fakeApp })`, or mirror the dedup. Add a renderer test asserting ReviewScreen doesn't navigate when `startAdd` returns false.

---

_Reviewed: 2026-10-24T20:38:45Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Orchestrator fix direction (2026-10-24)

**CR-01: use an explicit resume channel instead of the same-set heuristic.**
- Add a main-owned `ADD_RESUME` IPC channel with no payload: whitelist it, bridge it in preload, add it to the add client.
- `ADD_RESUME` reads the on-disk job (`auditStore.readJob()`) and continues it with the job's full `dialogIds`. Identity comes only from the job file or a matching resolver, never from the renderer (T-05-04-B / T-14-16 still hold).
- `ADD_RESUME` rejects, returning `executor.getState()` with no `execute`, no `initJob` and no RPC, when:
  - there is no non-complete job, or
  - the live resolver holds a user whose id differs from `job.targetId`.
- `ADD_START` always means "start what the admin reviewed":
  - a non-complete job with the same `targetId` and the same dialog-id set continues it (the existing continuation gate);
  - otherwise it starts a fresh job;
  - it never treats a different identity as a resume;
  - it still rejects while the executor is non-idle with a different identity (live in-memory job).
- Remove the idle + mismatch + same-set rejection from `checkResumeIdentity` and `execute()`. Keep the non-idle rejection.
- Callers move to the new channel:
  - `AddResumeJobDialog.handleResume` and `addStore.resumeJobFromDisk` (stopped band and PEER_FLOOD banner) call `ADD_RESUME`;
  - `ReviewScreen` keeps `ADD_START`.
- `ReviewScreen.handleConfirm` must check the `startAdd` boolean. On false it shows an inline error, stays on review, and does not add to contacts or advance the stage.
- Update the tests:
  - integration Test 6: relaunch, B confirmed, then `ADD_RESUME` is rejected;
  - a new case: B confirmed plus `ADD_START` with A's exact set starts fresh for B, as D-07 says.

**CR-02: give the user a way out.**
- In the job view, every add band state shows the existing `add.addSomeoneElse` button (`targetActions.resetTarget()` followed by navigating to the target screen): hard-stopped (PEER_FLOOD banner), stopped, and complete. Running and stopping keep only Stop.
- This makes the locked-input hint accurate.

**WR-01..WR-06:** fix them as suggested.
- WR-01: skip rows with `retryDmStatus === 'sent'` in the end-of-run DM.
- WR-02: bump the generation in `_hardStopRetry`, and re-read the job status after the await before `setStatus`.
- WR-03: append the add-log block before the generation check returns, as soon as the DM has been sent.
- WR-04 and WR-05: guard as you see fit. For WR-05, re-check the add step after `resolver.resolve` and reset if a job started meanwhile.
- WR-06: reset the resume-failed state on any add step change.

**Info items:** fix IN-01, IN-03 and IN-04 if cheap. Wire or remove `retryDmSending` (IN-02). Cover the `startAdd`-false path with a test (IN-05).

Typecheck with `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json` only. Known env-dependent failure: `src/main/telegram/config.test.ts`.
