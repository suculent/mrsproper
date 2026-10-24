# Phase 17: Close gap: ADD-08/ADD-12 — relaunch-resume UI visibility and target-identity lock - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the two critical findings from the 2026-10-24 v1.7 re-audit (`.planning/v1.7-MILESTONE-AUDIT.md`):

- **F1 (ADD-08):** after a relaunch Resume, the groups pane must show the running add job (progress, Stop, PEER_FLOOD Resume banner, summary/report band) even though no target was confirmed this session.
- **F2 (ADD-12):** the add job's target identity is locked. Resolving or confirming a different person can't retry, resume or start an add run against job A's groups.

The user also folded in the non-critical findings F3, F4, F5 and F6 and the audit's tech-debt list (see the "Folded findings" decisions). No new capabilities beyond these.

</domain>

<decisions>
## Implementation Decisions

### Relaunch run view (F1)
- **D-01:** **Band + job card.** While add is non-idle and no target is confirmed (the relaunch path), the groups pane shows (a) the Add progress/Stop/PEER_FLOOD/report band and (b) a compact read-only target card built from the job: `add.targetName` and a placeholder initial. No avatar and no extra Telegram call. All Add band labels (progress, DM status lines) use `add.targetName`, not the renderer's confirmed-target name. This also applies to the in-session path, where the names are the same.
- **D-02:** **Mode is forced to Add and the switch is locked.** On a relaunch Resume the active mode becomes `'add'`, and Remove/Tag are disabled for as long as the add job is non-idle (running, stopping, hard-stopped, stopped or complete with its report shown). The lock ends when the admin leaves the job (D-08).
- **D-03:** **Only the job's groups are listed.** During a relaunch-resumed run the list shows only the job's `dialogIds`, with queued/adding/outcome statuses. No checkboxes, and no live-scan-dependent rendering, because there is no scan for this target.
- **D-04:** The `GroupsPane` mode derivation (`targetState.target.step === 'confirmed' ? 'checklist' : 'browse'`, GroupsPane.tsx:95) must not hide the Add slot. The Add slot and report band render whenever `add.step !== 'idle'`, whatever the target state. The scan auto-start/abort effects must not fire against the job view.

### Identity lock (F2)
- **D-05:** **Target lookup is blocked in the UI and in main while add is non-idle.** The renderer hides or disables the target input. Main rejects `TARGET_RESOLVE` and `TARGET_CONFIRM` while the AddExecutor state is non-idle and returns the unchanged state or an error, never resolving. `TARGET_RESET` still aborts and clears, as it does today (T-14-19). This is the only way out of a job.
- **D-06:** **`retryGroup` uses the job's target only.** It uses `this._resolvedTarget` (rebuilt from `add-job.json` on relaunch) and drops the `this._resolver.getResolvedUser() ??` preference (AddExecutor.ts:592). If the live resolver holds a user whose id differs from the job's `targetId`, the retry is refused (no-op or failed state, never a Telegram call).
- **D-07:** **A mismatched Resume is rejected and the job is kept.** If `resume` would be true but the confirmed resolver target's id doesn't equal the job's `targetId`, ADD_START/`execute` rejects the request. The job file stays untouched, nothing is sent to Telegram, and the resume dialog shows its existing `resumeFailed` message. A mismatched resume must never fall through to `initJob()` as a fresh job for the other person. The same rule applies to the PEER_FLOOD banner's `resumeJobFromDisk`.

### Leaving the resumed job
- **D-08:** **Retry stays available on a relaunch-resumed report.** Failed rows offer retry as they do in-session, and the retry uses the job target (D-06).
- **D-09:** **The exit works as it does today.** "Add someone else" calls `targetActions.resetTarget()`, which aborts and clears add state, unlocks the mode switch and target input, and navigates to the target screen. The job file stays as the record. No new "Done" button.

### Folded findings
- **D-10 (F3): Unban-first survives a relaunch.** Each group's banned status at job creation is persisted in `add-job.json` (main-only, like the access hash). Resume and retry use it when there's no live scan result, so a banned target is unbanned before the invite instead of failing `ADD_USER_KICKED`. Older job files without the field behave as they do today.
- **D-11 (F4): In-session Resume after a user Stop.** The stopped summary band gets a "Resume" button. It continues the same job with the full dialog-id set, reprocesses skipped rows, and uses the same path as the PEER_FLOOD banner's Resume (`resumeJobFromDisk`). The `pendingJob` that is read only on the first store subscribe must not be the only source; re-read the job after a stop.
- **D-12 (F5): A retry that ends privacy-blocked logs and DMs its link.** The new link is appended to the add log (title, timestamp, link) and sent at once as a short DM using the saved template (or the default in the current language) containing only that link. The retry was an explicit admin action, so there's no extra confirmation. A refused DM is reported on the row. PEER_FLOOD hard-stop handling stays as it is (WR-01/CR-03).
- **D-13 (F6): The first-launch DM language matches the preview.** On a first launch with no saved language preference, main's language cache must resolve to the same language the renderer's i18n picked from the OS (e.g. `cs` on a Czech OS), so the previewed default DM and the sent default DM are byte-identical.
- **D-14 (tech debt):**
  - Zero dialogs in checklist mode shows a message instead of a blank list (`getAddEmptyState` returns `'none'` today).
  - Fix the stale inverted-polarity docblock at `MembershipScanner.ts:233` (comment only).
  - Update `16-VERIFICATION.md` status (UAT 3/3 passed) and the `16-VALIDATION.md` draft/nyquist status where justified.
  - Add a relaunch-resume test that goes through the ADD_START IPC resume computation and store logic, not `executor.execute({resume:true})` directly. It must cover F1 (band visible, Stop works) and F2 (mismatched resolver identity is rejected).
  - Optional, if cheap: dialogs added by a refresh after the scan are no longer silently excluded from Review; dead `DmTextProvider` / `wizardStage` ADD_* consumers are removed or wired. These two items may be deferred if they grow.

### Claude's Discretion
- Exact rendering of the job card (reuse `TargetCard` in a read-only variant vs a small new component) and the placeholder-initial style.
- Whether the target-lookup block in main returns the unchanged state or throws a typed error, as long as the renderer surfaces nothing misleading.
- Field name and shape for the persisted banned flag in `add-job.json` (D-10).
- Exact en/cs copy for any new strings (Resume on the stopped band, zero-dialogs message, retry DM row status). Czech uses formal vykání; the user reviews at UAT.
- How main learns the renderer's OS-derived language on first launch (D-13): renderer pushes it, or main uses the same detection, as long as the two agree.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gap source
- `.planning/v1.7-MILESTONE-AUDIT.md` — F1–F6, tech-debt list, and the evidence/line references for every decision above

### Prior phase decisions
- `.planning/phases/16-close-gap-add-08-resume-path-and-add-02-empty-state/16-CONTEXT.md` — resume contract D-01..D-05 (full dialog-id set, skipped resumable, target rebuilt from the job file, enumeration-gated Resume); still binding
- `.planning/phases/14-addexecutor-dispatch-privacy-fallback-audit/` — AddExecutor D-13/D-18/D-20 (lineage, one DM per job, continuation gate), T-14-16 (resume never from the renderer), T-14-19 (TARGET_RESET aborts the add run)
- `.planning/phases/15-renderer-add-mode-contacts-template-reporting/` — Add band/report UI (D-17..D-20), DM template

### Requirements
- `.planning/REQUIREMENTS.md` — ADD-08 (stop/resume), ADD-12 (identity confirmed against review), plus ADD-07/ADD-11/ADD-14/ADD-16 touched by the folded findings

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GroupsPane.renderProgressSlot` Add branches (a-add/b-add/c-add, GroupsPane.tsx:~470-650): already implements the progress, PEER_FLOOD and summary bands. It needs to be reachable without `mode === 'checklist'`, and labels need to switch to `add.targetName`.
- `addActions.resumeJobFromDisk` / `getResumeDialogIds` (`src/shared/addResume.ts`): the shared resume helpers for the F4 Resume button.
- `runActivity.ts` `isAnyRunActive`: existing run-active rule (used by TargetCard's Change-target gating). Extend or reuse it for the mode-switch and target-input lock.
- `TargetCard.tsx`: candidate for a read-only job-card variant.
- `AddExecutor.execute` relaunch rebuild (AddExecutor.ts:211-235): already rebuilds `_resolvedTarget` from the job file. D-06/D-07 build on it.

### Established Patterns
- Identity never crosses the bridge from the renderer (T-05-04-B); resume intent is computed in main (T-14-16). All new guards live in main, with the renderer gating only as UX.
- Generation-guarded async in executors (`_generation` captured before await).
- Structural-type injection in `registerTargetChannels` (pass `addExecutor` with a narrow `{ abortExecution(); getState() }`-style interface to avoid cycles).
- en/cs i18n namespaces (`add`, `groups`); Czech uses formal vykání.

### Integration Points
- `src/main/ipc/targetChannels.ts:83-93`: add the non-idle add guard to TARGET_RESOLVE/CONFIRM.
- `src/main/telegram/AddExecutor.ts:592` (`retryGroup`) and `execute()`: job-target-only plus mismatch rejection.
- `src/main/ipc/addChannels.ts:136-180` (ADD_START resume computation): mismatch rejection before `execute`.
- `src/renderer/store/addStore.ts` (`pendingJob` read once at :67): re-read after Stop for F4.
- `src/renderer/groups/GroupsPane.tsx:95` mode derivation, scan effects, and row list filtering.
- `src/main/ipc/languageChannels.ts` (`preloadLanguageCache`/`getCachedLanguage`): F6.
- `src/main/telegram/MembershipScanner.ts:233`: docblock.

</code_context>

<specifics>
## Specific Ideas

- The audit names the minimum F1 fix ("show the Add progress slot and report band whenever add is non-idle, and use `add.targetName`"). The user chose the richer version: a job card, forced and locked Add mode, and only the job's rows.
- UAT 16-1 missed F1/F2 because the cross-process test bypassed IPC and the UI. The new test must go through them (D-14).

</specifics>

<deferred>
## Deferred Ideas

None. Discussion stayed within phase scope, and all non-critical audit findings were folded in.

</deferred>

---

*Phase: 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta*
*Context gathered: 2026-10-24*
