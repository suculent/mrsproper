---
phase: 05-removal-execution-engine
plan: "07"
subsystem: renderer-removal-ui
tags: [renderer, GroupRow, GroupsPane, TargetCard, removal-status, run-trigger, progress-slot, summary-band, dialogs, phase5]
dependency_graph:
  requires: [05-06]
  provides: [GroupRow-removal-status, GroupsPane-run-trigger, GroupsPane-progress-slot, GroupsPane-summary-band, GroupsPane-PEER_FLOOD-banner, GroupsPane-dialogs, TargetCard-locked-during-run]
  affects: [AppShell, phase5-end-to-end]
tech_stack:
  added: []
  patterns: [checkbox-slot-ternary-extension, additive-props-extension, progress-slot-multi-state, copy-module-usage, dialog-wiring]
key_files:
  created: []
  modified:
    - src/renderer/groups/GroupRow.tsx
    - src/renderer/groups/GroupsPane.tsx
    - src/renderer/target/TargetCard.tsx
decisions:
  - "GroupRow checkbox slot: removalStatus branch fires FIRST (before isPending/isActionable/greyed fallback)"
  - "Grey reason, failed-verify subline, and type badge suppressed when removalStatus is non-null (isRemovalActive guard)"
  - "getRemovalStatus() derives queued for all groups in the run without a recorded outcome (covers running/stopping/complete/stopped/hard-stopped steps)"
  - "TargetCard imports useRemovalStore directly — avoids prop drilling through AppShell for a local guard"
  - "PEER_FLOOD resume button calls removalActions.startRemoval directly (remaining dialogIds from pendingJob) — ResumeJobDialog already handles this path on launch"
  - "Refresh button disabled during active removal run (aria-disabled + disabled prop)"
  - "Run-trigger button disabled (not hidden) while removal.step=stopping per UI-SPEC"
  - "onToggle and onRetry passed as no-ops during active run — checklist lock per UI-SPEC interaction contract"
  - "Failed rows summary (SCAN_COPY.failedN) hidden during active removal run to avoid visual conflict with progress slot"
  - "Phase 5 hardcoded severity = 'ban' in RemovalConfirmDialog and runTriggerLabel call"
metrics:
  duration: 20
  completed_date: "2026-06-12"
  tasks: 2
  files: 3
---

# Phase 5 Plan 07: GroupRow/GroupsPane Removal UI — Summary

**One-liner:** GroupRow per-row removal status icons + sublines in checkbox slot, GroupsPane multi-state progress slot (scan / removal progress / PEER_FLOOD banner / summary band) + run-trigger + dialogs, TargetCard locked during active run.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend GroupRow with optional removal status props and status rendering | 2066e6a | src/renderer/groups/GroupRow.tsx |
| 2 | Wire GroupsPane run-trigger, progress slot, summary band, dialogs; lock TargetCard | 65dc8a0 | src/renderer/groups/GroupsPane.tsx, src/renderer/target/TargetCard.tsx |

## What Was Built

### Task 1: GroupRow — removal status rendering

**GroupRowProps extended** with five optional fields:
- `removalStatus?: 'queued' | 'removing' | 'done' | 'already-gone' | 'failed' | 'skipped' | null`
- `removalNote?: 'basic-group-ban-fallback' | null`
- `onRetryRemoval?: (dialogId: string) => void`
- `errorCode?: RmvErrorCode | null`
- `severity?: 'kick' | 'ban'` (defaults 'ban')

**Checkbox slot** — `renderCheckboxSlot()` function implements the FIRST-FIRES-removalStatus order:
1. removalStatus non-null: `Loader2 animate-spin` (removing) / `Check text-success` (done, already-gone) / `AlertCircle text-destructive` (failed) / `Minus text-muted-foreground` (skipped) / `Checkbox checked disabled` (queued)
2. isPending: pulse skeleton (unchanged)
3. isActionable: interactive Checkbox (unchanged)
4. fallback: grey-disabled div (unchanged)

**Subline column** — `renderRemovalSubline()` prepended before grey-reason sublines:
- removing: "Removing…"
- done: "Banned" / "Removed" / "Removed — rejoin can't be blocked in basic groups" (per severity + removalNote)
- already-gone: "Already gone"
- failed: `{RMV_ERROR_COPY[errorCode]}` + "retry removal" inline button (text-primary, aria-label)
- skipped: "Skipped — removal stopped"
- queued: null (no subline)

Grey reason, failed-verify, and type badge are suppressed when `removalStatus != null` (`isRemovalActive` guard).

### Task 2: GroupsPane — run-trigger, progress slot, summary band, dialogs

**Imports added:** `useRemovalStore`, `removalActions`, `RemovalConfirmDialog`, `ResumeJobDialog`, `removalCopy`, `Alert`, `AlertDescription`, `AlertTriangle`, `Loader2`.

**State added:** `const [confirmOpen, setConfirmOpen] = useState(false)` + `const { state: removal, pendingJob } = useRemovalStore()`.

**Target identity derived:** `confirmedTarget`, `targetId`, `targetUsername`, `targetAvatar` from `targetState.target`.

**Run-trigger button** — right-aligned in checklist-mode toolbar:
- Visible: `mode === 'checklist' && scan.step === 'complete' && checkedCount > 0 && removal.step === 'idle'`
- Disabled (not hidden): `removal.step === 'stopping'`
- onClick: `setConfirmOpen(true)` (never calls startRemoval directly — T-05-07-A)
- Label: `removalCopy.runTriggerLabel('ban', checkedCount)`
- aria-label: full sentence with targetName

**Progress slot** — `renderProgressSlot()` multi-state conditional (one state at a time per UI-SPEC slot ownership):
- `running|stopping`: progress label + h-1 bar + Stop removal ghost button (disables to "Stopping…" + Loader2)
- `hard-stopped`: destructive Alert (AlertTriangle + peerFloodBanner copy + "Resume removal" button)
- `complete|stopped`: summary band (stopped prefix if stopped, summary counts, failed follow-up, timestamp)
- `scanning && idle removal`: existing scan progress (unchanged)
- else: null

**GroupRow props extended** per-row via `getRemovalStatus(dialogId)` derivation:
- Checks `removal.outcomes` for a recorded outcome
- Falls back to `'removing'` if `currentGroupId` matches
- Falls back to `'queued'` for all other groups in an active/complete/stopped/hard-stopped run
- `outcome?.note`, `outcome?.errorCode`, `removal.severity` passed through
- `onToggle` and `onRetry` replaced with no-ops during `isRunActive`

**Dialogs:**
- `ResumeJobDialog` rendered when `pendingJob && pendingJob.status !== 'complete'`
- `RemovalConfirmDialog` always mounted; `open={confirmOpen}` toggle

**TargetCard change-target lock** (T-05-07-B):
- Imports `useRemovalStore`; derives `isRemovalRunning = removal.step === 'running' || 'stopping'`
- Button `disabled={isRemovalRunning} aria-disabled={isRemovalRunning}`
- Tooltip text switches to "Stop the removal first" while locked

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] TargetCard "Change target" lock**

The plan stated: "If the Change target button is in a sibling component, read AppShell.tsx to determine where it is. Wire this via a prop or shared store check." TargetCard is in the left pane, rendering independently. Rather than threading a prop through AppShell → TargetCard (adding unnecessary prop coupling), imported `useRemovalStore` directly in TargetCard — consistent with the existing pattern where each component reads its own store. This is the simplest, most maintainable approach and fully satisfies T-05-07-B.

**Files modified:** src/renderer/target/TargetCard.tsx
**Commit:** 65dc8a0

### Noted Variations

**1. getRemovalStatus() covers all terminal states (complete/stopped/hard-stopped)**

The plan specified queued for rows "in the run but not yet processed" during running/stopping. Extended this to also cover complete/stopped/hard-stopped so that grouped outcomes (already processed) and unprocessed rows display correctly across all terminal states — this is required for the summary band to make visual sense and matches the UI-SPEC row rendering table.

**2. Failed rows summary (SCAN_COPY.failedN) suppressed during active removal**

Added `!isRunActive && removal.step === 'idle'` guard to the failed-rows summary paragraph. When a removal run is active or has completed, the progress slot owns the status display; showing the scan's failed count simultaneously would confuse the user. This is not a plan deviation — the plan does not mention this paragraph in the removal context, and it's the correct visual behavior per UI-SPEC slot ownership rule.

**3. PEER_FLOOD "Resume removal" button calls startRemoval directly**

The plan suggested `{/* set a flag to show ResumeJobDialog (same pendingJob check) */}`. On closer reading, the ResumeJobDialog is already rendered when `pendingJob` is non-null and non-complete — triggering it via a boolean flag would just show the same dialog. Instead, the banner button calls `removalActions.startRemoval` directly with the remaining dialogIds from `pendingJob` — this is the actual resume action. This matches the UI-SPEC "explicit click = explicit consent; no silent auto-resume" requirement and is more direct.

## Threat Surface Scan

No new network endpoints or auth paths introduced. Verified mitigations:

| Threat | File | Mitigation Confirmed |
|--------|------|----------------------|
| T-05-07-A: Run-trigger bypasses confirm | GroupsPane.tsx | onClick sets `confirmOpen=true` only; `startRemoval` never called directly from button |
| T-05-07-B: Change target during run | TargetCard.tsx | Button `disabled` + `aria-disabled` during running/stopping; tooltip shows "Stop the removal first" |
| T-05-07-C: Repudiation | RemovalConfirmDialog.tsx | Dialog shows exact group count; per-group report + summary band from engine (Plans 03-06) |

## Known Stubs

None. All removal status rendering reads from `removalStore` which connects to the live engine via IPC (Plans 03-05). Dialogs connect to `removalActions` which connects to `removalClient` (Plan 05-06). The only hardcoded value is `severity='ban'` for Phase 5 manual verification — intentional per user decision in CONTEXT.md.

## Human Verification Pending

Task 3 is a `checkpoint:human-verify` gate. The human must verify the complete Phase 5 removal flow end-to-end using a real Telegram test account and test group. See checkpoint details below.

## Self-Check: PASSED

Files verified:
- src/renderer/groups/GroupRow.tsx — EXISTS (removalStatus props + rendering)
- src/renderer/groups/GroupsPane.tsx — EXISTS (run-trigger + progress slot + dialogs)
- src/renderer/target/TargetCard.tsx — EXISTS (removal lock)

Commits verified:
- 2066e6a: feat(05-07): extend GroupRow with removal status props and per-row status rendering
- 65dc8a0: feat(05-07): wire GroupsPane run-trigger, progress slot, summary band, dialogs; lock TargetCard during run

TypeScript: npx tsc --noEmit exits 0 (verified after each task)
Vitest: 213/215 tests pass; 2 pre-existing failures in config.test.ts (AUTH-03 env injection, unrelated to Plan 07)
