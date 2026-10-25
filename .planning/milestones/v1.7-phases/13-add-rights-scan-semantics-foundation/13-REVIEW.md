---
phase: 13-add-rights-scan-semantics-foundation
reviewed: 2026-10-03T16:21:50Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/main/index.ts
  - src/main/telegram/GroupEnumerator.ts
  - src/main/telegram/MembershipScanner.ts
  - src/main/telegram/TagExecutor.ts
  - src/main/telegram/__mocks__/telegramClient.ts
  - src/main/telegram/groupEnumerator.test.ts
  - src/main/telegram/membershipScanner.test.ts
  - src/main/telegram/tagExecutor.test.ts
  - src/renderer/i18n/locales/cs/groups.json
  - src/renderer/i18n/locales/en/groups.json
  - src/shared/groupTypes.ts
findings:
  critical: 2
  warning: 5
  info: 5
  total: 12
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-10-03T16:21:50Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 13 adds `canAdd`/`addGreyReason` to `GroupEnumerator`, splits `banned` from `not-member` in `MembershipScanner`, and collapses `TagExecutor` onto the single shared GramJS client. `npx tsc --build` is clean and all 59 tests in the three touched suites pass. The TagExecutor consolidation is structurally sound and the deletion of the layer-224 machinery left no dangling imports.

Two correctness defects sit in the phase's primary deliverables and both are pinned by tests that encode the wrong behavior:

1. The `ChannelParticipantBanned.left` polarity is inverted relative to Telegram's actual semantics (`left=true` is the kicked-and-banned user; `left=false` is a restricted user who is still in the group). Add mode's unban-first flow (Phase 14) is built on this status, so shipping it inverted means the feature will never trigger for the users it exists for. The research document itself flagged this as unverified (Pitfall 5 / Assumption A2); the implementation followed D-01 literally without resolving it.
2. `_computeCanAdd` falls open to `true` whenever `defaultBannedRights` is absent. Broadcast channels never carry `default_banned_rights`, so every channel the admin merely subscribes to is reported as addable.

The remaining findings are robustness issues in TagExecutor's generation guard and several tests that cannot fail.

## Critical Issues

### CR-01: `ChannelParticipantBanned.left` polarity is inverted — kicked+banned users are reported as `not-member`

**File:** `src/main/telegram/MembershipScanner.ts:279-284` (contract pinned by `src/main/telegram/membershipScanner.test.ts:154-190`)
**Issue:** The code maps `left === true` to `'not-member'` and `left` unset/false to `'banned'`:

```ts
if (className === 'ChannelParticipantBanned') {
  const isLeft = (participant as { left?: boolean }).left === true
  return isLeft ? 'not-member' : 'banned'
}
```

In the TL schema (`node_modules/telegram/tl/static/api.tl:783`) `channelParticipantBanned` is documented as "Banned/kicked user" with `left: Whether the user has left the group`. The two real-world states are:

- `left = true` — the user was kicked and is **not** in the group; `banned_rights.view_messages` is set so they cannot rejoin. This is the "Removed users" list in official clients and the case Add mode must unban before re-inviting. TDLib maps this to `chatMemberStatusBanned`.
- `left = false` — the user is **still a participant** but restricted (partial `banned_rights`). This is the "Exceptions / Restricted users" list. TDLib maps this to `chatMemberStatusRestricted(is_member = true)`.

With the current mapping:
- A target that was kicked-and-banned (the exact "serial bad actor" this app targets) is reported `'not-member'`. Phase 14 will attempt a direct add, which Telegram refuses with `USER_KICKED`, and the unban-first path (D-01/D-02) is never offered.
- A target that is restricted-but-present is reported `'banned'`. Remove mode greys the row out (D-01: banned == not-member) even though the user is in the group and kickable; Add mode will issue an unban (which merely lifts their restrictions) and then fail with `USER_ALREADY_PARTICIPANT`.

The RESEARCH.md Pitfall 5 explicitly warned "If a UAT tester reports that a target who was fully kicked-and-banned shows as a normal 'not in this group' row ... the `left` polarity is inverted from what D-01 assumed." That is the shipped behavior.

**Fix:**
```ts
if (className === 'ChannelParticipantBanned') {
  // TL: left=true → kicked, not in group, cannot rejoin (needs unban-first).
  //     left=false → restricted but STILL a participant.
  const isLeft = (participant as { left?: boolean }).left === true
  return isLeft ? 'banned' : 'member'
}
```
Update the two tests at `membershipScanner.test.ts:154-190` to pin `left=true → 'banned'` and `left unset → 'member'`, and amend D-01 in 13-CONTEXT.md accordingly. If the team prefers not to reclassify restricted-present users as `'member'` in this phase, the conservative minimum (per Pitfall 5's own recommendation) is to return `'banned'` for both `left` values — never `'not-member'`.

### CR-02: `_computeCanAdd` returns `true` for every broadcast channel the admin merely subscribes to

**File:** `src/main/telegram/GroupEnumerator.ts:269-277` (consumed at `:234` for broadcast channels; test fixture at `src/main/telegram/groupEnumerator.test.ts:331-350`)
**Issue:**

```ts
return (
  entity.creator === true ||
  adminRights?.inviteUsers === true ||
  defaultBannedRights?.inviteUsers !== true
)
```

The third clause evaluates to `true` whenever `defaultBannedRights` is `undefined`. `channel.default_banned_rights` (`flags.14?`) is only populated for megagroups — broadcast channels have no member-level permissions at all; only the creator or an admin holding `invite_users` can add subscribers. So for a broadcast channel where the logged-in user is a plain subscriber (`creator` falsy, `adminRights` absent, `defaultBannedRights` absent) the function returns `canAdd = true`, `addGreyReason = null`. Every such channel will appear addable in Add mode and every add attempt will fail with `CHAT_ADMIN_REQUIRED`.

The "lacks invite right" test for broadcast channels only passes because its fixture sets `defaultBannedRights: { inviteUsers: true }`, a shape the server never sends for a broadcast channel. There is no test for the realistic shape (no `adminRights`, no `defaultBannedRights`).

**Fix:**
```ts
private _computeCanAdd(entity: Api.Chat | Api.Channel): boolean {
  const adminRights = entity.adminRights as { inviteUsers?: boolean } | null | undefined
  if (entity.creator === true || adminRights?.inviteUsers === true) return true

  // Broadcast channels have no member-level permissions: only creator/admin may add.
  if (entity instanceof Api.Channel && !entity.megagroup) return false

  // Megagroups / basic groups: open permissions unless the default mask forbids inviting.
  const defaultBannedRights = entity.defaultBannedRights as { inviteUsers?: boolean } | null | undefined
  return defaultBannedRights?.inviteUsers !== true
}
```
Add a test: broadcast channel with `creator: false`, no `adminRights`, no `defaultBannedRights`, `participantsCount: 50` → `canAdd === false`, `addGreyReason === 'no-invite-right'`.

## Warnings

### WR-01: TagExecutor's stale-run guard mutates the superseding run's job file and state

**File:** `src/main/telegram/TagExecutor.ts:176-181, 208-211, 221-225, 348-376`
**Issue:** All three in-loop guards treat `gen !== this._generation` and `signal.aborted` identically — both call `_markRemainingSkippedAndStop`, which writes `skipped` checkpoints into `_auditStore`, calls `setStatus('stopped')`, sets `_runActive = false`, and emits `step: 'stopped'`. When the generation changed because a **newer `execute()`** started (not an abort), `_auditStore` already holds the new run's job (`initJob` at `:161`), so the stale run:
- checkpoints its own leftover dialogs as `skipped` into the new job file (corrupting resume data),
- flips the job status to `stopped` while the new run is still `running`,
- clears `_runActive`, silencing flood-tick forwarding for the live run, and
- emits a `stopped` TagState over the top of the new run's `running` state.

Today only the double-start guard in `tagChannels.ts:106` prevents this in production; the executor is not safe on its own, and the unit test that targets this scenario (`tagExecutor.test.ts:442-464`) does not detect it (see WR-02). `RemovalExecutor` shares the same shape, but this file was fully rewritten in this phase.

**Fix:** Distinguish the two causes. Abort owns the "mark remaining skipped and emit stopped" path; supersession must exit silently:
```ts
if (gen !== this._generation) return               // superseded — newer run owns store/state
if (signal.aborted) {
  this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
  return
}
```
Apply at all three checkpoints (`:178`, `:209`, `:222`). Note `abortExecution()` increments `_generation` too, so check `signal.aborted` first or compare against a captured controller rather than the shared counter.

### WR-02: Generation-guard test cannot fail

**File:** `src/main/telegram/tagExecutor.test.ts:442-464`
**Issue:** The only assertions are
```ts
expect(['complete', 'stopped', 'hard-stopped']).toContain(lastState.step)
expect(executor.getState()).toBeDefined()
expect(editChatParticipantRankCalls.length).toBeGreaterThanOrEqual(0)
```
`getState()` always returns an object, `.length >= 0` is a tautology, and the first assertion accepts every terminal state including the corrupted `stopped` described in WR-01. The test provides zero protection for the behavior its name describes.

**Fix:** Assert the observable contract: after `Promise.allSettled`, the final state is `complete` for the second run; no `stopped` state is emitted after the second run's first `running` emission; `auditStore.checkpointCalls` contains each dialog at most once with status `done`; `setStatusCalls` does not include `stopped`.

### WR-03: New `canAdd` tests pass vacuously if `loaded` is never emitted

**File:** `src/main/telegram/groupEnumerator.test.ts:93-151, 228-266, 308-392`
**Issue:** Every new D-04/D-05/D-06 test wraps its assertions in `if (loaded?.step === 'loaded') { ... }` with no preceding `expect(loaded?.step).toBe('loaded')`. If enumeration emits `error` (or the fixture is wrong), the `if` body is skipped and the test passes with zero assertions. The first test in each `describe` has the guard; the new ones copied the body without it.

**Fix:** Add `expect(loaded?.step).toBe('loaded')` before each `if`, or `expect.assertions(2)` at the top of each test.

### WR-04: Tag precheck only recognizes `ChannelParticipantAdmin`; Creator/Banned/Left fall through to the write

**File:** `src/main/telegram/TagExecutor.ts:322-339`
**Issue:** `GetParticipant` returns a typed participant; only `'ChannelParticipantAdmin'` short-circuits. For `ChannelParticipantCreator` (an admin by definition), `ChannelParticipantBanned`, and `ChannelParticipantLeft` the code proceeds to `EditChatParticipantRank`, spends a governed write, and the server error lands in `_classifyTagError` as `UNKNOWN` (or `TAG_NO_RIGHTS` for creator). `MembershipScanner` already encodes these className semantics; the tag path ignores them and burns an extra rate-limited call per such group.

**Fix:**
```ts
const cls = participantResult?.participant?.className
if (cls === 'ChannelParticipantAdmin' || cls === 'ChannelParticipantCreator') {
  return { dialogId: dialog.id, status: 'skipped', errorCode: 'TAG_TARGET_IS_ADMIN', timestamp }
}
if (cls === 'ChannelParticipantBanned' || cls === 'ChannelParticipantLeft') {
  return { dialogId: dialog.id, status: 'failed', errorCode: 'TAG_USER_INVALID', timestamp }
}
```

### WR-05: PEER_FLOOD during an aborted group overrides the abort with `hard-stopped`

**File:** `src/main/telegram/TagExecutor.ts:197-204`
**Issue:** When `_tagGroup` rejects, the hard-stop branch calls `_emitHardStopped` with no generation/abort check. If the user pressed Stop while the write was in flight (`abortExecution()` incremented `_generation`, aborted and nulled the controller) and the write then rejected with `PEER_FLOOD`, the run ends `hard-stopped` (resumable, remaining groups left pending) rather than `stopped`, and the user's explicit stop is silently discarded. The post-await guard at `:209` is only reached on the success path.

**Fix:** Check the guard before emitting hard-stop:
```ts
if (classified.disposition === 'hard-stop') {
  if (gen !== this._generation || signal.aborted) {
    this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
  } else {
    this._emitHardStopped(outcomes, ctx)
  }
  return
}
```

## Info

### IN-01: Shared mock's new EditChatParticipantRank controls are dead — the test duplicates them locally

**File:** `src/main/telegram/__mocks__/telegramClient.ts:191-203, 221-224, 456-469, 560` and `src/main/telegram/tagExecutor.test.ts:107-141`
**Issue:** `editChatParticipantRankCalls`, `tagErrorDialogIds`, and the `EditChatParticipantRank` invoke branch were added to the shared mock, but `tagExecutor.test.ts` builds its own `vi.fn` client with an identical dispatch and never calls `createMockTelegramClient`. The shared additions are unreferenced by any test.
**Fix:** Either switch `makeTagExecutor` to `createMockTelegramClient({ tagErrorDialogIds, ... })` or remove the unused branch from the shared mock.

### IN-02: `_classifyTagError` hard-stop re-throw is unreachable and unsafe if reached

**File:** `src/main/telegram/TagExecutor.ts:408-412`
**Issue:** The caller at `:199-204` already handles hard-stop before calling `_classifyTagError`, so the `throw err` branch is dead. If it ever executed, the throw would escape `execute()` (the IPC `.catch(() => {})` swallows it), leaving `_runActive = true` and the state stuck at `running`.
**Fix:** Remove the branch, or make the function total (return an outcome) and keep hard-stop detection solely in the caller.

### IN-03: Post-loop generation guard is unreachable and incomplete

**File:** `src/main/telegram/TagExecutor.ts:228-231`
**Issue:** There is no `await` between the final in-loop guard (`:222`) and this check, so it can never observe a changed generation. If it did fire it would `return` without `setStatus`, without clearing `_runActive`, and without emitting — a stuck `running` state.
**Fix:** Delete the block, or route it through `_markRemainingSkippedAndStop` for consistency.

### IN-04: `already-member` and `banned-no-unban-right` are declared but never produced

**File:** `src/shared/groupTypes.ts:27-31`, `src/renderer/i18n/locales/{en,cs}/groups.json:9-12`
**Issue:** Two of the four `AddGreyReason` values and their bilingual copy have no producer in main. D-02 (`banned-no-unban-right` requires the ban right) has no computation anywhere in this phase. Expected for a foundation phase, but note that the renderer-side `tG(\`greyReason.${dialog.greyReason}\`)` lookup in `GroupRow.tsx:380` only reads `greyReason`, so `addGreyReason` copy is also unwired.
**Fix:** Track in Phase 14 scope; no code change required now.

### IN-05: `channel-full` overrides `no-invite-right` for admins who cannot invite at all

**File:** `src/main/telegram/GroupEnumerator.ts:234-239`
**Issue:** When the admin lacks the invite right **and** the channel has ≥200 subscribers, the reported reason is `channel-full`. D-06 says Phase 14's invite-link fallback will act on `channel-full`, but an admin without `invite_users` cannot generate invite links either, so the fallback would be offered to someone who cannot use it.
**Fix:** Only apply the override when the base rule allowed adding:
```ts
if (canAdd && memberCount !== null && memberCount >= 200) { canAdd = false; addGreyReason = 'channel-full' }
```

---

_Reviewed: 2026-10-03T16:21:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
