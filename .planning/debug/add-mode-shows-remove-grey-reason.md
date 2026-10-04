---
status: resolved
trigger: "In Add mode, greyed checklist rows show the Remove-mode grey reason text (\"no ban rights in this group\", \"channel — subscribers cannot be removed\") instead of the Add-specific grey reason."
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T15:46:19Z
---

## Current Focus

hypothesis: CONFIRMED — GroupRow.tsx keys the visual "greyed" treatment (opacity-50 wrapper, Remove greyReason caption, type badge) on `!dialog.canAct` with no activeMode gate, while actionability (checkbox, partition, pre-check) is keyed on isActionableForMode(mode). In Add mode a supergroup with canAct=false/canAdd=true and a broadcast channel (canAct always false) are ACTIONABLE and pre-checked, yet rendered dimmed with the Remove reason, so the user reads a checked interactive row as "disabled". The Add caption branch additionally requires `greyReason == null`, which is never true for channels, so the Add-specific reason can never be shown on a channel.
test: Rendered GroupRow via react-dom/server (vitest, scratchpad config) with activeMode='add' and the UAT DTO shapes
expecting: n/a — confirmed
next_action: Return ROOT CAUSE FOUND to caller (goal: find_root_cause_only). No source changes made.

reasoning_checkpoint:
  hypothesis: "GroupRow.tsx line 504 (`!dialog.canAct && 'opacity-50'`), line 543 (Remove greyReason caption gated only on `!dialog.canAct`) and line 574 (type badge gated on `!dialog.canAct`) use the Remove-only `canAct` flag regardless of activeMode, so Add-mode rows that are actionable (canAdd=true) but not kickable (canAct=false) render as dimmed with the Remove reason while their checkbox (line 300-312) is live and checked."
  confirming_evidence:
    - "Static render of GroupRow(activeMode='add', supergroup canAct=false greyReason='no-ban-right' canAdd=true, isChecked=true) emits: wrapper class contains `opacity-50`; caption `greyReason.no-ban-right`; Badge `groupTypeLabel.supergroup`; AND `<button role=\"checkbox\" aria-checked=\"true\" data-state=\"checked\" aria-label=\"includeInAddAria\">` with no `disabled` attribute."
    - "Same render for broadcast-channel canAct=false greyReason='broadcast-channel' canAdd=true emits `greyReason.broadcast-channel` + checked, non-disabled, interactive checkbox."
    - "Render for broadcast-channel canAdd=false addGreyReason='no-invite-right' emits `greyReason.broadcast-channel` and NEVER `greyReason.no-invite-right` — the Add caption branch at line 553 requires `dialog.greyReason == null`, which GroupEnumerator sets to 'broadcast-channel' unconditionally for channels (GroupEnumerator.ts:250)."
    - "GroupEnumerator._computeCanAdd (lines 276-286) derives canAdd from creator/inviteUsers/defaultBannedRights independently of banUsers, so canAct=false + canAdd=true is a legitimate, expected DTO shape (D-06 comment at line 232 explicitly says so)."
    - "User clarification: 'the row was actually checked, but disabled so I didn't notice I should/could uncheck it' — matches: checked + interactive + visually dimmed."
  falsification_test: "If the Remove caption / opacity-50 / badge were gated on activeMode (or on !isActionable), the Add-mode render of the canAct=false/canAdd=true supergroup would contain no `opacity-50` and no `greyReason.no-ban-right`. It contains both."
  fix_rationale: "Root cause is the mode-blind `!dialog.canAct` predicate used for the three visual grey elements plus the `greyReason == null` precondition on the Add caption. Deriving 'is this row greyed' from `!isActionable` (already mode-aware via isActionableForMode) and choosing the caption key by activeMode (greyReason for remove/tag, addGreyReason for add) addresses the mechanism, not the symptom."
  blind_spots: "Not tested in a real DOM/Electron render (static markup only); i18n keys shown raw because no i18next instance — but key names map 1:1 to the Czech strings the user saw (cs/groups.json lines 11-12). Did not exercise Tag mode, which shares the Remove rule via isActionableForMode and should be unaffected by a fix that keys on isActionable."

## Symptoms

expected: In Add mode, greyed rows show the Add-specific grey reason (addGreyReason → groups.json greyReason.* keys for the four AddGreyReason values from Phase 13), never the Remove-mode reason (ban rights / channel subscribers cannot be removed). Rows where the admin has invite rights but lacks ban rights should not be greyed for Add at all, since ban rights are irrelevant to adding.
actual: In Add mode (Czech UI, Přidat segment active) the greyed supergroup row "Bohemia-dětské pobyty" shows "Nemáte právo k zákazu v této skupině" and the greyed channel row "WixBotTest" shows "Kanál — odběratele nelze odebrat". Both are Remove-mode greyReason strings. User clarification: the row was in fact checked but looked disabled, so the user did not realise it could/should be unchecked; the target was then added to that group.
errors: None reported
reproduction: Test 4 in .planning/phases/15-renderer-add-mode-contacts-template-reporting/15-UAT.md — switch to Add mode with a target scanned across groups including a supergroup where the admin lacks ban rights and a channel.
started: Discovered during Phase 15 UAT on 2026-10-04, on main at e899b6dd770ee8ef09d72eb088dd9fe3bec1870b.

## Eliminated

- hypothesis: CR-01/CR-02 fixes were not actually applied on main
  evidence: `git log` shows 106e0a9 (CR-01) and bc9be83 (CR-02) on main; GroupRow.tsx line 142 uses isActionableForMode(dialog, membershipStatus, activeMode); line 536 and 553 are gated on activeMode === 'add'; GroupsPane.tsx line 916 passes activeMode={activeMode}.
  timestamp: 2026-10-04T16:45:00Z

- hypothesis: groupsStore / GroupsPane partition is greying the row (i.e. the row is non-actionable in Add mode due to a wrong predicate)
  evidence: modeRules.isActionableForMode('add') = canAdd && (not-member || banned) — ignores canAct entirely. GroupsPane.tsx 164 and groupsStore.ts 195 both route through it. For the UAT rows (canAdd=true) they are partitioned as ACTIONABLE and pre-checked. The greying is purely visual, from GroupRow.
  timestamp: 2026-10-04T16:46:00Z

- hypothesis: GroupEnumerator populates addGreyReason incorrectly (e.g. copies Remove reason into addGreyReason)
  evidence: GroupEnumerator.ts 183/214/235-241 set addGreyReason only from _computeCanAdd / channel-full; the Remove codes ('no-ban-right', 'broadcast-channel') are only ever written to greyReason. The strings the user saw are greyReason values rendered by GroupRow line 545.
  timestamp: 2026-10-04T16:46:00Z

## Evidence

- timestamp: 2026-10-04T16:40:00Z
  checked: src/renderer/groups/GroupRow.tsx full file
  found: Line 142 `isActionable = isActionableForMode(dialog, membershipStatus, activeMode)` (mode-aware). Line 504 wrapper `!dialog.canAct && 'opacity-50'` (mode-blind). Line 543 Remove caption condition `!isRemovalActive && !dialog.canAct && dialog.greyReason && dialog.greyReason !== 'verify-failed' && !isFailed` (mode-blind — no activeMode or isActionable check). Line 553 Add caption condition `activeMode === 'add' && addStatus == null && dialog.addGreyReason != null && dialog.greyReason == null`. Line 574 type Badge `!isRemovalActive && !dialog.canAct && !isFailed` (mode-blind). Checkbox slot lines 300-312 renders an interactive `<Checkbox checked={isChecked} onCheckedChange=...>` with NO disabled prop when isActionable.
  implication: Visual greyness and actionability are computed from two different predicates. In Add mode they diverge whenever canAct=false but canAdd=true.

- timestamp: 2026-10-04T16:41:00Z
  checked: src/renderer/groups/GroupsPane.tsx lines 151-175 and 905-931
  found: Partition uses isActionableForMode(dialog, status, activeMode); GroupRow receives the full `dialog` DTO (containing BOTH greyReason and addGreyReason simultaneously) plus activeMode. GroupsPane does not null-out greyReason for Add mode.
  implication: GroupRow always has both reasons available; which one shows is decided solely inside GroupRow.

- timestamp: 2026-10-04T16:42:00Z
  checked: src/main/telegram/GroupEnumerator.ts lines 160-286
  found: Supergroup: canAct = creator || adminRights.banUsers; greyReason = canAct ? null : 'no-ban-right'; canAdd = _computeCanAdd (creator || adminRights.inviteUsers || !defaultBannedRights.inviteUsers). Broadcast channel: canAct ALWAYS false, greyReason ALWAYS 'broadcast-channel', canAdd independent (D-06 comment line 232). addGreyReason is null whenever canAdd is true.
  implication: canAct=false + greyReason set + canAdd=true + addGreyReason=null is a normal, intended DTO for exactly the two UAT rows. For every broadcast channel greyReason != null, so GroupRow line 553's `greyReason == null` clause makes the Add caption unreachable for channels even when canAdd=false.

- timestamp: 2026-10-04T16:43:00Z
  checked: src/renderer/groups/modeRules.ts, src/renderer/store/groupsStore.ts
  found: isActionableForMode('add') = canAdd && (status === 'not-member' || 'banned'); canAct is not consulted. groupsStore.recomputeCheckedForMode(mode) pre-checks every row passing that predicate.
  implication: In Add mode the two UAT rows are pre-checked (checkedDialogIds contains them). Combined with WR-03's computeAddGroups filter (checked && canAdd) they are legitimately included in the add run — explaining "target was still added to the greyed group".

- timestamp: 2026-10-04T16:44:00Z
  checked: src/renderer/i18n/locales/cs/groups.json
  found: greyReason.no-ban-right = "Nemáte právo k zákazu v této skupině"; greyReason.broadcast-channel = "Kanál — odběratele nelze odebrat".
  implication: The exact strings in the user's screenshot are the greyReason keys rendered by GroupRow line 545, not addGreyReason keys.

- timestamp: 2026-10-04T16:49:00Z
  checked: Direct reproduction — renderToStaticMarkup(<GroupRow activeMode="add" membershipStatus="not-member" isChecked ... />) via vitest with a scratchpad config (no project files touched)
  found: (a) supergroup canAct=false/greyReason='no-ban-right'/canAdd=true → markup has `opacity-50` on wrapper, `greyReason.no-ban-right` caption, `groupTypeLabel.supergroup` badge, and `<button type="button" role="checkbox" aria-checked="true" data-state="checked" aria-label="includeInAddAria">` with no `disabled`/`data-disabled` attribute. (b) broadcast-channel canAct=false/greyReason='broadcast-channel'/canAdd=true → same shape with `greyReason.broadcast-channel`. (c) broadcast-channel canAdd=false/addGreyReason='no-invite-right' → shows `greyReason.broadcast-channel`, never `greyReason.no-invite-right`, and the grey fallback div (correctly non-actionable, wrong caption).
  implication: Confirms the mechanism end-to-end. The checkbox is NOT disabled — only visually muted by the parent's opacity-50 — which is why the user perceived a checked row as disabled.

## Resolution

root_cause: GroupRow.tsx derives the three "greyed" visual elements — the `opacity-50` wrapper (line 504), the Remove-mode greyReason caption (line 543-547), and the type Badge (line 574-578) — from the Remove-only `!dialog.canAct` flag with no `activeMode` (or `isActionable`) gate, while the checkbox/actionability (line 142, 300-312) correctly uses the mode-aware `isActionableForMode`. In Add mode, rows with canAct=false but canAdd=true (supergroups without ban right; every broadcast channel the admin can invite to) are therefore actionable, pre-checked and interactive, yet rendered dimmed with the Remove-mode reason text, so the user reads them as disabled. Secondary: the Add caption (line 553) requires `dialog.greyReason == null`, which GroupEnumerator never satisfies for broadcast channels (greyReason is hard-coded 'broadcast-channel'), so the Add-specific reason can never appear on a channel even when canAdd=false. Not a GroupsPane/groupsStore/GroupEnumerator bug; CR-01/CR-02 are applied but only gated the Add-only captions, not the Remove-only ones.
fix: (not applied — diagnose-only) Suggested: in GroupRow compute `isGreyed = !isActionable && !isPending && !isFailed` (mode-aware) and use it for opacity-50, the caption, and the badge; select the caption key by mode — `activeMode === 'add' ? dialog.addGreyReason : dialog.greyReason` — and drop the `dialog.greyReason == null` clause from the Add branch (or merge both branches into one). Consider also gating the `!dialog.canAct && 'opacity-50'` wrapper on `!isActionable`.
verification: Reproduction script at /private/tmp/claude-501/-Users-igraczech-Repositories-MrProper/b6aedaf8-ff28-4b65-831e-3749f99ddb27/scratchpad/grey-reason.repro.test.tsx (run with the sibling vitest.repro.config.ts) — after a fix, case (a)/(b) should contain no opacity-50 / Remove caption / badge, and case (c) should contain greyReason.no-invite-right.
files_changed: []
