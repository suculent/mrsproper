---
phase: 04-group-enumeration-membership-rights
plan: 10
subsystem: ui
tags: [electron, gramjs, react, membership-scan, two-pane, visual-verification]

# Dependency graph
requires:
  - phase: 04-09
    provides: Two-pane AppShell, CountryPicker CZ default, GroupsPane integration

provides:
  - Human-verified end-to-end Phase 4 flow (two-pane layout, eager group enumeration, membership scan, pre-checked rows, greyed rows with reasons)
  - Five regression fixes across GroupEnumerator, MembershipScanner, TargetCard, and groupChannels IPC layer

affects:
  - phase-05-removal-executor (consumes GroupEnumerator, MembershipScanner, GroupsPane state)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "canAct OR logic for supergroup creators: creator===true OR adminRights.banUsers===true"
    - "Entity id/accessHash sourced from dialog map (not reconstructed from bigInt-from-string) to avoid GramJS CastError"
    - "MembershipScanner.getState() — canonical method name, getScanState() never existed"

key-files:
  created: []
  modified:
    - src/main/telegram/GroupEnumerator.ts
    - src/main/telegram/groupEnumerator.test.ts
    - src/main/telegram/MembershipScanner.ts
    - src/main/telegram/membershipScanner.test.ts
    - src/main/ipc/groupChannels.ts
    - src/main/ipc/groupChannels.test.ts
    - src/renderer/target/TargetCard.tsx
    - src/main/telegram/__mocks__/telegramClient.ts

key-decisions:
  - "Supergroup creator canAct uses OR logic: creator===true is sufficient regardless of adminRights.banUsers"
  - "GramJS entity access: pass id+accessHash from the dialog entity map, never reconstruct accessHash as BigInt(0)"
  - "MembershipScanner public surface: getState() is the canonical method; getScanState() was a typo never merged"

patterns-established:
  - "GroupEnumerator Api.Channel branch: check entity.creator || adminRights.banUsers for canAct"
  - "MembershipScanner IPC calls: destructure {id, accessHash} from pre-resolved dialog entity"

requirements-completed:
  - GRP-01
  - GRP-02
  - GRP-03
  - GRP-04
  - GRP-05

# Metrics
duration: 45min
completed: 2026-06-12
---

# Phase 04 Plan 10: Human Verification Summary

**Full Phase 4 flow human-verified after five targeted regression fixes: two-pane shell, eager group enumeration, membership scan with streaming progress, and togglable pre-checked/greyed rows all confirmed working end-to-end**

## Performance

- **Duration:** ~45 min (two defect-fix rounds during checkpoint review)
- **Started:** 2026-06-11
- **Completed:** 2026-06-12
- **Tasks:** 2 (automated pre-check + human checkpoint)
- **Files modified:** 8 (across five fix commits)

## Accomplishments

- Full test suite green: 153 tests passing, 2 pre-existing AUTH-03 failures only; TypeScript clean
- Dev build launched and all Phase 4 visual contracts verified by the developer
- Five regressions surfaced during human review and fixed before approval

## Task Commits

Each task was committed atomically:

1. **Task 1: Automated test/build verification** — passed (no new commit; pre-existing green state confirmed)
2. **Task 2: Human visual verification** — APPROVED after two defect-fix rounds

Defect-fix commits under this plan:
- `0ae6f4b` fix(04-10): supergroup creator treated as non-actionable (canAct=false)
- `deacaab` fix(04-10): Change target button missing in confirmed state
- `34d62f1` fix(04-10): rename getScanState→getState at all call sites in groupChannels.ts
- `728e3c9` fix(04-10): use entity id/accessHash directly in GramJS requests to prevent CastError
- `3b83d93` fix(04-10): widen Change target button by removing px-0 override

## Files Created/Modified

- `src/main/telegram/GroupEnumerator.ts` — added creator OR logic for Api.Channel canAct check
- `src/main/telegram/groupEnumerator.test.ts` — added test covering supergroup creator canAct=true
- `src/main/telegram/MembershipScanner.ts` — sourced entity id/accessHash from dialog map
- `src/main/telegram/membershipScanner.test.ts` — added 100-line test covering entity resolution
- `src/main/ipc/groupChannels.ts` — renamed getScanState→getState at 3 call sites
- `src/main/ipc/groupChannels.test.ts` — updated mock to use Pick<MembershipScanner,...> with getState
- `src/renderer/target/TargetCard.tsx` — restored "Change target" button in confirmed state; widened it
- `src/main/telegram/__mocks__/telegramClient.ts` — minor mock alignment fix

## Decisions Made

- Supergroup creator OR logic: `entity.creator === true` is sufficient for canAct independent of adminRights — already established in Plan 03 for basic groups, now applied consistently to the Api.Channel branch.
- GramJS entity access: reconstructing InputPeerChannel from BigInt(0) accessHash causes a CastError at runtime; the correct pattern is to carry the resolved entity (id + accessHash) from the dialogs map through to every API call.
- TargetCard "Change target" button was only rendered in the resolving/resolved states, not in the confirmed state — fixed to appear in all post-resolution states.

## Deviations from Plan

### Auto-fixed Issues (Rule 1 — Bug)

**1. [Rule 1 - Bug] Supergroup creator canAct=false — actionable groups empty for creators**
- **Found during:** Task 2 (human checkpoint, first defect-fix round)
- **Issue:** GroupEnumerator's Api.Channel branch only checked `adminRights.banUsers`; a supergroup creator has no explicit adminRights object (Telegram grants all rights implicitly), so canAct was false and the actionable list was empty
- **Fix:** Added `entity.creator === true` OR condition before the adminRights check in the Api.Channel branch
- **Files modified:** `src/main/telegram/GroupEnumerator.ts`, `src/main/telegram/groupEnumerator.test.ts`
- **Verification:** New test covers creator entity returning canAct=true; 153 tests passing
- **Committed in:** `0ae6f4b`

**2. [Rule 1 - Bug] "Change target" button absent in TargetCard confirmed state**
- **Found during:** Task 2 (human checkpoint, first defect-fix round)
- **Issue:** TargetCard only rendered the "Change target" button in `resolving` and `resolved` states; once the target was confirmed the button disappeared
- **Fix:** Added confirmed state to the button render condition; also widened button (removed px-0, added size="sm")
- **Files modified:** `src/renderer/target/TargetCard.tsx`
- **Verification:** Visual inspection confirmed button visible in confirmed state; button text fully readable
- **Committed in:** `deacaab` (initial fix), `3b83d93` (button width fix)

**3. [Rule 1 - Bug] groupChannels.ts called `scanner.getScanState()` — method does not exist**
- **Found during:** Task 2 (human checkpoint, first defect-fix round)
- **Issue:** groupChannels.ts called `getScanState()` on MembershipScanner at 3 call sites, but the public method is `getState()` — caused runtime TypeError
- **Fix:** Renamed all 3 call sites to `getState()`; updated test mock to use `Pick<MembershipScanner, 'getState' | ...>` for type safety
- **Files modified:** `src/main/ipc/groupChannels.ts`, `src/main/ipc/groupChannels.test.ts`
- **Verification:** Tests pass; TypeScript clean
- **Committed in:** `34d62f1`

**4. [Rule 1 - Bug] GramJS CastError — MembershipScanner passed BigInt(0) as accessHash**
- **Found during:** Task 2 (human checkpoint, second defect-fix round)
- **Issue:** MembershipScanner was constructing InputPeerChannel with `accessHash: BigInt(id.toString())` / zero fallback; GramJS threw a CastError because the accessHash did not match the real peer
- **Fix:** Passed `{id, accessHash}` directly from the pre-resolved dialog entity map; added 100-line test suite covering the entity resolution path
- **Files modified:** `src/main/telegram/MembershipScanner.ts`, `src/main/telegram/membershipScanner.test.ts`
- **Verification:** CastError no longer occurs; membership scan completes; 153 tests passing
- **Committed in:** `728e3c9`

---

**Total deviations:** 5 bug fixes under Rule 1 (4 root-cause issues + 1 cosmetic width follow-up)
**Impact on plan:** All fixes necessary for end-to-end correctness. The supergroup-creator and CastError fixes were blocking — the core scan flow did not work without them. No scope creep.

## Issues Encountered

The four bugs were all latent in earlier plan implementations and only visible when exercising the real MTProto API against an actual Telegram account (the test suite uses mocks). Human verification was the correct gate to catch this class of issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 complete and human-verified. The full group enumeration and membership scan pipeline is working end-to-end.
- Phase 5 (removal executor) can build directly on GroupEnumerator, MembershipScanner, and the GroupsPane checklist state.
- Known concern: exact Telegram rate limits are unpublished — Phase 5 should validate pacing empirically against throwaway accounts as previously noted in STATE.md blockers.

---
*Phase: 04-group-enumeration-membership-rights*
*Completed: 2026-06-12*
