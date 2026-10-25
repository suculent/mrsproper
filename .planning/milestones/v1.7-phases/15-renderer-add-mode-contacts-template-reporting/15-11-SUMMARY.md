---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 11
subsystem: ui
tags: [react, i18n, shadcn, checkbox, target-card, add-mode]

# Dependency graph
requires:
  - phase: 15-04
    provides: add i18n namespace (contactsCheckboxLabel, contactsFailedNotice keys)
  - phase: 15-05
    provides: targetStore's addToContactsChecked/contactAddAttempted/contactAddFailed state and toggleAddToContacts/maybeAddToContacts actions
provides:
  - "TargetCard.tsx's optional mode prop ('remove' | 'tag' | 'add', default 'remove') consumed by Plan 15-13's AppShell wiring"
  - "The rendered Add-to-contacts checkbox + quiet failure notice, visible only in Add mode"
  - "The confirm-time maybeAddToContacts() dispatch — D-09's first of two trigger points"
affects: ["15-13 (AppShell wiring passes the real mode value to TargetCard)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional prop with a behaviour-preserving default ('remove') lets a component accept a not-yet-wired cross-cutting prop without breaking existing call sites, until a later plan threads the real value through"

key-files:
  created: []
  modified:
    - src/renderer/target/TargetCard.tsx

key-decisions:
  - "Checkbox row is its own block above the existing footer row (not nested inside the !isConfirmed conditional) so it renders identically in both resolved and confirmed states, per D-08"
  - "Failure notice uses plain text (text-label text-muted-foreground), not an Alert component, matching D-10's 'quiet' requirement and the UI-SPEC's explicit instruction against Alert for this element"

patterns-established: []

requirements-completed: [ADD-05]

# Metrics
duration: 8min
completed: 2026-10-04
---

# Phase 15 Plan 11: TargetCard Add-to-Contacts Checkbox Summary

**TargetCard.tsx gains an optional `mode` prop (default `'remove'`), a pre-checked "Add to contacts" checkbox with a quiet failure notice shown only in Add mode, and a confirm-time `maybeAddToContacts()` dispatch — all additive and backward-compatible with AppShell's current unmodified call site.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-04T01:03:00Z (approx.)
- **Completed:** 2026-10-04T01:07:32Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- `TargetCardProps` gained an optional `mode?: 'remove' | 'tag' | 'add'` field, read once as `const mode = props.mode ?? 'remove'`, keeping AppShell's existing call site (which doesn't pass `mode` until Plan 15-13) compiling and behaviorally unchanged
- A new row renders a pre-checked `Checkbox` + `Label` pair (`add:contactsCheckboxLabel`) directly above the existing footer, visible only while `mode === 'add'`, in both resolved and confirmed states (D-08)
- When `contactAddFailed` is true, a quiet inline `add:contactsFailedNotice` notice renders directly below the checkbox using plain `text-label text-muted-foreground` styling, not an `Alert` (D-10)
- The confirm button's `onClick` now awaits `targetActions.confirmTarget()`, then — only when `mode === 'add'` — awaits `targetActions.maybeAddToContacts()` before calling `props.onTargetConfirmed?.()`, implementing D-09's first trigger point

## Task Commits

Each task was committed atomically:

1. **Task 1: mode prop + Add-to-contacts checkbox + failure notice** - `5445020` (feat)

_No TDD split — single `type="auto"` content/wiring task, no `tdd="true"` flag._

## Files Created/Modified
- `src/renderer/target/TargetCard.tsx` - Added optional `mode` prop with `'remove'` default; imported `Checkbox`/`Label` and the `add` i18n namespace; destructured `addToContactsChecked`/`contactAddFailed` from `useTargetStore()`; inserted the Add-mode checkbox + failure-notice block; extended the confirm button's `onClick` to call `maybeAddToContacts()` when `mode === 'add'`

## Decisions Made
- Placed the checkbox block as a sibling before the footer `<div>` (not nested inside `{!isConfirmed && ...}`) so D-08's "both resolved and confirmed states" requirement holds without duplicating the block
- Kept the failure notice as plain text rather than wrapping it in the existing `Alert` component used for the no-photo notice, per the UI-SPEC's explicit "NOT an Alert component" instruction for this quiet, non-blocking element

## Deviations from Plan

None - plan executed exactly as written. All four acceptance-criteria greps and `npx tsc --build` (exit 0, `AppShell.tsx` unmodified) pass as specified.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `TargetCard.tsx` is ready for Plan 15-13 to pass the real `mode` value from `AppShell.tsx`'s mode-switch state; no further changes needed in this file for that wiring beyond adding the prop at the call site.
- Full suite verified green: 43 files / 568 tests (with `.env` sourced), matching the established baseline exactly. `npm run build` also succeeds.
- No blockers.

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*

## Self-Check: PASSED

`src/renderer/target/TargetCard.tsx` confirmed present on disk with the expected changes; commit `5445020` confirmed present in `git log`.
