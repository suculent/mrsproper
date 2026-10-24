---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
plan: 07
subsystem: i18n / ipc
tags: [language, ipc, dm, D-13]
requires: [17-01]
provides: [language:setDetected channel, getEffectiveLanguage]
affects: [default DM language on first launch]
key-files:
  modified:
    - src/shared/channels.ts
    - src/preload/index.ts
    - src/main/ipc/languageChannels.ts
    - src/main/ipc/languageChannels.test.ts
    - src/renderer/ipc/languageClient.ts
    - src/renderer/main.tsx
    - src/main/index.ts
decisions:
  - "Detected language is held in memory only; never written to the store (unset still means follow OS)"
metrics:
  tasks: 2
  completed: 2026-10-24
requirements: [ADD-16]
---

# Phase 17 Plan 07: Detected language for default DM Summary

Non-persisted `language:setDetected` channel (Zod `z.enum(['en','cs'])`) lets the renderer tell main its OS-derived language, and `getEffectiveLanguage()` (stored ?? detected ?? 'en') now drives the default DM text, so preview and sent DM match on first launch.

## Tasks
1. Channel, whitelist, preload bridge, handler, getter, renderer push, tests - 139ae8c
2. DM text provider in src/main/index.ts uses getEffectiveLanguage - 550eb75

## Deviations from Plan
None. The preload bridge follows the existing `setLanguage` pattern.

## Verification
languageChannels tests 12/12 pass; both typechecks pass; `src/main` suite only has the known pre-existing config.test.ts failures (2).

## Self-Check: PASSED
