---
phase: 12-renderer-action-picker-tag-input-results
plan: "01"
subsystem: renderer-i18n-validation
tags: [tag-action, i18n, validation, wizard-stage, tdd]
dependency_graph:
  requires: []
  provides:
    - TAG_MAX_LENGTH constant (src/shared/tagConstants.ts)
    - validateTagInput pure function (src/renderer/wizard/tagValidation.ts)
    - computeTagGroups pure function (src/renderer/wizard/tagValidation.ts)
    - tag i18n namespace — en + cs (src/renderer/i18n/locales/{en,cs}/tag.json)
    - wizard namespace additions — actionGroupAria, tagSomeoneElse, tagGroupListAria
    - WizardEvent TAG_COMPLETE + TAG_STOPPED (src/renderer/wizard/wizardStage.ts)
  affects:
    - src/renderer/wizard/TagInput.tsx (will consume validateTagInput + TAG_MAX_LENGTH)
    - src/renderer/wizard/ReviewScreen.tsx (will consume computeTagGroups + tag namespace)
    - src/renderer/shell/AppShell.tsx (WizardEvent TAG_COMPLETE/TAG_STOPPED)
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN: failing test first; implementation passes all cases
    - Pure-function modules: no DOM, no React — node environment only
    - i18n 4-step registration: JSON file → static import → resources object → NAMESPACES gate
    - Czech 3-form plurals: _one (1), _few (2-4), _other (5+) + formal vykání
key_files:
  created:
    - src/shared/tagConstants.ts
    - src/renderer/wizard/tagValidation.ts
    - src/renderer/wizard/tagValidation.test.ts
    - src/renderer/i18n/locales/en/tag.json
    - src/renderer/i18n/locales/cs/tag.json
  modified:
    - src/renderer/wizard/wizardStage.ts
    - src/renderer/wizard/wizardStage.test.ts
    - src/renderer/i18n/index.ts
    - src/renderer/i18n/i18n.test.ts
    - src/renderer/i18n/locales/en/wizard.json
    - src/renderer/i18n/locales/cs/wizard.json
decisions:
  - "TAG_MAX_LENGTH = 16 is PROVISIONAL — not live-measured; all validation + counters read from tagConstants.ts"
  - "computeTagGroups does NOT filter on canAct — TagExecutor handles permission errors differently from RemovalExecutor"
  - "Czech tagConsequenceLine uses „{{tag}}" (U+201E / U+201C) — not ASCII quotes — to avoid JSON string termination"
metrics:
  duration: "5m 24s"
  completed: "2026-06-20"
  tasks_completed: 2
  files_created: 5
  files_modified: 6
---

# Phase 12 Plan 01: tagConstants + tagValidation + i18n tag namespace + wizardStage Summary

Tag foundation layer: TAG_MAX_LENGTH constant, pure validation utilities with full TDD coverage, complete en/cs tag namespace (54 keys, Czech 3-form plurals), and wizardStage extension for TAG_COMPLETE/TAG_STOPPED events.

## Tasks Completed

| Task | Name | Commit | Key Output |
|------|------|--------|------------|
| 1 | tagConstants + tagValidation utility + tests | bc110be (GREEN), 13e8a01 (RED) | tagConstants.ts, tagValidation.ts, tagValidation.test.ts (15 tests) |
| 2 | wizardStage extension + i18n namespace + translations | 001090b (GREEN), ea014fa (RED) | wizardStage.ts, en/cs tag.json, wizard.json additions, i18n/index.ts (21 tests) |

## Test Results

```
36 tests passed across 3 test files:
- tagValidation.test.ts: 15 passed (all validateTagInput + computeTagGroups cases)
- wizardStage.test.ts:   13 passed (includes 3 new TAG_COMPLETE/TAG_STOPPED cases)
- i18n.test.ts:           8 passed (tag namespace gate passes for both en and cs)

npx tsc --build: exit 0 (no errors)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Czech JSON quotes caused TypeScript JSON parse failure**
- **Found during:** Task 2 GREEN phase (npx tsc --build)
- **Issue:** Czech `tagConsequenceLine_*` values used „{{tag}}" where the closing mark was ASCII `"` (0x22), terminating the JSON string early. TypeScript's JSON parser rejected the file with ~80 TS1005/TS1136 errors.
- **Fix:** Replaced the closing ASCII `"` with U+201C (`"`, LEFT DOUBLE QUOTATION MARK), the correct typographic form for Czech closing quotation. The Czech pair is now `„..."` (U+201E / U+201C), both non-ASCII.
- **Files modified:** src/renderer/i18n/locales/cs/tag.json
- **Commit:** 001090b (included in the GREEN commit)

## Known Stubs

None — this plan creates pure utilities and i18n config only. No UI components rendered; no stubs in data flow.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings introduced. TAG_MAX_LENGTH is a public compile-time constant. The charset validation regex (T-12-01 mitigate) is implemented in validateTagInput as specified.

## TDD Gate Compliance

Both tasks followed RED/GREEN/REFACTOR gate sequence:

- Task 1: `test(12-01)` commit 13e8a01 (RED) → `feat(12-01)` commit bc110be (GREEN)
- Task 2: `test(12-01)` commit ea014fa (RED) → `feat(12-01)` commit 001090b (GREEN)

No REFACTOR commit needed — implementation was clean on first pass.

## Self-Check: PASSED

Files exist:
- src/shared/tagConstants.ts: FOUND
- src/renderer/wizard/tagValidation.ts: FOUND
- src/renderer/wizard/tagValidation.test.ts: FOUND
- src/renderer/i18n/locales/en/tag.json: FOUND
- src/renderer/i18n/locales/cs/tag.json: FOUND

Commits exist:
- 13e8a01: FOUND (RED — tagValidation tests)
- bc110be: FOUND (GREEN — tagValidation implementation)
- ea014fa: FOUND (RED — wizardStage + i18n tests)
- 001090b: FOUND (GREEN — wizardStage + i18n implementation)
