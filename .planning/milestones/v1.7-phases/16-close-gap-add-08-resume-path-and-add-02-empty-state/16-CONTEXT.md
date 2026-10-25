# Phase 16: Close gap: ADD-08 resume path and ADD-02 empty state - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the blockers and warnings recorded by the v1.7 milestone audit (`.planning/v1.7-MILESTONE-AUDIT.md`) so the milestone can be completed:

1. **ADD-08 — Resume path.** A stopped, hard-stopped or interrupted add run can be resumed from the Resume / Discard prompt and continues the *same* job from its checkpoint, including after an app relaunch.
2. **ADD-02 — Add-mode empty state.** Add mode shows the inverted checklist whenever at least one row is actionable; an Add-specific empty state appears only when nothing is actionable.
3. **ADD-02 / ADD-07 — banned rows without the unban right** are greyed up front (Phase 13 D-02 finally implemented) instead of failing at run time.
4. **Audit tech debt:** DM default-language alignment between main and renderer, group titles in the add log, Change-target / queued-row consistency, Tag-mode empty-state copy, 14-VALIDATION status, 13-02 polarity note.

No new capabilities. Remove and Tag behaviour is unchanged except for the small Tag empty-state copy addition.

</domain>

<decisions>
## Implementation Decisions

### Resume contract (ADD-08)
- **D-01:** **The renderer sends the full dialog-id set on Resume.** `AddResumeJobDialog.handleResume` and `addStore.resumeJobFromDisk` pass `job.dialogIds` (the whole job), not the remaining subset. `AddExecutor`'s continuation gate (`sameDialogIdSet` on the full set, Phase 14 D-20) and the existing `addExecutor.test.ts` continuation tests stay untouched. ADD_START's dialog-map gate still applies to the full set.
- **D-02:** **Skipped groups are resumable.** A user Stop checkpoints unprocessed groups as `'skipped'`; Resume reprocesses them (the executor already filters `'skipped'` out of the seeded outcomes). The dialog's "x of n processed" count and the "nothing left to resume" guard both exclude `'skipped'` outcomes. A job whose non-skipped outcomes cover every dialog is treated as finished (no Resume prompt).
- **D-03:** **Relaunch resume rebuilds the target from the job file.** When `params.resume` is true and `resolver.getResolvedUser()` is null, `AddExecutor.execute()` builds the target peer from `add-job.json`'s `targetId` / `targetAccessHash` / `targetName` (as `addTypes.ts` already documents) and continues. Identity still never comes from the renderer payload (T-05-04-B). A non-resume start with a null resolver keeps today's idle return.
- **D-04:** **Resume waits for enumeration.** The Resume button is disabled with a short "Loading your groups…" hint until the groups state is `loaded`; ADD_START's "enumerator not ready → return state" branch is unchanged. `addStore.startAdd` must not clear `pendingJob` when the returned state is still `idle` (the dialog stays until a run actually started).
- **D-05:** **Lineage guarantees (Phase 14 D-13 / D-18) are kept and proven.** A resumed run that completes sends one DM covering links from every segment (links older than 5 days regenerated) and appends a CONTINUATION log block referencing the original job id. Add a cross-process test that drives a stopped job through the renderer-side resume call (full set) into `AddExecutor.execute` and asserts same job id, prior outcomes retained, skipped groups reprocessed, follow-up block written.

### Add-mode empty state (ADD-02)
- **D-06:** **Add mode replaces the checklist with an empty state only when no row is actionable** for Add (`isActionableForMode(..., 'add')` false for every scanned row after the scan completes). The existing "not in any of your groups" branch in `GroupsPane.renderEmptyState` is gated to Remove and Tag; it must never render in Add mode.
- **D-07:** **Cause-aware copy, two lines.** Heading "Nothing to add". Body distinguishes the dominant cause: all rows `already-member` → "{name} is already in every group you can invite them to"; otherwise → "{name} can't be added to the remaining groups — you lack the invite right or the group is full". Czech in formal vykání. Claude drafts en/cs in the `add` namespace (or `groups.emptyState`, Claude's call); the user reviews at UAT.
- **D-08:** **Tag mode gets its own empty-state body line** (the Remove body says "remove them from", which is wrong for Tag). Heading stays shared; one new body key per language. No other Tag change.

### Banned rows without the unban right (ADD-02 / ADD-07, Phase 13 D-02)
- **D-09:** **Keep Phase 13 D-02: grey the row.** A `'banned'` scan status is actionable in Add mode only when the admin can lift the ban; otherwise the row is greyed with the existing `greyReason.banned-no-unban-right` line. No doomed runs.
- **D-10:** **New main-computed DTO boolean.** `GroupEnumerator` adds a rights flag (working name `canUnban` = `creator || adminRights.banUsers === true`) to `AdminDialogDTO` for supergroups and broadcast channels, **independent of `canAct`** (which is always false for broadcast channels). Basic groups carry `false`/irrelevant since they have no ban visibility (Phase 13 D-03). `modeRules.isActionableForMode` for Add becomes `canAdd && (status === 'not-member' || (status === 'banned' && canUnban))`; the partition assigns `'banned-no-unban-right'` as the displayed grey reason for a banned row with `canUnban === false`. The renderer still only combines main-computed booleans (ADD-04 holds; no raw rights cross the bridge).
- **D-11:** **Row copy:** a greyed banned row shows only the grey-reason line; the "Currently banned — the ban will be lifted first" note (Phase 15 D-06) is reserved for actionable banned rows.
- **D-12:** `computeAddGroups` (review-screen list) and the groups-store pre-check rebuild use the same predicate, so a greyed banned row can never reach ADD_START. The executor keeps its existing behaviour if one slips through (unban fails → `failed(ADD_NO_RIGHTS)`).

### Tech-debt bundle
- **D-13:** **Main resolves the DM default language at render time.** `getDmText` reads the stored language when it renders (not once at launch), so an in-session language switch is reflected in the sent DM and the renderer preview stays byte-identical to it. No renderer change; the stored template, when present, still wins.
- **D-14:** **Add-log entries carry the group title** with the dialog id as fallback. `AddExecutor` passes `title` from the enumerator's dialog list into `addedDialogs` / `linkedDialogs`; the log writer already prints `title ?? dialogId`. Existing log blocks are untouched.
- **D-15:** **"Change target" is disabled during any run** (Remove, Tag or Add), using the same `isRunActive` rule the groups pane uses.
- **D-16:** **Rows never selected for the Add run show no run status** (not "queued") during and after the run; only rows in the job's `dialogIds` get queued/adding/outcome rendering. Remove/Tag rendering is left as is.
- **D-17:** **Docs housekeeping, no code change:** promote `14-VALIDATION.md` from `draft`; correct the inverted polarity sentence in `13-02-SUMMARY.md` to match the code (`ChannelParticipantBanned.left === true → 'banned'`, `left` unset → `'member'`). The user confirmed that restricted-but-present participants being actionable in Remove mode is the intended behaviour.

### Claude's Discretion
- Exact DTO field name for the unban-right flag and whether it is also surfaced in `addGreyReason` by main or assigned only at partition time in the renderer (D-10 allows either, as long as main computes the boolean).
- Where the Add-mode and Tag-mode empty-state keys live (`groups.emptyState` vs `add` namespace) and the exact en/cs wording.
- How the "Loading your groups…" state reaches `AddResumeJobDialog` (groups store subscription vs prop).
- Shape of the cross-process resume test (one Vitest file exercising `addStore`-equivalent logic plus `AddExecutor`, or a main-side test that mimics the renderer call) — it must cover the stopped-then-resumed case with ≥1 prior `done` and ≥1 `privacy-blocked` outcome.
- Whether the resume-from-prompt path also restores the target card / progress rows in the groups pane without a confirmed target; minimum bar is that the run progresses and the report renders.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit (source of every gap in this phase)
- `.planning/v1.7-MILESTONE-AUDIT.md` — blockers 1–4, warnings, file:line evidence, recommended fix set.

### Locked decisions from earlier phases
- `.planning/phases/14-addexecutor-dispatch-privacy-fallback-audit/14-CONTEXT.md` — D-13 (one DM at completion, links from every segment), D-16 (job file shape, `targetAccessHash` on disk), D-18 (follow-up log block), D-20 continuation semantics.
- `.planning/phases/15-renderer-add-mode-contacts-template-reporting/15-CONTEXT.md` — D-05 (Add-mode actionability), D-06 (banned note), D-15 (confirm sends `dialogIds` only), D-21 (resume dialog).
- `.planning/phases/13-add-rights-scan-semantics-foundation/13-CONTEXT.md` — D-01 (scan polarity, revised), D-02 (banned-no-unban-right rule), D-03 (basic groups have no ban visibility), D-04/D-06 (`canAdd`, broadcast channels).
- `.planning/phases/14-addexecutor-dispatch-privacy-fallback-audit/14-SECURITY.md` — T-14-01 (accessHash never crosses contextBridge), T-14-15 (dialog-map gate), T-14-16 (`resume` never from renderer), T-14-20 (`startAdd(dialogIds)` only).
- `.planning/phases/15-renderer-add-mode-contacts-template-reporting/15-SECURITY.md` — T-15-03 (ADD_EXPORT_LOG auth gate), T-15-04 (shared max length).

### Requirements
- `.planning/REQUIREMENTS.md` — ADD-02, ADD-04, ADD-07, ADD-08, ADD-11, ADD-12, ADD-14, ADD-16.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/telegram/AddExecutor.ts` — continuation gate (`isContinuation`, `sameDialogIdSet`), skipped-outcome reprocessing, `_markRemainingSkippedAndStop`, end-of-run DM and `appendBlock` — all already implement D-02/D-05 once the renderer sends the full set.
- `src/shared/addTypes.ts` — `AddJobFile.targetAccessHash` / `targetName` already persisted for D-03.
- `src/renderer/removal/AddResumeJobDialog.tsx`, `src/renderer/.../addStore.ts` (`resumeJobFromDisk`, `startAdd`) — the two renderer resume call sites to change.
- `src/renderer/.../modeRules.ts` (`isActionableForMode`) — single predicate used by `groupsStore` pre-check, `GroupsPane` partition and `addValidation.computeAddGroups`; D-10 changes it in one place.
- `src/main/telegram/GroupEnumerator.ts` — `canAct` already computes `creator || adminRights.banUsers`; D-10's flag is the same expression without the broadcast-channel `false` override.
- `src/renderer/i18n/locales/{en,cs}/groups.json` — `greyReason.banned-no-unban-right` copy exists; `emptyState.notInAny*` is the Remove-mode branch to gate.
- `src/main/storage/addLogStore.ts` — already prints `title ?? dialogId`.
- `src/main/index.ts` (`getDmText`, `getStoredLanguage`) and `src/main/ipc/languageChannels.ts` — D-13 touch point.
- `src/renderer/.../TargetCard.tsx` (`isRemovalRunning`) and `GroupsPane.tsx` (`isRunActive`, `getAddStatus`) — D-15/D-16 touch points.

### Established Patterns
- Identity never crosses the bridge; `resume` is computed in main from the on-disk job; renderer sends `dialogIds` only (Zod `min(1)`). D-01 fits this; D-03 must read the job file inside main only.
- Pure helpers get Vitest unit tests (`modeRules.test.ts`, `addValidation.test.ts`, `addStore.test.ts`, `addExecutor.test.ts`); component behaviour is covered at UAT. `addStore.test.ts:273` currently locks in the "empty remaining → return" behaviour and must be updated for D-02.
- Run `tsc --build` then delete emitted `.js`/`.d.ts` under `src/` before Vitest (see memory note on the tsc pitfall). Full suite baseline: 616/618 with `.env` sourced (2 known `config.test.ts` env failures).

### Integration Points
- `AppShell.tsx` mounts `AddResumeJobDialog` when `pendingAddJob` exists and sets mode/stage on resume; D-04's loading hint needs the groups state there or in the dialog.
- `addChannels.ts` ADD_START: unchanged gates; D-04 relies on its existing "not loaded → return state" branch.
- `GroupsPane.renderEmptyState` / `GroupsPane.tsx:903` (`emptyState ?? <list>`) — D-06/D-08.

</code_context>

<specifics>
## Specific Ideas

- Resume must work straight from the launch prompt after a relaunch, without re-resolving the target.
- Empty-state copy should tell the admin *why* nothing can be added, not just that nothing can.
- The user explicitly reaffirmed Phase 13 D-02 ("no doomed runs") over the simpler "let the run report it" option.

</specifics>

<deferred>
## Deferred Ideas

- Showing the target card and avatar for a run resumed from the prompt before any target is confirmed (beyond the minimum of progress + report rendering) — polish, only if cheap during this phase.
- Changing Remove/Tag queued-row rendering for unselected rows — same pattern as Add but out of this gap's scope.
- Remove/Tag relaunch-resume rebuilding the target from their job files — they share the resolver dependency but have no stored access hash; separate backlog item.
- `wizardStage.ts` ADD_* events and `DmTextProvider` type orphans — harmless; clean up opportunistically or never.

</deferred>

---

*Phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state*
*Context gathered: 2026-10-04*
