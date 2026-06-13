---
phase: 06-ui-integration-wizard
plan: 01
subsystem: ipc
tags: [electron, gramjs, typescript, ipc, vitest, contextbridge]

requires:
  - phase: 05-removal-execution-engine
    provides: RemovalState, RemovalExecutor, REMOVAL_* channels, removalClient pattern

provides:
  - RemovalState.floodWaitRemaining field (optional number | null) for flood plumbing
  - SEVERITY_GET / SEVERITY_SET channel constants in shared/channels.ts
  - getSeverity / setSeverity methods wired in preload contextBridge
  - severityClient IPC module with MrsProperApi augmentation
  - Wave 0 test stubs for reviewScreen (SAF-01/03) and wizardStage (SAF-02)

affects:
  - 06-ui-integration-wizard/06-02 (severityChannels.ts handler in main)
  - 06-ui-integration-wizard/06-03 (ReviewScreen computePlannedActions fills in reviewScreen.test.ts)
  - 06-ui-integration-wizard/06-04 (wizardStage.ts pure function fills in wizardStage.test.ts)

tech-stack:
  added: []
  patterns:
    - "MrsProperApi interface merging: additive declare global augmentation per subsystem (authClient, groupsClient, removalClient, severityClient)"
    - "Wave 0 it.todo() stubs planted in Plan 01 to enforce Nyquist test compliance before implementation lands"

key-files:
  created:
    - src/renderer/ipc/severityClient.ts
    - src/renderer/wizard/reviewScreen.test.ts
    - src/renderer/wizard/wizardStage.test.ts
  modified:
    - src/shared/removalTypes.ts
    - src/shared/channels.ts
    - src/preload/index.ts

key-decisions:
  - "floodWaitRemaining scoped to removal-only flood events — NOT from the shared OP_GOVERNOR_EVENT channel (JSDoc comment added)"
  - "severityClient follows exact removalClient.ts MrsProperApi augmentation pattern"
  - "Wave 0 stubs use it.todo() (not it.skip()) so vitest reports them as 'todo' without failing the suite"

patterns-established:
  - "New IPC subsystem pattern: (1) add constants to channels.ts + CHANNELS object, (2) wire preload bridge, (3) create renderer/ipc/<subsystem>Client.ts with MrsProperApi augmentation"
  - "Wave 0 test stubs: plant failing (todo) stubs in Plan 01 to gate future plans; filled in later plans"

requirements-completed:
  - SAF-01
  - SAF-02
  - SAF-03

duration: 10min
completed: 2026-06-12
---

# Phase 6 Plan 01: Shared Contract Foundation Summary

**floodWaitRemaining added to RemovalState, SEVERITY_GET/SET IPC channels wired end-to-end (channels → preload → severityClient), and 14 Wave 0 it.todo() stubs planted for SAF-01/02/03 coverage**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-12T18:05:00Z
- **Completed:** 2026-06-12T18:10:00Z
- **Tasks:** 3
- **Files modified:** 6 (3 modified, 3 created)

## Accomplishments

- Added `floodWaitRemaining?: number | null` to `RemovalState` interface with scoped JSDoc comment distinguishing it from `OP_GOVERNOR_EVENT` flood events
- Exported `SEVERITY_GET = 'severity:get'` and `SEVERITY_SET = 'severity:set'` constants in `channels.ts` and added them to the `CHANNELS` namespace object
- Wired `getSeverity` and `setSeverity` into the preload contextBridge; created `severityClient.ts` following the exact `removalClient.ts` MrsProperApi augmentation pattern
- Created `src/renderer/wizard/reviewScreen.test.ts` with 9 `it.todo()` stubs covering SAF-01 actionable filter and SAF-03 mechanic derivation
- Created `src/renderer/wizard/wizardStage.test.ts` with 5 `it.todo()` stubs covering SAF-02 stage gate enforcement and auto-advance; to be filled in Plan 04 Task 3

## Task Commits

Each task was committed atomically:

1. **Task 1: Add floodWaitRemaining to RemovalState and SEVERITY_GET/SET channel constants** - `ba8e139` (feat)
2. **Task 2: Wire preload bridge and create severityClient IPC module** - `3510593` (feat)
3. **Task 3: Create Wave 0 failing test stubs for SAF-01/02/03** - `01fd9e6` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/shared/removalTypes.ts` - Added `floodWaitRemaining?: number | null` field to `RemovalState`
- `src/shared/channels.ts` - Added `SEVERITY_GET`, `SEVERITY_SET` constants and CHANNELS object entries
- `src/preload/index.ts` - Added SEVERITY_GET/SET imports and getSeverity/setSeverity contextBridge methods
- `src/renderer/ipc/severityClient.ts` - New: MrsProperApi augmentation + exported severityClient with getSeverity/setSeverity
- `src/renderer/wizard/reviewScreen.test.ts` - New: 9 Wave 0 it.todo() stubs for SAF-01/03
- `src/renderer/wizard/wizardStage.test.ts` - New: 5 Wave 0 it.todo() stubs for SAF-02

## Decisions Made

- `floodWaitRemaining` scoped to removal-only flood events — NOT from the shared `OP_GOVERNOR_EVENT` channel; JSDoc comment clarifies this boundary explicitly
- Wave 0 stubs use `it.todo()` (not `it.skip()`) so vitest reports them as "todo" without failing the suite — consistent with Phase 4 Wave 0 precedent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing 2 test failures in `config.test.ts` (API_ID/API_HASH env vars not set) confirmed pre-existing before this plan's changes; not introduced by this plan.

## Known Stubs

- `src/renderer/wizard/reviewScreen.test.ts`: 9 `it.todo()` stubs — intentional Wave 0 stubs to be filled in Plan 03 when `computePlannedActions` is created
- `src/renderer/wizard/wizardStage.test.ts`: 5 `it.todo()` stubs — intentional Wave 0 stubs to be filled in Plan 04 Task 3 when `getNextStage()` is extracted

## Next Phase Readiness

- Plan 02 can now install `electron-store` and wire `severityChannels.ts` main-side handler using the `SEVERITY_GET`/`SEVERITY_SET` constants defined here
- Plan 03 can implement `computePlannedActions` and fill in `reviewScreen.test.ts` stubs
- Plan 04 can extract `getNextStage()` and fill in `wizardStage.test.ts` stubs
- `tsc --build --force` exits clean (no new errors from this plan)
- Full vitest suite: 14 todos (new), 2 pre-existing failures, 216 passing

---
*Phase: 06-ui-integration-wizard*
*Completed: 2026-06-12*
