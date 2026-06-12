---
phase: 07-packaging-signing-release
plan: 01
subsystem: infra
tags: [electron, electron-builder, macos, big-sur, downgrade]

# Dependency graph
requires:
  - phase: 06-ui-integration-wizard-safety-gates-progress
    provides: fully-integrated Electron app ready for packaging
provides:
  - Electron 37.10.3 exact-pinned devDependency in package.json
  - node_modules rebuilt with darwin-arm64 and darwin-x64 37.10.3 binaries
  - LSMinimumSystemVersion: 11.0 confirmed in Electron.app/Contents/Info.plist
  - TypeScript (tsc --build --force) clean after downgrade
  - Vitest suite verified (248 passing, 2 pre-existing env-var RED tests unaffected)
affects: [07-02, 07-03, 07-04, 07-05, packaging, signing, notarization, release]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exact Electron version pin (no caret/tilde) to prevent accidental upgrade to 38+ which breaks Big Sur"

key-files:
  created: []
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "D-16: Electron downgraded from ^42.0.0 to exact pin 37.10.3 — last major with LSMinimumSystemVersion: 11.0 (Big Sur). Electron 38+ sets 12.0 and will not launch on primary admin's macOS 11.7.10 machine. EOL Jan 2026 is accepted tradeoff."
  - "No code changes required alongside the downgrade — all Electron APIs used by this app (safeStorage, ipcMain, ipcRenderer, contextBridge, BrowserWindow, app, nativeTheme, sandbox/contextIsolation) are present and unchanged in Electron 37 types."
  - "Pre-existing test failures (2 AUTH-03 tests requiring MRSPROPER_API_ID/MRSPROPER_API_HASH env vars) are unrelated to the downgrade and unchanged — documented RED tests from Phase 1 Wave 0."

patterns-established:
  - "Pattern 6 (from RESEARCH.md): exact Electron version pin in package.json — prevents accidental upgrade to 38+ that would silently break Big Sur support"

requirements-completed: [APP-03]

# Metrics
duration: 5min
completed: 2026-06-12
---

# Phase 7 Plan 01: Electron 37.10.3 Downgrade Summary

**Electron downgraded from ^42.0.0 to exact pin 37.10.3 — the last major with LSMinimumSystemVersion: 11.0 (Big Sur), enabling the primary admin's macOS 11.7.10 machine as a packaging prerequisite**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-12T20:22:00Z
- **Completed:** 2026-06-12T20:27:03Z
- **Tasks:** 2
- **Files modified:** 2 (package.json, package-lock.json)

## Accomplishments
- Pinned `electron` devDependency to exact `37.10.3` (removed `^42.0.0` caret range)
- Ran `npm install` — downloaded darwin-arm64 and darwin-x64 37.10.3 Electron binaries
- Confirmed `LSMinimumSystemVersion: 11.0` in `node_modules/electron/dist/Electron.app/Contents/Info.plist`
- TypeScript gate (`tsc --build --force`) passes with zero regressions
- Vitest suite: 248 tests passing; 2 pre-existing env-var RED tests unchanged (unrelated to downgrade)

## Task Commits

1. **Task 1: Pin Electron to 37.10.3 and rebuild node_modules** - `3346087` (chore)
2. **Task 2: Verify zero regressions — tsc, vitest, dev-mode smoke** - `4170199` (test)

## Files Created/Modified
- `package.json` - Changed `"electron": "^42.0.0"` to `"electron": "37.10.3"` (exact pin, no caret)
- `package-lock.json` - Updated lockfile with Electron 37.10.3 resolved versions for darwin-arm64 and darwin-x64

## Decisions Made
- D-16 implemented: Exact pin `"electron": "37.10.3"` with no caret prevents any accidental upgrade to 38+ which would re-introduce Big Sur incompatibility. Semver range `^37` would be technically safe within major, but exact pin makes the intent unambiguous.
- Pre-existing AUTH-03 test failures (2 tests) are not fixed here — the test comments explicitly say "RED: will fail until env injection is wired — that is expected in Wave 0." They require `MRSPROPER_API_ID`/`MRSPROPER_API_HASH` env vars and are pre-Phase 7.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- 2 pre-existing test failures in `config.test.ts` (AUTH-03 env-var tests): These are documented RED tests from Phase 1 that require `MRSPROPER_API_ID` and `MRSPROPER_API_HASH` env vars at test time. They were failing before the downgrade and remain unchanged. Not caused by the downgrade; not fixed per task instructions.

## User Setup Required
None — the Electron downgrade requires no user-facing configuration. The dev-mode smoke test (Gate 3) requires the user to run `npm run dev` and confirm the Electron login window opens without crash.

**Gate 3 (dev-mode smoke) — human verification required:**
```
npm run dev
```
Expected: Electron window opens showing the login screen (phone number entry). No crash, no blank screen. Quit with Cmd+Q after confirming.

## Next Phase Readiness
- `package.json` now has `"electron": "37.10.3"` — all subsequent plans in Phase 7 can proceed with the correct Electron binary
- Plan 02 (electron-builder.yml signing config) can proceed immediately
- Plan 03 (entitlements + notarization) can proceed
- Plan 04 (release script) can proceed
- The packaging prerequisite (D-16) is satisfied: Electron binary will produce `.app` bundles with `LSMinimumSystemVersion: 11.0`

---
*Phase: 07-packaging-signing-release*
*Completed: 2026-06-12*
