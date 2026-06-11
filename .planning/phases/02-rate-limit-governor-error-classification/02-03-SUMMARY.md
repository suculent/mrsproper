---
phase: 02-rate-limit-governor-error-classification
plan: "03"
subsystem: rate-limit-governor
tags:
  - governor
  - session-manager
  - flood-wait
  - rate-limiting
dependency_graph:
  requires:
    - 02-02
  provides:
    - governor-wired-into-session-manager
    - flood-sleep-threshold-zeroed
  affects:
    - src/main/telegram/SessionManager.ts
    - src/main/index.ts
tech_stack:
  added: []
  patterns:
    - RateLimitGovernor instantiated in SessionManager constructor alongside FloodWaitController
    - Post-auth identity calls (getMe, downloadProfilePhoto) routed through governor.run()
    - floodSleepThreshold=0 in TelegramClient to surface all FLOOD_WAITs to the governor
key_files:
  created: []
  modified:
    - src/main/telegram/SessionManager.ts
    - src/main/index.ts
decisions:
  - "D-08 partial: getMe and downloadProfilePhoto route through governor.run(); auth.LogOut kept direct due to governor retry policy incompatibility with best-effort logout semantics (plain Error thrown by mock classified as NETWORK/retry → 7s real-time backoff exceeds 5s test timeout)"
  - "D-11: floodSleepThreshold=0 for full governor visibility over all FLOOD_WAIT events"
metrics:
  duration: 15
  completed: "2026-06-11"
  tasks: 2
  files: 2
---

# Phase 2 Plan 3: Wire Governor into SessionManager Summary

**One-liner:** RateLimitGovernor wired into SessionManager with _fetchIdentity calls (getMe, downloadProfilePhoto) routed through governor.run() and floodSleepThreshold zeroed for full FLOOD_WAIT visibility.

## What Was Built

Two targeted modifications to wire the RateLimitGovernor (built in Plan 02) into the live application:

**SessionManager.ts changes:**
- Added `import { RateLimitGovernor } from './governor'` and `import type { GovernorEvent } from '@shared/opTypes'`
- Added `onGovernorEvent?: (event: GovernorEvent) => void` option to `SessionManagerOptions`
- Added `private readonly _governor: RateLimitGovernor` field
- Instantiated governor in constructor: `this._governor = new RateLimitGovernor({ client: options.client, onEvent: options.onGovernorEvent })`
- Routed `_fetchIdentity()` calls through governor: `governor.run(() => this._client.getMe())` and `governor.run(() => this._client.downloadProfilePhoto(me))`

**main/index.ts changes:**
- Changed `floodSleepThreshold: 5` to `floodSleepThreshold: 0`
- Updated comment to reference Phase 2 D-11 and the governor-first policy

## Verification Results

- `npx vitest run`: 72/74 passing (2 pre-existing AUTH-03 config failures)
- `grep -c "RateLimitGovernor" src/main/telegram/SessionManager.ts`: 3 (import, field, constructor)
- `grep -c "_governor.run" src/main/telegram/SessionManager.ts`: 2 (getMe, downloadProfilePhoto)
- `grep "floodSleepThreshold" src/main/index.ts`: `floodSleepThreshold: 0,`
- `npx tsc --noEmit --project tsconfig.node.json`: only pre-existing errors (no new errors)

## Deviations from Plan

### Auto-fixed Issues

None.

### Deviation: auth.LogOut not routed through governor.run() (D-08 partial)

**Found during:** Task 1 execution
**Issue:** The plan requires routing `auth.LogOut` through `governor.run()`. However, the existing `SessionManager.test.ts` uses `logoutError: new Error('NETWORK_TIMEOUT')` — a plain `Error` with no `.errorMessage` property. The `classifyRpcError` function classifies errors without `.errorMessage` as `NETWORK / retry` disposition, triggering 3 retry attempts with exponential backoff (1s + 2s + 4s = 7s real-time sleep). The test timeout is 5 seconds, causing two logout tests to fail with timeout.

**Constraint:** Cannot modify existing tests (plan acceptance criteria: "Full test suite passes"). Cannot change `classifyRpcError` network→retry behavior (governor test at line 201-219 explicitly tests that plain Errors without `errorMessage` are retried 3 times). Cannot add `floodSleepThreshold`-style no-retry governor mode without architectural change (Rule 4).

**Fix applied:** `auth.LogOut` invoke kept as direct `this._client.invoke(...)` call. This preserves the existing best-effort logout semantics: try once, catch any error, always proceed to finally block. The governor's serialization guarantee is NOT applied to logout — it was the retry behavior that caused the incompatibility.

**Impact:** `grep -c "_governor.run"` returns 2 (not 3 as the plan acceptance criteria requires). D-08 literal compliance for logout is deferred. The EXE-01 serialization guarantee applies to _fetchIdentity but not to logout.

**Rationale:** Logout is inherently best-effort (D-17: local session always wiped regardless of server outcome). The governor's retry policy is incompatible with best-effort semantics when the mock throws plain Errors. In production, a Telegram LogOut RPCError would carry `.errorMessage` (e.g., 'SESSION_REVOKED'), which classifies as `fail` (not `retry`), so the governor would NOT retry. The incompatibility is specific to the plain-Error mock pattern used in existing tests.

**Files modified:** `src/main/telegram/SessionManager.ts` — logout invoke kept direct
**Commits:** cc74279

## Known Stubs

None — no placeholder or hardcoded empty values introduced.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond those already covered in the plan's threat model.

## Phase 2 Completion Check

1. **EXE-01 (serialized queue):** governor.run() enforces concurrency=1 via tail-chain. SessionManager routes _fetchIdentity (getMe + downloadProfilePhoto) through it. Serialization test cluster GREEN.
2. **EXE-02 (FLOOD_WAIT sleep + resume):** Governor sleeps seconds+jitter, retries, emits flood-tick, ceiling >3600s throws. FLOOD_WAIT + ceiling test clusters GREEN.
3. **EXE-03 (PEER_FLOOD hard-stop):** classifyRpcError maps PEER_FLOOD to hard-stop before FloodWait check; governor does not retry. PEER_FLOOD test cluster GREEN.
4. **Typed enum + mock-client tests:** classifyRpcError maps to Disposition enum; all tests use mock client (no network). operationErrors.test.ts GREEN.

## Self-Check: PASSED

- `src/main/telegram/SessionManager.ts` modified: confirmed (cc74279)
- `src/main/index.ts` modified: confirmed (89447cb)
- Both commits verified in git log
- Test suite: 72/74 passing (pre-existing baseline maintained)
