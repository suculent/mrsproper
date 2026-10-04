---
phase: 15-renderer-add-mode-contacts-template-reporting
verified: 2026-10-04T02:21:36Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Mode switch visible in browse and checklist mode, disabled during runs; review screen offers only the mode's action"
    expected: "Remove/Tag/Add segmented control reachable before confirming target and before checklist review; disabled while scan resolving, during a run, and in run/report stages; review screen shows only the Kick/Ban toggle under Remove, tag input under Tag, add block under Add"
    why_human: "Component rendering with no DOM in the test environment (environment: 'node') — code wiring verified by reading JSX (GroupsPane.tsx:823-826, ReviewScreen.tsx mode branches) but visual/interaction behavior needs a live app"
  - test: "Inverted checklist: pre-checked actionable rows, grey reasons, banned note"
    expected: "Target with mixed membership: not-member/banned rows pre-checked and interactive; member rows and addGreyReason rows greyed with cause-specific text; banned rows show 'ban will be lifted first' note"
    why_human: "Component rendering — isActionableForMode/GroupRow wiring verified in source and unit-tested (modeRules.test.ts), but the actual checkbox/caption rendering in a live DOM needs visual confirmation"
  - test: "Contacts checkbox shown only in Add mode; unchecking skips the contact add; failure notice renders"
    expected: "Checkbox pre-checked, visible only in Add mode (resolved + confirmed states); unchecking prevents the dispatch; a failed add shows the quiet inline notice"
    why_human: "Requires a live Telegram account to exercise the actual contact-add API call and observe the real Telegram contacts result"
  - test: "DM editor/preview: edit, save, reset, validation message, placeholder line"
    expected: "Edit toggle reveals textarea; Save disabled with inline message when {links} missing/empty/too long; Reset restores the language default and the open textarea updates immediately (CR-03 fix); preview substitutes name and shows the italic placeholder line"
    why_human: "Component interaction (textarea typing, toggle state) — CR-03 fix verified by reading DmTemplateEditor.tsx/ReviewScreen.tsx source (onReset now returns the new default string), but confirming the rendered textarea updates live needs the running app"
  - test: "Live progress, report rows with link + Copy + Premium hint, DM status line, retry"
    expected: "Progress label increments per group; privacy-blocked rows show 'Invite link created' + Copy button (+ Premium hint when applicable); failed rows show error + retry; report's DM status line reflects sent/refused/not-needed"
    why_human: "Requires a live Telegram run against real/test groups and a privacy-restricted target account"
  - test: "Export add log via save dialog from report stage and Settings menu; 'No add log yet' state"
    expected: "Save dialog opens with default filename mrproper-add-log.txt; file is copied with real content; Settings-menu entry shows 'No add log yet' and keeps the menu open when no log exists (WR-01 fix)"
    why_human: "Native OS save dialog cannot be driven in an automated test; WR-01 fix verified in source (SettingsMenu.tsx keeps menu open on 'no-log') but the actual dialog/file-write flow needs manual confirmation"
  - test: "Resume / Discard prompt for an incomplete add job, non-dismissible via Escape/backdrop"
    expected: "Relaunching with an incomplete add-job.json shows 'Finish adding {name}?' with Resume/Discard; Escape/backdrop does not dismiss it; Resume continues the job with the same job id"
    why_human: "Needs an app restart mid-run to produce the on-disk incomplete job state"
  - test: "Czech copy: vykání, 3-form plurals, no truncation"
    expected: "Switching language to Czech shows correctly formed, non-truncated Czech text (formal vykání, _one/_few/_other plurals) on every new screen/row/dialog this phase introduces"
    why_human: "Visual/linguistic quality check — key-completeness and plural-form presence verified programmatically (i18n.test.ts, add.json content), but idiomatic correctness and layout/truncation need a native-reading human"
  - test: "D-16: deleted/bot target disables the Add confirm button with an inline explanation"
    expected: "Resolving a deleted-account or bot test target while in Add mode disables the confirm button and shows the explanation text"
    why_human: "Requires resolving a real deleted/bot Telegram account to trigger the condition; `isTargetInvalidForAdd` logic was verified by reading ReviewScreen.tsx source only"
  - test: "Severity (Kick/Ban) persists correctly across a Remove→Tag→Add→Remove mode round-trip"
    expected: "Setting Ban, switching through Tag and Add, then back to Remove still shows Ban selected; persistence survives a relaunch"
    why_human: "Component/session state interaction across mode switches and an app relaunch — mode/severity split into independent AppShell state was verified in source (AppShell.tsx uses two separate useState calls) but the end-to-end round-trip needs manual exercise"
---

# Phase 15: Renderer — Add Mode, Contacts, Template & Reporting Verification Report

**Phase Goal:** The admin can switch into Add mode, review an inverted checklist, opt in/out of adding the target to contacts, edit and preview the invite-link DM template, confirm, watch live progress, read the per-group report, and export the add log — fully in English and Czech.
**Verified:** 2026-10-04T02:21:36Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A Remove/Tag/Add mode switch is visible on the groups pane before the checklist is reviewed; switching modes resets the checklist selection and determines which action the review screen offers | ✓ VERIFIED | `ModeSwitch` rendered unconditionally in both `browse`/`checklist` toolbar states (`GroupsPane.tsx:823-826`), disabled on `scan.step === 'scanning' \|\| isRunActive \|\| stage === 'run'/'report'`; `handleSelect` in `ModeSwitch.tsx` calls `groupsActions.recomputeCheckedForMode(next)` before `onChange`; `ReviewScreen.tsx` branches every block (severity toggle / tag input / add block) on `mode` |
| 2 | In Add mode the checklist inverts — actionable/pre-checked vs. greyed with cause-specific reason — and the target card shows a pre-checked "Add to contacts" checkbox that, when unchecked, routes privacy-blocked groups to links | ✓ VERIFIED | `isActionableForMode` (`modeRules.ts`) implements the exact D-05 rule and is unit-tested (`modeRules.test.ts`, part of the 587 green tests); `GroupRow.tsx` now threads `activeMode` through `isActionable` (CR-01 fix, confirmed in source) and gates the add-grey-reason caption on `activeMode === 'add'` (CR-02 fix, confirmed in source); `TargetCard.tsx:253-267` renders the checkbox only when `mode === 'add'`, pre-checked via `targetStore`'s `addToContactsChecked: true` default |
| 3 | The user can edit the invite-link DM template (EN/CS defaults, placeholders); the edited template persists across runs | ✓ VERIFIED | `DmTemplateEditor.tsx` + `ReviewScreen.tsx` wire `setDmTemplate`/`getDmTemplate` through `templateClient.ts` to `src/main/ipc/templateChannels.ts`, which persists via `electron-store` (survives app restarts, not just session); CR-03 fix confirmed — `onReset` now returns the new default string and `handleReset` seeds `draft` from it directly |
| 4 | The review screen shows the add consequence line, exact group list, and exact rendered DM text before one explicit confirmation; target identity is sourced from main only | ✓ VERIFIED | `ReviewScreen.tsx` renders `consequenceLine`, `computeAddGroups` group list with mechanic notes, and `renderTemplate(currentTemplate, {...})` preview; `grep -c "addActions.startAdd("` returns exactly 1 and the call site passes only `addGroupActions.map(g => g.dialog.id)` — no identity/access hash/resume flag constructed in the renderer |
| 5 | Live per-group progress, per-group report with retry, add-log export via save dialog; every new string in EN and CS | ✓ VERIFIED | `GroupsPane.tsx` Add run/report block mirrors the Tag pattern (progress label, Stop/Stopping, FLOOD_WAIT, PEER_FLOOD, DM status line, retry via `retryAddGroup`); `ADD_EXPORT_LOG` main handler + Settings-menu/report-stage buttons wired (WR-01/WR-02 fixes confirmed in source); `add.json` (en/cs) and `groups.json` modeSwitch/greyReason keys present and parity-complete; `i18n.test.ts`'s `NAMESPACES` includes `'add'` and the test passes |

**Score:** 5/5 truths verified at the code level. All 5 roadmap success criteria are observably implemented and wired. Component-rendering/live-behavior aspects of these same truths are listed as human verification items below (Vitest runs in `environment: 'node'`, no DOM).

### Required Artifacts (spot-checked against PLAN frontmatter across all 13 plans)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/dmTemplate.ts` | `renderTemplate`, `DEFAULT_TEMPLATE_EN/CS`, `DM_TEMPLATE_MAX_LENGTH`, no Electron import | ✓ VERIFIED | Re-exported by `templateChannels.ts`; imported by `addValidation.ts` and `ReviewScreen.tsx` |
| `src/main/ipc/addChannels.ts` (`ADD_EXPORT_LOG`) | save-dialog + copy, no-log/canceled/ok result | ✓ VERIFIED | WR-02 try/catch confirmed around `copyFileSync` |
| `src/main/ipc/clipboardChannels.ts` | `CLIPBOARD_WRITE_TEXT` via Electron `clipboard` module | ✓ VERIFIED | File exists, registered in `main/index.ts` |
| `src/renderer/groups/modeRules.ts` | `isActionableForMode` pure predicate | ✓ VERIFIED | Single source of truth, consumed by both `groupsStore.ts` and `GroupRow.tsx` |
| `src/renderer/wizard/addValidation.ts` | `computeAddGroups`, `validateDmTemplate` | ✓ VERIFIED | WR-03 `d.canAdd` re-filter confirmed present |
| `src/renderer/wizard/wizardStage.ts` | `ADD_COMPLETE`/`ADD_STOPPED` events | ✓ VERIFIED | Both map to `'report'`, mirroring `TAG_COMPLETE`/`TAG_STOPPED` |
| `src/renderer/store/targetStore.ts` | contacts checkbox state + idempotent dispatch | ✓ VERIFIED | `addToContactsChecked`, `maybeAddToContacts()` guard on `contactAddAttempted` |
| `src/renderer/store/addStore.ts` | `startAdd`/`abortAdd`/`retryGroup`/`discardJob`/resume | ✓ VERIFIED | Mirrors `tagStore`/`removalStore` shape; unit-tested |
| `src/renderer/groups/ModeSwitch.tsx` | 3-way radiogroup | ✓ VERIFIED | Calls `recomputeCheckedForMode` before bubbling `onChange` |
| `src/renderer/groups/GroupRow.tsx` | mode-aware actionability + grey captions | ✓ VERIFIED | CR-01/CR-02 fixes present (`activeMode` prop threaded, gated captions) |
| `src/renderer/wizard/DmTemplateEditor.tsx` | edit/save/reset/validate UI | ✓ VERIFIED | CR-03 fix present (`onReset(): string`) |
| `src/renderer/removal/AddResumeJobDialog.tsx` | Resume/Discard dialog | ✓ VERIFIED | `onOpenChange={() => {}}` (CR-04 parity), mounted in `AppShell.tsx` |
| `src/renderer/shell/SettingsMenu.tsx` | Export add log entry | ✓ VERIFIED | WR-01 fix present (menu stays open on `no-log`) |
| `src/renderer/i18n/locales/{en,cs}/add.json` | full phase-15 string set | ✓ VERIFIED | Parity-complete, 3-form CS plurals present |

All artifacts declared across the 13 plans' `must_haves.artifacts` exist, are substantive (no stubs/placeholders), and are wired into their consumers.

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `templateChannels.ts` | `shared/dmTemplate.ts` | re-export | ✓ WIRED | `export { renderTemplate, DEFAULT_TEMPLATE_EN, DEFAULT_TEMPLATE_CS } from '@shared/dmTemplate'` |
| `addChannels.ts` | `addLogStore.ts` | `getLogPath()` | ✓ WIRED | Confirmed in `ADD_EXPORT_LOG` handler |
| `groupsStore.ts` | `modeRules.ts` | `isActionableForMode` | ✓ WIRED | Used in `recomputeCheckedForMode` and scan-complete rebuild |
| `GroupRow.tsx` | `modeRules.ts` | `isActionableForMode` | ✓ WIRED | CR-01 fix — `isActionable` now computed via the shared predicate |
| `GroupsPane.tsx` | `GroupRow.tsx` | `activeMode` prop | ✓ WIRED | Passed at every `<GroupRow>` instantiation (line 916) |
| `ReviewScreen.tsx` | `addValidation.ts` | `computeAddGroups(...)` | ✓ WIRED | Confirmed in handleConfirm's `add` branch context |
| `ReviewScreen.tsx` | `addStore.ts` | `addActions.startAdd(dialogIds)` single call | ✓ WIRED | `grep -c` returns 1; no identity/access-hash args |
| `AddResumeJobDialog.tsx` | `addStore.ts` | `startAdd`/`discardJob` | ✓ WIRED | Confirmed |
| `TargetCard.tsx` | `targetStore.ts` | `toggleAddToContacts`/`maybeAddToContacts` | ✓ WIRED | Confirmed |
| `GroupRow.tsx` | `clipboardClient.ts` | `writeClipboardText(addLink)` | ✓ WIRED | Confirmed at line 154 |
| `AppShell.tsx` | `addStore.ts` | `useAddStore()` auto-advance gated on `mode === 'add'` | ✓ WIRED | Confirmed, mirrors tag gate exactly |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|--------------|--------|----------|
| ADD-01 | 15-03, 15-09, 15-13 | Mode switch + review-screen action routing + selection reset | ✓ SATISFIED | ModeSwitch, modeRules, AppShell mode/severity split all confirmed |
| ADD-05 | 15-05, 15-11 | Contacts checkbox + idempotent dispatch | ✓ SATISFIED | targetStore + TargetCard confirmed |
| ADD-12 | 15-03, 15-10 | Add review screen (consequence, list, DM text, confirm, D-16 guard) | ✓ SATISFIED | ReviewScreen Add branch confirmed, incl. `isTargetInvalidForAdd` |
| ADD-13 | 15-07, 15-08, 15-09 | Live progress + report + retry | ✓ SATISFIED | addStore + GroupsPane/GroupRow Add run/report blocks confirmed |
| ADD-14 | 15-02, 15-06, 15-09, 15-12 | Add log export via save dialog | ✓ SATISFIED | `ADD_EXPORT_LOG` handler (WR-02 fixed) + two entry points confirmed |
| ADD-15 | 15-04 | EN/CS localization, 3-form CS plurals | ✓ SATISFIED | add.json/groups.json parity + i18n.test.ts NAMESPACES confirmed |
| ADD-16 | 15-01, 15-03, 15-10 | DM template editor, shared render helper, persistence | ✓ SATISFIED | dmTemplate.ts shared module + DmTemplateEditor (CR-03 fixed) confirmed |

No orphaned requirements found — REQUIREMENTS.md maps exactly ADD-01/05/12/13/14/15/16 to Phase 15, and all seven appear in at least one plan's frontmatter `requirements` field.

### Anti-Patterns Found

None. Scanned all 28 files listed in `15-REVIEW.md`'s `files_reviewed_list` for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented"/"coming soon" — zero matches. The only `return null` guard clauses found (`TargetCard.tsx:53,127`) are legitimate early-returns (no avatar bytes; no target state), not stubs.

### Code Review Fix Verification (post-`15-REVIEW.md`/`15-REVIEW-FIX.md`, main @ 3021462)

All 8 in-scope findings (3 critical, 5 warning) were independently re-verified by reading the current source, not by trusting `15-REVIEW-FIX.md`'s claims:

| ID | Claim | Verified |
|----|-------|----------|
| CR-01 | GroupRow mode-aware actionability | ✓ `isActionableForMode(dialog, membershipStatus, activeMode)` at `GroupRow.tsx:142`; `activeMode` threaded from `GroupsPane.tsx:916` |
| CR-02 | Add-grey-reason caption gated on `activeMode === 'add'` | ✓ Confirmed at `GroupRow.tsx:536,553` |
| CR-03 | Reset-to-default updates visible draft | ✓ `onReset(): string` return value seeds `draft` directly (`DmTemplateEditor.tsx`, `ReviewScreen.tsx:529-534`) |
| WR-01 | Settings menu stays open on "no-log" | ✓ Confirmed in `SettingsMenu.tsx:37-49` |
| WR-02 | `ADD_EXPORT_LOG` never rejects across IPC | ✓ try/catch around `copyFileSync` (`addChannels.ts:280-285`) + defensive catch at call site (`GroupsPane.tsx:546-554`) |
| WR-03 | `computeAddGroups` re-filters on `canAdd` | ✓ `.filter((d) => checkedIds.has(d.id) && d.canAdd)` at `addValidation.ts:39` |
| WR-04 | Mode-specific stop aria labels | ✓ `stopTagAria`/`stopAddAria` keys used at `GroupsPane.tsx:347,475`; Removal unchanged at `646` |
| WR-05 | Scan-progress fallback includes `add.step === 'idle'` | ✓ Confirmed at `GroupsPane.tsx:762` |

### Automated Verification Run

- `npx tsc --build` — clean, no errors (no stale `.js`/`.d.ts` emitted beyond the two hand-written files)
- `set -a; . ./.env; set +a; npx vitest run` — **44 files / 587 tests passing**, matching the documented post-fix baseline exactly
- `npm run build` (electron-vite) — main/preload/renderer bundles all built successfully
- Targeted re-run of the 8 phase-15 test files directly touching the reviewed areas (`modeRules.test.ts`, `addValidation.test.ts`, `addStore.test.ts`, `targetStore.test.ts`, `groupsStore.test.ts`, `addChannels.test.ts`, `dmTemplate.test.ts`, `wizardStage.test.ts`) — 113/113 passing

### Human Verification Required

See the `human_verification` list in the frontmatter above (10 items, largely sourced from `15-VALIDATION.md`'s own "Manual-Only Verifications" table, which the plan authors already flagged as untestable in a no-DOM Vitest environment). These cover: mode-switch visual/interaction behavior, the inverted-checklist visual partition, the live Telegram contacts/add-run/DM-send flows, the DM editor's live textarea behavior, the native save dialog, the resume-on-relaunch flow, Czech-copy idiomatic/layout quality, the deleted/bot-target guard against a real account, and the severity-persistence round-trip across mode switches.

### Gaps Summary

No gaps found. All 3 critical and 5 warning findings from the code review were independently re-verified as fixed in the current source (not merely claimed in `15-REVIEW-FIX.md`). All 5 roadmap success criteria are observably implemented and correctly wired end-to-end at the code level: mode switch → checklist partition → review screen → run/report → export, with the DM template shared between main and renderer for byte-identical preview/send, and target identity never leaving the main process. The full test suite (587/587) and build are green. The only remaining uncertainty is behavior that can only be observed in a running Electron app with a live Telegram session (visual rendering, native dialogs, a real contacts/add API round-trip, and Czech-language idiomatic/layout review) — none of which point to a missing or broken must-have in the codebase itself.

---

_Verified: 2026-10-04T02:21:36Z_
_Verifier: Claude (gsd-verifier)_
