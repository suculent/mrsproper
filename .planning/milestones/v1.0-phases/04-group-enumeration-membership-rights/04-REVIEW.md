---
phase: 04-group-enumeration-membership-rights
reviewed: 2026-06-11T23:18:39Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/main/index.ts
  - src/main/ipc/groupChannels.test.ts
  - src/main/ipc/groupChannels.ts
  - src/main/telegram/GroupEnumerator.ts
  - src/main/telegram/MembershipScanner.ts
  - src/main/telegram/__mocks__/telegramClient.ts
  - src/main/telegram/groupEnumerator.test.ts
  - src/main/telegram/membershipScanner.test.ts
  - src/preload/index.ts
  - src/renderer/auth/CountryPicker.tsx
  - src/renderer/components/ui/checkbox.tsx
  - src/renderer/components/ui/scroll-area.tsx
  - src/renderer/groups/GroupRow.tsx
  - src/renderer/groups/GroupsPane.tsx
  - src/renderer/groups/groupsCopy.ts
  - src/renderer/ipc/groupsClient.ts
  - src/renderer/shell/AppShell.tsx
  - src/renderer/store/groupsStore.ts
  - src/renderer/target/TargetCard.tsx
  - src/shared/channels.ts
  - src/shared/groupTypes.ts
findings:
  critical: 3
  warning: 7
  info: 8
  total: 18
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-06-11T23:18:39Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Reviewed the Phase 4 group enumeration, membership scan, and checklist UI implementation (main-process services, IPC layer, preload bridge, renderer store/components, and tests). The security boundary work is solid: `AdminDialogDTO` omits `accessHash` by construction, `scan:start` carries no payload, `scan:retryGroup` is Zod-validated and gated against the in-memory dialog list, and all push emitters guard `win.isDestroyed()`.

The defects cluster in **scan-lifecycle coordination**: nothing resets the scanner when the target changes, so a completed scan for target A is silently presented as target B's results (violating D-15 and the product's core "right person" guarantee); `retryGroup()` has no generation guard and can both crash on stale state and merge a cross-target result; and the renderer store wipes the user's manual deselections — the input to the destructive removal — every time a `complete` state is re-emitted. These three must be fixed before this code ships.

## Critical Issues

### CR-01: Stale scan results from a previous target are shown for a newly confirmed target — scan never re-runs

**File:** `src/renderer/groups/GroupsPane.tsx:64-77`, `src/main/telegram/MembershipScanner.ts:165-172`, `src/main/ipc/targetChannels.ts` (reset handler — no scanner wiring)
**Issue:** D-15 requires "scan re-runs on every target confirm — no result caching." It does not. Trace:
1. Target A confirmed → checklist mode → scan runs → `scan.step === 'complete'`.
2. User clicks "Change target" → mode flips to `browse`. The abort effect (`GroupsPane.tsx:64-69`) only fires when `scan.step === 'scanning'` — a **completed** scan is left in `complete` state. Nothing in main resets the scanner on `TARGET_RESET` either (`targetChannels.ts` only calls `resolver.reset()`).
3. User resolves and confirms target B → mode flips to `checklist`. The auto-start effect (`GroupsPane.tsx:72-77`) requires `scan.step === 'idle'`, but the step is still `complete` → **no new scan starts**.

Result: target A's membership results — including the pre-checked removal set — are displayed and attributed to target B. In a tool whose core value is "remove the *right* person," this presents the wrong person's group membership as confirmed data. Relatedly, `checkedDialogIds` survives target reset in `groupsStore.ts`, even though the "Change target" tooltip promises "Clears this person and any group selections."
**Fix:** Reset scan state on target change in the main process (single source of truth), e.g. in `targetChannels.ts` call `scanner.abortScan()` (or a new `scanner.reset()`) inside the `TARGET_RESET` and `TARGET_RESOLVE` handlers, which emits `{ step: 'idle' }` and lets the existing auto-start effect fire on the next confirm. Also clear `checkedDialogIds` in the renderer when target leaves `confirmed`:

```ts
// targetChannels.ts
ipcMain.handle(TARGET_RESET, () => {
  resolver.reset()
  scanner.abortScan() // scan state → idle; D-15 re-scan on next confirm
  return resolver.getState()
})
```

### CR-02: `retryGroup()` has no generation guard — crashes on stale state and merges a result for the wrong target

**File:** `src/main/telegram/MembershipScanner.ts:184-215`
**Issue:** Two related defects from the same root cause (no `_generation` check across the `await`):
1. **Runtime TypeError.** The `step !== 'complete'` guard at line 185 runs only before the await. If the state changes during `_checkMembership()` (e.g. `abortScan()` → `idle`, or a new `scan()` → `scanning`/`error`), line 210 executes `this._currentState.results.map(...)` on a state variant that has no `results` (`idle`, `error`) → `TypeError: Cannot read properties of undefined (reading 'map')`, rejecting the IPC invoke. TypeScript's narrowing from line 185 is unsound across awaits and hides this.
2. **Cross-target merge.** `retryGroup()` reads `this._resolver.getResolvedUser()` *at call time*. If the user changed and confirmed a new target after the scan that produced the `complete` results, the retry checks the **new** target's membership and merges that result into the **old** target's results array — a silent data-integrity corruption of the removal checklist.
**Fix:** Capture the generation and re-validate state after the await:

```ts
async retryGroup(dialogId: string): Promise<void> {
  if (this._currentState.step !== 'complete') return
  const gen = this._generation
  // ... resolve target, find dialog ...
  const isMember = await this._checkMembership(dialog, inputUser, resolved)
  // Stale-state guard: a new scan/abort/target-change invalidates this retry
  if (gen !== this._generation || this._currentState.step !== 'complete') return
  const updatedResults = this._currentState.results.map(...)
  this._emit({ step: 'complete', results: updatedResults })
}
```
(Also increment `_generation` on target change per CR-01's `reset()`.)

### CR-03: Pre-check recompute on every `complete` emission wipes the user's manual deselections from the removal set

**File:** `src/renderer/store/groupsStore.ts:51-67`
**Issue:** The `onScanState` subscriber rebuilds `checkedDialogIds` from scratch (all actionable members) **every time** a `complete` state arrives. `MembershipScanner.retryGroup()` re-emits `{ step: 'complete', ... }` after merging a single result. Sequence: scan completes → all member groups pre-checked → user deliberately **unchecks** groups they want to keep the person in → user clicks "retry" on one failed row → retry completes → `complete` re-emitted → the store **re-checks every group the user unchecked**. The checked set is the direct input to bulk removal (Phase 5); silently re-adding deselected groups means the destructive action would target groups the admin explicitly excluded. The final-confirmation screen is the only remaining safety net, and a user who already reviewed the list is primed to confirm.
**Fix:** Pre-check only on the transition *into* `complete` (track previous scan step), and on retry-merge only update entries whose status changed:

```ts
scanStateSub = groupsClient.onScanState((s: ScanState) => {
  const wasComplete = currentState.scan.step === 'complete'
  if (s.step === 'complete' && !wasComplete) {
    // first completion of this scan → compute pre-check set
    ...
    setState({ scan: s, checkedDialogIds })
    return
  }
  if (s.step === 'complete' && wasComplete) {
    // retry merge → preserve user's checked set; optionally add newly-member dialogs
    setState({ scan: s })
    return
  }
  setState({ scan: s })
})
```

## Warnings

### WR-01: Scan `error` state has no UI — checklist shows perpetual loading skeletons with no message or recovery

**File:** `src/renderer/groups/GroupsPane.tsx:83-89, 146-198`, `src/renderer/groups/GroupRow.tsx:86`
**Issue:** When `scan.step === 'error'` (emitted by `MembershipScanner.scan()` when the resolver returns null or groups aren't loaded), `getMembershipStatus()` returns `null` for every row → every row renders the pulsing skeleton checkbox indefinitely. `renderEmptyState()` handles browse-mode errors and the complete/empty case but has no branch for checklist-mode scan errors. No error copy, no retry affordance, and the auto-start effect (deps `[mode]`) will not re-fire. This is reachable in normal use: confirming a target while group enumeration is still `loading` makes `scan()` emit `error` immediately.
**Fix:** Add a checklist-mode error branch in `renderEmptyState()` using `GROUP_ERROR_COPY[scan.code]` plus a "Retry scan" button calling `groupsActions.startScan()`. Additionally, gate the auto-start effect on `groups.step === 'loaded'` (and include it in the effect deps) so confirming during enumeration defers the scan instead of failing it.

### WR-02: Scan issues governed Telegram calls for non-actionable groups — wasted flood budget and guaranteed failures on broadcast channels

**File:** `src/main/telegram/MembershipScanner.ts:126-154`
**Issue:** The scan loop iterates **all** dialogs, including rows where `canAct === false` (broadcast channels, no-rights groups). Each is a serialized, governed Telegram call. Two consequences: (1) for an admin with many channels/groups, the scan burns rate-limit budget on rows whose result can never be acted on — directly against the project's FLOOD_WAIT constraint; (2) `channels.GetParticipant` on a broadcast channel where the user is a plain subscriber returns `CHAT_ADMIN_REQUIRED`, which the inner catch re-throws → `status: 'failed'` → the user sees "N groups couldn't be verified. You can retry them above." for rows that can never succeed, and retrying burns more budget.
**Fix:** Skip non-actionable dialogs in the loop: `if (!dialog.canAct) { results.push({ dialogId: dialog.id, status: 'not-member' }) ... continue }` (or introduce a distinct `'skipped'` status so the UI doesn't conflate it with a verified non-member).

### WR-03: `refresh()` clears `_dialogMap` while a scan is in flight — in-flight checks degrade to `accessHash: 0` and fail

**File:** `src/main/telegram/GroupEnumerator.ts:136-139`, `src/main/telegram/MembershipScanner.ts:236-251`
**Issue:** `GROUPS_REFRESH` can arrive mid-scan (the refresh button is enabled in checklist mode). `refresh()` synchronously clears `_dialogMap`, then awaits re-enumeration. The scan's next `_checkMembership()` calls `getDialogEntity()` → `null` → the supergroup path falls back to `accessHash: bigInt.zero` (line 250-251) → `CHANNEL_INVALID` from Telegram → spurious `failed` rows. The code comment at lines 243-246 explicitly documents that `bigInt.zero` is the failure mode being avoided, yet the fallback reintroduces it.
**Fix:** Either clear `_dialogMap` only after the new dialog list arrives (build a new map and swap atomically), or have `refresh()` abort any in-flight scan first (consistent with CR-01's scanner reset).

### WR-04: `ChatParticipantsForbidden` is reported as `not-member` instead of `failed`

**File:** `src/main/telegram/MembershipScanner.ts:310-312`
**Issue:** For basic groups, `messages.GetFullChat` returns `ChatParticipantsForbidden` (no `participants` array) when the participant list is inaccessible. The code does `result.fullChat?.participants?.participants ?? []` → `[]` → `some()` → `false` → status `not-member`. That asserts a verified fact ("this person is not in this group") when the truth is "membership could not be determined." The row then sorts into the non-actionable partition with no retry affordance, silently excluding a group the target may actually be in.
**Fix:** Distinguish the absent-array case from an empty membership list:

```ts
const container = result.fullChat?.participants
if (!container || !Array.isArray((container as { participants?: unknown[] }).participants)) {
  throw new Error('PARTICIPANTS_UNAVAILABLE') // outer loop → status 'failed' (retryable)
}
```

### WR-05: FLOOD_WAIT error copy promises an automatic reload that never happens

**File:** `src/renderer/groups/groupsCopy.ts:33`, `src/main/telegram/GroupEnumerator.ts:105-113`
**Issue:** `GROUP_ERROR_COPY.FLOOD_WAIT` says "The group list will load automatically when Telegram allows it." There is no automatic retry anywhere: the governor's flood budget is exhausted by the time the error state is emitted, and D-14 specifies manual refresh only. A user hitting this will wait indefinitely for a reload that never comes, with no hint that the Refresh button is the recovery path.
**Fix:** Change copy to match actual behavior, e.g. "Telegram is rate-limiting requests right now. Wait a minute, then tap Refresh."

### WR-06: Tests construct `RateLimitGovernor` with the wrong argument shape, masked by `as never`

**File:** `src/main/telegram/membershipScanner.test.ts:65, 278, 351, 411, 451`
**Issue:** `new RateLimitGovernor(mockClient as never)` passes the client where `GovernorOptions` is expected (correct usage — `new RateLimitGovernor({ client })` — appears in `groupEnumerator.test.ts:21`). It only works because the constructor currently does `void options.client` and reads `options.onEvent`/`options.timingSource` (both `undefined` on the client object). If the governor ever dereferences `options.client` (the constructor comment says Phase 3+ may), these five tests break in a confusing way — or worse, silently exercise a misconfigured governor. The `as never` cast was used specifically to bypass the type error that would have caught this.
**Fix:** `const governor = new RateLimitGovernor({ client: mockClient })` — no cast needed.

### WR-07: Basic-group grey reason `'not-creator'` produces wrong copy for non-creator admins

**File:** `src/main/telegram/GroupEnumerator.ts:166-167`, `src/renderer/groups/groupsCopy.ts:13`
**Issue:** For basic groups, `canAct = creator || adminRights.banUsers` (OQ-2 OR logic), but every `canAct=false` row gets `greyReason: 'not-creator'` → "Only group creators can remove members here." This is false by the code's own logic: a non-creator admin with `banUsers` *can* act. A user who is an admin but lacks the ban right reads copy telling them only the creator can do this — actionable guidance (ask for the ban right) is replaced by wrong information. Supergroups already distinguish this correctly with `'no-ban-right'`.
**Fix:** Mirror the supergroup logic: if `entity.adminRights` exists but `banUsers` is falsy → `'no-ban-right'`; if the user is a plain member → `'not-admin'` (the code already defines that `GreyReason` variant and never uses it).

## Info

### IN-01: Unused import `ScanProgressDTO` in MembershipScanner

**File:** `src/main/telegram/MembershipScanner.ts:30`
**Issue:** `ScanProgressDTO` is imported but never referenced in the file (progress objects are typed structurally via `ScanState`).
**Fix:** Remove it from the import list.

### IN-02: `getGreyCopy()` is dead code with an unreachable fallback

**File:** `src/renderer/groups/groupsCopy.ts:80-82`
**Issue:** No file imports `getGreyCopy` (`GroupRow` indexes `GROUP_GREY_COPY` directly), and the `?? GROUP_GREY_COPY['verify-failed']` fallback is unreachable for a fully-keyed `Record<GreyReason, string>`.
**Fix:** Delete the function, or adopt it in `GroupRow` if a runtime fallback is actually wanted.

### IN-03: `abortScan` return type disagrees between preload and renderer interface

**File:** `src/preload/index.ts:90-91`, `src/renderer/ipc/groupsClient.ts:14`
**Issue:** Preload casts `abortScan` to `Promise<ScanState>` (and the main handler does return `scanner.getState()`), but the global `MrsProperApi` augmentation declares `abortScan(): Promise<void>`. The returned state is silently discarded; the two declared contracts contradict each other.
**Fix:** Align both to `Promise<ScanState>` (matching `startScan`).

### IN-04: Store bootstrap fetches groups state but never scan state

**File:** `src/renderer/store/groupsStore.ts:69-73`
**Issue:** `startSubscriptions()` calls `getGroupsState()` to hydrate, but not `getScanState()`. If the last subscriber unmounts and a new one mounts (subscriptions torn down and rebuilt), any scan-state transitions that occurred while unsubscribed are lost until the next push.
**Fix:** Also bootstrap `void groupsClient.getScanState().then((s) => setState({ scan: s }))`.

### IN-05: `enumerateAtLogin()` never clears `_dialogMap` — stale entities accumulate

**File:** `src/main/telegram/GroupEnumerator.ts:88-114, 136-139`
**Issue:** Only `refresh()` clears the map; `enumerateAtLogin()` (fired on every `authorized` transition, e.g. logout→login) only adds/overwrites. Entities for groups the admin has left linger in main-process memory indefinitely. Currently harmless (lookups are gated on the loaded list) but a slow leak and a latent stale-data source.
**Fix:** Move `this._dialogMap.clear()` into `enumerateAtLogin()` (or build a fresh map and swap on success, which also helps WR-03).

### IN-06: Mock `'ChannelBroadcast'` entity variant is dead config

**File:** `src/main/telegram/__mocks__/telegramClient.ts:125, 327-329`
**Issue:** `getDialogsResult.entity` accepts `'ChannelBroadcast'`, but the mapping only branches on `'Chat'` — `'ChannelBroadcast'` falls into the generic Channel branch identically to `'Channel'`. No test uses it.
**Fix:** Remove the variant from the union (tests express broadcast via `megagroup: false`).

### IN-07: `AppShell` uses `min-h-screen`, which can defeat the inner ScrollArea's height containment

**File:** `src/renderer/shell/AppShell.tsx:19`
**Issue:** `min-h-screen` lets the flex column grow beyond the viewport when content is tall; `main`'s `flex-1 overflow-hidden` then doesn't pin the pane height, so the `ScrollArea` in `GroupsPane` may stretch with content instead of scrolling, pushing scrolling to the window for long group lists.
**Fix:** Use `h-screen` (or `h-dvh`) on the shell root so `flex-1` resolves against a fixed height.

### IN-08: Test hygiene — `'PEER_FLOOD' as any` and unused test imports

**File:** `src/main/telegram/groupEnumerator.test.ts:9, 256`, `src/main/telegram/membershipScanner.test.ts:13`
**Issue:** `getDialogsError: 'PEER_FLOOD' as any` bypasses the `MockRPCErrorCode` union instead of extending it — the cast hides that the mock's error vocabulary is incomplete for governor hard-stop scenarios. `vi` is imported but unused in `groupEnumerator.test.ts`; `beforeEach` is imported but unused in `membershipScanner.test.ts`.
**Fix:** Add `'PEER_FLOOD'` to `MockRPCErrorCode`; drop the unused imports.

---

_Reviewed: 2026-06-11T23:18:39Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
