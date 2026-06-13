---
phase: 08-localization-i18n-czech
plan: "03"
subsystem: i18n-infrastructure
tags: [i18n, translation, czech, json, typescript, format-utilities]
dependency_graph:
  requires: [08-01, 08-02]
  provides: [i18n-instance, locale-json-files, format-utilities]
  affects: [08-04, 08-05, 08-06, 08-07]
tech_stack:
  added: []
  patterns:
    - Static Vite JSON import for offline-bundled locale resources
    - i18next CustomTypeOptions typed key augmentation via i18next.d.ts
    - initI18n(lng) guard: early return if already initialized (test-safe)
    - Czech 3-form plurals via _one/_few/_other (verified by Intl.PluralRules)
    - Pure format utilities separated from translatable wrapper text
key_files:
  created:
    - src/renderer/i18n/index.ts
    - src/renderer/i18n/i18next.d.ts
    - src/renderer/i18n/locales/en/auth.json
    - src/renderer/i18n/locales/en/target.json
    - src/renderer/i18n/locales/en/groups.json
    - src/renderer/i18n/locales/en/wizard.json
    - src/renderer/i18n/locales/en/removal.json
    - src/renderer/i18n/locales/en/shell.json
    - src/renderer/i18n/locales/cs/auth.json
    - src/renderer/i18n/locales/cs/target.json
    - src/renderer/i18n/locales/cs/groups.json
    - src/renderer/i18n/locales/cs/wizard.json
    - src/renderer/i18n/locales/cs/removal.json
    - src/renderer/i18n/locales/cs/shell.json
    - src/renderer/lib/format.ts
  modified:
    - .gitignore
decisions:
  - "i18next.d.ts added to .gitignore exception list — intentional type augmentation, not generated tsc output"
  - "initI18n() guards against double-init with i18n.isInitialized check — required for vitest isolation (tests share the module singleton)"
  - "Czech candidateRowAria uses _one/_few/_other all returning identical interpolated string — count-sensitive form not needed here since the same pattern works"
  - "formatFoundInTitles returns joined titles only — +N more suffix lives in target:foundInMore JSON key per LOC-02/LOC-03 separation"
metrics:
  duration_min: 15
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_changed: 16
---

# Phase 08 Plan 03: i18n Infrastructure and Translation Catalog Summary

i18n instance module, TypeScript typed keys declaration, 12 locale JSON files (6 namespaces × en+cs), and pure format utility rescue — Wave 1 translation content delivery for Plans 04–05 migration.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create i18n/index.ts, i18next.d.ts, and format.ts | b92f4ca | index.ts, i18next.d.ts, format.ts, 12 stub JSON files, .gitignore |
| 2 | Create all 12 locale JSON files (en + cs, 6 namespaces each) | 17fb2cb | 12 JSON locale files |

## What Was Built

### Task 1: i18n Infrastructure

**`src/renderer/i18n/index.ts`** — The i18n instance module exports:
- `resources`: typed `as const` object with all 12 static JSON imports bundled by Vite (offline/CSP compliant)
- `initI18n(lng: 'en' | 'cs'): Promise<void>`: guards double-init, configures `escapeValue: false` + `useSuspense: false`
- Default export: i18n instance (for `i18n.t()`, `i18n.changeLanguage()`, etc.)

**`src/renderer/i18n/i18next.d.ts`** — TypeScript typed key augmentation via `CustomTypeOptions`, enabling `tsc --build` to catch translation key typos at compile time.

**`src/renderer/lib/format.ts`** — Three pure formatting utilities rescued from copy modules:
- `formatMemberCount(count)` — compact Intl.NumberFormat (from groupsCopy.ts)
- `formatTime(isoString)` — HH:MM time via Intl.DateTimeFormat, no embedded "Finished" word (from removalCopy.ts)
- `formatFoundInTitles(titles, max)` — joined title list, no embedded "+N more" suffix (from searchCopy.ts)

### Task 2: Translation Catalog (12 JSON files)

All 6 namespaces fully populated in both English and Czech:

| Namespace | Key Coverage |
|-----------|-------------|
| `auth` | 7 error codes + invalidPhoneFormat + phoneStep/codeStep/passwordStep/countryPicker + floodCountdownAria |
| `target` | 6 resolve errors + 5 search errors + 11 search copy strings + aria labels + foundInMore |
| `groups` | 5 grey reasons + 3 type labels + 3 group errors + scan + 3 emptyState patterns + aria labels |
| `wizard` | stepIndicator + 5 stage labels + severity controls + confirmLabel/Aria (Ban/Kick plurals) + totals + mechanicNote (4 variants) + memberCount/groupCount |
| `removal` | 6 row errors + confirmTitle/Destructive (Ban/Kick plurals) + runTriggerLabel (Ban/Kick) + progress/flood/resume strings + rowStatus (6) + summaryPart + finishedAt |
| `shell` | settingsMenu + logoutDialog (8 strings) + signedInAria + languageHeader/themeHeader + language labels + themeDay/themeNight |

Czech translations use formal vykání register throughout ("Potvrdit odhlášení", "Zabanovat", "Vyhodit", "Odhlásit se", etc.).

Czech plural forms follow `_one/_few/_other` verified by `Intl.PluralRules('cs')`:
- count=1 → `_one` (1 skupina)
- count=2–4 → `_few` (2–4 skupiny)
- count=5+ → `_other` (5+ skupin)

## Verification Results

- `i18n.test.ts`: GREEN (17 passing, 8 todo stubs from Wave 0)
- `errorCopy.test.ts`: GREEN (17 assertions passing in English + Czech describe blocks)
- `tsc --build`: Passes cleanly (0 errors in production code)
- Full test suite: 24/25 test files passing; `config.test.ts` failure is pre-existing RED state for AUTH-03 (API credentials injection), not caused by this plan

## Deviations from Plan

### Auto-fixed Issues

**[Rule 1 - Bug] Added .gitignore exception for i18next.d.ts**
- **Found during:** Task 1 git staging
- **Issue:** `.gitignore` rule `src/**/*.d.ts` excluded all .d.ts files (they are tsc-generated outputs). `i18next.d.ts` is an intentional type augmentation (not generated), same as `src/main/env.d.ts`
- **Fix:** Added `!src/renderer/i18n/i18next.d.ts` exception to `.gitignore` following the existing pattern for `src/main/env.d.ts`
- **Files modified:** `.gitignore`
- **Commit:** b92f4ca

**[Rule 2 - Missing critical] Added `groupCount` plural key to en/wizard.json and cs/wizard.json**
- **Found during:** Task 2 — i18n.test.ts stubs reference `wizard:groupCount` for Czech plural testing
- **Issue:** Plan interface only mentioned `memberCount` plural but the test stubs check `groupCount`
- **Fix:** Added `groupCount_one/_other` (en) and `groupCount_one/_few/_other` (cs) keys to match test assertions
- **Impact:** Tests pass correctly for Czech plural form verification

## Known Stubs

None. All JSON keys contain real translated content in both en and cs. No placeholder text. Copy modules themselves remain intact (deletion in Plans 04–05).

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. JSON files are bundled at build time via Vite static import (T-08-SC: accepted per threat model). Czech translations do not expose raw Telegram error codes as user-readable text — codes appear only parenthesized within surrounding translated sentences (T-08-04 mitigated).

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/renderer/i18n/index.ts | FOUND |
| src/renderer/i18n/i18next.d.ts | FOUND |
| src/renderer/lib/format.ts | FOUND |
| src/renderer/i18n/locales/cs/wizard.json | FOUND |
| Commit b92f4ca (Task 1) | FOUND |
| Commit 17fb2cb (Task 2) | FOUND |
