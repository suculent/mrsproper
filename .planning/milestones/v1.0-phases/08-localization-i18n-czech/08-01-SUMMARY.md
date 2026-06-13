---
phase: 08-localization-i18n-czech
plan: 01
subsystem: i18n / IPC channels
tags: [tdd, wave-0, red, localization, nyquist]
dependency_graph:
  requires: []
  provides:
    - Wave 0 RED test stubs for LOC-01 (languageChannels, themeChannels IPC)
    - Wave 0 RED test stubs for LOC-02 (i18n init/namespaces)
    - Wave 0 RED test stubs for LOC-03 (Czech plural forms)
    - errorCopy.test.ts rewritten to import from i18n layer
  affects:
    - src/main/ipc/languageChannels.ts (does not exist yet — module to be created in Wave 1)
    - src/main/ipc/themeChannels.ts (does not exist yet — module to be created in Wave 1)
    - src/renderer/i18n/index.ts (does not exist yet — module to be created in Wave 1)
tech_stack:
  added: []
  patterns:
    - vi.mock('electron-store') + vi.mock('electron') for IPC test isolation
    - it.todo() stubs with sentinel non-todo test to force module resolution failure
    - beforeAll(async () => { await initI18n('en') }) pattern for i18n test setup
key_files:
  created:
    - src/main/ipc/languageChannels.test.ts
    - src/main/ipc/themeChannels.test.ts
    - src/renderer/i18n/i18n.test.ts
  modified:
    - src/renderer/auth/errorCopy.test.ts
decisions:
  - Sentinel non-todo test added to each RED test file to force module resolution evaluation (Vitest skips all when only .todo() tests)
  - errorCopy.test.ts preserves all semantic assertions from original; adds Czech describe block for LOC-03 coverage
  - invalidPhoneFormat mapped to auth:invalidPhoneFormat i18n key (replaces INVALID_PHONE_FORMAT_COPY constant)
metrics:
  duration_minutes: 10
  completed_date: "2026-06-13"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 08 Plan 01: Wave 0 RED Test Stubs Summary

**One-liner:** Wave 0 Nyquist compliance — four RED test stubs covering LOC-01 IPC channels, LOC-02 i18n init/namespaces, and LOC-03 Czech plurals, with errorCopy.test.ts rewritten to import from the not-yet-existing i18n layer.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 IPC test stubs — languageChannels.test.ts and themeChannels.test.ts | b1981ed | src/main/ipc/languageChannels.test.ts, src/main/ipc/themeChannels.test.ts |
| 2 | Wave 0 i18n test stub + errorCopy.test.ts rewrite | 6192b72 | src/renderer/i18n/i18n.test.ts, src/renderer/auth/errorCopy.test.ts |

## What Was Built

### Task 1: IPC Test Stubs

Created two new RED test files:

**`src/main/ipc/languageChannels.test.ts`** — stubs for LOC-01 LANGUAGE_GET/SET IPC round-trips:
- `vi.mock('electron-store')` + `vi.mock('electron')` isolate the IPC layer
- 5 `.todo()` stubs covering GET null, SET valid locales (en/cs), SET invalid locale (Zod rejection), GET stored value
- Sentinel test forces module resolution (otherwise Vitest skips all-todo suites)
- Fails: `Cannot find module '/src/main/ipc/languageChannels'`

**`src/main/ipc/themeChannels.test.ts`** — stubs for LOC-01 THEME_GET/SET IPC round-trips:
- Same mock structure as languageChannels.test.ts
- 6 `.todo()` stubs covering GET null, SET light/dark, SET invalid value (Zod rejection), nativeTheme.themeSource, GET stored value
- Fails: `Cannot find module '/src/main/ipc/themeChannels'`

### Task 2: i18n Test Stub + errorCopy Rewrite

Created new RED test file:

**`src/renderer/i18n/i18n.test.ts`** — stubs for LOC-02 and LOC-03:
- `describe('i18n initialization')`: 4 `.todo()` stubs for init, 6-namespace load, non-empty t(), no key passthrough
- `describe('Czech plural forms (LOC-03)')`: 4 `.todo()` stubs for count=1 (skupina), count=2 (skupiny), count=5 (skupin), FLOOD_WAIT Czech
- Fails: `Cannot find package '@renderer/i18n'`

Rewrote existing file:

**`src/renderer/auth/errorCopy.test.ts`** — migrated from errorCopy module to i18n layer:
- Removed: `import { getErrorCopy, ERROR_COPY, INVALID_PHONE_FORMAT_COPY } from './errorCopy'`
- Added: `import i18n, { initI18n } from '@renderer/i18n'` with `beforeAll(async () => { await initI18n('en') })`
- All 9 original semantic assertions preserved (jargon-free checks, per-code content checks)
- Added Czech `describe` block with 4 assertions (LOC-03 coverage)
- `INVALID_PHONE_FORMAT_COPY` assertions migrated to `i18n.t('auth:invalidPhoneFormat')`
- Fails: `Cannot find package '@renderer/i18n'`

## Verification

```
Test Files  5 failed | 20 passed (25)
     Tests  2 failed | 236 passed (238)
```

- 4 Wave 0 files fail: languageChannels.test.ts, themeChannels.test.ts, i18n.test.ts, errorCopy.test.ts — all due to missing module imports (RED, expected)
- 2 pre-existing failures in config.test.ts (missing MRSPROPER_API_ID/API_HASH env vars) — pre-date this plan, unchanged
- All 20 other test files pass (236 tests) — no regressions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sentinel test added to force module resolution in all-todo suites**
- **Found during:** Task 1 — initial `.todo()`-only files were silently skipped by Vitest (showed as 5 todo, 1 skipped — no FAIL)
- **Issue:** Vitest skips evaluation of a test file that contains only `.todo()` tests, so the `import from './languageChannels'` was never evaluated and the "Cannot find module" error was not surfaced
- **Fix:** Added one non-todo sentinel test (`expect(registerLanguageChannels).toBeDefined()`) to each RED test file to force Vitest to evaluate the import
- **Files modified:** languageChannels.test.ts, themeChannels.test.ts, i18n.test.ts
- **Commits:** b1981ed, 6192b72

## Known Stubs

None — this plan creates test files only (no implementation). The test files themselves are intentionally incomplete stubs pending Wave 1 GREEN implementation.

## Threat Flags

None — test files only; no new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- src/main/ipc/languageChannels.test.ts: FOUND
- src/main/ipc/themeChannels.test.ts: FOUND
- src/renderer/i18n/i18n.test.ts: FOUND
- src/renderer/auth/errorCopy.test.ts: FOUND (rewritten)
- b1981ed: FOUND in git log
- 6192b72: FOUND in git log
