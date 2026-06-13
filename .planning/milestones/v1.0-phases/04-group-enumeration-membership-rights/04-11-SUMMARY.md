---
phase: 04-group-enumeration-membership-rights
plan: 11
subsystem: telegram
tags: [gramjs, membership-scanner, ipc, react, zustand, vitest]

requires:
  - phase: 04-10
    provides: MembershipScanner, GroupsPane, groupsStore, targetChannels wired end-to-end

provides:
  - Generation guard in MembershipScanner.retryGroup() prevents post-abort crash and cross-target result merge
  - TARGET_RESET IPC handler calls scanner.abortScan() before resolver.reset() (CR-01 main-side)
  - GroupsPane abort effect fires on scan.step==='complete' in addition to 'scanning' (CR-01 renderer-side)
  - groupsStore tracks _prevScanStep; checkedDialogIds rebuilt only on first-complete, not retry-complete (CR-03)
  - Regression tests for CR-02 generation guard (2 new tests, 15 total pass)

affects:
  - Phase 05 (removal executor reads checkedDialogIds — must remain stable across retryGroup)
  - Phase 04 verification (truths 6, 7, 8 now closeable)

tech-stack:
  added: []
  patterns:
    - Generation guard captures token before async gap; guards after — mirrors existing scan() loop pattern
    - Structural scanner param in registerTargetChannels avoids circular import (MembershipScanner not imported in targetChannels)
    - Module-level _prevScanStep in groupsStore persists across React renders and hook re-subscriptions

key-files:
  created: []
  modified:
    - src/main/telegram/MembershipScanner.ts
    - src/main/ipc/targetChannels.ts
    - src/main/index.ts
    - src/renderer/groups/GroupsPane.tsx
    - src/renderer/store/groupsStore.ts
    - src/main/telegram/membershipScanner.test.ts

key-decisions:
  - "CR-02: retryGroup() generation guard placed after the single await (_checkMembership) — captures gen before, guards after — same pattern as scan() loop"
  - "CR-01-MAIN: registerTargetChannels moved in main/index.ts to after scanner construction so scanner is in scope; scanner passed as structural type to avoid circular import"
  - "CR-03: _prevScanStep is module-level (not React state) because it must persist across renders and subscription re-registrations"

patterns-established:
  - "Generation guard pattern: `const gen = this._generation` before await; `if (gen !== this._generation || this._currentState.step !== 'complete') return` after await"
  - "Structural IPC params: pass only the needed method subset (scanner: { abortScan(): void }) instead of importing the full class"
  - "Prior-step tracking for idempotency: _prevScanStep prevents rebuild on retry-complete while allowing rebuild on first-complete"

requirements-completed: [GRP-01, GRP-02, GRP-03]

duration: 5min
completed: 2026-06-12
---

# Phase 04 Plan 11: Scan-Lifecycle Bug Closure (CR-01, CR-02, CR-03) Summary

**Generation guard in retryGroup(), abortScan() on TARGET_RESET, and _prevScanStep first-complete guard close three scan-lifecycle bugs that broke target-change re-scan, retry crash safety, and manual checkbox deselection preservation**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-12T01:38:00Z
- **Completed:** 2026-06-12T01:42:30Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- CR-02 CLOSED: retryGroup() now captures `const gen = this._generation` before `_checkMembership` await and guards `if (gen !== this._generation || this._currentState.step !== 'complete') return` after — prevents TypeError crash and cross-target data merge when abortScan() or scan() fires mid-retry
- CR-01 CLOSED (main + renderer): TARGET_RESET calls `scanner.abortScan()` before `resolver.reset()` so scan.step returns to 'idle'; GroupsPane abort effect also fires on `scan.step === 'complete'` as belt-and-suspenders
- CR-03 CLOSED: module-level `_prevScanStep` in groupsStore distinguishes first-complete (rebuilds checkedDialogIds) from retry-complete (preserves manual deselections)
- Regression tests: 2 new CR-02 tests added (15 total pass); TypeScript compiles clean

## Task Commits

1. **Task 1: CR-02 generation guard + CR-01 main-side abortScan** - `8d138ff` (fix)
2. **Task 2: CR-01 renderer abort-on-complete + CR-03 _prevScanStep guard** - `e54012b` (fix)
3. **Task 3: Regression tests for CR-02** - `e68b3cc` (test)

## Files Created/Modified

- `src/main/telegram/MembershipScanner.ts` - retryGroup() generation guard (const gen capture + post-await guard)
- `src/main/ipc/targetChannels.ts` - registerTargetChannels accepts scanner structural param; TARGET_RESET calls scanner.abortScan()
- `src/main/index.ts` - registerTargetChannels moved after scanner construction; passes scanner as third arg
- `src/renderer/groups/GroupsPane.tsx` - abort effect condition extended to cover scan.step==='complete'
- `src/renderer/store/groupsStore.ts` - module-level _prevScanStep; first-complete vs retry-complete branching in onScanState
- `src/main/telegram/membershipScanner.test.ts` - CR-02 regression describe block with 2 race-condition tests

## Decisions Made

- registerTargetChannels accepts `scanner: { abortScan(): void }` as a structural type (not `MembershipScanner`) to prevent a circular import: targetChannels.ts → MembershipScanner.ts → (indirectly) → targetChannels.ts
- registerTargetChannels call moved from line 205 (before scanner construction) to after registerGroupChannels (line 232+) — TypeScript would reject passing an undeclared variable
- _prevScanStep is module-level rather than closure-local to survive React hook re-subscriptions that re-run startSubscriptions()

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None - all fixes are behavioral correctness changes with no placeholder values.

## Threat Flags

None - no new network endpoints, auth paths, or trust-boundary crossings introduced. The scanner structural param in targetChannels.ts stays entirely in the main process and never crosses the IPC boundary.

## Next Phase Readiness

- CR-01, CR-02, CR-03 closed; Phase 4 truths 6, 7, and 8 are now verifiable
- Phase 5 (removal executor) can safely read `checkedDialogIds` — the set is stable across retryGroup() calls
- No blockers introduced

## Self-Check: PASSED

- `src/main/telegram/MembershipScanner.ts` — modified (gen guard in retryGroup): FOUND
- `src/main/ipc/targetChannels.ts` — modified (scanner param + abortScan call): FOUND
- `src/main/index.ts` — modified (registerTargetChannels moved): FOUND
- `src/renderer/groups/GroupsPane.tsx` — modified (abort effect covers complete): FOUND
- `src/renderer/store/groupsStore.ts` — modified (_prevScanStep): FOUND
- `src/main/telegram/membershipScanner.test.ts` — modified (2 new CR-02 tests): FOUND
- Commit 8d138ff: FOUND
- Commit e54012b: FOUND
- Commit e68b3cc: FOUND
- `npx tsc --noEmit`: CLEAN
- `npx vitest run membershipScanner.test.ts`: 15/15 PASS

---
*Phase: 04-group-enumeration-membership-rights*
*Completed: 2026-06-12*
