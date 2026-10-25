---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 05
subsystem: ui
tags: [renderer, store, ipc-bridge, add-mode, contacts]

# Dependency graph
requires:
  - phase: 14-addexecutor-dispatch-privacy-fallback-audit
    provides: shipped target:addContact main-process handler + window.mrsproper.addTargetToContacts() preload bridge implementation (runtime-only, no renderer TS type yet)
provides:
  - src/renderer/ipc/targetClient.ts's addTargetToContacts() typed bridge wrapper
  - src/renderer/store/targetStore.ts's addToContactsChecked/contactAddAttempted/contactAddFailed state + toggleAddToContacts/maybeAddToContacts actions
affects: ["15-10 (ReviewScreen run-confirm-time maybeAddToContacts call)", "15-11 (TargetCard checkbox + notice, toggleAddToContacts/maybeAddToContacts at confirm-time)"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["idempotent store dispatcher: set the 'attempted' flag synchronously before the await so a second concurrent call sees it already set, guaranteeing at-most-once execution of a non-blocking side effect"]

key-files:
  created:
    - src/renderer/store/targetStore.test.ts
  modified:
    - src/renderer/ipc/targetClient.ts
    - src/renderer/store/targetStore.ts

key-decisions:
  - "maybeAddToContacts wraps targetClient.addTargetToContacts() in both a .catch(() => ({ ok: false })) on the promise AND an outer try/catch, so neither a rejected promise nor a synchronous throw from the client can ever propagate to the caller (D-10's non-blocking guarantee)"
  - "targetStore.test.ts reuses the react-mock + vi.resetModules()-per-test pattern established in 15-03's groupsStore.test.ts, since targetStore is a node-environment module-level singleton store with no jsdom available"

requirements-completed: [ADD-05]

# Metrics
duration: 6min
completed: 2026-10-04
---

# Phase 15 Plan 05: Add-to-Contacts Store Dispatch Summary

**Idempotent targetStore.maybeAddToContacts() action plus the missing addTargetToContacts() bridge type, giving Plan 15-10/15-11 a single shared, non-blocking, at-most-once contact-add dispatcher callable from either trigger point in D-09.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-04T00:51:00Z
- **Completed:** 2026-10-04T00:56:48Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `targetClient.addTargetToContacts()` is now typed and callable — the runtime bridge shipped in Phase 14 had no renderer-side TypeScript declaration anywhere until this plan.
- `targetStore` gained the three D-08/D-09/D-10 state fields and two actions (`toggleAddToContacts`, `maybeAddToContacts`) that both Plan 15-10 (ReviewScreen run-confirm) and Plan 15-11 (TargetCard confirm-time) will call — whichever fires first is guaranteed to be the only one that actually dispatches the underlying bridge call.
- `resetTarget()` now also clears all three new fields, so a new target session always starts fresh.

## Task Commits

Each task was committed atomically:

1. **Task 1: addTargetToContacts bridge method** - `13906a9` (feat)
2. **Task 2: targetStore — addToContactsChecked/contactAddAttempted/contactAddFailed + maybeAddToContacts** - `948fd6e` (feat)

_No TDD RED/GREEN split commits — both tasks are `type="auto" tdd="true"` executed as implementation-plus-tests-together, consistent with Plan 15-03's precedent for pure-helper/store tasks in this phase._

## Files Created/Modified
- `src/renderer/ipc/targetClient.ts` - Added `addTargetToContacts(): Promise<{ ok: boolean; code?: string }>` to the `MrsProperApi` declare-global augmentation and the exported `targetClient` wrapper object
- `src/renderer/store/targetStore.ts` - Added `addToContactsChecked`/`contactAddAttempted`/`contactAddFailed` to `TargetStoreState` + initial state; added `toggleAddToContacts(checked)` and `async maybeAddToContacts()` to `targetActions`; `resetTarget()` now resets all three new fields
- `src/renderer/store/targetStore.test.ts` (new) - 9 tests covering initial state, toggle behavior, the at-most-once dispatch guarantee, the `{ ok: false }` and rejection failure paths, and `resetTarget`'s field reset

## Decisions Made
- `maybeAddToContacts` sets `contactAddAttempted: true` synchronously before awaiting the bridge call (per the plan's explicit instruction) so a second call made before the first resolves still sees the flag already set and returns early — this is the concrete mechanism behind the "at most once per target" guarantee (D-09, threat T-15-06).
- Double-guarded error handling: `.catch(() => ({ ok: false }))` on the promise itself plus an outer try/catch around the await, so there is no code path through which `maybeAddToContacts()` can reject — satisfying D-10's "never blocks the flow" requirement even against a client that throws synchronously rather than returning a rejected promise.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' behavior bullets, acceptance-criteria greps, and verification commands pass as specified. (The `addTargetToContacts` grep returned 3 rather than the plan's stated 2, because the implementation's method signature and its `window.mrsproper.addTargetToContacts()` call body are on separate lines, each containing the identifier — behavior is identical to what the plan specified; not treated as a deviation requiring a fix.)

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `targetActions.maybeAddToContacts()` and `toggleAddToContacts()` are ready for Plan 15-11's `TargetCard.tsx` checkbox + inline failure notice (confirm-time trigger) and Plan 15-10's `ReviewScreen.tsx` run-confirm dispatch (the second possible D-09 trigger point) without either needing to re-derive the idempotency guard.
- Full suite verified green: 43 files / 568 tests (baseline stated in the plan was 42 files / 559 tests — matches exactly). This plan adds 1 new test file (`targetStore.test.ts`, +9 tests), zero regressions.
- No blockers for downstream Phase 15 plans.

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*

## Self-Check: PASSED

All created/modified files verified present on disk (`src/renderer/ipc/targetClient.ts`,
`src/renderer/store/targetStore.ts`, `src/renderer/store/targetStore.test.ts`,
`15-05-SUMMARY.md`); all task commit hashes (13906a9, 948fd6e) and the SUMMARY commit
(aeea7f2) verified present in `git log`.
