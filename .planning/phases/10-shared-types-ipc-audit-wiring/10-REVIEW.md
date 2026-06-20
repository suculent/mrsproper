---
phase: 10-shared-types-ipc-audit-wiring
reviewed: 2026-06-20T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/shared/tagTypes.ts
  - src/shared/channels.ts
  - src/main/storage/tagAuditStore.ts
  - src/main/storage/tagAuditStore.test.ts
  - src/main/ipc/tagChannels.ts
  - src/main/ipc/tagChannels.test.ts
  - src/renderer/ipc/tagClient.ts
  - src/main/index.ts
  - src/preload/index.ts
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-06-20
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 10 delivers shared tag types, a tag-job.json audit store, IPC handler registration, a renderer-side tagClient, and wiring in main/index.ts. The implementation is structurally sound and faithfully mirrors the removal infrastructure. The T-05-04-B security invariant (identity sourced from resolver, never renderer) is correctly enforced in the `tag:start` Zod schema. The 0o600 file permission is applied correctly. The atomic write (tmp → rename) pattern is correct and well-tested.

Two critical issues are present: `tag:getJob` returns the raw `TagJobFile` containing `targetAccessHash` to the renderer — directly violating the stated security boundary from the T-10-01 comment in tagTypes.ts. And the dialog-map security gate silently passes through any `tag:start` call when the enumerator is not yet in the `'loaded'` step, meaning any dialogId can be injected before enumeration completes. Both issues are inherited from the removal analog and exist there as well.

---

## Critical Issues

### CR-01: `tag:getJob` leaks `targetAccessHash` to the renderer

**File:** `src/main/ipc/tagChannels.ts:146`

**Issue:** The `TAG_GET_JOB` handler returns `auditStore.readJob()` directly, which is a `TagJobFile` object. `TagJobFile` includes `targetAccessHash` (defined at `src/shared/tagTypes.ts:124`). This field crosses the IPC boundary and reaches the renderer (preload line 185–186, tagClient line 39–41).

`tagTypes.ts` line 74–76 explicitly states the security invariant: "targetAccessHash is intentionally omitted here — it lives in TagJobFile on disk (mode 0o600) and in main process memory only. The renderer receives targetId/targetName for display purposes but never the accessHash." The `getJob` handler violates this invariant.

The only purpose of `tag:getJob` in the renderer is to detect a pending job (check `status !== 'complete'`) and display identity (targetName, tag, dialogIds count) in a Resume/Discard dialog. `targetAccessHash` is never needed by the renderer for any of those purposes.

This is the same defect in `removalChannels.ts` line 169–171 and has been carried forward into the tag implementation.

**Fix:** Strip `targetAccessHash` before returning across IPC. Use a renderer-safe projection type:

```typescript
// In tagChannels.ts, replace the TAG_GET_JOB handler body:
ipcMain.handle(TAG_GET_JOB, async () => {
  const job = auditStore.readJob()
  if (!job) return null
  // Strip targetAccessHash before crossing the IPC boundary (T-10-01 security invariant)
  const { targetAccessHash: _omit, ...safeJob } = job
  return safeJob
})
```

A corresponding `TagJobSafe` type (omitting `targetAccessHash`) should be declared in `tagTypes.ts` and used as the return type of `getTagJob()` in `tagClient.ts` and the preload bridge.

---

### CR-02: Dialog-map security gate is bypassed when enumerator is not in `'loaded'` state

**File:** `src/main/ipc/tagChannels.ts:113`

**Issue:** The dialog-map check at line 114 is wrapped in `if (groupsState.step === 'loaded')`. When the enumerator is in `'idle'`, `'loading'`, or `'error'` state (all valid `GroupsState` steps per `src/shared/groupTypes.ts:81-84`), the gate is silently skipped and `executor.execute()` is called with whatever `dialogIds` the renderer supplied.

A renderer could send `tag:start` with arbitrary `dialogIds` during the brief window when groups are loading or when the enumerator hasn't been triggered yet. The auth gate (Layer 2) still fires, but the dialog-id containment that prevents injection of groups outside the admin's actual communities is inactive.

The removal channel has the identical pattern at `removalChannels.ts:112`.

**Fix:** Reject the call (return current state without dispatching) unless the enumerator is in `'loaded'` state. The executor cannot do anything meaningful with groups that haven't been enumerated anyway:

```typescript
// Layer 4: Dialog security gate — enumerator must be loaded (T-10-07)
const groupsState = enumerator.getState()
if (groupsState.step !== 'loaded') {
  // Enumeration not ready — cannot validate dialogIds; return current state
  return executor.getState()
}
const knownIds = new Set(groupsState.dialogs.map((d) => d.id))
const unknownIds = parsed.dialogIds.filter((id) => !knownIds.has(id))
if (unknownIds.length > 0) {
  throw new Error(
    `Payload contains unknown dialogId(s) — not in current enumeration: ${unknownIds.join(', ')}`
  )
}
```

---

## Warnings

### WR-01: `emitTagState` is imported but never called — tag state pushes are dead in Phase 10

**File:** `src/main/index.ts:18`

**Issue:** `emitTagState` is imported from `./ipc/tagChannels` at line 18 but is never used anywhere in `main/index.ts`. The stub executor passed to `registerTagChannels` at line 327 has no `onStateChange` callback wiring:

```typescript
{ getState: () => IDLE_TAG_STATE, abortExecution: () => {}, execute: async () => {} }
```

This means `TAG_STATE` push events are never emitted to the renderer during Phase 10. Any renderer component subscribed via `onTagState()` will never receive updates. This is explicitly noted as a Phase 11 TODO, but the *import* of `emitTagState` is dead code that will cause a TypeScript/linter warning and confuse readers expecting to see where it is called.

**Fix:** Either remove the `emitTagState` import from `main/index.ts` until Phase 11 wires it, or add a comment making the forward-reference explicit:

```typescript
// Phase 11 wires: import { registerTagChannels, emitTagState } from './ipc/tagChannels'
import { registerTagChannels } from './ipc/tagChannels'
```

---

### WR-02: `tag` field validated with `max(255)` but Telegram API enforces a 16-character limit for custom titles

**File:** `src/main/ipc/tagChannels.ts:55`

**Issue:** The `TagStartSchema` validates `tag: z.string().min(1).max(255)`. However, `tagTypes.ts` line 9–10 describes "TAG_TARGET_IS_ADMIN — target is already an admin; tagging would overwrite their admin rank (same field as custom title)." Telegram's MTProto API (`channels.editAdmin`) enforces a hard 16-character limit on `custom_title`. A tag longer than 16 characters will be rejected by Telegram at execution time with a `TITLE_INVALID` error, silently causing every group to fail.

This means the Zod gate passes values that will fail at the API level, providing false validation confidence. The executor will have to handle the API rejection per-group anyway, but the IPC layer should ideally reject clearly oversized values before dispatching.

**Fix:** Lower the `max` to match the Telegram API limit (16 characters):

```typescript
tag: z.string().min(1).max(16),
```

If the 255-char limit is intentional (e.g., the tag implementation uses a different Telegram API path that allows longer values), document this explicitly and ensure the executor handles `TITLE_INVALID` as a per-group fail code.

---

### WR-03: `tagAuditStore.test.ts` has no test for `setStatus` or `clearJob`

**File:** `src/main/storage/tagAuditStore.test.ts`

**Issue:** The test file covers `initJob`, `checkpoint`, `readJob` (three cases), incomplete job detection, `getRemaining`, and the 0o600 mode check. It does not test:

- `setStatus` — the method called when a run transitions to `'complete'`, `'stopped'`, or `'hard-stopped'`. A regression in `setStatus` (e.g., accidentally discarding `outcomes`) would silently corrupt the persisted checkpoint without any test catching it.
- `clearJob` — the method called on Discard. An unlink failure (e.g., ENOENT when file is absent) would surface as an uncaught exception rather than a no-op, and the no-op guarantee is untested.

The removal analog `auditStore.test.ts` also lacks these tests (it has 7 tests vs. 8 in the tag store — and neither covers `setStatus`/`clearJob`).

**Fix:** Add tests for `setStatus` and `clearJob`:

```typescript
it('setStatus: updates status field and re-writes atomically', () => {
  const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
  store.initJob(makeTagJob())
  store.setStatus('complete', '2026-06-20T15:00:00.000Z')
  const written = JSON.parse(fakeFs._files[FINAL_PATH]!) as TagJobFile
  expect(written.status).toBe('complete')
  expect(written.completedAt).toBe('2026-06-20T15:00:00.000Z')
})

it('clearJob: deletes the job file and returns empty remaining list', () => {
  const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
  store.initJob(makeTagJob())
  expect(fakeFs._files[FINAL_PATH]).toBeDefined()
  store.clearJob()
  expect(fakeFs._files[FINAL_PATH]).toBeUndefined()
  expect(store.getRemaining()).toEqual([])
})

it('clearJob: no-op when no job file present', () => {
  const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
  expect(() => store.clearJob()).not.toThrow()
})
```

---

## Info

### IN-01: `tagChannels.test.ts` has no test for the dialog-map gate bypass when enumerator is not `'loaded'`

**File:** `src/main/ipc/tagChannels.test.ts`

**Issue:** The test suite covers the happy-path dialog-map gate (line 220–235: throws on unknown dialogId when enumerator is loaded). It does not test the case where `getState()` returns `{ step: 'loading' }` or `{ step: 'idle' }`, which currently silently passes any dialogId through (the CR-02 bypass). Even after fixing CR-02, a regression test for this path is missing.

**Fix:** Add a test:

```typescript
it('tag:start — dialog-map gate: passes through when enumerator is loading (current bypass)', async () => {
  const executor = makeMockExecutor()
  const enumerator = { getState: vi.fn(() => ({ step: 'loading' as const })) }
  // ... register and invoke, assert execute is NOT called once CR-02 is fixed
})
```

---

### IN-02: `void win` suppression in `registerTagChannels` is a code smell

**File:** `src/main/ipc/tagChannels.ts:88`

**Issue:** `win` is accepted as a parameter but immediately suppressed with `void win`. The parameter exists only so the function signature matches the removal analog. Since `emitTagState` is a separate exported function (not a closure over `win`), the `win` parameter to `registerTagChannels` currently serves no purpose — it is neither used inside the handlers nor referenced elsewhere in the function body.

This mirrors the same pattern in `removalChannels.ts`, where `emitRemovalState` *is* called from a closure that captures `win` via `main/index.ts`. But for `tagChannels.ts`, the `win` param is structurally superfluous (Phase 11 will pass `win` to `emitTagState` directly from main/index.ts, not via closure inside `registerTagChannels`).

**Fix:** Once Phase 11 is wired, reconsider whether `win` should be a parameter at all. If `emitTagState` is always called from `main/index.ts` (not inside `registerTagChannels`), remove `win` from the function signature to eliminate the suppression. If the design intent is to eventually close over `win` inside the handlers (as removal does), document that explicitly.

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
