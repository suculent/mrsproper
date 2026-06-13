---
phase: 05-removal-execution-engine
plan: "06"
subsystem: renderer-removal-layer
tags: [renderer, store, ipc-client, dialogs, copy-module, useSyncExternalStore, removal]
dependency_graph:
  requires: [05-05]
  provides: [removalStore, removalClient-verified, removalCopy, RemovalConfirmDialog, ResumeJobDialog]
  affects: [GroupsPane-run-trigger, GroupRow-removal-status]
tech_stack:
  added: []
  patterns: [useSyncExternalStore, ref-counted-subscription, module-level-state, copy-module, LogoutDialog-analog]
key_files:
  created:
    - src/renderer/store/removalStore.ts
    - src/renderer/removal/removalCopy.ts
    - src/renderer/removal/RemovalConfirmDialog.tsx
    - src/renderer/removal/ResumeJobDialog.tsx
  modified: []
decisions:
  - "removalClient.ts already created in Plan 05-05 — verified it matches the 7-method contract; skipped recreation"
  - "useRemovalStore returns { state, pendingJob } tuple — both values from same useSyncExternalStore snapshot for consistent rendering"
  - "getSnapshot/getServerSnapshot return object reference — stable because module-level state is replaced on each setState call"
  - "removalCopy.ts uses 'as const' on the removalCopy object for type-narrowing on string literal properties"
  - "ResumeJobDialog onOpenChange handler wired to handleDiscard — Esc key and overlay click = discard (safe direction per CONTEXT)"
metrics:
  duration: 8
  completed_date: "2026-06-12"
  tasks: 2
  files: 4
---

# Phase 5 Plan 06: Renderer Removal Layer — Store, Copy, Dialogs Summary

**One-liner:** removalStore with ref-counted useSyncExternalStore + pendingJob bootstrap, removalCopy module with all 16 string exports, and RemovalConfirmDialog/ResumeJobDialog matching the LogoutDialog pattern.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | removalClient.ts (verified) + removalStore.ts | d469296 | src/renderer/store/removalStore.ts |
| 2 | removalCopy.ts + RemovalConfirmDialog.tsx + ResumeJobDialog.tsx | e7dc675 | src/renderer/removal/removalCopy.ts, src/renderer/removal/RemovalConfirmDialog.tsx, src/renderer/removal/ResumeJobDialog.tsx |

## What Was Built

### Task 1: removalClient.ts verification + removalStore.ts

**removalClient.ts** was created by Plan 05-05 (confirmed in 05-05-SUMMARY.md). Verified the file exists at `src/renderer/ipc/removalClient.ts` and matches the 7-method contract from the plan: `startRemoval`, `abortRemoval`, `retryRemovalGroup`, `getRemovalState`, `onRemovalState`, `getRemovalJob`, `discardRemovalJob` — all delegate to `window.mrsproper.*`. No recreation needed.

**removalStore.ts** — mirrors `searchStore.ts` structure:

- Module-level state: `currentState: RemovalState` (idle default with severity/targetId/targetName/progress/outcomes) + `pendingJob: RemovalJobFile | null = null`
- Listener set + `notify()` + `setState()` pattern
- Ref-counted `startSubscriptions/stopSubscriptions`: subscribes to `onRemovalState` push events + bootstraps `getRemovalState()` (only applies if `currentState.step === 'idle'`); on first subscription also calls `getRemovalJob()` and sets `pendingJob` if `status !== 'complete'`
- `export function useRemovalStore()` returns `{ state: RemovalState; pendingJob: RemovalJobFile | null }` via `useSyncExternalStore`
- `export const removalActions`: `startRemoval`, `abortRemoval`, `retryGroup`, `discardJob` (discardJob sets `pendingJob = null` and calls `notify()` directly)

### Task 2: removalCopy.ts + RemovalConfirmDialog.tsx + ResumeJobDialog.tsx

**removalCopy.ts** exports:

- `RMV_ERROR_COPY: Record<RmvErrorCode, string>` — all 6 codes mapped to human-readable strings (T-05-06-C mitigation: no RPC codes exposed)
- `removalCopy` object with 16 string entries/functions: `confirmTitle`, `confirmDestructive`, `confirmNeutral`, `confirmDispatching`, `severityLine`, `runTriggerLabel`, `stopLabel`, `stoppingLabel`, `retryRowLabel`, `progressLabel`, `floodWaitSubline`, `resumeTitle`, `resumeBody`, `resumeDestructive`, `resumeNeutral`, `peerFloodBanner`, `peerFloodResumeLabel`, `rowStatus` (sub-object), `summaryLine`, `summaryFailed`, `summaryStopped`, `summaryTimestamp`
- All strings match UI-SPEC Copywriting Contract exactly. Both severity variants defined now; Phase 5 uses ban variant.

**RemovalConfirmDialog.tsx** — `LogoutDialog` analog:

- Props: `open`, `onOpenChange`, `severity`, `targetId`, `targetName`, `targetUsername`, `targetAvatar`, `dialogIds`
- Avatar helpers `getAvatarColor/bytesToDataUrl/getInitials` duplicated from GroupRow.tsx (intentional per PATTERNS.md)
- Identity block: 36px Avatar (AvatarImage from bytesToDataUrl, AvatarFallback with initials + AVATAR_COLORS[id % 7]), name `text-label font-semibold`, identity line `@username · ID {id}` in `font-mono text-label text-muted-foreground` (username omitted if null; ID always shown per TGT-03)
- DialogDescription with `severityLine(severity, n)` — `text-body text-muted-foreground`
- Footer: `Button variant="outline" autoFocus` (Keep them) + `Button variant="destructive"` with Loader2 spinner during dispatch
- `handleConfirm`: calls `removalActions.startRemoval(severity, dialogIds)`, closes dialog
- `handleClose`: guards `isDispatching`

**ResumeJobDialog.tsx** — `LogoutDialog` analog:

- Props: `open`, `onOpenChange`, `job: RemovalJobFile`
- Computes `processedCount = job.outcomes.length`, `totalCount = job.dialogIds.length`, `remainingDialogIds = job.dialogIds.filter(id => !job.outcomes.find(o => o.dialogId === id))`
- Title: `resumeTitle(job.targetName)`, Description: `resumeBody(processedCount, totalCount)`
- Footer: `Button variant="outline" autoFocus` (Discard job) + `Button variant="destructive"` (Resume removal)
- `handleDiscard`: `removalActions.discardJob()`, close; `handleResume`: `removalActions.startRemoval(job.severity, remainingDialogIds)`, close
- `onOpenChange` wired to `handleDiscard` — Esc/overlay = discard (safe direction per CONTEXT)

## Deviations from Plan

### Auto-fixed Issues

None.

### Noted Variations

**1. removalClient.ts — verified, not recreated**

The plan note stated "a prior wave's executor may have already created src/renderer/ipc/removalClient.ts — if it exists and matches the plan's contract, skip recreating it and verify it instead." The file existed and matched all 7 required methods exactly. Task 1 commit only includes `removalStore.ts`.

**2. ResumeJobDialog onOpenChange = handleDiscard**

The plan's action spec does not specify what happens when user presses Esc or clicks the overlay. Wired `onOpenChange` to `handleDiscard` — closing without an explicit choice defaults to the safe action (discard = no destructive resume triggered silently). Consistent with the UI-SPEC: "no silent auto-resume."

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. T-05-06-A mitigation confirmed: `RemovalConfirmDialog` calls `removalActions.startRemoval` — the IPC path enforces three-layer security gates in the main process (auth gate + dialog-map validation from Plan 05-05). T-05-06-C mitigation confirmed: `RMV_ERROR_COPY` maps all 6 error codes to human-readable strings; no raw Telegram RPC codes exposed in UI.

## Known Stubs

None. All string exports are wired. Both dialogs connect to `removalActions` which connects to `removalClient` which connects to the preload bridge from Plan 05-05.

## Self-Check: PASSED

Files verified:
- src/renderer/ipc/removalClient.ts — EXISTS (7 methods matching contract)
- src/renderer/store/removalStore.ts — EXISTS
- src/renderer/removal/removalCopy.ts — EXISTS
- src/renderer/removal/RemovalConfirmDialog.tsx — EXISTS
- src/renderer/removal/ResumeJobDialog.tsx — EXISTS

Commits verified:
- d469296: feat(05-06): implement removalStore.ts with useRemovalStore hook and removalActions
- e7dc675: feat(05-06): add removalCopy.ts, RemovalConfirmDialog, ResumeJobDialog

TypeScript: npx tsc --noEmit exits 0 (verified after each task)
