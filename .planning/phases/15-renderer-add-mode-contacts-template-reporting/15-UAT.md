---
status: complete
phase: 15-renderer-add-mode-contacts-template-reporting
source: [15-01-SUMMARY.md, 15-02-SUMMARY.md, 15-03-SUMMARY.md, 15-04-SUMMARY.md, 15-05-SUMMARY.md, 15-06-SUMMARY.md, 15-07-SUMMARY.md, 15-08-SUMMARY.md, 15-09-SUMMARY.md, 15-10-SUMMARY.md, 15-11-SUMMARY.md, 15-12-SUMMARY.md, 15-13-SUMMARY.md, 15-VERIFICATION.md, 15-HUMAN-UAT.md]
started: 2026-10-04T11:15:37Z
updated: 2026-10-04T14:46:03Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Quit any running MrProper instance. Start the app from scratch (npm run dev or a fresh build). The main process boots without errors in the terminal or DevTools console, the login/session restores, and the groups pane loads live dialogs.
result: pass

### 2. Mode switch placement, disabled states, review-screen action
expected: Remove/Tag/Add segmented control is reachable before confirming the target and before reviewing the checklist; it is disabled while a scan resolves, during a run, and in the run/report stages; the review screen shows only the Kick/Ban toggle under Remove, the tag input under Tag, and the add block under Add.
result: pass

### 3. Inverted checklist in Add mode
expected: With a target of mixed membership, not-member and banned rows are pre-checked and interactive; member rows and rows with an add grey reason are greyed with the cause-specific text; banned rows show the "ban will be lifted first" note; switching modes clears the selection without a rescan.
result: pass

### 4. "Add to contacts" checkbox and failure notice (live Telegram)
expected: Checkbox is pre-checked and visible only in Add mode, in both resolved and confirmed states; unchecking skips the contact add; a failed add shows the quiet inline notice and never blocks the flow; the contact appears in Telegram when the add succeeds.
result: issue
reported: "pass but the target was also added to group that was disabled - not checked - in Add mode the hint says "Nemáte právo k zákazu v této skupine" (screenshot: greyed row "Bohemia-dětské pobyty" shows the Remove-mode ban-rights reason; greyed channel row "WixBotTest" shows "Kanál — odběratele nelze odebrat"; both unchecked in Add mode, target was still added to the greyed group)"
severity: blocker

### 5. DM template editor and preview
expected: "Edit template" reveals the textarea; "Save template" is disabled with an inline message when {links} is missing, the text is empty, or it exceeds 4000 characters; "Reset to default" restores the language default and the open textarea updates immediately; the preview substitutes the target's name and shows the italic placeholder line for links; the saved template survives a relaunch.
result: pass

### 6. Live progress and report (live Telegram run)
expected: Progress label increments per group; Stop/Stopping and the FLOOD_WAIT subline behave as in Tag mode; privacy-blocked rows show "Invite link created" with a Copy link button that copies the link (and the Premium hint where applicable); failed rows show the error line and retry; the report's DM status line reflects sent / refused / not needed.
result: pass

### 7. Export add log
expected: From the report stage and from the Settings menu, "Export add log…" opens a save dialog defaulting to mrproper-add-log.txt and writes the log; cancelling does nothing; with no log yet, the Settings entry shows "No add log yet" and the menu stays open.
result: pass

### 8. Resume / Discard prompt for an incomplete add job
expected: Relaunching with an incomplete add-job.json shows "Finish adding {name}?" with Resume adding / Discard job; Escape or backdrop does not dismiss it; Resume continues the same job id from the first unprocessed group; Discard clears the job.
result: pass

### 9. Czech copy quality
expected: In Czech, every new screen, row, dialog and button uses formal vykání with correct one/few/other plural forms and no truncation or overflow.
result: pass

### 10. Deleted or bot target blocks confirm
expected: Resolving a deleted account or a bot while in Add mode disables the confirm button and shows the explanation text.
result: pass

### 11. Severity persistence across mode round-trip
expected: Set Ban, switch Remove → Tag → Add → Remove: Ban is still selected; after a relaunch the mode is Remove and the severity is still Ban.
result: pass

## Summary

total: 11
passed: 10
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "In Add mode, a group that is greyed out and unchecked in the checklist is never acted upon; the add run touches only the groups listed on the review screen"
  status: failed
  reason: "User reported: the target was also added to group that was disabled - not checked - in Add mode (greyed row 'Bohemia-dětské pobyty', Superskupina, reason shown: no ban rights)"
  severity: blocker
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
- truth: "In Add mode, greyed rows show the Add-specific grey reason (addGreyReason), not the Remove-mode reason (ban rights / channel subscribers cannot be removed)"
  status: failed
  reason: "User reported: in Add mode the hint says 'Nemáte právo k zákazu v této skupině' on a greyed supergroup, and 'Kanál — odběratele nelze odebrat' on a greyed channel"
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
