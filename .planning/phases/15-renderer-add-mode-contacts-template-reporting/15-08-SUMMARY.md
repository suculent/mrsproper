---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 08
subsystem: ui
tags: [react, groups-pane, add-mode, clipboard, i18next]

# Dependency graph
requires:
  - phase: 15-renderer-add-mode-contacts-template-reporting (Plan 04)
    provides: "add i18n namespace (rowStatus/rowError/rowNote/retry*/queuedAddAria keys) + groups.json greyReason.* keys for the four AddGreyReason values (shipped Phase 13)"
  - phase: 15-renderer-add-mode-contacts-template-reporting (Plan 06)
    provides: "clipboardClient.writeClipboardText(text) typed IPC wrapper over the main-process CLIPBOARD_WRITE_TEXT handler"
provides:
  - "GroupRow.tsx addStatus/addErrorCode/addLink/premiumWouldAllow/onRetryAdd props — the full per-row Add-mode rendering contract (checkbox-slot icon + subline) for every AddGroupOutcome status plus queued/adding transient states"
affects: [15-09 (GroupsPane wires real addStore outcomes + retryGroup into these new props)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Add-mode checkbox-slot/subline branches cloned from the shipped tagStatus/removalStatus parallel-prop structure in GroupRow.tsx — addStatus checked alongside, never overlapping, removalStatus/tagStatus"
    - "Transient per-row 'Copied!' label swap via local useState + setTimeout(2000) — no toast system exists in this app, so the Copy button's own label swaps temporarily"

key-files:
  created: []
  modified:
    - src/renderer/groups/GroupRow.tsx

key-decisions:
  - "addGreyReason rendering is an unconditional sibling branch gated only by `addGreyReason != null && greyReason == null` (no new boolean prop) — mutual exclusivity is enforced by Plan 15-09 only ever populating one of the two fields' active-mode context, not by a flag on GroupRow itself"
  - "Split Task 1 (props extension + checkbox-slot branch) and Task 2 (subline rendering) into two commits by reverting to HEAD and re-applying each task's exact diff in isolation, since TypeScript's noUnusedLocals flags Task 1's new props/imports as unused until Task 2 consumes them — both tasks were implemented together to get a compiling file, then split for atomic per-task commits"

requirements-completed: [ADD-13]

# Metrics
duration: 25min
completed: 2026-10-04
---

# Phase 15 Plan 08: GroupRow Add-Mode Rendering Contract Summary

**Extended `GroupRow.tsx` with the Add-mode equivalent of its existing `tagStatus`/`removalStatus` parallel-prop structure — a new `addStatus` checkbox-slot branch (adding/done/already-member/privacy-blocked/failed/skipped/queued) and a new `renderAddSubline()` covering the Copy-link button with transient "Copied!" feedback, the Premium hint, the per-group retry link on failed rows, the D-06 banned-but-actionable note, and the D-08 `addGreyReason` line.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files modified:** 1

## Accomplishments
- `GroupRowProps` extended with `addStatus`, `addErrorCode`, `addLink`, `premiumWouldAllow`, `onRetryAdd` — GroupRow remains purely props-driven, no store import added
- `renderCheckboxSlot()` gained an `addStatus != null` branch with the exact UI-SPEC icon mapping: `adding` → spinning `Loader2`, `done`/`already-member`/`privacy-blocked` → success-toned `Check`, `failed` → `AlertCircle`, `skipped` → `Minus`, `queued` → checked+disabled `Checkbox`
- `isRemovalActive` now also folds in `addStatus != null` so an active Add row disables toggle interactions
- New `renderAddSubline()` renders every Add-mode subline variant: `privacy-blocked` shows `rowStatus.linkCreated` + an icon-only ghost `Copy` button (`sr-only` label from `rowStatus.copyLink`) that calls `clipboardClient.writeClipboardText(addLink ?? '')` then shows `rowStatus.linkCopied` for ~2s via local `useState`/`setTimeout`; when `premiumWouldAllow` is true a second subline renders `rowStatus.premiumHint`; `failed` clones `renderRemovalSubline`'s destructive-text + underlined retry-button markup, wired to the new `onRetryAdd` prop
- D-06 banned-but-actionable note (`rowNote.bannedWillUnban`) renders under the title — without the row's `opacity-50` grey treatment — only when `addStatus == null`, `membershipStatus === 'banned'`, and `dialog.canAdd` is true
- D-08 `addGreyReason` line reuses the already-shipped `groups:greyReason.*` keys (`already-member`/`no-invite-right`/`channel-full`/`banned-no-unban-right`), rendered as a sibling branch mutually exclusive with the existing Remove/Tag `greyReason` branch

## Task Commits

Each task was committed atomically:

1. **Task 1: addStatus checkbox-slot branch + GroupRowProps extension** - `a46fadb` (feat)
2. **Task 2: Add-mode subline — privacy-blocked Copy button, Premium hint, failed retry, banned note, addGreyReason** - `8399971` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/renderer/groups/GroupRow.tsx` - Added the full Add-mode checkbox-slot icon branch and subline rendering contract (addStatus/addErrorCode/addLink/premiumWouldAllow/onRetryAdd props, renderAddSubline, banned note, addGreyReason line)

## Decisions Made
- Task ordering required implementing both tasks' code together first (TypeScript's `noUnusedLocals` rejects Task 1's new props/imports as unused until Task 2's `renderAddSubline` consumes them), then splitting the single working file into two commits by reverting to HEAD and re-applying each task's exact diff — both commits compile and pass `tsc --build` independently
- `addGreyReason` branch uses no new boolean prop; mutual exclusivity with the existing `greyReason` branch is structural (`addGreyReason != null && greyReason == null`), matching the plan's explicit guidance not to introduce an `isAddModeRow` flag

## Deviations from Plan

None — plan executed exactly as written. The task-split-via-revert-and-reapply technique (documented above) was a commit-mechanics adaptation, not a code deviation from the plan's specified behavior.

## Issues Encountered
- `npx tsc --build` emits a stray `GroupRow.d.ts`/`.d.ts.map` build artifact beside the source file on each run (not gitignored, unlike the `.jsx`/`.js` emission which is covered by `src/**/*.jsx` in `.gitignore`); deleted after each verification pass per the project's tsc-no-op-pitfall convention. No code change needed — purely a local build-output cleanup step.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- GroupRow's per-row Add-mode rendering contract is complete: Plan 15-09 (GroupsPane) can now pass real `addStore` outcomes (status/errorCode/link/premiumWouldAllow) and wire `addActions.retryGroup` into `onRetryAdd` with zero further changes to GroupRow
- No blockers identified

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*

## Self-Check: PASSED

- FOUND: src/renderer/groups/GroupRow.tsx
- FOUND: .planning/phases/15-renderer-add-mode-contacts-template-reporting/15-08-SUMMARY.md
- FOUND commit: a46fadb (Task 1)
- FOUND commit: 8399971 (Task 2)
- FOUND commit: 284ba12 (SUMMARY.md)
