---
phase: 02-rate-limit-governor-error-classification
plan: "02"
subsystem: rate-limit-governor
tags:
  - governor
  - error-classification
  - flood-wait
  - rate-limiting
  - telegram
dependency_graph:
  requires:
    - 02-01  # shared opTypes.ts and RED test stubs
  provides:
    - classifyRpcError (operationErrors.ts) — used by governor.ts and future Phase 5 executor
    - RateLimitGovernor (governor.ts) — used by Phase 3+ Telegram call sites
  affects:
    - "src/main/telegram/governor.ts"
    - "src/main/telegram/operationErrors.ts"
tech_stack:
  added: []
  patterns:
    - hand-rolled tail-chain serial queue (no p-queue dep)
    - injectable TimingSource for FloodWaitController (D-18 seam)
    - classifyRpcError PEER_FLOOD-first branch order (Pitfall 1 protection)
    - globalThis.setTimeout for FLOOD_WAIT sleep with additive jitter
    - no-op resultPromise.catch() to suppress unhandled-rejection warnings in fake-timer tests
key_files:
  created:
    - src/main/telegram/operationErrors.ts
    - src/main/telegram/governor.ts
  modified: []
decisions:
  - "D-03: floodWaitSeconds() from floodWait.ts is the single source of truth for FLOOD_WAIT duration — not reimplemented in operationErrors.ts"
  - "D-05/D-07: Hand-rolled tail-chain (_tail Promise<void>) used for serialization instead of p-queue — zero deps, no ESM config issues (RESEARCH Pitfall 3)"
  - "void options.client used instead of storing _client field — governor.run() calls caller-supplied fn() directly; client stored by callers via closure"
  - "resultPromise.catch(() => {}) added to suppress unhandled-rejection Node warnings when rejections occur inside vi.advanceTimersByTimeAsync before test handler attaches"
  - "OperationErrorCode and Disposition type imports removed from operationErrors.ts — ClassifiedOperationError return type fully captures them, reducing TS6196 noise"
metrics:
  duration: "7 minutes"
  completed: "2026-06-11"
  tasks: 2
  files_created: 2
  files_modified: 0
---

# Phase 02 Plan 02: Rate-Limit Governor and Operation Error Classifier Summary

**One-liner:** PEER_FLOOD-first error classifier and hand-rolled tail-chain serial governor with FloodWaitController-driven countdown, jitter sleep, 3600s ceiling, and 3-attempt transient backoff.

## What Was Built

### Task 1: classifyRpcError in operationErrors.ts

`src/main/telegram/operationErrors.ts` provides the single translation layer between raw GramJS RPCError strings and typed `ClassifiedOperationError` values:

- PEER_FLOOD check comes **before** FloodWaitError check (critical per Pitfall 1 — PEER_FLOOD has no dedicated GramJS class, only an `errorMessage` string)
- FLOOD_WAIT uses `floodWaitSeconds()` imported from `./floodWait` — one source of truth per D-03
- SESSION_INVALID_ERRORS set covers 4 dead-session codes (mirrors SessionManager.ts pattern)
- Network errors (no errorMessage field) → NETWORK/retry
- Unmapped RPCErrors → UNKNOWN/fail
- Does not import from `./errors` — D-02 compliance maintained

### Task 2: RateLimitGovernor class in governor.ts

`src/main/telegram/governor.ts` provides the `RateLimitGovernor` class:

- **Serialization (EXE-01/T-02-05):** hand-rolled `_tail: Promise<void>` tail-chain. Each `run(fn)` call chains onto `_tail` so concurrent calls execute strictly one-at-a-time.
- **FLOOD_WAIT (EXE-02/D-09/D-10):** `FloodWaitController.start()` drives 1-Hz countdown ticks; separate `globalThis.setTimeout` sleeps for `seconds + jitter` ms where jitter J = clamp(0.1*s, 1s, 5s). After sleep, `floodController.stop()` cancels remaining ticks.
- **FLOOD_WAIT ceiling (D-12/T-02-04):** waits > FLOOD_CEILING_S (3600s) emit `wait-too-long` event and throw immediately — no blocking sleep.
- **PEER_FLOOD (EXE-03/D-13):** `classifyRpcError` returns `hard-stop`; governor emits `hard-stop` event and re-throws with zero retries.
- **Transient retry (D-14/T-02-07):** bounded 3-attempt exponential backoff `[1000, 2000, 4000]ms` + up to 500ms jitter, then throws.
- **GovernorEvent (T-02-06):** emits only typed events — no raw errorMessage strings or GramJS Error objects cross the boundary.

## Test Results

- `operationErrors.test.ts`: 8/8 tests GREEN
- `governor.test.ts`: 7/7 tests GREEN (5 describe blocks, all passing)
- Full suite: 72/74 passing (2 pre-existing AUTH-03 config.test.ts failures unrelated to this phase)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused OperationErrorCode/Disposition imports in operationErrors.ts**
- **Found during:** TypeScript check after Task 1
- **Issue:** `OperationErrorCode` and `Disposition` imported but not explicitly referenced — they're already captured by the `ClassifiedOperationError` return type
- **Fix:** Removed those two type imports; only `ClassifiedOperationError` imported
- **Files modified:** `src/main/telegram/operationErrors.ts`
- **Commit:** 4e7ff09

**2. [Rule 1 - Bug] Removed unused _client field in governor.ts**
- **Found during:** TypeScript check after Task 2
- **Issue:** Storing `this._client = options.client` caused TS6133 (declared but never read) — governor.run() takes caller-supplied fn() and doesn't invoke the client directly
- **Fix:** Replaced with `void options.client` to accept the DI parameter without storing unused field
- **Files modified:** `src/main/telegram/governor.ts`
- **Commit:** 4e7ff09

**3. [Rule 1 - Bug] Added no-op resultPromise.catch() to suppress unhandled rejection warnings**
- **Found during:** Initial test run of governor.test.ts
- **Issue:** `Vitest caught 1 unhandled error` warning for "transient error retries up to 3 times then throws" test — `resultPromise` rejected inside `vi.advanceTimersByTimeAsync` before the test's `rejects.toThrow()` handler attached
- **Fix:** Added `resultPromise.catch(() => {})` immediately after creating the result promise in `run()` — attaches an immediate handler to prevent Node.js unhandled-rejection tracking while the caller's real handler still fires normally
- **Files modified:** `src/main/telegram/governor.ts`
- **Commit:** 4e7ff09

## Pre-existing Issues (Not Fixed)

The following TS errors existed before this plan and are out of scope:

- `governor.test.ts(185,51)` and `governor.test.ts(211,57)`: TS2554 "Expected 0 arguments, but got 1" — vi.fn() typed with 0-arg callback vs invoke(request) call; pre-existing in Plan 01 test stubs
- `governor.test.ts(13,30)`: TS6196 'Disposition' unused import — pre-existing in Plan 01 test stubs
- `config.test.ts` AUTH-03 failures — env variable injection tests that require MRPROPER_API_ID/API_HASH

## Known Stubs

None — both files are fully implemented with no placeholder or hardcoded empty values.

## Threat Flags

No new security-relevant surface introduced beyond what the plan's threat model documents. All T-02-03 through T-02-07 mitigations implemented as specified.

## Self-Check: PASSED

Files created:
- FOUND: src/main/telegram/operationErrors.ts
- FOUND: src/main/telegram/governor.ts

Commits:
- FOUND: 395c73d (feat(02-02): implement classifyRpcError in operationErrors.ts)
- FOUND: 4e7ff09 (feat(02-02): implement RateLimitGovernor class in governor.ts)

Tests: 15/15 GREEN for plan's test files, 72/74 full suite (2 pre-existing unrelated failures)
