---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
plan: 02
subsystem: testing
tags: [typescript, vitest, gramjs-mock, target-resolution]

# Dependency graph
requires:
  - phase: 14-addexecutor-dispatch-privacy-fallback-audit
    provides: "14-01: src/shared/addTypes.ts and ADD_*/TARGET_ADD_CONTACT/TEMPLATE_* channel constants"
provides:
  - "src/main/telegram/__mocks__/telegramClient.ts: InviteToChannel/AddChatUser/ExportChatInvite/SendMessage/AddContact RPC dispatch branches with call-recording arrays and D-03/D-07/D-10/D-12 error-injection controls"
  - "src/main/telegram/__mocks__/telegramClient.ts: resolveUsernameResult/resolvePhoneResult/getUsersResult extended with optional deleted/bot/contact fields"
  - "src/main/telegram/TargetResolver.ts: getResolvedUser() returns { id, accessHash, name, deleted, bot, contact } for all three resolution paths"
affects: [14-07, 14-08, 14-09, AddExecutor, addExecutor.test.ts, contactService]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mock RPC dispatch branch (ctorName/className check -> extract fields -> record call -> check error config -> throw Object.assign(new Error(msg), { errorMessage: msg }) or return success shape) replicated for 5 new AddExecutor-required RPCs"
    - "AddChatUser mock error config fires only on the first recorded call per chatId, enabling D-03's fwd_limit 1000->100 retry sequence to be asserted in later tests"

key-files:
  created: []
  modified:
    - src/main/telegram/__mocks__/telegramClient.ts
    - src/main/telegram/TargetResolver.ts
    - src/main/telegram/targetResolver.test.ts

key-decisions:
  - "Extended resolveUsernameResult/resolvePhoneResult/getUsersResult mock config shapes with optional deleted/bot/contact fields (default false) — required to write the six new TargetResolver tests without inventing a new fixture convention; not explicitly listed in the plan's Task 1 action but within the plan's own files_modified scope and necessary per Task 2's read_first note (Rule 3 — blocking dependency)"
  - "AddChatUser mock records every call unconditionally (not just the first) and only throws the configured error on the first call per chatId, so a later AddExecutor test can assert the exact fwd_limit retry sequence (1000 then 100) per D-03"

patterns-established:
  - "Pattern: mock RPC branches track per-entity call arrays even when errors are configured, so tests can assert both the error/retry outcome and the exact call sequence that produced it"

requirements-completed: [ADD-05]

# Metrics
duration: 12min
completed: 2026-10-03
---

# Phase 14 Plan 02: AddExecutor Test Infrastructure (Mock RPCs + TargetResolver Flags) Summary

**Mock TelegramClient gains InviteToChannel/AddChatUser/ExportChatInvite/SendMessage/AddContact dispatch branches with call-recording and error-injection controls, and TargetResolver.getResolvedUser() now surfaces deleted/bot/contact flags for D-05's pre-check and D-08's contact service.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-03T22:30:30+02:00 (approx, following 14-01 completion)
- **Completed:** 2026-10-03T22:38:01Z
- **Tasks:** 2
- **Files modified:** 3 (0 created, 3 modified)

## Accomplishments
- `src/main/telegram/__mocks__/telegramClient.ts` extended with 5 new RPC dispatch branches (`InviteToChannel`, `AddChatUser`, `ExportChatInvite`, `SendMessage`, `AddContact`), each following the existing `EditBanned`/`EditChatParticipantRank` structural pattern exactly, plus matching `MockClientConfig` controls and call-recording arrays exposed on the returned client.
- `AddChatUser`'s error config is scoped to fire only on the first recorded call per `chatId` — the mechanism later AddExecutor tests need to exercise D-03's `fwd_limit` 1000→100 retry sequence.
- `TargetResolver.ts`'s `getResolvedUser()` extended to return `{ id, accessHash, name, deleted, bot, contact }` across all three resolution paths (username, phone, candidate), with the WR-02 stale-resolution restore path and `reset()` updated to cover the three new private fields symmetrically with the existing three.
- `targetResolver.test.ts` gained 6 new test cases covering per-path flag propagation, the fresh-resolver null case, `reset()` clearing the extended fields, and the all-false default when a mock user omits the flags.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the mock TelegramClient with the five new RPC branches** - `84ac782` (test)
2. **Task 2: Extend TargetResolver to retain deleted/bot/contact flags** - `add4b95` (feat)

**Plan metadata:** (this commit, created after this summary)

## Files Created/Modified
- `src/main/telegram/__mocks__/telegramClient.ts` - Added 5 new RPC dispatch branches, their config controls and call-recording arrays (Task 1); extended `resolveUsernameResult`/`resolvePhoneResult`/`getUsersResult` with optional `deleted`/`bot`/`contact` fields and wired them into the corresponding branches (Task 2, blocking dependency for the new tests)
- `src/main/telegram/TargetResolver.ts` - Added `_resolvedDeleted`/`_resolvedBot`/`_resolvedContact` private fields, written at all three resolution sites, cleared in `reset()`, rolled back in the WR-02 restore path, and surfaced via the extended `getResolvedUser()` return shape; added `contact?: boolean` to `ApiUserShape`
- `src/main/telegram/targetResolver.test.ts` - Added 6 new `it()` blocks covering the extension (no existing tests modified or deleted)

## Decisions Made
- Followed 14-PATTERNS.md's exact mock-branch skeletons and the plan's exact `TargetResolver.ts` insertion points; no deviation in shape or field names from the plan's `<action>` specification.
- Extended the mock's per-path result configs (`resolveUsernameResult`, `resolvePhoneResult`, `getUsersResult`) with optional `deleted`/`bot`/`contact` fields rather than inventing a parallel fixture mechanism — these three config shapes already existed and are the exact "existing fixture convention" the plan's Task 2 `read_first` pointed to; the real gap was that those shapes previously hardcoded `deleted: false, bot: false` with no override, which would have made 3 of the 6 required test cases impossible to write without this additive change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended mock result configs to accept deleted/bot/contact overrides**
- **Found during:** Task 2 (writing the 6 required test cases)
- **Issue:** The plan's Task 2 `<action>` only specifies changes to `TargetResolver.ts` and new `it()` blocks in `targetResolver.test.ts`, but the existing mock's `resolveUsernameResult`/`resolvePhoneResult`/`getUsersResult` branches hardcoded `deleted: false, bot: false` (and had no `contact` field at all) with no per-test override — making it impossible to construct a mock user with `deleted: true`, `bot: true`, or `contact: true` for the username/phone/candidate test cases the `<behavior>` block requires.
- **Fix:** Added optional `deleted?: boolean; bot?: boolean; contact?: boolean` fields (default `false` when omitted, preserving all existing test behavior) to the three config shapes, and wired them into the `ResolveUsername`, `ResolvePhone`, and `GetUsers` invoke branches.
- **Files modified:** `src/main/telegram/__mocks__/telegramClient.ts`
- **Verification:** `npx vitest run src/main/telegram/targetResolver.test.ts` — 34/34 pass (28 pre-existing + 6 new); `npx tsc --build` exits 0.
- **Committed in:** `add4b95` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The mock extension is purely additive (new optional fields default to the prior hardcoded `false` behavior) and was a hard prerequisite for 3 of the plan's own 6 required test cases. No scope creep — the change lives in the same file the plan's frontmatter already lists as `files_modified`.

## Issues Encountered

None beyond the deviation above. `npx tsc --build` produced no stray emitted `.js`/`.d.ts` files beside the modified sources in either task (confirmed via `git status --short` before each commit).

Two pre-existing, unrelated test failures were observed in a full `npx vitest run` (`src/main/telegram/config.test.ts` — `AUTH-03` build-time env injection assertions fail because `MRSPROPER_API_HASH`/`MRSPROPER_API_ID` are not set in this shell). These are out of scope for this plan (no file touched by this plan affects `config.ts` or its env injection) and were not modified or fixed, per the scope-boundary rule.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Every later Phase 14 plan can now call `createMockTelegramClient({ inviteToChannelErrorDialogIds, addChatUserMissingInviteeDialogIds, exportChatInviteResult, sendMessageError, addContactError, ... })` and read `resolver.getResolvedUser()?.deleted/.bot/.contact` without further scaffolding, satisfying this plan's `<success_criteria>` verbatim.
- `AddExecutor.ts` (Plans 14-07..14-09) can rely on `resolver.getResolvedUser()` returning the extended shape for its D-05 pre-flight guard and D-08's contact-service "already a contact" check.
- No blockers for downstream plans. The known open item (exact RPC error strings for `InviteToChannel`/`AddChatUser` needing live verification) remains tracked in STATE.md and is unaffected by this plan.

## Self-Check: PASSED

- FOUND: src/main/telegram/__mocks__/telegramClient.ts
- FOUND: src/main/telegram/TargetResolver.ts
- FOUND: src/main/telegram/targetResolver.test.ts
- FOUND: 84ac782 (Task 1 commit)
- FOUND: add4b95 (Task 2 commit)

---
*Phase: 14-addexecutor-dispatch-privacy-fallback-audit*
*Completed: 2026-10-03*
