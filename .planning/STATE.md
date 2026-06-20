---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Member Tag Action
status: Awaiting next milestone
stopped_at: Completed 11-tagexecutor-11-02-PLAN.md
last_updated: "2026-06-20T21:18:11.621Z"
last_activity: 2026-06-20 — Milestone v1.6 completed and archived
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 13
  completed_plans: 13
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-20)

**Core value:** A group admin can confidently remove the right person from every relevant community in one safe, verified, rate-limit-respecting pass.
**Current focus:** Milestone complete

## Current Position

Phase: Milestone v1.6 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-20 — Milestone v1.6 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 64 (v1.0 cumulative)
- Average duration: — min
- Total execution time: — hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 09 | TBD | - | - |
| 10 | 4 | - | - |
| 11 | 3 | - | - |
| 12 | 0 | - | - |

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

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 0 spike]: `messages.editChatParticipantRank#a00f32b0` is the confirmed member-tag setter (not `channels.editAdmin + rank`, which is inert on tags at any layer)
- [Phase 0 spike]: Layer 224 required for the whole connection; per-call `InvokeWithLayer` rejected by server (`CONNECTION_LAYER_INVALID`)
- [Phase 0 spike]: patch-connect-restore technique proven — patch `AllTLObjects.LAYER = 224` before `tagClient.connect()`, restore to 198 immediately after; LAYER is read only at connect-time so the 198 main client is unaffected
- [Phase 0 spike]: Already-admin probe: `editChatParticipantRank` does NOT change admin rights (no `admin_rights` param), but DOES overwrite the admin's `rank` (custom title = same field); decision: skip & flag (`TAG_TARGET_IS_ADMIN`)
- [Phase 0 spike]: Basic groups: call accepted by server but round-trip unconfirmed cleanly; v1 decision: skip (`TAG_UNSUPPORTED_BASIC_GROUP`)
- [Design spec §4.3]: Main `client` must not reconnect during the brief layer-patch window; guard with a mutex or by only opening `tagClient` when no removal/enumeration is in flight
- [Design spec §4]: `TagExecutor` is a parallel class to `RemovalExecutor` (not a refactor) — avoids destabilizing shipped v1.0 removal path
- [Phase ?]: 09-01 completed
- [Phase ?]: 09-01 tagApi.ts
- [Phase ?]: 09-01 tagApi.ts
- [Phase ?]: require('telegram/tl/AllTLObjects') called inside connect() method body so vi.mock intercepts it in tests
- [Phase ?]: main-client reconnect-race mitigation deferred to Phase 11 per spec §4.3
- [Phase ?]: Avoids TS6133 unused-import error
- [Phase ?]: Phase 11 replaces with real TagExecutor
- [Phase ?]: Fixed vi.fn<> type-arg syntax in tagExecutor.test.ts to current Vitest single-callback-type API; no behavioral change
- [11-tagexecutor/03]: Cast client.session.save() as unknown as string — GramJS abstract base types save() as void but StringSession.save() returns string; double-cast avoids TS error without runtime impact
- [11-tagexecutor/03]: Use TagExecutorOptions['mainClient'] index access for mainClient cast — Parameters<typeof TagExecutor> fails on class types; accessing the exported interface property works correctly
- [Phase ?]: Phase 12 Plan 01
- [Phase ?]: Phase 12 Plan 01
- [Phase ?]: Phase 12 Plan 03 decisions

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

- Make country rows clickable in login-form CountryPicker (`2026-06-11-country-picker-rows-clickable.md`, area: ui)
- Default country Czechia (+420) in CountryPicker (`2026-06-11-default-country-czechia.md`, area: ui)

### Blockers/Concerns

- Phase 9: Main client auto-reconnect during the layer-224 patch window is the one real risk — must guard (mutex or "only open tagClient when idle" assertion); see spec §4.3
- Phase 9: Tag max length and allowed charset not yet measured — deferred to Phase 9 via the proven probe path; results feed Phase 12 input validation
- Phase 12: Exact `editChatParticipantRank` RPC error strings (e.g. `CHAT_ADMIN_REQUIRED` vs `RIGHT_FORBIDDEN`) need live verification in Phase 11 — `TagErrorCode` candidates in spec §4.2 are provisional

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

## Session Continuity

Last session: 2026-06-20T17:18:32.051Z
Stopped at: Completed 11-tagexecutor-11-02-PLAN.md
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
