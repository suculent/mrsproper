---
phase: 02-rate-limit-governor-error-classification
plan: "04"
subsystem: telegram/governor
tags: [gap-closure, typescript, rate-limit, session-management, testing]
dependency_graph:
  requires: [02-03]
  provides: [D-08-complete, tsc-clean-governor]
  affects: [SessionManager, RateLimitGovernor, operationErrors]
tech_stack:
  added: []
  patterns: [governor-wrapping, rpc-shaped-mocks, type-narrowing]
key_files:
  created: []
  modified:
    - src/main/telegram/governor.test.ts
    - src/main/telegram/governor.ts
    - src/shared/opTypes.ts
    - src/main/telegram/__mocks__/telegramClient.ts
    - src/main/telegram/SessionManager.ts
    - src/main/telegram/SessionManager.test.ts
decisions:
  - SESSION_REVOKED chosen as logout failure mock code — maps to SESSION_INVALID/fail disposition, eliminating retry-induced timeouts
  - makeRPCError() string cast added to satisfy TypeScript narrowing after adding object type to MockRPCErrorCode union
metrics:
  duration: 15
  completed: "2026-06-11"
  tasks: 2
  files: 6
---

# Phase 02 Plan 04: Gap Closure (D-08 Compliance + tsc Clean) Summary

Three gaps from Phase 2 post-execution verification are now closed: tsc errors in governor.test.ts are eliminated, SESSION_INVALID comments in governor.ts and opTypes.ts correctly reflect the 'fail' disposition, and auth.LogOut is routed through governor.run() completing D-08 compliance.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix TypeScript errors and misleading SESSION_INVALID comments | 52060c0 | governor.test.ts, governor.ts, opTypes.ts |
| 2 | Route auth.LogOut through governor.run() and fix test mock | f18a15a | telegramClient.ts, SessionManager.ts, SessionManager.test.ts |

## What Was Built

**Task 1 — TypeScript cleanup + comment corrections (no behavioral change):**
- Removed unused `Disposition` import from `governor.test.ts` (TS6196)
- Fixed `invokeImpl` parameter type from `() => Promise<unknown>` to `(req?: unknown) => Promise<unknown>` in `createMockClient` factory
- Updated `vi.fn` mock signatures in PEER_FLOOD and transient retry tests to accept `_req?: unknown`
- Removed "or session-invalid" from `governor.ts:128` comment — SESSION_INVALID maps to 'fail' in `operationErrors.ts`, never reaches the hard-stop branch
- Corrected two `opTypes.ts` docstrings to accurately reflect that SESSION_INVALID disposition is 'fail', not 'hard-stop'

**Task 2 — D-08 gap closure + test mock improvement:**
- Added `SESSION_REVOKED` to `MockRPCErrorCode` union in `telegramClient.ts`
- Renamed `logoutError?: Error` to `logoutErrorCode?: MockRPCErrorCode` — mock now throws RPC-shaped errors via `makeRPCError()`, matching GramJS RPCError shape
- Added explicit string cast in `makeRPCError()` to satisfy TypeScript narrowing after expanding the union with an object type
- Routed `auth.LogOut` through `this._governor.run(...)` in `SessionManager.logout()` — `_governor.run` count is now 3 (getMe, downloadProfilePhoto, LogOut)
- Updated two logout failure tests to use `logoutErrorCode: 'SESSION_REVOKED'` — SESSION_REVOKED maps to SESSION_INVALID/fail disposition, completing immediately with no retry (avoids 7s backoff timeout)

## Verification

```
_governor.run count in SessionManager.ts: 3
session-invalid in governor.ts: NOT FOUND
session-invalid in opTypes.ts: NOT FOUND
governor.test.ts tsc errors: NONE
Full test suite: 72/74 (2 pre-existing AUTH-03 failures only)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.fn mock parameter types in PEER_FLOOD and transient retry tests**
- **Found during:** Task 1
- **Issue:** The plan specified fixing `invokeImpl` in `createMockClient`, but two test cases (lines 178 and 204) used inline `vi.fn(async () => {...})` with 0 args — the resulting mock was typed as `() => Promise<unknown>`, causing TS2554 when calling `client.invoke({})`. These were the two TS2554 errors the plan targeted.
- **Fix:** Added `_req?: unknown` parameter to both inline mock functions
- **Files modified:** `src/main/telegram/governor.test.ts`
- **Commit:** 52060c0

**2. [Rule 1 - Bug] makeRPCError TypeScript narrowing failure**
- **Found during:** Task 2
- **Issue:** Expanding `MockRPCErrorCode` with `'SESSION_REVOKED'` string literal caused TS2769/TS2322 at `makeRPCError` lines 39-40. Despite the `typeof code === 'object'` guard, TypeScript could not narrow `code` to `string` in the else branch.
- **Fix:** Added `const codeStr = code as string` cast after the object guard
- **Files modified:** `src/main/telegram/__mocks__/telegramClient.ts`
- **Commit:** f18a15a

## Known Stubs

None. All changes are type/comment/routing fixes with no placeholder values.

## Threat Flags

None. All changes are in test infrastructure and comment corrections. The `logoutErrorCode` mock uses the existing `makeRPCError()` helper — same function used for all other error mocks — so RPC shape consistency is maintained (T-02-GC-01 mitigated).

## Self-Check: PASSED

- `src/main/telegram/governor.test.ts` — modified, exists
- `src/main/telegram/governor.ts` — modified, exists
- `src/shared/opTypes.ts` — modified, exists
- `src/main/telegram/__mocks__/telegramClient.ts` — modified, exists
- `src/main/telegram/SessionManager.ts` — modified, exists
- `src/main/telegram/SessionManager.test.ts` — modified, exists
- Commit 52060c0 — verified in git log
- Commit f18a15a — verified in git log
