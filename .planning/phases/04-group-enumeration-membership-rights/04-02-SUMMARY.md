---
phase: 04-group-enumeration-membership-rights
plan: "02"
subsystem: shared-types
tags:
  - types
  - ipc
  - group-enumeration
  - membership-scan
  - security
dependency_graph:
  requires:
    - "04-01-SUMMARY.md"
  provides:
    - "src/shared/groupTypes.ts (all Phase 4 shared types)"
    - "src/shared/channels.ts (GROUP_*/SCAN_* IPC channel constants)"
  affects:
    - "04-03-PLAN.md (GroupEnumerator implementation — imports groupTypes.ts)"
    - "04-04-PLAN.md (MembershipScanner implementation — imports groupTypes.ts)"
    - "04-05-PLAN.md (groupChannels IPC — imports channels.ts + groupTypes.ts)"
tech_stack:
  added: []
  patterns:
    - "Discriminated union state machine pattern (mirrors TargetState in targetTypes.ts)"
    - "String literal union for typed error codes (mirrors TargetErrorCode)"
    - "as const IPC channel constants in CHANNELS namespace object"
key_files:
  created:
    - src/shared/groupTypes.ts
  modified:
    - src/shared/channels.ts
decisions:
  - "AdminDialogDTO has no accessHash field by construction (T-04-01) — TypeScript prevents accidental addition; mirrors T-03-01 for target resolution"
  - "GroupErrorCode uses FLOOD_WAIT/NETWORK/UNKNOWN to mirror governor error taxonomy for consistent handling"
  - "ScanProgressDTO defined as a named type alias (not inline) to enable reuse in ScanState.scanning branch"
metrics:
  duration_minutes: 2
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_modified: 2
---

# Phase 4 Plan 2: Shared Type Contracts and IPC Channel Constants Summary

All Phase 4 shared types (DTOs, state unions, error codes) defined in groupTypes.ts and 8 new IPC channel constants added to channels.ts, providing the interface-first foundation for Plans 03–09.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/shared/groupTypes.ts with all Phase 4 shared types | b4e903b | src/shared/groupTypes.ts |
| 2 | Augment src/shared/channels.ts with GROUP_* and SCAN_* constants | a67388d | src/shared/channels.ts |

## What Was Built

**groupTypes.ts** (new file, 100 lines):
- `GroupType` — string literal union: `'basic-group' | 'supergroup' | 'broadcast-channel'`
- `GreyReason` — string literal union: 5 cause-specific non-actionability codes
- `AdminDialogDTO` — renderer-safe group representation with no accessHash field (T-04-01)
- `MembershipStatus` — string literal union: `'pending' | 'member' | 'not-member' | 'failed'`
- `MembershipResultDTO` — per-group membership check result
- `ScanProgressDTO` — scan progress snapshot `{ checked: number; total: number }`
- `GroupErrorCode` — typed error union mirroring governor taxonomy
- `GroupsState` — discriminated union on 'step': idle | loading | loaded | error
- `ScanState` — discriminated union on 'step': idle | scanning | complete | error

**channels.ts** (augmented, +20 lines):
- 8 new IPC channel constants: `GROUPS_GET_STATE`, `GROUPS_STATE`, `GROUPS_REFRESH`, `SCAN_START`, `SCAN_ABORT`, `SCAN_RETRY_GROUP`, `SCAN_STATE`, `SCAN_GET_STATE`
- All 8 new constants added to the `CHANNELS` namespace object
- No existing lines modified — append-only

## Verification Results

```
grep -c "accessHash" src/shared/groupTypes.ts → 1 (comment only, not a field)
grep "GROUPS_GET_STATE|SCAN_START|SCAN_RETRY_GROUP" src/shared/channels.ts → all match
npx tsc --noEmit → 0 errors
npm test → 1 failed | 11 passed | 3 skipped (same pre-existing baseline as Plan 01)
  2 failed | 112 passed | 35 todo
```

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. This plan defines types and constants only — no data flows or UI rendering involved.

## Threat Flags

None. This plan defines shared types only. The key security invariant T-04-01 is enforced by construction: `AdminDialogDTO` has no `accessHash` field and TypeScript will reject any future attempt to add one without explicit type annotation.

## Self-Check: PASSED

Files created:
- FOUND: src/shared/groupTypes.ts

Files modified:
- FOUND: src/shared/channels.ts

Commits verified:
- FOUND: b4e903b (Task 1 — groupTypes.ts)
- FOUND: a67388d (Task 2 — channels.ts augmentation)
