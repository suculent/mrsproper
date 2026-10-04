---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 12
subsystem: ui
tags: [react, dialog, i18n, settings-menu, add-mode]

# Dependency graph
requires:
  - phase: 15-04
    provides: "add i18n namespace keys (resumeTitle, resumeBody, resumeDestructive, resumeDestructiveAria, resumeNeutral, exportLogButton, exportLogNoLogYet)"
  - phase: 15-07
    provides: "addActions.startAdd(dialogIds)/discardJob(), addClient.exportAddLog()"
provides:
  - "src/renderer/removal/AddResumeJobDialog.tsx — Resume/Discard dialog for an incomplete add job (D-21)"
  - "SettingsMenu.tsx Export add log… entry reachable without running (D-20's second reachability point)"
affects: [15-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AddResumeJobDialog is a structural clone of TagResumeJobDialog with addActions.startAdd(remainingDialogIds) as a single-argument call (no severity/tag-like second arg)"
    - "Settings-menu export entry reuses the plain hover menuitem row style, not the destructive logout style"

key-files:
  created:
    - src/renderer/removal/AddResumeJobDialog.tsx
  modified:
    - src/renderer/shell/SettingsMenu.tsx

key-decisions:
  - "exportMessage ('no-log' | null) local state cleared on every menu-open (gear-icon onClick), matching D-20's 'next open' no-log messaging requirement without a separate toast system"

requirements-completed: [ADD-14]

# Metrics
duration: ~8min
completed: 2026-10-04
---

# Phase 15 Plan 12: AddResumeJobDialog + SettingsMenu Export Entry Summary

**AddResumeJobDialog.tsx as an exact structural clone of TagResumeJobDialog (CR-04 no-op onOpenChange preserved), plus a non-destructive "Export add log…" entry in SettingsMenu calling the same ADD_EXPORT_LOG bridge used by the report-stage button.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-04T03:40:00+02:00 (approx.)
- **Completed:** 2026-10-04T03:48:27+02:00
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `AddResumeJobDialog` mirrors `TagResumeJobDialog` line-for-line in structure: `onOpenChange={() => {}}` no-op (CR-04), Discard (`variant="outline" autoFocus`) / Resume (`variant="default"`) buttons, `add` namespace translations
- `addActions.startAdd(remainingDialogIds)` called with the correct single-argument signature (verified by acceptance-criteria grep, matching D-15/D-21's divergence from Tag's two-argument `startTag`)
- `SettingsMenu.tsx` gained an "Export add log…" `role="menuitem"` row after the Theme section and before Log out, with its own separator, plain (non-destructive) hover styling, and an inline "No add log yet" message that clears on next menu open

## Task Commits

Each task was committed atomically:

1. **Task 1: AddResumeJobDialog.tsx** - `a05d39a` (feat)
2. **Task 2: SettingsMenu.tsx export entry** - `decbad3` (feat)

## Files Created/Modified
- `src/renderer/removal/AddResumeJobDialog.tsx` - New Resume/Discard dialog for incomplete add jobs, structural clone of TagResumeJobDialog.tsx
- `src/renderer/shell/SettingsMenu.tsx` - Added `tAdd` translation hook, `exportMessage` state, `handleExportLog` handler, and the new menu row + separator

## Decisions Made
- `exportMessage` is cleared in the gear-icon's own `onClick` (on every menu toggle), not only on successful export, so a stale "No add log yet" message never lingers into an unrelated later menu session — satisfies D-20's "cleared on next menu open" requirement with simple local state instead of a toast system.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

`tsc --build` emitted stray `.jsx`/`.d.ts` files beside both edited/created sources after each verification run (documented tsc-noop pitfall); deleted them before running Vitest and before each commit. No code changes were needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`AddResumeJobDialog` is ready for Plan 15-13 to mount in `AppShell.tsx` (per the `onResume={() => { setMode('add'); setStage('run') }}` wiring documented in 15-PATTERNS.md). The Settings-menu export entry is independently reachable and functional now, ahead of 15-13's report-stage button. Full verification: `npx tsc --build` exits 0; `npm run build` succeeds; `npx vitest run` (with `.env` loaded) — 44 files / 585 tests green, matching the pre-existing baseline. No blockers.

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: src/renderer/removal/AddResumeJobDialog.tsx
- FOUND: src/renderer/shell/SettingsMenu.tsx (modified)
- FOUND: a05d39a (Task 1 commit)
- FOUND: decbad3 (Task 2 commit)
