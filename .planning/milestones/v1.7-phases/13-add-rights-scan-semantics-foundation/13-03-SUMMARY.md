---
phase: 13-add-rights-scan-semantics-foundation
plan: 03
subsystem: api
tags: [typescript, gramjs, electron-main, vitest, tdd]

# Dependency graph
requires:
  - phase: 13-add-rights-scan-semantics-foundation
    provides: "AdminDialogDTO.canAdd/addGreyReason fields already threaded through tagExecutor.test.ts fixtures (13-01)"
  - phase: 11-tagexecutor
    provides: "Original two-phase layer-224 TagExecutor/tagClient/tagApi this plan deletes and consolidates"
provides:
  - "TagExecutor.ts collapsed to a single-client, single-loop state machine mirroring RemovalExecutor.ts exactly"
  - "tagClient.ts/tagClient.test.ts/tagApi.ts/tagApi.test.ts deleted (D-10) — dead layer-224 isolation machinery removed"
  - "main/index.ts TagExecutor wiring simplified to the same single-client shape as RemovalExecutor"
  - "__mocks__/telegramClient.ts extended with an EditChatParticipantRank dispatch branch (editChatParticipantRankCalls, tagErrorDialogIds)"
  - "D-11 regression test proving no 'unparseable response = success' tolerance exists on the tag write"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TagExecutor now a tag-flavored structural copy of RemovalExecutor: single injected client, single per-dialog try/catch loop, no second connection/lifecycle"
    - "Single mock client in a test file can dispatch multiple RPC request types (GetParticipant + EditChatParticipantRank) via the same ctorName/className switch used by the shared __mocks__/telegramClient.ts"

key-files:
  created: []
  modified:
    - src/main/telegram/TagExecutor.ts
    - src/main/index.ts
    - src/main/telegram/__mocks__/telegramClient.ts
    - src/main/telegram/tagExecutor.test.ts
  deleted:
    - src/main/telegram/tagClient.ts
    - src/main/telegram/tagClient.test.ts
    - src/main/telegram/tagApi.ts
    - src/main/telegram/tagApi.test.ts

key-decisions:
  - "TagExecutorClient mirrors RemovalExecutorClient's minimal { invoke(request): Promise<unknown> } shape exactly — no tag-specific client interface needed"
  - "_precheckGroup's input-peer construction + already-admin check folded into one private _tagGroup helper performing both the GetParticipant precheck AND the EditChatParticipantRank write for a dialog — exactly one loop over selectedDialogs, matching RemovalExecutor's _removeFromGroup shape"
  - "finally block removed entirely (RemovalExecutor.execute() has none) — _runActive reset inline at every return path instead"
  - "D-11 test uses an RPC-shaped error with an unrecognized errorMessage string (not a bare no-errorMessage Error) to actually exercise _classifyTagError's UNKNOWN fallthrough — classifyRpcError maps errors with NO errorMessage field to NETWORK/retry, not UNKNOWN, so a literal no-errorMessage parse failure would have asserted the wrong code"

patterns-established: []

requirements-completed: [TAG-07]

# Metrics
duration: 11min
completed: 2026-10-03
---

# Phase 13 Plan 03: Add Rights & Scan Semantics Foundation Summary

**TagExecutor collapsed from a two-phase layer-224/layer-198 dual-client state machine into a single-client, single-loop state machine issuing `Api.messages.EditChatParticipantRank` directly on the shared main client through `governor.run()`, with the dead `tagClient.ts`/`tagApi.ts` modules deleted.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-03T16:00:27Z (approx., per STATE.md session continuation from 13-02)
- **Completed:** 2026-10-03T16:11:17Z
- **Tasks:** 3 completed
- **Files modified:** 8 (4 modified, 4 deleted)

## Accomplishments
- `tagClient.ts`, `tagClient.test.ts`, `tagApi.ts`, `tagApi.test.ts` deleted outright (D-10) — the whole GramJS package now speaks TL layer 229 ambiently, so the two-phase isolation hack these files implemented is pure dead weight
- `TagExecutor.ts` rewritten to a single `for` loop over `selectedDialogs` (previously a Phase A precheck pass + Phase B write pass), with the already-admin `GetParticipant` check and the `EditChatParticipantRank` write both issued on the single shared client through `governor.run()` — no second client, no connect/disconnect lifecycle, no `_connectingTagClient` reconnect-race mutex
- `main/index.ts`'s `TagExecutor` wiring simplified from a `tagClientFactory`/`mainClient`/`restoreMainClientLayer` construction to the same single-`client` shape as `RemovalExecutor`'s wiring block immediately above it
- `__mocks__/telegramClient.ts` extended with an `EditChatParticipantRank` dispatch branch (`editChatParticipantRankCalls` recording array, `tagErrorDialogIds` error injection), mirroring the existing `EditBanned`/`DeleteChatUser` pattern, for future tests that use the shared mock
- `tagExecutor.test.ts` rewritten to a single-client `makeTagExecutor` fixture; all prior TAG-03/TAG-04 behavioral assertions (per-group dispatch count, already-admin skip, basic-group skip, PEER_FLOOD hard-stop, abort/generation guard, checkpoint-before-pacing ordering, governor-event forwarding) preserved in spirit (D-12), plus a new D-11 regression test proving no "unparseable response = success" tolerance exists
- Full test suite green aside from the 2 pre-existing, unrelated `config.test.ts` env-var failures (documented in 13-01's deferred-items.md) — 30/31 test files pass, 366/368 tests pass, net file count reduced by 2 (the deleted `tagClient.test.ts`/`tagApi.test.ts`), consistent with RESEARCH.md's "net reduction, not a coverage gap" expectation

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete dead layer-224 modules and consolidate TagExecutor.ts to a single-client loop** - `0ad079b` (feat)
2. **Task 2: Simplify main/index.ts TagExecutor wiring** - `24bbf81` (feat)
3. **Task 3 (TDD): Extend mock for EditChatParticipantRank and rewrite tagExecutor.test.ts to the single-client fixture** - `3664e8d` (test)

_Task 3 was marked `tdd="true"` but — like 13-02's precedent — the plan's own task ordering specifies rewriting the test file to match an implementation that already landed in Task 1, rather than a strict RED-before-GREEN sequence. All 14 tests (13 rewritten/kept + 1 new D-11 test) passed on first run after the rewrite; no RED commit was produced since the behavior under test was already implemented._

**Plan metadata:** `dc11d20` (docs: reword stale layer-224 comment references — see Deviations)

## Files Created/Modified
- `src/main/telegram/TagExecutor.ts` - Collapsed Phase A/B/C split into one loop; `TagExecutorOptions` now takes a single `client: TagExecutorClient`; `_precheckGroup` folded into `_tagGroup` (GetParticipant precheck + EditChatParticipantRank write, both via `this._governor.run(() => this._client.invoke(...))`); `finally` block removed, `_runActive` reset inline at every return path
- `src/main/index.ts` - Removed `TagClient` import and the `tagClientFactory` closure; `TagExecutor` now constructed with `{ client, governor, enumerator, resolver, auditStore, onStateChange }`, mirroring `RemovalExecutor`'s wiring cast pattern
- `src/main/telegram/__mocks__/telegramClient.ts` - Added `editChatParticipantRankCalls`/`tagErrorDialogIds` to `MockClientConfig`; added an `EditChatParticipantRank` dispatch branch in `invoke()`, exposed the recording array on the returned client
- `src/main/telegram/tagExecutor.test.ts` - Rewrote `makeTagExecutor` to a single `mockClient` whose `invoke()` dispatches both `GetParticipant` and `EditChatParticipantRank`; dropped all `connect`/`disconnect`/`restoreMainClientLayer`/`_connectingTagClient` lifecycle assertions (describe blocks "tagClient lifecycle (§4.3)" and "layer-224 / layer-198 isolation" removed entirely — no longer applicable with one client); added a new D-11 test
- `src/main/telegram/tagClient.ts`, `tagClient.test.ts`, `tagApi.ts`, `tagApi.test.ts` - Deleted (D-10)

## Decisions Made
- `_tagGroup` performs both the already-admin precheck AND the write for a dialog in one private helper, called once per dialog inside the single loop — matches the plan's requirement of "exactly one loop over selectedDialogs" while keeping `RemovalExecutor._removeFromGroup`'s one-private-method-per-dialog shape as the analog
- No `finally` block — `RemovalExecutor.execute()` has none, so `TagExecutor.execute()` now resets `_runActive = false` inline at each of its five return/exit paths instead, for exact structural parity
- The D-11 test throws an RPC-shaped error with an unrecognized `errorMessage` string rather than a bare `new Error('parse failure')` with no `errorMessage` field — `classifyRpcError` maps errors with no `errorMessage` to `NETWORK`/`retry` disposition (not `UNKNOWN`), so a literal no-`errorMessage` error would have produced the wrong assertion target; the chosen shape correctly exercises `_classifyTagError`'s `UNKNOWN` fallthrough and still proves the old TagClient-era "unparseable response = success" swallow is gone

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded two doc-comment references to "layer-224" that would have failed the plan's own verification grep**
- **Found during:** Final self-check pass across Task 1/Task 2 output, before the final SUMMARY commit
- **Issue:** The plan's `<verification>` section and Task 1's `acceptance_criteria` both require `grep -rn "AllTLObjects|layer-224|restoreMainClientLayer|tagClientFactory" src/main/telegram/TagExecutor.ts src/main/index.ts` to return zero matches. The explanatory doc comments I wrote (correctly describing that the two-phase isolation is *no longer needed*) still contained the literal token `layer-224`, which the grep cannot distinguish from a stale/active reference.
- **Fix:** Reworded both comments to say "two-phase, dual-connection TL-layer isolation" / "TL-layer isolation" instead of the literal `layer-224` token, with no change in meaning.
- **Files modified:** `src/main/telegram/TagExecutor.ts`, `src/main/index.ts`
- **Verification:** `grep -rn "AllTLObjects|layer-224|restoreMainClientLayer|tagClientFactory" src/main/telegram/TagExecutor.ts src/main/index.ts` now exits 1 (no matches); `npx tsc --build` still exits 0; `tagExecutor.test.ts`/`tlLayer.test.ts` still pass (20/20)
- **Committed in:** `dc11d20`

---

**Total deviations:** 1 auto-fixed (Rule 1 — a literal grep-matching bug in my own explanatory comments, not a behavioral change)
**Impact on plan:** No behavior or test assertion changed. Required to satisfy the plan's own stated acceptance criteria literally.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 13 (add-rights-scan-semantics-foundation) is now complete: all 3 plans (13-01 `canAdd`/`addGreyReason` foundation, 13-02 banned/not-member scan split, 13-03 this TagExecutor cleanup) are done
- TAG-07 (ROADMAP Phase 13 success criterion 4) is satisfied: `TagExecutor` contains no two-phase layer isolation logic, no `restoreMainClientLayer` calls, and no stale layer-224-literal comments
- The two pre-existing, unrelated `config.test.ts` failures (missing `MRSPROPER_API_ID`/`MRSPROPER_API_HASH` env vars in this environment) remain and are logged in 13-01's `deferred-items.md` — not a blocker for Phase 13 closure
- Phase 14 (AddExecutor) and Phase 15 (Add-mode renderer) are unaffected by this plan — no dependency on the TagExecutor consolidation; both can proceed independently

---
*Phase: 13-add-rights-scan-semantics-foundation*
*Completed: 2026-10-03*

## Self-Check: PASSED

All 5 referenced files found on disk; all 4 deleted files confirmed absent
(`src/main/telegram/tagClient.ts`, `tagClient.test.ts`, `tagApi.ts`, `tagApi.test.ts`);
all 4 referenced commit hashes (`0ad079b`, `24bbf81`, `3664e8d`, `dc11d20`) found in `git log`.
