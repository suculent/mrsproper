---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 03
subsystem: ui
tags: [renderer, pure-helpers, mode-switch, dm-template, wizard-stage]

# Dependency graph
requires:
  - phase: 13-add-rights-and-scan-semantics-foundation
    provides: AdminDialogDTO.canAdd/addGreyReason, MembershipStatus 'banned'/'not-member' semantics
  - phase: 15-renderer-add-mode-contacts-template-reporting (Plan 15-01)
    provides: src/shared/dmTemplate.ts's DM_TEMPLATE_MAX_LENGTH constant
provides:
  - src/renderer/groups/modeRules.ts — isActionableForMode(dialog, status, mode), the single shared actionability predicate for Remove/Tag/Add
  - groupsStore.ts's groupsActions.recomputeCheckedForMode(mode) — mode-switch checklist rebuild without a new scan (D-03)
  - src/renderer/wizard/addValidation.ts — computeAddGroups(dialogs, checkedIds, membershipByDialogId, t) and validateDmTemplate(text)
  - src/renderer/wizard/wizardStage.ts — ADD_COMPLETE/ADD_STOPPED events, run→report transition (D-04)
affects: [15-09 (GroupsPane partition consumes isActionableForMode + recomputeCheckedForMode), 15-10 (ReviewScreen/DmTemplateEditor consume computeAddGroups/validateDmTemplate), 15-?? (AppShell's add-mode auto-advance gate consumes ADD_COMPLETE/ADD_STOPPED)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["shared pure predicate parameterized by mode, imported at every call site that needs per-mode actionability — never re-derived inline (prevents Pitfall 2's silent-drift risk)"]

key-files:
  created:
    - src/renderer/groups/modeRules.ts
    - src/renderer/groups/modeRules.test.ts
    - src/renderer/store/groupsStore.test.ts
    - src/renderer/wizard/addValidation.ts
    - src/renderer/wizard/addValidation.test.ts
  modified:
    - src/renderer/store/groupsStore.ts
    - src/renderer/wizard/wizardStage.ts
    - src/renderer/wizard/wizardStage.test.ts

key-decisions:
  - "isActionableForMode's Add branch deliberately treats a null/pending status as non-actionable (D-05 asymmetry), while Remove/Tag treat null as actionable — kept as one explicit if/else, not unified further, per 15-RESEARCH.md Pattern 2's anti-pattern warning"
  - "groupsStore.test.ts mocks 'react' itself (useSyncExternalStore reduced to a synchronous subscribe-once-then-getSnapshot function) so the module's private onScanState/onGroupsState push callbacks and checkedDialogIds snapshot are reachable from a jsdom-free node-environment test without rendering a component"
  - "groupsStore.test.ts uses vi.resetModules() + dynamic re-import per test to get a fresh store singleton each time, since groupsStore has no exported reset and currentState/_prevScanStep are module-level"
  - "addValidation.ts imports TranslateFn from tagValidation.ts rather than duplicating the type, per the plan's 'check before duplicating' instruction — tagValidation.ts already exports it"

patterns-established:
  - "Pattern: when a module's module-level singleton state must be read/driven directly by a node-environment test (no jsdom), mock 'react' to flatten useSyncExternalStore into a plain synchronous call rather than attempting to render the hook"

requirements-completed: [ADD-01, ADD-12]

# Metrics
duration: 9min
completed: 2026-10-04
---

# Phase 15 Plan 03: Mode-Aware Actionability + Add Validation Helpers Summary

**Introduced isActionableForMode (the single Remove/Tag/Add checklist actionability rule), groupsStore's mode-switch-aware recomputeCheckedForMode, computeAddGroups/validateDmTemplate for the Add review screen, and wizardStage's ADD_COMPLETE/ADD_STOPPED events — all pure, all unit-tested, none yet wired into any component.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-04T00:34:32Z
- **Completed:** 2026-10-04T00:43:08Z
- **Tasks:** 3
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments
- `isActionableForMode(dialog, status, mode)` is now the one place that decides checklist actionability for all three modes — `groupsStore.ts`'s pre-check rebuild calls it instead of its old inline filter, and `GroupsPane.tsx`'s partition loop (Plan 15-09) will call the same function, closing the Pitfall 2 drift risk flagged in 15-RESEARCH.md.
- `groupsActions.recomputeCheckedForMode(mode)` lets a future mode-switch control (Plan 15-09/`ModeSwitch.tsx`) re-partition the already-scanned checklist with zero new IPC calls, satisfying D-03.
- `computeAddGroups`/`validateDmTemplate` give the Add review screen (Plan 15-10) the same pure-helper contract `ReviewScreen.tsx` already relies on for Remove/Tag, including the D-06 ban-lifted-first note and D-12's three-mode validation order.
- `wizardStage.ts`'s stage machine now has an Add-mode run→report path mirroring Tag's exactly, ready for AppShell's future `mode === 'add'` auto-advance effect (D-04).

## Task Commits

Each task was committed atomically:

1. **Task 1: isActionableForMode predicate + groupsStore mode-aware recompute** - `5047cc9` (feat)
2. **Task 2: computeAddGroups + validateDmTemplate pure helpers** - `b56a034` (feat)
3. **Task 3: wizardStage.ts — ADD_COMPLETE/ADD_STOPPED events (D-04)** - `fb99462` (feat)

_No TDD RED/GREEN split commits — all three tasks are `type="auto"` with `tdd="true"` executed as implementation-plus-tests-together, consistent with how Plan 15-01's helper-module tasks were committed._

## Files Created/Modified
- `src/renderer/groups/modeRules.ts` - `isActionableForMode(dialog, status, mode)` pure predicate, single source of truth for Remove/Tag/Add actionability
- `src/renderer/groups/modeRules.test.ts` - 17 tests covering all three modes and the D-05 pending-row asymmetry
- `src/renderer/store/groupsStore.ts` - onScanState's first-completion rebuild now routes through `isActionableForMode(d, status, 'remove')`; new `groupsActions.recomputeCheckedForMode(mode)` action
- `src/renderer/store/groupsStore.test.ts` - 7 tests (new file) covering the CR-03 first-completion/retry-complete split, both recompute directions, and toggleGroup regression
- `src/renderer/wizard/addValidation.ts` - `computeAddGroups`, `AddGroupAction`, `validateDmTemplate`, `DmTemplateError`
- `src/renderer/wizard/addValidation.test.ts` - 16 tests covering mechanic notes, the ban-lifted suffix, and all three validation failure modes plus the valid/at-limit cases
- `src/renderer/wizard/wizardStage.ts` - `WizardEvent` gains `ADD_COMPLETE`/`ADD_STOPPED`; `run` case returns `'report'` for both
- `src/renderer/wizard/wizardStage.test.ts` - 3 new tests mirroring the existing TAG_COMPLETE/TAG_STOPPED cases plus the invalid-transition guard

## Decisions Made
- Kept the Add-mode pending-row exclusion as an explicit early-return branch inside `isActionableForMode` rather than trying to express it as a shared sub-condition with Remove/Tag — the asymmetry is intentional per D-05, not an oversight to "clean up."
- `groupsStore.test.ts` needed a way to reach the module's private `onScanState`/`onGroupsState` push callbacks and read `checkedDialogIds` without jsdom/RTL (neither is installed, confirmed by `vitest.config.ts`'s `environment: 'node'`). Mocking `'react'` so `useSyncExternalStore` degrades to a plain `subscribe-then-getSnapshot` call let the test drive the real subscription-lifecycle code path (not a reimplementation of it) while staying in the node environment.
- Combined with `vi.resetModules()` + dynamic re-import per test, this gives each test a clean singleton store instance — necessary because `groupsStore.ts` has no exported reset and keeps `currentState`/`_prevScanStep` at module scope.

## Deviations from Plan

None — plan executed exactly as written. All three tasks' behavior bullets, acceptance criteria greps, and verification commands pass as specified.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `isActionableForMode` and `recomputeCheckedForMode` are ready for Plan 15-09 (`GroupsPane.tsx`'s partition loop, the `ModeSwitch` control's `onClick` handler) to consume without re-deriving the rule.
- `computeAddGroups`/`validateDmTemplate` are ready for Plan 15-10 (`ReviewScreen.tsx`'s Add block, `DmTemplateEditor.tsx`).
- `ADD_COMPLETE`/`ADD_STOPPED` are ready for AppShell's future `mode === 'add'` auto-advance effect (Plan 15-09/15-10's `AppShell.tsx` split of `action` into `mode`+`severity`, per 15-RESEARCH.md Pattern 1).
- Full suite verified green: 42 files / 559 tests (baseline stated in the plan was 39 files / 516 tests — matches exactly). This plan adds 3 new test files (`modeRules.test.ts` +17, `groupsStore.test.ts` +7, `addValidation.test.ts` +16) and 3 tests to the existing `wizardStage.test.ts`, for a net +3 files / +43 tests, zero regressions.
- No blockers for downstream Phase 15 plans.

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*
