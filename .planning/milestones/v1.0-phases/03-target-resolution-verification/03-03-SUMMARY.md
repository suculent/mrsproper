---
phase: 03-target-resolution-verification
plan: "03"
subsystem: api
tags: [gramjs, telegram, ipc, zod, target-resolution, bigint, governor]

requires:
  - phase: 03-01
    provides: shared type contracts (TargetState, ResolvedTargetDTO, TargetErrorCode, TARGET_* channels)
  - phase: 03-02
    provides: RED test suites for TargetResolver and targetChannels
  - phase: 02
    provides: RateLimitGovernor with governor.run() serial execution + classifyRpcError classifier

provides:
  - TargetResolver service: username + phone resolution through governor, bio + avatar fetch, state machine
  - targetChannels IPC handlers: TARGET_RESOLVE, TARGET_CONFIRM, TARGET_RESET, TARGET_GET_STATE
  - emitTargetState push helper for win.webContents.send(TARGET_STATE, state)
  - All 23 Phase 3 tests GREEN (18 targetResolver.test.ts + 5 targetChannels.test.ts)

affects: [phase-04-group-enumeration, phase-05-removal-executor, main/index.ts wiring]

tech-stack:
  added: []
  patterns:
    - "TargetResolver follows SessionManager DI pattern: client + onStateChange + onGovernorEvent"
    - "Duck-typing for Api.PeerUser peer check (plain {userId} objects from mock; instanceof works for real GramJS)"
    - "All Telegram API calls wrapped in _governor.run() — no direct client.invoke() at top level"
    - "accessHash stored in private _resolvedUserId/_resolvedAccessHash — never in ResolvedTargetDTO"
    - "user.id.toString() for DTO id — NEVER Number(user.id) (bigint > 2^53 precision safety)"

key-files:
  created:
    - src/main/telegram/TargetResolver.ts
    - src/main/ipc/targetChannels.ts
  modified: []

key-decisions:
  - "Duck-typed peer check (peer.userId !== undefined) instead of instanceof Api.PeerUser — mock client returns plain objects and instanceof would always fail; duck-typing works for both real and mock clients"
  - "accessHash defaults to BigInt(0) when user.accessHash is null/undefined — allows resolution to proceed; Phase 4 must handle zero-hash edge case gracefully"
  - "All 4 Telegram calls (ResolveUsername, ResolvePhone, GetFullUser, downloadProfilePhoto) go through _governor.run() — serialization + FLOOD_WAIT policy enforced for resolution ops"

patterns-established:
  - "Pattern: TargetResolver mirrors SessionManager structure — constructor DI, private _emit helper, state as discriminated union"
  - "Pattern: IPC handlers use Zod .parse() (throws ZodError) before delegating to service — identical to authChannels.ts"
  - "Pattern: emitTargetState checks !win.isDestroyed() before webContents.send — identical to emitAuthState guard"

requirements-completed: [TGT-01, TGT-02, TGT-03, TGT-04, VRF-01, VRF-02, VRF-03]

duration: 3min
completed: 2026-06-11
---

# Phase 03 Plan 03: TargetResolver + targetChannels Implementation Summary

**TargetResolver service and targetChannels IPC handlers turning 23 RED tests GREEN — username/phone resolution via governor, bio + avatar fetch with graceful fallback, confirm gate, and Zod-validated IPC boundary**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-11T18:44:00Z
- **Completed:** 2026-06-11T18:47:00Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- Implemented `TargetResolver` — username resolution via `contacts.ResolveUsername`, phone resolution via `contacts.ResolvePhone` (D-07 REVISED), bio fetch via `users.GetFullUser` (graceful null on failure), avatar fetch with empty-buffer → null handling
- All Telegram API calls route through `_governor.run()` — serialization + FLOOD_WAIT policy enforced
- `accessHash` stored only in private fields, never in emitted `TargetState` or `ResolvedTargetDTO` (T-03-01, T-03-05)
- `user.id.toString()` for DTO id — bigint IDs > `Number.MAX_SAFE_INTEGER` serialized without precision loss (TGT-03)
- Implemented `targetChannels.ts` with Zod-validated IPC handlers and `emitTargetState` push helper
- All 23 new tests GREEN; full suite 103 passing (2 pre-existing config.test.ts failures unrelated to this plan)

## Task Commits

1. **Task 1: Implement TargetResolver.ts** - `4b4acc3` (feat)
2. **Task 2: Implement targetChannels.ts** - `b74d612` (feat)

## Files Created/Modified

- `src/main/telegram/TargetResolver.ts` — Target resolution service: username/phone paths, governor wrapping, bio + avatar fetch, state machine (idle → resolving → resolved/error), confirm gate, reset, getResolvedUser() for Phase 4
- `src/main/ipc/targetChannels.ts` — IPC handler registrations for all 4 TARGET_* channels with Zod validation; emitTargetState push helper

## Decisions Made

- **Duck-typed peer check** instead of `instanceof Api.PeerUser`: the mock client returns plain `{ userId: BigInt(...) }` objects, not real `Api.PeerUser` instances. Duck-typing on `typeof peer.userId === 'bigint'` works correctly for both real GramJS instances (which have `userId` as bigint) and the mock.
- **Zero accessHash fallback** (`BigInt(0)`) when `user.accessHash` is null/undefined: allows resolution to complete; Phase 4 will need to handle the zero-hash edge case (real users always have accessHash when resolved via ResolveUsername/ResolvePhone).

## Deviations from Plan

None — plan executed exactly as written. All behaviors specified in `<behavior>` blocks were implemented. The one implementation detail not explicitly stated (duck-typing vs instanceof for peer check) was resolved correctly by observing the mock client's return shape.

## Issues Encountered

None — implementation was straightforward. The mock client in `telegramClient.ts` was already fully prepared for all test scenarios (Wave 1 work from Plans 03-01 and 03-02).

## User Setup Required

None — no external service configuration required.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns beyond what the plan's `<threat_model>` covers:

- T-03-05 (accessHash isolation): accessHash confirmed absent from all `_buildDTO` output and `TargetState` emissions
- T-03-06 (IPC payload injection): `ResolveTargetSchema.parse()` throws `ZodError` before `resolver.resolve()` on malformed input
- T-03-07 (direct invoke vs governor): all 4 API calls are wrapped in `_governor.run()`
- T-03-08 (bigint truncation): `user.id.toString()` used exclusively; no `Number()` conversion

No new threat surface found.

## Next Phase Readiness

- `TargetResolver.getResolvedUser()` returns `{ id: bigint, accessHash: bigint }` for Phase 4 group enumeration + member check calls
- `emitTargetState` ready to wire in `main/index.ts` as the `onStateChange` callback
- Phase 4 needs to handle `accessHash === BigInt(0)` edge case in `InputUser` construction (rare but possible when resolved user has no accessHash)
- Phase 3 renderer work (Plans 03-04, 03-05) can wire against the stable `TargetState` type and `TARGET_*` IPC channels

## Self-Check: PASSED

---
*Phase: 03-target-resolution-verification*
*Completed: 2026-06-11*
