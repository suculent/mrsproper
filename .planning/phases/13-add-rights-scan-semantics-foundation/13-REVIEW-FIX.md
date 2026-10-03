---
phase: 13-add-rights-scan-semantics-foundation
fixed_at: 2026-10-03T17:12:08Z
review_path: .planning/phases/13-add-rights-scan-semantics-foundation/13-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-10-03T17:12:08Z
**Source review:** .planning/phases/13-add-rights-scan-semantics-foundation/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (fix_scope: critical_warning — CR-01, CR-02, WR-01..WR-05)
- Fixed: 7
- Skipped: 0

Verification: `npx tsc --build` clean after every fix; touched suites run per fix; final full run `npx vitest run` — 31 files, 375 tests, all passing. All commits were made on an isolated worktree branch and fast-forwarded onto `main`.

Note for the team: `npx tsc --build` emits gitignored `.js`/`.jsx`/`.d.ts` artifacts beside every source file in `src/`. Under Vitest those artifacts shadow the `.ts` sources (an earlier verification run here silently exercised compiled output rather than the edited sources until the artifacts were deleted). Delete them after any `tsc --build` before running Vitest.

## Fixed Issues

### CR-01: `ChannelParticipantBanned.left` polarity is inverted — kicked+banned users are reported as `not-member`

**Files modified:** `src/main/telegram/MembershipScanner.ts`, `src/main/telegram/membershipScanner.test.ts`, `.planning/phases/13-add-rights-scan-semantics-foundation/13-CONTEXT.md`
**Commit:** c779ba7
**Status:** fixed: requires human verification (logic contract change)
**Applied fix:** Mapping is now `left === true` → `'banned'` (kicked, not in the group, cannot rejoin — Add mode needs unban-first) and `left` unset/false → `'member'` (restricted but still a participant), matching the TL schema (`channelParticipantBanned ... left:flags.0?true` — "whether the user has left the group", verified in `node_modules/telegram/tl/static/api.tl:783`). Both scanner tests re-pinned to the new contract; code comment rewritten; D-01 in 13-CONTEXT.md amended with a dated revision note recommending a live-account check of both `left` states before Phase 14 builds on it.

### CR-02: `_computeCanAdd` returns `true` for every broadcast channel the admin merely subscribes to

**Files modified:** `src/main/telegram/GroupEnumerator.ts`, `src/main/telegram/groupEnumerator.test.ts`
**Commit:** ade7bba
**Applied fix:** `_computeCanAdd` now returns `false` for a broadcast channel (`Api.Channel` with `!megagroup`) unless `creator` or `adminRights.inviteUsers`; the open-permissions `defaultBannedRights` clause applies only to megagroups/basic groups. Doc comment updated. Added the realistic-fixture test (broadcast channel, `creator: false`, no `adminRights`, no `defaultBannedRights`, 50 subscribers → `canAdd false`, `addGreyReason 'no-invite-right'`). Also folded in IN-05 (trivial and clearly correct): the `channel-full` override now applies only when the base rule allowed adding, so an admin without the invite right keeps `no-invite-right` instead of being offered the Phase 14 invite-link fallback they cannot use; added a test for that case and renamed the existing ">= 200" test title to reflect that its fixture holds the invite right.

### WR-01: TagExecutor's stale-run guard mutates the superseding run's job file and state

**Files modified:** `src/main/telegram/TagExecutor.ts`
**Commit:** 9d60616
**Applied fix:** All in-loop guards (and the post-loop guard) now check `signal.aborted` first — abort owns the `_markRemainingSkippedAndStop` path — and treat a bare generation mismatch as supersession by a newer `execute()`, exiting silently without touching `_auditStore`, `_runActive`, or emitted state. Order matters because `abortExecution()` also increments `_generation`. `RemovalExecutor` was reviewed as a reference but shares the same undifferentiated shape, so there was no existing correct pattern to mirror; it was not modified (out of scope for this review).

### WR-02: Generation-guard test cannot fail

**Files modified:** `src/main/telegram/tagExecutor.test.ts`
**Commit:** 4d56961
**Applied fix:** Replaced the tautological assertions with the observable contract: the second run ends `complete`, no `stopped` state is ever emitted, each dialog is checkpointed exactly once with status `done`, and `setStatusCalls` contains `complete` but never `stopped`. Verified the rewritten test fails against the pre-WR-01 executor (it observed `stopped` plus two `skipped` checkpoints) and passes after it.

### WR-03: New `canAdd` tests pass vacuously if `loaded` is never emitted

**Files modified:** `src/main/telegram/groupEnumerator.test.ts`
**Commit:** 0b1915e
**Applied fix:** Inserted `expect(loaded?.step).toBe('loaded')` before every `if (loaded?.step === 'loaded')` block (19 sites added; all 23 conditional blocks in the file are now hard-asserted, including pre-existing ones that had the same gap). Suite still passes, confirming none were masking an `error` emission.

### WR-04: Tag precheck only recognizes `ChannelParticipantAdmin`; Creator/Banned/Left fall through to the write

**Files modified:** `src/main/telegram/TagExecutor.ts`, `src/main/telegram/tagExecutor.test.ts`
**Commit:** 7cf5d3e
**Applied fix:** `ChannelParticipantCreator` now short-circuits with `skipped`/`TAG_TARGET_IS_ADMIN`; `ChannelParticipantLeft` and `ChannelParticipantBanned` with `left === true` short-circuit with `failed`/`TAG_USER_INVALID` without spending a governed write. Adapted from the reviewer's suggestion to stay consistent with the CR-01 contract: `ChannelParticipantBanned` with `left` false/unset is a restricted-but-present member, so it still proceeds to the write and lets the server decide. Added a `participantOverrides` knob to the test harness and four tests (Creator skip, Left invalid, kicked-Banned invalid, restricted-Banned proceeds to write). `_tagGroup` doc comment updated.

### WR-05: PEER_FLOOD during an aborted group overrides the abort with `hard-stopped`

**Files modified:** `src/main/telegram/TagExecutor.ts`, `src/main/telegram/tagExecutor.test.ts`
**Commit:** 491a6a3
**Applied fix:** The hard-stop branch now applies the same split as the in-loop guards before emitting: `signal.aborted` → `_markRemainingSkippedAndStop` (user's Stop wins); generation mismatch → silent return (superseded run); otherwise `_emitHardStopped`. Added a test that calls `abortExecution()` from inside the in-flight write before rejecting with `PEER_FLOOD`, asserting the run ends `stopped` (never `hard-stopped`), job status is `stopped`, and the remaining group is marked `skipped`. Verified the test fails against the pre-fix executor (`hard-stopped`).

## Not addressed (out of scope: Info-tier)

- IN-01, IN-02, IN-03, IN-04 — left as-is (fix_scope was critical_warning). IN-03's unreachable post-loop guard was incidentally made consistent with the in-loop guards as part of WR-01 but not removed.
- IN-05 — folded into CR-02 (see above).

---

_Fixed: 2026-10-03T17:12:08Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
