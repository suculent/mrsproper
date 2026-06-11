---
phase: 03-target-resolution-verification
plan: "06"
subsystem: renderer-ipc-types
tags: [gap-closure, typescript, interface-merging, verification, phase-3-complete]
dependency_graph:
  requires: ["03-01", "03-02", "03-03", "03-04", "03-05"]
  provides: ["clean-tsc-web", "cr-01-verified", "cr-02-verified", "cr-03-verified"]
  affects: ["src/renderer/ipc/authClient.ts", "src/renderer/ipc/targetClient.ts"]
tech_stack:
  added: []
  patterns: ["TypeScript global interface merging for Window.mrproper augmentation (named MrProperApi interface instead of inline object literal)"]
key_files:
  created: []
  modified:
    - src/renderer/ipc/authClient.ts
    - src/renderer/ipc/targetClient.ts
decisions:
  - "MrProperApi named interface in authClient.ts global block — enables TypeScript interface merging in targetClient.ts; Window.mrproper typed as MrProperApi (not inline object literal)"
metrics:
  duration_min: 8
  completed_date: "2026-06-11"
  tasks_completed: 2
  files_changed: 2
requirements: [TGT-01, TGT-02, TGT-03, TGT-04, VRF-01, VRF-02, VRF-03]
---

# Phase 03 Plan 06: Gap-Closure Verification Summary

**One-liner:** Named `MrProperApi` interface replaces inline object literal in `authClient.ts` — resolves `tsconfig.web.json` TS2717+TS2339 errors via standard interface merging; all three CR blockers (hooks crash, bigint mismatch, error misclassification) verified closed by prior fix commits.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix Window.mrproper augmentation — MrProperApi interface merging | 8d2b6eb | src/renderer/ipc/authClient.ts, src/renderer/ipc/targetClient.ts |
| 2 | Verify CR-01, CR-02, CR-03 acceptance criteria and full suite regression | (no file changes) | — |

## What Was Built

### Task 1 — TypeScript fix: MrProperApi interface merging

Root cause: `authClient.ts` declared `Window.mrproper` as an inline object literal type inside `declare global`. TypeScript interface merging only applies to named interfaces; `targetClient.ts` used `Window['mrproper'] & {...}` which produced TS2717 ("Subsequent property declarations must have the same type") and 6x TS2339 errors under `tsconfig.web.json`.

Fix applied:
- `authClient.ts`: Extracted the 8 auth methods from the inline object literal into a named `interface MrProperApi` in the `declare global` block; `Window.mrproper` now typed as `MrProperApi`.
- `targetClient.ts`: Replaced the broken `Window['mrproper'] & {...}` intersection with a clean `interface MrProperApi { ... }` augmentation — the standard TypeScript interface merging pattern. The `interface Window` re-declaration was removed entirely (not needed when augmenting the named interface).

Result: `npx tsc --noEmit -p tsconfig.web.json` exits 0 with zero errors.

### Task 2 — Acceptance criteria verification (read-and-run, no file changes)

All CR acceptance criteria verified green:

**CR-01 (React hooks crash):**
- `grep -c "eslint-disable.*react-hooks/rules-of-hooks" src/renderer/target/TargetCard.tsx` → 0
- `useMemo` calls at lines 82-83, early return guard `if (!t) return null` at line 86 — hooks are unconditionally above the return

**CR-02 (GramJS bigint mismatch):**
- `grep -c "typeof peer.userId" src/main/telegram/TargetResolver.ts` → 0
- `grep -c "toString() ===" src/main/telegram/TargetResolver.ts` → 2 (both username and phone paths)
- `grep -c "bigInt(" src/main/telegram/__mocks__/telegramClient.ts` → 8
- `npm test -- --run src/main/telegram/targetResolver.test.ts`: 23/23 passed

**CR-03 (TARGET_NO_PUBLIC_PROFILE misclassification):**
- `grep -n "TARGET_NO_PUBLIC_PROFILE" src/main/telegram/operationErrors.ts` → line 131-132 with `disposition: 'fail'`
- `grep -c "errorMessage: 'TARGET_NO_PUBLIC_PROFILE'" src/main/telegram/TargetResolver.ts` → 2
- `npm test -- --run src/main/telegram/operationErrors.test.ts`: 15/15 passed

**Full regression:** `npm test -- --run` → `Tests 2 failed | 112 passed (114)` — the 2 failures are only `config.test.ts` (pre-existing MRPROPER_API_ID/API_HASH env vars unset, out of scope).

**Both tsc configs:**
- `npx tsc --noEmit -p tsconfig.web.json` → exit 0
- `npx tsc --noEmit -p tsconfig.node.json` → pre-existing errors only (none in Phase 3 files)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this is a gap-closure and verification plan. No new UI components or data paths introduced.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. The `MrProperApi` interface renaming enforces the same 14-method contract with stronger TypeScript checking (T-03-GC-01 mitigation is now more robust: interface merging is checked at compile time, inline object literal was not).

## Self-Check: PASSED

- `src/renderer/ipc/authClient.ts` — modified, tracked in commit 8d2b6eb
- `src/renderer/ipc/targetClient.ts` — modified, tracked in commit 8d2b6eb
- Commit 8d2b6eb exists: `git log --oneline | head -3` confirms it
- `tsconfig.web.json` exits 0
- All 3 CR source assertions pass
- Full suite 112/114 (pre-existing 2 failures only)

## Checkpoint Awaiting Human Verification

Task 3 is a `checkpoint:human-verify` — requires a running app with an active Telegram session to verify:
1. Real username resolves to identity card without React crash (CR-01 + CR-02 end-to-end)
2. Non-existent username shows "No one has that username" copy (CR-03 end-to-end)
3. (Optional) Phone resolution, no-avatar fallback, confirm gate, change target
