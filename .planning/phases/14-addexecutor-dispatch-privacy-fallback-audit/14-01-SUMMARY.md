---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
plan: 01
subsystem: api
tags: [typescript, electron-ipc, gramjs, shared-types]

# Dependency graph
requires:
  - phase: 13-add-rights-scan-semantics-foundation
    provides: canAdd/addGreyReason dialog flags and membershipStatus semantics that AddExecutor will consume
provides:
  - "src/shared/addTypes.ts: AddErrorCode, AddRunStep, AddDmStatus, AddGroupOutcome, AddSummary, AddState, AddJobFile, AddJobFileSafe, AddLogBlockEntry, DmTextProvider"
  - "src/shared/channels.ts: ADD_START/ADD_ABORT/ADD_RETRY_GROUP/ADD_GET_STATE/ADD_STATE/ADD_GET_JOB/ADD_DISCARD_JOB, TARGET_ADD_CONTACT, TEMPLATE_GET/TEMPLATE_SET"
  - "REQUIREMENTS.md ADD-09 wording aligned with D-07/D-12 privacy-blocked routing"
affects: [14-02, 14-03, 14-08, 14-09, 14-10, addAuditStore, AddExecutor, addChannels]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared type module mirrors tagTypes.ts/removalTypes.ts structure (Safe-projection Omit pattern for accessHash stripping)"
    - "IPC channel constants appended to CHANNELS namespace following TAG_*/REMOVAL_* block convention"

key-files:
  created: [src/shared/addTypes.ts]
  modified: [src/shared/channels.ts, .planning/REQUIREMENTS.md]

key-decisions:
  - "AddJobFile/AddState carry dmStatus — a net-new field with no RemovalState/TagState precedent, flagged in JSDoc per 14-PATTERNS.md divergence note"
  - "AddGroupOutcome carries reason/link/premiumWouldAllow as optional fields, following RemovalGroupOutcome's optional-annotation precedent but net-new in content"
  - "AddLogBlockEntry defined with no precedent (net-new) per D-17/D-18 one-block-per-run contract"
  - "ADD-09 wording rewritten so privacy-blocked explicitly owns not-mutual-contact/privacy-restricted and the broadcast/supergroup direct-add cap (D-07/D-12); failed codes list now includes the basic-group member-cap case instead of the ambiguous 'channel at the direct-add cap' phrase"

patterns-established:
  - "Pattern: interface-first ordering — shared contract types/constants land before any implementation plan in the phase"

requirements-completed: [ADD-06, ADD-07, ADD-08, ADD-09, ADD-10, ADD-11]

# Metrics
duration: 2min
completed: 2026-10-03
---

# Phase 14 Plan 01: Shared Add Contract (Types, Channels, Requirements Wording) Summary

**Defined the complete `addTypes.ts`/`channels.ts` contract every downstream Phase 14 module imports, and fixed REQUIREMENTS.md ADD-09 wording to match the locked D-07/D-12 privacy-blocked routing.**

## Performance

- **Duration:** ~2 min (task execution; context gathering excluded)
- **Started:** 2026-10-03T22:29:00+02:00
- **Completed:** 2026-10-03T22:30:26+02:00
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `src/shared/addTypes.ts` created with all 10 required exports (`AddErrorCode`, `AddRunStep`, `AddDmStatus`, `AddGroupOutcome`, `AddSummary`, `AddState`, `AddJobFile`, `AddJobFileSafe`, `AddLogBlockEntry`, `DmTextProvider`), mirroring `tagTypes.ts`/`removalTypes.ts` structure and flagging every net-new field in JSDoc.
- `src/shared/channels.ts` extended with 10 new IPC channel constants (`ADD_*`, `TARGET_ADD_CONTACT`, `TEMPLATE_GET`/`TEMPLATE_SET`), all added to the `CHANNELS` namespace object.
- `.planning/REQUIREMENTS.md` ADD-09 bullet rewritten so `privacy-blocked` explicitly covers not-mutual-contact/privacy-restricted and the broadcast/supergroup direct-add cap, with `failed` codes listing a basic-group member-cap case instead of the old ambiguous phrase.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/shared/addTypes.ts** - `2b52699` (feat)
2. **Task 2: Extend src/shared/channels.ts with ADD_*, TARGET_ADD_CONTACT, TEMPLATE_* constants** - `309ba34` (feat)
3. **Task 3: Align REQUIREMENTS.md ADD-09 wording with D-07/D-12** - `0e98012` (docs)

**Plan metadata:** (this commit, created after this summary)

## Files Created/Modified
- `src/shared/addTypes.ts` - New shared type module: the complete contract (state, job file, outcomes, DM render fn) for AddExecutor and every consumer
- `src/shared/channels.ts` - Appended `ADD_*`/`TARGET_ADD_CONTACT`/`TEMPLATE_*` IPC channel constants, mirroring the existing `TAG_*`/`REMOVAL_*` block style
- `.planning/REQUIREMENTS.md` - ADD-09 bullet text rewritten to match D-07/D-12 routing; checkbox state and requirement ID untouched

## Decisions Made
- Followed 14-PATTERNS.md's exact field lists for every type (D-16/D-17/D-18/D-19 referenced directly); no deviation from the plan's specified shapes.
- `AddErrorCode.ADD_NOT_MUTUAL_CONTACT` kept in the union for shape-completeness per the plan's explicit instruction, with JSDoc clarifying the classifier (built in a later plan) never assigns it — D-07 routes that RPC string to `privacy-blocked` instead.

## Deviations from Plan

None - plan executed exactly as written. Both verification commands (`npx tsc --build`, the two `grep -c` checks) passed with the exact expected values specified in each task's acceptance criteria.

## Issues Encountered

`npx tsc --build` emits `.js`/`.d.ts` files beside the TypeScript sources in `src/shared/` (per CLAUDE.md memory note on the root `tsc` config). These stray build artifacts were deleted after each verification run so they never reached `git status` as untracked files (confirmed gitignored, but removed proactively to avoid confusing a future `vitest run`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/shared/addTypes.ts` and the new `src/shared/channels.ts` constants are ready for every downstream Phase 14 plan (storage, contact service, template store, AddExecutor, IPC handlers) to import without inventing shapes mid-implementation.
- REQUIREMENTS.md ADD-09 now accurately reflects the locked D-07/D-12 routing decisions for planning/review in later Phase 14 plans.
- No blockers. The open item noted in STATE.md (exact RPC error strings for `channels.InviteToChannel`/`messages.AddChatUser` needing live verification) remains relevant for the AddExecutor implementation plan, not this one.

## Self-Check: PASSED

- FOUND: src/shared/addTypes.ts
- FOUND: 2b52699 (Task 1 commit)
- FOUND: 309ba34 (Task 2 commit)
- FOUND: 0e98012 (Task 3 commit)

---
*Phase: 14-addexecutor-dispatch-privacy-fallback-audit*
*Completed: 2026-10-03*
