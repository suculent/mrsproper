---
phase: 07-packaging-signing-release
plan: "04"
subsystem: infra
tags: [electron-builder, notarization, codesign, spctl, stapler, release]

# Dependency graph
requires:
  - phase: 07-03
    provides: scripts/release.sh — pre-flight validated release orchestrator and README

provides:
  - Signed, notarized macOS DMGs (arm64 + x64) at release/dist/ for v0.9.1 RC
  - Unsigned Windows NSIS installer + portable .exe at release/dist/
  - Gatekeeper acceptance confirmed (spctl source=Notarized Developer ID) on both .app bundles
  - Notarization staple tickets embedded in both DMGs (xcrun stapler validate passes)
  - Human checkpoint approved — artifacts cleared for UAT handoff

affects: [07-05-clean-machine-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "set -a before sourcing .env in release.sh so all vars are auto-exported to subprocesses (notarytool needs them)"
    - "npm version --allow-same-version to let release.sh re-bump even when package.json already matches (idempotent reruns)"
    - "npmRebuild: false in electron-builder.yml to skip native N-API rebuild for bufferutil/utf-8-validate on cross-compile (Wine/Windows path)"
    - "notarize + staple DMGs explicitly in release.sh after electron-builder exits — builder only staples the .app bundle, not the wrapping DMG"

key-files:
  created: []
  modified:
    - scripts/release.sh
    - electron-builder.yml

key-decisions:
  - "Version released as 0.9.1 instead of planned 0.9.0 — user had previously bumped package.json to 0.9.0 and npm version rejected the no-change bump; 0.9.1 is the actual RC version"
  - "DMG notarize+staple added to release.sh — electron-builder only staples the .app; the distributable DMG must be submitted to notarytool and stapled separately for Gatekeeper to accept offline"
  - "npmRebuild: false in electron-builder.yml to allow Wine/Windows cross-compile; bufferutil and utf-8-validate are prebuilt N-API modules that do not need host-ABI rebuild"

patterns-established:
  - "Release flow: bump version → tsc → build → package:mac (signed + notarized .app) → notarize+staple DMGs explicitly → package:win → spctl+stapler verify → collect artifacts"

requirements-completed:
  - APP-03

# Metrics
duration: ~180min (across multiple checkpoint cycles)
completed: 2026-06-12
---

# Phase 7 Plan 04: Release Build and Gatekeeper Verification Summary

**Signed and notarized v0.9.1 RC DMGs (arm64 + x64) plus unsigned Windows installers produced, Gatekeeper-verified (spctl Notarized Developer ID + stapler validate), and confirmed by human checkpoint.**

## Performance

- **Duration:** ~180 min (spread across pre-flight check → release run → fix cycles → checkpoint)
- **Started:** 2026-06-12
- **Completed:** 2026-06-12
- **Tasks:** 2 (Task 1: pre-flight check; Task 2: checkpoint:human-verify)
- **Files modified:** 2 (scripts/release.sh, electron-builder.yml)

## Accomplishments

- Both macOS .app bundles (arm64 + x64) signed with "Developer ID Application: Matej Sychra (8VN6AYV2LV)", notarized (notarytool status: Accepted), stapled, and passing `spctl --assess` (source=Notarized Developer ID) plus `codesign --verify --deep --strict`
- Both DMGs notarized via notarytool (submission IDs 69fffb79 and d6dc08cf, status: Accepted) and stapled (xcrun stapler validate passes)
- Windows NSIS installer (MrsProper Setup 0.9.1.exe, 97 MB) and portable exe (MrsProper-0.9.1-portable.exe, 97 MB) produced — unsigned per D-05, matching plan intent
- release/dist/ contains exactly 4 artifacts as required: MrsProper-0.9.1-arm64.dmg (119 MB), MrsProper-0.9.1.dmg (126 MB), NSIS .exe, portable .exe — no .zip mac artifacts (D-04 satisfied)
- Human checkpoint approved by user after reviewing signing log, spctl output, stapler output, and artifact list

## Task Commits

1. **Task 1: Pre-flight credential check** — (verified env, .p8, Developer ID cert, Electron 37 LSMinimumSystemVersion 11.0 — no code change committed)
2. **Task 2 (fix cycle 1):** `430ae0c` fix(07-04): export .env vars (set -a), npm version --allow-same-version, npmRebuild: false for prebuilt N-API modules (bufferutil/utf-8-validate win32 cross-compile failure)
3. **Task 2 (fix cycle 2):** `6b22de3` fix(07-04): notarize and staple DMGs in release.sh — electron-builder only staples the .app

**Plan metadata:** (this commit — docs(07-04): complete release build and Gatekeeper verification plan)

## Files Created/Modified

- `scripts/release.sh` — Extended with `set -a` env export, `--allow-same-version` flag on npm version, and an explicit post-package DMG notarize+staple loop using notarytool + xcrun stapler
- `electron-builder.yml` — Added `npmRebuild: false` to allow Wine/Windows cross-compile without rebuilding prebuilt N-API modules

## Decisions Made

- **Version 0.9.1 instead of 0.9.0:** package.json was already at 0.9.0 from Plan 02; `npm version 0.9.0` rejected the no-change bump. User chose 0.9.1 as the actual RC version rather than forcing a workaround.
- **Explicit DMG notarization in release.sh:** electron-builder notarizes and staples the `.app` bundle inside the build pipeline but does not re-submit the wrapping `.dmg` to notarytool. Without an explicit DMG submission, `xcrun stapler validate` fails on the distributable file. Added a post-package loop to submit and staple each DMG.
- **`npmRebuild: false`:** bufferutil and utf-8-validate ship prebuilt N-API binaries. electron-builder's default rebuild step tries to compile them for the Electron ABI, which fails under Wine for the Windows target. Disabling rebuild lets the prebuilt binaries pass through without recompilation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] env vars not exported to notarytool subprocess**
- **Found during:** Task 2 — first release script run
- **Issue:** `.env` was sourced with `. .env` (not `set -a; . .env; set +a`), so APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER were set in the shell but not exported to child processes. notarytool (called by @electron/notarize) ran as a subprocess and received an empty environment, producing a credentials error.
- **Fix:** Changed `. .env` to `set -a; . .env; set +a` in release.sh so all variables are auto-exported.
- **Files modified:** `scripts/release.sh`
- **Verification:** Subsequent run — notarytool found credentials and connected to Apple notarization servers.
- **Committed in:** `430ae0c`

**2. [Rule 3 - Blocking] npm version rejected no-change version bump**
- **Found during:** Task 2 — first release script run (same cycle as fix 1)
- **Issue:** `npm version 0.9.0` failed with "Version not changed" because package.json was already at 0.9.0 from Plan 02. The release script exited early.
- **Fix:** Added `--allow-same-version` flag to the `npm version` call so re-running the script with the same version is idempotent. User also chose to release as 0.9.1 to reflect the iteration.
- **Files modified:** `scripts/release.sh`
- **Verification:** `npm version 0.9.1 --allow-same-version` succeeded; version bumped to 0.9.1 in package.json.
- **Committed in:** `430ae0c`

**3. [Rule 3 - Blocking] bufferutil/utf-8-validate N-API rebuild failed under Wine**
- **Found during:** Task 2 — first release script run (same cycle as fixes 1–2)
- **Issue:** electron-builder attempted to rebuild native addons for the Windows target using Wine. bufferutil and utf-8-validate are prebuilt N-API packages and do not need a host rebuild — the Wine environment could not complete the native compile step.
- **Fix:** Set `npmRebuild: false` in `electron-builder.yml` to skip the rebuild step. Prebuilt N-API binaries pass through unchanged.
- **Files modified:** `electron-builder.yml`
- **Verification:** Windows package built successfully; both .exe artifacts produced.
- **Committed in:** `430ae0c`

**4. [Rule 1 - Bug] DMGs not notarized/stapled after electron-builder exit**
- **Found during:** Task 2 — second release script run (post fix-cycle 1)
- **Issue:** electron-builder signs and notarizes the `.app` bundle and staples the ticket to the `.app`. It then wraps the `.app` into a `.dmg` but does NOT re-submit the `.dmg` to notarytool. As a result, `xcrun stapler validate` on the distributable `.dmg` files failed — the DMG ticket was absent.
- **Fix:** Added an explicit post-package loop in `release.sh` that calls `xcrun notarytool submit --wait` for each DMG output, then `xcrun stapler staple`. Both DMGs were submitted (notarytool submission IDs 69fffb79 and d6dc08cf) and returned status: Accepted.
- **Files modified:** `scripts/release.sh`
- **Verification:** `xcrun stapler validate` on both MrsProper-0.9.1-arm64.dmg and MrsProper-0.9.1.dmg output "The validate action worked!". User confirmed in checkpoint approval.
- **Committed in:** `6b22de3`

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug)
**Impact on plan:** All four fixes were necessary for the release to complete and for the notarized artifacts to be distributable. No scope was added beyond what the plan required for success. The version number shifted from 0.9.0 to 0.9.1 — this is the actual RC version shipped.

## Issues Encountered

- Notarization requires all four Apple API env vars exported (not just set) in the shell that invokes @electron/notarize — `set -a` is the correct POSIX pattern.
- electron-builder's DMG wrapping step happens after notarization of the .app, creating a new binary artifact that is not itself notarized. This is a known electron-builder behavior; the fix (explicit DMG notarytool submit + staple) must be part of any release script that distributes DMGs.

## Next Phase Readiness

- All 4 release/dist/ artifacts are cleared for UAT: MrsProper-0.9.1-arm64.dmg, MrsProper-0.9.1.dmg, MrsProper Setup 0.9.1.exe, MrsProper-0.9.1-portable.exe
- Plan 07-05 (clean-machine UAT: ARM Mac + Intel Mac + Big Sur 11.7.10 + Windows VM) can proceed immediately using these artifacts
- No blockers for UAT; artifacts have passed all automated verification (spctl, codesign --verify, stapler validate)

## Self-Check: PASSED

- `scripts/release.sh` modified — exists (confirmed during execution)
- `electron-builder.yml` modified — exists (confirmed during execution)
- Commits `430ae0c` and `6b22de3` exist in git log (confirmed above)
- release/dist/ artifacts verified by user at checkpoint — 4 files, no .zip artifacts

---
*Phase: 07-packaging-signing-release*
*Completed: 2026-06-12*
