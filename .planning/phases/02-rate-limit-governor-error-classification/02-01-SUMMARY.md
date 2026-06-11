---
phase: 02-rate-limit-governor-error-classification
plan: "01"
subsystem: api
tags: [typescript, gramjs, telegram, rate-limiting, error-classification, vitest]

requires:
  - phase: 01-foundation-auth-session-portable-shell
    provides: authTypes.ts pattern (string literal unions, interface pattern, header style); floodWait.ts FloodTick type

provides:
  - src/shared/opTypes.ts — Disposition, OperationErrorCode, ClassifiedOperationError, GovernorEvent types
  - src/main/telegram/governor.test.ts — RED test stubs (5 describe blocks) for RateLimitGovernor
  - src/main/telegram/operationErrors.test.ts — RED test stubs (2 describe blocks) for classifyRpcError

affects:
  - 02-02 (implements governor.ts and operationErrors.ts against these exact type contracts)
  - 02-03 (integration plan — consumes GovernorEvent and Disposition from opTypes.ts)
  - Phase 5 (executor consumes Disposition values for per-group skip/fail/hard-stop decisions)

tech-stack:
  added: []
  patterns:
    - "typed-enum-at-the-boundary: Disposition and OperationErrorCode are typed string literals; no raw Telegram strings cross layer boundaries"
    - "discriminated-union-events: GovernorEvent uses type discriminant field for each event variant"
    - "RED-first test stubs: test files import not-yet-existing modules to establish contractual test shape before implementation"

key-files:
  created:
    - src/shared/opTypes.ts
    - src/main/telegram/governor.test.ts
    - src/main/telegram/operationErrors.test.ts
  modified: []

key-decisions:
  - "Disposition is a string literal union (not enum) matching authTypes.ts pattern — consistent with Phase 1 convention"
  - "GovernorEvent members carry only typed codes and numeric values — no raw Telegram error strings (satisfies T-02-01 threat mitigation)"
  - "hard-stop and wait are distinct Disposition literals — prevents PEER_FLOOD from silently mapping to retryable wait (satisfies T-02-02 threat mitigation)"
  - "retryAfterSeconds is only present on ClassifiedOperationError when disposition is wait — tight contract prevents misuse"

patterns-established:
  - "GovernorEvent discriminated union: { type: 'flood-tick'; remaining: number } | { type: 'hard-stop'; code: OperationErrorCode } | ..."
  - "Test helper factories: makeFloodError(seconds), makePeerFloodError(), makeTransientError() — copy pattern from errors.test.ts makeRPCError"
  - "Fake timer teardown: afterEach(() => vi.useRealTimers()) per describe block, vi.useFakeTimers() inside each it()"

requirements-completed:
  - EXE-01
  - EXE-02
  - EXE-03

duration: 3min
completed: "2026-06-11"
---

# Phase 2 Plan 01: Shared Op Types and RED Tests Summary

**Typed Disposition/GovernorEvent contracts in opTypes.ts plus RED test stubs establishing the governor and classifier test surface for Plan 02-02**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-11T09:55:41Z
- **Completed:** 2026-06-11T09:58:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `src/shared/opTypes.ts` with four exports: `Disposition` (5 literals), `OperationErrorCode` (5 codes), `ClassifiedOperationError` interface, and `GovernorEvent` discriminated union (4 variants)
- Created `src/main/telegram/governor.test.ts` with five describe blocks covering EXE-01 serialization, EXE-02 FLOOD_WAIT sleep/countdown, EXE-02 ceiling (D-12), EXE-03 PEER_FLOOD hard-stop, and D-14 transient retry
- Created `src/main/telegram/operationErrors.test.ts` with two describe blocks covering PEER_FLOOD distinct classification (EXE-03) and full D-04 taxonomy

## Task Commits

Each task was committed atomically:

1. **Task 1: Define shared operation types in src/shared/opTypes.ts** - `60533a5` (feat)
2. **Task 2: Write RED test stubs for governor.test.ts and operationErrors.test.ts** - `b2c7aae` (test)

## Files Created/Modified

- `src/shared/opTypes.ts` — Disposition, OperationErrorCode, ClassifiedOperationError, GovernorEvent types; single source of truth for Plans 02-02 and 02-03
- `src/main/telegram/governor.test.ts` — RED stubs for RateLimitGovernor; fails with "Cannot find module './governor'" until Plan 02-02
- `src/main/telegram/operationErrors.test.ts` — RED stubs for classifyRpcError; fails with "Cannot find module './operationErrors'" until Plan 02-02

## Decisions Made

- Disposition is a string literal union (not a TypeScript enum) — consistent with `AuthErrorCode` pattern in authTypes.ts; string literals are simpler to serialise across IPC boundaries
- `retryAfterSeconds` is optional on `ClassifiedOperationError` and only valid when `disposition === 'wait'` — keeps the interface tight and prevents misuse in Plan 02-02
- `GovernorEvent` carries only numeric `remaining`/`seconds`/`attempt` values and typed `OperationErrorCode` — no raw GramJS error strings (satisfies T-02-01 threat mitigation)
- `hard-stop` and `wait` are distinct Disposition literals — PEER_FLOOD cannot silently be treated as retryable (satisfies T-02-02 threat mitigation)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `SessionManager.ts` has a pre-existing TypeScript syntax error at line 214 (`',' expected`) that causes `tsc --noEmit` to exit non-zero. This error predates this plan and is not related to `opTypes.ts`. Verified by stashing changes and confirming the error persists without new files. No new errors introduced by this plan.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. `opTypes.ts` is a pure type-definition file with zero runtime dependencies. GovernorEvent members carry only typed codes and numeric values — no raw Telegram strings (T-02-01 mitigated by design).

## Next Phase Readiness

- `src/shared/opTypes.ts` is the typed contract Plan 02-02 implements against — no changes required
- Both RED test files define the exact describe block strings the `02-VALIDATION.md` `-t` filters expect
- Plan 02-02 implements `governor.ts` and `operationErrors.ts`; these test files immediately turn from RED to GREEN

---
*Phase: 02-rate-limit-governor-error-classification*
*Completed: 2026-06-11*
