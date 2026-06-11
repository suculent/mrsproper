---
phase: 02-rate-limit-governor-error-classification
verified: 2026-06-11T16:12:00Z
status: passed
score: 17/17 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 16/17
  gaps_closed:
    - "D-08: auth.LogOut in SessionManager.logout() routed via governor.run() — _governor.run count = 3 (getMe, downloadProfilePhoto, LogOut)"
    - "3 new tsc errors in governor.test.ts eliminated: unused Disposition import removed, invokeImpl signature widened to (req?: unknown), SESSION_REVOKED added to MockRPCErrorCode"
    - "Misleading SESSION_INVALID hard-stop comments corrected in governor.ts:128 and opTypes.ts (CR-01)"
  gaps_remaining: []
  regressions: []
human_verification: []
---

# Phase 2: Rate-Limit Governor & Error Classification — Re-Verification Report

**Phase Goal:** Every Telegram call in the app routes through one serialized, rate-limited governor that honors FLOOD_WAIT by sleeping and resuming, and treats PEER_FLOOD as a distinct hard-stop — so no feature built later can flood the account.
**Verified:** 2026-06-11T16:12:00Z
**Status:** passed
**Re-verification:** Yes — after gap-closure plan 02-04

## Gap Closure Evidence (02-04)

The two blockers from the initial verification are confirmed closed in the codebase:

**Gap 1 — D-08 auth.LogOut routing:**
`grep -c "_governor.run" src/main/telegram/SessionManager.ts` returns **3**.
Confirmed lines: 288 (LogOut), 359 (getMe), 360 (downloadProfilePhoto). The governor.run() wrapper at line 288 is:
`await this._governor.run(() => this._client.invoke(new Api.auth.LogOut({})))`

**Gap 2 — TypeScript errors in governor.test.ts:**
`npx tsc --noEmit -p tsconfig.node.json 2>&1 | grep "governor.test.ts"` produces **no output**.
- `Disposition` import removed from governor.test.ts — `grep "Disposition" governor.test.ts` returns nothing.
- `createMockClient` factory now typed as `invokeImpl?: (req?: unknown) => Promise<unknown>` — confirmed at line 43.
- `SESSION_REVOKED` added to `MockRPCErrorCode` union in telegramClient.ts — confirmed at line 25.
- `logoutError` field renamed to `logoutErrorCode` — `grep "logoutError\b" telegramClient.ts` returns nothing.

**CR-01 — Misleading SESSION_INVALID comments:**
`grep "session-invalid" src/main/telegram/governor.ts` and `grep "session-invalid" src/shared/opTypes.ts` both return nothing.
opTypes.ts line 14 now reads: `hard-stop — PEER_FLOOD: abort the job immediately, no retry (SESSION_INVALID maps to 'fail' — see operationErrors.ts)`.
opTypes.ts line 57: `/** PEER_FLOOD surfaced — job must hard-stop. SESSION_INVALID maps to 'fail' disposition (operationErrors.ts). */`
governor.ts line 128: `// PEER_FLOOD — abort immediately, no retry (EXE-03 / D-13).`

**Pre-existing TS2345 (not a new regression):**
`tsc` reports 14 total errors. The TS2345 at SessionManager.ts:288 (`Argument of type '{}' is not assignable to parameter of type 'void'`) is attributable to `new Api.auth.LogOut({})` constructor arg — the same `{}` argument was present in the pre-02-04 direct invoke call and is a pre-Phase-2 baseline error. The re_verification_context confirms: "the TS2345 at SessionManager.ts:288 predates Phase 2 gap closure". Zero net new tsc errors from Phase 2.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Disposition type exists as 'wait' \| 'retry' \| 'skip' \| 'fail' \| 'hard-stop' | VERIFIED | opTypes.ts:16 exports exact string literal union |
| 2 | OperationErrorCode covers FLOOD_WAIT, PEER_FLOOD, SESSION_INVALID, NETWORK, UNKNOWN | VERIFIED | opTypes.ts:23-29 |
| 3 | ClassifiedOperationError interface with code, disposition, optional retryAfterSeconds | VERIFIED | opTypes.ts:35-42 |
| 4 | GovernorEvent discriminated union covers flood-tick, hard-stop, wait-too-long, retry-attempt | VERIFIED | opTypes.ts:50-72 |
| 5 | classifyRpcError checks PEER_FLOOD BEFORE FloodWaitError | VERIFIED | operationErrors.ts:61 precedes :68 — exact order verified |
| 6 | classifyRpcError returns PEER_FLOOD/hard-stop for PEER_FLOOD errors | VERIFIED | operationErrors.ts:61-63 |
| 7 | classifyRpcError returns FLOOD_WAIT/wait/retryAfterSeconds for FLOOD_WAIT_N errors | VERIFIED | operationErrors.ts:68-75 |
| 8 | governor.run(fn) serializes concurrent calls (concurrency=1) | VERIFIED | governor.ts:70+101 — hand-rolled _tail Promise<void> chain |
| 9 | governor.run(fn) sleeps seconds+jitter on FLOOD_WAIT and resumes | VERIFIED | governor.ts:154-156 — jitter J=clamp(0.1*s,1,5), sleep=setTimeout |
| 10 | governor.run(fn) emits flood-tick GovernorEvent during FLOOD_WAIT sleep | VERIFIED | governor.ts:146-149 — FloodWaitController.start drives 1-Hz ticks |
| 11 | governor.run(fn) throws on FLOOD_WAIT > 3600s without sleeping | VERIFIED | governor.ts:139-142 — FLOOD_CEILING_S=3600 comparison |
| 12 | governor.run(fn) hard-stops immediately on PEER_FLOOD, zero retries | VERIFIED | governor.ts:127-131 — hard-stop disposition → emit + throw |
| 13 | governor.run(fn) retries transient errors up to 3 times then throws | VERIFIED | governor.ts:165-183 — MAX_TRANSIENT_RETRIES=3, BACKOFF_BASE_MS=[1000,2000,4000] |
| 14 | SessionManager constructs RateLimitGovernor in constructor (D-05) | VERIFIED | SessionManager.ts:114 (_governor field), :135 (constructor instantiation) |
| 15 | _fetchIdentity() routes getMe and downloadProfilePhoto via governor.run() (D-08 partial) | VERIFIED | SessionManager.ts:359-360 |
| 16 | floodSleepThreshold set to 0 in main/index.ts (D-11) | VERIFIED | index.ts:113 |
| 17 | D-08: auth.LogOut routed via governor.run() | VERIFIED | SessionManager.ts:288 — `this._governor.run(() => this._client.invoke(new Api.auth.LogOut({})))`. grep -c returns 3. |

**Score:** 17/17 truths verified

### Roadmap Success Criteria

| SC | Criterion | Status | Notes |
|----|-----------|--------|-------|
| SC1 | All Telegram requests through single serialized queue, no parallel blasting | VERIFIED | getMe, downloadProfilePhoto, auth.LogOut all serialized via _governor.run(). Infrastructure calls (connect, checkAuthorization, disconnect) correctly excluded per D-06. |
| SC2 | FLOOD_WAIT_X: governor sleeps duration+jitter, resumes, emits countdown event | VERIFIED | governor.ts implements all three: setTimeout sleep, FloodWaitController countdown ticks, 3600s ceiling. Test clusters GREEN. |
| SC3 | PEER_FLOOD classified distinctly from FLOOD_WAIT, hard-stops with no retry | VERIFIED | PEER_FLOOD-first branch, 'hard-stop' disposition, governor emits event and throws without retry. |
| SC4 | Single classification function maps RPC errors to typed enum, mock-client tests | VERIFIED | classifyRpcError() exists, maps to Disposition enum (wait/retry/fail/hard-stop), 15/15 tests GREEN. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/opTypes.ts` | Disposition, OperationErrorCode, ClassifiedOperationError, GovernorEvent | VERIFIED | All 4 types exported. All 4 GovernorEvent discriminants present. SESSION_INVALID comments corrected (CR-01). |
| `src/main/telegram/operationErrors.ts` | classifyRpcError() — PEER_FLOOD-first taxonomy | VERIFIED | Exports classifyRpcError. PEER_FLOOD→hard-stop at line 61. |
| `src/main/telegram/governor.ts` | RateLimitGovernor with run() — EXE-01/02/03 | VERIFIED | Exports RateLimitGovernor and GovernorClient. _tail chain present. FLOOD_CEILING_S defined and used. FloodWaitController used. session-invalid comment corrected (CR-01). |
| `src/main/telegram/governor.test.ts` | 5 describe blocks, GREEN, tsc-clean | VERIFIED | 5 describe blocks, 7/7 tests GREEN. Zero tsc errors (Disposition import removed, invokeImpl widened). |
| `src/main/telegram/operationErrors.test.ts` | 2 describe blocks, GREEN | VERIFIED | 2 describe blocks, 8/8 tests GREEN. |
| `src/main/telegram/SessionManager.ts` | _governor field, full D-08 routing | VERIFIED | _governor field present. getMe, downloadProfilePhoto, auth.LogOut all routed — _governor.run count = 3. |
| `src/main/telegram/__mocks__/telegramClient.ts` | logoutErrorCode field, SESSION_REVOKED in union | VERIFIED | logoutErrorCode field at line 67. SESSION_REVOKED at line 25 of MockRPCErrorCode union. logoutError field absent. |
| `src/main/index.ts` | floodSleepThreshold: 0, D-11 comment | VERIFIED | Line 113: floodSleepThreshold: 0. D-11 comment with rationale present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `governor.ts` | `operationErrors.ts` | import { classifyRpcError } | WIRED | Line 28 import, line 125 call |
| `governor.ts` | `floodWait.ts` | import { FloodWaitController, TimingSource } | WIRED | Line 27 import, line 67/78 usage |
| `governor.ts` | `opTypes.ts` | import type { GovernorEvent, ClassifiedOperationError } | WIRED | Line 26 import, used throughout |
| `operationErrors.ts` | `opTypes.ts` | import type { ClassifiedOperationError } | WIRED | Line 24 import, return type |
| `operationErrors.ts` | `floodWait.ts` | import { floodWaitSeconds } | WIRED | Line 25 import, line 68 call |
| `SessionManager.ts` | `governor.ts` | import { RateLimitGovernor } | WIRED | Line 34 import, lines 114/135/288/359-360 |
| `SessionManager.logout()` | `RateLimitGovernor.run()` | `this._governor.run(() => this._client.invoke(new Api.auth.LogOut({})))` | WIRED | SessionManager.ts:288 — D-08 fully compliant |

### Data-Flow Trace (Level 4)

Not applicable for this phase — no data-rendering artifacts. All artifacts are middleware services (classifier, governor, type contracts).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Governor + classifier tests GREEN | `npx vitest run governor.test.ts operationErrors.test.ts` | 15 passed (0 failed) | PASS |
| SessionManager logout tests GREEN | `npx vitest run SessionManager.test.ts` | 4 passed (0 failed) | PASS |
| Full suite no regressions | `npx vitest run` | 72/74 passing (2 pre-existing AUTH-03) | PASS |
| governor.test.ts tsc clean | `tsc --noEmit ... \| grep "governor.test.ts"` | no output | PASS |
| Total tsc errors unchanged | `tsc --noEmit ...` | 14 errors (same as pre-02-04 baseline) | PASS |

### Probe Execution

No probes declared for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXE-01 | 02-01, 02-02, 02-03, 02-04 | All Telegram calls through single serialized rate-limited governor | SATISFIED | Governor serializes via _tail chain. All three Telegram invoke calls in SessionManager (getMe, downloadProfilePhoto, auth.LogOut) routed through _governor.run(). Infrastructure calls correctly excluded per D-06. |
| EXE-02 | 02-01, 02-02 | Honor FLOOD_WAIT by sleeping server-specified time and resuming | SATISFIED | governor.ts implements full FLOOD_WAIT policy: sleep+jitter, countdown ticks, 3600s ceiling. Test clusters GREEN. |
| EXE-03 | 02-01, 02-02 | Detect PEER_FLOOD distinctly, hard-stop with no retry | SATISFIED | PEER_FLOOD-first check (operationErrors.ts:61), hard-stop disposition, governor emits event and throws. Test clusters GREEN. |

### Anti-Patterns Found

No TBD, FIXME, or XXX debt markers found in any Phase 2 files.
No stub patterns, empty returns, or placeholder values found in Phase 2 files.
The CR-01 misleading comment issue from the initial verification was resolved by plan 02-04 (governor.ts:128 and two opTypes.ts docstrings corrected).

### Human Verification Required

None. All acceptance criteria verified programmatically.

### Gaps Summary

No gaps. All 17 must-have truths verified. The two blockers from the initial verification (D-08 auth.LogOut routing, 3 tsc errors in governor.test.ts) are confirmed closed in the codebase by gap-closure plan 02-04.

---

_Verified: 2026-06-11T16:12:00Z_
_Verifier: Claude (gsd-verifier)_
