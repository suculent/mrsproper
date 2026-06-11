---
phase: 02-rate-limit-governor-error-classification
verified: 2026-06-11T12:40:00Z
status: gaps_found
score: 16/17 must-haves verified
overrides_applied: 0
gaps:
  - truth: "D-08: SessionManager.logout() routes the auth.LogOut invoke call via governor.run()"
    status: failed
    reason: "auth.LogOut invoke at SessionManager.ts:288 remains a direct this._client.invoke() call. Governor run() is called 2 times (getMe, downloadProfilePhoto), not 3. The plan's acceptance criterion '_governor.run count = 3' is not met."
    artifacts:
      - path: "src/main/telegram/SessionManager.ts"
        issue: "Line 288: await this._client.invoke(new Api.auth.LogOut({})) — not routed through this._governor.run()"
    missing:
      - "Route auth.LogOut through governor.run() OR add a formal override accepting the deviation with rationale"
  - truth: "New TypeScript errors introduced by Phase 2 (WR-08): 3 errors in governor.test.ts not present in Phase 1 baseline"
    status: failed
    reason: "tsc --noEmit -p tsconfig.node.json reports 3 new errors in governor.test.ts: TS6196 Disposition unused import (line 13), TS2554 Expected 0 arguments but got 1 (lines 185, 211). These files were created in Phase 2 and the errors are attributable to Phase 2. CLAUDE.md states 'strong typing matters when a typo triggers a destructive EditBanned call'. Introducing typed-interface violations in test files erodes the tsc gate."
    artifacts:
      - path: "src/main/telegram/governor.test.ts"
        issue: "Line 13: 'Disposition' imported but never used (TS6196). Lines 185, 211: createMockClient().invoke({}) called against 0-arg vi.fn() type (TS2554)."
    missing:
      - "Remove unused Disposition import from governor.test.ts line 13"
      - "Fix createMockClient factory: change invokeImpl type signature from '() => Promise<unknown>' to '(req?: unknown) => Promise<unknown>' so client.invoke({}) type-checks"
human_verification: []
---

# Phase 2: Rate-Limit Governor & Error Classification — Verification Report

**Phase Goal:** Every Telegram call in the app routes through one serialized, rate-limited governor that honors FLOOD_WAIT by sleeping and resuming, and treats PEER_FLOOD as a distinct hard-stop — so no feature built later can flood the account.
**Verified:** 2026-06-11T12:40:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

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
| 17 | D-08: auth.LogOut routed via governor.run() | FAILED | SessionManager.ts:288 uses direct this._client.invoke() — _governor.run count = 2, not 3 |

**Score:** 16/17 truths verified

### Roadmap Success Criteria

| SC | Criterion | Status | Notes |
|----|-----------|--------|-------|
| SC1 | All Telegram requests through single serialized queue, no parallel blasting | PARTIAL | getMe + downloadProfilePhoto serialized. auth.LogOut bypasses queue. Infrastructure calls (connect, checkAuthorization, disconnect) correctly excluded per D-06. |
| SC2 | FLOOD_WAIT_X: governor sleeps duration+jitter, resumes, emits countdown event | VERIFIED | governor.ts implements all three: setTimeout sleep, FloodWaitController countdown ticks, 3600s ceiling. 2 test clusters GREEN. |
| SC3 | PEER_FLOOD classified distinctly from FLOOD_WAIT, hard-stops with no retry | VERIFIED | PEER_FLOOD-first branch, 'hard-stop' disposition, governor emits event and throws without retry. |
| SC4 | Single classification function maps RPC errors to typed enum, mock-client tests | VERIFIED | classifyRpcError() exists, maps to Disposition enum (wait/retry/fail/hard-stop), 15/15 tests GREEN (8 operationErrors + 7 governor). |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/opTypes.ts` | Disposition, OperationErrorCode, ClassifiedOperationError, GovernorEvent | VERIFIED | All 4 types exported. All 4 GovernorEvent discriminants present. No raw Telegram strings. |
| `src/main/telegram/operationErrors.ts` | classifyRpcError() — PEER_FLOOD-first taxonomy | VERIFIED | Exports classifyRpcError. PEER_FLOOD→hard-stop at line 61. Does NOT import from ./errors (D-02). Uses floodWaitSeconds from ./floodWait (D-03). |
| `src/main/telegram/governor.ts` | RateLimitGovernor with run() — EXE-01/02/03 | VERIFIED | Exports RateLimitGovernor and GovernorClient. _tail chain present (2+ refs). FLOOD_CEILING_S defined and used. FloodWaitController used. No p-queue import. |
| `src/main/telegram/governor.test.ts` | 5 describe blocks, GREEN, RED-state resolved | VERIFIED | 5 describe blocks (serialization, FLOOD_WAIT, ceiling, PEER_FLOOD, transient retry). 7/7 tests GREEN. |
| `src/main/telegram/operationErrors.test.ts` | 2 describe blocks, GREEN | VERIFIED | 2 describe blocks (PEER_FLOOD distinct, full taxonomy). 8/8 tests GREEN. |
| `src/main/telegram/SessionManager.ts` | _governor field, D-08 routing | PARTIAL | _governor field present, getMe+downloadProfilePhoto routed. auth.LogOut NOT routed (documented deviation). |
| `src/main/index.ts` | floodSleepThreshold: 0, D-11 comment | VERIFIED | Line 113: floodSleepThreshold: 0. D-11 comment with rationale present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `governor.ts` | `operationErrors.ts` | import { classifyRpcError } | WIRED | Line 28 import, line 125 call |
| `governor.ts` | `floodWait.ts` | import { FloodWaitController, TimingSource } | WIRED | Line 27 import, line 67/78 usage |
| `governor.ts` | `opTypes.ts` | import type { GovernorEvent, ClassifiedOperationError } | WIRED | Line 26 import, used throughout |
| `operationErrors.ts` | `opTypes.ts` | import type { ClassifiedOperationError } | WIRED | Line 24 import, return type |
| `operationErrors.ts` | `floodWait.ts` | import { floodWaitSeconds } | WIRED | Line 25 import, line 68 call |
| `SessionManager.ts` | `governor.ts` | import { RateLimitGovernor } | WIRED | Line 34 import, lines 114/135/359-360 |
| `governor.run()` | `auth.LogOut` | NOT via governor.run() | NOT_WIRED | SessionManager.ts:288 uses direct client.invoke |

### Data-Flow Trace (Level 4)

Not applicable for this phase — no data-rendering artifacts. All artifacts are middleware services (classifier, governor, type contracts).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Governor + classifier tests GREEN | `npx vitest run governor.test.ts operationErrors.test.ts` | 15 passed (0 failed) | PASS |
| Full suite no regressions | `npx vitest run` | 72/74 passing (2 pre-existing AUTH-03) | PASS |

### Probe Execution

No probes declared for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXE-01 | 02-01, 02-02, 02-03 | All Telegram calls through single serialized rate-limited governor | PARTIAL | Governor serializes via _tail chain. _fetchIdentity calls routed. auth.LogOut not routed. Infrastructure calls correctly excluded per D-06. |
| EXE-02 | 02-01, 02-02 | Honor FLOOD_WAIT by sleeping server-specified time and resuming | SATISFIED | governor.ts:134-162 implements full FLOOD_WAIT policy: sleep+jitter, countdown ticks, 3600s ceiling. 3 test clusters GREEN. |
| EXE-03 | 02-01, 02-02 | Detect PEER_FLOOD distinctly, hard-stop with no retry | SATISFIED | PEER_FLOOD-first check (operationErrors.ts:61), hard-stop disposition, governor emits event and throws. PEER_FLOOD test clusters GREEN. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `governor.test.ts` | 13 | TS6196: Disposition imported but never used | WARNING | Erodes TypeScript gate in test infrastructure. Project explicitly values strong typing for destructive call protection. |
| `governor.test.ts` | 185, 211 | TS2554: client.invoke({}) called against 0-arg vi.fn() mock type | WARNING | Test mock interface mismatch — invoke() on GovernorClient accepts `request: unknown` but createMockClient factory types it as `() => Promise<unknown>`. Tests pass at runtime (vitest doesn't type-check) but tsc gate fails. |
| `governor.ts` | 128 | Misleading comment: "PEER_FLOOD or session-invalid — abort immediately" | WARNING | SESSION_INVALID maps to 'fail' not 'hard-stop', so this path NEVER fires for SESSION_INVALID. Comment contradicts behavior. (CR-01 from code review.) |

No TBD, FIXME, or XXX debt markers found in any Phase 2 files.

### Internal Consistency Issue: SESSION_INVALID Disposition (CR-01)

**Not a ROADMAP blocker but documents a contract mismatch:**

`opTypes.ts:14` documents `hard-stop` as "PEER_FLOOD / session-invalid: abort the job immediately" and the `hard-stop` GovernorEvent docstring says "PEER_FLOOD **or session-invalid** surfaced — job must hard-stop." Governor.ts:128 repeats this comment. However, `operationErrors.ts:79-81` maps `SESSION_INVALID_ERRORS` to `disposition: 'fail'`, and tests assert `'fail'` (operationErrors.test.ts:87-97).

Practical consequence: A dead-session mid-bulk-job will NOT emit a `hard-stop` GovernorEvent. Phase 5's executor will receive the error via the rejection path (governor propagates fail immediately without retry, which is correct behavior), but cannot distinguish SESSION_INVALID from other fail cases via events alone. The ROADMAP SC3 only requires PEER_FLOOD to be hard-stopped, so SC3 is met. The comment/docstring in opTypes.ts and governor.ts is misleading and should be corrected.

### Gaps Summary

**Gap 1: D-08 auth.LogOut not routed through governor.run() (BLOCKER vs plan must_have)**

The plan's must_have `"D-08: SessionManager.logout() routes the auth.LogOut invoke call via governor.run()"` is literally not met. `_governor.run` is called 2 times (getMe, downloadProfilePhoto), not 3. The deviation was discovered during execution when the existing test mock (`logoutError: new Error('NETWORK_TIMEOUT')`) triggered the NETWORK→retry path, causing 7s of real-time backoff that exceeded the 5-second test timeout.

The deviation is well-documented and the rationale is sound (auth.LogOut is best-effort by design; the governor's retry policy is incompatible with this semantics when mocks throw plain Errors). In production with a real Telegram server, a LogOut RPCError would carry `.errorMessage` (e.g., 'SESSION_REVOKED'), which classifies as 'fail' (no retry), so the incompatibility is specific to the mock pattern.

The gap does NOT affect the ROADMAP SC1's core concern about parallel blasting — auth.LogOut is never called concurrently and is not a volume-flood risk. However, the phase goal wording ("Every Telegram call") and the plan must_have are not satisfied.

**Resolution options:**
1. Add an override accepting the deviation — the root cause is a mock-typing issue, not a functional one.
2. Fix the mock and re-route logout through governor.

To accept the deviation, add to VERIFICATION.md frontmatter:
```yaml
overrides:
  - must_have: "D-08: SessionManager.logout() routes the auth.LogOut invoke call via governor.run()"
    reason: "auth.LogOut is best-effort by design; governor retry policy is incompatible with best-effort semantics when tests use plain Error mocks (no .errorMessage). In production, Telegram LogOut errors carry .errorMessage and would not trigger retry. The flood risk SC1 addresses is bulk parallel blasting, which auth.LogOut never performs."
    accepted_by: "{your name}"
    accepted_at: "{ISO timestamp}"
```

**Gap 2: 3 new TypeScript errors in governor.test.ts (WARNING)**

The known Phase 1 baseline is ~17 tsc errors. Phase 2 introduces 3 additional errors in `governor.test.ts` (which Phase 2 created). These are:
- Line 13: `Disposition` imported but never used (TS6196) — trivial fix, remove the import
- Lines 185, 211: `createMockClient().invoke({})` called against 0-arg mock type (TS2554) — fix by changing `invokeImpl?: () => Promise<unknown>` to `invokeImpl?: (req?: unknown) => Promise<unknown>` in the factory

These errors were present from Plan 01 of Phase 2 (when the test files were first created) and were not fixed during Plan 02 or 03. They are minor but erode the tsc gate that CLAUDE.md explicitly values for destructive operation safety.

---

_Verified: 2026-06-11T12:40:00Z_
_Verifier: Claude (gsd-verifier)_
