---
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
verified: 2026-10-24T23:30:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Relaunch with an incomplete add job, click Resume"
    expected: "Add progress bar, Stop, JobTargetCard (name + initial), only the job's groups, mode locked to Add, target input locked; Stop works"
    why_human: "Visual/UX and real Electron relaunch flow"
  - test: "Stop a run, click Resume adding on the summary band; then PEER_FLOOD banner path"
    expected: "Same job continues with the full dialog set; failure shows resumeFailedBand"
    why_human: "Real-time behavior against Telegram"
  - test: "First launch on a Czech OS with no saved language"
    expected: "Previewed default DM and sent DM are both Czech"
    why_human: "OS locale detection"
---

# Phase 17 Verification

**Goal:** Close audit F1/F2 (relaunch-resume UI visibility, target identity lock) plus folded F3-F6 and D-14 debt.
**Re-verification:** No (initial). Design refinement from the review-fix loop (explicit main-owned ADD_RESUME; ADD_START with a different reviewed identity starts fresh when idle) is treated as intended.

## Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | F1: running add job visible after relaunch with no confirmed target (D-01..D-04) | VERIFIED | `getPaneView`/`getJobRows` in GroupsPane.tsx:115, `activeMode` forced to add (:92), AppShell forces add mode + JobTargetCard (:109,:166), mode switch and TargetInput locked (:961-983) |
| 2 | F2: lookup blocked in main while add non-idle (D-05) incl. name search | VERIFIED | targetChannels.ts `addIsActive` guards RESOLVE/CONFIRM (:94,:105); searchChannels.ts `getAddStep` guard (:116); wired in index.ts:306 |
| 3 | D-06 retry uses job target only, refuses mismatch | VERIFIED | AddExecutor.ts `_retryGroupInner` uses `_resolvedTarget`, live and job-file id checks; old `?? ` pattern gone (grep empty) |
| 4 | D-07 mismatched resume rejected, never initJob for another person (refined) | VERIFIED | `checkResumeIdentity` (reject if no live target or non-idle mismatch; fresh if idle), `checkExplicitResume`, ADD_START/ADD_RESUME in addChannels.ts, ADD_RESUME channel in shared/channels.ts + preload |
| 5 | D-10 banned flag persisted, unban-first fallback | VERIFIED | `bannedDialogIds` written at initJob (:415), preserved (:396), `_effectiveScanStatus` used in execute and retry; stripped in ADD_GET_JOB (addChannels.ts:293) |
| 6 | D-11/D-12 stopped-band Resume; retry DM + log, retryDmStatus | VERIFIED | `resumeStoppedAria` band button, `_sendDm` shared (:577, :763), GroupRow retryDm lines, WR-01..03 fixes |
| 7 | D-13 first-launch language agreement | VERIFIED | `setDetected` handler, `getEffectiveLanguage` used in index.ts:373, renderer main.tsx:23 |
| 8 | D-14 IPC-level resume test, scanner docblock, Phase 16 VERIFICATION status | VERIFIED | addResume.ipc.integration.test.ts exists and passes; docblock matches code (left===true -> banned); 16-VERIFICATION.md status: passed; no-groups empty state (GroupsPane.tsx:356) |

**Score:** 8/8

## Checks run
- `npx tsc --noEmit -p tsconfig.node.json && -p tsconfig.web.json`: exit 0
- `npx vitest run`: 755 passed, 2 failed (only known env-dependent config.test.ts)
- Git tree clean, no stray emitted .js/.d.ts; no TBD/FIXME/XXX in phase source files

## Requirements Coverage
| ID | Plans | Status |
|----|-------|--------|
| ADD-08 | 02,03,04,05,06,08 | SATISFIED (REQUIREMENTS.md: [x]) |
| ADD-12 | 01,02,04,05,08 | SATISFIED (REQUIREMENTS.md: [x]) |
| ADD-16 (Plan 07 only) | 07 | SATISFIED; present in REQUIREMENTS.md, not in the phase's declared ID list |

No orphaned requirements.

## Gaps
None blocking. Residual note: a hard-stop during the end-of-run DM leaves a finished job that is no longer auto-resumable, so its pending DM is not sent (documented in REVIEW-FIX WR-03, unchanged in practice).

Human verification items above are needed for UI/real-time/OS behavior.
