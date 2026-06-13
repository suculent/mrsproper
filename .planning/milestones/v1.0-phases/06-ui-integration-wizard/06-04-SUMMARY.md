---
phase: 06-ui-integration-wizard
plan: 04
subsystem: ui-wizard
tags: [wizard, stage-machine, SAF-01, SAF-02, SAF-03, confirmation-gate, flood-wait, summary-band, tdd]
dependency_graph:
  requires: [06-02, 06-03]
  provides: [complete-end-to-end-wizard, SAF-02-automated-coverage, run-trigger-review-gate]
  affects: [AppShell, GroupsPane, TargetCard, ResumeJobDialog, removalCopy, tailwind.config, wizardStage]
tech_stack:
  added: []
  patterns:
    - Pure stage transition function (getNextStage) extracted to wizardStage.ts for unit testing
    - TDD red/green cycle for SAF-02 stage transition rules
    - Structured summaryLineParts rendering (Array<{label, count}>) replacing string summaryLine in band
    - Explicit wizardStage useState (never derived from store state, per RESEARCH Pitfall 2)
key_files:
  created:
    - src/renderer/wizard/wizardStage.ts
  modified:
    - src/renderer/shell/AppShell.tsx
    - src/renderer/groups/GroupsPane.tsx
    - src/renderer/target/TargetCard.tsx
    - src/renderer/removal/removalCopy.ts
    - src/renderer/removal/ResumeJobDialog.tsx
    - src/renderer/wizard/wizardStage.test.ts
    - tailwind.config.ts
  deleted:
    - src/renderer/removal/RemovalConfirmDialog.tsx
decisions:
  - "RemovalConfirmDialog.tsx deleted atomically with GroupsPane run-trigger re-wiring; ReviewScreen is the single confirmation gate (SAF-02 T-06-04-02 mitigation)"
  - "getNextStage is a pure lookup table with no side effects; AppShell explicit setStage() calls remain authoritative stage drivers (RESEARCH Pitfall 2)"
  - "TargetCard default props pattern used (props = {}) to avoid breaking existing usages in tests/components that render TargetCard without onTargetConfirmed"
  - "Summary band restructured to flex items-center justify-between to accommodate Remove someone else button alongside stacked summary lines"
metrics:
  duration: 3
  completed_date: "2026-06-12"
  tasks: 4
  files: 8
---

# Phase 6 Plan 4: Wizard Integration — Full End-to-End Flow Summary

**One-liner:** Complete wizard stage machine wired into AppShell (target→groups→review→run→report) with ReviewScreen as the single SAF-02 confirmation gate, FLOOD_WAIT subline, structured summary band, and 9 SAF-02 automated tests via getNextStage pure function.

## What Was Built

### Task 1: summaryLineParts + tailwind mono annotation
- Added `summaryLineParts` function to `removalCopy.ts` — returns `Array<{label, count}>` for structured rendering (additive, summaryLine kept for backward compat)
- Added Phase 6 advisory comment to `tailwind.config.ts` fontFamily.mono confirming stack matches globals.css `.text-mono`

### Task 2: TargetCard, GroupsPane atomic update + RemovalConfirmDialog deletion
- `TargetCard`: added `onTargetConfirmed?` prop; confirm button now calls it after `confirmTarget()`
- `GroupsPane`: added `GroupsPaneProps` interface (`onNavigateToReview`, `onNavigateToTarget`, `stage`); removed `confirmOpen` state and `RemovalConfirmDialog`/`ResumeJobDialog` JSX
- Run-trigger changed from `variant="destructive"` to `variant="default"`, calls `props.onNavigateToReview()`, label from `wizardCopy.runTriggerLabel/Aria`
- FLOOD_WAIT subline added in running/stopping progress slot with `FloodCountdown`
- Summary band restructured: `gap-0.5` → `gap-1`, structured `summaryLineParts` spans (`font-semibold text-foreground` counts + `text-muted-foreground` labels), "Remove someone else" button using `wizardCopy.removeSomeoneElse`
- `RemovalConfirmDialog.tsx` deleted — ReviewScreen is the one confirm gate

### Task 3: getNextStage TDD (SAF-02)
- RED: `wizardStage.test.ts` written with 9 assertions (5 describe blocks: forward gates, auto-advance, back/reset, invalid-event guard) — all failing before implementation
- GREEN: `wizardStage.ts` created with `WizardEvent` type and `getNextStage(stage, event)` switch — all 9 tests pass
- SAF-02 now has real automated test coverage (replaces it.todo() stubs from Plan 03 Wave 0)

### Task 4: AppShell wizard stage machine + ResumeJobDialog resume→run
- `ResumeJobDialog`: added `onResume?` prop; called after `startRemoval` + `onOpenChange(false)`
- `AppShell`: explicit `wizardStage` useState; `StepIndicator` strip below header; `ReviewScreen` shown when `stage=review`; severity rehydrated from electron-store on mount; auto-advance `run→report` on terminal `removal.step`; `TargetCard` receives `onTargetConfirmed`; `GroupsPane` receives all wizard props; `ResumeJobDialog` rendered in AppShell with `onResume={() => setStage('run')}`

## Deviations from Plan

None - plan executed exactly as written. The one minor adaptation was using `TargetCard(props: TargetCardProps = {})` default parameter to preserve zero-arg usage in existing code.

## Test Coverage

| Test | Result |
|------|--------|
| `wizardStage.test.ts` (9 assertions) | All pass |
| Full vitest suite | 243/245 pass (2 pre-existing AUTH-03 env failures) |

## Known Stubs

None — all changes are wired to real data sources and IPC.

## Self-Check: PASSED

Files verified:
- `src/renderer/wizard/wizardStage.ts` — exists, exports `getNextStage` and `WizardEvent`
- `src/renderer/shell/AppShell.tsx` — has `wizardStage`, `setStage`, `StepIndicator`, `ReviewScreen`, `ResumeJobDialog`
- `src/renderer/groups/GroupsPane.tsx` — has `onNavigateToReview`, `summaryLineParts`, `floodWaitRemaining`, no `confirmOpen`, no `RemovalConfirmDialog`
- `src/renderer/removal/RemovalConfirmDialog.tsx` — does NOT exist (confirmed deleted)
- `src/renderer/removal/ResumeJobDialog.tsx` — has `onResume` in props and `handleResume`
- `src/renderer/removal/removalCopy.ts` — has `summaryLineParts` after `summaryLine`

Commits verified:
- `95b2bce` — Task 1
- `04ef09a` — Task 2
- `ca9ae38` — Task 3 RED
- `bd02dcc` — Task 3 GREEN
- `8719332` — Task 4
