---
status: complete
phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
source: [17-VERIFICATION.md]
started: 2026-10-24T21:09:41Z
updated: 2026-10-25T08:31:48Z
---

## Current Test

[complete — user reported "all good" 2026-10-25]

## Tests

### 1. Relaunch resume shows the running job and Stop works
expected: Start an add run, quit the app mid-run, relaunch, and click Resume. The progress bar, the Stop button, the job card (name and initial) and only the job's groups are shown. Stop works. The mode switch and the target input are locked. "Add someone else" appears once the run is stopped or complete, or after PEER_FLOOD.
result: pass

### 2. In-session Resume after Stop
expected: Stop a run. "Resume adding" on the stopped summary band continues the same job, and skipped rows are processed again. The PEER_FLOOD banner's Resume follows the same path. A rejected resume shows the band error text.
result: pass

### 3. First launch on a Czech OS: DM language matches the preview
expected: Clear the saved language preference and launch with the OS language set to Czech. The previewed default DM and the DM actually sent are both Czech and identical.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
