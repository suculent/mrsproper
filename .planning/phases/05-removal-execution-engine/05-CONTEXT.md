# Phase 5: Removal Execution Engine - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

A durable, sequential, throttled executor removes the target from each selected group using the correct mechanic for its type and the chosen kick/ban severity, isolating per-group failures and emitting live progress plus a final per-group report.

In scope: the removal engine (main process), severity semantics, durable job state (AuditStore), pacing, abort/resume, live progress emission, persisted per-group report, and a minimal destructive-confirm dialog. Out of scope (Phase 6): the full wizard, dry-run preview, final review screen, and the visible kick/ban selector UI.

Requirements: RMV-01, RMV-02, EXE-04, EXE-05.

</domain>

<decisions>
## Implementation Decisions

### Severity Choice (Kick vs Ban)
- ENGINE-ONLY in Phase 5: the engine + IPC accept a severity parameter ('kick' | 'ban') per run; NO visible selector ships in this phase. For Phase 5 testing, the dispatch uses a hardcoded default severity of **'ban'** (user decision). The visible Kick/Ban selector ships with the Phase 6 wizard, defaulting to Kick per ROADMAP success criterion 1.
- Ban is permanent (until manually unbanned in Telegram) — no timed-ban options.
- Ban severity on basic groups (no banned-rights support): fall back to kick with an explicit per-group annotation in progress + report ("Removed — rejoin can't be blocked in basic groups").
- Severity persistence (remember last choice via electron-store non-secret pref) applies once the UI exists in Phase 6; the engine just takes the parameter.

### Durability & Checkpointing
- Job state persisted as a JSON job file in Electron `userData` (the AuditStore from the research build order), written after every group outcome — survives crash/restart.
- On launch, detect an incomplete job and offer Resume / Discard (resume continues from the first unprocessed group). No silent auto-resume for a destructive action.
- PEER_FLOOD mid-job: hard-stop immediately (Phase 2 governor semantics), checkpoint state, surface "Telegram has flagged this account — wait before retrying"; job resumable later.
- No automatic per-group retry within a run — failed groups land in the report with a per-group retry affordance afterward (mirrors the membership-scan retry pattern, including its CR-02 generation-guard lessons).

### Pacing & Execution Order
- Proactive pacing: fixed 2s base + 1–2s random jitter between group removals, layered on top of governor FLOOD_WAIT handling.
- Execution order: checklist order (same as enumeration order).
- Abortable mid-run: Stop affordance — current group's call finishes, remaining groups marked "skipped", checkpoint preserved (job resumable).
- No membership re-verification before each removal — trust Phase 4 scan results; treat `USER_NOT_PARTICIPANT` as a distinct "already gone" outcome counted as success.

### Progress, Report & Confirmation
- Live progress: per-group status on the existing checklist rows (pending → removing → done / failed / skipped / already-gone) plus a progress counter — same visual language as the membership scan. Full wizard presentation deferred to Phase 6.
- Report: per-group outcome with mapped failure reasons, summary counts (removed / already gone / failed / skipped), timestamp — persisted in the job file as an audit trail.
- "Already gone" (USER_NOT_PARTICIPANT) is a distinct outcome label counted as success in the summary.
- Minimal destructive-confirm dialog in Phase 5 (target identity + group count + severity) before the engine runs — the PROJECT safety constraint is non-negotiable even pre-wizard. Phase 6 replaces it with the full dry-run review screen.

### Claude's Discretion
- Exact job file schema, file naming, and rotation (e.g., one active job + archived reports).
- IPC channel names, store shape, component-level changes — follow the searchChannels/searchStore patterns from Phase 4.1.
- Exact error-code mapping for removal failures (extend OperationErrorCode with RMV_* members; non-retryable disposition per T-03-02 pattern where appropriate).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/telegram/MembershipScanner.ts` / `ParticipantSearcher.ts` — sequential governor-routed loop with generation guard, abort, progressive emission; the removal engine follows the same state-machine shape.
- `src/main/telegram/governor.ts` — all calls via governor.run(); floodSleepThreshold=0 (D-11); PEER_FLOOD classified as hard-stop in Phase 2 error classification (operationErrors.ts).
- `src/main/telegram/GroupEnumerator.ts` — group entities with id+accessHash and group-type detection (basic vs supergroup/channel), canAct rights.
- `src/renderer/store/groupsStore.ts` — checklist state incl. checkedDialogIds (the removal set), `_prevScanStep` transition tracking pattern.
- `src/renderer/components/ui/dialog.tsx` — existing dialog primitive for the minimal confirm gate (LogoutDialog.tsx is the destructive-dialog analog).
- IPC/store/client patterns: shared/channels.ts, main/ipc/*Channels.ts (Zod validation, security gates), renderer/ipc/*Client.ts, renderer/store/*Store.ts.

### Established Patterns
- CR-01/02/03 lessons: reset/abort wiring through TARGET_RESET; generation capture before awaits; first-transition-only store rebuilds.
- Per-group error isolation: skip-and-continue with per-row error + retry affordance.
- electron-store for non-secret prefs; safeStorage only for session.
- Tests: vitest + mock GramJS client (`__mocks__/telegramClient.ts`) with deferred-promise race tests.

### Integration Points
- `src/main/index.ts` — construct RemovalExecutor (or equivalent) after scanner/searcher; register removal channels; TARGET_RESET must also handle in-flight removal jobs safely (likely: refuse target change while a job is running, or abort-with-checkpoint).
- `src/shared/opTypes.ts` — RMV_* error codes.
- GroupRow/GroupsPane — per-row removal status rendering.
- Research must verify: `messages.DeleteChatUser` (basic) vs `channels.EditBanned` with `ChatBannedRights` (supergroup/channel); kick = editBanned(viewMessages until now+~1min or restrict-then-unban) semantics — this is the MEDIUM-confidence STATE.md blocker to resolve during research.

</code_context>

<specifics>
## Specific Ideas

- Phase 5 test default severity is 'ban' (user override) — the engine must be exercised in ban mode during this phase's manual verification.
- Progress language and report styling should feel like the membership scan ("Removing from group X of N…" style counters).

</specifics>

<deferred>
## Deferred Ideas

- Visible Kick/Ban selector UI + severity persistence (electron-store) — Phase 6 wizard.
- Dry-run preview and full final review screen — Phase 6.

</deferred>

---

*Phase: 05-removal-execution-engine*
*Context gathered: 2026-06-12 via smart discuss (autonomous mode)*
