---
phase: 05-removal-execution-engine
plan: "01"
subsystem: shared-types
tags: [types, ipc-channels, error-codes, removal-engine]
dependency_graph:
  requires: []
  provides:
    - src/shared/removalTypes.ts (RemovalState, RemovalGroupOutcome, RemovalJobFile, RemovalSummary, RemovalRunStep, RmvErrorCode)
    - src/shared/channels.ts (REMOVAL_START, REMOVAL_ABORT, REMOVAL_RETRY_GROUP, REMOVAL_GET_STATE, REMOVAL_STATE, REMOVAL_GET_JOB, REMOVAL_DISCARD_JOB)
    - src/shared/opTypes.ts (RMV_TARGET_IS_ADMIN, RMV_NO_RIGHTS, RMV_USER_INVALID, RMV_CHANNEL_PRIVATE in OperationErrorCode)
  affects:
    - src/main/telegram/RemovalExecutor.ts (Wave 2 — imports RemovalState, RemovalGroupOutcome)
    - src/main/storage/auditStore.ts (Wave 2 — imports RemovalJobFile)
    - src/main/ipc/removalChannels.ts (Wave 3 — imports REMOVAL_* constants, RemovalState)
    - src/renderer/store/removalStore.ts (Wave 4 — imports RemovalState, RemovalJobFile)
    - src/renderer/ipc/removalClient.ts (Wave 4 — imports RemovalState, RemovalJobFile)
    - src/preload/index.ts (Wave 4 — imports REMOVAL_* constants)
tech_stack:
  added: []
  patterns:
    - Pure TypeScript shared module (no Electron, no GramJS imports)
    - Discriminated union step type (RemovalRunStep) for state machine discriminator
    - Security boundary enforced by type separation: RemovalState (renderer-safe) vs RemovalJobFile (main-only, carries targetAccessHash)
    - T-03-02 pattern: RMV_* codes all have disposition 'fail' (non-retryable, continue job)
key_files:
  created:
    - src/shared/removalTypes.ts
  modified:
    - src/shared/channels.ts
    - src/shared/opTypes.ts
decisions:
  - "RemovalState carries targetId/targetName for display but NOT targetAccessHash — security boundary T-05-01-A, mirrors T-03-01 (ResolvedTargetDTO) and T-04.1-01 (CandidateDTO) precedents"
  - "RemovalJobFile.schemaVersion is typed as literal 1 (not number) — TypeScript enforces migration awareness if schema changes"
  - "RmvErrorCode includes NETWORK and UNKNOWN in addition to the 4 RMV_* telegram-specific codes — executor _classifyRemovalError() can return these for network failures"
  - "Phase 6 comment in opTypes.ts preserved verbatim — new Phase 5 block inserted BEFORE it, consistent with prior phase additions"
metrics:
  duration_minutes: 1
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 05 Plan 01: Shared Types for Removal Execution Engine — Summary

**One-liner:** Pure TypeScript shared module defining all removal DTOs, IPC channel constants, and RMV_* error codes consumed by every Phase 5 wave.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/shared/removalTypes.ts | c68d409 | src/shared/removalTypes.ts (created) |
| 2 | Augment channels.ts and opTypes.ts | 5f50bcd | src/shared/channels.ts, src/shared/opTypes.ts (modified) |

## What Was Built

**Task 1 — removalTypes.ts**

Created `src/shared/removalTypes.ts` with 6 exports following the `searchTypes.ts` comment style and structure:

- `RmvErrorCode` — union of 6 per-group failure codes (`RMV_TARGET_IS_ADMIN`, `RMV_NO_RIGHTS`, `RMV_USER_INVALID`, `RMV_CHANNEL_PRIVATE`, `NETWORK`, `UNKNOWN`). JSDoc documents T-03-02 disposition.
- `RemovalRunStep` — union of 7 step values (`idle`, `confirming`, `running`, `stopping`, `stopped`, `complete`, `hard-stopped`). JSDoc distinguishes user-aborted vs PEER_FLOOD hard-stops.
- `RemovalGroupOutcome` — per-group result interface (dialogId, status, errorCode?, note?, timestamp).
- `RemovalSummary` — terminal summary counts interface (removed, alreadyGone, failed, skipped, completedAt).
- `RemovalState` — live state interface streamed from main to renderer. Intentionally omits `targetAccessHash` (security boundary T-05-01-A).
- `RemovalJobFile` — durable job file schema (schemaVersion literal 1, jobId nonce, targetAccessHash for resume, dialogIds, outcomes, status). JSDoc explains resume rationale.

**Task 2 — channels.ts and opTypes.ts**

Added to `src/shared/channels.ts`:
- 7 `REMOVAL_*` constants (`REMOVAL_START` through `REMOVAL_DISCARD_JOB`) with inline payload comments
- All 7 constants added to the `CHANNELS` namespace object

Added to `src/shared/opTypes.ts`:
- 4 `RMV_*` members to `OperationErrorCode` union, with Phase 5 block comment documenting T-03-02 disposition, `USER_NOT_PARTICIPANT`→`already-gone` mapping, and PEER_FLOOD existing coverage

## Verification

```
npx tsc --noEmit  → exit 0 (clean, no errors)
REMOVAL_* in channels.ts: 7 exports + 7 in CHANNELS namespace
RMV_* in opTypes.ts: 4 members in OperationErrorCode union
removalTypes.ts exports: RmvErrorCode, RemovalRunStep, RemovalGroupOutcome, RemovalSummary, RemovalState, RemovalJobFile
```

## Deviations from Plan

None — plan executed exactly as written. Types match the RESEARCH.md Store Shape and PATTERNS.md specifications verbatim.

## Known Stubs

None — this plan is pure type/constant definitions. No runtime stubs.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The `RemovalJobFile.targetAccessHash` field is documented in the plan's threat register (T-05-01-A accepted, boundary enforced by type separation).

## Self-Check: PASSED

- src/shared/removalTypes.ts exists: FOUND
- src/shared/channels.ts modified with REMOVAL_* constants: FOUND
- src/shared/opTypes.ts modified with RMV_* codes: FOUND
- Commit c68d409 exists: FOUND
- Commit 5f50bcd exists: FOUND
- npx tsc --noEmit: CLEAN
