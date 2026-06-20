---
phase: 12-renderer-action-picker-tag-input-results
plan: "03"
subsystem: renderer-wizard
tags: [tag-action, review-screen, tag-input, resume-dialog, tdd]
dependency_graph:
  requires: [12-01, 12-02]
  provides: [TagInput, TagResumeJobDialog, ReviewScreen-3way]
  affects: [AppShell, tagStore, tagValidation]
tech_stack:
  added: []
  patterns: [controlled-input-counter, tdd-red-green, tag-confirmation-chip, 3way-radiogroup]
key_files:
  created:
    - src/renderer/wizard/TagInput.tsx
    - src/renderer/removal/TagResumeJobDialog.tsx
  modified:
    - src/renderer/wizard/ReviewScreen.tsx
    - src/renderer/wizard/reviewScreen.test.ts
    - src/renderer/shell/AppShell.tsx
decisions:
  - "computeActionableTagCount exported from ReviewScreen as pure helper for unit-testable count derivation"
  - "AppShell minimally updated (severity→action, onSeverityChange→onActionChange) to fix TS2322 blocking error; full AppShell wiring deferred to Plan 04"
  - "TagInput uses React.RefObject<HTMLInputElement | null> (TS 5.9 / React 19 useRef typing)"
  - "t('actionGroupAria') used (no wizard: prefix) since t comes from useTranslation('wizard')"
metrics:
  duration: "5m 59s"
  completed_date: "2026-06-20"
  tasks_completed: 2
  files_changed: 5
---

# Phase 12 Plan 03: TagInput + TagResumeJobDialog + ReviewScreen 3-way Picker Summary

**One-liner:** TagInput with live counter + role=alert error, TagResumeJobDialog with variant=default resume, ReviewScreen extended to 3-way Kick/Ban/Tag picker with computeTagGroups confirmation list and tag string chip.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | TagInput.tsx + TagResumeJobDialog.tsx | be8904a | TagInput.tsx, TagResumeJobDialog.tsx |
| 2 (RED) | reviewScreen.test.ts — failing tests | a1db8e9 | reviewScreen.test.ts |
| 2 (GREEN) | ReviewScreen.tsx extension + fixes | 7359fdf | ReviewScreen.tsx, TagInput.tsx, AppShell.tsx |

## What Was Built

### Task 1: TagInput.tsx
- Controlled input with live `{value.length} / {TAG_MAX_LENGTH}` counter
- `<label htmlFor="tag-input-field">` with `role="alert"` inline error paragraph in left slot of counter row
- `error` prop typed as `TagInputError` from tagValidation.ts
- `inputRef?: React.RefObject<HTMLInputElement | null>` for focus management
- Error state: `border-destructive ring-destructive` on Input, `text-destructive` error text
- i18n keys: `tag:tagInputLabel`, `tag:tagInputPlaceholder`, `tag:tagErrorTooLong`, `tag:tagErrorControlChars`

### Task 1: TagResumeJobDialog.tsx
- Mirrors ResumeJobDialog.tsx exactly; `job: TagJobFileSafe` (no targetAccessHash)
- `useTranslation('tag')` namespace
- Resume button: `variant="default"` (non-destructive per UI-SPEC S-6 and T-12-08)
- Discard button: `variant="outline"` with `autoFocus` (safe default)
- `handleResume` calls `tagActions.startTag(job.tag, remainingDialogIds)`
- CR-04 pattern: `onOpenChange={() => {}}` — Escape/backdrop cannot silently discard
- Distinct aria IDs: `tag-resume-dialog-title`, `tag-resume-dialog-desc`

### Task 2: ReviewScreen.tsx (extended)
- New export: `computeActionableTagCount(tagGroupActions: TagGroupAction[]): number`
- Props renamed: `severity`/`onSeverityChange` → `action`/`onActionChange` (action: 'kick'|'ban'|'tag')
- Local state: `tagValue` (useState), `tagError` (derived via validateTagInput), `tagInputRef` (useRef)
- Two useEffects: reset tagValue when `action !== 'tag'` (T-12-06); focus tagInput when `action === 'tag'`
- Segmented radiogroup extended to 3-way: Kick | Ban | Tag (border-l separator on each)
- TagInput conditionally rendered inside the picker flex-col when `action === 'tag'`
- Tag string chip: `bg-secondary rounded-full px-2 py-0.5 text-mono` above picker when tagValue non-empty
- Consequence line: tag path uses `tT('tagConsequenceLine', { tag, count })`, removal paths unchanged
- Tag group list: `computeTagGroups(dialogs, checkedDialogIds, tT)` — includes basic-group with mechanic note
- `handleConfirm`: tag path → `tagActions.startTag(tagValue.trim(), actionableTagDialogIds.map(d=>d.id))`; kick/ban → `removalActions.startRemoval(action, ...)` unchanged
- Confirm button: `variant={action === 'tag' ? 'default' : 'destructive'}`
- Disabled guard: tag path requires `tagValue.trim() !== ''` AND `tagError === null` AND `actionableTagCount > 0`

### Task 2: reviewScreen.test.ts (extended)
- Added `computeActionableTagCount` import and 4 new test cases
- Tests: supergroup-only count=2, basic-group excluded (count=1), all-basic count=0, empty count=0
- All 16 tests pass (12 pre-existing computePlannedActions + 4 new computeActionableTagCount)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed cross-namespace t() call for actionGroupAria / tagGroupListAria**
- **Found during:** Task 2 implementation
- **Issue:** Used `t('wizard:actionGroupAria')` but `t` is from `useTranslation('wizard')`, making the namespace prefix invalid and failing TypeScript type check
- **Fix:** Changed to `t('actionGroupAria')` and `t('tagGroupListAria')` (no prefix, correct namespace)
- **Files modified:** src/renderer/wizard/ReviewScreen.tsx

**2. [Rule 1 - Bug] Fixed TagInput inputRef type for TypeScript 5.9 / React 19**
- **Found during:** Task 2 implementation (`npx tsc --build`)
- **Issue:** `useRef<HTMLInputElement>(null)` in TS 5.9 returns `RefObject<HTMLInputElement | null>`, but TagInput prop was typed as `RefObject<HTMLInputElement>`
- **Fix:** Updated TagInput `inputRef` prop to `React.RefObject<HTMLInputElement | null>`
- **Files modified:** src/renderer/wizard/TagInput.tsx

**3. [Rule 3 - Blocking] Minimal AppShell fix to resolve TS2322 blocking error**
- **Found during:** Task 2 — `npx tsc --build` failed on AppShell.tsx after ReviewScreen props renamed
- **Issue:** AppShell was passing `severity`/`onSeverityChange` to ReviewScreen but props renamed to `action`/`onActionChange`
- **Fix:** Minimal update: rename `severity` state to `action`, `handleSeverityChange` to `handleActionChange` (only persist kick/ban via severityClient); full AppShell wiring (useTagStore, TagResumeJobDialog, tag auto-advance) deferred to Plan 04 per original design
- **Files modified:** src/renderer/shell/AppShell.tsx

## Verification Results

```
npx vitest run src/renderer/wizard/reviewScreen.test.ts
  Tests: 16 passed (16)
  Files: 1 passed (1)

npx tsc --build → Exit 0 (no errors)
```

## Known Stubs

None — all components have real logic wired. TagInput validation uses validateTagInput; TagResumeJobDialog calls tagActions.startTag; ReviewScreen handleConfirm dispatches to both paths.

## Threat Flags

No new threat surfaces beyond the plan's threat model (T-12-05 through T-12-08 covered).

## Self-Check: PASSED
