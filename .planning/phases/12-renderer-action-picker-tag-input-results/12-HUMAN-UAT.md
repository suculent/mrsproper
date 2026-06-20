---
status: partial
phase: 12-renderer-action-picker-tag-input-results
source: [12-VERIFICATION.md]
started: 2026-06-20
updated: 2026-06-20
---

## Current Test

[awaiting human testing]

## Tests

### 1. TagInput focus management
expected: When the action picker switches to "Tag", the tag text input receives focus automatically (tagInputRef.current?.focus()). Tabbing/keyboard navigation behaves correctly and the inline error (role=alert) is announced.
result: [pending]

### 2. Live progress bar real-time update during a real tag run
expected: With a real logged-in Telegram account, starting a tag run shows the per-group progress bar advancing, the current group highlighted, and a FLOOD_WAIT countdown appearing when the governor is waiting. The per-group results report then renders done/skipped(already admin / basic group)/failed(code) and distinguishes a hard-stopped (PEER_FLOOD) run from a completed one.
result: [pending]

### 3. Visual fidelity of tag chip + UI layout (Day/Night + en/cs)
expected: The tag string chip, 3-way action picker, tag input, confirmation, progress, and results render with correct spacing/typography/color in both Day and Night themes and in both English and Czech (formal vykání, correct plurals incl. the new run-trigger button label). Tag confirm/resume buttons use the non-destructive (primary, not red) style.
result: [pending]

### 4. Provisional tag max-length confirmation (carried from STATE blocker)
expected: The provisional 16-character cap (TAG_MAX_LENGTH) matches Telegram's real member-tag/custom-title limit. Enter a 16-char tag against a real group and confirm acceptance; confirm the live limit is not lower than 16. If the real limit differs, retune the shared TAG_MAX_LENGTH constant.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
