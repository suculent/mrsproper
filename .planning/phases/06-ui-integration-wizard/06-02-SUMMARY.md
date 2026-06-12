---
phase: 06
plan: 02
subsystem: main-process-ipc
tags: [electron-store, severity, flood-wait, removal-executor, ipc, tdd]
dependency_graph:
  requires:
    - 05-07  # RemovalExecutor, governor, emitRemovalState
    - 02-02  # RateLimitGovernor + GovernorEvent
  provides:
    - SEVERITY_GET/SET IPC handlers backed by electron-store
    - _handleGovernorEvent + _runActive flood-tick plumbing in RemovalExecutor
    - governor.onEvent → executor._handleGovernorEvent wiring in main/index.ts
  affects:
    - 06-03  # renderer SeverityToggle can now call severity:get and severity:set
    - 06-04  # FloodCountdown can now receive floodWaitRemaining from RemovalState
tech_stack:
  added:
    - electron-store@11.0.2 (ESM-only, lazy dynamic import pattern)
  patterns:
    - Lazy singleton ESM import factory (getStore) for CJS/ESM bridge
    - Mutable forward-reference (executorRef) for governor → executor callback wiring
    - _runActive flag for scoped flood-event isolation across features (T-06-02-04)
key_files:
  created:
    - src/main/ipc/severityChannels.ts
  modified:
    - src/main/telegram/RemovalExecutor.ts
    - src/main/index.ts
    - src/main/telegram/removalExecutor.test.ts
    - package.json
    - package-lock.json
decisions:
  - electron-store dynamic import via lazy getStore() factory — ESM-only library requires await import(), singleton prevents multiple store instances
  - executorRef mutable forward-reference declared before governor construction — avoids reordering the setup sequence while resolving the forward reference
  - _runActive flag as the scoping mechanism for flood-tick forwarding — simpler than wrapping governor construction or adding a governor-level filter
metrics:
  duration_minutes: 20
  completed_date: "2026-06-12"
  tasks_completed: 3
  files_changed: 6
---

# Phase 6 Plan 02: Severity Channels + Flood Plumbing Summary

**One-liner:** electron-store severity preference IPC with Zod validation, and scoped flood-tick forwarding from RateLimitGovernor to RemovalExecutor via _runActive flag.

## What Was Built

### Task 1: Install electron-store + create severityChannels.ts

Installed `electron-store@11.0.2` (ESM-only) and created `src/main/ipc/severityChannels.ts`:

- `registerSeverityChannels()` registers `SEVERITY_GET` and `SEVERITY_SET` `ipcMain.handle()` handlers
- `SeveritySchema = z.object({ severity: z.enum(['kick', 'ban']) })` validates every `SEVERITY_SET` payload before the store is touched (T-06-02-01)
- `getStore()` is a lazy singleton factory using `await import('electron-store')` — the only valid load path for ESM-only packages in a Electron main process using tsc output
- Defaults: `{ severity: 'kick' }` on first launch via electron-store's `defaults` option
- No auth gate: severity is a non-secret preference toggle (T-06-02-02)

### Task 2 (TDD): Add _handleGovernorEvent + _runActive to RemovalExecutor

**RED:** Added 6 failing tests covering the flood-tick isolation and forwarding contract.

**GREEN:** Implemented in `src/main/telegram/RemovalExecutor.ts`:

- `private _runActive = false` — gates flood-event forwarding
- `_handleGovernorEvent(event: GovernorEvent): void` — public method; no-op when `_runActive` is false; emits `floodWaitRemaining: event.remaining` on `flood-tick`
- `execute()` sets `_runActive = true` immediately after `++this._generation`
- All terminal state emissions (`complete`, `stopped`, `hard-stopped`) now set `_runActive = false` and include `floodWaitRemaining: null`
- Pre-call running state emit includes `floodWaitRemaining: null` to reset countdown after each group resolves

All 21 tests pass (15 pre-existing + 6 new).

### Task 3: Wire main/index.ts

In `src/main/index.ts`:

- Import `registerSeverityChannels` from `./ipc/severityChannels`
- Declare `let executorRef: ... | null = null` before governor construction (forward reference)
- `governor.onEvent` callback now calls `executorRef?._handleGovernorEvent(event)` after the `OP_GOVERNOR_EVENT` renderer push
- After executor construction: `executorRef = executor`
- After `registerRemovalChannels(...)`: `registerSeverityChannels()`

## Verification Results

1. `npm ls electron-store` → `electron-store@11.0.2` ✓
2. `tsc --build --force` — no errors in modified files (pre-existing errors in test/mock files unrelated to this plan) ✓
3. `vitest run removalExecutor.test.ts` → 21/21 pass ✓
4. `grep "_handleGovernorEvent\|_runActive" RemovalExecutor.ts` → matches ✓
5. `grep "registerSeverityChannels\|executorRef" main/index.ts` → matches ✓
6. `grep "SeveritySchema" severityChannels.ts` → matches ✓

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functionality is fully wired and operational.

## Self-Check

- [x] `src/main/ipc/severityChannels.ts` — created ✓
- [x] `src/main/telegram/RemovalExecutor.ts` — `_handleGovernorEvent` method and `_runActive` field present ✓
- [x] `src/main/index.ts` — `executorRef` + `registerSeverityChannels()` wired ✓
- [x] All commits exist (f5d94a4, f020367, 9400c10, b9b7f9d)

## Self-Check: PASSED
