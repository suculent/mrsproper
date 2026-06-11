---
phase: 03
plan: 02
subsystem: target-resolution
tags: [tdd, test-scaffolding, badge, ipc]
dependency_graph:
  requires: [03-01]
  provides: [badge-component, red-targetResolver-tests, red-targetChannels-tests]
  affects: [03-03, 03-05]
tech_stack:
  added: []
  patterns: [shadcn-new-york-slate, vitest-red-tests, ipc-mock-pattern]
key_files:
  created:
    - src/renderer/components/ui/badge.tsx
    - src/main/telegram/targetResolver.test.ts
    - src/main/ipc/targetChannels.test.ts
  modified: []
decisions:
  - "Badge component created manually following new-york/slate cva pattern (no npx shadcn, consistent with prior components.json decision)"
  - "targetChannels.test.ts Electron mock captures ipcMain.handle registrations via a module-level dict, matching authChannels.ts pattern"
metrics:
  duration: 8
  completed_date: "2026-06-11"
---

# Phase 03 Plan 02: TDD Scaffolding — Badge Component + RED Test Stubs Summary

**One-liner:** Badge component (cva, 3 variants) and RED test stubs for TargetResolver/targetChannels covering TGT-01..04, VRF-01..03.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add badge component + write RED targetResolver.test.ts | 13ac335 | src/renderer/components/ui/badge.tsx, src/main/telegram/targetResolver.test.ts |
| 2 | Write RED targetChannels.test.ts | 39ccdc7 | src/main/ipc/targetChannels.test.ts |

## What Was Built

### Badge Component (`src/renderer/components/ui/badge.tsx`)

Follows the existing shadcn new-york/slate pattern used in button.tsx, using `cva` from `class-variance-authority` and `cn` from `@renderer/lib/utils`. Exports `Badge` (function component) and `badgeVariants`. Three variants:
- `default` — primary fill (for premium/status chips)
- `secondary` — muted fill (for username display)
- `destructive` — destructive/10 background + destructive/30 border (for Deleted/Bot warnings)

No new npm packages added.

### RED Test: `targetResolver.test.ts` (7 describe blocks)

Covers all TGT-01..04 and VRF-01..02 behaviors, plus the VRF-03 prerequisite (confirm gate):

1. `TargetResolver.resolve — username path (TGT-01, TGT-03)` — resolves @username, verifies string id, state transitions through resolving → resolved
2. `TargetResolver.resolve — username not found (TGT-04)` — USERNAME_NOT_OCCUPIED → `TARGET_USERNAME_NOT_FOUND`
3. `TargetResolver.resolve — phone path (TGT-02, TGT-03)` — resolves phone number, verifies routing to phone path vs username path
4. `TargetResolver.resolve — phone not found (TGT-04)` — PHONE_NOT_OCCUPIED → `TARGET_PHONE_NOT_FOUND`
5. `TargetResolver.resolve — avatar and bio (VRF-01, VRF-02)` — avatar Uint8Array/null, bio from GetFullUser, graceful degradation on GetFullUser error
6. `TargetResolver.confirm (VRF-03 prerequisite)` — confirm() advances resolved → confirmed; getResolvedUser() returns bigint shape
7. `TargetResolver.reset` — reset() from resolved/confirmed → idle; getResolvedUser() null after reset

Fails with `Cannot find module './TargetResolver'` — Wave 2 Plan 03 makes these GREEN.

### RED Test: `targetChannels.test.ts` (3 describe blocks)

Covers VRF-03 confirm gate and the T-03-04 security boundary:

1. `registerTargetChannels — confirm gate (VRF-03)` — ipcMain handler registration verified; `target:confirm` calls resolver.confirm() and returns confirmed TargetState
2. `registerTargetChannels — target:resolve Zod validation (T-03-04)` — malformed payload (missing `input`) throws or returns error state; resolver.resolve() must NOT be called
3. `emitTargetState — skips destroyed window` — win.webContents.send not called when isDestroyed() is true; IS called when false

Fails with `Cannot find module './targetChannels'` — Wave 2 Plan 03 makes these GREEN.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Coverage

Per plan threat model:
- T-03-03: getResolvedUser() test asserts `{ id: bigint, accessHash: bigint }` — bigint types only, documents the main-only boundary. Test present in describe block 6.
- T-03-04: targetChannels.test.ts suite 2 verifies malformed payloads (missing `input`) are rejected before reaching resolver. Test present.
- T-03-SC: Badge added as local file copy, no new npm package in package.json.

## Known Stubs

None — this plan contains only test scaffolding and a UI component. No data-wiring stubs introduced.

## Self-Check: PASSED

- src/renderer/components/ui/badge.tsx: FOUND
- src/main/telegram/targetResolver.test.ts: FOUND; fails with "Cannot find module './TargetResolver'"
- src/main/ipc/targetChannels.test.ts: FOUND; fails with "Cannot find module './targetChannels'"
- Commit 13ac335: FOUND
- Commit 39ccdc7: FOUND
- All existing tests (operationErrors.test.ts): 14/14 GREEN
