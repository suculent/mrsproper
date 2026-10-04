---
phase: 15-renderer-add-mode-contacts-template-reporting
plan: 04
subsystem: ui
tags: [i18n, react-i18next, shadcn, tailwind, czech-plurals, textarea]

requires:
  - phase: 15-01
    provides: DM_TEMPLATE_MAX_LENGTH constant consumed by dmValidationTooLong wording
  - phase: 15-03
    provides: isActionableForMode / computeAddGroups / validateDmTemplate pure helpers that will drive these strings
provides:
  - "New `add` i18n namespace (en/cs) covering every string phase 15 introduces across sections 2-9 of 15-UI-SPEC.md"
  - "groups namespace modeSwitch.* / modeSwitchAria / modeSwitchDisabledTooltip keys (section 1)"
  - "Textarea shadcn-style primitive for the DM template editor"
affects: [15-05, 15-06, 15-07, 15-08, 15-09, 15-10, 15-11, 15-12, 15-13]

tech-stack:
  added: []
  patterns:
    - "add namespace mirrors tag.json's key style: flat labels, nested rowStatus/rowError/summaryPart/mechanicNote/rowNote objects"
    - "English plurals use only _one/_other; Czech plurals use _one/_few/_other wherever {{count}} appears"

key-files:
  created:
    - src/renderer/components/ui/textarea.tsx
    - src/renderer/i18n/locales/en/add.json
    - src/renderer/i18n/locales/cs/add.json
  modified:
    - src/renderer/i18n/locales/en/groups.json
    - src/renderer/i18n/locales/cs/groups.json
    - src/renderer/i18n/index.ts
    - src/renderer/i18n/i18n.test.ts

key-decisions:
  - "Backticks around `{name}`/`{links}` in dmPlaceholderLegend* and dmValidation* strings copied verbatim from the UI-SPEC's Full Phase Copy table, including the literal backtick characters"
  - "i18next.d.ts required zero edits — CustomTypeOptions.resources is structurally typed from resources['en'], confirmed by a clean tsc --build after registering the add namespace"

patterns-established:
  - "Pattern: new feature namespaces register in exactly 3 places (index.ts import + resources.en/cs entry, i18n.test.ts NAMESPACES array) — no 4th i18next.d.ts edit needed since the type is structural"

requirements-completed: [ADD-15, ADD-01]

duration: 12min
completed: 2026-10-04
---

# Phase 15 Plan 04: Add i18n Namespace, modeSwitch Keys & Textarea Primitive Summary

**New `add` i18n namespace (74 keys, en+cs) covering every string phase 15 needs, plus `groups.json` modeSwitch keys and a shadcn-style Textarea primitive — all other Phase 15 UI plans now translate directly against these verbatim UI-SPEC strings.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-04T00:50:55Z (approx.)
- **Completed:** 2026-10-04T00:51:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 8 (3 created, 5 modified — includes the 2 pre-existing groups.json files)

## Accomplishments
- `en/add.json` and `cs/add.json` created with every string from 15-UI-SPEC.md sections 2 through 9, copied verbatim (formal vykání, correct plural suffixes: `_one`/`_other` for English, `_one`/`_few`/`_other` for Czech)
- `groups.json` (en + cs) gained the five `modeSwitch.*` / `modeSwitchAria` / `modeSwitchDisabledTooltip` keys from section 1, alongside the existing (untouched) `greyReason`/`groupTypeLabel`/`groupError` keys
- `add` namespace registered in `i18n/index.ts` (static import + `resources.en.add`/`resources.cs.add`) and `i18n.test.ts`'s `NAMESPACES` array, so the existing completeness test now actually exercises it (closing 15-RESEARCH.md Pitfall 5)
- `src/renderer/components/ui/textarea.tsx` created as a same-pattern sibling to `input.tsx`, with `min-h-[120px]` replacing the fixed `h-10` height and the `file:*` classes dropped

## Task Commits

Each task was committed atomically:

1. **Task 1: Textarea primitive** - `55ab897` (feat)
2. **Task 2: en/add.json, cs/add.json, groups.json modeSwitch additions** - `d143422` (feat)
3. **Task 3: Register the add namespace in i18n/index.ts and i18n.test.ts** - `1eaf9f2` (feat)

_No TDD tasks in this plan — all three are `type="auto"` content/config tasks._

## Files Created/Modified
- `src/renderer/components/ui/textarea.tsx` - New shadcn-style Textarea primitive, `min-h-[120px]`, `React.forwardRef`
- `src/renderer/i18n/locales/en/add.json` - New `add` namespace, English, 74 top-level/nested keys
- `src/renderer/i18n/locales/cs/add.json` - New `add` namespace, Czech, formal vykání, 3-form plurals
- `src/renderer/i18n/locales/en/groups.json` - Added `modeSwitch.{remove,tag,add}`, `modeSwitchAria`, `modeSwitchDisabledTooltip`
- `src/renderer/i18n/locales/cs/groups.json` - Czech column of the same five keys
- `src/renderer/i18n/index.ts` - Static import + `resources.en.add`/`resources.cs.add` registration
- `src/renderer/i18n/i18n.test.ts` - `NAMESPACES` const gains `'add'`; test description updated

## Decisions Made
- Kept literal backtick characters in `dmPlaceholderLegendName`, `dmPlaceholderLegendLinks`, `dmValidationMissingLinks`, and `dmValidationEmpty`'s `{links}` reference, matching the UI-SPEC's Full Phase Copy table exactly (per the copy-verbatim instruction — not treated as markdown-only emphasis).
- Did not touch `i18next.d.ts` — verified via a clean `tsc --build` that `CustomTypeOptions.resources` picks up the new `add` key structurally through `(typeof resources)['en']`, exactly as the plan's interface notes predicted.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

`tsc --build` emitted stray `.js`/`.d.ts` files beside the edited sources (per the documented tsc-noop pitfall) after each verification run; deleted them before running Vitest and before each commit, per the project's established workaround. No code changes were needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The `add` namespace and `modeSwitch` keys are fully registered and verified (i18n completeness test passes with 8/8 green, full suite 42 files/559 tests green, matching the pre-existing baseline). `textarea.tsx` is ready for Plan 15-10's `DmTemplateEditor`. All downstream Phase 15 UI plans (ModeSwitch, GroupRow, TargetCard, ReviewScreen/DmTemplateEditor, GroupsPane run/report, SettingsMenu, AddResumeJobDialog) can now consume these exact key names without inventing wording. No blockers.

---
*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Completed: 2026-10-04*

## Self-Check: PASSED

All 8 created/modified files confirmed present on disk; all 4 commit hashes (55ab897, d143422, 1eaf9f2, c0669da) confirmed in `git log`.
