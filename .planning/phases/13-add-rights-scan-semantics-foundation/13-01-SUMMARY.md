---
phase: 13-add-rights-scan-semantics-foundation
plan: 01
subsystem: api
tags: [typescript, gramjs, electron-main, i18next, vitest, tdd]

# Dependency graph
requires:
  - phase: 04-group-enumeration
    provides: GroupEnumerator._classifyDialog/_buildDTO canAct computation pattern this plan extends
provides:
  - "AdminDialogDTO.canAdd/addGreyReason computed in GroupEnumerator for every enumerated dialog, zero new Telegram API calls"
  - "AddGreyReason shared type (already-member, no-invite-right, channel-full, banned-no-unban-right) and widened MembershipStatus ('banned')"
  - "Bilingual (en/cs) greyReason i18n copy for the four new AddGreyReason values"
  - "Mock telegramClient getDialogsResult support for adminRights.inviteUsers/defaultBannedRights/participantsCount"
affects: [14-add-executor, 15-add-mode-renderer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rights computed in main process only (canAdd/addGreyReason colocated with canAct/greyReason in GroupEnumerator._classifyDialog) — renderer never derives add-eligibility (ADD-04, CLAUDE.md invariant)"
    - "Broadcast-channel canAdd is independent of canAct — a channel can be add-eligible while remaining non-kickable"

key-files:
  created: []
  modified:
    - src/shared/groupTypes.ts
    - src/main/telegram/GroupEnumerator.ts
    - src/main/telegram/groupEnumerator.test.ts
    - src/main/telegram/__mocks__/telegramClient.ts
    - src/renderer/i18n/locales/en/groups.json
    - src/renderer/i18n/locales/cs/groups.json

key-decisions:
  - "canAdd = creator === true || adminRights.inviteUsers === true || defaultBannedRights.inviteUsers !== true (open-permissions default — not forbidden means any member may invite)"
  - "Broadcast-channel 200-member channel-full override is applied AFTER the base canAdd rule and only on the broadcast-channel branch, not basic-group/supergroup"
  - "AddGreyReason's 'banned-no-unban-right' and 'already-member' values are data-foundation only in this plan — their gating/sort logic ships in Phase 15"

patterns-established:
  - "Pattern: widen a shared DTO field defensively by grepping every AdminDialogDTO object-literal construction across the repo (test fixtures), not just the producing module, before declaring tsc --build clean"

requirements-completed: [ADD-02, ADD-03, ADD-04]

# Metrics
duration: 18min
completed: 2026-10-03
---

# Phase 13 Plan 01: Add Rights & Scan Semantics Foundation Summary

**AdminDialogDTO now carries main-process-computed `canAdd`/`addGreyReason` (creator/inviteUsers/defaultBannedRights-derived, zero new API calls) with bilingual grey-reason copy, split cleanly from removal's `canAct`/`greyReason` on broadcast channels.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-03T15:29:00Z (approx., per STATE.md session start)
- **Completed:** 2026-10-03T15:47:46Z
- **Tasks:** 3 completed
- **Files modified:** 13 (8 source/test files touched by the plan's 3 tasks + 1 deferred-items.md + 2 todo file renames; see commits)

## Accomplishments
- `AdminDialogDTO.canAdd`/`addGreyReason` computed in `GroupEnumerator` for every basic-group, supergroup, and broadcast-channel dialog, with the broadcast-channel `canAdd`/`canAct` split proven by test (D-06, ADD-03)
- `AddGreyReason` type + 4 bilingual i18n keys shipped as the foundation Phase 15's Add mode UI will consume
- Both stale CountryPicker todos confirmed already-shipped and closed
- Full test suite green aside from 2 pre-existing, unrelated, environment-dependent failures (documented below)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend shared types, i18n grey-reason copy, and mock client config** - `6b78768` (feat)
2. **Task 2 (TDD RED): add failing canAdd/addGreyReason tests** - `3d96120` (test)
3. **Task 2 (TDD GREEN): compute canAdd/addGreyReason in GroupEnumerator** - `2cbca4e` (feat)
4. **Task 3: Verify and close the two folded CountryPicker todos** - `549384a` (docs)

_TDD task (Task 2) produced two commits: test (RED) → feat (GREEN), per the plan's `tdd="true"` requirement. No REFACTOR commit was needed — the GREEN implementation matched the PATTERNS.md-specified shape with no cleanup required._

## Files Created/Modified
- `src/shared/groupTypes.ts` - Added `AddGreyReason` type, `AdminDialogDTO.canAdd`/`addGreyReason` fields, widened `MembershipStatus` with `'banned'`
- `src/main/telegram/GroupEnumerator.ts` - Added `_computeCanAdd` helper; wired `canAdd`/`addGreyReason` through all three `_classifyDialog` branches and `_buildDTO`
- `src/main/telegram/groupEnumerator.test.ts` - Added 10 new tests covering D-04/D-05/D-06 behaviors (basic-group, supergroup, broadcast-channel canAdd/channel-full)
- `src/main/telegram/__mocks__/telegramClient.ts` - Extended `MockClientConfig.getDialogsResult` with `adminRights.inviteUsers`, `defaultBannedRights`, `participantsCount`; threaded through the `getDialogs` mock for both `Api.Chat` and `Api.Channel`
- `src/renderer/i18n/locales/en/groups.json` / `cs/groups.json` - Added 4 new `greyReason` keys (already-member, no-invite-right, channel-full, banned-no-unban-right)
- `src/main/ipc/groupChannels.test.ts`, `src/main/telegram/{membershipScanner,participantSearcher,removalExecutor,tagExecutor}.test.ts`, `src/renderer/wizard/{reviewScreen,tagValidation}.test.ts` - Added `canAdd: true, addGreyReason: null` to pre-existing `AdminDialogDTO` test fixtures broken by the widened interface (out-of-plan-scope files, fixed per Rule 3 — blocking compile errors)
- `.planning/todos/done/2026-06-11-default-country-czechia.md`, `.planning/todos/done/2026-06-11-country-picker-rows-clickable.md` - Moved from `pending/` (confirmed already-shipped)
- `.planning/phases/13-add-rights-scan-semantics-foundation/deferred-items.md` - Logged the 2 pre-existing out-of-scope `config.test.ts` failures

## Decisions Made
- `_computeCanAdd` mirrors the existing `canAct` OR-logic pattern exactly (creator / explicit right / not-forbidden-default), colocated in the same method rather than a separate rights module, per PATTERNS.md guidance
- Broadcast-channel `channel-full` override is scoped to that branch only — basic-group/supergroup never get `addGreyReason='channel-full'`, confirmed via grep acceptance criteria
- Widening `AdminDialogDTO` required fixing 7 out-of-plan test fixture files that construct the DTO as object literals (not spreads) — treated as Rule 3 (blocking compile error), not scope creep, since the plan's own Task 1 acceptance criteria required `tsc --build` to exit 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed 7 out-of-scope test fixtures broken by the widened `AdminDialogDTO` interface**
- **Found during:** Task 1 verification (`npx tsc --build`)
- **Issue:** Adding required fields `canAdd`/`addGreyReason` to `AdminDialogDTO` broke TS2739 compile errors in 7 test files outside this plan's `files_modified` list (`groupChannels.test.ts`, `membershipScanner.test.ts`, `participantSearcher.test.ts`, `removalExecutor.test.ts`, `tagExecutor.test.ts`, `reviewScreen.test.ts`, `tagValidation.test.ts`) that construct `AdminDialogDTO` as plain object literals. The plan's RESEARCH.md Pitfall 3 asserted "no exhaustive switches exist today" but did not account for literal-construction test fixtures.
- **Fix:** Added `canAdd: true, addGreyReason: null` to each fixture's `makeDialog`/mock-DTO construction, matching the existing default-actionable fixture pattern (`canAct: true, greyReason: null`).
- **Files modified:** `src/main/ipc/groupChannels.test.ts`, `src/main/telegram/membershipScanner.test.ts`, `src/main/telegram/participantSearcher.test.ts`, `src/main/telegram/removalExecutor.test.ts`, `src/main/telegram/tagExecutor.test.ts`, `src/renderer/wizard/reviewScreen.test.ts`, `src/renderer/wizard/tagValidation.test.ts`
- **Verification:** `npx tsc --build` exits 0 (confirmed after Task 2's GroupEnumerator.ts changes also landed)
- **Committed in:** `6b78768` (Task 1 commit)

**2. [Rule 3 - Blocking] Removed ~230 stale gitignored `tsc --build` artifacts shadowing edited `.ts` sources**
- **Found during:** Task 2 GREEN verification — `groupEnumerator.test.ts` reported `canAdd`/`addGreyReason` as `undefined` despite the source changes being present on disk
- **Issue:** A prior `tsc --build` run (dated June 20, composite mode, `outDir` alongside source) had emitted `.js`/`.d.ts` files directly beside their `.ts` counterparts throughout `src/`. These are gitignored (`src/**/*.js`, `src/**/*.d.ts` with narrow exceptions) and not tracked, but Vite/Vitest's extensionless module resolution picked up the stale compiled `.js` over the freshly-edited `.ts`, silently serving outdated code to the test run.
- **Fix:** Deleted all stale `src/**/*.js` and `src/**/*.d.ts` build artifacts except the two intentional, tracked exceptions (`src/main/env.d.ts`, `src/renderer/i18n/i18next.d.ts`) and the root-level `electron.vite.config.js`/`.d.ts` (not under `src/`, not source-mirroring).
- **Files modified:** None tracked by git (confirmed via `git status --short` showing zero unexpected deletions — all removed files were gitignored, untracked build output)
- **Verification:** `npx vitest run src/main/telegram/groupEnumerator.test.ts` went from reporting `canAdd: undefined` to all 26 tests passing; `npx tsc --build` still exits 0 afterward (regenerates clean output on demand)
- **Committed in:** Folded into `2cbca4e` (Task 2 GREEN commit) — noted explicitly in that commit message since no file changes resulted (deletion of untracked artifacts)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking compile/test-correctness issues)
**Impact on plan:** Both fixes were required to satisfy the plan's own stated acceptance criteria (`tsc --build` exits 0; `groupEnumerator.test.ts` exits 0). No scope creep — no behavior changed in any file outside the plan's stated concern (type-widening ripple + environment artifact cleanup only).

## Issues Encountered
None beyond the two deviations above (both root-caused and resolved within Tasks 1-2).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `AdminDialogDTO.canAdd`/`addGreyReason` is now available end-to-end (main → IPC-ready DTO shape) for Phase 14's `AddExecutor` to consume when deciding per-group add eligibility
- `AddGreyReason`'s `'already-member'` and `'banned-no-unban-right'` values exist as data but have no gating/rendering logic yet — intentionally deferred to Phase 15 per the plan's `must_haves.truths`
- Two pre-existing, unrelated `config.test.ts` failures (missing `MRSPROPER_API_ID`/`MRSPROPER_API_HASH` env vars in this environment) remain and are logged in `deferred-items.md` — not a blocker for Phase 13 Plan 02

---
*Phase: 13-add-rights-scan-semantics-foundation*
*Completed: 2026-10-03*
