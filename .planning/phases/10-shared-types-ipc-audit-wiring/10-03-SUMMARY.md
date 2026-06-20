---
phase: 10-shared-types-ipc-audit-wiring
plan: "03"
subsystem: ipc
tags: [tdd, ipc, security, identity-boundary, tag]
dependency_graph:
  requires: [10-01]
  provides: [tagChannels-ipc, tagClient-renderer]
  affects: [11-tag-executor]
tech_stack:
  added: []
  patterns: [4-layer-security-gate, zod-ipc-validation, identity-boundary-T-05-04-B, push-guard, tdd-red-green]
key_files:
  created:
    - src/main/ipc/tagChannels.ts
    - src/main/ipc/tagChannels.test.ts
    - src/renderer/ipc/tagClient.ts
  modified: []
decisions:
  - "TagStartSchema admits only { dialogIds, tag } — identity (targetId, targetName, targetAccessHash) never accepted from renderer (T-05-04-B)"
  - "TagExecutorLike interface includes execute() in Phase 10 stub; Phase 11 swaps in real TagExecutor"
  - "No TAG_RETRY_GROUP / retryTag — tag scope excludes per-group retry in Phase 10/11"
  - "Test mock.calls cast through unknown tuple to satisfy strict TypeScript; vitest passes 9/9"
metrics:
  duration: "~10 min"
  completed: "2026-06-20"
  tasks_completed: 2
  files_created: 3
---

# Phase 10 Plan 03: tagChannels IPC Handler + tagClient — IPC Trust Boundary Summary

**One-liner:** 4-layer security gate IPC handler (Zod + auth + double-start + dialog-map) with T-05-04-B identity boundary enforced and 9 passing TDD tests.

## What Was Built

**`src/main/ipc/tagChannels.ts`** — Main-process IPC handler module for tag operations:
- `registerTagChannels()`: registers ipcMain handlers for TAG_START, TAG_ABORT, TAG_GET_STATE, TAG_GET_JOB, TAG_DISCARD_JOB
- TAG_START implements all 4 security gate layers in order: Zod parse → auth gate → double-start guard → dialog-map gate → fire-and-forget execute
- `TagStartSchema`: `z.object({ dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500), tag: z.string().min(1).max(255) })` — no identity fields
- `TagExecutorLike` interface: `{ getState(): TagState; abortExecution(): void; execute(args: { dialogIds: string[]; tag: string }): Promise<void> }` — Phase 11 replaces stub with real TagExecutor
- `emitTagState(win, state)`: push helper with `win.isDestroyed()` guard (T-10-10)
- `void win` suppression at first line of `registerTagChannels` body (per PATTERNS.md)

**`src/main/ipc/tagChannels.test.ts`** — 9 TDD tests:
- Zod tests: missing dialogIds, empty tag string, empty dialogIds array
- Auth gate: returns idle state when `step !== 'authorized'`, execute not called
- Double-start guard: running state returns without re-dispatching
- Dialog-map gate: throws Error on unknown dialogId not in enumerator
- Identity boundary (T-05-04-B): execute() called with `{ dialogIds, tag }` only — no targetId/targetName/targetAccessHash in arg
- emitTagState: sends to live window; skips destroyed window

**`src/renderer/ipc/tagClient.ts`** — Typed renderer IPC wrapper:
- `MrsProperApi` augmentation: `startTag(dialogIds, tag)`, `abortTag()`, `getTagState()`, `onTagState(cb)`, `getTagJob()`, `discardTagJob()`
- `tagClient` object: 6 methods forwarding to `window.mrsproper.*`
- No `retryTag` / `retryTagGroup`

## Verification Results

```
npx vitest run src/main/ipc/tagChannels.test.ts → 9 tests pass, 0 fail
npx tsc --build → exits 0
grep targetId|targetName|targetAccessHash tagChannels.ts → comments only (schema and execute() clean)
grep "void win" tagChannels.ts → 1 hit in registerTagChannels body
grep "retryTag" tagChannels.ts tagClient.ts → 0 hits in code (1 hit in comment only)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict tuple typing for vi.fn().mock.calls**
- **Found during:** Task 2 (GREEN) — `npx tsc --build` after implementation
- **Issue:** `executor.execute.mock.calls[0][0] as Record<string, unknown>` produced TS2352 and TS2493 — vitest types `mock.calls` as an empty tuple `[]` in strict mode, so indexing `[0][0]` fails
- **Fix:** Cast via `(executor.execute.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0]`
- **Files modified:** `src/main/ipc/tagChannels.test.ts` line 250
- **Commit:** eb262fc (same feat commit)

## TDD Gate Compliance

| Gate | Commit | Message |
|------|--------|---------|
| RED  | 145e8cb | `test(10-03): add failing tagChannels tests (RED)` |
| GREEN | eb262fc | `feat(10-03): implement tagChannels and tagClient — IPC trust boundary` |
| REFACTOR | — | No refactor needed |

Both RED and GREEN gate commits present. RED confirmed module-not-found failure before implementation.

## Known Stubs

- `TagExecutorLike` interface in `tagChannels.ts` is an intentional stub — Phase 11 replaces with real `TagExecutor`. The `execute()` method is wired; the stub implementation is `vi.fn(async () => {})` in tests and the real executor in production.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes beyond what is documented in the plan's threat model. All 5 threats (T-10-06 through T-10-10) are mitigated by the implementation.

## Self-Check: PASSED

Files exist:
- FOUND: src/main/ipc/tagChannels.ts
- FOUND: src/main/ipc/tagChannels.test.ts
- FOUND: src/renderer/ipc/tagClient.ts

Commits exist:
- FOUND: 145e8cb (RED test commit)
- FOUND: eb262fc (GREEN implementation commit)
