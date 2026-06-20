---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Member Tag Action
status: planning
last_updated: "2026-06-20T00:00:00.000Z"
last_activity: 2026-06-20
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-20)

**Core value:** A group admin can confidently remove the right person from every relevant community in one safe, verified, rate-limit-respecting pass.
**Current focus:** Phase 9 — Tag API & Layer-224 Connection (ready to plan)

## Current Position

Phase: 9 of 12 (Tag API & Layer-224 Connection)
Plan: —
Status: Ready to plan
Last activity: 2026-06-20 — Roadmap created for v1.6; Phases 9–12 defined; spike complete

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 57 (v1.0 cumulative)
- Average duration: — min
- Total execution time: — hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 09 | TBD | - | - |
| 10 | TBD | - | - |
| 11 | TBD | - | - |
| 12 | TBD | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

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

## Session Continuity

Last session: 2026-06-20
Stopped at: Roadmap created — Phases 9–12 defined, REQUIREMENTS.md traceability filled
Resume file: None
