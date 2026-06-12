---
phase: 07-packaging-signing-release
plan: 05
subsystem: infra
tags: [electron, uat, smoke-test, macos, windows, gatekeeper, notarization, big-sur]

# Dependency graph
requires:
  - phase: 07-packaging-signing-release
    provides: "Notarized and stapled 0.9.1 RC artifacts in release/dist/ (arm64 DMG, x64 DMG, Windows NSIS installer, Windows portable)"
provides:
  - "Human-confirmed clean-machine UAT: 3 of 4 machines passed (ARM Mac, Intel Mac, Windows 10)"
  - "Documented deferral: Big Sur 11.7.10 smoke test deferred to post-Phase-8 by explicit user decision"
  - "Windows 10 surprise finding: no SmartScreen dialog at all (better than expected for unsigned build)"
  - "07-HUMAN-UAT.md tracking file for the single pending test"
affects: [phase-8-localization, big-sur-retest]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UAT partial-pass: explicit user deferral documented in SUMMARY + UAT tracking file; deferred item remains visible in /gsd:progress and /gsd:audit-uat"

key-files:
  created:
    - ".planning/phases/07-packaging-signing-release/07-05-SUMMARY.md"
    - ".planning/phases/07-packaging-signing-release/07-HUMAN-UAT.md"
  modified: []

key-decisions:
  - "Big Sur 11.7.10 smoke test deferred to after Phase 8 localization — machine unavailable; explicit user decision, not a test failure"
  - "Windows 10 unsigned build produced no SmartScreen dialog at all — better than expected D-05 outcome; documented as a finding, not assumed reliable"
  - "UAT result confirmed informally per D-15; 07-HUMAN-UAT.md persists the single pending item for audit visibility"

patterns-established:
  - "UAT partial-pass pattern: write 07-HUMAN-UAT.md with status: partial and pending test entries so deferred items are trackable across phase boundaries"

requirements-completed:
  - APP-03

# Metrics
duration: checkpoint-human-action (no elapsed clock time; UAT run by user on physical machines)
completed: 2026-06-12
---

# Phase 7 Plan 05: Clean-Machine UAT Summary

**3 of 4 machines passed 0.9.1 RC smoke test (ARM Mac, Intel Mac, Windows 10 PASS; Big Sur 11.7.10 deferred by explicit user decision — machine unavailable)**

## Performance

- **Duration:** Checkpoint-gated (user-performed physical machine tests)
- **Started:** 2026-06-12 (checkpoint issued)
- **Completed:** 2026-06-12 (results received)
- **Tasks:** 1 (human-action checkpoint + closeout)
- **Files modified:** 2 (07-05-SUMMARY.md, 07-HUMAN-UAT.md created)

## Accomplishments

- ARM Mac (Apple Silicon, MrsProper-0.9.1-arm64.dmg): PASS — app opens, Telegram login reaches code entry
- Intel Mac (x64, MrsProper-0.9.1.dmg): PASS — app opens, Telegram login reaches code entry
- Windows 10 (MrsProper Setup 0.9.1.exe): PASS — app works; no SmartScreen dialog appeared at all (better than expected for an unsigned build per D-05)
- Big Sur 11.7.10: DEFERRED — machine unavailable; user explicitly defers to after Phase 8 localization; not a test failure
- Created 07-HUMAN-UAT.md with partial status and the single pending Big Sur test for ongoing audit visibility

## Task Commits

This plan was a human-action checkpoint — no code commits were produced during the test phase itself.

**Plan metadata:** (this commit — docs closeout)

## Files Created/Modified

- `.planning/phases/07-packaging-signing-release/07-05-SUMMARY.md` - This summary
- `.planning/phases/07-packaging-signing-release/07-HUMAN-UAT.md` - UAT tracking file (status: partial, 1 pending test)

## Decisions Made

- **Big Sur deferral is explicit and bounded:** The user named a specific trigger for retest (after Phase 8 localization completes). This is not an indefinite deferral — the pending test is tracked in 07-HUMAN-UAT.md.
- **Windows 10 no-SmartScreen finding documented:** No SmartScreen dialog appeared at all on Windows 10 with the unsigned build. This is better than the expected D-05 experience ("More info → Run anyway"). It is noted as a pleasant surprise but should not be assumed consistent across Windows versions or machines — the official position remains that unsigned builds may show SmartScreen.
- **UAT result confirmed informally per D-15:** No formal sign-off document beyond SUMMARY.md + UAT tracker.

## Deviations from Plan

### Plan Success Criteria — Partial Pass (User-Directed Deferral)

The plan's success criteria required all four D-13 machines to pass. Three passed. The fourth (Big Sur 11.7.10) was not tested because the physical machine was unavailable — this is not a product failure or a test failure. The user explicitly deferred the Big Sur test to after Phase 8 localization, naming it as a specific, bounded deferral.

- **Impact:** The critical D-16 validation gate (Electron 37 downgrade for Big Sur compatibility) remains UNCONFIRMED on actual Big Sur hardware. It is confirmed by the LSMinimumSystemVersion plist inspection (Plan 04) and the Electron 37 release notes, but not by live smoke test on the target OS.
- **Tracked in:** 07-HUMAN-UAT.md (status: partial, 1 pending)
- **Scheduled retest:** After Phase 8 localization (user decision)

**Total deviations:** 1 (plan-level partial pass; deviation is user-directed, not an auto-fix)
**Impact on plan:** Phase 7 proceeds to complete status with one documented pending verification item.

## Issues Encountered

None during execution. The partial result was an operational constraint (machine unavailability), not a technical issue.

## Windows 10 Finding

Windows 10 showed no SmartScreen dialog at all when launching the unsigned NSIS installer. The expected D-05 behavior was "More info → Run anyway". The actual behavior was cleaner. Possible explanations: Windows Defender SmartScreen behavior varies by Windows version, machine history, and whether the binary has any reputation data. Do not assume this will hold for all Windows users — README instructions for the SmartScreen bypass remain valid and should be kept.

## Next Phase Readiness

- Phase 8 (Localization) can begin — the Big Sur deferral does not block localization work
- After Phase 8 completes, retest Big Sur 11.7.10 with the then-current build (07-HUMAN-UAT.md tracks the pending item)
- Version tag and 1.0.0 bump are a post-UAT follow-up quick task (noted in Plan 05 resume-signal)

---
*Phase: 07-packaging-signing-release*
*Completed: 2026-06-12*
