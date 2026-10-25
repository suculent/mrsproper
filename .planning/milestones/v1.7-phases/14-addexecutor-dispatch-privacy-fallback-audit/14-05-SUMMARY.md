---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
plan: 05
subsystem: telegram
tags: [gramjs, contacts.AddContact, governor, non-blocking-service]

# Dependency graph
requires:
  - phase: 14-addexecutor-dispatch-privacy-fallback-audit
    provides: "14-02: mock client AddContact branch (addContactCalls/addContactError) and TargetResolver deleted/bot/contact flag passthrough"
provides:
  - "src/main/telegram/contactService.ts: createContactService factory — addIfMissing() non-blocking contacts.AddContact wrapper per D-08"
affects: [14-10, target:addContact IPC handler, Phase 15 "Add to contacts" checkbox]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-blocking single-RPC service: swallow-all-failures contract returning { ok, code? } instead of throwing, single governor.run() call, defensive null-resolver no-op — first instance of this shape in the codebase (no prior analog; executors and IPC stores are the closest precedent but neither swallows failures into a return value)"

key-files:
  created:
    - src/main/telegram/contactService.ts
    - src/main/telegram/contactService.test.ts
  modified: []

key-decisions:
  - "No deviations beyond a same-task lint fix (see Deviations) — implementation follows the plan's exact action spec and 14-PATTERNS.md's Contact service skeleton verbatim (InputPeerUser construction, governor.run wrapping, resolved.name || 'Contact' fallback, phone: '' per D-08)."

patterns-established:
  - "Pattern: a standalone non-blocking Telegram service module — resolver read, skip-if-already-done guard, single governor.run() call, catch-and-return-code (never rethrow) — reusable shape for any future confirm-time, run-decoupled Telegram side-effect."

requirements-completed: [ADD-05]

# Metrics
duration: 2min
completed: 2026-10-03
---

# Phase 14 Plan 05: ContactService (Non-Blocking contacts.AddContact Wrapper) Summary

**Standalone `createContactService().addIfMissing()` wraps `contacts.AddContact` through the shared governor, skipping the call when the target is already a contact and swallowing every failure into `{ ok: false, code }` so Phase 15's confirm-time "Add to contacts" checkbox can call it without ever blocking the AddExecutor run.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-10-03T22:55:00+02:00 (approx)
- **Completed:** 2026-10-03T22:57:00+02:00
- **Tasks:** 2
- **Files modified:** 2 (2 created, 0 modified)

## Accomplishments
- `src/main/telegram/contactService.ts` created: `ContactServiceDeps`/`ContactService` interfaces and `createContactService()` factory, implementing D-08's exact contract (standalone, non-blocking, skip-if-already-contact, never-throw).
- `src/main/telegram/contactService.test.ts` created with 6 test cases covering the skip-if-contact path, the governed AddContact call, the non-blocking RPC-error path (`.resolves`, never `.rejects`), the null-resolver defensive no-op, the `phone: ''` passthrough, and the `governor.run` routing assertion.
- Both `npx vitest run src/main/telegram/contactService.test.ts` (6/6 pass) and `npx tsc --build` (clean) verified green; `grep -c "catch"` = 1 and `grep -c "throw"` = 0 in the implementation file, confirming the never-rethrows contract literally as well as behaviorally.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write contactService.test.ts with all tests failing** - `f0e569c` (test)
2. **Task 2 (GREEN): Implement contactService.ts to pass all tests** - `0e7e5c5` (feat)

**Plan metadata:** (this commit, created after this summary)

_Note: Task 2's commit also includes a same-task TS6133 lint fix to the Task 1 test file (see Deviations)._

## Files Created/Modified
- `src/main/telegram/contactService.ts` - `createContactService(deps)` factory; `addIfMissing()` returns `{ ok: true }` immediately when `resolver.getResolvedUser()` is `null` or `.contact === true`, otherwise builds an `Api.InputPeerUser` from the resolved id/accessHash and issues a single `governor.run(() => client.invoke(new Api.contacts.AddContact({ id, firstName, lastName: '', phone: '' })))`, catching any error and returning `{ ok: false, code: err.errorMessage ?? 'UNKNOWN' }`.
- `src/main/telegram/contactService.test.ts` - 6 `it()` blocks per the plan's Task 1 spec, using `createMockTelegramClient`'s existing `addContactCalls`/`addContactError` mock controls (Plan 14-02) and a local `makeResolver()` helper.

## Decisions Made
None beyond the plan's own specification — implementation matches 14-PATTERNS.md's "Contact service" skeleton and the plan's `<action>` block field-for-field (same interface names, same fallback `resolved.name || 'Contact'`, same catch-and-code behavior).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused `big-integer` import from contactService.test.ts**
- **Found during:** Task 2 (`npx tsc --build` verification step)
- **Issue:** Task 1's test file imported `bigInt` from `'big-integer'` per the plan's Task 1 `<action>` text, but the test bodies use native `BigInt('99')` literals (matching the `TargetResolver`-shaped resolver fixture, which stores plain `bigint`, not `big-integer` wrapper objects) — the import was never referenced, so `tsc --build` failed with `TS6133: 'bigInt' is declared but its value is never read.`
- **Fix:** Removed the unused `import bigInt from 'big-integer'` line from `contactService.test.ts`. No test behavior changed — all 6 tests still construct resolver fixtures with native `BigInt(...)`.
- **Files modified:** `src/main/telegram/contactService.test.ts`
- **Verification:** `npx tsc --build` exits 0; `npx vitest run src/main/telegram/contactService.test.ts` — 6/6 pass.
- **Committed in:** `0e7e5c5` (Task 2 commit, alongside the new `contactService.ts`)

---

**Total deviations:** 1 auto-fixed (1 blocking/lint)
**Impact on plan:** Purely a dead-import removal in the test file this same plan owns; no scope creep, no behavior change.

## Issues Encountered
None beyond the deviation above. `npx tsc --build` emitted stray `.js`/`.d.ts` files beside `contactService.ts`/`contactService.test.ts` on each build pass (expected per the project's `tsc --build` caveat) — deleted before each `vitest run` per CLAUDE.md's `tsc-noop-pitfall` note; confirmed via `find src -name "*.js" -o -name "*.d.ts"` returning only the two pre-existing hand-written declaration files (`src/main/env.d.ts`, `src/renderer/i18n/i18next.d.ts`) after cleanup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 14-10's `target:addContact` IPC handler can call `contactService.addIfMissing()` and forward its `{ ok, code? }` result directly to the renderer with no further wrapping, per this plan's `<success_criteria>`.
- `createContactService` is not wired into `src/main/index.ts` yet — that wiring (alongside `AddExecutor`/`addChannels.ts`) is explicitly scoped to Plan 14-10 per 14-PATTERNS.md's "main/index.ts (wiring extension)" section, not this plan.
- No blockers for downstream plans. The exact RPC error strings `contacts.AddContact` can return (beyond the `CONTACT_NAME_EMPTY` example exercised here) remain unconfirmed against the live API — tracked as a pre-existing STATE.md open item for Phase 14's broader RPC-error-mapping work, not introduced by this plan.

## Self-Check: PASSED

- FOUND: src/main/telegram/contactService.ts
- FOUND: src/main/telegram/contactService.test.ts
- FOUND: f0e569c (Task 1 commit)
- FOUND: 0e7e5c5 (Task 2 commit)

---
*Phase: 14-addexecutor-dispatch-privacy-fallback-audit*
*Completed: 2026-10-03*
