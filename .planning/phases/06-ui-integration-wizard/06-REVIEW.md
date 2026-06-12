---
phase: 06-ui-integration-wizard
reviewed: 2026-06-12T18:14:37Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - src/main/index.ts
  - src/main/ipc/removalChannels.ts
  - src/main/ipc/severityChannels.ts
  - src/main/telegram/RemovalExecutor.ts
  - src/main/telegram/removalExecutor.test.ts
  - src/preload/index.ts
  - src/renderer/groups/GroupsPane.tsx
  - src/renderer/ipc/severityClient.ts
  - src/renderer/removal/ResumeJobDialog.tsx
  - src/renderer/removal/removalCopy.ts
  - src/renderer/shell/AppShell.tsx
  - src/renderer/target/TargetCard.tsx
  - src/renderer/wizard/ReviewScreen.tsx
  - src/renderer/wizard/StepIndicator.tsx
  - src/renderer/wizard/reviewScreen.test.ts
  - src/renderer/wizard/wizardCopy.ts
  - src/renderer/wizard/wizardStage.test.ts
  - src/renderer/wizard/wizardStage.ts
  - src/shared/channels.ts
  - src/shared/removalTypes.ts
findings:
  critical: 4
  warning: 9
  info: 9
  total: 22
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-06-12T18:14:37Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed the Phase 6 wizard integration (stage machine, ReviewScreen safety gate, severity preference, flood-tick plumbing, Resume/Discard flow) plus the touched main-process removal stack. The security gates on the IPC surface (Zod validation, auth gate, dialog-map gate, severity enum) are solid, and the executor's generation-guard logic is well tested.

However, the **entire resume-after-interruption feature is non-functional in production**. Three independent defects each break it on their own: (1) the ResumeJobDialog can never open due to a state-initialization race in AppShell; (2) even if it opened, resuming after an app restart silently no-ops because the executor requires a live in-memory TargetResolver and never uses the persisted `targetAccessHash` the job file exists to provide; (3) resuming a user-stopped job always computes an empty remaining set because skipped groups are checkpointed into `outcomes`. Additionally, the `'stopping'` state defined in the contract is never emitted, making all abort-feedback UI dead code. Cross-referenced `removalStore.ts`, `TargetResolver.ts`, and `auditStore.ts` to confirm these findings.

## Critical Issues

### CR-01: ResumeJobDialog can never open — `resumeOpen` initialized before `pendingJob` loads

**File:** `src/renderer/shell/AppShell.tsx:54-55, 121-128`
**Issue:** `const [resumeOpen, setResumeOpen] = useState(!!pendingJob)` evaluates the initializer exactly once, on first render. `pendingJob` is populated asynchronously: the removal store's first subscriber is AppShell itself (via `useRemovalStore()`), and `removalClient.getRemovalJob()` resolves after that initial render. So `resumeOpen` is always initialized to `false`, and nothing ever sets it to `true` — `setResumeOpen` is only reachable via the dialog's own `onOpenChange`, and the dialog renders with `open={false}` (i.e., renders nothing). The on-launch Resume/Discard flow (a locked phase decision: "No silent auto-resume … renderer shows ResumeJobDialog") is unreachable. The job file silently re-accumulates across launches with no way to act on it from the UI.
**Fix:**
```tsx
const [resumeOpen, setResumeOpen] = useState(false)

// Open the dialog when an incomplete job arrives from the async bootstrap.
useEffect(() => {
  if (pendingJob) setResumeOpen(true)
}, [pendingJob])
```

### CR-02: Resume after app restart is a silent no-op — executor never uses the persisted `targetAccessHash`

**File:** `src/main/telegram/RemovalExecutor.ts:140-150` (cf. contract at `src/shared/removalTypes.ts:98-113`)
**Issue:** `RemovalJobFile.targetAccessHash` is documented as existing precisely for this case: *"stored for resume: on restart the resolver may not be live … the executor reconstructs InputPeerUser from this value."* The executor never implements this. `execute()` reads `this._resolver.getResolvedUser()`, which is in-memory only (`TargetResolver.ts:76-78,299-304`) and is always `null` after a restart. The resume path (ResumeJobDialog → `startRemoval` → `REMOVAL_START` → `execute()`) therefore emits `step:'idle'` and returns without removing anyone. Worse, the IPC round-trip *succeeds*, so `removalStore.startRemoval` clears `pendingJob` (`removalStore.ts:114-115`) — the dialog disappears, the user believes the run resumed, and nothing happened. The on-disk job stays `status:'running'` and re-prompts on every subsequent launch. The same applies to enumeration: on a fresh launch `enumerator.getState().step` may not yet be `'loaded'` (`RemovalExecutor.ts:153-163`), producing the identical silent no-op.
**Fix:** In `execute()`, when `resolver.getResolvedUser()` is null, fall back to the persisted job identity:
```ts
const resolved = this._resolver.getResolvedUser()
  ?? this._readTargetFromJob(params) // { id: BigInt(job.targetId), accessHash: BigInt(job.targetAccessHash), name: job.targetName } when resuming
```
Gate the fallback to an explicit resume flag (e.g., `execute({ …, resumeJobId })` validated against `auditStore.readJob()`) so a renderer cannot start a *new* run without a confirmed target. Also surface a typed error state (not silent `idle`) when neither identity source is available, and block/queue resume until enumeration is `'loaded'`.

### CR-03: Resuming a user-stopped job always computes an empty remaining set — Resume button does nothing

**File:** `src/renderer/removal/ResumeJobDialog.tsx:37-39,46-50`; same logic in `src/renderer/store/removalStore.ts:158-161`
**Issue:** When a run is aborted, `execute()` checkpoints every unprocessed group with `status:'skipped'` (`RemovalExecutor.ts:211-219`), so a `status:'stopped'` job file has an outcome for **every** `dialogId`. The remaining-set filter `job.dialogIds.filter(id => !job.outcomes.find(o => o.dialogId === id))` therefore yields `[]` for every stopped job. `startRemoval(severity, [])` is rejected by the `REMOVAL_START` Zod schema (`dialogIds … min(1)`, `removalChannels.ts:45`), the rejection is swallowed by `removalStore.startRemoval`'s catch, the dialog closes, and nothing runs. Since `'stopped'` jobs satisfy `status !== 'complete'`, the dialog is shown for them — with a copy promising "Resuming continues from the first unprocessed group" — and the Resume button is a no-op for the entire class. The job file is never cleared either, so it re-prompts forever. `resumeJobFromDisk()` (PEER_FLOOD banner) has the same filter and silently returns when `remaining.length === 0`.
**Fix:** Treat `'skipped'` outcomes as unprocessed in both call sites:
```ts
const processed = new Set(
  job.outcomes.filter(o => o.status !== 'skipped').map(o => o.dialogId)
)
const remainingDialogIds = job.dialogIds.filter(id => !processed.has(id))
```
And if `remainingDialogIds` is empty, don't render Resume (or clear the job) instead of dispatching a payload that Zod will reject.

### CR-04: `'stopping'` state is never emitted — abort produces zero UI feedback and all "stopping" UI is dead code

**File:** `src/main/telegram/RemovalExecutor.ts:370-395` (cf. consumers `src/renderer/groups/GroupsPane.tsx:274,290-297,497-507`, `src/main/ipc/removalChannels.ts:105`)
**Issue:** `RemovalRunStep` defines `'stopping'`, the double-start guard checks for it, and GroupsPane renders a "Stopping…" spinner and a disabled run-trigger for it — but no code path ever emits `step:'stopping'`. `abortExecution()` deliberately does not emit for active runs (the loop emits the final `'stopped'`), and `REMOVAL_ABORT` returns `executor.getState()`, which is still `'running'`. Consequence: when the user clicks "Stop removal" mid-run, the UI changes nothing — the Stop button stays enabled, progress keeps animating, and the actual stop lands only after the in-flight group plus the 2–3 s pacing sleep (or an arbitrarily long FLOOD_WAIT) completes. For a destructive bulk operation this reads as "abort ignored" and invites repeated clicking; every `isStopping`/`'stopping'` branch in the renderer is unreachable.
**Fix:** In `abortExecution()`, when the current step is `'running'`, immediately emit a `'stopping'` snapshot before the loop finishes:
```ts
if (this._currentState.step === 'running') {
  this._emit({ ...this._currentState, step: 'stopping' })
}
```
The execute() loop's generation guard still emits the authoritative `'stopped'` afterwards (its terminal emit overwrites the interim state, so no double-terminal occurs).

## Warnings

### WR-01: ReviewScreen advances the wizard to 'run' even when dispatch fails or no-ops

**File:** `src/renderer/wizard/ReviewScreen.tsx:159-167` (with `src/renderer/store/removalStore.ts:110-120`)
**Issue:** `removalActions.startRemoval` swallows all errors (`console.error` only) and resolves normally, so `handleConfirm` always calls `onConfirm()` → `setStage('run')`. If the IPC call was rejected (Zod, unknown dialogId) or the executor no-opped to `'idle'` (resolver null / enumeration not loaded — see CR-02), the user lands on the 'run' stage with `removal.step === 'idle'`; the run→report auto-advance never fires and there is no error feedback.
**Fix:** Make `startRemoval` return success/failure (or rethrow), and only advance the stage when the returned state's `step` is `'running'`:
```ts
const ok = await removalActions.startRemoval(severity, ids)
if (ok) onConfirm()
else setDispatchError(true) // render inline error copy
```

### WR-02: PEER_FLOOD during `retryGroup` escapes and is silently swallowed

**File:** `src/main/telegram/RemovalExecutor.ts:427-432,613-642`; swallow at `src/main/ipc/removalChannels.ts:155-157`
**Issue:** `retryGroup`'s catch delegates to `_classifyRemovalError`, which **re-throws** hard-stop errors (PEER_FLOOD) by design for the `execute()` loop. `retryGroup` has no outer handler, so the throw propagates to the IPC layer's `executor.retryGroup(...).catch(() => {})` and vanishes: no `'hard-stopped'` state, no `auditStore.setStatus`, no UI signal — the user sees the row stuck on whatever state it had, on the one error class (account flood-flag) where feedback matters most.
**Fix:** Handle the hard-stop disposition in `retryGroup` explicitly:
```ts
} catch (err) {
  if (classifyRpcError(err).disposition === 'hard-stop') {
    this._auditStore.setStatus('hard-stopped')
    this._emit({ ...this._currentState, step: 'hard-stopped', floodWaitRemaining: null })
    return
  }
  newOutcome = this._classifyRemovalError(err, dialogId)
}
```

### WR-03: `removal:discardJob` has no run-active guard — discarding mid-run wedges the executor in 'running' forever

**File:** `src/main/ipc/removalChannels.ts:174-177` (with `src/main/storage/auditStore.ts:188-193`, `src/main/telegram/RemovalExecutor.ts:306`)
**Issue:** `REMOVAL_DISCARD_JOB` unconditionally calls `auditStore.clearJob()`. If a run is active, the next `auditStore.checkpoint()` throws `'AuditStore.checkpoint: no active job'`. That checkpoint call sits **outside** the try/catch in `execute()` (line 306), so `execute()` rejects, the rejection is swallowed by the fire-and-forget `.catch(() => {})` in `REMOVAL_START`, and no terminal state is ever emitted: the renderer stays on `'running'` permanently, `_runActive` leaks true, and the double-start guard then blocks all future runs until restart.
**Fix:** Reject the discard while a run is active, mirroring the start guard:
```ts
ipcMain.handle(REMOVAL_DISCARD_JOB, async () => {
  const step = executor.getState().step
  if (step === 'running' || step === 'stopping') return auditStore.readJob()
  auditStore.clearJob()
  return null
})
```
Defense-in-depth: also wrap the checkpoint calls in `execute()` so an audit-store failure produces an emitted error state rather than a swallowed rejection.

### WR-04: Resume overwrites the job file, destroying the audit trail of already-completed groups

**File:** `src/main/telegram/RemovalExecutor.ts:177-190`
**Issue:** Resuming dispatches a fresh `execute()` with only the remaining dialogIds; `execute()` calls `auditStore.initJob()` with `outcomes: []` and `dialogIds` = remaining only. The prior job's checkpointed outcomes (which groups were already removed, when, with what errors) are overwritten on disk. EXE-05's durable per-group audit record does not survive its primary use case — an interrupted-and-resumed run — and the post-resume summary undercounts the work actually done.
**Fix:** Accept an optional resume context in `execute()` that seeds `job.outcomes` (and `outcomes` accumulator / `progress.total`) from the existing job file instead of starting from empty, or write resumed runs under the same `jobId` with merged outcomes.

### WR-05: `retryGroup` outcome merge retains stale `errorCode`/`note` on a successful retry

**File:** `src/main/telegram/RemovalExecutor.ts:448-450`
**Issue:** `{ ...o, ...newOutcome, dialogId }` — a successful retry outcome (`status:'done'`) has no `errorCode` key, so the spread keeps the previous failure's `errorCode` (e.g., `'RMV_NO_RIGHTS'`) alongside `status:'done'` in the emitted renderer state. GroupsPane passes `errorCode={outcome?.errorCode ?? null}` to GroupRow independent of status, so a contradictory done-with-error row state can render. The audit checkpoint stores the clean outcome; only the live state is polluted.
**Fix:** Replace rather than merge:
```ts
const updatedOutcomes = this._currentState.outcomes.map(o =>
  o.dialogId === dialogId ? { ...newOutcome, dialogId } : o
)
```

### WR-06: Dialog-map security gate silently skipped when enumeration is not 'loaded'

**File:** `src/main/ipc/removalChannels.ts:111-120`
**Issue:** Layer 4 only validates `dialogIds` against the enumerator when `groupsState.step === 'loaded'`; in every other step the payload passes unvalidated to `executor.execute()`. Today the executor independently bails when enumeration isn't loaded, so there is no exploitable injection — but the gate's correctness now depends on an implementation detail of the executor, and the silent skip is invisible. A future change to `execute()` (e.g., the CR-02 fix that reads dialogs from the job file) would turn this into a real bypass.
**Fix:** Fail closed: when `groupsState.step !== 'loaded'`, return `executor.getState()` (or throw) instead of falling through to dispatch.

### WR-07: `RMV_USER_INVALID` user copy gives network advice for a non-network error

**File:** `src/renderer/removal/removalCopy.ts:17`
**Issue:** `USER_ID_INVALID` (mapped to `RMV_USER_INVALID` in `RemovalExecutor._classifyRemovalError`) means Telegram rejected the user reference (stale/invalid accessHash or id) — retrying after "check your network" cannot succeed and misleads the admin. It duplicates the `NETWORK` copy verbatim.
**Fix:** Use cause-accurate copy, e.g. `"Telegram couldn't match this person here — re-confirm the target, then"`.

### WR-08: `getNextStage` stage machine is dead code; SAF-02 transition tests validate nothing in production

**File:** `src/renderer/wizard/wizardStage.ts:1-5,26-54` (tests: `src/renderer/wizard/wizardStage.test.ts`)
**Issue:** The header comment claims the function is "Imported by AppShell for documentation of valid transitions" — AppShell does not import it (verified: no non-test import anywhere in `src/renderer`). All stage transitions in AppShell/GroupsPane/TargetCard are raw `setStage(...)` calls, so the "forward gate enforcement (SAF-02)" test suite asserts properties of a function the app never executes, giving false confidence that invalid transitions are guarded.
**Fix:** Either route AppShell's transitions through it (`setStage(s => getNextStage(s, 'CONFIRM'))` etc.) so the tested table is authoritative, or delete the module and its tests and document that button visibility is the only gate.

### WR-09: Abandoning a stopped run leaves a stale `status:'stopped'` job file that re-prompts Resume on every launch

**File:** `src/renderer/groups/GroupsPane.tsx:391-398,450-461`; `src/main/telegram/RemovalExecutor.ts:370-395`
**Issue:** "Remove someone else" / "Change target" after a stopped run resets the target and aborts the (inactive) executor, but nothing clears the on-disk job (`status:'stopped'`, all outcomes written). On the next launch `readJob()` returns it (`status !== 'complete'`), so the user is prompted to resume a job they explicitly walked away from — and per CR-03 that Resume currently does nothing, so the prompt can never be satisfied except via Discard. Terminal-and-abandoned jobs should be cleared when the user starts a new target flow.
**Fix:** When the user leaves a terminal removal state via reset ("Remove someone else"/"Change target"), call `removal:discardJob` (or have `abortExecution()`'s idle-reset path clear jobs whose status is `'stopped'`/`'complete'`).

## Info

### IN-01: GroupsPane `stage` prop is unused

**File:** `src/renderer/groups/GroupsPane.tsx:43`
**Issue:** `stage: WizardStage` is declared in `GroupsPaneProps` and passed by AppShell, but never read inside the component.
**Fix:** Remove the prop from the interface and the AppShell call site.

### IN-02: Dead copy entries in removalCopy after RemovalConfirmDialog removal

**File:** `src/renderer/removal/removalCopy.ts:42-61,65-68,121-128`
**Issue:** `confirmTitle`, `confirmDestructive`, `confirmNeutral`, `severityLine`'s old consumer, `runTriggerLabel(severity, n)`, and `summaryLine` were consumed by `RemovalConfirmDialog`, which no longer exists (ReviewScreen replaced it; GroupsPane uses `wizardCopy.runTriggerLabel` and `summaryLineParts`). `severityLine` is still used by ReviewScreen; the rest are dead.
**Fix:** Delete the unused entries (or annotate intentional retention for Phase 8 i18n).

### IN-03: Preload return-type fib — `retryRemovalGroup` typed `Promise<void>` but handler returns `RemovalState`

**File:** `src/preload/index.ts:144-145` (handler: `src/main/ipc/removalChannels.ts:159`)
**Issue:** The IPC handler returns `executor.getState()`; the bridge discards it via a `Promise<void>` annotation. Harmless today but masks the contract (same pattern as `retryScanGroup`).
**Fix:** Type it `Promise<RemovalState>` or have the handler return nothing.

### IN-04: Abort/skip block duplicated three times in `execute()`

**File:** `src/main/telegram/RemovalExecutor.ts:207-233,277-303,313-339`
**Issue:** ~27 identical lines (skip-marking, checkpointing, status, emit) appear at three guard points. Any fix (e.g., WR-04's resume seeding) must be applied in triplicate; divergence risk is high.
**Fix:** Extract a private `_finishStopped(gen, selectedDialogs, outcomes, params, targetId, targetName, total)` helper.

### IN-05: Inter-group pacing sleeps 2–3 s after the final group, delaying 'complete' for nothing

**File:** `src/main/telegram/RemovalExecutor.ts:309-310`
**Issue:** The pacing sleep runs unconditionally after every checkpoint, including the last group, so every run ends with a pointless 2–3 s delay (plus an extra generation-guard pass) before the summary appears.
**Fix:** Skip the pacing sleep when the current dialog is the last in `selectedDialogs`.

### IN-06: Persisted severity is not validated on read

**File:** `src/main/ipc/severityChannels.ts:63-66`
**Issue:** `SEVERITY_SET` is Zod-gated, but `SEVERITY_GET` returns whatever is in the electron-store JSON. A hand-edited/tampered prefs file feeds an arbitrary string to the renderer typed as `'kick' | 'ban'`. Downstream `REMOVAL_START` Zod would still reject a removal with it, but the UI severity toggle could render in an impossible state.
**Fix:** `const v = store.get('severity', 'ban'); return v === 'kick' ? 'kick' : 'ban'`.

### IN-07: Avatar helper triplication; TargetCard's `getAvatarColor` lacks the CR-03 empty-seed guard ReviewScreen has

**File:** `src/renderer/target/TargetCard.tsx:37-55`; `src/renderer/wizard/ReviewScreen.tsx:33-47`
**Issue:** `AVATAR_COLORS`/`getAvatarColor`/`bytesToDataUrl` are now duplicated in three components. ReviewScreen guards `BigInt('')` (CR-03); TargetCard does not — safe only because `t.id` is currently always non-empty. Divergent copies of safety guards is exactly how the next regression lands.
**Fix:** Extract to `src/renderer/lib/avatar.ts` with the guard, and import in all three.

### IN-08: ResumeJobDialog counts skipped groups as "processed"

**File:** `src/renderer/removal/ResumeJobDialog.tsx:33-34` (copy: `removalCopy.ts:94-96`)
**Issue:** `processedCount = job.outcomes.length` includes `'skipped'` outcomes, so a stopped job with 1 done + 5 skipped reads "6 of 6 groups were processed before the run stopped." Should count only non-skipped outcomes (aligns with the CR-03 fix).
**Fix:** `const processedCount = job.outcomes.filter(o => o.status !== 'skipped').length`.

### IN-09: `execute()` early-return paths emit 'idle' carrying stale outcomes/summary and leak the AbortController

**File:** `src/main/telegram/RemovalExecutor.ts:140-163`
**Issue:** The resolver-null / enumeration-not-loaded paths emit `{ ...this._currentState, step: 'idle', … }`, preserving a previous run's `targetId`, `outcomes`, and `summary` under an `'idle'` step (an inconsistent shape no other path produces), and leave `this._abortController` assigned. Renderer code that keys off `outcomes` without checking `step` would render ghost rows.
**Fix:** Emit a clean idle state (empty outcomes/progress, no summary) and null out `_abortController` on these paths.

---

_Reviewed: 2026-06-12T18:14:37Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
