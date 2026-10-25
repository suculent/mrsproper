---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - src/shared/addTypes.ts
  - src/shared/channels.ts
  - src/main/telegram/AddExecutor.ts
  - src/main/telegram/addExecutor.test.ts
  - src/main/telegram/TargetResolver.ts
  - src/main/telegram/targetResolver.test.ts
  - src/main/telegram/contactService.ts
  - src/main/telegram/contactService.test.ts
  - src/main/telegram/__mocks__/telegramClient.ts
  - src/main/storage/addAuditStore.ts
  - src/main/storage/addAuditStore.test.ts
  - src/main/storage/addLogStore.ts
  - src/main/storage/addLogStore.test.ts
  - src/main/ipc/addChannels.ts
  - src/main/ipc/addChannels.test.ts
  - src/main/ipc/templateChannels.ts
  - src/main/ipc/templateChannels.test.ts
  - src/main/ipc/languageChannels.ts
  - src/main/ipc/targetChannels.ts
  - src/main/index.ts
  - src/preload/index.ts
findings:
  critical: 3
  warning: 4
  info: 4
  total: 11
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-10-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

AddExecutor's happy-path dispatch, continuation-resume gating, and the IPC/store scaffolding around
it are well-structured and closely mirror the Removal/Tag precedent, with good security discipline
(no accessHash crossing IPC, resume computed server-side, dialog-map cross-checks). However, three
provable correctness/safety defects were found by tracing the actual data flow rather than the
happy-path tests:

1. The continuation-based resume path (new to this phase, D-20) corrupts the persisted `add-job.json`
   with duplicate/contradictory per-dialog outcome entries whenever a previously-`skipped` dialog is
   reprocessed after a resume.
2. A non-privacy failure during the end-of-run DM send (`NETWORK`, exceeded `FLOOD_WAIT`, or any
   unrecognized RPC error) throws out of `execute()` uncaught, which the IPC layer silently swallows.
   This leaves the executor permanently stuck reporting `step: 'running'`, which — through the
   double-start guard — wedges the entire Add feature for the rest of the app session, with zero
   diagnostic signal and the add-log block never written despite the run's work having actually
   completed.
3. Every call site that wraps `_buildPrivacyBlockedOutcome()` (the `ExportChatInvite` call) in a
   `try { … } catch { return failed }` swallows a `PEER_FLOOD` hard-stop into an ordinary per-group
   failure instead of propagating it, directly contradicting the documented T-14-11 invariant and
   risking continued API traffic against an account Telegram has already flagged.

None of these three are exercised by the (otherwise thorough) `addExecutor.test.ts` suite — each is a
genuine blind spot, not a regression of a tested behavior. Four additional warnings and four info-level
items are listed below.

## Critical Issues

### CR-01: Resuming a previously-skipped dialog writes duplicate/contradictory entries into add-job.json

**File:** `src/main/telegram/AddExecutor.ts:268-301` (continuation seeding) and `src/main/storage/addAuditStore.ts:200-213` (`checkpoint`)
**Issue:**
`AddAuditStore.checkpoint()` unconditionally appends to `_currentJob.outcomes` — it never removes or
replaces an existing entry for the same `dialogId`:
```ts
checkpoint(dialogId: string, outcome: AddGroupOutcome): void {
  ...
  _currentJob = { ..._currentJob, outcomes: [..._currentJob.outcomes, { ...outcome, dialogId }] }
  writeAtomic(_currentJob)
}
```
On a continuation resume (D-20), `AddExecutor.execute()` deliberately does **not** call
`auditStore.initJob()` — it reuses the on-disk job's `jobId` and seeds its *local* `outcomes` array
with `existing.outcomes.filter(o => o.status !== 'skipped')`. That filter only affects the executor's
local working array; the audit store's own in-memory `_currentJob` (and the on-disk file) still
contains the stale `'skipped'` entries written by `_markRemainingSkippedAndStop()` at the end of the
previous segment.

When the resumed run reprocesses one of those previously-skipped dialogs and calls
`this._auditStore.checkpoint(dialogId, outcome)`, the new outcome (e.g. `'done'` or
`'privacy-blocked'`) is appended *alongside* the stale `'skipped'` entry for the same `dialogId` — the
job file ends up with two (or more, across further resumes) contradictory outcome rows for one dialog.
This corrupted array is exactly what `ADD_GET_JOB` returns verbatim to the renderer
(`src/main/ipc/addChannels.ts:220-228`), so Phase 15's job/report UI will see a dialog listed twice
with conflicting statuses. It also permanently bloats `add-job.json` with dead rows.

This is **not** exercised by `addExecutor.test.ts`'s own continuation test (`"a resumed run (two
segments...)"`, line ~1204) — that test aborts mid-run *before* any dialog is skipped-then-reprocessed
in the same slot, and only asserts on the executor's in-memory emitted state (which is correct),
never on `sharedAuditStore._job.outcomes` (which is not).

**Fix:** Either (a) make `AddAuditStore.checkpoint()` replace any existing entry with the same
`dialogId` before appending, or (b) have `AddExecutor`, on taking the continuation branch, re-sync the
store via a new `initJob`-like call that writes back the *filtered* outcome set (`outcomes` local
variable) before the loop starts, so stale `'skipped'` rows are dropped from disk immediately:
```ts
checkpoint(dialogId: string, outcome: AddGroupOutcome): void {
  if (!_currentJob) { ... }
  const deduped = _currentJob.outcomes.filter(o => o.dialogId !== dialogId)
  _currentJob = { ..._currentJob, outcomes: [...deduped, { ...outcome, dialogId }] }
  writeAtomic(_currentJob)
}
```
(The same append-only pattern also affects `retryGroup()` on Add/Removal/Tag — see WR-01 below.)

---

### CR-02: A non-privacy DM-send failure permanently wedges the Add feature for the rest of the session

**File:** `src/main/telegram/AddExecutor.ts:436-452`, with the swallow at `src/main/ipc/addChannels.ts:169-171`
**Issue:**
In `execute()`'s end-of-run DM step:
```ts
} catch (err) {
  const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
  if (['USER_PRIVACY_RESTRICTED', 'USER_IS_BLOCKED', 'YOU_BLOCKED_USER', 'PRIVACY_PREMIUM_REQUIRED'].includes(msg)) {
    dmStatus = 'refused'
  } else {
    // PEER_FLOOD / FLOOD_WAIT / NETWORK propagate as a genuine run failure, not a dmStatus value.
    throw err
  }
}
```
This `throw` happens **before** `this._auditStore.setStatus('complete', ...)`, before
`this._runActive = false`, before the final `_emit({ step: 'complete', ... })`, and before
`this._addLogStore.appendBlock(...)`. There is no outer `try/catch` around this section (or around
`execute()` as a whole) to catch it and transition to a terminal state.

The only consumer of the `execute()` promise is `addChannels.ts`'s `ADD_START` handler:
```ts
executor.execute({ dialogIds: parsed.dialogIds, resume }).catch(() => {
  // Errors handled inside execute() which emits error/stopped state via onStateChange
})
```
The comment's claim is false for this path — nothing inside `execute()` handles it. The rejection is
silently discarded. Consequences:
- `this._currentState.step` stays at whatever was last emitted inside the loop (`'running'`,
  `dmStatus: 'pending'`) forever — the renderer never receives a `'complete'`/error state.
- `_runActive` is never reset to `false`.
- The job file's `status` stays `'running'` on disk forever, even though every per-group outcome was
  already successfully checkpointed.
- `addChannels.ts`'s double-start guard (`currentStep === 'running' || 'stopping'`) now permanently
  rejects every subsequent `add:start` call for the remainder of the app session — there is no
  recovery path short of an app restart (and `abortExecution()` does not help either: it only forces
  an `'idle'` emit when the current step is *not* `'running'`/`'stopping'`, which it is).
- The add-log block for this run — which should have recorded all the real `'done'`/`'privacy-blocked'`
  outcomes — is never written, since `addLogStore.appendBlock()` is called after the throw point.
- No `console.error` or any other diagnostic is emitted anywhere in this chain.

This is untested: `addExecutor.test.ts` only exercises `sendMessageError: 'USER_IS_BLOCKED'` (the
`'refused'` path) and the mid-run abort/hard-stop-before-DM paths; no test drives a `SendMessage`
failure that isn't one of the four privacy strings.

**Fix:** Wrap the DM section (or the whole terminal-state tail of `execute()`) in a try/catch that still
performs the status/emit/log bookkeeping on a non-privacy DM failure — e.g. treat it as its own
terminal outcome (`dmStatus: 'refused'` plus a logged warning, or a dedicated `AddRunStep` value) so the
run always reaches a terminal, resumable, correctly-logged state instead of silently hanging. At minimum,
log the error and still call `setStatus`/`_emit`/`appendBlock` before returning.

---

### CR-03: PEER_FLOOD during invite-link export is swallowed into a per-group failure instead of hard-stopping the run

**File:** `src/main/telegram/AddExecutor.ts:616-627, 659-671, 712-718, 725-730, 409-424`
**Issue:**
Every call site that invokes `_buildPrivacyBlockedOutcome()` (which performs the governed
`messages.ExportChatInvite` call) wraps it in a blanket `catch` that returns a per-group `failed`
outcome, without re-checking `classifyRpcError(err).disposition`:
```ts
try {
  return await this._buildPrivacyBlockedOutcome(dialog, resolved, targetName, ...)
} catch {
  return { dialogId: dialog.id, status: 'failed', errorCode: 'UNKNOWN', timestamp }
}
```
This pattern appears five times: the basic-group and channel branches of `_addToGroup()`, the privacy
and channel-full branches of `_classifyAddError()`, and the stale-link-regeneration loop inside the
end-of-run DM step. If `ExportChatInvite` throws a `PEER_FLOOD`-classified error (disposition
`'hard-stop'`), none of these sites re-throw it — they all convert it into an ordinary `failed`
outcome and the loop immediately moves on to the *next* governed call (the next group's dispatch, or
the next link regeneration / the `SendMessage` call), continuing to talk to an account Telegram has
just told the app to stop hitting.

This directly contradicts the module's own documented invariant:
> T-14-11: classifyRpcError's hard-stop disposition is re-thrown before any outcome classification;
> the run hard-stops with remaining groups left pending (resumable).

That invariant is honored at the top level of the per-group loop and at the top of
`_classifyAddError()` (both correctly check hard-stop first) — but it is *not* honored inside the
nested `_buildPrivacyBlockedOutcome` try/catch wrappers layered on top of those same call sites. The
mock client's only `ExportChatInvite` error injection (`exportChatInviteErrorPeerIds` →
`LINK_NOT_MODIFIED`, see `__mocks__/telegramClient.ts:607-608`) is not hard-stop-classified, so this
gap is untested.

**Fix:** In every one of these catch blocks, check disposition before swallowing:
```ts
} catch (err) {
  if (classifyRpcError(err).disposition === 'hard-stop') throw err
  return { dialogId: dialog.id, status: 'failed', errorCode: 'UNKNOWN', timestamp }
}
```
and ensure the hard-stop then propagates to the loop's existing top-level hard-stop handling (for the
dispatch-time cases) or aborts the DM-send tail cleanly (for the link-regeneration case) rather than
silently continuing to the next governed call.

## Warnings

### WR-01: `retryGroup()` can propagate an uncaught hard-stop error, silently swallowed by the IPC layer

**File:** `src/main/telegram/AddExecutor.ts:538-541`, swallow at `src/main/ipc/addChannels.ts:203-205`
**Issue:** `retryGroup()`'s catch path calls `_classifyAddError(err, ...)` directly with no surrounding
try/catch:
```ts
try {
  newOutcome = await this._addToGroup(dialog, resolved, scanStatus)
} catch (err) {
  newOutcome = await this._classifyAddError(err, dialog, resolved, targetName)
}
```
`_classifyAddError()` itself re-throws on hard-stop (`if (classified.disposition === 'hard-stop') throw err`,
line 705-707). Unlike the main loop, nothing here catches that re-throw. It propagates out of
`retryGroup()` and is discarded by `addChannels.ts`'s `executor.retryGroup(...).catch(() => { /* comment
claims this is handled inside retryGroup() */ })`. A user clicking "retry" on one failed group during a
PEER_FLOOD condition gets no feedback at all — the group's status is simply left unchanged, with no
error surfaced and no state emitted.
**Fix:** Catch the hard-stop re-throw inside `retryGroup()` and emit an explicit state/no-op signal
(or at minimum log it) instead of letting it vanish into the fire-and-forget `.catch()` at the IPC
boundary.

### WR-02: The AddChatUser fwd_limit retry fires on *any* non-terminal error, not just the intended fwd_limit rejection

**File:** `src/main/telegram/AddExecutor.ts:598-613`
**Issue:** D-03's documented intent is "retry once with `fwd_limit: 100` when the server rejects the
undocumented `fwd_limit: 1000` value." The implementation instead retries whenever the first attempt's
error is *not* in `KNOWN_ADD_TERMINAL_ERRORS` and not hard-stop-classified:
```ts
} catch (err) {
  if (this._isKnownAddTerminalError(err)) throw err
  // Unrecognized first-attempt error — presumably the undocumented fwd_limit rejection (D-03).
  response = await this._governor.run(() => this._client.invoke(new Api.messages.AddChatUser({ ..., fwdLimit: 100 })))
}
```
A `FLOOD_WAIT` that the governor decided not to fully absorb (disposition `'wait'`, not `'hard-stop'`),
a generic `NETWORK` failure, or any truly unknown RPC error all fall through to this branch and trigger
an immediate second governed call — exactly the kind of extra traffic the project's rate-limit
constraints (CLAUDE.md: "All Telegram calls ... must be throttled with FLOOD_WAIT handling") are meant
to avoid, since it fires right when the account may already be under pressure, with no backoff.
**Fix:** Scope the retry to a narrower/explicit signal of the fwd_limit rejection if one exists (or at
minimum exclude `classified.disposition === 'wait'` / `NETWORK` from triggering the blind retry), so
only genuinely-unrecognized terminal errors get the one extra attempt.

### WR-03: `renderTemplate()`'s sequential global replace allows a target-controlled name to corrupt the DM text

**File:** `src/main/ipc/templateChannels.ts:40-42`
**Issue:**
```ts
export function renderTemplate(template: string, vars: { name: string; links: string }): string {
  return template.replace(/\{name\}/g, vars.name).replace(/\{links\}/g, vars.links)
}
```
`vars.name` is the *add target's own* Telegram display name — fully attacker/target-controlled (the
product's stated use case is spammers/trolls/banned users). If that name literally contains the
substring `{links}` (or `{name}`), the first `.replace()` call inserts it verbatim into the output, and
the second global `.replace(/\{links\}/g, ...)` then matches and substitutes that *name-derived*
occurrence too — producing a DM with the link text duplicated and the name corrupted in a confusing way.
Not independently exploitable for data exfiltration (the DM's recipient is the target themselves), but
it is a real, user-visible rendering/logic bug with no test coverage for this case.
**Fix:** Do the substitution in a single pass, e.g. `template.replace(/\{name\}|\{links\}/g, (m) => (m === '{name}' ? vars.name : vars.links))`, so a value's own content can never be re-scanned by a later replacement.

### WR-04: AddLogStore's security comment overstates what `appendFileSync({ mode: 0o600 })` actually guarantees

**File:** `src/main/storage/addLogStore.ts:14-18, 134-138`
**Issue:** The module header claims:
> add-log.txt contains invite links (bearer-style, single-use secrets). Every appendFileSync call
> passes an owner-read-only mode flag, the same protection level as add-job.json and session.bin.

Node's `fs.appendFileSync(path, data, { mode })` only applies `mode` when the file is *created*
(via the underlying `O_CREAT` open flag); on an append to an already-existing file, the `mode` option
has no effect and the file's existing permissions are left untouched. In this codebase's normal flow
the file is always first created by this same code (so the claim holds in practice), but the comment
asserts a per-call guarantee that is not actually true of the Node API being used, which could mislead
a future reader/maintainer into assuming a stray pre-existing `add-log.txt` (e.g., restored from a
backup, or created by a future migration) would automatically have its permissions tightened on the
next append. It would not.
**Fix:** Either `fs.chmodSync(logPath, 0o600)` once defensively before the first append of a session,
or correct the comment to clarify the mode option only takes effect at file-creation time.

## Info

### IN-01: Invite-link title truncation splits on UTF-16 code units, not Unicode codepoints

**File:** `src/main/telegram/AddExecutor.ts:792`
**Issue:** `const title = ('Admin • ' + targetName).slice(0, 32)` truncates by UTF-16 code unit count.
For a `targetName` containing astral-plane characters (e.g. certain emoji) near the boundary, `.slice`
can split a surrogate pair, producing a title with a lone unpaired surrogate.
**Fix:** Use a codepoint-aware truncation (e.g. `Array.from(title)` and rejoin, or `Intl.Segmenter`)
if non-BMP characters in display names need to be supported cleanly.

### IN-02: `errorCode` in the job-file schema is not validated against the `AddErrorCode` union

**File:** `src/main/storage/addAuditStore.ts:108`
**Issue:** `errorCode: z.string().optional()` accepts any string, not just the nine literal values of
`AddErrorCode` in `src/shared/addTypes.ts`. A future bug that writes an unexpected string would pass
`readJob()`'s Zod validation silently rather than being caught at the trust boundary (T-14-03's stated
purpose).
**Fix:** `errorCode: z.enum(['ADD_NO_RIGHTS', 'ADD_NOT_MUTUAL_CONTACT', 'ADD_USER_CHANNELS_TOO_MUCH', 'ADD_USER_KICKED', 'ADD_TARGET_INVALID', 'ADD_CHANNEL_FULL', 'NETWORK', 'UNKNOWN']).optional()`.

### IN-03: Missing channel entity silently degrades to a zero accessHash instead of a clear failure

**File:** `src/main/telegram/AddExecutor.ts:638, 788`
**Issue:** When `this._enumerator.getDialogEntity(dialog.id)` returns null/missing `accessHash` for a
supergroup/broadcast-channel dispatch, the code falls back to `bigInt('0')` rather than failing fast
or logging. Telegram will almost certainly reject a zero-accessHash `InputChannel`/`InputPeerChannel`
with some RPC error that then gets classified generically — functionally safe (ends up `failed`), but
the real cause ("stale/missing enumerator entity") is invisible in the resulting outcome/log.
**Fix:** Log a diagnostic when the entity lookup misses before falling back, to make this failure mode
distinguishable from a genuine Telegram-side rejection.

### IN-04: D-05 pre-flight deleted/bot short-circuit ignores an in-progress continuation job

**File:** `src/main/telegram/AddExecutor.ts:226-262`
**Issue:** The deleted/bot pre-flight branch unconditionally calls `this._auditStore.initJob(...)`
and marks *every* `selectedDialogs` entry as `failed(ADD_TARGET_INVALID)`, without checking whether
`params.resume` was true and an existing non-complete job for this target/dialog-set was in progress.
If a target transitions to deleted/bot between segments of a resumed run, this overwrites the prior
job's already-recorded `'done'`/`'privacy-blocked'` outcomes with a fresh all-failed job rather than
preserving history. Likely a rare edge case, but inconsistent with D-20's "outcomes MUST persist
across a stop-resume cycle" intent.
**Fix:** If desired, check for a matching continuation job first and, if found, mark only the
*remaining* dialogs as failed rather than re-initializing the whole job.

---

_Reviewed: 2026-10-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
