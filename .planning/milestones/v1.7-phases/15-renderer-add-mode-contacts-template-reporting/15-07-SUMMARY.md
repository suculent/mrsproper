---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 07
subsystem: ui
tags: [react, useSyncExternalStore, electron, ipc, vitest]

# Dependency graph
requires:
  - phase: 14-addexecutor-dispatch-privacy-fallback-audit
    provides: "AddState/AddJobFileSafe shapes, the shipped Add IPC bridge (startAdd/abortAdd/retryAddGroup/getAddState/onAddState/getAddJob/discardAddJob) on window.mrsproper"
  - phase: 15-renderer-add-mode-contacts-template-reporting (plan 06)
    provides: "preload exportAddLog bridge method, deferred typed wrapper to this plan"
provides:
  - "src/renderer/ipc/addClient.ts — typed 1:1 forwarding wrapper for every Add bridge method"
  - "src/renderer/store/addStore.ts — useAddStore() hook + addActions (startAdd/abortAdd/retryGroup/discardJob/resumeJobFromDisk)"
affects: [15-08, 15-09, 15-10, 15-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useSyncExternalStore module-singleton store with ref-counted subscription lifecycle and a mandatory cachedSnapshot guard, cloned verbatim from tagStore.ts with Add types substituted"
    - "retryGroup borrowed from removalStore.ts's shape, added to a Tag-shaped store (Add is the first store to combine both precedents)"

key-files:
  created:
    - src/renderer/ipc/addClient.ts
    - src/renderer/store/addStore.ts
    - src/renderer/store/addStore.test.ts
  modified: []

key-decisions:
  - "addActions.startAdd(dialogIds) takes a single argument with no order flip, unlike tagActions.startTag(tag, dialogIds) — enforced by a dedicated single-argument-call-shape test (T-15-07)"
  - "addStore.test.ts mocks react's useSyncExternalStore to a plain synchronous subscribe+getSnapshot call (groupsStore.test.ts's pattern) rather than tagStore.test.ts's indirect-assertion style, enabling direct snapshot-identity assertions for the cachedSnapshot guard"
  - "Removed all literal occurrences of the word 'severity' from addStore.ts comments (even descriptive ones) to satisfy the plan's zero-tolerance grep acceptance criterion"

requirements-completed: [ADD-13, ADD-14]

# Metrics
duration: 10min
completed: 2026-10-04
---

# Phase 15 Plan 07: Add IPC Client + Store Summary

**Typed `addClient.ts` IPC wrapper and a `useSyncExternalStore`-based `addStore.ts` mirror of `AddState`/`AddJobFileSafe`, cloning `tagStore.ts` and borrowing `removalStore.ts`'s `retryGroup`, with 17 new Vitest cases covering the cachedSnapshot guard, bootstrap, resume-from-disk and the single-argument `startAdd` contract.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 completed
- **Files modified:** 3 (all new)

## Accomplishments
- `addClient.ts` typed `MrsProperApi` augmentation and forwarder for all 8 Add bridge methods, including `exportAddLog` (deferred from Plan 15-06)
- `addStore.ts` module-singleton store cloning `tagStore.ts`'s shape (mandatory `cachedSnapshot` guard, ref-counted subscription startup/teardown, pendingJob bootstrap for the resume prompt) with `Add` types substituted throughout
- `addActions.retryGroup(dialogId)` borrowed from `removalStore.ts` for per-group retry (ADD-13/D-17) — Tag has no equivalent
- 17 new Vitest cases in `addStore.test.ts` verifying snapshot-identity stability, the single-argument `startAdd` call shape (no order flip, T-15-07), `retryGroup`'s catch-never-throws contract, `resumeJobFromDisk`'s remaining-dialogIds computation, and bootstrap pendingJob detection

## Task Commits

Each task was committed atomically:

1. **Task 1: addClient.ts** - `7638b90` (feat)
2. **Task 2: addStore.ts — useAddStore + addActions** - `2babb3d` (feat)

**Plan metadata:** pending (docs: complete plan — this commit)

## Files Created/Modified
- `src/renderer/ipc/addClient.ts` - Typed `MrsProperApi` augmentation + plain-object forwarder for startAdd/abortAdd/retryAddGroup/getAddState/onAddState/getAddJob/discardAddJob/exportAddLog
- `src/renderer/store/addStore.ts` - `useAddStore()` hook + `addActions` (startAdd/abortAdd/retryGroup/discardJob/resumeJobFromDisk), cloned from `tagStore.ts` with the cachedSnapshot guard intact and `retryGroup` borrowed from `removalStore.ts`
- `src/renderer/store/addStore.test.ts` - 17 Vitest cases covering every behavior bullet in the plan's `<behavior>` block

## Decisions Made
- `addActions.startAdd(dialogIds: string[])` is single-argument with no order flip — asserted directly by a test checking `mock.calls[0]` has exactly one element (T-15-07, D-17)
- Used the `groupsStore.test.ts` mocked-`react` idiom (`useSyncExternalStore` reduced to `subscribe(() => {}); return getSnapshot()`) instead of `tagStore.test.ts`'s indirect-only assertions, since the plan's first behavior bullet explicitly requires verifying snapshot identity stability — this needed a way to call the hook directly in a `node` test environment
- Scrubbed every comment-level mention of "severity" (not just code) since the plan's acceptance criterion greps the literal string with zero tolerance

## Deviations from Plan

None - plan executed exactly as written. One self-correction during execution: initial comment drafts in `addStore.ts` used the word "severity" descriptively (e.g., "No severity concept") which satisfied the human-readable intent but violated the literal `grep -c severity → 0` acceptance criterion; reworded to "classification-like" before committing. No behavior change, caught before the task commit.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `useAddStore()` and `addActions`/`addClient.exportAddLog()` are ready for Wave 4 (Plans 15-08/15-09/15-10/15-12) to subscribe to and call directly
- Full verification: `npx tsc --build` exits 0; `npx vitest run` — 44 files / 585 tests green (baseline 43/568 + 1 file/17 tests)

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: src/renderer/ipc/addClient.ts
- FOUND: src/renderer/store/addStore.ts
- FOUND: src/renderer/store/addStore.test.ts
- FOUND: 7638b90 (Task 1 commit)
- FOUND: 2babb3d (Task 2 commit)
