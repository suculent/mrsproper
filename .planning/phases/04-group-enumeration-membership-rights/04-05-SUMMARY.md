---
phase: 04-group-enumeration-membership-rights
plan: "05"
subsystem: ipc-wiring
tags:
  - tdd
  - ipc
  - group-enumeration
  - membership-scan
  - security
  - preload
dependency_graph:
  requires:
    - "04-02-SUMMARY.md (channels.ts + groupTypes.ts)"
    - "04-03-SUMMARY.md (GroupEnumerator)"
    - "04-04-SUMMARY.md (MembershipScanner)"
  provides:
    - "src/main/ipc/groupChannels.ts (Zod-validated IPC handlers for group/scan operations)"
    - "src/preload/index.ts (bridge entries for all 8 group/scan channels)"
    - "src/main/index.ts (GroupEnumerator + MembershipScanner wired; eager enumeration; D-10 window)"
  affects:
    - "04-06-PLAN.md (UI — group list and scan progress screens consume the bridge)"
tech_stack:
  added: []
  patterns:
    - "Zod schema validation at IPC boundary (mirrors targetChannels.ts pattern)"
    - "Two-layer security gate: Zod bounds check + in-memory dialog list validation (T-04-06)"
    - "emitXxxState helper pattern gated on !win.isDestroyed() (T-04-08)"
    - "Closure-over-currentWin for push events (WR-03 re-activation safety)"
    - "Authorized state hook for eager enumeration (D-08)"
key_files:
  created:
    - src/main/ipc/groupChannels.ts
  modified:
    - src/main/ipc/groupChannels.test.ts
    - src/preload/index.ts
    - src/main/index.ts
decisions:
  - "enumerateAtLogin() called on 'authorized' state (not 'loggedIn' — AuthState uses 'authorized' step); D-08 eager enumeration after login"
  - "enumerator const declared after sm but callback only fires during sm.initialize() — runtime ordering is safe; TypeScript validates closure correctly"
  - "scan:retryGroup two-layer gate: Zod string(1..32) first, then enumerator.getState() loaded check, then dialog list lookup — T-04-06"
metrics:
  duration_minutes: 5
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_modified: 4
---

# Phase 4 Plan 5: groupChannels IPC Wiring — Zod-validated handlers, preload bridge, main wiring Summary

Zod-validated IPC handlers for all 8 group/scan channels implemented via RED→GREEN TDD; preload bridge extended with 8 group/scan entries; main/index.ts wired with GroupEnumerator+MembershipScanner sharing the account-wide governor; window dimensions updated to D-10; eager enumeration triggered on authorized state.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Convert it.todo stubs to 13 failing tests for groupChannels | ce4fd22 | src/main/ipc/groupChannels.test.ts |
| 2 (GREEN) | Implement groupChannels.ts, preload bridge, main/index.ts wiring | 8285d23 | src/main/ipc/groupChannels.ts, src/preload/index.ts, src/main/index.ts |

## What Was Built

**groupChannels.ts** (new file, ~120 lines):
- `RetryGroupSchema`: `z.object({ dialogId: z.string().min(1).max(32) })`
- `registerGroupChannels(win, enumerator, scanner)`: registers 6 ipcMain handlers
  - `groups:getState` → `enumerator.getState()`
  - `groups:refresh` → `enumerator.refresh()` then `enumerator.getState()`
  - `scan:start` → `scanner.scan()` then `scanner.getScanState()` (no payload, T-04-07)
  - `scan:abort` → `scanner.abortScan()` then `scanner.getScanState()`
  - `scan:getState` → `scanner.getScanState()`
  - `scan:retryGroup` → Zod parse + loaded check + dialog list lookup + `scanner.retryGroup()`
- `emitGroupsState(win, state)`: `!win.isDestroyed()` guard → `win.webContents.send(GROUPS_STATE, state)`
- `emitScanState(win, state)`: `!win.isDestroyed()` guard → `win.webContents.send(SCAN_STATE, state)`

**src/preload/index.ts** (augmented, +37 lines):
- 8 new bridge entries: `getGroupsState`, `refreshGroups`, `onGroupsState`, `startScan`, `abortScan`, `retryScanGroup`, `getScanState`, `onScanState`
- Imports: `GroupsState`, `ScanState` types; all 8 `GROUPS_*`/`SCAN_*` channel constants

**src/main/index.ts** (augmented):
- Window dimensions updated: `width: 1280, height: 800, minWidth: 1080, minHeight: 680` (D-10)
- `GroupEnumerator` and `MembershipScanner` imported and instantiated with shared `client` + `governor`
- `registerGroupChannels(currentWin, enumerator, scanner)` called after resolver wiring
- `onStateChange` in SessionManager extended: when `state.step === 'authorized'`, calls `void enumerator.enumerateAtLogin()` (D-08)

**groupChannels.test.ts** (expanded from 13 it.todo stubs to 13 real test cases):
- `groups:getState`, `groups:refresh` handler tests
- `scan:start`, `scan:abort`, `scan:getState` handler tests
- `scan:retryGroup`: valid payload, unknown dialogId rejection (T-04-06), Zod validation (missing/empty/over-32)
- `emitGroupsState`/`emitScanState` window guard tests

## Verification Results

```
npm test -- --reporter=verbose | grep groupChannels → 13 passing, 0 failing
npx tsc --noEmit → 0 errors
grep "isDestroyed" src/main/ipc/groupChannels.ts → present (window guard T-04-08)
grep "Unknown dialogId|Groups not loaded" src/main/ipc/groupChannels.ts → both security gates present
grep "getGroupsState|startScan|onScanState" src/preload/index.ts → all bridge entries present
grep "1280|1080" src/main/index.ts → window dimensions updated
grep "enumerateAtLogin|GroupEnumerator|MembershipScanner" src/main/index.ts → service wiring present

Full suite: 2 failed | 150 passed (152) — only pre-existing AUTH-03 failures remain
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Naming] Plan used 'loggedIn' — actual AuthState step is 'authorized'**
- **Found during:** Task 2 (GREEN) — plan context says "when the new state is 'loggedIn'" but AuthState discriminated union uses `step: 'authorized'`
- **Issue:** The plan description referenced 'loggedIn' which does not exist in AuthState; the actual login-complete state is 'authorized'
- **Fix:** Used `state.step === 'authorized'` in the onStateChange callback (correct per authTypes.ts)
- **Files modified:** src/main/index.ts
- **Commit:** 8285d23

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test) | ce4fd22 | PASSED — import failed with "Cannot find module './groupChannels'" for all 13 tests |
| GREEN (feat) | 8285d23 | PASSED — all 13 tests pass after implementation |
| REFACTOR | — | Not needed — code is clean from initial write |

## Known Stubs

None. All handlers are fully implemented and wired to real services.

## Threat Flags

None. All three threat model items confirmed implemented:
- T-04-06: scan:retryGroup two-layer gate present (Zod + in-memory list check)
- T-04-07: scan:start handler accepts no payload (void `win` param, scanner reads from resolver)
- T-04-08: emitGroupsState and emitScanState both gated on `!win.isDestroyed()`

## Self-Check: PASSED

Files created:
- FOUND: src/main/ipc/groupChannels.ts

Files modified:
- FOUND: src/main/ipc/groupChannels.test.ts
- FOUND: src/preload/index.ts
- FOUND: src/main/index.ts

Commits verified:
- FOUND: ce4fd22 (Task 1 — RED tests)
- FOUND: 8285d23 (Task 2 — GREEN implementation)
