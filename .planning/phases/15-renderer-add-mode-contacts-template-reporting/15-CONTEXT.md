# Phase 15: Renderer — Add Mode, Contacts, Template & Reporting - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning
**Mode:** `--auto` — every gray area resolved to the recommended option; the user reviews at UAT.

<domain>
## Phase Boundary

The renderer half of Add mode, on top of the Phase 14 main-process engine. The admin can switch the groups pane between Remove, Tag and Add before reviewing the checklist; in Add mode the checklist inverts (groups the target is not in and the admin can invite into are actionable and pre-checked, the rest greyed with the Phase 13 reasons); the target card gains a pre-checked "Add to contacts" checkbox; the invite-link DM template can be edited and previewed; the Add review screen shows the consequence line, the exact group list and the rendered DM text and requires one explicit confirmation; an add run shows live per-group progress and a per-group report with retry per failed group; the add log can be exported as plain text through a save dialog; an incomplete `add-job.json` offers Resume / Discard on launch. Every new string exists in English and Czech (formal vykání, 3-form plurals).

Out of scope: any executor, store, IPC gate or Telegram behaviour (Phase 14 owns those; the only main-process addition is a tiny "export add log" IPC that opens a save dialog and copies the file), Remove/Tag UI changes beyond moving the mode choice to the groups pane, and Premium upsell flows beyond the single hint.

Requirements owned here: ADD-01, ADD-12, ADD-13, ADD-15, plus the renderer halves of ADD-05 (checkbox + dispatch), ADD-14 (export) and ADD-16 (editor + preview). REQUIREMENTS.md already marks ADD-05/14/16 complete from Phase 14; this phase completes their user-visible halves.

</domain>

<decisions>
## Implementation Decisions

### Mode switch (ADD-01)
- **D-01:** A three-way segmented control **Remove / Tag / Add** lives in the groups pane header, visible in both browse (pre-confirm) and checklist mode, so it is reachable before the target is confirmed and before the checklist is reviewed. It is disabled while a scan is resolving a mode switch, during a run, and in the run/report stages.
- **D-02:** The mode is the single source of truth for which action the review screen offers. The review screen's existing three-way Kick/Ban/Tag picker is replaced: under Remove it shows the Kick/Ban severity toggle (persisted exactly as today), under Tag the tag input, under Add the add block. Severity persistence is unchanged; the **mode itself is not persisted** and defaults to Remove on every launch (existing behaviour stays the default).
- **D-03:** Switching mode **clears the checklist selection** and re-partitions the already-scanned rows without a new scan (scan results already carry membership status and `canAdd`). Mode survives a target change within the session; a target change still resets the pane to browse mode as today.
- **D-04:** `WizardStage` is unchanged; the stage machine gains `ADD_COMPLETE` / `ADD_STOPPED` events mirroring tag. The run→report auto-advance is gated on `mode === 'add'` exactly like the tag gate.

### Add-mode checklist (ADD-02/ADD-03 presentation)
- **D-05:** In Add mode a row is actionable and **pre-checked** when `canAdd` is true and the scan status is `not-member` or `banned` (the banned case already implies the unban right per Phase 13 D-02). Rows that are `member`, or carry an `addGreyReason`, are greyed and sorted below actionable rows with the existing `greyReason.*` line from the groups namespace. Rows still pending during the scan render as queued/unchecked and become pre-checked when their status resolves.
- **D-06:** Banned-but-actionable rows show a short note under the title, "Currently banned — the ban will be lifted first", so the admin sees the unban before confirming. Remove mode presentation is untouched.
- **D-07:** The run-trigger button reads "Review adding to N groups" (plural forms) and routes to the Add review screen. Selection count rules mirror Remove mode (at least one checked row required).

### "Add to contacts" checkbox (ADD-05)
- **D-08:** The checkbox appears on the target card only while mode is Add, in both the resolved and confirmed states, pre-checked by default. Its state lives in the renderer target store for the session (not persisted).
- **D-09:** Dispatch rule: if Add mode is active and the box is checked when the user clicks "Yes, this is the person", `target:addContact` is invoked right then. If the user enters Add mode after the target is already confirmed, the box still shows and the contact add is dispatched when the run is confirmed on the review screen. Either way it is non-blocking and happens at most once per target; unchecking after a successful add does not remove the contact (Phase 14 D-08).
- **D-10:** A failed contact add shows a quiet inline notice on the target card ("Couldn't add to contacts — invite links will be used where needed") and never blocks the flow. Mode switched away from Add hides the checkbox and the notice.

### DM template editor and preview (ADD-16, ADD-12)
- **D-11:** The editor lives **on the Add review screen** in a "Message to {name}" section: the rendered preview is always visible, with an "Edit template" toggle that reveals a textarea, a placeholder legend (`{name}`, `{links}`), "Save" and "Reset to default". Save calls `setDmTemplate`; Reset clears to the built-in default for the current language. No Settings-menu entry in this phase.
- **D-12:** Validation: the template must contain `{links}`; `{name}` is optional. Save is disabled with an inline message while `{links}` is missing, the text is empty, or it exceeds 4000 characters (the main-process Zod bound).
- **D-13:** The preview renders the current template with the target's display name substituted and `{links}` replaced by one italic placeholder line, "— invite links will be listed here, one per line —", since links only exist after the run. A caption states the message is sent once, at the end of the run, only if some groups required invite links. The rendering helper moves to a shared module so main and renderer render identically.

### Add review screen (ADD-12)
- **D-14:** Consequence line: "{name} will be added to N groups" with plural forms. Group list mirrors the removal list with a per-row mechanic note: "Invite" for supergroups and channels, "Add" for basic groups, "Ban will be lifted first" appended for banned rows. Totals block shows the count and any excluded rows.
- **D-15:** One explicit confirmation button, "Add {name} to N groups", with no secondary dialog. The confirm call is `startAdd(dialogIds)` only; the renderer never passes identity, access hashes or a resume flag (14-SECURITY T-14-16/T-14-20).
- **D-16:** If the resolved target is a deleted account or a bot (flags exposed through the existing target DTO), the confirm button is disabled with an explanation, in addition to the executor's own guard (Phase 14 D-05).

### Run progress and report (ADD-13)
- **D-17:** Reuse the groups-pane run/report pattern through a new `addStore` modelled on `tagStore` plus `removalStore`'s `retryGroup`. Row statuses: queued, adding, done, already-member, privacy-blocked, failed (with the ADD_* code line), skipped. Progress label "Adding {name} to group x of n…", Stop / Stopping, FLOOD_WAIT subline and PEER_FLOOD banner with "Resume adding", all mirroring tag copy.
- **D-18:** Privacy-blocked rows show "Invite link created" with a Copy button for the link and, when `premiumWouldAllow` is true, the hint "Telegram Premium would allow a direct add". Failed rows show the error line and the retry link (retry uses `retryAddGroup`).
- **D-19:** The report summary adds a DM status line: sent → "Invite links sent to {name} in one message"; refused → "{name}'s privacy settings refused the message — copy the links above and pass them along"; not-needed → no line. Links stay visible in the report regardless of DM status.

### Add log export (ADD-14)
- **D-20:** An "Export add log…" button appears in the report stage after an add run and as an entry in the Settings menu, so the log is reachable without running. Both call a new `ADD_EXPORT_LOG` IPC that opens `dialog.showSaveDialog` in main (default name `mrproper-add-log.txt`, filter `.txt`) and copies `add-log.txt` to the chosen path. When no log exists yet the handler returns a "no log" result and the UI shows "No add log yet".

### Resume prompt (ADD-08 UI)
- **D-21:** `AddResumeJobDialog` mirrors `TagResumeJobDialog`: mounts independently of the removal and tag dialogs when `getAddJob()` returns an incomplete job, title "Finish adding {name}?", body with x of n processed, "Resume adding" (default variant, non-destructive) and "Discard job". Resume sets mode to Add, stage to run, and calls `startAdd` with the remaining dialog ids (the IPC layer computes the continuation; the job id is preserved per Phase 14 D-20). Discard calls `discardAddJob`.

### Localization (ADD-15)
- **D-22:** All new strings go into a new `add` namespace (`en/add.json`, `cs/add.json`) mirroring `tag.json`'s key style; mode-switch labels live in the groups namespace; the DM-preview caption and editor strings live in `add`. Czech uses formal vykání and `_one` / `_few` / `_other` forms wherever a count appears. Claude drafts both languages; the user reviews at UAT.

### Claude's Discretion
- Component and file names (`ModeSwitch`, `AddResumeJobDialog`, `DmTemplateEditor`, `addStore.ts`, `addClient.ts`, the shared `dmTemplate.ts` module), exact Tailwind layout, and whether the mode switch is a shadcn toggle group or a styled button row.
- How the mode value is threaded (AppShell state vs. a small `modeStore`), as long as D-02's single-source rule holds.
- The exact wording of mechanic notes, the banned note, the DM caption, and the Premium hint.
- Whether the report shows links inline or behind a "Show link" toggle, as long as Copy is one click.
- Test strategy details: pure helpers (partitioning, consequence derivation, template validation) get Vitest unit tests like `reviewScreen.test.ts` and `tagValidation.test.ts`; component behaviour is covered at UAT.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/ROADMAP.md` — Phase 15 section: goal, five success criteria, `UI hint: yes`
- `.planning/REQUIREMENTS.md` — ADD-01, ADD-05, ADD-12, ADD-13, ADD-14, ADD-15, ADD-16 (and ADD-02/03 for checklist semantics)
- `.planning/PROJECT.md` — "Current Milestone: v1.7 Add Mode" target features (mode switch, contacts checkbox, DM preview, log export)

### Locked decisions from earlier phases
- `.planning/phases/13-add-rights-and-scan-semantics-foundation/13-CONTEXT.md` — D-01..D-09: `banned` status, `canAdd` rule, the four add grey reasons and their i18n lines
- `.planning/phases/14-addexecutor-dispatch-privacy-fallback-audit/14-CONTEXT.md` — D-05 (deleted/bot), D-08 (contact add at confirmation, non-blocking), D-09 (`premiumWouldAllow`), D-13/D-14 (DM status), D-15 (template placeholders and store), D-16 (resume prompt is Phase 15), D-17/D-18 (log export is a straight copy), D-19 (outcome vocabulary), D-20 (continuation resume)
- `.planning/phases/14-addexecutor-dispatch-privacy-fallback-audit/14-SECURITY.md` — T-14-16, T-14-17, T-14-20: the renderer never supplies identity, access hashes or a resume flag; bridge returns only safe shapes
- `docs/superpowers/specs/2026-06-20-member-tag-action-design.md` §8 Renderer / UX — the Tag-mode renderer conventions this phase extends

### Code contracts (read before writing UI)
- `src/shared/addTypes.ts` — `AddState`, `AddGroupOutcome`, `AddJobFileSafe`, `AddDmStatus`, `AddErrorCode`
- `src/shared/groupTypes.ts` — `AdminDialogDTO.canAdd` / `addGreyReason`, `AddGreyReason`
- `src/preload/index.ts` — Add bridge: `startAdd`, `abortAdd`, `retryAddGroup`, `getAddState`, `onAddState`, `getAddJob`, `discardAddJob`, `addContact`, `getDmTemplate`, `setDmTemplate`
- `src/main/ipc/templateChannels.ts` — `renderTemplate`, `DEFAULT_TEMPLATE_EN` / `DEFAULT_TEMPLATE_CS` (to be shared with the renderer per D-13)
- `src/main/ipc/addChannels.ts` — gate chain the UI must respect (dialog ids only)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/shell/AppShell.tsx` — wizard stage machine, `action` state (`'kick' | 'ban' | 'tag'`) and the tag run→report gate; the mode switch and add gate slot in here.
- `src/renderer/groups/GroupsPane.tsx` + `GroupRow.tsx` — checklist partitioning (actionable first, greyed below), per-row removal/tag status sublines, run trigger button, retry links; Add mode adds a third partition rule and status subline.
- `src/renderer/wizard/ReviewScreen.tsx` — `computePlannedActions` / `computeTagGroups` pure helpers, identity block, consequence line, totals, single confirm; the Add variant adds `computeAddGroups` and the DM section.
- `src/renderer/store/tagStore.ts` and `removalStore.ts` — `useSyncExternalStore` store shape with `pendingJob`, subscriptions on first subscribe, `retryGroup` (removal only); `addStore` clones this.
- `src/renderer/removal/TagResumeJobDialog.tsx` — the resume dialog to mirror.
- `src/renderer/target/TargetCard.tsx` — confirm gate where the contacts checkbox and failure notice go.
- `src/renderer/shell/SettingsMenu.tsx` — language/theme/logout menu; gains the export entry.
- `src/renderer/ipc/tagClient.ts` — thin bridge wrapper pattern for `addClient.ts`.
- `src/renderer/i18n/locales/{en,cs}/tag.json` — key naming and plural conventions; `groups.json` already holds the four add grey-reason lines.

### Established Patterns
- Stage is explicit state in AppShell, never derived from store state (Phase 6 Pitfall 2); resume dialogs derive `open` from `pendingJob` reactively (Pitfall 1).
- Each feature has its own i18n namespace; Czech plurals use `_one` / `_few` / `_other`; counts via `{{count}}`.
- IPC payloads carry dialog ids and options only; identity stays in main.
- Pure derivation helpers are exported and unit-tested without jsdom.

### Integration Points
- `AppShell` mode state → `GroupsPane` (`activeMode`), `ReviewScreen` (`mode`), `TargetCard` (checkbox visibility), resume dialogs.
- `src/main/index.ts` / a new `ADD_EXPORT_LOG` channel in `src/shared/channels.ts` → preload bridge → Settings menu and report button.
- `src/shared/` gains the DM template render helper imported by both `templateChannels.ts` and the review screen.

</code_context>

<specifics>
## Specific Ideas

- Mode switch wording: "Remove / Tag / Add" in English, "Odebrat / Označit / Přidat" in Czech.
- Default template copy already shipped in Phase 14 (English and Czech) is the baseline the preview shows on first launch.
- The admin should always be able to copy a generated link from the report, especially when the DM was refused.

</specifics>

<deferred>
## Deferred Ideas

- Persisting the chosen mode across launches — rejected for now; Remove stays the launch default.
- Editing the DM template from the Settings menu or keeping multiple templates — later, if asked.
- Regenerating an expired link from the report UI — not in scope; links are regenerated only by a completed resumed run.
- A richer Premium upsell beyond the one-line hint — out of scope.
- Exporting `add-job.json` or the report itself (only the plain-text add log is exported).

</deferred>

---

*Phase: 15-renderer-add-mode-contacts-template-reporting*
*Context gathered: 2026-10-04 via --auto*
