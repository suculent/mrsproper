---
phase: 10-shared-types-ipc-audit-wiring
plan: "04"
subsystem: ipc-wiring
tags: [ipc, preload, main, tag-execution, contextBridge]
dependency_graph:
  requires: [10-02, 10-03]
  provides: [main-index-tag-wiring, preload-tag-bridge]
  affects: [phase-11-tag-executor, phase-12-tag-ui]
tech_stack:
  added: []
  patterns: [contextBridge-extension, ipc-registration, launch-job-detection]
key_files:
  modified:
    - src/main/index.ts
    - src/preload/index.ts
decisions:
  - emitTagState not imported in Phase 10 (unused until Phase 11 wires TagExecutor.onStateChange)
  - Stub TagExecutorLike with execute:async()=>{} ensures registerTagChannels type-checks cleanly
metrics:
  duration: "~10min"
  completed_date: "2026-06-20"
  tasks: 2
  files: 2
---

# Phase 10 Plan 04: IPC Wiring and contextBridge Extension Summary

**One-liner:** Wired `createTagAuditStore()` + `registerTagChannels()` stub into `src/main/index.ts` and extended `src/preload/index.ts` contextBridge with 6 TAG_* entries (startTag, abortTag, getTagState, onTagState, getTagJob, discardTagJob).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire tagAuditStore + registerTagChannels + launch detection in src/main/index.ts | 36015fb | src/main/index.ts |
| 2 | Extend src/preload/index.ts contextBridge with TAG_* entries | fdb64df | src/preload/index.ts |

## What Was Built

### Task 1: src/main/index.ts
- Added `import { registerTagChannels } from './ipc/tagChannels'`
- Added `import { createTagAuditStore } from './storage/tagAuditStore'`
- Added `import type { TagState } from '../shared/tagTypes'`
- Instantiated `const tagAuditStore = createTagAuditStore()` after the existing `auditStore`
- Defined `IDLE_TAG_STATE: TagState` stub with step:'idle', tag:'', targetId:'', targetName:'', empty progress/outcomes
- Called `registerTagChannels(currentWin, { getState, abortExecution, execute: async()=>{} }, enumerator, tagAuditStore, () => sm.getState())` with 5 args
- Added `_pendingTagJob` launch-time detection block immediately after existing `_pendingJob` block

### Task 2: src/preload/index.ts
- Added `import type { TagState, TagJobFile } from '../shared/tagTypes'`
- Added `TAG_START, TAG_ABORT, TAG_GET_STATE, TAG_STATE, TAG_GET_JOB, TAG_DISCARD_JOB` to destructured channel imports
- Added 6 contextBridge entries after `discardRemovalJob`:
  - `startTag(dialogIds, tag)` → `ipcRenderer.invoke(TAG_START, { dialogIds, tag })`
  - `abortTag()` → `ipcRenderer.invoke(TAG_ABORT)`
  - `getTagState()` → `ipcRenderer.invoke(TAG_GET_STATE)`
  - `onTagState(cb)` → listener pattern with `ipcRenderer.on` + `removeListener` returning unsubscribe
  - `getTagJob()` → `ipcRenderer.invoke(TAG_GET_JOB)`
  - `discardTagJob()` → `ipcRenderer.invoke(TAG_DISCARD_JOB)`

## Verification Results

- `grep "registerTagChannels" src/main/index.ts` → 2 hits (import + call)
- `grep "createTagAuditStore" src/main/index.ts` → 2 hits (import + instantiation)
- `grep "_pendingTagJob" src/main/index.ts` → 2 hits (declaration + if-check)
- `grep -c "TAG_START|startTag|..." src/preload/index.ts` → 8 hits
- `onTagState` uses `ipcRenderer.on(TAG_STATE, h)` + `() => ipcRenderer.removeListener(TAG_STATE, h)`
- `npx tsc --build` → exits 0
- `npx vitest run` → 307 passed, 2 pre-existing failures in config.test.ts (API credential env vars not set in CI — unchanged from before this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed emitTagState from import**
- **Found during:** Task 1 verification (`npx tsc --build`)
- **Issue:** Plan specified `import { registerTagChannels, emitTagState }` but `emitTagState` is unused in Phase 10 (Phase 11 wires it via TagExecutor.onStateChange). TypeScript error TS6133: 'emitTagState' is declared but its value is never read.
- **Fix:** Changed import to `import { registerTagChannels } from './ipc/tagChannels'` — emitTagState is re-exported from tagChannels.ts and Phase 11 will import it when it wires TagExecutor.
- **Files modified:** src/main/index.ts
- **Commit:** 36015fb

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `{ getState: () => IDLE_TAG_STATE, abortExecution: () => {}, execute: async () => {} }` | src/main/index.ts:327 | Intentional Phase 10 stub — Phase 11 replaces with real TagExecutor |

Stub is intentional per plan: "Phase 11 replaces the stub with real TagExecutor and wires onStateChange → emitTagState."

## Phase 10 Substrate Complete

All four plans complete:
- 10-01: `src/shared/tagTypes.ts` + `src/shared/channels.ts` (TAG_* constants)
- 10-02: `src/main/storage/tagAuditStore.ts` (durable job persistence)
- 10-03: `src/main/ipc/tagChannels.ts` + `src/renderer/ipc/tagClient.ts` (IPC handlers + renderer client)
- 10-04: `src/main/index.ts` + `src/preload/index.ts` (integration wiring + contextBridge)

## Threat Flags

No new security-relevant surface beyond what the plan's threat model covers. All contextBridge entries are whitelisted named functions — no raw ipcRenderer access exposed to renderer (T-10-11 mitigated).

## Self-Check: PASSED

- [x] src/main/index.ts exists with registerTagChannels, createTagAuditStore, _pendingTagJob
- [x] src/preload/index.ts exists with startTag, onTagState + removeListener pattern
- [x] Commit 36015fb exists: `git log --oneline | grep 36015fb`
- [x] Commit fdb64df exists: `git log --oneline | grep fdb64df`
- [x] npx tsc --build exits 0
- [x] npx vitest run: 307 passed, 0 new failures
