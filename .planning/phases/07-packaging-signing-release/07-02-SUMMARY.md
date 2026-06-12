---
phase: "07-packaging-signing-release"
plan: "02"
subsystem: "build-config"
tags: ["electron-builder", "codesign", "notarize", "entitlements", "release"]
dependency_graph:
  requires: ["07-01"]
  provides: ["signing-ready-electron-builder-config", "entitlements-plist", "notarization-env-template"]
  affects: ["electron-builder.yml", "package.json", ".env.example", "build/entitlements.mac.plist"]
tech_stack:
  added: []
  patterns:
    - "electron-builder 26 notarizeIfProvided — env-var-driven notarization (no afterSign hook)"
    - "hardenedRuntime: true + entitlements plist — Apple notarization prerequisite"
    - "identity key absent — auto-detect Developer ID Application cert from Keychain"
key_files:
  created:
    - path: "build/entitlements.mac.plist"
      purpose: "Hardened runtime entitlements for Electron notarization (allow-jit, allow-unsigned-executable-memory, disable-library-validation)"
  modified:
    - path: "electron-builder.yml"
      purpose: "Removed identity: null signing suppressor and zip target block; added hardenedRuntime, entitlements, entitlementsInherit; updated header comments"
    - path: "package.json"
      purpose: "Version bumped 0.1.0 → 0.9.0 RC (D-11); scripts.release added"
    - path: ".env.example"
      purpose: "Extended with APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER variables and usage comments"
decisions:
  - "identity key removed (not set to string) — electron-builder auto-detects Developer ID Application cert from Keychain; CSC_NAME commented in .env.example for explicit pinning"
  - "APPLE_API_KEY is a filesystem path to .p8 file (not file contents) per xcrun notarytool --key argument semantics"
  - "build/entitlements.mac.plist copied verbatim from node_modules/app-builder-lib/templates/entitlements.mac.plist — official electron-builder template"
  - "No notarize: key set in yml — auto-detection from env vars per notarizeIfProvided trigger logic in MacTargetHelper.js"
metrics:
  duration_minutes: 5
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_changed: 4
---

# Phase 7 Plan 02: Build System Signing Configuration Summary

Signing-ready electron-builder config with hardened runtime entitlements, notarization env var template, and 0.9.0 RC version bump.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Harden electron-builder.yml — remove signing suppressors, add entitlements config | 40ad33e | electron-builder.yml |
| 2 | Create build/entitlements.mac.plist + bump version + extend .env.example | b1c5246 | build/entitlements.mac.plist, package.json, .env.example |

## What Was Built

### Task 1 — electron-builder.yml hardening

Three changes to the mac section:

1. **Removed** `identity: null` — this was a YAML null value (not a string) that triggered `handleNullIdentity()` in macPackager.js and hard-skipped code signing regardless of any env vars. Now absent; electron-builder auto-detects the Developer ID Application cert from Keychain.

2. **Removed** the zip target block (4 lines) — DMG only per D-04.

3. **Added** `hardenedRuntime: true`, `entitlements: build/entitlements.mac.plist`, `entitlementsInherit: build/entitlements.mac.plist` to the mac section. Notarize auto-triggers when `APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER` env vars are set (no custom `afterSign` hook needed).

Header comment updated to reference APP-03 and Electron 37.10.3 Big Sur constraint (D-16). Win, nsis, portable sections unchanged.

### Task 2 — Three independent sub-tasks

**Sub-task A — build/entitlements.mac.plist (new file)**

Copied verbatim from `node_modules/app-builder-lib/templates/entitlements.mac.plist`. Contains the three required Electron hardened-runtime entitlements:
- `com.apple.security.cs.allow-jit` — V8 JIT compilation
- `com.apple.security.cs.allow-unsigned-executable-memory` — Electron internals
- `com.apple.security.cs.disable-library-validation` — GramJS helpers + Electron helper processes

**Sub-task B — package.json updates**
- Version: `0.1.0` → `0.9.0` (D-11 RC bump)
- Added `"release": "bash scripts/release.sh"` to scripts block

**Sub-task C — .env.example extension**

Appended macOS signing block with:
- `APPLE_API_KEY=` (empty assignment — must be absolute path to .p8 file, not file contents)
- `APPLE_API_KEY_ID=` (empty assignment)
- `APPLE_API_ISSUER=` (empty assignment)
- Team ID reference (8VN6AYV2LV, Matej Sychra)
- Optional CSC_NAME commented out with usage explanation

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c "identity: null" electron-builder.yml` | 0 (PASS) |
| `grep -c "target: zip" electron-builder.yml` | 0 (PASS) |
| `grep "hardenedRuntime" electron-builder.yml` | `hardenedRuntime: true` (PASS) |
| `grep "entitlements:" electron-builder.yml` | `build/entitlements.mac.plist` (PASS) |
| `test -f build/entitlements.mac.plist` | EXISTS (PASS) |
| All 3 entitlement keys in plist | PASS |
| `node -p "require('./package.json').version"` | `0.9.0` (PASS) |
| `grep "APPLE_API_KEY=" .env.example` | PASS |
| `grep "APPLE_API_KEY_ID=" .env.example` | PASS |
| `grep "APPLE_API_ISSUER=" .env.example` | PASS |
| `npx tsc --build --force` | Exit 0 (PASS) |
| `npm test` | 248/250 pass — 2 pre-existing AUTH-03 failures (no regressions) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text contained "identity: null" string matching verify grep**

- **Found during:** Task 1 verification
- **Issue:** The initial comment `# identity: null REMOVED — auto-detect...` contained the literal string "identity: null" which caused `grep -c "identity: null" electron-builder.yml` to return 1 instead of 0, failing the verify check
- **Fix:** Changed comment to `# identity key removed — auto-detect Developer ID Application cert from Keychain`
- **Files modified:** electron-builder.yml
- **Commit:** 40ad33e (included in same task commit)

### Pre-existing Test Failures (Not Regressions)

`npm test` reports 2 failing tests in `src/main/telegram/config.test.ts` (AUTH-03 tests for MRSPROPER_API_ID and MRSPROPER_API_HASH). These failures existed before this plan began (verified by running `npm test` on a stash of this plan's changes — same failure count). These tests require actual API credentials in the environment and are expected to fail in the test environment.

## Known Stubs

None — this plan adds only configuration files and a credentials template. No UI components, no data sources, no rendering paths.

## Threat Flags

No new security-relevant surface beyond what the plan's threat model covers. The `.env.example` additions are empty assignments with comments (safe to commit). `.env` remains gitignored per existing `.gitignore` line 9. The `.p8 key file` storage recommendation (outside repo at `~/.credentials/mrsproper/`) is documented in `.env.example` comments.

## Self-Check: PASSED

- `/Users/igraczech/Repositories/MrProper/electron-builder.yml` — modified, committed 40ad33e
- `/Users/igraczech/Repositories/MrProper/build/entitlements.mac.plist` — created, committed b1c5246
- `/Users/igraczech/Repositories/MrProper/package.json` — modified (version 0.9.0, release script), committed b1c5246
- `/Users/igraczech/Repositories/MrProper/.env.example` — extended, committed b1c5246
