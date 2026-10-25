---
status: complete
phase: 15-renderer-add-mode-contacts-template-reporting
source: [15-01-SUMMARY.md, 15-02-SUMMARY.md, 15-03-SUMMARY.md, 15-04-SUMMARY.md, 15-05-SUMMARY.md, 15-06-SUMMARY.md, 15-07-SUMMARY.md, 15-08-SUMMARY.md, 15-09-SUMMARY.md, 15-10-SUMMARY.md, 15-11-SUMMARY.md, 15-12-SUMMARY.md, 15-13-SUMMARY.md, 15-VERIFICATION.md, 15-HUMAN-UAT.md]
started: 2026-10-04T11:15:37Z
updated: 2026-10-04T15:45:53Z
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
result: pass
reported: "pass but the target was also added to group that was disabled - not checked - in Add mode the hint says "Nemáte právo k zákazu v této skupine" (screenshot: greyed row "Bohemia-dětské pobyty" shows the Remove-mode ban-rights reason; greyed channel row "WixBotTest" shows "Kanál — odběratele nelze odebrat"; both unchecked in Add mode, target was still added to the greyed group)"
fixed_by: 15-14 (commits b95350a, e143ebb)
retested: pass on rebuilt 1.1.0 field build, 2026-10-04

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
passed: 11
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

<!-- Both gaps closed by plan 15-14; Test 4 re-verified passing on the rebuilt field build -->

- truth: "In Add mode, a checked (actionable) row is visibly checked and interactive, never rendered greyed/disabled, so the user can see it is selected and can uncheck it"
  status: resolved
  reason: "User reported: the target was also added to group that was disabled - not checked - in Add mode. Clarified: the row was actually checked, but disabled so I didn't notice I should/could uncheck it (greyed row 'Bohemia-dětské pobyty', Superskupina, caption: no ban rights)"
  severity: major
  test: 4
  root_cause: "GroupRow.tsx keys the greyed visual treatment on the Remove-only dialog.canAct flag with no activeMode gate (wrapper opacity-50 at L504, Remove greyReason caption at L543, type badge at L574), while the checkbox and the store's checked set use the mode-aware isActionableForMode. In Add mode a supergroup with invite right but no ban right (canAct=false, canAdd=true, not-member) and every broadcast channel (canAct hardcoded false) are actionable and pre-checked yet rendered dimmed with the Remove caption; the checkbox is interactive (no disabled attr), only muted by the parent opacity. The run then correctly acts on the checked row."
  artifacts:
    - path: "src/renderer/groups/GroupRow.tsx"
      issue: "L504 opacity-50, L543 Remove greyReason caption, L574 type badge all gated on !dialog.canAct regardless of activeMode; diverges from isActionableForMode used for the checkbox at L142/L300"
    - path: "src/renderer/store/groupsStore.ts"
      issue: "Latent: L76 first-scan-complete pre-check hardcodes 'remove' rule even if Add mode is already active"
  missing:
    - "Derive a single mode-aware isGreyed = !isActionable && !isPending && !isFailed in GroupRow and key opacity-50, the reason caption and the type badge on it instead of !dialog.canAct"
    - "GroupRow unit test: canAct=false/canAdd=true/not-member supergroup and a channel under activeMode='add' render no opacity-50, no Remove caption, no badge, and a checked interactive checkbox"
    - "Pass the active mode into groupsStore's first-complete rebuild instead of hardcoding 'remove'"
  debug_session: ".planning/debug/add-mode-acts-on-unchecked-group.md"
- truth: "In Add mode, greyed rows show the Add-specific grey reason (addGreyReason), not the Remove-mode reason (ban rights / channel subscribers cannot be removed)"
  status: resolved
  reason: "User reported: in Add mode the hint says 'Nemáte právo k zákazu v této skupině' on a greyed supergroup, and 'Kanál — odběratele nelze odebrat' on a greyed channel"
  severity: major
  test: 4
  root_cause: "Same GroupRow.tsx mechanism: the Remove-mode greyReason caption (L543) renders whenever !dialog.canAct with no activeMode check, and the Add caption (L553) is additionally gated on dialog.greyReason == null, so any row carrying a Remove reason (every channel always has greyReason='broadcast-channel') can never show its Add reason even when canAdd=false with addGreyReason='no-invite-right'. GroupsPane passes the full DTO with both reasons (L911-931) so GroupRow must select by mode. 'already-member' is never derived in the renderer, so member rows show no Add reason. CR-01/CR-02 gated only the Add-only captions, leaving the Remove caption/dim/badge ungated."
  artifacts:
    - path: "src/renderer/groups/GroupRow.tsx"
      issue: "L543-547 Remove caption not gated on activeMode; L553 Add caption requires dialog.greyReason == null (unreachable for channels); no 'already-member' Add reason derived for member rows"
  missing:
    - "Select the caption key by mode: activeMode === 'add' ? dialog.addGreyReason (or renderer-derived 'already-member' when status is member) : dialog.greyReason; merge the two caption blocks and drop the greyReason == null precondition"
    - "GroupRow unit test: channel with canAdd=false/addGreyReason='no-invite-right' under activeMode='add' renders greyReason.no-invite-right, not greyReason.broadcast-channel; member row renders the already-member reason"
  debug_session: ".planning/debug/add-mode-shows-remove-grey-reason.md"
