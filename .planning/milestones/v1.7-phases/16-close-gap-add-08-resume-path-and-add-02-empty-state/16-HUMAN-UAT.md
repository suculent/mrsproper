---
status: complete
phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state
source: [16-VERIFICATION.md]
started: 2026-10-04T20:45:17Z
updated: 2026-10-24T19:33:59Z
---

## Current Test

[testing complete]

## Tests

### 1. Relaunch resume continues the same add job
expected: Start an Add run, Stop it, quit and relaunch the app, choose Resume on the launch prompt. The run continues the same jobId from its checkpoint without re-resolving the target, the report renders, one DM covers links from all segments, and the add log has a CONTINUATION block.
result: pass

### 2. Add-mode empty state and inverted checklist (en + cs)
expected: In Add mode, a target in none of the admin's groups shows the inverted checklist. "Nothing to add" with the cause-aware body line appears only when no row is actionable. Wording reads correctly in en and cs (formal vykání).
result: pass

### 3. Empty state stays hidden while failed rows can be retried
expected: With an Add scan complete, at least one verify-failed row and no actionable rows, the checklist stays visible so failed rows can be retried (planner refinement: empty state requires failedCount === 0).
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
