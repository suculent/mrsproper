---
status: complete
phase: 13-add-rights-scan-semantics-foundation
source: [13-01-SUMMARY.md, 13-02-SUMMARY.md, 13-03-SUMMARY.md, 13-REVIEW-FIX.md]
started: 2026-10-03T18:08:22Z
updated: 2026-10-03T18:22:21Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Quit any running MrProper instance. Start the app fresh with `npm run dev` (or the packaged build). It boots with no errors in the terminal or DevTools console, the persisted session logs you in without re-entering a code, and your group list enumerates as before.
result: pass

### 2. Remove mode group list unchanged
expected: Resolve a target who is a normal member of several of your groups. The groups where you can remove them are listed and pre-checked exactly as before this phase. Broadcast channels and groups where you lack kick rights are still greyed with the same reason text as before. No new or changed labels appear in Remove mode.
result: pass

### 3. Kicked-and-banned target is not offered for removal (CR-01 polarity, half 1)
expected: In a supergroup you admin, kick AND ban a test account (Telegram "Remove and ban", so they appear under the group's Removed users). In MrProper, resolve that test account. That supergroup is NOT listed as removable for them (it is hidden or greyed, and if it was their only group the "isn't a member of any group" message shows). Nothing crashes or shows a failed-scan retry link for that group.
result: pass

### 4. Restricted-but-present target IS offered for removal (CR-01 polarity, half 2)
expected: In a supergroup you admin, restrict a test account without removing them (Telegram "Restrict", e.g. no media or no messages, so they stay in the member list). In MrProper, resolve that test account. That supergroup IS listed and pre-checked as removable, because they are still a participant. Before this phase's fix it would have been hidden.
result: pass

### 5. Removal of a normal member still works end-to-end
expected: Run a Kick (or Ban) on one or two groups for a test account. The review screen, confirmation, live progress and per-group report all behave as before, and the test account is actually removed in Telegram.
result: pass

### 6. Tag action still works at TL layer 229 (TAG-07)
expected: Switch to the Tag action, enter a tag string, select one or two supergroups where the test account is a plain member, confirm. The run completes with per-group success, the tag is visible on the member in Telegram, and the terminal/DevTools console shows no connection, layer, or "unparseable response" errors. The run is not noticeably slower than before.
result: pass

### 7. Tag skips admins, creators, and basic groups with a clear flag
expected: Run Tag with a selection that includes a supergroup where the target is already an admin (or you are the creator-target) and a basic (non-super) group. Those rows finish as skipped with a reason, not as failures, and the remaining supergroups still get tagged.
result: pass

### 8. Stopping a Tag run mid-way stops cleanly
expected: Start a Tag run over at least three groups and press Stop while it is running. The run ends in a stopped state, remaining groups are reported as skipped, the groups already processed keep their tag, and starting a new Tag run afterwards works normally with a clean progress view.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
