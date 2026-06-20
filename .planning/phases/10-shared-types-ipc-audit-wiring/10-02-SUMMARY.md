---
phase: 10-shared-types-ipc-audit-wiring
plan: "02"
subsystem: storage
tags: [tdd, audit-store, tag-job, persistence, zod, injectable-deps]
dependency_graph:
  requires: [10-01]
  provides: [createTagAuditStore, TagAuditStore, TagAuditStoreDeps]
  affects: [src/main/storage/tagAuditStore.ts, src/main/storage/tagAuditStore.test.ts]
tech_stack:
  added: [zod (already present)]
  patterns: [injectable-deps, lazy-require, atomic-write-tmp-rename, zod-safeParse, tdd-red-green]
key_files:
  created:
    - src/main/storage/tagAuditStore.ts
    - src/main/storage/tagAuditStore.test.ts
decisions:
  - "TagGroupOutcomeSchema excludes 'already-gone' — no such concept in tag flow; skipped+errorCode distinguishes TAG_TARGET_IS_ADMIN from TAG_UNSUPPORTED_BASIC_GROUP"
  - "TagJobFileSchema uses tag: z.string() not severity: z.enum(['kick','ban'])"
  - "All node:fs and require('electron') calls are lazy inside method bodies — required for Vitest compatibility"
  - "writeAtomic uses { mode: 0o600 } on every write — owner-read-only protection (T-10-04)"
metrics:
  duration: "5min"
  completed: "2026-06-20"
  tasks: 2
  files: 2
---

# Phase 10 Plan 02: tagAuditStore — tag-job.json Persistence Summary

**One-liner:** `createTagAuditStore` factory with injectable deps, atomic 0o600 writes, Zod-validated `readJob`, and `getRemaining` for crash-safe tag run persistence.

## What Was Built

### Task 1 (RED): tagAuditStore.test.ts — 8 failing tests

`src/main/storage/tagAuditStore.test.ts` written before the implementation, mirroring `auditStore.test.ts` structurally with tag-specific deltas:

- `createFakeFs()` extended with `_lastWriteOpts` capture to verify `{ mode: 0o600 }` on every write
- `makeTagJob()` fixture uses `tag: 'TestTag'` instead of `severity: 'ban'`
- Path constants: `FINAL_PATH = /fake/userData/tag-job.json`, `TMP_PATH = /fake/userData/tag-job.json.tmp`
- 8 test cases: atomic write, checkpoint appends, readJob null cases (3), incomplete detection, getRemaining, 0o600 mode

All 8 tests failed RED as expected (module not found).

### Task 2 (GREEN): tagAuditStore.ts — Implementation

`src/main/storage/tagAuditStore.ts` created mirroring `auditStore.ts` with tag-specific substitutions:

**Exported interfaces:** `TagAuditStoreFsDeps`, `TagAuditStoreAppDeps`, `TagAuditStoreDeps`, `TagAuditStore`

**Zod schemas:**
- `TagGroupOutcomeSchema`: `status: z.enum(['done', 'skipped', 'failed'])` — no `'already-gone'`, no `note` field
- `TagJobFileSchema`: `tag: z.string()` replaces `severity: z.enum(['kick','ban'])`

**Factory:** `createTagAuditStore(deps: TagAuditStoreDeps = {}): TagAuditStore`
- `resolveFs()` and `resolveApp()` are lazy-require helpers (inside method bodies — no module-scope Electron imports)
- `writeAtomic()` calls `writeFileSync(tmp, ..., { mode: 0o600 })` then `renameSync(tmp, final)` — crash-safe
- `readJob()` uses `TagJobFileSchema.safeParse` — returns null on any failure (T-10-03)
- `getRemaining()` returns `dialogIds` not present in `outcomes.map(o => o.dialogId)`

## Verification

- `npx vitest run src/main/storage/tagAuditStore.test.ts` → 8/8 tests pass, 0 fail
- `npx tsc --build` → exits 0
- All `require('node:fs')` and `require('electron')` calls are inside function bodies (confirmed by grep)
- `writeAtomic` uses `{ mode: 0o600 }` (confirmed by grep)
- `TagJobFileSchema` uses `tag: z.string()` not `severity` (confirmed by grep)
- `TagGroupOutcomeSchema` status enum excludes `'already-gone'` (confirmed by grep)

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

- RED gate: `test(10-02): add failing tagAuditStore tests (RED)` — commit `452ae66`
- GREEN gate: `feat(10-02): implement tagAuditStore — tag-job.json persistence` — commit `de8b537`
- REFACTOR gate: not needed — implementation is clean

## Known Stubs

None. This is a pure storage layer — no UI rendering or placeholder data.

## Threat Flags

No new threat surface introduced beyond what is documented in the plan's threat model (T-10-03, T-10-04). Both mitigations implemented as specified.

## Self-Check: PASSED

- `src/main/storage/tagAuditStore.ts` exists
- `src/main/storage/tagAuditStore.test.ts` exists
- Commits `452ae66` and `de8b537` present in git log
