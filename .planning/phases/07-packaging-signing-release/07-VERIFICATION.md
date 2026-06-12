---
phase: 07-packaging-signing-release
verified: 2026-06-12T23:55:00Z
status: human_needed
score: 6/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Install MrsProper-0.9.1.dmg (x64) on a clean macOS 11.7.10 Big Sur machine"
    expected: "App opens without Gatekeeper block or 'requires macOS 12' dialog; Telegram login reaches code-entry step"
    why_human: "Physical Big Sur machine was unavailable during Phase 7 UAT. The D-16 Electron 37 downgrade can only be confirmed on actual Big Sur hardware — plist inspection and Electron release notes are supporting evidence, not a live smoke-test substitute. Deferred to after Phase 8 by explicit user decision; tracked in 07-HUMAN-UAT.md."
---

# Phase 7: Packaging, Signing & Release — Verification Report

**Phase Goal:** MrProper ships as code-signed, notarized portable installers that launch cleanly for non-technical admins on stock macOS and Windows without Gatekeeper or SmartScreen blocking. Electron 37.10.3 (macOS 11 Big Sur minimum) required for the primary admin's machine (D-16).
**Verified:** 2026-06-12T23:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All three ROADMAP Success Criteria were evaluated. The must-haves from the five PLAN frontmatter files were merged; deduplication left seven distinct truths (SC-3 splits into two: on-hardware Big Sur confirmation and the other three machines).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | macOS DMGs are code-signed (Developer ID Application) and notarized — spctl returns "source=Notarized Developer ID" on both .app bundles | VERIFIED | Plan 04 SUMMARY: notarytool submission IDs 69fffb79 and d6dc08cf, status: Accepted; spctl --assess accepted both .app bundles; codesign --verify exits 0. Commits 430ae0c, 6b22de3. Artifacts on disk: MrsProper-0.9.1-arm64.dmg (119 MB), MrsProper-0.9.1.dmg (126 MB) in release/dist/. |
| 2 | Both macOS DMGs have stapled notarization tickets — xcrun stapler validate exits 0 on both distributable DMGs | VERIFIED | Plan 04 SUMMARY confirms explicit post-package DMG notarize+staple loop added to release.sh (commit 6b22de3); xcrun stapler validate confirmed "The validate action worked!" on both DMGs. scripts/release.sh lines 80-111 show the notarize_dmg() function and stapler validate calls. |
| 3 | Electron is exact-pinned at 37.10.3 — LSMinimumSystemVersion: 11.0 in the installed Electron binary | VERIFIED | package.json devDependencies.electron = "37.10.3" (no caret, confirmed by node -p). node_modules/electron/dist/Electron.app/Contents/Info.plist contains LSMinimumSystemVersion: 11.0 (not 12.0). Commit 3346087. |
| 4 | electron-builder.yml is signing-ready: no identity:null, no zip target, hardenedRuntime:true, entitlements wired, npmRebuild:false | VERIFIED | File read directly: identity key absent (grep -c returns 0); no zip target (DMG only with x64+arm64); hardenedRuntime: true on line 44; entitlements: build/entitlements.mac.plist on line 45; entitlementsInherit: build/entitlements.mac.plist on line 46; npmRebuild: false on line 14. |
| 5 | Windows NSIS installer and portable .exe are present and unsigned (D-05) — SmartScreen "More info → Run anyway" instructions in README | VERIFIED | release/dist/ contains MrsProper Setup 0.9.1.exe (97 MB) and MrsProper-0.9.1-portable.exe (97 MB). README.md contains "More info" and "Run anyway" (lines 25-26). Windows 10 UAT PASS — no SmartScreen dialog at all (better than expected D-05 outcome). |
| 6 | App launches on ARM Mac, Intel Mac, and Windows VM — each reaching Telegram code-entry step (D-13, D-14) | VERIFIED | 07-HUMAN-UAT.md status: ARM Mac PASS, Intel Mac PASS, Windows 10 PASS (all 3 reached Telegram code-entry step per UAT results table). |
| 7 | App launches on macOS 11.7.10 Big Sur without "requires macOS 12" dialog — D-16 Electron 37 downgrade goal confirmed on actual hardware | UNCERTAIN (human needed) | Physical Big Sur machine was unavailable during Phase 7 UAT. plist confirms LSMinimumSystemVersion: 11.0; Electron 37.10.3 release notes confirm Big Sur support; but live hardware smoke test not yet completed. Explicit user deferral to after Phase 8. Tracked in 07-HUMAN-UAT.md. |

**Score:** 6/7 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| — | None deferred to later phases | — | The Big Sur item is pending human verification within this phase, not deferred to a future phase. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Electron pinned to 37.10.3, version 0.9.1, scripts.release present | VERIFIED | devDependencies.electron = "37.10.3"; version = "0.9.1"; scripts.release = "bash scripts/release.sh" |
| `electron-builder.yml` | Signing-ready: no identity:null, no zip, hardenedRuntime:true, entitlements wired | VERIFIED | File read confirms all conditions (lines 14, 44-46); no identity key present |
| `build/entitlements.mac.plist` | All three required Electron hardened-runtime entitlements | VERIFIED | File contains com.apple.security.cs.allow-jit, allow-unsigned-executable-memory, disable-library-validation — all set to true |
| `.env.example` | APPLE_API_KEY=, APPLE_API_KEY_ID=, APPLE_API_ISSUER= with usage comments | VERIFIED | All three variables present as empty assignments with explanatory comments |
| `scripts/release.sh` | Executable, bash-n clean, source .env, tsc --build --force, APPLE_API_KEY file check, spctl + stapler validate | VERIFIED | File is executable (-rwxr-xr-x); bash -n exits 0; all required patterns confirmed by direct file read |
| `README.md` | macOS 11 Big Sur minimum, Windows SmartScreen "More info → Run anyway" steps | VERIFIED | Line 7: "macOS 11 Big Sur or later"; lines 25-26: "More info" and "Run anyway" |
| `release/dist/` (4 artifacts) | MrsProper-0.9.1-arm64.dmg, MrsProper-0.9.1.dmg, NSIS .exe, portable .exe | VERIFIED | All 4 artifacts present: arm64 DMG 119 MB, x64 DMG 126 MB, NSIS 97 MB, portable 97 MB. No .zip mac artifacts (D-04 satisfied). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `electron-builder.yml mac.entitlements` | `build/entitlements.mac.plist` | electron-builder path lookup | WIRED | `entitlements: build/entitlements.mac.plist` and `entitlementsInherit: build/entitlements.mac.plist` present in yml; plist file exists with correct content |
| `scripts/release.sh set -a; source .env` | `APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER` in child process env | shell env auto-export (set -a) | WIRED | release.sh lines 22-24: `set -a; source .env; set +a` — ensures all vars are exported to electron-builder subprocess (fix from commit 430ae0c after initial env-export bug) |
| `scripts/release.sh spctl --assess` | `release/mac-arm64/MrsProper.app` and `release/mac/MrsProper.app` | Gatekeeper assessment | WIRED | Lines 108-109 confirm both paths; Plan 04 SUMMARY confirms spctl returned "source=Notarized Developer ID" on both |
| `scripts/release.sh notarize_dmg()` | Both DMGs | xcrun notarytool + stapler | WIRED | Lines 81-111; commit 6b22de3 added this loop after discovering electron-builder only staples the .app, not the wrapping DMG |

### Data-Flow Trace (Level 4)

Not applicable — this phase delivers build tooling, configuration files, and release artifacts, not components that render dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Electron pinned to 37.10.3 | `node -p "require('./package.json').devDependencies.electron"` | `37.10.3` | PASS |
| LSMinimumSystemVersion is 11.0 | `grep -A1 LSMinimumSystemVersion node_modules/electron/dist/Electron.app/Contents/Info.plist` | `<string>11.0</string>` | PASS |
| No identity:null in electron-builder.yml | `grep -c "identity: null" electron-builder.yml` | `0` | PASS |
| No zip mac target | `grep -c "target: zip" electron-builder.yml` | `0` (inferred from file read — only DMG target present) | PASS |
| hardenedRuntime: true present | direct file read | `hardenedRuntime: true` on line 44 | PASS |
| entitlements plist contains allow-jit | `cat build/entitlements.mac.plist` | all three keys present | PASS |
| release.sh executable and syntax valid | `test -x scripts/release.sh && bash -n scripts/release.sh` | exit 0, syntax OK | PASS |
| 4 artifacts in release/dist/ | `ls release/dist/` | 4 files, correct names and sizes | PASS |
| No .zip mac artifacts | `ls release/*.zip` | No zip artifacts | PASS |
| tsc clean | `npx tsc --build --force` | exit 0 | PASS |
| Test suite | `npm test` | 248/250 pass; 2 pre-existing AUTH-03 env-var failures unchanged from Phase 1 | PASS (no regression) |
| version is 0.9.1 | `node -p "require('./package.json').version"` | `0.9.1` | PASS |

### Probe Execution

No probe scripts exist for this phase (release/dist/ is gitignored; probes are not part of the packaging workflow). Step 7c: SKIPPED (no probe scripts declared or found).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| APP-03 | 07-01, 07-02, 07-03, 07-04, 07-05 | macOS build code-signed and notarized, Windows build unsigned — launches without Gatekeeper/SmartScreen hard block | SATISFIED | macOS DMGs signed (Developer ID Application), notarized (notarytool Accepted), stapled, spctl-accepted. Windows unsigned per D-05 with README SmartScreen instructions. ARM Mac, Intel Mac, Windows UAT passed. Big Sur hardware test pending (deferred). |

**Cross-reference check:** REQUIREMENTS.md Traceability table maps APP-03 to Phase 7 with status "Complete". This is the only requirement assigned to Phase 7. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.env.example` | 12 | `XXXXXXXXXX` | Info | Intentional template placeholder in a comment showing the recommended .p8 key filename path (`AuthKey_XXXXXXXXXX.p8`). The X's represent the key ID that varies per developer. Not a debt marker — no action required. |

No `TBD`, `FIXME`, or `XXX` debt markers found in any file modified by this phase. The `XXXXXXXXXX` match in `.env.example` is a comment-only filename template, not an unresolved item.

No stub code patterns found. All files are complete deliverables (configuration, script, documentation, plist).

### Human Verification Required

#### 1. Big Sur 11.7.10 Hardware Smoke Test (D-16 Validation Gate)

**Test:** Install `MrsProper-0.9.1.dmg` (x64) on a clean macOS 11.7.10 Big Sur machine. Copy the DMG via Drive, Telegram, or USB (preserve quarantine xattr). Double-click the DMG, drag Mrs. Proper to Applications, open it from Applications. Then on the Telegram login screen, enter any phone number and tap "Send code".

**Expected:** App opens without any Gatekeeper dialog, no "this app is damaged" message, and no "requires macOS 12 or later" system alert. Telegram login reaches the code-entry step (proving embedded api_id/api_hash is live in the packaged build).

**Critical check:** If a dialog appears saying "requires macOS 12" or similar, the LSMinimumSystemVersion pin did not survive the DMG build. Report immediately — this is the go/no-go for D-16.

**Why human:** Physical Big Sur machine was unavailable during Phase 7 UAT. The Electron 37 plist confirms LSMinimumSystemVersion: 11.0 and Electron release notes confirm Big Sur support, but only live hardware confirms the packaged DMG actually launches on that OS. No programmatic substitute exists for running an app on a specific OS version.

**Deferred by:** Explicit user decision. Tracked in `.planning/phases/07-packaging-signing-release/07-HUMAN-UAT.md` (status: partial, 1 pending test). Scheduled after Phase 8 localization completes.

---

### Gaps Summary

No blockers. All automated verifications pass. The single open item is the Big Sur hardware smoke test, deferred by explicit user decision to after Phase 8. The technical prerequisites for that test to succeed are all verified:

- Electron 37.10.3 is installed with LSMinimumSystemVersion: 11.0 in the plist
- Both x64 and arm64 DMGs are signed, notarized, and stapled
- ARM Mac and Intel Mac smoke tests passed (confirming the notarization path works end-to-end)

The phase is technically complete. One human verification task remains open per the UAT tracking file.

---

_Verified: 2026-06-12T23:55:00Z_
_Verifier: Claude (gsd-verifier)_
