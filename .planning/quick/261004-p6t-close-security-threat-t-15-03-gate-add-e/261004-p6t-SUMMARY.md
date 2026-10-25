---
status: complete
phase: quick-261004-p6t
plan: 01
subsystem: ipc-security
tags: [electron, ipc, auth-gate, vitest, tdd]

requires:
  - phase: 15-renderer-add-mode-contacts-template-reporting
    provides: ADD_EXPORT_LOG handler (add:exportLog IPC channel) and its 16-19 test suite
provides:
  - Auth gate on ADD_EXPORT_LOG closing T-15-03 (Elevation of Privilege)
  - Regression test 20 proving unauthenticated callers cannot reach dialog.showSaveDialog/copyFileSync
affects: [15-renderer-add-mode-contacts-template-reporting, security-audit]

tech-stack:
  added: []
  patterns:
    - "Every ipcMain.handle body in addChannels.ts begins with the getAuthState().step !== 'authorized' guard (now exceptionless)"

key-files:
  created: []
  modified:
    - src/main/ipc/addChannels.ts
    - src/main/ipc/addChannels.test.ts

key-decisions:
  - "Reused the existing 'idle' non-authorized step string (already used by tests 2 and 15) rather than inventing a new one"
  - "Gate returns bare { ok: false as const } (no reason field), matching TARGET_ADD_CONTACT and clipboardChannels.ts precedent — already structurally assignable to exportAddLog's optional-reason return type, so no type widening was needed"

patterns-established: []

requirements-completed: [T-15-03]

duration: 12min
completed: 2026-10-04
---

# Quick Task 261004-p6t: Close Security Threat T-15-03 Summary

**Added the missing auth gate to `add:exportLog`'s IPC handler, closing the one sibling handler in addChannels.ts that let an unauthenticated renderer trigger a native save dialog and copy `add-log.txt` (containing single-use invite links) out of `userData`.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-04T18:11:00Z
- **Completed:** 2026-10-04T18:23:00Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files modified:** 2

## Accomplishments
- Added regression test 20 to `addChannels.test.ts`, proving (RED, before the fix) that an unauthenticated caller reaches `dialog.showSaveDialog`
- Added the 3-line `getAuthState().step !== 'authorized'` guard as the `ADD_EXPORT_LOG` handler's first statement, matching every sibling handler in the file (`ADD_START`, `ADD_RETRY_GROUP`, `TARGET_ADD_CONTACT`) and `clipboardChannels.ts`'s `CLIPBOARD_WRITE_TEXT`
- Confirmed RED-then-GREEN: test 20 fails against the ungated handler, passes after the fix; tests 1-19 unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Add failing unauthenticated-caller test for add:exportLog (RED)** - `0145bed` (test)
2. **Task 2: Gate ADD_EXPORT_LOG on authorized session (GREEN)** - `be42017` (fix)

**Plan metadata:** pending (orchestrator-owned docs commit — not created by this executor)

## Files Created/Modified
- `src/main/ipc/addChannels.ts` - `ADD_EXPORT_LOG` handler now gates on `getAuthState().step !== 'authorized'` as its first statement, before the dynamic `node:fs` import
- `src/main/ipc/addChannels.test.ts` - New test 20 (`ADD_EXPORT_LOG — unauthenticated returns { ok: false } without calling showSaveDialog or copyFileSync (T-15-03)`) added to the existing `describe('addChannels — ADD_EXPORT_LOG', ...)` block, after test 19

## Decisions Made
- Reused `makeGetAuthState('idle')` (precedent from tests 2 and 15) instead of introducing a new non-authorized step string
- Gate return shape is bare `{ ok: false as const }`, identical to `TARGET_ADD_CONTACT`'s gate — no widening of `exportAddLog`'s declared `Promise<{ ok: boolean; reason?: 'no-log' | 'canceled' }>` return type was needed since a missing optional field is already structurally compatible

## Deviations from Plan

None — plan executed exactly as written. `npx tsc --build --force` reported no type errors from the change, so the plan's "only widen if needed" contingency was not triggered.

## Issues Encountered

**Pre-existing, out-of-scope test failure in `src/main/telegram/config.test.ts`:** During the full-suite verification (`npx vitest run`), 2 of 593 tests failed (`AUTH-03: API_ID is a positive integer` and `AUTH-03: API_HASH is a non-empty string`). Root cause: `config.ts` reads `import.meta.env.MRSPROPER_API_ID`/`MRSPROPER_API_HASH`, which are only populated by `electron.vite.config.ts`'s dotenv-based `define` block at app build time — `vitest.config.ts` has no equivalent env wiring, so these two assertions are always `undefined` under plain `npx vitest run`, independent of this task's change. Confirmed unrelated to `addChannels.ts`/T-15-03 by static inspection (different file, different feature — Telegram API credential injection vs. the Add-mode export-log auth gate). Logged to `.planning/quick/261004-p6t-close-security-threat-t-15-03-gate-add-e/deferred-items.md` per the scope-boundary rule; not fixed as part of this task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- T-15-03 is closed: `ADD_EXPORT_LOG` now matches the auth-gate pattern of every sibling handler in `addChannels.ts`
- `.planning/phases/15-renderer-add-mode-contacts-template-reporting/15-SECURITY.md` was left untouched (untracked, orchestrator-owned) per the plan's explicit instruction
- The pre-existing `config.test.ts` env-injection gap (2 failing tests, unrelated to this task) remains open — see Issues Encountered / deferred-items.md

---
*Phase: quick-261004-p6t*
*Completed: 2026-10-04*
