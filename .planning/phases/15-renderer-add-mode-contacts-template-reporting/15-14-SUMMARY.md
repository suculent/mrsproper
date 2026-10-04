---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 14
subsystem: ui
tags: [react, vitest, add-mode, group-checklist, i18n]

# Dependency graph
requires:
  - phase: 15-renderer-add-mode-contacts-template-reporting
    provides: GroupRow.tsx CR-01/CR-02 mode-aware checkbox actionability, groupsStore.ts recomputeCheckedForMode mode-switch rebuild
provides:
  - "GroupRow.tsx: mode-aware isGreyedVisual/addGreyReasonKey so Add-mode wrapper opacity, type badge, and grey-reason caption follow the same mode-aware isActionable the checkbox already used"
  - "groupsStore.ts: _activeMode module variable fixes the latent first-scan-complete hardcoded-'remove' bug"
  - "GroupRow.test.tsx: first component-level test file in the renderer, establishing the react-dom/server + raw-i18n-key pattern for future component tests"
affects: [renderer-add-mode-uat, groups-checklist]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Component rendering tests via renderToStaticMarkup (react-dom/server) under vitest environment:'node' — no jsdom needed, no i18next instance, assert on raw i18n keys"
    - "Class-token-aware / HTML-attribute-aware test helpers (getWrapperClasses, getAllClassTokens, hasDisabledAttribute) instead of broad toContain substring checks, to avoid false positives from a UI library's own static Tailwind variant classes"

key-files:
  created:
    - src/renderer/groups/GroupRow.test.tsx
  modified:
    - vitest.config.ts
    - src/renderer/groups/GroupRow.tsx
    - src/renderer/store/groupsStore.ts
    - src/renderer/store/groupsStore.test.ts

key-decisions:
  - "isGreyedVisual reuses the already mode-aware isActionable const for Add mode (!isActionable && !isPending && !isFailed), and falls back to the byte-identical !dialog.canAct expression for every other mode, guaranteeing zero Remove/Tag rendering change"
  - "addGreyReasonKey derives 'already-member' in the renderer from membershipStatus === 'member', since GroupEnumerator never assigns that AddGreyReason value at enumeration time"
  - "Dropped the old 'dialog.greyReason == null' precondition on the Add-mode caption — it made the Add reason unreachable on every broadcast channel (which always carries a Remove greyReason)"
  - "groupsStore._activeMode is written only inside recomputeCheckedForMode (the sole call site that ever changes the active mode), avoiding any new call sites"

requirements-completed: [ADD-05]

# Metrics
duration: 18min
completed: 2026-10-04
---

# Phase 15 Plan 14: Add-mode mode-aware grey rendering (gap closure) Summary

**GroupRow.tsx's grey-visual treatment (wrapper opacity, type badge, grey-reason caption) now follows the same mode-aware `isActionable` predicate the checkbox already used, instead of the Remove-only `dialog.canAct` flag — closing the UAT gap where a checked, actionable Add-mode row rendered as if disabled.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-04T15:00:00Z
- **Completed:** 2026-10-04T15:18:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Fixed the two diagnosed UAT gaps (add-mode-acts-on-unchecked-group.md, add-mode-shows-remove-grey-reason.md) in one coherent change: `isGreyedVisual` and `addGreyReasonKey` derived consts in `GroupRow.tsx` now gate the wrapper `opacity-50` class, the type badge, and the grey-reason caption on mode-aware actionability instead of the Remove-only `canAct`/`greyReason` fields.
- Fixed the latent `groupsStore.ts` bug where the first scan-complete pre-check rebuild hardcoded the Remove partition rule (`isActionableForMode(d, status, 'remove')`) regardless of which mode was actually active, via a new `_activeMode` module variable set inside `recomputeCheckedForMode`.
- Added the renderer's first component-level test file (`GroupRow.test.tsx`), proving via `react-dom/server` static rendering that Add-mode actionable rows render fully visible/checked/interactive, non-actionable rows show the correct Add-specific (or renderer-derived "already a member") reason, and Remove/Tag-mode rendering is byte-identical to pre-fix behavior (regression case).
- Added a `groupsStore.test.ts` case proving the first-completion rebuild uses the Add rule when Add mode was already active during scanning — directly guarding must_haves truth #5.

## Task Commits

Each task was committed atomically:

1. **Task 1: Enable .tsx vitest coverage and write the failing GroupRow regression test** - `b95350a` (test)
2. **Task 2: Fix GroupRow.tsx mode-aware grey rendering and groupsStore.ts's hardcoded first-complete mode** - `e143ebb` (feat)

_Note: Task 2's commit also includes a test-only fix to GroupRow.test.tsx (see Deviations) — the plan's `<files>` list for Task 2 only named GroupRow.tsx/groupsStore.ts, but the fix was required to make the task's own verification pass and is scoped entirely to the test file written in Task 1._

## Files Created/Modified

- `vitest.config.ts` - Widened `include` glob to `['src/**/*.test.ts', 'src/**/*.test.tsx']`; no other config changed
- `src/renderer/groups/GroupRow.test.tsx` - New: 4 cases covering the two Add-mode fixes + 1 Remove-mode regression guard
- `src/renderer/groups/GroupRow.tsx` - `isGreyedVisual`/`addGreyReasonKey` derived consts; wrapper opacity, Remove caption, Add caption, and type badge conditions all updated to be mode-aware
- `src/renderer/store/groupsStore.ts` - `_activeMode` module variable, set in `recomputeCheckedForMode`, consumed by the first-scan-complete rebuild
- `src/renderer/store/groupsStore.test.ts` - New case: first-complete rebuild while Add mode is already active uses the Add rule

## Decisions Made

- See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GroupRow.test.tsx's broad substring assertions false-positived against the Checkbox component's own static Tailwind classes**
- **Found during:** Task 2 (running the plan's verify command after the GroupRow.tsx fix)
- **Issue:** Task 1's test used `expect(html).not.toContain('opacity-50')` / `'disabled'` / `'cursor-not-allowed'` against the *entire* rendered markup. The actionable row's live `@radix-ui/react-checkbox`-based `Checkbox` component always carries the static Tailwind variant classes `disabled:opacity-50` and `disabled:cursor-not-allowed` in its className (regardless of whether it is actually disabled), so these broad substring checks failed even though the production fix was correct — the wrapper `<div>` itself correctly had no `opacity-50` class and the checkbox had no real `disabled` attribute.
- **Fix:** Added three precise helpers to the test file: `getWrapperClasses(html)` (extracts and splits only the outermost wrapper div's class attribute), `getAllClassTokens(html)` (flattens every `class="..."` attribute's tokens for exact-token comparison, distinguishing the literal `cursor-not-allowed` token used only by the true non-actionable fallback div from the unrelated `disabled:cursor-not-allowed` variant token), and `hasDisabledAttribute(html)` (regex `/\sdisabled(=|\s|>)/` matching only a real HTML `disabled` attribute, not `aria-disabled` or the `disabled:` class-variant prefix). Updated Cases 1, 3, and 4's opacity-50 assertions and Case 1's disabled/cursor-not-allowed assertions to use these helpers.
- **Files modified:** `src/renderer/groups/GroupRow.test.tsx`
- **Verification:** All 4 GroupRow.test.tsx cases pass; re-verified the helpers correctly distinguish the true fallback div (Case 2's channel, which legitimately has `cursor-not-allowed` as a standalone token and no live checkbox) from the live-checkbox actionable rows.
- **Committed in:** `e143ebb` (Task 2 commit — test-file fix bundled with the production fix it was verifying)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test-assertion precision fix only; no production behavior or scope change. The plan's intended fix (GroupRow.tsx, groupsStore.ts) was implemented exactly as specified.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both diagnosed UAT gaps from Test 4 (15-UAT.md) are closed with regression coverage; Remove/Tag-mode rendering is provably unchanged.
- Full `npx vitest run`: 590/592 passing. The 2 failing tests (`src/main/telegram/config.test.ts`, AUTH-03) are pre-existing and unrelated — they depend on local `.env` secrets (`MRSPROPER_API_ID`/`MRSPROPER_API_HASH`) not present in this execution environment; confirmed failing identically on the pre-plan commit via `git stash`.
- Ready for a follow-up live UAT re-run of Test 4's exact scenario ("Bohemia-dětské pobyty" supergroup, "WixBotTest" channel) to human-confirm the visual fix.

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*
