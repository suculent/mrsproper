---
phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state
plan: 02
subsystem: main-ipc, renderer-target, docs
tags: [i18n, dm-template, run-activity, docs]
requires: []
provides:
  - "Sync language cache (preloadLanguageCache / getCachedLanguage) read by getDmText at render time"
  - "isAnyRunActive helper; Change target disabled during Remove/Tag/Add runs"
affects: [src/main/index.ts, src/main/ipc/languageChannels.ts, src/renderer/target/TargetCard.tsx]
tech-stack:
  added: []
  patterns: ["sync cache warmed at launch, updated after Zod validation (mirrors templateChannels)"]
key-files:
  created: [src/renderer/store/runActivity.ts, src/renderer/store/runActivity.test.ts]
  modified:
    - src/main/ipc/languageChannels.ts
    - src/main/ipc/languageChannels.test.ts
    - src/main/index.ts
    - src/renderer/target/TargetCard.tsx
    - src/renderer/i18n/locales/en/target.json
    - src/renderer/i18n/locales/cs/target.json
    - .planning/phases/14-addexecutor-dispatch-privacy-fallback-audit/14-VALIDATION.md
    - .planning/phases/13-add-rights-scan-semantics-foundation/13-02-SUMMARY.md
decisions:
  - "D-13: language cache written only after LanguageSchema.parse in LANGUAGE_SET"
  - "D-15: neutral stopRunFirst tooltip key replaces stopRemovalFirst"
  - "D-17: docs-only edits"
metrics:
  tasks: 3
  completed: 2026-10-04
requirements: [ADD-11, ADD-02]
---

# Phase 16 Plan 02: Tech-debt fixes Summary

DM default language is now read from a sync cache at render time (in-session language switch takes effect), Change target is disabled during any Remove/Tag/Add run, and two docs were corrected.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 Language cache + render-time getDmText | 07abe6e | 10 tests pass in languageChannels.test.ts |
| 2 isAnyRunActive + TargetCard | d319d32 | renderer suite 193 pass; tsc clean |
| 3 Docs (D-17) | b4b5da4 | 14-VALIDATION status complete; 13-02 polarity fixed |

## Deviations from Plan

None in code. Note for Task 3: MembershipScanner.ts matches the expected polarity (`left === true` -> 'banned', otherwise 'member'), so docs follow the code. The scanner docblock at MembershipScanner.ts ~L233 still states the old inverted polarity ("left unset/false -> 'banned'; left===true -> 'not-member'"). It is a stale comment in source code, out of scope for this docs-only task (D-17); logged here for a future cleanup.

## Tooling notes

State tooling quirks (record-metric / add-decision / update-progress) handled per orchestrator instructions; see below if any failed.

## Known Stubs

None.

## Self-Check: PASSED
