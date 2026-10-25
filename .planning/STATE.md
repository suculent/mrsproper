---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Add Mode
status: Awaiting next milestone
stopped_at: Milestone v1.7 complete
last_updated: "2026-10-25T08:55:19.478Z"
last_activity: 2026-10-25 — Milestone v1.7 completed and archived
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 41
  completed_plans: 41
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-25)

**Core value:** A group admin can confidently remove the right person from every relevant community in one safe, verified, rate-limit-respecting pass.
**Current focus:** Planning next milestone

## Current Position

Phase: Milestone v1.7 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-10-25 — Milestone v1.7 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 91 (v1.0 cumulative)
- Average duration: — min
- Total execution time: — hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 09 | TBD | - | - |
| 10 | 4 | - | - |
| 11 | 3 | - | - |
| 12 | 0 | - | - |
| 13 | 3 | - | - |
| 14 | 11 | - | - |
| 15 | TBD | - | - |
| 16 | 5 | - | - |
| 17 | 8 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 09-tag-api-layer-224-connection P01 | 2 | 1 tasks | 2 files |
| Phase 09-tag-api-layer-224-connection P02 | 4min | 2 tasks | 2 files |
| Phase 10 P01 | 2 | 2 tasks | 2 files |
| Phase 10 P04 | 10 | 2 tasks | 2 files |
| Phase 11-tagexecutor P01 | 2min | 1 tasks | 1 files |
| Phase 11-tagexecutor P02 | 15min | 1 tasks | 2 files |
| Phase 11-tagexecutor P03 | 18 | 1 tasks | 1 files |
| Phase 12 P01 | 5m 24s | 2 tasks | 11 files |
| Phase 12 P03 | 359 | 2 tasks | 5 files |
| Phase 13 P01 | 18min | 3 tasks | 13 files |
| Phase 13 P02 | 5min | 2 tasks | 2 files |
| Phase 13 P03 | 11min | 3 tasks | 8 files |
| Phase 14 P01 | 2min | 3 tasks | 3 files |
| Phase 14 P02 | 12min | 2 tasks | 3 files |
| Phase 14 P03 | 4min | 2 tasks | 2 files |
| Phase 14 P04 | 8min | 2 tasks | 2 files |
| Phase 14 P05 | 2min | 2 tasks | 2 files |
| Phase 14 P06 | 3min | 2 tasks | 2 files |
| Phase 14 P07 | 35min | 1 tasks | 1 files |
| Phase 14 P08 | 45min | 1 tasks | 1 files |
| Phase 14 P09 | 25min | 1 tasks | 2 files |
| Phase 14 P10 | 12min | 2 tasks | 2 files |
| Phase 14 P11 | 25min | 2 tasks | 5 files |
| Phase 15 P01 | 6min | 2 tasks | 3 files |
| Phase 15 P02 | 8min | 3 tasks | 8 files |
| Phase 15 P03 | 9min | 3 tasks | 8 files |
| Phase 15 P04 | 12min | 3 tasks | 8 files |
| Phase 15 P05 | 6min | 2 tasks | 3 files |
| Phase 15 P06 | 6min | 2 tasks | 2 files |
| Phase 15 P11 | 8min | 1 tasks | 1 files |
| Phase 15 P07 | 10min | 2 tasks | 3 files |
| Phase 15 P08 | 25min | 2 tasks | 1 files |
| Phase 15 P09 | 15min | 3 tasks | 2 files |
| Phase 15 P10 | 25min | 3 tasks | 3 files |
| Phase 15 P12 | 8min | 2 tasks | 2 files |
| Phase 15 P13 | 20min | 2 tasks | 3 files |
| Phase 15 P14 | 18min | 2 tasks | 4 files |

## Accumulated Context

### Roadmap Evolution

- Phase 16 added: Close gap: ADD-08 resume path and ADD-02 empty state (from v1.7 milestone audit)
- Phase 17 added: Close gap: ADD-08/ADD-12 — relaunch-resume UI visibility and target-identity lock (from 2026-10-24 v1.7 re-audit)

### Decisions

Decisions are logged in PROJECT.md Key Decisions table (v1.7 decisions added at milestone close).
Per-plan decision history for v1.6/v1.7 lives in the archived phase SUMMARYs under
`.planning/milestones/v1.6-phases/` and `.planning/milestones/v1.7-phases/`.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None — the two CountryPicker todos (country-picker-rows-clickable, default-country-czechia)
were confirmed already-shipped and closed to `.planning/todos/done/` in Phase 13 Plan 01.

### Blockers/Concerns

- Live-account verification still owed: the 5 server-behaviour items in 14-VALIDATION (exact
  `InviteToChannel`/`AddChatUser` RPC error strings, direct-add cap behaviour). `AddErrorCode`
  mapping is test-backed but not live-confirmed. Carry into the next milestone.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261003-jni | Move GramJS client to TL layer 229 (schema swap via postinstall regeneration) | 2026-10-03 | c90a39a | [261003-jni-move-gramjs-client-to-tl-layer-229-schem](./quick/261003-jni-move-gramjs-client-to-tl-layer-229-schem/) |
| 261004-p6t | Close security threat T-15-03: gate ADD_EXPORT_LOG handler on authorized session, with failing test first | 2026-10-04 | be42017 | [261004-p6t-close-security-threat-t-15-03-gate-add-e](./quick/261004-p6t-close-security-threat-t-15-03-gate-add-e/) |
| 261025-dnf | Fix v1.7 audit warnings W1 (language channels before window), W2 (forced mode syncs pre-check), W4 (logout wipes add job) | 2026-10-25 | a8bcb84 | [261025-dnf-fix-v1-7-audit-warnings-w1-w2-w4](./quick/261025-dnf-fix-v1-7-audit-warnings-w1-w2-w4/) |

## Deferred Items

Items carried forward from v1.0 milestone close (2026-06-13):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| todo | country-picker-rows-clickable (ui) | pending | v1.0 close |
| todo | default-country-czechia (ui) | pending | v1.0 close |
| uat_gap | 01-HUMAN-UAT.md | partial (Windows launch, real-2FA) | v1.0 close |
| uat_gap | 06-HUMAN-UAT.md | partial (resume-after-restart) | v1.0 close |
| uat_gap | 07-HUMAN-UAT.md | partial (Big Sur smoke test deferred) | v1.0 close |
| uat_gap | 08-HUMAN-UAT.md | partial (4 open: re-confirm after fix cycle) | v1.0 close |

Items acknowledged and deferred at v1.6 milestone close (2026-06-20):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat_gap | 12-HUMAN-UAT.md | partial (3 open: TagInput focus, Day/Night×en/cs visual, provisional 16-char TAG_MAX_LENGTH) | v1.6 close |
| quick_task | 260611-t1h-rename-mrproper-to-mrsproper | done (no status frontmatter) | v1.6 close |
| quick_task | 260620-f8a-phase-0-empirical-spike | done (no status frontmatter) | v1.6 close |
| todo | country-picker-rows-clickable (ui) | pending | v1.6 close (carried from v1.0) |
| todo | default-country-czechia (ui) | pending | v1.6 close (carried from v1.0) |

Items acknowledged and deferred at v1.7 milestone close (2026-10-25), audit status tech_debt (see milestones/v1.7-MILESTONE-AUDIT.md):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| tech_debt | W3: stage stays 'report' after in-session Resume (cosmetic) | open | v1.7 close |
| tech_debt | W5: no main-side block on concurrent Remove/Tag + Add runs | open | v1.7 close |
| tech_debt | WR-03: hard-stop during end-of-run DM leaves DM unsent, no add-log block | open | v1.7 close |
| tech_debt | Replacing/discarding a stopped job drops earlier-segment links | open | v1.7 close |
| tech_debt | Remove/Tag job files survive logout (add job now wiped, 261025-dnf) | open | v1.7 close |
| ui_review | 17-UI-REVIEW 18/24 polish (disabled tooltips, in-flight Resume buttons, queued placeholder) | open | v1.7 close |
| validation | 16-VALIDATION.md / 17-VALIDATION.md drafts (nyquist partial) | open | v1.7 close |
| uat_gap | 14-VALIDATION: 5 server-behaviour items need a live account | open | v1.7 close |

## Session Continuity

Last session: 2026-10-25
Stopped at: Milestone v1.7 complete and archived
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
