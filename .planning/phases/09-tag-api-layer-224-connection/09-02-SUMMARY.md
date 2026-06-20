---
phase: 09-tag-api-layer-224-connection
plan: 02
subsystem: telegram
tags: [telegram, gramjs, mtproto, layer-224, patch-connect-restore, governor, vitest, typescript, tdd]

# Dependency graph
requires:
  - "09-01: src/main/telegram/tagApi.ts (makeEditChatParticipantRankRequest)"
  - "src/main/telegram/governor.ts (RateLimitGovernor)"
provides:
  - "src/main/telegram/tagClient.ts: TagClient class — layer-224 patch-connect-restore + governor-routed invoke"
  - "src/main/telegram/tagClient.test.ts: 7 tests — LAYER-restore, 224-during-connect, throw-restore, governor-routing, inner-invoke, disconnect, double-connect-guard"
affects:
  - 10-tag-types (TagExecutor imports TagClient for tag run lifecycle)
  - 11-tag-executor (wires real TelegramClient + governor into TagClient)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "patch-connect-restore: require('telegram/tl/AllTLObjects').LAYER = 224 inside method body before connect(); restore in finally block — global mutation is error-safe and interceptable by vi.mock"
    - "injectable inner client: TagClientInner interface mirrors RemovalExecutor/SessionManager pattern — real TelegramClient or mock satisfies it"
    - "governor routing: all tagClient.invoke() calls routed through this._governor.run(() => this._inner.invoke(req)) — no direct calls to inner client"
    - "_connecting flag: prevents concurrent connect() calls from double-mutating AllTLObjects.LAYER"

key-files:
  created:
    - src/main/telegram/tagClient.ts
    - src/main/telegram/tagClient.test.ts
  modified: []

key-decisions:
  - "require('telegram/tl/AllTLObjects') called inside connect() method body (not at module scope) so vi.mock hoisting intercepts it correctly in tests"
  - "prevLayer = allTl.LAYER captured before patch to safely restore to original value (always 198 in production; defensive for tests)"
  - "main-client reconnect-race mitigation deferred to Phase 11 per spec §4.3 — coupling to main client's internals is outside Phase 9 scope; code comment documents this"
  - "import type RateLimitGovernor — avoids importing governor module side-effects; only the class type is needed for the constructor parameter"

# Metrics
duration: 4min
completed: 2026-06-20
---

# Phase 9 Plan 02: TagClient Layer-224 Connection Helper Summary

**Isolated layer-224 TelegramClient wrapper with patch-connect-restore of AllTLObjects.LAYER and governor-routed invokes — write-only, fully injectable, error-safe**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-20T13:15:24Z
- **Completed:** 2026-06-20T13:19:00Z
- **Tasks:** 2 (Task 1 TDD: RED + GREEN; Task 2: tsc + full-suite regression)
- **Files created:** 2

## Accomplishments

- `TagClient` class with patch-connect-restore: `AllTLObjects.LAYER` is set to 224 inside `connect()` before the inner client connects, then restored to `prevLayer` (always 198) in a `finally` block — error-safe
- `_connecting` guard prevents concurrent `connect()` calls from double-mutating the global; throws `'TagClient: connect() already in progress'`
- All invokes route through the shared `governor.run()` — no direct calls to `this._inner.invoke()`
- Write-only design: no `getDialogs`/`getParticipants` on this client
- Inner client and governor are fully injectable — tests use mock implementations without any Telegram network
- `require('telegram/tl/AllTLObjects')` called inside method body (not module scope) so `vi.mock` intercepts it correctly
- `tsc --build` exits 0; 7 tagClient tests pass; 290/292 total tests pass (2 pre-existing config env-var failures unrelated to this plan)

## Task Commits

| Task | Type | Hash | Description |
|------|------|------|-------------|
| 1 RED | test | 8b68248 | Failing tagClient tests (7 tests, all RED) |
| 1 GREEN | feat | f23b484 | TagClient implementation — all 7 tests GREEN |
| 1 FIX | fix | 2f3e8cc | Remove unused `beforeEach` import (tsc TS6133 error) |

## Files Created

- `src/main/telegram/tagClient.ts` — TagClient class: `connect()` (patch-connect-restore), `invoke()` (governor-routed), `disconnect()` (teardown); exports `TagClientInner`, `TagClientOptions`, `TagClient`
- `src/main/telegram/tagClient.test.ts` — 7 Vitest tests covering all behavioral assertions

## Decisions Made

1. `require('telegram/tl/AllTLObjects')` is called inside the `connect()` method body — module-scope `import` would bypass `vi.mock` hoisting and break the mock intercept in tests
2. `prevLayer = allTl.LAYER` is captured before the patch so the `finally` block restores exactly what it found (not a hardcoded 198) — defensive against test environments
3. Main-client reconnect-race deferred to Phase 11: coupling TagClient to the main client's `_connecting` state would require accessing its internals; the Phase 11 lifecycle contract (open TagClient only when quiescent) is the correct resolution
4. `import type RateLimitGovernor` — type-only import to avoid pulling in governor module side-effects when the file is tested in isolation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unused `beforeEach` import caused `tsc --build` error TS6133**
- **Found during:** Task 2 (full-suite regression — tsc --build check)
- **Issue:** The test file imported `beforeEach` from vitest but never used it; TypeScript strict mode (TS6133: declared but never read) caused `tsc --build` to exit non-zero
- **Fix:** Removed `beforeEach` from the import statement in `tagClient.test.ts`
- **Files modified:** `src/main/telegram/tagClient.test.ts`
- **Commit:** `2f3e8cc`

---

**Total deviations:** 1 auto-fixed (Rule 1 — unused import in test file)
**Impact on plan:** Zero scope change. Implementation correct; unused import removed.

## Pre-existing Failures (Out of Scope)

`src/main/telegram/config.test.ts` has 2 tests that fail when `MRSPROPER_API_ID` / `MRSPROPER_API_HASH` environment variables are not set. These tests contain the comment "RED: will fail until env injection is wired — that is expected". They were already failing before Phase 9 began and are not caused by this plan's changes.

## Known Stubs

None — this module has no data flowing to UI. `TagClient` is a pure connection helper; no rendering involved.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. `tagClient.ts` calls `inner.connect()` / `inner.invoke()` / `inner.disconnect()` — the same surface as existing `RemovalExecutor`. The `AllTLObjects.LAYER` mutation is guarded by patch-connect-restore (T-09-02 mitigation per threat register in the plan).

## Self-Check: PASSED

- [x] `src/main/telegram/tagClient.ts` exists
- [x] `src/main/telegram/tagClient.test.ts` exists
- [x] Commit `8b68248` exists (RED)
- [x] Commit `f23b484` exists (GREEN)
- [x] Commit `2f3e8cc` exists (fix — unused import)
- [x] All 7 tagClient tests pass
- [x] `tsc --build` exits 0
- [x] `AllTLObjects.LAYER` is NOT imported at module scope — `require(...)` appears only inside `connect()` body

---
*Phase: 09-tag-api-layer-224-connection*
*Completed: 2026-06-20*
