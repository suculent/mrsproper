---
phase: 08-localization-i18n-czech
plan: "04"
subsystem: renderer-shell
tags: [i18n, language-switcher, theme-switcher, settings-menu, pre-mount-init]
dependency_graph:
  requires: [08-02, 08-03]
  provides: [language-ipc-client, theme-ipc-client, async-premount-init, settings-menu-l10n]
  affects: [src/renderer/main.tsx, src/renderer/shell/SettingsMenu.tsx]
tech_stack:
  added: []
  patterns: [async-premount-init, useTranslation-hook, menuitemradio-checkmark]
key_files:
  created:
    - src/renderer/ipc/languageClient.ts
    - src/renderer/ipc/themeClient.ts
  modified:
    - src/renderer/main.tsx
    - src/renderer/shell/SettingsMenu.tsx
decisions:
  - "Language option labels (English/Česky) are self-named and identical in both locales — never translated"
  - "activeTheme state initialized from classList.contains('dark') — reads the pre-mount applied class"
  - "handleLanguageSelect calls i18n.changeLanguage() before setLanguage IPC for instant optimistic re-render"
  - "handleThemeSelect toggles classList immediately before setTheme IPC for instant visual response"
  - "Inactive language/theme rows use w-4 placeholder span to prevent label shift when checkmark appears"
metrics:
  duration: 5
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_modified: 4
---

# Phase 08 Plan 04: Wave 2 — Pre-mount Init + Settings Menu Language/Theme UI Summary

**One-liner:** Async main.tsx pre-mount init (language + theme IPC before createRoot) and extended SettingsMenu with Language (English/Česky) + Theme (Day/Night) sections using react-i18next.

## What Was Built

### Task 1: languageClient.ts + themeClient.ts + main.tsx async pre-mount

**languageClient.ts** (`src/renderer/ipc/languageClient.ts`): Renderer-side IPC client following severityClient.ts pattern. Exports `languageClient.getLanguage()` and `languageClient.setLanguage()`. Includes MrsProperApi interface augmentation for TypeScript surface.

**themeClient.ts** (`src/renderer/ipc/themeClient.ts`): Renderer-side IPC client following severityClient.ts pattern. Exports `themeClient.getTheme()` and `themeClient.setTheme()`. Includes MrsProperApi interface augmentation.

**main.tsx** (full rewrite): Replaced synchronous prefersDark block with `async main()` function that:
1. Awaits `Promise.all([getLanguage().catch(null), getTheme().catch(null)])` — IPC failures fall back gracefully
2. Resolves language: stored pref → OS locale (`navigator.language.startsWith('cs')`) → 'en' fallback
3. Awaits `initI18n(lng)` — i18n fully initialized before React mounts
4. Resolves theme: stored pref → OS dark mode preference → 'light' fallback
5. Applies theme class before `createRoot` — no flash of wrong colors
6. Drops `prefersDark.addEventListener` — OS theme changes handled by `nativeTheme.on('updated')` in main process

### Task 2 (checkpoint automation): Extended SettingsMenu.tsx

**SettingsMenu.tsx** fully extended:
- `const { t, i18n } = useTranslation('shell')` at component top
- `activeTheme` state initialized from `classList.contains('dark')`
- `handleLanguageSelect`: closes menu → `i18n.changeLanguage(lang)` → `setLanguage IPC` (optimistic)
- `handleThemeSelect`: closes menu → classList toggle → `setActiveTheme` → `setTheme IPC` (instant visual)
- Language section: "Language" / "Jazyk" header + English + Česky `menuitemradio` buttons with `Check` on active, `w-4` span on inactive
- Theme section: "Theme" / "Motiv" header + Day (Sun icon) + Night (Moon icon) `menuitemradio` buttons with same checkmark pattern
- All hardcoded strings replaced: `t('settingsLabel')`, `t('settingsMenuAriaLabel')`, `t('logOut')`
- Menu widened to `min-w-[200px]` per UI-SPEC
- Log out row unchanged in style (`text-destructive hover:bg-destructive/10`)
- `border-t border-border my-1` separators between Language, Theme, and Log out sections
- Imports: `{ Check, Moon, Sun }` from `lucide-react`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | e377ec4 | feat(08-04): create languageClient/themeClient + async pre-mount in main.tsx |
| Task 2 (checkpoint prep) | b3cae8e | feat(08-04): extend SettingsMenu with Language + Theme sections |

## Verification

- `tsc --build` clean after all changes
- `npm test` — 255/255 non-env tests pass; 2 pre-existing API_HASH/API_ID env failures unchanged
- Human checkpoint pending: visual verification of language/theme switcher + persistence

## Deviations from Plan

None — plan executed exactly as written. The checkpoint task's automation instructions were implemented as specified before presenting the checkpoint for human verification.

## Known Stubs

None. Language option labels ("English", "Česky") are intentionally hardcoded self-names per UI-SPEC (not stubs).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| T-08-06 (accepted) | src/renderer/main.tsx | navigator.language OS locale detection — benign, maps cs vs non-cs only |
| T-08-07 (mitigated) | src/renderer/shell/SettingsMenu.tsx | Language/theme values sent via IPC with Zod validation in main (Plan 02) |
| T-08-08 (mitigated) | src/renderer/main.tsx | IPC failure in pre-mount catches null fallback — app always mounts |

## Self-Check

### Created files exist
- [x] src/renderer/ipc/languageClient.ts — FOUND
- [x] src/renderer/ipc/themeClient.ts — FOUND
- [x] src/renderer/main.tsx — FOUND (modified)
- [x] src/renderer/shell/SettingsMenu.tsx — FOUND (modified)
- [x] .planning/phases/08-localization-i18n-czech/08-04-SUMMARY.md — FOUND

### Commits exist
- [x] e377ec4 — feat(08-04): create languageClient/themeClient + async pre-mount in main.tsx
- [x] b3cae8e — feat(08-04): extend SettingsMenu with Language + Theme sections

## Self-Check: PASSED
