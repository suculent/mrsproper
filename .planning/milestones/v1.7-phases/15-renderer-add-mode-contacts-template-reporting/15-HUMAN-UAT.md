---
status: complete
phase: 15-renderer-add-mode-contacts-template-reporting
source: [15-VERIFICATION.md]
started: 2026-10-04T02:25:00Z
updated: 2026-10-04T15:46:19Z
---

## Current Test

[testing complete — superseded by 15-UAT.md, where all 10 items were run and passed (item 3 after gap-closure plan 15-14)]

## Tests

### 1. Mode switch placement, disabled states, review-screen action
expected: Remove/Tag/Add segmented control is reachable before confirming the target and before reviewing the checklist; it is disabled while a scan resolves, during a run, and in the run/report stages; the review screen shows only the Kick/Ban toggle under Remove, the tag input under Tag, and the add block under Add.
result: pass

### 2. Inverted checklist in Add mode
expected: With a target of mixed membership, not-member and banned rows are pre-checked and interactive; member rows and rows with an add grey reason are greyed with the cause-specific text; banned rows show the "ban will be lifted first" note; switching modes clears the selection without a rescan.
result: pass

### 3. "Add to contacts" checkbox and failure notice (live Telegram)
expected: Checkbox is pre-checked and visible only in Add mode, in both resolved and confirmed states; unchecking skips the contact add; a failed add shows the quiet inline notice and never blocks the flow; the contact appears in Telegram when the add succeeds.
result: pass

### 4. DM template editor and preview
expected: "Edit template" reveals the textarea; "Save template" is disabled with an inline message when `{links}` is missing, the text is empty, or it exceeds 4000 characters; "Reset to default" restores the language default and the open textarea updates immediately; the preview substitutes the target's name and shows the italic placeholder line for links; the saved template survives a relaunch.
result: pass

### 5. Live progress and report (live Telegram run)
expected: Progress label increments per group; Stop/Stopping and the FLOOD_WAIT subline behave as in Tag mode; privacy-blocked rows show "Invite link created" with a Copy link button that copies the link (and the Premium hint where applicable); failed rows show the error line and retry; the report's DM status line reflects sent / refused / not needed.
result: pass

### 6. Export add log
expected: From the report stage and from the Settings menu, "Export add log…" opens a save dialog defaulting to mrproper-add-log.txt and writes the log; cancelling does nothing; with no log yet, the Settings entry shows "No add log yet" and the menu stays open.
result: pass

### 7. Resume / Discard prompt for an incomplete add job
expected: Relaunching with an incomplete add-job.json shows "Finish adding {name}?" with Resume adding / Discard job; Escape or backdrop does not dismiss it; Resume continues the same job id from the first unprocessed group; Discard clears the job.
result: pass

### 8. Czech copy quality
expected: In Czech, every new screen, row, dialog and button uses formal vykání with correct one/few/other plural forms and no truncation or overflow.
result: pass

### 9. Deleted or bot target blocks confirm
expected: Resolving a deleted account or a bot while in Add mode disables the confirm button and shows the explanation text.
result: pass

### 10. Severity persistence across mode round-trip
expected: Set Ban, switch Remove → Tag → Add → Remove: Ban is still selected; after a relaunch the mode is Remove and the severity is still Ban.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
