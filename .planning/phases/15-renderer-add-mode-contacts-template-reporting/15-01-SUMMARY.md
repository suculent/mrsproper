---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 01
subsystem: ui
tags: [shared-module, dm-template, electron, renderer, main-process]

# Dependency graph
requires:
  - phase: 14-addexecutor-dispatch-privacy-fallback-audit
    provides: renderTemplate/DEFAULT_TEMPLATE_EN/DEFAULT_TEMPLATE_CS originally defined in templateChannels.ts, plus TEMPLATE_GET/TEMPLATE_SET IPC and preloadTemplateCache/getCachedTemplate
provides:
  - src/shared/dmTemplate.ts — pure, zero-dependency module with renderTemplate(), DEFAULT_TEMPLATE_EN, DEFAULT_TEMPLATE_CS, DM_TEMPLATE_MAX_LENGTH, importable from both main and renderer
  - templateChannels.ts re-exporting the same three symbols with zero call-site changes for existing consumers
affects: [15-03 (addValidation.ts's validateDmTemplate reuses DM_TEMPLATE_MAX_LENGTH), 15-10 (ReviewScreen's DM preview imports renderTemplate directly from @shared/dmTemplate)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["shared/ pure module pattern: zero Electron/Node/Zod imports so a file can be pulled into both the main and renderer bundles"]

key-files:
  created:
    - src/shared/dmTemplate.ts
    - src/shared/dmTemplate.test.ts
  modified:
    - src/main/ipc/templateChannels.ts

key-decisions:
  - "DM_TEMPLATE_MAX_LENGTH (4000) is the single source of truth for the template length bound, consumed by both templateChannels.ts's Zod schema and (in Plan 15-03) the renderer's validateDmTemplate — satisfies T-15-04"
  - "Acceptance criteria required zero literal occurrences of 'electron'/'zod' anywhere in dmTemplate.ts, including comments — reworded the file-header prose to avoid those words literally while preserving the same warning"

patterns-established:
  - "Pattern: a module that must be importable by both main and renderer lives in src/shared/ with a header comment stating the zero-import constraint explicitly; the main-process file that used to own the logic becomes a thin re-export"

requirements-completed: [ADD-16]

# Metrics
duration: 6min
completed: 2026-10-04
---

# Phase 15 Plan 01: Shared DM Template Module Summary

**Relocated `renderTemplate()`/`DEFAULT_TEMPLATE_EN`/`DEFAULT_TEMPLATE_CS` into a new zero-dependency `src/shared/dmTemplate.ts` and added `DM_TEMPLATE_MAX_LENGTH`, so the Add review screen's DM preview (Plan 15-10) can render byte-identically to what AddExecutor actually sends (D-13).**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-04T00:19:00Z
- **Completed:** 2026-10-04T00:22:36Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `src/shared/dmTemplate.ts` is now the single source of truth for `renderTemplate`, `DEFAULT_TEMPLATE_EN`, `DEFAULT_TEMPLATE_CS`, and the new `DM_TEMPLATE_MAX_LENGTH` constant, with zero Electron/Node/Zod imports so it can be pulled into the renderer bundle.
- `templateChannels.ts` re-exports the same three symbols from `@shared/dmTemplate` — `main/index.ts` and `templateChannels.test.ts` needed zero call-site changes.
- `TemplateSetSchema`'s hardcoded `.max(4000)` now reads `.max(DM_TEMPLATE_MAX_LENGTH)`, closing the drift risk flagged by threat T-15-04.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/shared/dmTemplate.ts and relocate the pure template logic** - `eb9f242` (feat)
2. **Task 2: Re-export from templateChannels.ts and reuse the shared max-length constant** - `783e1b1` (refactor)

_No TDD tasks in this plan; both are `type="auto"`._

## Files Created/Modified
- `src/shared/dmTemplate.ts` - Pure module: `renderTemplate()`, `DEFAULT_TEMPLATE_EN`, `DEFAULT_TEMPLATE_CS`, `DM_TEMPLATE_MAX_LENGTH`
- `src/shared/dmTemplate.test.ts` - 8 tests covering substitution, the WR-03 "Evil{links}Name" regression case, default placeholder presence, and the max-length constant
- `src/main/ipc/templateChannels.ts` - Deleted local definitions, re-exports from `@shared/dmTemplate`, schema now uses `DM_TEMPLATE_MAX_LENGTH`

## Decisions Made
- Kept the exact single-regex-pass `renderTemplate` implementation (WR-03) verbatim rather than refactoring to two `.replace()` calls — preserves the existing collision-safety guarantee for target names containing the literal substring `{links}`.
- Reworded the `dmTemplate.ts` header/section comments to avoid the literal case-insensitive strings "electron" and "zod" (acceptance criteria required `grep -c` to return 0 for both across the whole file, not just import lines) while keeping the same warning intent ("must never import the desktop-shell runtime... or a schema-validation library").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded comment prose to satisfy the literal grep acceptance criterion**
- **Found during:** Task 1 verification
- **Issue:** The plan's acceptance criterion `grep -c "electron"`/`"zod"` (case-insensitive) returning 0 was written assuming no import statements, but my first draft's file-header comment used the words "electron" and "zod" in prose (describing what the module must never import), which the literal grep also caught, failing the stated acceptance check.
- **Fix:** Reworded the two comment lines to describe the same constraint without using those literal substrings ("the desktop-shell runtime", "a schema-validation library").
- **Files modified:** src/shared/dmTemplate.ts
- **Verification:** `grep -ic "electron" src/shared/dmTemplate.ts` and `grep -ic "zod" src/shared/dmTemplate.ts` both return 0; `npx vitest run src/shared/dmTemplate.test.ts` still green (8/8).
- **Committed in:** eb9f242 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Cosmetic comment wording only — no behavioral change. No scope creep.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/shared/dmTemplate.ts` is ready for Plan 15-03 (`addValidation.ts`'s `validateDmTemplate` reusing `DM_TEMPLATE_MAX_LENGTH`) and Plan 15-10 (`ReviewScreen.tsx`'s DM preview importing `renderTemplate` directly from `@shared/dmTemplate`, never from `templateChannels.ts`).
- Full suite verified green: 38 files / 509 tests (baseline was 37/501; +1 file / +8 tests from the new `dmTemplate.test.ts`, no regressions).
- No blockers for downstream Phase 15 plans.

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*
