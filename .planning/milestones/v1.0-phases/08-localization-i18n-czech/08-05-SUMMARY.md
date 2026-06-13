---
phase: 08-localization-i18n-czech
plan: "05"
subsystem: i18n-migration
tags: [i18n, auth, shell, react-i18next, errorCopy-deletion]
dependency_graph:
  requires: [08-04]
  provides: [auth-components-i18n, shell-components-i18n, errorCopy-deleted]
  affects: [src/renderer/auth, src/renderer/shell]
tech_stack:
  added: []
  patterns: [useTranslation-auth, useTranslation-shell, t-errorCode-interpolation]
key_files:
  created: []
  modified:
    - src/renderer/auth/PhoneStep.tsx
    - src/renderer/auth/CodeStep.tsx
    - src/renderer/auth/PasswordStep.tsx
    - src/renderer/auth/CountryPicker.tsx
    - src/renderer/auth/FloodCountdown.tsx
    - src/renderer/shell/LogoutDialog.tsx
    - src/renderer/shell/IdentityDisplay.tsx
  deleted:
    - src/renderer/auth/errorCopy.ts
decisions:
  - "errorCopy.ts deleted after all 5 auth components migrated; tsc --build confirmed no stale imports"
  - "FloodCountdown uses t('floodCountdownAria', { time: formatCountdown(remaining) }) for the aria-label; PhoneStep/CodeStep/PasswordStep use t('floodCountdownAria', { time: floodRemaining }) for button aria-labels"
  - "IdentityDisplay: both aria-label on CheckCircle2 and visible span text use t('signedInAria') — both were hardcoded 'Signed in'"
metrics:
  duration_minutes: 3
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_modified: 8
---

# Phase 08 Plan 05: Auth + Shell Component Migration Summary

**One-liner:** Migrated 5 auth components and 2 shell components from hardcoded strings to useTranslation(), then deleted errorCopy.ts — Czech auth flow now renders fully localized.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate auth components + delete errorCopy.ts | 729e703 | PhoneStep, CodeStep, PasswordStep, CountryPicker, FloodCountdown, errorCopy.ts (deleted) |
| 2 | Migrate shell components (LogoutDialog, IdentityDisplay) | 23d488a | LogoutDialog, IdentityDisplay |

## What Was Done

### Task 1: Auth Component Migration

All five auth components converted from static copy-module imports to `useTranslation('auth')`:

- **PhoneStep.tsx**: Removed `INVALID_PHONE_FORMAT_COPY` and `getErrorCopy` imports. All title, subtitle, label, placeholder, button strings via `auth.json` `phoneStep.*` keys. Server error via `t('errorCode.${authState.code}')`.
- **CodeStep.tsx**: Removed `getErrorCopy` import. All back/title/description/sentTo/labels/resend/verify strings via `auth.json` `codeStep.*` keys.
- **PasswordStep.tsx**: Removed `getErrorCopy` import. All back/title/description/hint/label/placeholder/signIn strings via `auth.json` `passwordStep.*` keys.
- **CountryPicker.tsx**: Added `useTranslation('auth')`. aria-label, search placeholder, empty state via `auth.json` `countryPicker.*` keys.
- **FloodCountdown.tsx**: Added `useTranslation('auth')`. aria-label via `t('floodCountdownAria', { time: formatCountdown(remaining) })`.
- **errorCopy.ts**: Deleted. `tsc --build` confirmed no remaining imports.

### Task 2: Shell Component Migration

- **LogoutDialog.tsx**: Added `useTranslation('shell')`. All dialog strings (title, description, partial-alert, cancel, confirmLogOut aria, loggingOut, logOutButton) via `shell.json` keys.
- **IdentityDisplay.tsx**: Added `useTranslation('shell')`. CheckCircle2 `aria-label` and visible "Signed in" span both via `t('signedInAria')`.

## Verification

```
grep -rn copy module imports in auth/ + shell/ (excluding tests): 0
npm test: 257 passed | 19 todo
tsc --build: GREEN (no output)
```

## Deviations from Plan

None — plan executed exactly as written. All key mappings matched `auth.json` and `shell.json` structure precisely.

## Known Stubs

None. All migrated strings resolve to real i18n keys present in both `en` and `cs` locale files.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. The T-08-09 mitigation (Czech translations use jargon-free copy matching English) is preserved — Czech `auth.json` errorCode values were verified in Plan 04.

## Self-Check

- [x] PhoneStep.tsx modified: FOUND
- [x] CodeStep.tsx modified: FOUND
- [x] PasswordStep.tsx modified: FOUND
- [x] CountryPicker.tsx modified: FOUND
- [x] FloodCountdown.tsx modified: FOUND
- [x] LogoutDialog.tsx modified: FOUND
- [x] IdentityDisplay.tsx modified: FOUND
- [x] errorCopy.ts deleted: CONFIRMED (git shows D src/renderer/auth/errorCopy.ts)
- [x] Task 1 commit 729e703: FOUND
- [x] Task 2 commit 23d488a: FOUND

## Self-Check: PASSED
