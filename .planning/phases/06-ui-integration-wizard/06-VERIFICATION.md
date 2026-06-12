---
phase: 06-ui-integration-wizard
verified: 2026-06-12T18:21:32Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "CR-01 — ResumeJobDialog opens on launch when a pending job exists after app restart"
    expected: "On app relaunch, if an incomplete job is found, the ResumeJobDialog appears automatically."
    why_human: "resumeOpen is initialized with useState(!!pendingJob) — pendingJob is null on first render because the removal store loads asynchronously. The CR-01 fix (a useEffect to set resumeOpen when pendingJob arrives) was NOT applied. Whether this is observable depends on async timing; requires human to restart the app with a persisted incomplete job to confirm the dialog opens."
  - test: "CR-03 — Resume button does something meaningful for a user-stopped (not just interrupted) job"
    expected: "When a job was explicitly stopped by the user (all unprocessed groups checkpointed as 'skipped'), clicking Resume starts removal of the previously-skipped groups."
    why_human: "remainingDialogIds is computed by filtering ids not found in job.outcomes at all. Since aborted runs checkpoint every unprocessed group as 'skipped' (giving them an outcomes entry), remainingDialogIds will be empty for stopped jobs. The Resume button fires startRemoval with [] which is rejected by Zod min(1). Requires human with a previously-stopped run to verify whether Resume silently no-ops or shows an error."
---

# Phase 6: UI Integration — Wizard, Safety Gates & Progress Verification Report

**Phase Goal:** The full end-to-end wizard ties the services together, gating destructive action behind a dry-run preview and a final review screen that shows the target's numeric ID and exact affected groups, requiring one explicit confirmation before live execution with progress and report.
**Verified:** 2026-06-12T18:21:32Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Before any removal, the user can run a dry-run/preview that reports exactly what would happen without performing any removal (SAF-03) | VERIFIED | `computePlannedActions` pure function in `ReviewScreen.tsx` derives mechanic + warning per group type + severity; all 12 reviewScreen tests pass green; human UAT test 3/4 confirmed in 06-05-SUMMARY.md |
| 2 | The final review screen shows the target identity including numeric user ID alongside the exact list of affected groups and the chosen action (SAF-01) | VERIFIED | `ReviewScreen.tsx` renders identity block with `targetId` in `className="text-mono text-label text-muted-foreground"` and scrollable group list; AppShell feeds `useTargetStore()` confirmed-step target; 12 unit tests green; human UAT test 4 confirmed |
| 3 | Execution does not start until the user gives one explicit confirmation on the review screen (SAF-02) | VERIFIED | `RemovalConfirmDialog.tsx` deleted; run-trigger in `GroupsPane` calls `onNavigateToReview()` not startRemoval; `ReviewScreen` handleConfirm is the sole path to `removalActions.startRemoval`; `getNextStage` SAF-02 tests (10 assertions) all pass; human UAT test 5 confirmed no second dialog |
| 4 | During and after execution the user sees live per-group progress and a final success/failure report in the wizard (EXE-04/EXE-05 wiring) | VERIFIED | `floodWaitRemaining` field on `RemovalState`; `_handleGovernorEvent` + `_runActive` in `RemovalExecutor`; `GroupsPane` renders FLOOD_WAIT subline when `floodWaitRemaining > 0`; auto-advance `run→report` in `AppShell`; structured `summaryLineParts` summary band; human UAT tests 6/7 confirmed |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/removalTypes.ts` | `RemovalState.floodWaitRemaining` field | VERIFIED | Line 90: `floodWaitRemaining?: number | null` |
| `src/shared/channels.ts` | `SEVERITY_GET` / `SEVERITY_SET` constants + CHANNELS entries | VERIFIED | Lines 61–62 exports; lines 100–101 in CHANNELS namespace |
| `src/preload/index.ts` | `getSeverity` / `setSeverity` in contextBridge | VERIFIED | Lines 162–165 |
| `src/renderer/ipc/severityClient.ts` | Typed IPC wrapper + `MrsProperApi` augmentation | VERIFIED | Exists, exports `severityClient`, `MrsProperApi` interface merging |
| `src/main/ipc/severityChannels.ts` | `registerSeverityChannels()` with Zod validation | VERIFIED | Exists; `SeveritySchema = z.object({ severity: z.enum(['kick','ban']) })`; lazy `getStore()` factory |
| `src/main/telegram/RemovalExecutor.ts` | `_runActive` field + `_handleGovernorEvent()` method | VERIFIED | Lines 89, 113; `_runActive` set true/false at all terminal state emissions |
| `src/main/index.ts` | `executorRef._handleGovernorEvent` wiring + `registerSeverityChannels()` call | VERIFIED | Lines 148, 162, 287, 290 |
| `src/renderer/wizard/wizardCopy.ts` | All copy strings | VERIFIED | Exists with `reviewTitle`, `severityLabel`, `mechanicNote`, `confirmLabel`, etc. |
| `src/renderer/wizard/StepIndicator.tsx` | Five-stage nav with `aria-current="step"` | VERIFIED | Lines 49: `aria-current="step"` on current stage; five STAGES constant |
| `src/renderer/wizard/ReviewScreen.tsx` | `ReviewScreen`, `computePlannedActions`, `PlannedGroupAction` exports | VERIFIED | Lines 57, 65/73, 109 — all exported; uses `useGroupsStore` + `removalActions.startRemoval` |
| `src/renderer/wizard/reviewScreen.test.ts` | 12 passing tests (all mechanic branches + SAF-01 filters) | VERIFIED | 12/12 pass |
| `src/renderer/wizard/wizardStage.ts` | `getNextStage(stage, event)` + `WizardEvent` type | VERIFIED | Exists; complete switch table |
| `src/renderer/wizard/wizardStage.test.ts` | 10 real assertions (SAF-02 gate coverage) | VERIFIED | 10/10 pass |
| `src/renderer/shell/AppShell.tsx` | `wizardStage` state + `StepIndicator` + `ReviewScreen` conditional + severity IPC | VERIFIED | All present; `stage === 'review'` conditional rendering; `severityClient.getSeverity()` on mount |
| `src/renderer/groups/GroupsPane.tsx` | `onNavigateToReview` prop; FLOOD_WAIT subline; `summaryLineParts`; no `confirmOpen` | VERIFIED | Props interface lines 41–42; flood subline lines 306–310; `summaryLineParts` line 353; `confirmOpen` absent |
| `src/renderer/target/TargetCard.tsx` | `onTargetConfirmed?` prop wired to confirm button | VERIFIED | Lines 72, 255 |
| `src/renderer/removal/removalCopy.ts` | `summaryLineParts` function | VERIFIED | Line 130 |
| `src/renderer/removal/ResumeJobDialog.tsx` | `onResume?` prop called after startRemoval | VERIFIED | Lines 24, 49 |
| `src/renderer/removal/RemovalConfirmDialog.tsx` | DELETED (retired) | VERIFIED | File does not exist |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `AppShell.tsx` | `ReviewScreen.tsx` | `stage === 'review'` conditional | WIRED | Line 85: `{stage === 'review' ? <ReviewScreen ...>` |
| `AppShell.tsx` | `severityClient.ts` | `getSeverity()` on mount + `setSeverity` on change | WIRED | Lines 42, 47 |
| `AppShell.tsx` | `wizardStage.ts` | `getNextStage` — header comment claims import, no runtime import | PARTIAL | `wizardStage.ts` header says "Imported by AppShell" but no `import` statement in AppShell; `setStage()` calls are raw. The 10 SAF-02 tests are real but test a function the app never calls (WR-08 from code review). Transitions still work correctly via explicit `setStage()`. |
| `GroupsPane.tsx` | `AppShell wizardStage` | `props.onNavigateToReview()` callback | WIRED | Line 492 |
| `TargetCard.tsx` | `AppShell wizardStage` | `props.onTargetConfirmed?.()` after `confirmTarget()` | WIRED | Line 255 |
| `ResumeJobDialog.tsx` | `AppShell wizardStage` | `props.onResume?.()` after `startRemoval` | WIRED | Line 49 |
| `main/index.ts` | `RemovalExecutor._handleGovernorEvent` | `executorRef?._handleGovernorEvent(event)` | WIRED | Lines 148–162, 287 |
| `ReviewScreen.tsx` | `groupsStore.ts` | `useGroupsStore()` for `dialogs + checkedDialogIds` | WIRED | Line 115 |
| `ReviewScreen.tsx` | `removalStore.ts` | `removalActions.startRemoval(severity, ids)` | WIRED | Line 162 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ReviewScreen.tsx` | `dialogs` | `useGroupsStore()` → Phase 4 group enumeration IPC | Yes — real `AdminDialogDTO[]` from main-process scan | FLOWING |
| `ReviewScreen.tsx` | `targetId` / `targetName` | `useTargetStore()` `confirmed` step — Phase 3 resolver | Yes — numeric ID from GramJS entity resolution | FLOWING |
| `GroupsPane.tsx` | `floodWaitRemaining` | `useRemovalStore()` → `_handleGovernorEvent` → governor `flood-tick` events | Yes — real governor events from GramJS FLOOD_WAIT | FLOWING (untestable live; governor wiring confirmed by code inspection) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| reviewScreen tests — all mechanic derivation branches | `npx vitest run src/renderer/wizard/reviewScreen.test.ts` | 12/12 pass | PASS |
| wizardStage tests — SAF-02 gate transitions | `npx vitest run src/renderer/wizard/wizardStage.test.ts` | 10/10 pass | PASS |
| Full test suite | `npx vitest run` (with .env) | 250/250 pass | PASS |
| TypeScript compilation | `npx tsc --build --force` | Exit 0, no output | PASS |
| `RemovalConfirmDialog.tsx` absent (single gate) | `ls src/renderer/removal/RemovalConfirmDialog.tsx` | `No such file or directory` | PASS |
| FLOOD_WAIT subline present in GroupsPane | `grep "floodWaitRemaining" GroupsPane.tsx` | Lines 306–310 found | PASS |

### Probe Execution

No probe scripts defined for this phase.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SAF-01 | 06-01, 06-02, 06-03, 06-04, 06-05 | Final review screen shows target identity (numeric ID) + exact affected groups | SATISFIED | `ReviewScreen.tsx` identity block with `.text-mono` ID; `computePlannedActions` group list; human UAT test 4 approved |
| SAF-02 | 06-01, 06-02, 06-03, 06-04, 06-05 | One explicit confirmation required before execution | SATISFIED | Single confirm gate: `RemovalConfirmDialog` deleted; only `ReviewScreen.handleConfirm` calls `startRemoval`; human UAT test 5 approved; 10 `getNextStage` tests pass |
| SAF-03 | 06-01, 06-02, 06-03, 06-04, 06-05 | Dry-run preview reports what would happen without performing removal | SATISFIED | `computePlannedActions` derives mechanic/warning per group; Review screen renders preview before any action; 12 unit tests pass; human UAT test 3/4 approved |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/renderer/shell/AppShell.tsx` | 55 | `useState(!!pendingJob)` — race condition: pendingJob is null on first render; dialog never opens on restart | Warning | Resume-after-restart UI flow (CR-01 from code review) — NOT part of SAF-01/02/03 first-run wizard |
| `src/renderer/removal/ResumeJobDialog.tsx` | 37 | `remainingDialogIds` filter excludes only ids absent from outcomes entirely; 'skipped' outcomes treated as processed | Warning | Resume button no-ops for explicitly-stopped jobs (CR-03) — NOT part of first-run wizard SAF goals |
| `src/renderer/wizard/wizardStage.ts` | 1–4 | Header comment claims "Imported by AppShell" — false; no production code imports this module | Info | Tests assert behaviour of dead code (WR-08); transitions are correct via explicit `setStage()` calls, not gated by this function |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-modified files.

### Human Verification Required

The four SAF-01/02/03 roadmap success criteria are all VERIFIED by automated tests plus a completed human UAT sign-off in `06-05-SUMMARY.md`. The items below concern the **resume-after-restart flow** which is a separate operational path. They are surfaced as human-needed because the code review (06-REVIEW.md) found two defects (CR-01 and CR-03) in that path, and the question of whether those defects block the phase goal must have a human decision.

#### 1. CR-01 — ResumeJobDialog opens on launch when a pending job exists

**Test:** Restart the app with an incomplete removal job on disk (job `status: running` or `stopped` in the audit file). Does the ResumeJobDialog appear automatically?
**Expected:** Dialog appears on launch, giving the admin the Resume/Discard choice.
**Why human:** `useState(!!pendingJob)` evaluates once at render time when `pendingJob` is still null (async bootstrap). The CR-01 fix (a `useEffect` to set `resumeOpen` when `pendingJob` arrives) was not applied. Whether the dialog ever appears depends on whether `pendingJob` is populated before or after the first render — non-deterministic without observing the running app.

#### 2. CR-03 — Resume button works for a user-stopped job

**Test:** Stop a removal mid-run (click Stop), then relaunch the app. When the ResumeJobDialog appears (assuming CR-01 is fixed or was already working), click Resume. Does removal start for the previously-skipped groups?
**Expected:** Resume starts removal of groups not yet successfully processed.
**Why human:** `remainingDialogIds` filters only ids absent from `job.outcomes` entirely. Because `abortExecution()` checkpoints all unprocessed groups as `status: 'skipped'`, every group has an outcomes entry after a stop. `remainingDialogIds` is `[]`, `startRemoval(severity, [])` is rejected by Zod `min(1)`, and the dialog closes silently — Resume is a no-op. This needs human confirmation to assess whether it's observable vs caught by some other path.

### Gaps Summary

No gaps blocking the phase goal. All four roadmap success criteria (SAF-01/02/03 + progress/report) are verified by automated tests and human UAT sign-off. The two human-needed items (CR-01, CR-03) concern the resume-after-restart flow which is a secondary operational path distinct from the first-run wizard goal. The code review explicitly documented these as defects; the question for the human is whether to fix them before Phase 7 or defer.

**WR-08 note:** `wizardStage.ts`/`getNextStage` is not imported by any production code — the SAF-02 tests assert a pure function that the running app does not execute. Stage transitions are correct (human-verified), but the automated SAF-02 test coverage is formally testing dead code. This is a test-coverage gap, not a functional gap in the wizard.

---

_Verified: 2026-06-12T18:21:32Z_
_Verifier: Claude (gsd-verifier)_
