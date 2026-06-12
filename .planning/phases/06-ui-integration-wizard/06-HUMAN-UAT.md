---
status: partial
phase: 06-ui-integration-wizard
source: [06-VERIFICATION.md]
started: 2026-06-12T18:23:32Z
updated: 2026-06-12T18:23:32Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. ResumeJobDialog opens on app restart with pending job (CR-01)
expected: Start a removal run, force-quit the app mid-run, relaunch. The Resume/Discard dialog should open automatically on launch. Code review found `useState(!!pendingJob)` in AppShell.tsx evaluates before the async store bootstrap resolves, so the dialog likely never opens.
result: [pending]

### 2. Resume button resumes a user-stopped job (CR-03)
expected: Stop a removal run mid-way, then use Resume. Remaining groups should be processed. Code review found stopped jobs checkpoint all unprocessed groups as 'skipped', so the resume group list is always empty and the dialog closes silently without doing anything.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
