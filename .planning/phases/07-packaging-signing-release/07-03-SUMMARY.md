---
phase: "07-packaging-signing-release"
plan: "03"
subsystem: "release-tooling"
tags: ["release-script", "readme", "notarization", "smartscreen", "gatekeeper"]
dependency_graph:
  requires: ["07-02"]
  provides: ["release-orchestration-script", "user-facing-readme"]
  affects: ["scripts/release.sh", "README.md"]
tech_stack:
  added: []
  patterns:
    - "bash set -euo pipefail with pre-flight env validation"
    - "source .env before electron-builder to inherit notarization credentials (D-02)"
    - "tsc --build --force type-check gate (not --noEmit which is a NO-OP)"
    - "spctl + xcrun stapler validate Gatekeeper pre-verification"
key_files:
  created:
    - path: "scripts/release.sh"
      purpose: "Single-entry local release orchestrator: pre-flight validation, type-check, build, package mac/win, Gatekeeper verify, artifact collect"
    - path: "README.md"
      purpose: "User-facing install instructions: macOS (notarized, Big Sur minimum), Windows SmartScreen run-anyway steps, Electron EOL note"
decisions:
  - "scripts/release.sh uses source .env (not export) — variables are exported into shell and inherited by npm child processes, which is how electron-builder reads APPLE_API_KEY/ID/ISSUER"
  - "Windows artifacts use glob copy (MrsProper*Setup*.exe, MrsProper*portable*.exe) to avoid quoting issues with space in NSIS filename"
  - "README macOS minimum is macOS 11 Big Sur (not macOS 12) — consistent with D-16 Electron 37 downgrade decision"
  - "Electron EOL note placed in README Technical Note section (for maintainers, not end users)"
metrics:
  duration_minutes: 8
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_changed: 2
---

# Phase 7 Plan 03: Release Script and README Summary

Release orchestration script (`scripts/release.sh`) with pre-flight credential validation, correct `source .env` → notarization inheritance, `tsc --build --force` type gate, Gatekeeper pre-verification; plus a user-facing README with Windows SmartScreen run-anyway steps and macOS Big Sur minimum.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create scripts/release.sh — pre-flight validated release orchestrator | a954739 | scripts/release.sh |
| 2 | Create README.md — user-facing install and SmartScreen instructions | 29764a0 | README.md |

## What Was Built

### Task 1 — scripts/release.sh

Single-entry local release script implementing the D-09 requirement. Structure:

1. **Pre-flight validation** — checks for `.env` file existence, sources it, then validates 5 required env vars (`MRSPROPER_API_ID`, `MRSPROPER_API_HASH`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`) and additionally verifies that `$APPLE_API_KEY` points to an existing file on disk.

2. **Version bump** — `npm version "$VERSION" --no-git-tag-version` (avoids premature git tag before UAT).

3. **Type-check gate** — `npx tsc --build --force` (not `--noEmit` which is a documented NO-OP for this composite project).

4. **Build** — `npm run build` before packaging (prevents stale renderer in artifacts).

5. **macOS packaging** — `npm run package:mac` with echo warning about 2–10 min notarization. `APPLE_API_KEY/ID/ISSUER` are already in the shell environment (sourced from `.env`) and inherited by electron-builder's child process.

6. **Windows packaging** — `npm run package:win` (unsigned cross-build from dev Mac, D-07).

7. **Gatekeeper pre-verification** — four checks: `spctl --assess` on `release/mac-arm64/MrsProper.app` and `release/mac/MrsProper.app`; `xcrun stapler validate` on both DMGs.

8. **Artifact collection** — copies arm64 DMG, x64 DMG (no arch suffix per Pitfall 6), NSIS installer (glob for space in name), and portable exe to `release/dist/`.

9. **Closing output** — artifact listing and smoke test reminder (ARM Mac, Intel Mac, macOS 11.7.10 Big Sur, Windows VM).

### Task 2 — README.md

46-line user-facing README targeting non-technical admins. Sections:

- **System Requirements** — macOS 11 Big Sur or later; Windows 10/11 (64-bit)
- **Install — macOS** — numbered steps with DMG filename guidance (arm64 vs no-suffix x64); one-liner noting notarization
- **Install — Windows** — numbered steps including the SmartScreen "More info → Run anyway" flow (D-08); honest explanation that unsigned-v1 is expected behaviour
- **First Use** — one sentence on phone login
- **Technical Note** — Electron 37 EOL tradeoff for Big Sur compatibility, reference to D-16 in CONTEXT.md

## Verification Results

| Check | Result |
|-------|--------|
| `test -x scripts/release.sh` | PASS (-rwxr-xr-x) |
| `bash -n scripts/release.sh` | PASS (exit 0, syntax valid) |
| `grep "source .env" scripts/release.sh` | PASS |
| `grep "tsc --build --force" scripts/release.sh` | PASS |
| `grep "no-git-tag-version" scripts/release.sh` | PASS |
| `grep "stapler validate" scripts/release.sh` | PASS (2 occurrences) |
| `grep -i "big sur" README.md` | PASS (3 occurrences) |
| `grep -i "more info" README.md` | PASS (2 occurrences) |
| `grep -i "run anyway" README.md` | PASS (2 occurrences) |
| `npm test` | 248/250 pass — same 2 pre-existing AUTH-03 failures, no regressions |
| `npx tsc --build --force` | Exit 0 (PASS) |

## Deviations from Plan

None — plan executed exactly as written. The PATTERNS.md target form for `scripts/release.sh` was followed verbatim with minor formatting improvements (section dividers for readability).

## Known Stubs

None — both files are complete deliverables. `scripts/release.sh` is fully functional given a populated `.env` and valid Developer ID cert in Keychain.

## Threat Flags

No new security-relevant surface beyond the plan's threat model. `scripts/release.sh` sources `.env` but does not echo credential values. `README.md` contains the planned SmartScreen bypass instructions (T-07-09 accepted).

## Self-Check: PASSED

- `/Users/igraczech/Repositories/MrProper/scripts/release.sh` — created, committed a954739
- `/Users/igraczech/Repositories/MrProper/README.md` — created, committed 29764a0
