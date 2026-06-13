---
phase: 08-localization-i18n-czech
plan: "02"
subsystem: ipc-preferences
tags: [i18next, electron-store, ipc, language, theme, zod]
dependency_graph:
  requires: [08-01]
  provides: [LANGUAGE_GET, LANGUAGE_SET, THEME_GET, THEME_SET, languageChannels, themeChannels]
  affects: [src/preload/index.ts, src/main/index.ts, src/shared/channels.ts]
tech_stack:
  added: [i18next@26.3.1, react-i18next@17.0.8]
  patterns: [ESM-lazy electron-store factory, Zod enum validation, severityChannels clone pattern]
key_files:
  created:
    - src/main/ipc/languageChannels.ts
    - src/main//ipc/themeChannels.ts
  modified:
    - src/shared/channels.ts
    - src/preload/index.ts
    - src/main/index.ts
    - package.json
    - package-lock.json
decisions:
  - "LANGUAGE_GET/THEME_GET return null on first launch (no defaults) — renderer applies OS locale detection"
  - "themeChannels sets nativeTheme.themeSource after store.set(); existing syncRendererTheme listener propagates to renderer"
  - "i18next@26.3.1 + react-i18next@17.0.8 installed as pre-audited Approved packages per RESEARCH.md"
metrics:
  duration_minutes: 10
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_changed: 7
---

# Phase 08 Plan 02: IPC Channel Infrastructure (LANGUAGE/THEME) Summary

Wave 1 IPC backbone: installed i18next + react-i18next, added four channel constants, created languageChannels.ts and themeChannels.ts as severityChannels.ts clones, wired preload bridge and main/index.ts registration.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install packages + channel constants + IPC implementations | 92f67c4 | package.json, channels.ts, languageChannels.ts, themeChannels.ts |
| 2 | Wire preload bridge + main/index.ts registration | 3f7ffd0 | preload/index.ts, main/index.ts |

## What Was Built

### Task 1: Package Install + Channel Constants + IPC Implementations

**Packages installed:**
- `i18next@26.3.1` — pre-audited Approved (RESEARCH.md Package Legitimacy Audit)
- `react-i18next@17.0.8` — pre-audited Approved (RESEARCH.md Package Legitimacy Audit)

**channels.ts additions (after SEVERITY block):**
- `LANGUAGE_GET = 'language:get'`, `LANGUAGE_SET = 'language:set'`
- `THEME_GET = 'theme:get'`, `THEME_SET = 'theme:set'`
- All four added to `CHANNELS` namespace object

**languageChannels.ts** (clone of severityChannels.ts):
- `LanguageSchema = z.object({ language: z.enum(['en', 'cs']) })` — T-08-01
- ESM-lazy `getStore()` factory, no defaults (first-launch returns null)
- `registerLanguageChannels()` registers `LANGUAGE_GET` and `LANGUAGE_SET` handlers

**themeChannels.ts** (clone of severityChannels.ts):
- `ThemeSchema = z.object({ theme: z.enum(['light', 'dark']) })` — T-08-02
- ESM-lazy `getStore()` factory, no defaults (first-launch returns null)
- `THEME_SET` sets `nativeTheme.themeSource = theme` after `store.set()` — T-08-02
- `registerThemeChannels()` registers `THEME_GET` and `THEME_SET` handlers

**Tests:** languageChannels.test.ts and themeChannels.test.ts GREEN — 2 sentinel tests pass, 11 todo stubs remain (Wave 0 Nyquist compliance, real test cases deferred to Plan 03)

### Task 2: Preload Bridge + main/index.ts Registration

**preload/index.ts:**
- Added `LANGUAGE_GET`, `LANGUAGE_SET`, `THEME_GET`, `THEME_SET` to channel imports
- Exposed on `window.mrsproper`:
  - `getLanguage(): Promise<'en' | 'cs' | null>` — null on first launch
  - `setLanguage(language: 'en' | 'cs'): Promise<'en' | 'cs'>`
  - `getTheme(): Promise<'light' | 'dark' | null>` — null on first launch
  - `setTheme(theme: 'light' | 'dark'): Promise<'light' | 'dark'>`

**main/index.ts:**
- Imported `registerLanguageChannels` and `registerThemeChannels`
- Called both after `registerSeverityChannels()` inside `app.whenReady()`

## Verification

- `npm install i18next@26.3.1 react-i18next@17.0.8` — completed without error
- `languageChannels.test.ts` GREEN (sentinel passes, todos remain)
- `themeChannels.test.ts` GREEN (sentinel passes, todos remain)
- `tsc --build` — only pre-existing 08-01 RED stub errors (`@renderer/i18n` not yet created — Plan 03 work)
- `npm test` — 3 failed files / 2 failed tests are pre-existing (same failures before this plan's changes)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The todo test stubs in languageChannels.test.ts and themeChannels.test.ts are intentional Wave 0 Nyquist compliance artifacts (created in Plan 01). The real test implementations will come with Plan 03 when the full i18n layer is wired.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-08-01 (mitigated) | languageChannels.ts | LANGUAGE_SET Zod enum guard implemented as planned |
| T-08-02 (mitigated) | themeChannels.ts | THEME_SET Zod enum guard + nativeTheme.themeSource set only after validation |

## Self-Check: PASSED

Files exist:
- FOUND: /Users/igraczech/Repositories/MrProper/src/main/ipc/languageChannels.ts
- FOUND: /Users/igraczech/Repositories/MrProper/src/main/ipc/themeChannels.ts

Commits exist:
- FOUND: 92f67c4 (feat(08-02): install i18next packages + LANGUAGE/THEME channel constants + IPC implementations)
- FOUND: 3f7ffd0 (feat(08-02): wire language/theme preload bridge + register handlers in main/index.ts)
