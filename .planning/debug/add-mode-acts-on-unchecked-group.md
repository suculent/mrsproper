---
status: resolved
trigger: "In Add mode, the add run added the target to a group that was greyed out and unchecked in the checklist. Only the groups listed on the review screen should ever be acted upon."
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T15:46:19Z
---

## Current Focus

hypothesis: CONFIRMED (user clarified: "the row was actually checked, but disabled so I didn't notice I should/could uncheck it"). GroupRow.tsx applies Remove-mode greyed styling (opacity-50 container, Remove greyReason caption, group-type badge) keyed solely on !dialog.canAct, independent of activeMode. In Add mode, a dialog with canAct=false / canAdd=true / status=not-member is actionable + pre-checked, so it renders a live checked checkbox inside a row that looks disabled and carries the Remove-mode reason "no ban right". The user cannot tell it is selected; the review list and add run correctly honor the checked set.
test: Static trace of GroupRow visual gates vs isActionableForMode; enumerator rights derivation; executor dialog set; user clarification.
expecting: n/a - diagnosis complete
next_action: Return ROOT CAUSE FOUND (goal: find_root_cause_only). Fix belongs in GroupRow.tsx (mode-aware grey styling + mode-aware reason caption).

## Symptoms

expected: In Add mode, a greyed/unchecked group is never acted upon; add run touches only the groups listed on the review screen (computeAddGroups output).
actual: Target @testovaci42 was added to greyed, unchecked supergroup "Bohemia-dětské pobyty" whose caption was the Remove-mode greyReason ("Nemáte právo k zákazu v této skupině"). Channel "WixBotTest" greyed with "Kanál — odběratele nelze odebrat".
errors: None reported
reproduction: Test 4 in .planning/phases/15-renderer-add-mode-contacts-template-reporting/15-UAT.md — live Add-mode run, mixed membership, including a supergroup where admin lacks ban rights.
started: Phase 15 UAT 2026-10-04, main at e899b6d

## Eliminated

- hypothesis: (c) main-process AddExecutor / ADD_START IPC acts on groups beyond the passed dialogIds (resume job, membership snapshot).
  evidence: addChannels.ts ADD_START forwards exactly parsed.dialogIds; AddExecutor.execute builds selectedDialogs from params.dialogIds and iterates dialogsToProcess = selectedDialogs minus finished ids; resume requires sameDialogIdSet(existing.dialogIds, params.dialogIds). No expansion path. User confirmed the row was checked.
  timestamp: 2026-10-04

- hypothesis: (d) contact-add / privacy-fallback path triggers an add elsewhere.
  evidence: TARGET_ADD_CONTACT only calls contactService.addIfMissing() (contact write, not a group add). Privacy fallback inside AddExecutor is per-dialog within dialogsToProcess only.
  timestamp: 2026-10-04

- hypothesis: (b) checked ids diverge from what GroupRow renders (store checked but row unchecked).
  evidence: GroupRow checkbox slot uses the same isActionableForMode predicate and renders checked={isChecked} from the store; the row WAS checked (user clarification). The divergence is between the checkbox state and the surrounding greyed styling/caption, not between store and checkbox.
  timestamp: 2026-10-04

## Evidence

- timestamp: 2026-10-04 (step 1)
  checked: src/renderer/groups/modeRules.ts isActionableForMode
  found: add mode -> dialog.canAdd && (status not-member|banned); remove/tag -> dialog.canAct && (member|null). canAct and canAdd are independent flags.
  implication: A dialog with canAct=false, canAdd=true, status=not-member is ACTIONABLE in Add mode.

- timestamp: 2026-10-04 (step 2)
  checked: src/renderer/groups/GroupRow.tsx
  found: Row container opacity-50 gated on !dialog.canAct (L504); Remove greyReason caption gated on !dialog.canAct && dialog.greyReason (L543); type badge gated on !dialog.canAct (L574). None of these consult activeMode. Only the checkbox slot (L300) and the addGreyReason caption (L553, which additionally requires dialog.greyReason == null) consult the mode.
  implication: In Add mode a canAct=false/canAdd=true/not-member row renders a LIVE, checked checkbox inside a greyed row with the Remove-mode 'no ban right' caption and type badge. The Add grey reason can never show for a row that already has a Remove greyReason (L553 requires greyReason == null).

- timestamp: 2026-10-04 (step 3)
  checked: src/renderer/store/groupsStore.ts + ModeSwitch.tsx
  found: First-complete rebuild hardcodes 'remove' (L76); ModeSwitch.handleSelect calls recomputeCheckedForMode(next) before onChange; recomputeCheckedForMode uses isActionableForMode(d,status,mode) with no canAct filter for add.
  implication: After switching to Add, every canAdd && not-member/banned dialog is checked regardless of canAct. (Also: if scan completes while already in Add mode, the pre-check is built with the Remove rule -> separate latent bug.)

- timestamp: 2026-10-04 (step 4)
  checked: src/renderer/wizard/addValidation.ts computeAddGroups + ReviewScreen.handleConfirm
  found: computeAddGroups filters checkedIds.has(id) && d.canAdd (no canAct check, correctly). startAdd receives exactly addGroupActions ids.
  implication: Review list == checked set ∩ canAdd. If the greyed row is in checkedDialogIds it IS listed on review and IS sent to startAdd.

- timestamp: 2026-10-04 (step 5)
  checked: src/main/ipc/addChannels.ts ADD_START
  found: Zod-validates dialogIds, gates against enumerator dialog map, computes resume from auditStore.readJob() (status !== 'complete'), forwards exactly parsed.dialogIds to executor.execute.
  implication: IPC layer does not expand the dialog set. Need to check AddExecutor.execute for resume-path expansion.

- timestamp: 2026-10-04 (step 6)
  checked: src/main/telegram/GroupEnumerator.ts _classifyDialog + _computeCanAdd (L170-290)
  found: Supergroup: canAct = creator || adminRights.banUsers; greyReason='no-ban-right' when false. canAdd = creator || adminRights.inviteUsers || (megagroup && defaultBannedRights.inviteUsers !== true). addGreyReason is only ever 'no-invite-right' | 'channel-full' | null (never 'already-member' / 'banned-no-unban-right' at enumeration). Broadcast channel: canAct always false / greyReason 'broadcast-channel'; canAdd via creator/inviteUsers.
  implication: An admin without banUsers but with inviteUsers (or in a megagroup whose default rights allow inviting) gets canAct=false, greyReason='no-ban-right', canAdd=true. "Bohemia-dětské pobyty" and "WixBotTest" are exactly this shape. Both legitimately actionable in Add mode -> pre-checked.

- timestamp: 2026-10-04 (step 7)
  checked: src/main/telegram/AddExecutor.ts execute() L196-330
  found: selectedDialogs = params.dialogIds mapped through enumerator dialogs; dialogsToProcess = selectedDialogs minus finished ids; loop iterates only dialogsToProcess. Resume only when sameDialogIdSet(existing.dialogIds, params.dialogIds).
  implication: Backend acts on exactly the review-screen list. Hypothesis (c) eliminated.

- timestamp: 2026-10-04 (step 8)
  checked: src/renderer/i18n/locales/cs/groups.json
  found: greyReason.no-ban-right = "Nemáte právo k zákazu v této skupině"; greyReason.broadcast-channel = "Kanál — odběratele nelze odebrat"; greyReason.no-invite-right = "Nemáte právo přidávat členy v této skupině".
  implication: The captions in the screenshot are the Remove-mode greyReason strings rendered by GroupRow L543 — confirming the rows had canAct=false with greyReason set, and that L553 (addGreyReason caption) could not fire because it requires dialog.greyReason == null.

- timestamp: 2026-10-04 (step 9)
  checked: User clarification via coordinator
  found: "the row was actually checked, but disabled so I didn't notice I should/could uncheck it."
  implication: Confirms the row was in checkedDialogIds -> computeAddGroups -> startAdd. The defect is a visual/affordance mismatch in GroupRow, not an over-reach.

- timestamp: 2026-10-04 (step 10)
  checked: src/renderer/groups/*.test.* 
  found: Only modeRules.test.ts exists; no GroupRow component test asserts Add-mode greyed styling or caption selection.
  implication: No regression test guards the row's mode-aware visuals.

## Resolution

root_cause: GroupRow.tsx renders the "greyed / non-actionable" visual treatment from Remove-mode data only, ignoring activeMode: the row container gets `opacity-50` when `!dialog.canAct` (L504), the Remove greyReason caption renders when `!dialog.canAct && dialog.greyReason` (L543), and the type badge renders when `!dialog.canAct` (L574). Meanwhile the checkbox slot (L300) and the store's checked set use the mode-aware isActionableForMode, which for Add mode is `canAdd && (not-member|banned)` with no canAct dependency. For a group where the admin lacks the ban right but holds the invite right (canAct=false, greyReason='no-ban-right', canAdd=true, status=not-member) — e.g. "Bohemia-dětské pobyty" — Add mode therefore pre-checks the row and renders a live checked checkbox inside a half-transparent row captioned "Nemáte právo k zákazu v této skupině" plus a "Superskupina" badge. The user reads this as disabled/unselected, never unchecks it, and the review screen + AddExecutor correctly act on it. Secondary: the Add grey-reason caption (L553) is additionally gated on `dialog.greyReason == null`, so any row with a Remove reason can never show its Add reason, and 'already-member' is never derived in the renderer at all — Add mode's non-actionable rows display either the wrong (Remove) reason or none.
fix: (not applied — diagnose-only) Make GroupRow's greyed treatment mode-aware: derive `isGreyed = !isActionableForMode(...)`-style per-mode non-actionability (for Add: !dialog.canAdd or status member/pending-resolved) and key opacity-50, the badge, and the reason caption on that instead of !dialog.canAct; in Add mode show tG(`greyReason.${dialog.addGreyReason}`) (or a derived 'already-member' when status === 'member') and suppress the Remove greyReason entirely; drop the `dialog.greyReason == null` gate on L553. Add a GroupRow test for canAct=false/canAdd=true/not-member in Add mode asserting no opacity-50, no Remove caption, checked checkbox.
verification: n/a (diagnose-only)
files_changed: []
