---
phase: 12-renderer-action-picker-tag-input-results
plan: "02"
subsystem: renderer-store
tags: [tdd, store, ipc, react, useSyncExternalStore]
dependency_graph:
  requires:
    - src/renderer/ipc/tagClient.ts
    - src/shared/tagTypes.ts
  provides:
    - src/renderer/store/tagStore.ts (useTagStore hook + tagActions singleton)
  affects:
    - src/renderer/shell/AppShell.tsx (will consume useTagStore)
    - src/renderer/groups/GroupsPane.tsx (will consume useTagStore + tagActions)
    - src/renderer/removal/TagResumeJobDialog.tsx (will consume tagActions)
tech_stack:
  added: []
  patterns:
    - useSyncExternalStore with ref-counted subscribe/stopSubscriptions
    - cachedSnapshot stability guard (prevents React infinite re-render loop)
    - module-level singleton state with Set<Listener> notification
key_files:
  created:
    - src/renderer/store/tagStore.ts
    - src/renderer/store/tagStore.test.ts
  modified: []
decisions:
  - "cachedSnapshot guard is mandatory — getSnapshot() must return same object reference when state unchanged (Pitfall 2)"
  - "tagActions.startTag(tag, dialogIds) flips arg order when calling tagClient.startTag(dialogIds, tag) — deliberately tested (T-12-04)"
  - "No retryGroup action on tagActions — tag has no per-group retry path (tagClient has no retryTagGroup)"
  - "TagJobFileSafe type used throughout renderer — targetAccessHash never crosses IPC boundary (T-12-03)"
metrics:
  duration: "3m"
  completed: "2026-06-20"
  tasks: 2
  files: 2
---

# Phase 12 Plan 02: tagStore TDD Summary

**One-liner:** tagStore singleton mirroring removalStore with cachedSnapshot stability guard, ref-counted subscription, and arg-order-flip for tagClient.startTag

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | tagStore.test.ts — failing RED tests | 676c7b9 | src/renderer/store/tagStore.test.ts |
| 2 | tagStore.ts — GREEN implementation | f06a0e8 | src/renderer/store/tagStore.ts, src/renderer/store/tagStore.test.ts |

## TDD Gate Compliance

RED gate: commit `676c7b9` — `test(12-02): add failing tagStore tests (RED)`
GREEN gate: commit `f06a0e8` — `feat(12-02): implement tagStore — singleton + useTagStore + tagActions`

Both gates present in git log. All 10 tests pass GREEN. `npx tsc --build` exits 0.

## Verification Results

- `npx vitest run src/renderer/store/tagStore.test.ts`: 10/10 passed
- `npx tsc --build`: exit 0, no errors
- `git diff HEAD -- src/renderer/store/removalStore.ts`: empty (removalStore.ts unchanged)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock factory hoisting — variable capture error**
- **Found during:** Task 2 (first GREEN test run)
- **Issue:** vi.mock is hoisted by Vitest to top of file before `const mockStartTag = vi.fn()` variable declarations; the factory tried to reference hoisted consts that weren't yet initialized, throwing `Cannot access 'mockOnTagState' before initialization`
- **Fix:** Moved all `vi.fn()` calls inside the vi.mock factory directly. Retrieved mock references after imports using `tagClient as { startTag: ReturnType<typeof vi.fn>, ... }` type cast. Updated all beforeEach and test assertion references to use `mockTagClient.*` accessor pattern
- **Files modified:** src/renderer/store/tagStore.test.ts
- **Commit:** f06a0e8 (included in GREEN commit)

## Known Stubs

None — tagStore delegates all state to tagClient IPC; no hardcoded stubs.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information-disclosure | src/renderer/store/tagStore.ts | pendingJob uses TagJobFileSafe type — targetAccessHash structurally absent (T-12-03 mitigated by TypeScript type enforcement) |

## Self-Check: PASSED

- [x] src/renderer/store/tagStore.ts exists
- [x] src/renderer/store/tagStore.test.ts exists
- [x] commit 676c7b9 exists (RED)
- [x] commit f06a0e8 exists (GREEN)
- [x] removalStore.ts unchanged
