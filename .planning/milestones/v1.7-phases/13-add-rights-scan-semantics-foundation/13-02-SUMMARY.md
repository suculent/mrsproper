---
phase: 13-add-rights-scan-semantics-foundation
plan: 02
subsystem: api
tags: [typescript, gramjs, electron-main, vitest]

# Dependency graph
requires:
  - phase: 13-add-rights-scan-semantics-foundation
    provides: "MembershipStatus 'banned' literal widened onto the shared type in 13-01"
provides:
  - "MembershipScanner._checkMembership returns the full MembershipStatus discriminator ('member' | 'not-member' | 'banned') instead of a boolean"
  - "scan() and retryGroup() both surface a distinct 'banned' scan outcome identically, separate from 'not-member' (D-01)"
  - "Documented, tested left-flag polarity contract: ChannelParticipantBanned with left === true -> 'banned' (kicked/banned and absent); left unset -> 'member' (restricted but still present, actionable in Remove mode, user-confirmed intended behaviour)"
  - "Basic-group scans (messages.GetFullChat path) proven to never emit 'banned' (D-03)"
affects: [14-add-executor, 15-add-mode-renderer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Private scan helper returns the full status union directly rather than a boolean the caller then maps — removes caller-side ternary duplication across both call sites (scan()/retryGroup())"

key-files:
  created: []
  modified:
    - src/main/telegram/MembershipScanner.ts
    - src/main/telegram/membershipScanner.test.ts

key-decisions:
  - "ChannelParticipantBanned with left === true maps to 'banned' (kicked/banned and absent); left unset maps to 'member' (restricted but still present, actionable in Remove mode, user-confirmed intended behaviour) — this resolves the plan's Open Question 2 as a locked, tested contract (D-01)"
  - "Basic-group branch keeps returning only 'member'/'not-member' (never 'banned') since bans are not visible via messages.GetFullChat (D-03) — now explicit via a dedicated negative-assertion test"

patterns-established:
  - "Pattern: when widening a private helper's return type from boolean to a status union, update ALL call sites in the same task/commit — grep for the helper's call count as an acceptance criterion to catch an asymmetric miss (Pitfall 2)"

requirements-completed: [ADD-02]

# Metrics
duration: 5min
completed: 2026-10-03
---

# Phase 13 Plan 02: Add Rights & Scan Semantics Foundation Summary

**MembershipScanner's `_checkMembership` now returns a distinct `'banned'` status (split from `'not-member'`) at both of its call sites, with the `left`-flag polarity locked in by test as the documented D-01 contract.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-03T15:54:17Z (approx., per STATE.md session continuation from 13-01)
- **Completed:** 2026-10-03T15:58:31Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `_checkMembership` return type widened from `Promise<boolean>` to `Promise<MembershipStatus>`; both `scan()` and `retryGroup()` consume it directly with no boolean ternary intermediary (Pitfall 2 verified: both call sites updated together)
- `ChannelParticipantBanned` with `left === true` now surfaces as `status='banned'`, distinct from `status='not-member'`; `left` unset maps to `'member'` (restricted but still present, actionable in Remove mode, user-confirmed intended behaviour; D-01 polarity, resolving Open Question 2)
- Basic-group scans (via `messages.GetFullChat`) proven, by a new negative-assertion test, to never emit `'banned'` (D-03)
- Remove mode's renderer comparisons (`GroupRow.tsx`'s `membershipStatus === 'member'`, `GroupsPane.tsx`'s `status === 'member' || status === null`) are non-exhaustive equality checks — verified by inspection that `'banned'` falls through to the same non-actionable path as `'not-member'` today, with zero renderer changes required (Pitfall 3 confirmed, not re-implemented)
- Full test suite green aside from the 2 pre-existing, unrelated, environment-dependent `config.test.ts` failures (documented in 13-01's deferred-items.md)

## Task Commits

Each task was committed atomically:

1. **Task 1: Split banned vs not-member in _checkMembership, update both call sites** - `0039a32` (feat)
2. **Task 2: Test banned/not-member split, left-flag polarity, and basic-group negative case** - `ade651b` (test)

_Both tasks were marked `tdd="true"` in the plan, but the plan's own task ordering specified implementation first (Task 1) followed by a dedicated test-lock-in task (Task 2) rather than a RED-before-GREEN sequence — executed exactly as the plan's `<action>` blocks specified._

## Files Created/Modified
- `src/main/telegram/MembershipScanner.ts` - `_checkMembership` return type widened to `Promise<MembershipStatus>`; `ChannelParticipantBanned` branch split by `left` flag into `'banned'`/`'not-member'`; `ChannelParticipantLeft`, `USER_NOT_PARTICIPANT`, and the basic-group/unknown-type fallbacks all updated to return string literals directly; both `scan()` and `retryGroup()` call sites simplified to `status = await this._checkMembership(...)`
- `src/main/telegram/membershipScanner.test.ts` - Replaced the old `ChannelParticipantBanned` test (previously asserting `'not-member'`) with an assertion of `'banned'`; added a sibling test for the `left` flag polarity (`left: true` -> `'banned'`, unset -> `'member'`); added a basic-group negative-assertion test confirming `'banned'` is never emitted via that path; widened the local `participantOverrides` type to carry an optional `left` flag

## Decisions Made
- `left === true` -> `'banned'`, `left` unset -> `'member'` — final polarity per the D-01 revision of 2026-10-03 (corrected in Phase 16)
- Kept the basic-group branch's final line as a single ternary expression (`participants.some(...) ? 'member' : 'not-member'`) rather than introducing an intermediate boolean, per PATTERNS.md's exact recommended shape

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria (grep checks, `tsc --build`, `vitest run`) passed without requiring any auto-fixes.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The `'banned'` scan status is now a real, tested, both-call-sites-consistent data point available to Phase 14's `AddExecutor` (unban-first dispatch) and Phase 15's Add-mode UI (`banned-no-unban-right` grey reason) — this plan only produces the status, gating/dispatch logic remains correctly deferred
- Remove mode confirmed unaffected by inspection (no renderer files touched, non-exhaustive comparisons verified) — no regression risk carried forward
- 13-03 (the next plan in this phase, modifying `TagExecutor.ts`/`index.ts`/mocks/`tagExecutor.test.ts`/`tagClient.*`/`tagApi.*`) was not touched by this plan, per the project notes' file-boundary instruction

---
*Phase: 13-add-rights-scan-semantics-foundation*
*Completed: 2026-10-03*

## Self-Check: PASSED

Both files found on disk (`src/main/telegram/MembershipScanner.ts`, `src/main/telegram/membershipScanner.test.ts`); both referenced commit hashes (`0039a32`, `ade651b`) found in `git log`.
