---
phase: 05-removal-execution-engine
plan: "05"
subsystem: ipc-removal-engine
tags: [ipc, security-gates, zod-validation, removal, preload-bridge, target-reset]
dependency_graph:
  requires: [05-03, 05-04]
  provides: [removal-ipc-surface, preload-removal-bridge, target-reset-cr01]
  affects: [renderer-removal-store, GroupsPane-run-trigger]
tech_stack:
  added: []
  patterns: [zod-ipc-validation, three-layer-security-gate, fire-and-forget-ipc, job-file-read-on-launch, cr01-ordering]
key_files:
  created:
    - src/main/ipc/removalChannels.ts
    - src/renderer/ipc/removalClient.ts
  modified:
    - src/main/ipc/removalChannels.test.ts
    - src/main/index.ts
    - src/main/ipc/targetChannels.ts
    - src/preload/index.ts
decisions:
  - "registerRemovalChannels accepts getAuthState as a callback (not SessionManager directly) — enables isolated unit testing without importing SM"
  - "executor parameter in registerTargetChannels is optional to maintain backwards compatibility with existing callers"
  - "On-launch job detection reads auditStore before sm.initialize() and logs but does not auto-resume — renderer drives Resume/Discard dialog"
metrics:
  duration: 25
  completed_date: "2026-06-12"
  tasks: 2
  files: 6
---

# Phase 5 Plan 05: Removal IPC Channels, TARGET_RESET CR-01, Preload Bridge Summary

**One-liner:** Zod-validated removal IPC surface (3-layer security gate) wired to RemovalExecutor, TARGET_RESET extended with CR-01 executor abort, and 7 removal bridge methods exposed via contextBridge.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | removalChannels.ts + GREEN tests (TDD) | 5639c98 | src/main/ipc/removalChannels.ts, src/main/ipc/removalChannels.test.ts |
| 2 | Wire RemovalExecutor in main/index.ts; extend TARGET_RESET; preload bridge | fbac493 | src/main/index.ts, src/main/ipc/targetChannels.ts, src/preload/index.ts, src/renderer/ipc/removalClient.ts |

## What Was Built

### Task 1: removalChannels.ts

`registerRemovalChannels(win, executor, enumerator, auditStore, getAuthState)` registers 6 IPC handlers:

- **REMOVAL_START** — Three-layer security gate:
  1. Zod `RemovalStartSchema`: `severity: z.enum(['kick','ban'])` + `dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500)`
  2. Auth gate: `getAuthState().step !== 'authorized'` → returns `executor.getState()` without dispatching
  3. Dialog-map gate: each dialogId validated against `enumerator.getState().dialogs` — unknown IDs throw before `executor.execute()`
  - Fire-and-forget dispatch: `executor.execute({ severity, dialogIds }).catch(() => {})`

- **REMOVAL_ABORT** — `executor.abortExecution()` + returns state
- **REMOVAL_RETRY_GROUP** — Two-layer gate (Zod + job-dialogId validation via `auditStore.readJob()?.dialogIds.includes()`)
- **REMOVAL_GET_STATE** — Returns `executor.getState()`
- **REMOVAL_GET_JOB** — Returns `auditStore.readJob()` (null if no job)
- **REMOVAL_DISCARD_JOB** — `auditStore.clearJob()` + returns null

`emitRemovalState(win, state)` — `win.isDestroyed()` push guard (T-04-08 pattern).

All 10 tests GREEN (4 Zod validation + 4 security gates + 2 push-guard).

### Task 2: main/index.ts wiring

- Added imports for `RemovalExecutor`, `createAuditStore`, `registerRemovalChannels`, `emitRemovalState`
- Constructed `auditStore = createAuditStore()` and `executor = new RemovalExecutor({ client, governor, enumerator, resolver, auditStore, onStateChange: emitRemovalState })`
- Reads job file before `sm.initialize()` — detects incomplete jobs on launch, logs for diagnostics
- Calls `registerRemovalChannels(currentWin, executor, enumerator, auditStore, () => sm.getAuthState())`
- Updated `registerTargetChannels` call to pass `executor` as 5th argument

### Task 2: targetChannels.ts TARGET_RESET CR-01

Extended `registerTargetChannels` signature with optional `executor?: { abortExecution(): void }`.

TARGET_RESET handler now calls abort in this order:
1. `executor?.abortExecution()` — CR-01: abort running removal first (checkpoint-safe stop)
2. `searcher.abortSearch()` — clears stale name-search candidates
3. `scanner.abortScan()` — scan → idle
4. `resolver.reset()` — target state → idle

### Task 2: preload/index.ts removal bridge

Added 7 methods to `contextBridge.exposeInMainWorld('mrsproper', {...})`:
- `startRemoval(severity, dialogIds)` → `REMOVAL_START`
- `abortRemoval()` → `REMOVAL_ABORT`
- `retryRemovalGroup(dialogId)` → `REMOVAL_RETRY_GROUP`
- `getRemovalState()` → `REMOVAL_GET_STATE`
- `onRemovalState(cb)` → `REMOVAL_STATE` listener with removeListener return
- `getRemovalJob()` → `REMOVAL_GET_JOB`
- `discardRemovalJob()` → `REMOVAL_DISCARD_JOB`

### Task 2: renderer/ipc/removalClient.ts

New file: `MrsProperApi` global augmentation with all 7 removal methods + `removalClient` helper object following the `searchClient.ts` pattern.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced beyond the IPC handlers specified in the plan and threat model. All T-05-05-* threat mitigations are implemented as specified.

## Known Stubs

None — all IPC handlers are fully wired. The on-launch job detection only logs to console and does not expose any stubs to the renderer.

## Self-Check: PASSED

Files verified:
- src/main/ipc/removalChannels.ts — EXISTS
- src/main/ipc/removalChannels.test.ts — EXISTS (10 tests GREEN)
- src/renderer/ipc/removalClient.ts — EXISTS
- src/main/index.ts — contains RemovalExecutor construction
- src/main/ipc/targetChannels.ts — contains executor?.abortExecution() before searcher.abortSearch()
- src/preload/index.ts — contains startRemoval

Commits verified:
- 5639c98: feat(05-05): implement removalChannels.ts with Zod validation and security gates
- fbac493: feat(05-05): wire RemovalExecutor in main/index.ts; extend TARGET_RESET; expose removal bridge
