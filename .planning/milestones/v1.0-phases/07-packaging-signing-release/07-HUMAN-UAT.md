---
phase: 07-packaging-signing-release
plan: 05
type: uat
status: partial
summary:
  total: 4
  passed: 3
  pending: 1
  failed: 0
completed_date: 2026-06-12
---

# Phase 7 UAT Results — Clean-Machine Smoke Test (MrsProper 0.9.1 RC)

**Status: PARTIAL** — 3 of 4 machines passed. 1 test deferred by explicit user decision (machine unavailable).

## Passed Tests

| Machine | Artifact | Result | Notes |
|---------|----------|--------|-------|
| ARM Mac (Apple Silicon) | MrsProper-0.9.1-arm64.dmg | PASS | App opens, Telegram login reaches code entry. No Gatekeeper block. |
| Intel Mac (x64) | MrsProper-0.9.1.dmg | PASS | App opens, Telegram login reaches code entry. No Gatekeeper block. |
| Windows 10 | MrsProper Setup 0.9.1.exe (NSIS) | PASS | App works. No SmartScreen dialog appeared at all — better than expected D-05 outcome for an unsigned build. |

## Pending Tests

| Machine | Artifact | Status | Reason | Scheduled |
|---------|----------|--------|--------|-----------|
| macOS 11.7.10 Big Sur | MrsProper-0.9.1.dmg (x64) | PENDING | Machine unavailable — explicit user deferral | After Phase 8 localization completes |

### Pending Test Detail — Big Sur 11.7.10

**What to test:** Install MrsProper-0.9.1.dmg (x64) on a clean macOS 11.7.10 Big Sur machine.

**Smoke test steps:**
1. Copy MrsProper-0.9.1.dmg to the machine via Drive, Telegram, or USB (preserve quarantine xattr for real Gatekeeper test)
2. Double-click the DMG to mount it
3. Drag "Mrs. Proper" to Applications
4. Open Mrs. Proper from Applications
5. EXPECTED: App opens directly — no Gatekeeper dialog, no "this app is damaged", no "requires macOS 12" system alert
6. Telegram login screen appears → enter any phone number → tap "Send code"
7. EXPECTED: Login code input screen appears (proves embedded api_id/api_hash is live in packaged build)
8. Close/quit the app (do not complete login with real credentials)

**Critical check (D-16 validation):** The app MUST open without any system dialog saying "requires macOS 12 or later" or similar. If that dialog appears, the LSMinimumSystemVersion is not correctly set to 11.0 — report immediately as a FAIL.

**Pass criteria:**
- App opens without Gatekeeper block or minimum-version alert
- Telegram login reaches code-entry step

**References:** D-13 (4-machine verification matrix), D-14 (smoke depth: launch + Telegram login), D-16 (Electron 37 downgrade for Big Sur 11.0 support)

## Notes

- Results confirmed informally per D-15 — no formal sign-off document required
- Windows 10 no-SmartScreen finding: README instructions for the "More info → Run anyway" bypass remain valid; do not assume this outcome is consistent across all Windows configurations
- Version released as 0.9.1 (package.json was already at 0.9.0 from Plan 02; user chose 0.9.1 as actual RC version)
