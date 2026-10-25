# Phase 17: Close gap: ADD-08/ADD-12 — relaunch-resume UI visibility and target-identity lock - Research

**Researched:** 2026-10-24
**Domain:** Electron main/renderer split — IPC guards, job-file persistence, React pane derivation (internal codebase; no new libraries)
**Confidence:** HIGH (all findings come from reading the current source; no external library research was needed)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Relaunch run view (F1)**
- **D-01:** **Band + job card.** While add is non-idle and no target is confirmed (the relaunch path), the groups pane shows (a) the Add progress/Stop/PEER_FLOOD/report band and (b) a compact read-only target card built from the job: `add.targetName` and a placeholder initial. No avatar and no extra Telegram call. All Add band labels (progress, DM status lines) use `add.targetName`, not the renderer's confirmed-target name. This also applies to the in-session path, where the names are the same.
- **D-02:** **Mode is forced to Add and the switch is locked.** On a relaunch Resume the active mode becomes `'add'`, and Remove/Tag are disabled for as long as the add job is non-idle (running, stopping, hard-stopped, stopped or complete with its report shown). The lock ends when the admin leaves the job (D-08).
- **D-03:** **Only the job's groups are listed.** During a relaunch-resumed run the list shows only the job's `dialogIds`, with queued/adding/outcome statuses. No checkboxes, and no live-scan-dependent rendering, because there is no scan for this target.
- **D-04:** The `GroupsPane` mode derivation (`targetState.target.step === 'confirmed' ? 'checklist' : 'browse'`, GroupsPane.tsx:95) must not hide the Add slot. The Add slot and report band render whenever `add.step !== 'idle'`, whatever the target state. The scan auto-start/abort effects must not fire against the job view.

**Identity lock (F2)**
- **D-05:** **Target lookup is blocked in the UI and in main while add is non-idle.** The renderer hides or disables the target input. Main rejects `TARGET_RESOLVE` and `TARGET_CONFIRM` while the AddExecutor state is non-idle and returns the unchanged state or an error, never resolving. `TARGET_RESET` still aborts and clears, as it does today (T-14-19). This is the only way out of a job.
- **D-06:** **`retryGroup` uses the job's target only.** It uses `this._resolvedTarget` (rebuilt from `add-job.json` on relaunch) and drops the `this._resolver.getResolvedUser() ??` preference (AddExecutor.ts:592). If the live resolver holds a user whose id differs from the job's `targetId`, the retry is refused (no-op or failed state, never a Telegram call).
- **D-07:** **A mismatched Resume is rejected and the job is kept.** If `resume` would be true but the confirmed resolver target's id doesn't equal the job's `targetId`, ADD_START/`execute` rejects the request. The job file stays untouched, nothing is sent to Telegram, and the resume dialog shows its existing `resumeFailed` message. A mismatched resume must never fall through to `initJob()` as a fresh job for the other person. The same rule applies to the PEER_FLOOD banner's `resumeJobFromDisk`.

**Leaving the resumed job**
- **D-08:** **Retry stays available on a relaunch-resumed report.** Failed rows offer retry as they do in-session, and the retry uses the job target (D-06).
- **D-09:** **The exit works as it does today.** "Add someone else" calls `targetActions.resetTarget()`, which aborts and clears add state, unlocks the mode switch and target input, and navigates to the target screen. The job file stays as the record. No new "Done" button.

**Folded findings**
- **D-10 (F3): Unban-first survives a relaunch.** Each group's banned status at job creation is persisted in `add-job.json` (main-only, like the access hash). Resume and retry use it when there's no live scan result, so a banned target is unbanned before the invite instead of failing `ADD_USER_KICKED`. Older job files without the field behave as they do today.
- **D-11 (F4): In-session Resume after a user Stop.** The stopped summary band gets a "Resume" button. It continues the same job with the full dialog-id set, reprocesses skipped rows, and uses the same path as the PEER_FLOOD banner's Resume (`resumeJobFromDisk`). The `pendingJob` that is read only on the first store subscribe must not be the only source; re-read the job after a stop.
- **D-12 (F5): A retry that ends privacy-blocked logs and DMs its link.** The new link is appended to the add log (title, timestamp, link) and sent at once as a short DM using the saved template (or the default in the current language) containing only that link. The retry was an explicit admin action, so there's no extra confirmation. A refused DM is reported on the row. PEER_FLOOD hard-stop handling stays as it is (WR-01/CR-03).
- **D-13 (F6): The first-launch DM language matches the preview.** On a first launch with no saved language preference, main's language cache must resolve to the same language the renderer's i18n picked from the OS (e.g. `cs` on a Czech OS), so the previewed default DM and the sent default DM are byte-identical.
- **D-14 (tech debt):**
  - Zero dialogs in checklist mode shows a message instead of a blank list (`getAddEmptyState` returns `'none'` today).
  - Fix the stale inverted-polarity docblock at `MembershipScanner.ts:233` (comment only).
  - Update `16-VERIFICATION.md` status (UAT 3/3 passed) and the `16-VALIDATION.md` draft/nyquist status where justified.
  - Add a relaunch-resume test that goes through the ADD_START IPC resume computation and store logic, not `executor.execute({resume:true})` directly. It must cover F1 (band visible, Stop works) and F2 (mismatched resolver identity is rejected).
  - Optional, if cheap: dialogs added by a refresh after the scan are no longer silently excluded from Review; dead `DmTextProvider` / `wizardStage` ADD_* consumers are removed or wired. These two items may be deferred if they grow.

### Claude's Discretion
- Exact rendering of the job card (reuse `TargetCard` in a read-only variant vs a small new component) and the placeholder-initial style.
- Whether the target-lookup block in main returns the unchanged state or throws a typed error, as long as the renderer surfaces nothing misleading.
- Field name and shape for the persisted banned flag in `add-job.json` (D-10).
- Exact en/cs copy for any new strings (Resume on the stopped band, zero-dialogs message, retry DM row status). Czech uses formal vykání; the user reviews at UAT.
- How main learns the renderer's OS-derived language on first launch (D-13): renderer pushes it, or main uses the same detection, as long as the two agree.

### Deferred Ideas (OUT OF SCOPE)
None. Discussion stayed within phase scope, and all non-critical audit findings were folded in.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADD-08 | Stop/resume of an add run, including after relaunch | Findings 1–3 (job view in GroupsPane/AppShell), Finding 9 (F4 Resume button on stopped band), Finding 5 (F3 banned flag), Validation map |
| ADD-12 | Target identity confirmed against the review; no wrong-identity add | Findings 4–6 (main guards in targetChannels/searchChannels/execute/retryGroup/addChannels), Open Question 1 (D-07 regression risk) |
</phase_requirements>

## Summary

This phase is an internal gap closure. Nothing needs a new library. All work is guards and plumbing across five existing seams: (1) renderer pane derivation (`GroupsPane`, `AppShell`, `ModeSwitch`, `TargetInput`), (2) main IPC guards (`targetChannels`, `searchChannels`, `addChannels`), (3) `AddExecutor` (`execute`, `retryGroup`, DM and log writers), (4) the on-disk job schema (`AddJobFile` plus its Zod schema), and (5) the language cache.

The two root causes are confirmed in source. F1: `GroupsPane` derives `mode` only from the renderer's confirmed target (`GroupsPane.tsx:95`), and `renderProgressSlot` returns null unless `mode === 'checklist'` (`:352`). F2 has three holes, not two: `retryGroup` prefers the live resolver (`AddExecutor.ts:592`), `TARGET_RESOLVE`/`TARGET_CONFIRM` are unguarded, and `execute()` silently starts a fresh job for the resolver's target when a non-complete job for a different target exists (`isContinuation` is false, so the `initJob()` branch runs).

A third resolve path is not named in CONTEXT.md: `TARGET_RESOLVE_CANDIDATE` in `searchChannels.ts:104-122` calls `resolver.resolveByCandidate()`. It must get the same non-idle guard as D-05, or the lock is bypassable via name search. Separately, applying D-07 literally would make it impossible to start a run for person B after a stopped/hard-stopped job A is left on disk (see Open Question 1). That needs a decision before planning.

**Primary recommendation:** Add a pure view-model helper in the renderer (`add.step !== 'idle' && no confirmed target` means job view), and put every identity guard in main, keyed on `AddExecutor.getState().step !== 'idle'` plus an id comparison against the job's `targetId`. Persist `bannedDialogIds` in `add-job.json` and add it to the Zod schema. A field missing from the schema is silently stripped by `readJob()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Identity lock (reject resolve/confirm/candidate while add non-idle) | Main (IPC handlers) | Renderer (hide input, UX only) | Identity never crosses the bridge (T-05-04-B); renderer gating is UX, main is the authority |
| Resume-vs-fresh and mismatch rejection | Main (`addChannels` + `AddExecutor.execute`) | — | T-14-16: resume intent is computed in main from the job file |
| `retryGroup` uses job target only | Main (`AddExecutor`) | — | Target access hash is main-only |
| Banned flag persistence | Main (`addAuditStore` + job file) | — | Same boundary as `targetAccessHash` |
| Job view (band, job card, rows) | Renderer (`GroupsPane`, new job card) | AppShell (mode/stage) | Pure presentation of main-pushed `AddState` |
| Stopped-band Resume | Renderer (`addActions.resumeJobFromDisk`) | Main (`ADD_START` computes resume) | The renderer sends only dialogIds; main decides resume |
| Retry privacy-block log + DM | Main (`AddExecutor`) | Renderer (row status copy) | The DM and log are side effects with the admin's account |
| First-launch DM language | Main (language cache) | Renderer (pushes detected language) | Main renders the default DM template; the renderer owns OS detection |

## Standard Stack

No new dependencies. Everything is the existing stack. [VERIFIED: package.json + source reading]

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Vitest | ^4.1.8 | Test runner (`environment: 'node'`, no jsdom, no RTL) | `globals: false`; includes `src/**/*.test.ts(x)` |
| react-dom/server `renderToStaticMarkup` | bundled | Renderer component tests | Pattern in `TargetCard.test.tsx`; `initI18n` not called so `t()` returns raw keys |
| zod | existing | IPC payload and job-file validation | New channel payloads and new job fields need schema entries |
| i18next / react-i18next | existing | en/cs namespaces (`add`, `groups`) | Czech uses formal vykání |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed or recommended in this phase. slopcheck was not run because there is nothing to check.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
RELAUNCH PATH (F1/F2 target flow)

 app start -> main: add-job.json (status != complete) ---> renderer addStore.pendingJob
                                                              |
                                                  AddResumeJobDialog [Resume]
                                                              | addActions.startAdd(FULL dialogIds)
                                                              v
 ADD_START (addChannels): zod -> auth -> double-start guard -> enumerator loaded + known ids
        -> resume = job non-complete  [Phase 17: + identity compatibility, see OQ-1]
        -> executor.execute({dialogIds, resume})
                |  resolver null -> rebuild _resolvedTarget from job (targetId/accessHash)
                |  resolver non-null and id != job.targetId -> REJECT (early idle, job untouched, zero RPC)
                v
 AddExecutor loop --emit AddState (targetName, dialogIds, outcomes)--> ADD_STATE push
                                                              |
 renderer addStore.state <---------------------------------------+
        |
        v
 AppShell: setMode('add') + setStage('run'); effect: add.step!=='idle' -> force mode 'add'
        |   left pane: add non-idle -> hide TargetInput; job card (add.targetName) if no confirmed target
        v
 GroupsPane: view = jobView if (add.step!=='idle' && target not confirmed)
        |   renderProgressSlot -> a-add / b-add / c-add bands (labels from add.targetName)
        |   rows = groups.dialogs ∩ add.dialogIds, addStatus per row, no scan, no checkboxes
        |   ModeSwitch disabled while add.step !== 'idle'

IDENTITY LOCK (main)
 TARGET_RESOLVE / TARGET_CONFIRM / TARGET_RESOLVE_CANDIDATE
        -> addExecutor.getState().step !== 'idle' ? return resolver.getState() (no-op) : proceed
 TARGET_RESET -> abort add (unchanged) -> state idle -> lock released (only exit, D-09)
 ADD_RETRY_GROUP -> retryGroup: target = _resolvedTarget ONLY; live resolver id != job id -> no-op
```

### Recommended Project Structure (touch list)

```
src/main/ipc/targetChannels.ts      # guard RESOLVE/CONFIRM (structural addExecutor type gains getState)
src/main/ipc/searchChannels.ts      # guard TARGET_RESOLVE_CANDIDATE (new optional param)
src/main/ipc/addChannels.ts         # resume computation + mismatch handling
src/main/ipc/languageChannels.ts    # detected-language slot + effective-language getter
src/main/telegram/AddExecutor.ts    # execute mismatch reject, retryGroup, banned flag, retry DM+log, _sendDm helper
src/main/storage/addAuditStore.ts   # Zod: bannedDialogIds?, outcome dm field
src/shared/addTypes.ts              # AddJobFile.bannedDialogIds?, AddGroupOutcome DM-refused field
src/shared/channels.ts + preload    # new LANGUAGE detected channel (whitelisted)
src/renderer/groups/GroupsPane.tsx  # job view, labels, Resume button, row filter
src/renderer/groups/addPaneState.ts # getAddEmptyState 'no-groups'; new pure view helper (or addJobView.ts)
src/renderer/shell/AppShell.tsx     # force mode 'add', hide TargetInput, job card
src/renderer/main.tsx               # push detected language
src/renderer/i18n/locales/{en,cs}/{add,groups}.json
```

### Pattern 1: Pure view-model helper, test it without a DOM
**What:** Put the "is this the job view?" rule in a pure function (as `addPaneState.ts` already does) and test it directly. There is no jsdom or RTL in this repo. `GroupsPane` has no test today.
**Example:**
```typescript
// Source: pattern of src/renderer/groups/addPaneState.ts (project code)
export type PaneView = 'browse' | 'checklist' | 'job'
export function getPaneView(addStep: string, targetStep: string): PaneView {
  if (addStep !== 'idle' && targetStep !== 'confirmed') return 'job'
  return targetStep === 'confirmed' ? 'checklist' : 'browse'
}
```
`renderProgressSlot` becomes `if (view === 'browse') return null`. The scan effects key on `mode === 'checklist'` and `mode === 'browse'`, so a third `'job'` value fires neither (D-04). The abort-scan effect (`mode === 'browse'`) must not run for `'job'`.

### Pattern 2: Structural-type injection for guards
`registerTargetChannels(..., addExecutor?: { abortExecution(): void })` becomes `{ abortExecution(): void; getState(): { step: string } }`. Add the same optional param to `registerSearchChannels`. Existing tests pass `addExecutor` objects with only `abortExecution`, so keep the new member optional-tolerant (`addExecutor?.getState?.()`), or update the tests.

### Pattern 3: Generation-guarded async (existing)
New awaits in `retryGroup` (the DM send) must capture `gen` before the await and re-check after, as the existing code does. Never touch `_runActive` or `_resolvedTarget` from the retry tail.

### Anti-Patterns to Avoid
- **Renderer-only identity gating.** The renderer may hide the input, but main must reject. The target input is not the only caller of the IPC.
- **Applying D-07 as "any resume-with-mismatch is rejected" without checking the leftover-job flow.** See Open Question 1.
- **Adding job-file fields without the Zod schema.** `AddJobFileSchema` is a `z.object` and strips unknown keys on `readJob()`. A field written by `initJob()` appears to work in-process (`_currentJob` is kept in memory) and vanishes after relaunch. The same applies to any new field on `AddGroupOutcomeSchema`.
- **Relying on `pendingJob` for the Resume button.** `addActions.resumeJobFromDisk()` already re-reads via `addClient.getAddJob()`. The F4 button only has to call it (D-11). `pendingJob` only drives the launch dialog.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resume from stopped band | A new resume path | `addActions.resumeJobFromDisk()` (and `getResumeDialogIds`) | Already re-reads the job and sends the FULL dialog set; the PEER_FLOOD banner uses it |
| Add-log entry for a retry link | A new log writer | `addLogStore.appendBlock({ isFollowUp: true, linkedDialogs: [one], addedDialogs: [], ... })` | Already formats title, link, timestamp and the CONTINUATION header |
| Retry DM body | A new template renderer | `this._getDmText({ name, links: link })` | Already handles saved vs default template and language |
| DM send and refusal classification | A second copy of the SendMessage/catch block | Extract the existing end-of-run block (AddExecutor.ts ~:440-465) into a private `_sendDm()` returning `'sent' \| 'refused'` and rethrowing hard-stops | Refusal codes (`USER_PRIVACY_RESTRICTED`, `USER_IS_BLOCKED`, `YOU_BLOCKED_USER`, `PRIVACY_PREMIUM_REQUIRED`) and the CR-02/hard-stop handling must stay identical |
| Set comparison of dialog ids | New helper | `sameDialogIdSet` (addAuditStore.ts) | Exists and is tested |
| Job card initial | New avatar fetch | `getInitials` logic from TargetCard (copy or export it) | D-01 forbids an avatar or extra Telegram call |

**Key insight:** every behavior this phase needs already exists in a neighbouring code path. The risk is in the glue (schema stripping, guard placement, effect triggers), not in new capability.

## Common Pitfalls

### Pitfall 1: Zod strips the new fields (F3 and F5)
**What goes wrong:** `bannedDialogIds` (or a per-outcome DM-refused flag) is written but `readJob()` drops it after relaunch, so unban-first silently doesn't work and no test using the in-memory fake store notices.
**Why:** `AddJobFileSchema` / `AddGroupOutcomeSchema` are non-passthrough `z.object`s (addAuditStore.ts:117-139).
**Avoid:** Add `.optional()` fields to both schemas and the shared types. Add a real-store round-trip test (`createAddAuditStore` with an injected fake fs, as in `addAuditStore.test.ts`): write with the field, `readJob()`, assert present. Assert an old file without the field still parses.
**Warning signs:** the F3 test passes only against `makeAuditStore` fakes.

### Pitfall 2: The retry DM tail can mask the outcome
**What goes wrong:** `retryGroup` currently checkpoints the new outcome and emits at the end. If the DM throws a PEER_FLOOD after the link was created, and the code bails to `_hardStopRetry` before checkpointing, the freshly exported link is lost (never in the job, log, or UI).
**Avoid:** Order inside `retryGroup`: (1) get `newOutcome`, (2) generation/step guards, (3) checkpoint outcome, (4) write the add-log entry (link persisted), (5) then the DM. On a DM hard-stop call `_hardStopRetry` (existing WR-01) after the log write. On a DM refusal, record it on the outcome (new optional field) and re-checkpoint and emit. Keep CR-03: a hard-stop must never continue to another call.

### Pitfall 3: `_emitEarlyIdle` and `abortExecution` reset executor bookkeeping
Rejecting a mismatched execute via `_emitEarlyIdle()` clears `_resolvedTarget` and `_jobDialogIds`. That is correct for an idle executor. But if the rejection path were reachable while the executor shows a live stopped/hard-stopped job (band visible), it would wipe the job view. Reject in `addChannels` (return `executor.getState()` unchanged) before `execute()` for that case, and keep `execute()`'s own check as defense in depth.

### Pitfall 4: Stale scan results used on the job path
`execute()` and `retryGroup()` read `this._scanner.getState().results`. On the relaunch path they are empty (fine). If the scanner holds results for another target, `scanStatusFor(...) === 'member'` would skip a group with zero API calls on the wrong evidence. The identity guards prevent this, but the F3 helper must be `liveScan ?? persistedBanned` and only for the job's own target.

### Pitfall 5: Mode-lock gap in `ModeSwitch`
The current `disabled` is `scan.step === 'scanning' || isRunActive || stage === 'run' || stage === 'report'`. `isRunActive` covers only running/stopping. Add `|| add.step !== 'idle'`. Also add an AppShell effect that forces `mode = 'add'` when `add.step !== 'idle'`. Mode-forced rendering in `GroupsPane` should also use `add.step !== 'idle' ? 'add' : activeMode` so the band shows on the first render before the effect runs.

### Pitfall 6: TargetInput stays mounted and is the only "target lookup" UI
AppShell always renders `<TargetInput />` in the left pane. Hide (not just disable) it while `add.step !== 'idle'`. Also render nothing from `CandidateList` then. In-session (a confirmed target exists) keep `TargetCard`; with no confirmed target show the job card.

### Pitfall 7: Compiled-artifact trap (project memory)
`npx tsc --build` emits `.js`/`.d.ts` beside sources and Vitest then runs stale code. Typecheck with `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json` (no emission). Root `tsc --noEmit` checks nothing. If `--build` is ever used, delete artifacts with the command in the memory note before running tests. [CITED: MEMORY tsc-noop-pitfall]

### Pitfall 8: Queued rows render a disabled checked checkbox
`GroupRow`'s `addStatus === 'queued'` branch still renders a disabled, checked `Checkbox`. D-03 says "no checkboxes". The user most likely means no selection checkboxes. Treat the existing disabled queued checkbox as acceptable (it is the same visual as in-session queued rows), and don't pass `isChecked` or `onToggle` in the job view.

## Findings by Decision (what the planner needs to know)

### F1 / D-01..D-04 — renderer job view
- `GroupsPane.tsx:95` `mode` derivation; `:352` `if (mode !== 'checklist') return null` in `renderProgressSlot`; Add branches a/b/c at ~:470-650; scan effects at :98-115; `displayedDialogs` at :140-175; `ModeSwitch disabled` at ~:808.
- `targetName` (from the confirmed target, :128) is used in the a-add progress label and the c-add `dmStatusSent`/`dmStatusRefused` lines. Replace with `add.targetName || targetName` (D-01). Retry copy has no name.
- In job view, `displayedDialogs = allDialogs.filter(d => add.dialogIds?.includes(d.id))` sorted by existing `sortDialogs`. Use `getAddStatus` unchanged (it already returns null for rows outside the job via `isAddStatusInJob`).
- Do not render the empty-state or "failed rows summary" blocks in job view. `renderEmptyState()` checklist branch needs `scan.step === 'complete'`, so it is safe, but the `browse` branch's loading and noGroups messages must not appear for `'job'`.
- Toolbar in job view: no filter input, no Change-target button (the c-add band's "Add someone else" is the exit, D-09), no run-trigger button (it requires `mode === 'checklist'`). Keep ModeSwitch (locked), sort, and refresh (already disabled while running; consider disabling whenever add is non-idle).
- AppShell `onResume` already does `setMode('add'); setStage('run')`; run to report auto-advance is gated on `mode === 'add'` and works. The stage-`report` ModeSwitch disable also already exists.

### F2 / D-05..D-07 — main guards
- `targetChannels.ts:83-93`: both handlers are three-liners. Guard: `if (addExecutor && addExecutor.getState().step !== 'idle') return resolver.getState()`. Returning unchanged state is renderer-safe: `targetActions.resolveTarget` just `setState({target: s})` with the same state.
- `searchChannels.ts:104-122` (`TARGET_RESOLVE_CANDIDATE`) is an additional bypass. Guard it identically (`registerSearchChannels(win, searcher, resolver)` gets an optional 4th arg, wired in `main/index.ts:306`, where `addExecutor` is constructed later at ~:381, so reorder, or pass a lazy getter `() => addExecutorRef`).
- `main/index.ts` wiring: `registerSearchChannels` (:306) runs before `addExecutor` exists. Either move the call after the AddExecutor wiring or pass `() => addExecutorRef?.getState().step`. `registerTargetChannels` (:448) already runs after.
- `TARGET_ADD_CONTACT` uses `resolver`; not an identity-change path, no guard needed (returns `{ok:false}` when there is no resolved target).
- `retryGroup` (AddExecutor.ts:592): replace with `const resolved = this._resolvedTarget; if (resolved === null) return`, then refuse if `live = this._resolver.getResolvedUser()` exists and `live.id !== resolved.id`. Belt-and-braces: also compare `resolved.id.toString()` to `this._auditStore.readJob()?.targetId`. Note `_resolvedTarget` is assigned in `execute()` from the resolver (in-session) or rebuilt from the job (relaunch), so in-session behavior is unchanged.
- `execute()` (AddExecutor.ts:205-235 and :310-340): today `resolved = resolver ?? rebuilt-from-job`. If `resume === true`, a non-complete `existing` job exists, and the resolver user's id differs from `existing.targetId`, then `isContinuation` is false and the code takes the `initJob()` branch (the F2 fresh-job hole). Add an explicit early check that rejects before any `initJob`/RPC.
- `addChannels.ts:136-180`: `resume = existingJob !== null && existingJob.status !== 'complete'`. This module has no resolver; the identity comparison must be exposed via the executor (e.g. add `AddExecutorLike.canResume(...)` or let `execute` return/emit idle and have the handler detect `getState().step === 'idle'` afterward). `startAdd` in the store already treats an idle returned state as "not started" (keeps `pendingJob`, dialog shows `resumeFailed`). The `AddExecutorLike` mock in `addChannels.test.ts` will need the new member.

### F3 / D-10 — persisted banned flag
- Suggested shape: `bannedDialogIds?: string[]` on `AddJobFile` (main-only; strip it in `ADD_GET_JOB` along with `targetAccessHash`, or leave it since it is non-secret group ids — recommend stripping for symmetry with "main-only"; if stripped, `AddJobFileSafe = Omit<AddJobFile, 'targetAccessHash' | 'bannedDialogIds'>`).
- Written once at fresh-job `initJob()` (AddExecutor.ts ~:322-338): `scanResults.filter(r => r.status === 'banned' && params.dialogIds.includes(r.dialogId)).map(r => r.dialogId)`. Preserve from `existing` on continuation. (`checkpoint`/`setStatus` spread `_currentJob`, so the field survives.)
- Effective status for `_addToGroup`: `scanStatusFor(id) ?? (job.bannedDialogIds?.includes(id) ? 'banned' : undefined)`. A live scan result (for example `not-member` after an unban or rescan) must win over the persisted flag. The unban call is `EditBanned` with empty rights and is harmless if repeated on an already-unbanned user, so a stale flag is safe. In `retryGroup` read the job via `this._auditStore.readJob()`.
- The preflight (deleted/bot) `initJob` path needn't carry the field.

### F4 / D-11 — stopped-band Resume
- c-add band already switches on `add.step === 'stopped'` (summaryStopped line). Add `<Button onClick={() => void addActions.resumeJobFromDisk()}>` for `stopped`. New `add` copy key (e.g. `resumeStoppedLabel`; can reuse `peerFloodResumeLabel` text "Resume adding" in en, "Pokračovat v přidávání" in cs, to avoid new strings).
- `resumeJobFromDisk()` returns silently when the job is complete or `isJobFinished`. Surface nothing misleading: for a stopped job with skipped rows `isJobFinished` is false, so it proceeds. If `startAdd` returns false (main rejected), consider a small inline `resumeFailed` message; at minimum no crash.
- In-session `execute()` resume works because the resolver target equals the job's target, so `isContinuation` is true. Stage stays `report`; this matches the existing PEER_FLOOD Resume behavior. Planner: confirm at UAT that the report stage indicator is acceptable after Resume, or have AppShell move `report -> run` when `add.step` becomes running (small extra effect; same gap exists for the PEER_FLOOD banner today).

### F5 / D-12 — retry privacy-blocked link
- After `newOutcome.status === 'privacy-blocked' && newOutcome.link`: `appendBlock({ jobId: job.jobId, isFollowUp: true, targetId, targetName, addedDialogs: [], linkedDialogs: [{dialogId, title, link}], dmStatus, timestamp })`. Titles from `groupsState.dialogs`. `dmStatus` in the log must be `'sent' | 'refused'` (the type excludes `'pending'`), so write the block after the DM result is known, but persist the outcome (checkpoint) before the DM (Pitfall 2). If the order forces a block before the DM result, write after the DM and accept a hard-stop edge: on hard-stop write the block with `'refused'`.
- DM text: `this._getDmText({ name: targetName, links: newOutcome.link })`, sent through the same `SendMessage` + `_governor.run` code as the end-of-run DM (extract `_sendDm`).
- "A refused DM is reported on the row": `AddGroupOutcome` has no field for this. Add an optional field (for example `dmRefused?: boolean`) to the shared type and to `AddGroupOutcomeSchema`, pass it through `GroupsPane` to `GroupRow`, and add an `add.rowStatus` line (en/cs, formal Czech). This is a GroupRow prop addition (`addDmRefused`).
- Job-level `dmStatus` (state and file): the end-of-run DM is "one per job" (Phase 14 D-13); the retry DM is a deliberate user-approved extra. Recommended: leave the end-of-run `dmStatus` semantics alone, except when the prior value was `'not-needed'`, set it to the retry result so the report band's DM line is truthful (`setStatus(currentStatus, undefined, dm)`). Flag for planner/UAT.
- A retry that ends `done` is not logged today (only privacy-blocked is in scope). Cheap optional extension: log it as `addedDialogs` using the same call (ADD-14 "one record per added user"). Not required by D-12.

### F6 / D-13 — first-launch DM language
- Cause: `main.tsx:19` picks `navigator.language.startsWith('cs')` when there is no stored language. Main's `getCachedLanguage()` is null then, and `main/index.ts:373` does `?? 'en'`.
- Recommended (guarantees agreement): a new non-persisted channel `language:setDetected` with a Zod `z.enum(['en','cs'])` payload; the renderer calls it right after `initI18n` (only needed when `storedLang` is null, harmless otherwise). Main keeps `_detectedLanguage` and exposes `getEffectiveLanguage()` = `_cachedLanguage ?? _detectedLanguage ?? 'en'`; `getDmText` uses it. Do not reuse `LANGUAGE_SET`: that persists a preference and changes the "unset means follow OS" semantics (Settings and `getLanguage()` null contract).
- Requires: channel constant in `channels.ts` (whitelist array at ~:150-170), preload bridge, `languageClient`, and a handler test. The DM is sent at the end of a run (long after boot), so the push-before-use race is not a concern; still, `getDmText` has the `'en'` fallback if the push never arrives.
- Alternative (main-only detection via `app.getLocale()`): works only if Chromium's `navigator.language` and `app.getLocale()` agree, which is [ASSUMED]; not recommended.

### D-14 tech debt
- `getAddEmptyState` (`addPaneState.ts:19-28`): `dialogs.length === 0` returns `'none'`. Add `'no-groups'` to `AddEmptyState` and render the existing `groups.emptyState.noGroups` heading/body in the checklist branch (`GroupsPane.renderEmptyState`, scan complete, `activeMode === 'add'`). Update `addPaneState.test.ts` (currently asserts `'none'` for zero dialogs, verify). Note the Remove/Tag checklist branch already shows the not-in-any message when there are no member rows, so only Add needs the new state.
- `MembershipScanner.ts:233` docblock says `left unset/false → 'banned'; left===true → 'not-member'`. The code (and the comment at ~:272) is the opposite: `left === true → 'banned'`, otherwise `'member'`. Rewrite the docblock bullet to match the code. Comment-only change.
- Housekeeping: `16-VERIFICATION.md` frontmatter `status: human_needed` (line 4) to `passed` (UAT 3/3 passed per audit); `16-VALIDATION.md` `status: draft`, `nyquist_compliant: false` (lines 4-5; checklist at ~:74): flip only items actually satisfied.
- Optional A (post-scan refresh excluded from Review): defer unless trivial. Optional B (`DmTextProvider` type at `addTypes.ts:206` and `wizardStage.ts` ADD_* events): removal touches `wizardStage.test.ts`; defer if it grows.

## Code Examples

### Main guard for target lookup
```typescript
// Source: project pattern — structural-type injection in registerTargetChannels
const addIsActive = (): boolean => addExecutor !== undefined && addExecutor.getState().step !== 'idle'

ipcMain.handle(TARGET_RESOLVE, async (_event, payload: unknown) => {
  const parsed = ResolveTargetSchema.parse(payload)   // validate first (V5)
  if (addIsActive()) return resolver.getState()        // D-05: never resolves while a job is live
  await resolver.resolve(parsed.input)
  return resolver.getState()
})
ipcMain.handle(TARGET_CONFIRM, () => {
  if (addIsActive()) return resolver.getState()
  resolver.confirm()
  return resolver.getState()
})
```

### `retryGroup` job-target-only
```typescript
// Source: AddExecutor.ts retryGroup, per D-06
const resolved = this._resolvedTarget
if (resolved === null) return
const live = this._resolver.getResolvedUser()
if (live !== null && live.id !== resolved.id) return                       // identity mismatch: no Telegram call
if (this._auditStore.readJob()?.targetId !== resolved.id.toString()) return // belt-and-braces
```

### Relaunch-resume IPC test skeleton (D-14)
```typescript
// Source: pattern of addChannels.test.ts (captured ipcMain handlers) + addResume.integration.test.ts
// Wire REAL registerAddChannels + registerTargetChannels + AddExecutor with a fake audit store
// seeded with a stopped job for target '99', resolver controlled by the test.
const startState = await capturedHandlers[ADD_START]({}, { dialogIds: getResumeDialogIds(seed) })
// F2: with a resolver user id '77' (!= job '99'): ADD_START must not call initJob, must not hit the client
// F2: TARGET_RESOLVE while add non-idle -> resolver.resolve not called
// F1/Stop: with resolver null, ADD_START resumes from the job; ADD_ABORT transitions running -> stopped
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Job view gated on renderer's confirmed target | Gate on `add.step !== 'idle'` and use `AddState` fields (`targetName`, `dialogIds`) | The only target-name source that exists after relaunch |
| Resolver preferred over job target in `retryGroup` | Job target only | Removes the wrong-identity retry |

No external library changes are relevant to this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Rejecting every `resume && mismatch` literally (D-07) would block starting a run for person B while a stopped/hard-stopped/crashed job A remains on disk after "Add someone else" (job file kept as the record, D-09) | Open Question 1 | If wrong, literal D-07 is fine; if right, admins hit a dead end until a relaunch and Discard |
| A2 | `navigator.language` and Electron `app.getLocale()` may differ, so a renderer push is safer than main-side detection | F6 | Low: the push approach is correct either way |
| A3 | Retry `done` outcomes (not only privacy-blocked) should be appended to the add log for ADD-14 completeness | F5 | Low: optional extension |
| A4 | Leaving the wizard stage at `report` after an in-session Resume is acceptable (same as the existing PEER_FLOOD Resume) | F4 | Low UX; a small AppShell effect fixes it |
| A5 | Stripping `bannedDialogIds` in `ADD_GET_JOB` is preferable (main-only) although the ids are non-secret | F3 | Low |

## Open Questions

1. **D-07 versus a leftover job on disk (needs a decision, possible discuss-phase confirmation)**
   - What we know: `addChannels` computes `resume = job non-complete`. After a user Stop, "Add someone else" calls TARGET_RESET: the executor goes idle and the job file stays (stopped). Resolving and reviewing person B then sends `ADD_START` with `resume = true`, `isContinuation` false, so `initJob()` overwrites job A. That is a legitimate path today: B was reviewed on the Review screen.
   - What's unclear: whether D-07's "never fall through to initJob()" is meant to cover this idle-executor case.
   - Recommendation: reject (return `executor.getState()` unchanged, job untouched) only when the mismatch is against a live in-memory job (executor step `stopped`/`hard-stopped`/`complete`, or the request is the resume of job A, for example `resumeJobFromDisk` / launch dialog while a resolver target of another person exists). When the executor is idle and the resolver holds a reviewed, different target, treat it as a fresh start for that target (`resume=false`), which preserves today's flow. D-05 makes the in-session mismatch unreachable anyway; the guard is defense in depth. If the user wants strict D-07, the plan must add an explicit "Discard previous job" affordance, or B can never be started. Surface this to the user before locking the plan.

2. **Where does the identity comparison live?**
   - `addChannels` has no resolver reference. Recommendation: expose a narrow executor method (for example `getResumeBlockReason()` or a `checkResumeIdentity()`), or let `execute` do the full check and have the handler test `getState().step === 'idle'` after dispatch. Pick one; the first is easier to unit test.

3. **Does the stopped-band Resume need a failure message?**
   - `startAdd` returns false on a main rejection. Recommendation: show the existing `add.resumeFailed` string inline in the band for that case (no new copy).

## Environment Availability

Step 2.6: SKIPPED (no external dependencies; code and config changes only; Node and Vitest are already in use: the audit reports 52 files / 667 tests passing).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8, `environment: 'node'`, `globals: false` |
| Config file | `/Users/igraczech/Repositories/MrProper/vitest.config.ts` (aliases `@shared`, `@main`, `@renderer`) |
| Quick run command | `npx vitest run <path/to/file.test.ts>` |
| Full suite command | `npx vitest run` (baseline: 52 files / 667 tests green) |
| Typecheck (non-emitting) | `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json` |
| Renderer component tests | `renderToStaticMarkup` (no jsdom, no RTL); i18n not initialised so `t()` returns raw keys; store hooks mocked via `vi.mock` or seeded through mocked clients |

Do not use bare `npx tsc --build` (Pitfall 7).

### Phase Requirements to Test Map

| Decision / Req | Behavior | Test Type | Automated Command | File Exists? |
|----------------|----------|-----------|-------------------|-------------|
| D-01/D-04 (ADD-08) | Job view derived when `add.step !== 'idle'` and target not confirmed; band renders Stop/progress/PEER_FLOOD/summary with `add.targetName` | unit (pure helper) + static render of GroupsPane with mocked store hooks | `npx vitest run src/renderer/groups/addPaneState.test.ts src/renderer/groups/GroupsPane.job.test.tsx` | helper test: extend existing; GroupsPane test: no, Wave 0 |
| D-02 | ModeSwitch `disabled` while `add.step !== 'idle'`; forced `'add'` | unit/static render (`ModeSwitch.test.tsx` pattern) | `npx vitest run src/renderer/groups/ModeSwitch.test.tsx` | exists, extend |
| D-03 | Job view rows limited to `add.dialogIds`, no scan-dependent state | unit (pure row-selection helper) | `npx vitest run src/renderer/groups/addPaneState.test.ts` | extend |
| D-01 | Job card renders `add.targetName` and initial, no avatar | static render | `npx vitest run src/renderer/target/AddJobCard.test.tsx` | no, Wave 0 |
| D-05 (ADD-12) | TARGET_RESOLVE / CONFIRM / RESOLVE_CANDIDATE are no-ops (resolver not called) while add non-idle; TARGET_RESET still aborts | unit (captured ipcMain handlers) | `npx vitest run src/main/ipc/targetChannels.test.ts src/main/ipc/searchChannels.test.ts` | exist, extend |
| D-06 | `retryGroup` ignores live resolver, refuses on id mismatch, zero client calls | unit | `npx vitest run src/main/telegram/addExecutor.test.ts` | exists, extend |
| D-07 | Mismatched resume rejected: `initJob` not called, no RPC, state not started; leftover-job fresh-start behavior per OQ-1 | unit + IPC integration | `npx vitest run src/main/ipc/addChannels.test.ts src/main/telegram/addExecutor.test.ts` | exist, extend |
| D-14 relaunch test | ADD_START IPC resume computation + store; F1 Stop works (`ADD_ABORT`), F2 mismatch rejected | integration (real addChannels + AddExecutor + fake store, captured handlers) + addStore | `npx vitest run src/main/telegram/addResume.ipc.integration.test.ts src/renderer/store/addStore.test.ts` | no, Wave 0 (new file) |
| D-08 | Retry on relaunch-resumed report uses job target | unit | `npx vitest run src/main/telegram/addExecutor.test.ts` | extend |
| D-10 (F3) | Persisted `bannedDialogIds` triggers EditBanned before invite on resume/retry with no live scan; live scan wins; old file without field unchanged; survives real-store round trip (Zod) | unit | `npx vitest run src/main/storage/addAuditStore.test.ts src/main/telegram/addExecutor.test.ts` | exist, extend |
| D-11 (F4) | Stopped band shows Resume; `resumeJobFromDisk` re-reads the job and sends the FULL ids after a stop | unit (store) + static render | `npx vitest run src/renderer/store/addStore.test.ts` | exists, extend |
| D-12 (F5) | Privacy-blocked retry: log block appended (title, link), single-link DM sent with template, refusal flagged on the outcome, PEER_FLOOD still hard-stops, link persisted before DM | unit | `npx vitest run src/main/telegram/addExecutor.test.ts` | extend |
| D-13 (F6) | `language:setDetected` Zod-validated; effective language = stored, then detected, then `'en'`; default DM bytes equal preview | unit | `npx vitest run src/main/ipc/languageChannels.test.ts` | exists, extend |
| D-14 empty | `getAddEmptyState([])` returns `'no-groups'`, copy keys exist en+cs | unit | `npx vitest run src/renderer/groups/addPaneState.test.ts src/renderer/i18n/i18n.test.ts` | exist, extend |
| D-14 docblock/docs | Comment-only and frontmatter changes | none (review) | `git diff` inspection | n/a |

### Sampling Rate
- **Per task commit:** the targeted `npx vitest run <file>` for the touched module.
- **Per wave merge:** `npx vitest run` plus the non-emitting typecheck.
- **Phase gate:** full suite green (expect more than 667 tests) and typecheck clean before `/gsd:verify-work`. Run `git status` to confirm no stray `.js`/`.d.ts` emitted into `src/`.

### Wave 0 Gaps
- [ ] `src/main/telegram/addResume.ipc.integration.test.ts` (or extend `addResume.integration.test.ts`): relaunch via real `registerAddChannels` + `registerTargetChannels` + `AddExecutor`, covering F1 (Stop works) and F2 (mismatch rejected, lookup blocked). Reuse `makeAuditStore`/`build` helpers from the existing integration test (copy or export).
- [ ] `src/renderer/groups/GroupsPane.job.test.tsx`: static render with `vi.mock` of `useAddStore`/`useTargetStore`/`useGroupsStore`/`useRemovalStore`/`useTagStore` (hooks return seeded values) asserting the band (raw keys such as `stopLabel`, `peerFloodResumeLabel`) renders with no confirmed target. If this proves too heavy, fall back to the pure `getPaneView` helper test plus one small test of the extracted Add band component.
- [ ] `src/renderer/target/AddJobCard.test.tsx` (if a new component is chosen).
- [ ] A real-store Zod round-trip test case in `addAuditStore.test.ts` for `bannedDialogIds` and the new outcome field.
- Framework install: none.

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`; section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unchanged (auth gate in `addChannels` stays) |
| V3 Session Management | no | Unchanged |
| V4 Access Control | yes | Identity lock in main: non-idle add blocks resolve/confirm/candidate; `retryGroup` job-target-only; resume mismatch rejection |
| V5 Input Validation | yes | Zod on any new IPC payload (`language:setDetected` as `z.enum(['en','cs'])`); existing payload schemas unchanged; no identity fields added to any payload |
| V6 Cryptography | no | None added. Job file stays 0o600 atomic write |
| V8 Data Protection | yes | `bannedDialogIds` and `targetAccessHash` remain main-only (strip in `ADD_GET_JOB`); add log keeps owner-only 0o600 for invite links |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Wrong-identity add via re-resolve during a live job (F2) | Tampering / Elevation | Main guard on RESOLVE, CONFIRM and RESOLVE_CANDIDATE keyed on executor state; `retryGroup` job-target-only |
| Resume of job A against person B's identity | Tampering | Identity comparison in main before `execute`, no `initJob` on mismatch (see OQ-1 for scope) |
| Compromised renderer forging resume intent or identity | Spoofing | Unchanged: payload carries only `dialogIds`; `resume` computed in main (T-14-16) |
| Invite link leak via retry DM/log | Information disclosure | Log 0o600; DM goes only to the job's target id from `_resolvedTarget` |
| TOCTOU between guard and `execute` | Tampering | Re-check inside `execute` (authoritative) as well as in the handler; generation guard on async tails |

## Sources

### Primary (HIGH confidence, direct source reading, 2026-10-24)
- `src/renderer/groups/GroupsPane.tsx`, `GroupRow.tsx`, `ModeSwitch.tsx`, `addPaneState.ts`
- `src/renderer/shell/AppShell.tsx`, `src/renderer/target/TargetCard.tsx`, `TargetInput.tsx`
- `src/renderer/store/addStore.ts`, `targetStore.ts`, `runActivity.ts`
- `src/renderer/removal/AddResumeJobDialog.tsx`, `src/renderer/main.tsx`
- `src/main/telegram/AddExecutor.ts`, `MembershipScanner.ts`, `TargetResolver.ts`
- `src/main/ipc/addChannels.ts`, `targetChannels.ts`, `searchChannels.ts`, `languageChannels.ts`, `src/main/index.ts`
- `src/main/storage/addAuditStore.ts`, `addLogStore.ts`, `src/shared/addTypes.ts`, `addResume.ts`
- `.planning/v1.7-MILESTONE-AUDIT.md`, `17-CONTEXT.md`, `vitest.config.ts`, project memory notes (tsc no-op pitfall)

### Secondary / Tertiary
- None. No external documentation was needed.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new libraries
- Architecture: HIGH, every seam read in source; line numbers verified this session (some CONTEXT.md line numbers have drifted by 1-2)
- Pitfalls: HIGH for Zod stripping, `retryGroup`, effects and ModeSwitch (read directly); MEDIUM for the OQ-1 UX consequence (reasoned from flow, not exercised)

**Research date:** 2026-10-24
**Valid until:** 2026-11-24 (internal code; stable unless Phase 17 neighbours change)
