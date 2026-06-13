---
phase: "06"
plan: "03"
subsystem: renderer/wizard
tags: [ui, wizard, review-screen, safety-gate, copy, step-indicator, TDD]
dependency_graph:
  requires:
    - "06-01"   # severity IPC (severityClient.ts, preload surface)
  provides:
    - "ReviewScreen component (SAF-01/02/03 gate)"
    - "computePlannedActions pure function"
    - "PlannedGroupAction type"
    - "wizardCopy.ts all Phase 6 copy strings"
    - "StepIndicator five-stage strip"
  affects:
    - "06-04"   # AppShell wiring (imports ReviewScreen, WizardStage, StepIndicator)
tech_stack:
  added: []
  patterns:
    - "Copy module isolation (wizardCopy.ts mirrors removalCopy.ts pattern)"
    - "computePlannedActions exported pure function for unit testing — no jsdom needed"
    - "Avatar helpers duplicated from RemovalConfirmDialog.tsx per PATTERNS.md"
    - "TDD RED/GREEN with vitest node env"
    - "vitest @renderer alias added for renderer pure-function tests"
key_files:
  created:
    - "src/renderer/wizard/wizardCopy.ts"
    - "src/renderer/wizard/StepIndicator.tsx"
    - "src/renderer/wizard/ReviewScreen.tsx"
  modified:
    - "src/renderer/wizard/reviewScreen.test.ts"
    - "vitest.config.ts"
decisions:
  - "Added @renderer alias to vitest.config.ts so node-env tests can import renderer pure functions without jsdom (Rule 2 — missing critical for green tests)"
  - "computePlannedActions stays in ReviewScreen.tsx and is re-exportable because adding @renderer alias to vitest resolves all @renderer/* imports in node env"
metrics:
  duration_minutes: 8
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
---

# Phase 6 Plan 03: Wizard Copy, StepIndicator, ReviewScreen Summary

**One-liner:** ReviewScreen SAF-01/02/03 gate with computePlannedActions mechanic derivation, five-stage StepIndicator, and wizardCopy string module — all tests green.

## What Was Built

### Task 1: wizardCopy.ts + StepIndicator.tsx (commit `aabd70c`)

**`src/renderer/wizard/wizardCopy.ts`** — All Phase 6 user-facing strings in a single copy module:
- Step indicator aria label and five stage labels
- Review screen title, severity label, severity segmented control labels, consequence line
- Confirm button labels (ban/kick variants, pluralized)
- Totals line (removing/excluded/cant-block), empty state
- mechanicNote() — locked mechanic table from UI-SPEC (6 cases)
- Group list aria, member count, report stage copy
- All aria-label strings (Phase 5 advisory absorbed)

**`src/renderer/wizard/StepIndicator.tsx`** — Non-interactive five-stage orientation strip:
- `WizardStage` type exported: `'target' | 'groups' | 'review' | 'run' | 'report'`
- `<nav aria-label={wizardCopy.stepIndicatorAria}>` wrapping `<ol>` of stage spans
- Current stage: `text-foreground font-semibold` + `aria-current="step"`
- Completed stages: `text-muted-foreground`
- Future stages: `text-muted-foreground/60`
- ChevronRight separators with `aria-hidden`

### Task 2: ReviewScreen.tsx + reviewScreen.test.ts (TDD RED `bc95d22` → GREEN `edbf788`)

**`src/renderer/wizard/ReviewScreen.tsx`** — SAF-01/02/03 review and confirmation gate:
- `PlannedGroupAction` type exported: `{ dialog, mechanic, mechanicNote, warning }`
- `computePlannedActions(dialogs, checkedIds, severity)` exported pure function
- Locked mechanic derivation table:
  - supergroup + ban → `editBanned`, no warning
  - supergroup + kick → `restrict-then-unban`, no warning
  - broadcast-channel + ban → `editBanned`, no warning
  - broadcast-channel + kick → `restrict-then-unban`, no warning
  - basic-group + kick → `deleteChatUser`, no warning
  - basic-group + ban → `deleteChatUser`, warning: `rejoin-cant-be-blocked`
- `canAct=false` groups excluded from planned actions
- Identity block: 36px avatar, name, `@username · ID {id}` in `.text-mono` (NOT font-mono)
- Severity segmented control: `role="radiogroup"` with `aria-label`, two `role="radio"` Buttons
- Consequence line via `removalCopy.severityLine()`
- Totals line: Removing count, excluded (no rights) count, can't-block count
- ScrollArea group list with mechanic notes and AlertTriangle warnings for ban fallback
- Footer: outline back button + destructive confirm with Loader2 dispatching state
- `useEffect` focus heading on stage entry for screen-reader announcement

**`src/renderer/wizard/reviewScreen.test.ts`** — 12 tests, all green:
- actionable filter (canAct=true only)
- exclusion of canAct=false dialogs
- empty checkedIds edge case
- all six mechanic derivation branches
- dialog-not-in-array exclusion

**`vitest.config.ts`** — Added `@renderer` alias so pure functions in renderer files can be tested in the node vitest environment without jsdom.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added @renderer alias to vitest.config.ts**
- **Found during:** Task 2 RED phase
- **Issue:** `reviewScreen.test.ts` imports `computePlannedActions` from `./ReviewScreen`, which imports `@renderer/components/ui/button` etc. The vitest config had no `@renderer` alias, causing `ERR_MODULE_NOT_FOUND` and all tests failing to even load.
- **Fix:** Added `'@renderer': resolve(__dirname, 'src/renderer')` to vitest.config.ts `resolve.alias`. React and the Radix UI shadcn wrappers resolve cleanly in node env (they're pure JS modules that don't require DOM to import). Tests run without jsdom.
- **Files modified:** `vitest.config.ts`
- **Commit:** `edbf788`

## TDD Gate Compliance

- RED commit: `bc95d22` — `test(06-03): add failing tests for computePlannedActions (SAF-01/02/03)` — 12 tests, all failing (module not found)
- GREEN commit: `edbf788` — `feat(06-03): implement ReviewScreen with computePlannedActions (SAF-01/02/03)` — 12 tests, all passing
- No REFACTOR needed — implementation is clean as-is

## Verification Results

```
npx vitest run src/renderer/wizard/reviewScreen.test.ts --reporter=verbose
  Test Files  1 passed (1)
  Tests  12 passed (12)

npx vitest run
  Test Files  21 passed | 1 skipped (22)
  Tests  236 passed | 5 todo (241)

npx tsc --build --force
  (only pre-existing errors in unrelated test files — no new errors)

grep "computePlannedActions\|PlannedGroupAction" src/renderer/wizard/ReviewScreen.tsx → both exported
grep "text-mono" src/renderer/wizard/ReviewScreen.tsx → present (not font-mono)
grep "basic-group" src/renderer/wizard/ReviewScreen.tsx → d.type === 'basic-group'
grep "aria-current" src/renderer/wizard/StepIndicator.tsx → aria-current="step" on current stage
```

## Known Stubs

None. All exports are fully implemented. The `ReviewScreen` component reads from live stores (`useGroupsStore`, `useTargetStore`) and dispatches via `removalActions.startRemoval()`. Plan 04 wires it into AppShell.

## Threat Flags

No new security-relevant surface beyond what is documented in the plan's threat model. `computePlannedActions` is pure local computation with no IPC. `ReviewScreen` confirm button calls `removalActions.startRemoval()` — the real security gate remains in the main-process `REMOVAL_START` handler (Zod + auth + double-start guard, T-05-05).

## Self-Check: PASSED

- `src/renderer/wizard/wizardCopy.ts` — exists, all required keys present
- `src/renderer/wizard/StepIndicator.tsx` — exists, `aria-current="step"` on current stage
- `src/renderer/wizard/ReviewScreen.tsx` — exists, exports `ReviewScreen`, `computePlannedActions`, `PlannedGroupAction`
- `src/renderer/wizard/reviewScreen.test.ts` — exists, 12 tests all green
- `vitest.config.ts` — modified with `@renderer` alias
- Commits: `aabd70c`, `bc95d22`, `edbf788` — all verified in git log
