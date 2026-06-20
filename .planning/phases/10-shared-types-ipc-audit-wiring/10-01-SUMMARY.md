---
phase: 10-shared-types-ipc-audit-wiring
plan: "01"
subsystem: shared-types-ipc
tags:
  - shared-types
  - ipc-channels
  - tag-execution
  - phase-10

dependency_graph:
  requires:
    - src/shared/removalTypes.ts
    - src/shared/channels.ts
  provides:
    - src/shared/tagTypes.ts
    - TAG_* IPC channel constants in src/shared/channels.ts
  affects:
    - src/main/ipc/tagChannels.ts (Wave 2 — imports TagState, TAG_*)
    - src/main/storage/tagAuditStore.ts (Wave 2 — imports TagJobFile, TagGroupOutcome)
    - src/renderer/ipc/tagClient.ts (Wave 2 — imports TagState, TagJobFile)
    - src/preload/index.ts (Wave 2 — imports TAG_* constants)

tech_stack:
  added: []
  patterns:
    - Pure TypeScript type module (no runtime logic, no imports)
    - IPC channel constant block following REMOVAL_* naming convention
    - CHANNELS namespace object extension

key_files:
  created:
    - src/shared/tagTypes.ts
  modified:
    - src/shared/channels.ts

decisions:
  - "TagGroupOutcome.status is 'done'|'skipped'|'failed' — no 'already-gone' (tag has no membership-gap concept)"
  - "TagState omits targetAccessHash (security boundary T-10-01 — renderer never receives access hash)"
  - "TagJobFile carries targetAccessHash on-disk only, with 0o600 protection comment"
  - "No TAG_RETRY_GROUP — tag executor does not support per-group retry in Phase 10/11 scope"
  - "TagErrorCode includes TAG_UNSUPPORTED_BASIC_GROUP as a skip code (not a failure)"
  - "PEER_FLOOD omitted from TagErrorCode — it is a run-level hard-stop, not a per-group code"

metrics:
  duration: "2 minutes"
  completed_date: "2026-06-20"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 10 Plan 01: Shared Tag Types and IPC Channel Constants Summary

**One-liner:** TagErrorCode/TagRunStep/TagGroupOutcome/TagSummary/TagState/TagJobFile pure types plus 6 TAG_* IPC channel constants wired into the CHANNELS namespace object.

## What Was Built

Two shared-layer files that all Wave 2 plans (tagAuditStore, tagChannels, tagClient, preload wiring) import from:

1. **`src/shared/tagTypes.ts`** — Pure type module with zero imports and zero runtime logic. Exports:
   - `TagErrorCode` — 7-member union covering admin-skip, basic-group-skip, rights, user/channel validity, network, and unknown
   - `TagRunStep` — identical 7-step union to `RemovalRunStep` (idle → confirming → running → stopping → stopped → complete → hard-stopped)
   - `TagGroupOutcome` — per-group result with `status: 'done' | 'skipped' | 'failed'` (no `already-gone`)
   - `TagSummary` — terminal count object (tagged / skipped / failed / completedAt)
   - `TagState` — live renderer-visible state with `tag: string` replacing `severity`, no `targetAccessHash` (T-10-01 security boundary)
   - `TagJobFile` — on-disk schema with `targetAccessHash` for resume, marked `0o600 protection, never sent to renderer`

2. **`src/shared/channels.ts`** — Extended with 6 TAG_* constants after the `REMOVAL_DISCARD_JOB` line, and all 6 added to the `CHANNELS` namespace object before `SEVERITY_GET`. No `TAG_RETRY_GROUP`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/shared/tagTypes.ts | ece0210 | src/shared/tagTypes.ts (created) |
| 2 | Add TAG_* constants to channels.ts | 8f98971 | src/shared/channels.ts (modified) |

## Verification Results

- `npx tsc --build` exits 0 with zero errors
- `grep -c "TAG_START" src/shared/channels.ts` returns 2 (export + CHANNELS object)
- `grep "already-gone" src/shared/tagTypes.ts` returns empty (no structural usage — only a clarifying comment)
- `grep -c "targetAccessHash" src/shared/tagTypes.ts` returns 3 (2 JSDoc comments + 1 field in TagJobFile only, not in TagState)
- All 6 TAG_* constants present in both the export block and the CHANNELS object
- Existing REMOVAL_* and SEVERITY_* constants unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — these are pure type declarations with no runtime behavior.

## Threat Flags

No new network endpoints, auth paths, or schema changes at trust boundaries beyond those already specified in the plan's threat model.

- T-10-01 mitigated: `TagState` has no `targetAccessHash` field — enforced by type structure
- T-10-02 mitigated: All 6 TAG_* constants present in CHANNELS object — verified by grep gate

## Self-Check: PASSED

- `src/shared/tagTypes.ts` exists: FOUND
- `src/shared/channels.ts` TAG_* additions: FOUND (grep confirmed)
- Commit ece0210 exists: FOUND
- Commit 8f98971 exists: FOUND
- `npx tsc --build` clean: PASSED
