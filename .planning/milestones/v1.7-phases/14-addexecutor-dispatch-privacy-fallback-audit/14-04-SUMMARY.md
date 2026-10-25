---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
plan: 04
subsystem: storage
tags: [typescript, vitest, append-only, plain-text-log]

# Dependency graph
requires:
  - phase: 14-addexecutor-dispatch-privacy-fallback-audit
    provides: "14-01: src/shared/addTypes.ts (AddLogBlockEntry contract)"
provides:
  - "src/main/storage/addLogStore.ts: createAddLogStore factory, AddLogStore interface, appendBlock(entry)"
affects: [14-09, AddExecutor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Append-only log store: injectable fs/app DI mirrors tagAuditStore.ts's shape, but write mechanics are fs.appendFileSync (never writeFileSync/renameSync) — first append-only module in the codebase, no overwrite-via-atomic-rename"

key-files:
  created:
    - src/main/storage/addLogStore.ts
    - src/main/storage/addLogStore.test.ts
  modified: []

key-decisions:
  - "Follow-up blocks marked with a literal 'CONTINUATION' substring in the header line (grep-able), satisfying D-18's 'visually distinguished' requirement without a separate field"
  - "Reworded the file-header threat-model comment (T-14-05) to avoid a second literal 'mode: 0o600' substring match, so the plan's grep -c check equals 1 exactly (same fix pattern as 14-03's tagAuditStore.ts JSDoc)"
  - "formatBlock() is a private pure function — no exported block-formatting API beyond appendBlock(), keeping the log layout an implementation detail AddExecutor never needs to know about"

patterns-established:
  - "Pattern: append-only storage modules reuse the injectable-fs/app DI shape from atomic-write stores but swap the write primitive to appendFileSync and drop tmp/rename entirely"

requirements-completed: [ADD-14]

# Metrics
duration: 8min
completed: 2026-10-03
---

# Phase 14 Plan 04: AddLogStore (Plain-Text, Append-Only add-log.txt Writer) Summary

**Implemented `addLogStore.ts` — the plain-text, append-only, owner-only `add-log.txt` writer that gives `AddExecutor` a durable, human-readable record of each run, independent of and outliving `add-job.json`.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-03T22:49:00+02:00 (approx)
- **Completed:** 2026-10-03T22:57:30+02:00
- **Tasks:** 2 (RED + GREEN, TDD plan)
- **Files modified:** 2 (both created)

## Accomplishments

- `src/main/storage/addLogStore.test.ts` created with 8 test cases covering: `appendFileSync` (not `writeFileSync`) called with mode 0o600, path ends with `/add-log.txt`, block content includes targetId/targetName/jobId/dmStatus as readable text, addedDialogs listed and linkedDialogs listed with their link text, two sequential calls produce two non-overwriting blocks, a follow-up block is marked with a `CONTINUATION` literal while still showing the original jobId, the three `dmStatus` values render distinctly, and an entry with empty `addedDialogs`/`linkedDialogs` still writes a block.
- `src/main/storage/addLogStore.ts` created: `createAddLogStore()` factory with injectable `fs`/`app` deps (lazy `require()` of real `node:fs`/`electron.app` when not injected, mirroring `tagAuditStore.ts`'s DI pattern), `AddLogStore` interface (`appendBlock(entry)`), and a private `formatBlock()` function producing a human-readable block: header line (with a `CONTINUATION` suffix when `isFollowUp`), target line, DM status line, an "Added to:" section, a "Sent as invite link to:" section (with links), and a trailing blank line separating sequential blocks.
- Every write goes through `fs.appendFileSync(logPath(), blockText, { mode: 0o600 })` — no `writeFileSync`/`renameSync` anywhere in the file, confirming the append-only contract (D-17: never pruned, never rewritten in place).

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write addLogStore.test.ts with all tests failing** - `c9a8a4a` (test)
2. **Task 2 (GREEN): Implement addLogStore.ts to pass all tests** - `09e7223` (feat)

**Plan metadata:** (this commit, created after this summary)

## Files Created/Modified

- `src/main/storage/addLogStore.ts` - New storage module: `AddLogStore` interface, `AddLogStoreFsDeps`/`AddLogStoreAppDeps`/`AddLogStoreDeps`, `createAddLogStore()` factory, private `formatBlock()` formatter
- `src/main/storage/addLogStore.test.ts` - New test file: fake-fs/fake-app injection harness (append-accumulating fake, following `tagAuditStore.test.ts`'s fake-fs style), `makeEntry()` fixture, 8 `it()` blocks

## Decisions Made

- Followed 14-PATTERNS.md's recommended shape and the plan's exact task instructions for `formatBlock()`'s field ordering and the `CONTINUATION` literal marker — no structural deviation.
- Reworded one doc-comment line in the file header (the T-14-05 threat-model note) to avoid an incidental second match of the literal string `mode: 0o600`, so the plan's `grep -c "mode: 0o600" == 1` acceptance criterion is satisfied precisely (same fix pattern 14-03 applied to `addAuditStore.ts`'s JSDoc). Comment-only change, no behavioral impact — the single `appendFileSync` call still passes `{ mode: 0o600 }`.

## Deviations from Plan

None — plan executed exactly as written. The JSDoc rewording above is a wording-precision fix to satisfy the plan's own stated acceptance criterion exactly, consistent with the precedent already set in 14-03's SUMMARY.

## Issues Encountered

- `npx tsc --build` emitted stray `.js`/`.d.ts` files beside `addLogStore.ts`/`addLogStore.test.ts` in `src/main/storage/` on each build run (known project behavior per CLAUDE.md memory note). These were deleted after each verification pass and confirmed absent from `git status --short` before each commit.
- First commit attempt for Task 2 (using a `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc containing apostrophes and em-dashes) failed with a shell quoting error (`unexpected EOF while looking for matching` '`''`'`). Recovered by writing the commit message to a temp file (`/tmp/commit-msg-14-04-task2.txt`, deleted after use — outside the repo, not committed) and using `git commit -F`. No code or test changes were needed; this was a shell-quoting issue in the commit command itself, not a deviation from the plan's implementation.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `AddExecutor` (Plan 14-09) can call `addLogStore.appendBlock(entry)` at run-terminal state with no further storage-layer scaffolding, satisfying this plan's `<success_criteria>` verbatim.
- The resulting `add-log.txt` is human-readable plain text, mode 0o600, append-only, matching D-17/D-18 exactly.
- No blockers for downstream plans.

## Self-Check: PASSED

- FOUND: src/main/storage/addLogStore.ts
- FOUND: src/main/storage/addLogStore.test.ts
- FOUND: c9a8a4a (Task 1 commit)
- FOUND: 09e7223 (Task 2 commit)

---
*Phase: 14-addexecutor-dispatch-privacy-fallback-audit*
*Completed: 2026-10-03*
