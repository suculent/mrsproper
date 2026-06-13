# Phase 6: UI Integration — Wizard, Safety Gates & Progress - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

The full end-to-end wizard ties the services together, gating destructive action behind a dry-run preview and a final review screen that shows the target's numeric ID and exact affected groups, requiring one explicit confirmation before live execution with progress and report.

Requirements: SAF-01, SAF-02, SAF-03.

</domain>

<decisions>
## Implementation Decisions

### Wizard Structure & Navigation
- Formalize the existing two-pane flow into named stages (Target → Groups → Review → Run → Report) with a slim step indicator — NOT a modal-stepper rewrite; Phase 6 adds gates over the working UI.
- The kick/ban severity selector (deferred from Phase 5) lives on the Review screen as a segmented control — "the chosen action" per ROADMAP. Default **Kick** (per ROADMAP success criterion 1); last choice remembered via electron-store (non-secret pref).
- Back navigation: every stage can go back (Change target / Edit selection) until execution starts; locked during the run.
- The Review screen REPLACES Phase 5's minimal RemovalConfirmDialog — one explicit confirmation lives on the Review screen (no double-confirm). Remove/retire the dialog path for the start-run flow (ResumeJobDialog stays).

### Dry-Run / Preview Semantics
- Dry-run is a pure local simulation — ZERO Telegram calls: per-group planned mechanic (ban via editBanned / kick via restrict-then-unban / deleteChatUser with ban-fallback note for basic groups), rights from enumeration, predicted outcome.
- The Review screen IS the dry-run report — one surface listing exactly what will happen per group, with warnings.
- The preview is mandatory: the Review screen always renders before the confirm button is reachable (SAF gating).
- Per-group warnings: "rejoin can't be blocked" (basic-group ban fallback), greyed no-rights groups excluded from the run, plus total counts up front.

### Review Screen Content & Confirmation
- Identity block: avatar + full name + @username + numeric ID (ROADMAP-required) in monospace.
- Confirmation: single explicit destructive button ("Ban/Kick {name} from {N} groups"). No type-to-confirm.
- Affected groups: scrollable list with title + member count + per-group mechanic note.
- After-run: Report stage with "Remove someone else" (TARGET_RESET → Target stage); job archived in the audit file.

### Run/Report Integration & Polish
- Run progress reuses the Phase 5 progress slot/summary band; the wizard's Run stage frames it.
- FLOOD_WAIT subline (Phase 5 UI-audit gap) is IN SCOPE: plumb governor wait state into removalStore and render the subline + FloodCountdown ("Telegram asked us to slow down — resuming automatically." / removalCopy.floodWaitSubline exists, currently dead code).
- "Remove someone else" → TARGET_RESET → Target stage with removal state cleanly idle (abortExecution idle-reset fix from af0b779 already supports this).
- Resume flow: ResumeJobDialog stays; resuming jumps directly to the Run stage.

### Claude's Discretion
- Step indicator visual form, stage state machine shape, file layout — follow established patterns.
- How severity preference persistence is wired (electron-store usage pattern — first use in repo; add dependency only if not present).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 5 shipped: RemovalExecutor (severity param), removalChannels (REMOVAL_START Zod+auth+dialog gates, double-start guard), removalStore (cached snapshot, resumeJobFromDisk), removalCopy (severity-keyed strings incl. unused floodWaitSubline), RemovalConfirmDialog (to be retired from start flow), ResumeJobDialog, GroupRow removal statuses, GroupsPane run-trigger/progress slot/summary band, TargetCard lock-during-run.
- targetStore mode ('browse'/'checklist') drives the current two-pane flow; wizard stages can derive from target/scan/removal state rather than new global state.
- Phase 4.1: name search path fully integrated into the same confirm gate.

### Established Patterns
- All identity from main (T-05-04-B); renderer sends dialogIds + severity only.
- CR-01/02/03 lessons; generation guards; abortExecution idle-reset (af0b779).
- Copy modules per feature (removalCopy/searchCopy/groupsCopy) — no hardcoded strings (Phase 8 i18n depends on it).
- Type-check gate: `npx tsc --build --force` (root `npx tsc --noEmit` is a NO-OP — files:[] + references). Known pre-existing --build errors in mocks/config are accepted.
- Tests: vitest, mock GramJS client with call recording.

### Integration Points
- removal:start IPC currently reachable straight from the GroupsPane run-trigger via RemovalConfirmDialog — Phase 6 must re-route: run-trigger → Review stage → confirm → startRemoval.
- Severity: REMOVAL_START schema already accepts 'kick' | 'ban'; the hardcoded 'ban' default in GroupsPane dispatch must be replaced by the Review-screen selector value (default kick, persisted).
- Governor wait events: governor already emits FLOOD_WAIT events (targetStore.governorFloodRemaining pattern exists) — removal flow needs the same wiring into removalStore/Run stage.
- UI-SPEC for Phase 6 should inherit Phases 4/4.1/5 contracts; Review screen is the main new surface.

</code_context>

<specifics>
## Specific Ideas

- Phase 5 UI-audit advisories to absorb where cheap: summary-line bold scoping, aria-label plural ("1 groups"), `gap-0.5` off-scale spacing, hardcoded aria strings → copy modules.
- One explicit confirmation only — the PROJECT safety constraint is satisfied by the Review screen.

</specifics>

<deferred>
## Deferred Ideas

- Type-the-name-to-confirm hard gate — possible v2 hardening.
- Job history browser (multiple archived reports) — v2.

</deferred>

---

*Phase: 06-ui-integration-wizard*
*Context gathered: 2026-06-12 via smart discuss (autonomous mode)*
