---
phase: 05-removal-execution-engine
reviewed: 2026-06-12T14:00:00Z
depth: standard (with cross-file contract checks)
files_reviewed: 16
files_reviewed_list:
  - src/main/telegram/RemovalExecutor.ts
  - src/main/storage/auditStore.ts
  - src/main/ipc/removalChannels.ts
  - src/main/telegram/GroupEnumerator.ts
  - src/main/index.ts
  - src/preload/index.ts
  - src/renderer/store/removalStore.ts
  - src/renderer/ipc/removalClient.ts
  - src/renderer/removal/removalCopy.ts
  - src/renderer/removal/RemovalConfirmDialog.tsx
  - src/renderer/removal/ResumeJobDialog.tsx
  - src/renderer/groups/GroupRow.tsx
  - src/renderer/groups/GroupsPane.tsx
  - src/renderer/target/TargetCard.tsx
  - src/shared/removalTypes.ts
  - src/main/ipc/targetChannels.ts
findings:
  critical: 5
  warning: 5
  info: 3
  total: 13
status: fixed
---

# Phase 5: Code Review Report

**Reviewed:** 2026-06-12T14:00:00Z
**Depth:** standard with cross-file IPC ↔ executor ↔ auditStore ↔ store ↔ component contract checks
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The removal execution engine is substantially correct: GramJS mechanics, generation-token abort, PEER_FLOOD hard-stop, and atomic job-file persistence are all well-implemented and match the RESEARCH spec exactly. The security gate stack (Zod → auth → enumerator map) is sound.

Five blocking issues were found spanning three classes: (1) a double-start race that allows `removal:start` to be called a second time while a job is already running, rewriting the active job file and creating an orphaned run; (2) the `targetName` is hardcoded to the empty string in the job file and all emitted state, making job file audit records useless and the Resume dialog misleading; (3) a crash-on-empty-string in `getAvatarColor` when `targetId === ''` (the dialog can open before a target is confirmed); (4) resume flow does not clear `pendingJob` in the renderer store when the user clicks Resume, leaving the `ResumeJobDialog` visible in the background; (5) the `aria-label` on the destructive confirm button is hardcoded to "ban" regardless of the `severity` prop, which is a correctness problem when the Phase 6 kick path activates.

Five warnings were found: the `dialogSet` variable constructed in `execute()` is never used; the `abortExecution()` idle-reset path emits a state from inside the abort call AND the `execute()` loop can subsequently emit a second `stopped` state when the loop unwinds, producing a double-emit; the PEER_FLOOD Resume button in `GroupsPane` calls `removalActions.startRemoval()` directly without clearing `pendingJob`, causing the ResumeJobDialog to appear behind the active progress slot; `retryGroup` does not guard against the executor being in `hard-stopped` state; and `initJobCalled` is set to a primitive `false` before it is reassigned inside `initJob`, so the test's closure never captures the mutation.

---

## Critical Issues

### CR-01: `removal:start` IPC handler does not block when executor is already running — double-start overwrites active job

**File:** `src/main/ipc/removalChannels.ts:92-119`

**Issue:** `registerRemovalChannels` dispatches `executor.execute()` fire-and-forget with no guard on the current step. If the renderer sends a second `removal:start` while the first run is in flight (e.g., user double-clicks, or two windows exist), `execute()` increments `_generation` and calls `this._auditStore.initJob(newJob)`, which overwrites the active job file on disk. The old run's loop then re-checks `gen !== this._generation`, detects staleness, and calls `setStatus('stopped')` — but by then `_currentJob` in `auditStore` is already the new job, not the old one. The old run's remaining-group checkpoints write to the new job's outcomes array. Both runs are now corrupted.

**Fix:**
```typescript
// In removalChannels.ts, inside the REMOVAL_START handler, before executor.execute():
const currentStep = executor.getState().step
if (currentStep === 'running' || currentStep === 'stopping') {
  return executor.getState()  // silently return current state; do not re-start
}
// ...then fire-and-forget as before
executor.execute({ severity: parsed.severity, dialogIds: parsed.dialogIds }).catch(() => {})
```

---

### CR-02: `targetName` is hardcoded to `''` in `RemovalExecutor.execute()` — job file is missing the target name on every run; Resume dialog shows blank name

**File:** `src/main/telegram/RemovalExecutor.ts:150`

**Issue:** `const targetName = '' // Resolved from resolver; display name TBD at IPC layer`. The executor has access to the `resolver`, which already holds the resolved target including a display name. The job file is persisted with `targetName: ''`, and all emitted `RemovalState` objects use `targetName: ''`. This means: (1) the audit trail on disk has no human-readable target identity; (2) the `ResumeJobDialog` renders `removalCopy.resumeTitle('')` → "Finish removing ?" which is confusing; (3) `removalCopy.progressLabel('', x, n)` in `GroupsPane` renders "Removing  from group X of N…" with a blank name.

The resolver interface already exposes `{ id: bigint; accessHash: bigint }` — to get the name, the resolver needs to expose it. Looking at the existing `TargetResolver`, `getResolvedUser()` returns the identity object. The `RemovalExecutorOptions.resolver` type is `{ getResolvedUser(): { id: bigint; accessHash: bigint } | null }` which does not include `name`. The resolver must be widened to expose name, or `targetName` must be passed in via the IPC payload from the renderer (which already has it as `confirmedTarget.name`).

The cleanest fix without changing the security boundary: extend `RemovalExecutorOptions.resolver` to include `name` in the resolved object, since `TargetResolver` already has it:
```typescript
// In RemovalExecutor.ts, line 58:
resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string } | null }

// line 150:
const targetName = resolved.name ?? ''
```

Alternatively, pass `targetName` as a parameter to `execute()` (the IPC layer already has it from `confirmedTarget.name`):
```typescript
// In removalChannels.ts: extend executor.execute() call with targetName read from resolver or passed in
```

Either approach must be applied; the current empty string is a data loss defect in the audit trail.

---

### CR-03: `getAvatarColor(targetId)` in `RemovalConfirmDialog` throws `SyntaxError: Cannot convert  to a BigInt` when `targetId === ''`

**File:** `src/renderer/removal/RemovalConfirmDialog.tsx:37,107`

**Issue:** `getAvatarColor` calls `BigInt(seed)`. When `seed` is an empty string, `BigInt('')` throws `SyntaxError: Cannot convert  to a BigInt` in V8. The dialog is rendered with `open={confirmOpen}` and `targetId={targetId}` where `targetId = confirmedTarget?.id ?? ''`. Although `confirmOpen` is only set to `true` after the user clicks the run-trigger button (which requires `mode === 'checklist' && scan.step === 'complete'`, which in turn requires a confirmed target), a defensive crash is possible if any rendering path invokes `getAvatarColor('')`.

More critically: React evaluates the entire JSX tree even when `open={false}` because `RemovalConfirmDialog` is always mounted in `GroupsPane` (line 521-530). The `avatarBg = getAvatarColor(targetId)` expression at line 107 runs on every render. When `GroupsPane` is rendered before a target is confirmed (`targetId === ''`), this throws and unmounts the tree.

**Fix:**
```typescript
// In RemovalConfirmDialog.tsx:
function getAvatarColor(seed: string): string {
  if (!seed) return AVATAR_COLORS[0]
  return AVATAR_COLORS[Number(BigInt(seed) % 7n)]
}
```
The same fix applies to `GroupRow.tsx:40` and `TargetCard.tsx:38` which have the same pattern, but those components only render with a valid `dialog.id` (never empty) — the most urgent fix is `RemovalConfirmDialog.tsx`.

---

### CR-04: `ResumeJobDialog` `onOpenChange` wired to `handleDiscard` — pressing Escape or clicking outside the dialog silently discards the job without user intent

**File:** `src/renderer/removal/ResumeJobDialog.tsx:50`

**Issue:**
```tsx
<Dialog open={open} onOpenChange={handleDiscard}>
```
The Radix `Dialog` component fires `onOpenChange(false)` when the user presses Escape or clicks the backdrop. Here that callback is `handleDiscard`, which calls `removalActions.discardJob()` (clears the job file from disk). A user who dismisses the dialog by accident — pressing Escape to "close" it — permanently loses their incomplete job with no warning. The CONTEXT.md mandates "no silent auto-resume for a destructive action"; the same principle applies in reverse: no silent irreversible discard.

**Fix:**
```typescript
// Wire onOpenChange to a no-op so the dialog can only be dismissed via explicit button clicks:
<Dialog open={open} onOpenChange={() => {}}>
// Or wire to a confirm-before-discard path; at minimum do NOT call discardJob on backdrop/Esc.
```

---

### CR-05: Resume flow in `removalStore.startRemoval()` does not clear `pendingJob` — `ResumeJobDialog` stays rendered behind the active run

**File:** `src/renderer/store/removalStore.ts:110-116`

**Issue:** When the user clicks "Resume removal" in `ResumeJobDialog`, `handleResume` calls `removalActions.startRemoval(...)` and then `onOpenChange(false)`. But `onOpenChange` is wired to `handleDiscard` (CR-04 above), meaning clicking "Resume" calls `handleDiscard` which calls `discardJob()`. If CR-04 is fixed by wiring `onOpenChange` to a no-op, the Resume path then has its own problem: `startRemoval()` in `removalStore` never clears `pendingJob`:

```typescript
async startRemoval(severity, dialogIds): Promise<void> {
  try {
    const s = await removalClient.startRemoval(severity, dialogIds)
    setState(s)   // ← updates currentState
    // pendingJob is NOT cleared here
  } catch (err) { ... }
}
```

`GroupsPane` renders `ResumeJobDialog` when `pendingJob && pendingJob.status !== 'complete'` (line 512). Since `pendingJob` is not cleared, the dialog remains open throughout the entire resumed run.

**Fix:**
```typescript
async startRemoval(severity: 'kick' | 'ban', dialogIds: string[]): Promise<void> {
  try {
    const s = await removalClient.startRemoval(severity, dialogIds)
    setState(s)
    pendingJob = null   // ← clear on successful dispatch
    notify()
  } catch (err) {
    console.error('[removalStore] startRemoval:', err)
  }
},
```

---

## Warnings

### WR-01: `dialogSet` is constructed but never used in `execute()` — dead code (TS6133 suppressed)

**File:** `src/main/telegram/RemovalExecutor.ts:143`

**Issue:**
```typescript
const dialogSet = new Set(params.dialogIds)   // line 143 — never read
const selectedDialogs = params.dialogIds
  .map(id => allDialogs.find(d => d.id === id))   // line 144-146
```
`dialogSet` was presumably intended to be used instead of `allDialogs.find()` for O(1) membership checks, but the code correctly builds `selectedDialogs` via `.map(id => allDialogs.find(...))` without using `dialogSet`. The VERIFICATION.md notes this as a TS6133 suppressed pre-existing issue, but it is a code smell confirming partial logic.

**Fix:** Remove `const dialogSet = new Set(params.dialogIds)` (line 143) entirely.

---

### WR-02: `abortExecution()` can produce a double-emit of `stopped` state when called during an active run

**File:** `src/main/telegram/RemovalExecutor.ts:333-361`

**Issue:** `abortExecution()` unconditionally emits a `stopped` state (line 345-349) when `_currentState.step === 'running'`. Then, the `execute()` loop is still running in a microtask (the `governor.run()` or pacing sleep is in-flight). When that microtask resolves, the loop's generation guard fires, then the loop also calls `this._emit({ step: 'stopped', ... })` with a correctly built summary. This means two consecutive `stopped` emissions arrive at the renderer:

1. First from `abortExecution()` — with potentially stale `outcomes` from `_currentState` (since the loop may have added outcomes after the last `_emit` call).
2. Second from the loop's own abort path — with correct outcomes.

The second emission is correct. The first is premature and based on a snapshot that may be out of date. While the loop's second emission fixes the final state, React's concurrent rendering can briefly display the stale first state.

**Fix:** Remove the immediate `_emit` from `abortExecution()` for the running/stopping case. Let the `execute()` loop's own generation-guard path emit the `stopped` state with accurate outcomes. `abortExecution()` only needs to increment generation and abort the controller:
```typescript
abortExecution(): void {
  const wasActive = this._currentState.step === 'running' || this._currentState.step === 'stopping'
  this._generation++
  if (this._abortController) {
    this._abortController.abort()
    this._abortController = null
  }
  // For idle/complete/stopped: reset to idle immediately (TARGET_RESET path)
  if (!wasActive) {
    this._emit({ step: 'idle', severity: this._currentState.severity,
      targetId: '', targetName: '', progress: { processed: 0, total: 0 }, outcomes: [] })
  }
  // For active run: let execute()'s generation guard emit 'stopped' with correct outcomes
}
```

---

### WR-03: PEER_FLOOD Resume button in `GroupsPane` calls `startRemoval` directly without clearing `pendingJob` and without re-reading `auditStore` for remaining groups

**File:** `src/renderer/groups/GroupsPane.tsx:322-339`

**Issue:**
```tsx
if (pendingJob) {
  void removalActions.startRemoval(
    pendingJob.severity,
    pendingJob.dialogIds.filter(
      (id) => !pendingJob.outcomes.find((o) => o.dialogId === id)
    )
  )
}
```
This path computes remaining groups from the in-memory `pendingJob` object, not from `auditStore.getRemaining()` on disk. If the app was killed (PEER_FLOOD hard-stopped, then relaunched), `pendingJob` comes from `getRemovalJob()` bootstrap which is correct. But during an in-session PEER_FLOOD (without restart), `pendingJob` is still the stale on-launch snapshot — it does not reflect groups checkpointed during the current session. Additionally, `startRemoval()` does not clear `pendingJob` (see CR-05), so after clicking this button the `ResumeJobDialog` will also appear if it was not already dismissed.

**Fix:** Use the same remaining-computation that `ResumeJobDialog` uses (filter from current `pendingJob` or invoke `removal:getJob` to re-read disk state), AND clear `pendingJob` after dispatching (same fix as CR-05).

---

### WR-04: `retryGroup()` does not guard against `hard-stopped` step — a per-group retry is silently no-op'd when the job is `hard-stopped`

**File:** `src/main/telegram/RemovalExecutor.ts:369-374`

**Issue:**
```typescript
async retryGroup(dialogId: string): Promise<void> {
  if (
    this._currentState.step !== 'complete' &&
    this._currentState.step !== 'stopped'
  ) {
    return  // ← returns early for 'hard-stopped' too
  }
```
A `hard-stopped` job may have per-group `failed` rows (from groups processed before the PEER_FLOOD) visible in the UI with "retry removal" links. The user clicks retry → `retryRemovalGroup(dialogId)` IPC call → `executor.retryGroup()` returns immediately because `step === 'hard-stopped'` is not in the allowed list. The UI never updates, the retry link stays clickable, and no error is surfaced. The IPC handler also calls `executor.retryGroup(...).catch()` discarding errors, so no feedback reaches the renderer.

**Fix:**
```typescript
if (
  this._currentState.step !== 'complete' &&
  this._currentState.step !== 'stopped' &&
  this._currentState.step !== 'hard-stopped'
) {
  return
}
```

---

### WR-05: `aria-label` on the destructive confirm button is hardcoded to "ban" regardless of `severity` prop

**File:** `src/renderer/removal/RemovalConfirmDialog.tsx:168`

**Issue:**
```tsx
<Button
  variant="destructive"
  onClick={handleConfirm}
  aria-label={`Confirm ban from ${n} groups`}   // ← hardcoded "ban"
```
The dialog already has a `severity` prop and correctly renders `removalCopy.confirmDestructive(severity, n)` as the button text. But the `aria-label` bypasses severity and always says "ban". When Phase 6 activates the kick path, screen reader users receive incorrect accessible text.

**Fix:**
```tsx
aria-label={severity === 'ban'
  ? `Confirm ban from ${n} groups`
  : `Confirm removal from ${n} groups`}
```
Or simply omit `aria-label` entirely (the visible button text from `removalCopy.confirmDestructive(severity, n)` is already accessible and accurate).

---

## Info

### IN-01: `initJobCalled` tracking in test `makeAuditStore()` factory is broken — property never mutates

**File:** `src/main/telegram/removalExecutor.test.ts:57,64-66`

**Issue:**
```typescript
let initJobCalled = false
// ...
return {
  initJobCalled,   // ← copies the boolean VALUE at return time; always false
  initJob(job) {
    initJobCalled = true  // ← mutates the closure variable, not the returned property
```
The returned object has `initJobCalled: false` (primitive copy). Mutations to the closure variable `initJobCalled` never update `auditStore.initJobCalled`. Any test asserting `auditStore.initJobCalled === true` after `initJob()` was called would incorrectly get `false`. (No test currently asserts this, which is why the bug is latent.)

**Fix:**
```typescript
const state = { initJobCalled: false }
return {
  get initJobCalled() { return state.initJobCalled },
  initJob(job) {
    state.initJobCalled = true
    _dialogIds = [...job.dialogIds]
  },
  // ...
}
```

---

### IN-02: `severity` prop on `RemovalConfirmDialog` in `GroupsPane` is hardcoded to `"ban"` — will silently ignore Phase 6 kick severity

**File:** `src/renderer/groups/GroupsPane.tsx:524`

**Issue:**
```tsx
<RemovalConfirmDialog
  ...
  severity="ban"    // ← hardcoded, not derived from store/state
```
Phase 5 hardcodes ban for all verification runs (CONTEXT locked decision). However the `removalStore` already carries `removal.severity`. When Phase 6 adds the kick/ban selector, this hardcoded prop will silently override it — the confirm dialog will always say "Ban" even when the user selected "Kick".

**Fix:** Use `removal.severity` from the store (which is already destructured in scope):
```tsx
severity={removal.severity}
```

---

### IN-03: Unused `void win` in `registerRemovalChannels` masks that `win` is genuinely unused in the function body

**File:** `src/main/ipc/removalChannels.ts:87`

**Issue:**
```typescript
// Suppress unused warning — win used by emitRemovalState wired in main/index.ts
void win
```
The comment is accurate — `win` is passed to `emitRemovalState` externally. But `void win` inside `registerRemovalChannels` is dead code (the function does not use `win` at all). The correct pattern used in other channel files is to not accept `win` as a parameter if it is not used in the registration function. This is a minor inconsistency with the `searchChannels.ts` pattern this file claims to mirror.

**Fix:** Either remove `win` from `registerRemovalChannels`'s parameter list (with `emitRemovalState` accepting `win` independently) or accept and document the deviation. Not a runtime issue.

---

_Reviewed: 2026-06-12T14:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard with cross-file contract checks_

---

## Fixes Applied

_Fixed: 2026-06-12_
_Fixer: Claude (gsd-code-fixer)_

| Finding | Status | Commit | Files |
|---------|--------|--------|-------|
| CR-01 | fixed | 3240ffc | `src/main/ipc/removalChannels.ts`, `src/main/ipc/removalChannels.test.ts` |
| CR-02 | fixed | e7b8808 | `src/main/telegram/TargetResolver.ts`, `src/main/telegram/RemovalExecutor.ts` |
| CR-03 | fixed | 0b095af | `src/renderer/removal/RemovalConfirmDialog.tsx` |
| CR-04 | fixed | 65356a3 | `src/renderer/removal/ResumeJobDialog.tsx` |
| CR-05 | fixed | 65356a3 | `src/renderer/store/removalStore.ts` |
| WR-01 | fixed | dca1820 | `src/main/telegram/RemovalExecutor.ts` |
| WR-02 | fixed | b31e306 | `src/main/telegram/RemovalExecutor.ts` |
| WR-03 | fixed | 2609066 | `src/renderer/store/removalStore.ts`, `src/renderer/groups/GroupsPane.tsx` |
| WR-04 | fixed | 8888f76 | `src/main/telegram/RemovalExecutor.ts` |
| WR-05 | fixed | 0713ce4 | `src/renderer/removal/RemovalConfirmDialog.tsx` |
| IN-01 | fixed | 2eeb9e6 | `src/main/telegram/removalExecutor.test.ts` |
| IN-02 | fixed | 2eeb9e6 | `src/renderer/groups/GroupsPane.tsx` |
| IN-03 | skipped | — | Not a runtime issue; removing `win` from signature would cascade to `main/index.ts`; deviation accepted |
