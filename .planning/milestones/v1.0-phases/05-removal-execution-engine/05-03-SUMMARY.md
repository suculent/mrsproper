---
phase: 05-removal-execution-engine
plan: "03"
subsystem: storage
tags: [audit-store, job-durability, atomic-write, zod-validation, tdd]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [auditStore.ts]
  affects: [RemovalExecutor.ts, src/main/index.ts]
tech_stack:
  added: []
  patterns:
    - Injectable-deps factory (secrets.ts pattern extended to AuditStore)
    - Atomic write via write-to-temp + renameSync (crash-safe job file)
    - Zod schema validation on disk read (T-05-03-A threat mitigation)
    - In-memory fake fs injected in tests (no disk/Electron dependency)
key_files:
  created:
    - src/main/storage/auditStore.ts
  modified:
    - src/main/storage/auditStore.test.ts
decisions:
  - "AuditStore keeps an in-memory copy of the current job to avoid redundant disk reads on each checkpoint — mutate in memory, write atomically"
  - "getRemaining() uses Set subtraction on outcomes.dialogId — preserves checklist order from dialogIds array"
  - "revokeHistory is intentionally absent from RemovalJobFile by construction (T-05-SC-1 invariant)"
  - "tmpPath() uses the same userData resolution path as jobPath() to ensure rename is always within the same filesystem"
metrics:
  duration: 2
  completed_date: "2026-06-12"
  tasks_completed: 1
  files_changed: 2
---

# Phase 5 Plan 03: AuditStore Summary

**One-liner:** Injectable-deps AuditStore with atomic write-rename, Zod job-file validation, crash-safe checkpoint after every group outcome — auditStore.test.ts 7/7 GREEN.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Implement AuditStore with injectable deps — GREEN auditStore.test.ts | 4b1686a | src/main/storage/auditStore.ts (created), src/main/storage/auditStore.test.ts (converted) |

**RED commit:** 2afee41 — `test(05-03): add failing tests for AuditStore job durability`
**GREEN commit:** 4b1686a — `feat(05-03): implement AuditStore with injectable deps — GREEN auditStore.test.ts`

## TDD Gate Compliance

- RED gate: `test(05-03)` commit 2afee41 — 7 test bodies written, all failing (cannot find module)
- GREEN gate: `feat(05-03)` commit 4b1686a — all 7 tests pass, `npx tsc --noEmit` exits 0
- REFACTOR: no structural changes needed; implementation clean on first pass

## What Was Built

`src/main/storage/auditStore.ts` — the durable job-file persistence layer for Phase 5 RemovalExecutor.

**AuditStore public surface (all exported):**

| Method | Behavior |
|--------|----------|
| `initJob(job)` | Writes initial RemovalJobFile atomically (tmp→rename, mode 0o600) |
| `checkpoint(dialogId, outcome)` | Appends outcome to in-memory job, atomically re-writes to disk |
| `setStatus(status, completedAt?)` | Updates status field, atomically re-writes |
| `readJob()` | Reads and Zod-validates job file; returns null on missing/malformed/invalid |
| `clearJob()` | Deletes job file, clears in-memory state |
| `getRemaining()` | Returns dialogIds not yet covered by outcomes (preserves checklist order) |

**Injectable deps:**
- `AuditStoreDeps.fs` — fake/real fs for write/rename/read/exists/unlink
- `AuditStoreDeps.app` — fake/real Electron `app.getPath('userData')`
- `AuditStoreDeps.jobFileName` — override (default `'removal-job.json'`)

**Threat mitigations implemented:**
- T-05-03-A: `RemovalJobFileSchema` (Zod) validates every disk read in `readJob()` — returns null on any parse/schema error, preventing injected/corrupted job data from reaching the executor
- T-05-03-B: `revokeHistory` absent by construction — not in `RemovalJobFile`, not in `AuditStore` interface
- Atomic write (tmp→rename) with mode `0o600` — crash-safe; only file owner can read

## Test Coverage (7/7 GREEN)

| Test | Behavior Verified |
|------|-------------------|
| writeJob: atomic write | tmp file renamed to final path; content round-trips |
| checkpoint: appends outcome | Two sequential checkpoints produce outcomes array of length 2 |
| readJob: null when absent | No file → null |
| readJob: null on malformed JSON | Garbage content → null |
| readJob: Zod rejects invalid shape | Missing `severity` field → null |
| incomplete job detection | status='running' returned intact |
| getRemaining() | 2/3 done → remaining is ['333'] in order |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — AuditStore is fully implemented. All methods are wired and tested.

## Threat Flags

No new security surface introduced beyond what the plan's `<threat_model>` specifies. All threats mitigated as planned.

## Self-Check: PASSED
