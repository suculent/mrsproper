---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Add Mode
status: executing
stopped_at: Completed 14-08-PLAN.md
last_updated: "2026-10-03T21:29:19.819Z"
last_activity: 2026-10-03
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 14
  completed_plans: 11
  percent: 14
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-20)

**Core value:** A group admin can confidently remove the right person from every relevant community in one safe, verified, rate-limit-respecting pass.
**Current focus:** Phase 14 — AddExecutor — Dispatch, Privacy Fallback & Audit

## Current Position

Phase: 14 (AddExecutor — Dispatch, Privacy Fallback & Audit) — EXECUTING
Plan: 9 of 11
Status: Ready to execute
Last activity: 2026-10-03

## Performance Metrics

**Velocity:**

- Total plans completed: 67 (v1.0 cumulative)
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
| 14 | TBD | - | - |
| 15 | TBD | - | - |

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
- [v1.7 roadmap]: GramJS now runs at TL layer 229 everywhere (quick 261003-jni) — Phase 13's TAG-07 cleanup removes the layer-224 isolation hack from TagExecutor since it is no longer needed for tag writes
- [v1.7 roadmap]: No new TL layer/connection work is needed for Add Mode — `channels.InviteToChannel` / `messages.AddChatUser` are already covered at layer 229, so the milestone compresses to 3 phases (Foundation → AddExecutor → Renderer) instead of the 4-phase Tag pattern (which needed a dedicated API/connection phase)
- [v1.7 roadmap]: Contact-adding (ADD-05) and the add-log export (ADD-14) are mapped to the Renderer phase (15) since their observable success criteria require the UI (checkbox, save dialog) even though supporting main-process calls are implemented alongside AddExecutor in Phase 14
- [Phase 13]: canAdd = creator || adminRights.inviteUsers || defaultBannedRights.inviteUsers !== true (open-permissions default)
- [Phase 13]: Broadcast-channel 200-member channel-full override applies after the base canAdd rule, broadcast-channel branch only
- [Phase 13]: AddGreyReason's already-member/banned-no-unban-right values are data-foundation only in 13-01; gating/sort logic ships in Phase 15
- [Phase 13]: ChannelParticipantBanned.left===true (ban lifted / user left) maps to 'not-member'; left unset or false (still banned) maps to 'banned' (D-01, resolves Open Question 2 as a locked, tested contract)
- [Phase 13]: Basic-group branch keeps returning only 'member'/'not-member' (never 'banned') since bans are not visible via messages.GetFullChat (D-03)
- [Phase 13-03]: TagExecutorClient mirrors RemovalExecutorClient's minimal invoke(request) shape — no tag-specific client interface needed
- [Phase 13-03]: D-11 test uses an RPC-shaped error with an unrecognized errorMessage (not a bare no-errorMessage Error) to actually exercise _classifyTagError's UNKNOWN fallthrough, since classifyRpcError maps no-errorMessage errors to NETWORK/retry
- [Phase 14]: AddJobFile/AddState carry dmStatus — net-new field, no RemovalState/TagState precedent
- [Phase 14]: ADD-09 wording aligned: privacy-blocked covers not-mutual-contact/privacy-restricted and the broadcast/supergroup direct-add cap per D-07/D-12; failed codes list includes a basic-group member-cap case instead
- [Phase ?]: [14-02]: Extended mock resolveUsernameResult/resolvePhoneResult/getUsersResult with optional deleted/bot/contact fields (default false) for TargetResolver flag-passthrough tests
- [Phase ?]: [14-02]: AddChatUser mock error config fires only on the first recorded call per chatId, enabling the D-03 fwd_limit 1000->100 retry sequence to be asserted in later AddExecutor tests
- [Phase 14]: [14-03]: AddJobFileSchema requires dmStatus (non-optional) so a missing field is rejected as schema mismatch, distinguishing AddAuditStore from Tag/Removal job-file precedent
- [Phase ?]: [14-04]: Follow-up add-log blocks marked with a literal CONTINUATION substring in the header line, grep-able per D-18, no separate field needed
- [Phase 14]: [14-05] createContactService: addIfMissing() is the D-08 non-blocking contacts.AddContact wrapper (skip-if-contact, never-rethrows, single governor.run call); not wired into Plan 14-10's IPC/main index yet
- [Phase 14]: [14-06] renderTemplate() uses two sequential single-brace regex replaces (no templating library); confirmed by test to leave i18next's {{ }} double-brace syntax untouched
- [Phase 14]: [14-06] DEFAULT_TEMPLATE_CS drafted with formal vykani and a gender-neutral 'radi bychom' construction per D-15
- [Phase 14]: [14-06] TEMPLATE_GET returns null (not a default template) on first launch, so Plan 14-11's wiring chooses the EN/CS default by current app language
- [Phase 14]: [14-07]: addExecutor.test.ts defines AddExecutor's full constructor contract ({ client, governor, enumerator, scanner, resolver, auditStore, addLogStore, getDmText, onStateChange }) and all 54 D-01..D-20 test cases before any implementation exists, including the D-20 continuation-based resume contract as 5 independently-assertable scenarios
- [Phase 14]: AddExecutor avoids literal bigInt.zero (uses bigInt('0') instead) to satisfy T-05-04-B grep acceptance criterion while preserving identical fallback behavior

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None — the two CountryPicker todos (country-picker-rows-clickable, default-country-czechia)
were confirmed already-shipped and closed to `.planning/todos/done/` in Phase 13 Plan 01.

### Blockers/Concerns

- (Resolved 2026-10-03 by quick 261003-jni) Layer-224 patch window no longer exists — whole package runs at layer 229. Follow-up: TagExecutor still carries the two-phase/restoreMainClientLayer logic and stale layer-224 comments; removal is now scoped as TAG-07 in Phase 13.
- Phase 9: Tag max length and allowed charset not yet measured — deferred to Phase 9 via the proven probe path; results feed Phase 12 input validation
- Phase 12: Exact `editChatParticipantRank` RPC error strings (e.g. `CHAT_ADMIN_REQUIRED` vs `RIGHT_FORBIDDEN`) need live verification in Phase 11 — `TagErrorCode` candidates in spec §4.2 are provisional
- Phase 14: Exact RPC error strings for `channels.InviteToChannel` / `messages.AddChatUser` (no rights, not mutual contact, target in too many channels, previously kicked, deleted/bot, direct-add cap) need live verification during implementation — `AddErrorCode` candidates in REQUIREMENTS.md ADD-09 are provisional pending real-API confirmation

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261003-jni | Move GramJS client to TL layer 229 (schema swap via postinstall regeneration) | 2026-10-03 | c90a39a | [261003-jni-move-gramjs-client-to-tl-layer-229-schem](./quick/261003-jni-move-gramjs-client-to-tl-layer-229-schem/) |

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

Last session: 2026-10-03T21:29:19.814Z
Stopped at: Completed 14-08-PLAN.md
Resume file: None

## Operator Next Steps

- Review and approve .planning/ROADMAP.md (Phases 13-15) and .planning/REQUIREMENTS.md traceability
- Then run `/gsd:plan-phase 13` to begin Phase 13 (Add Rights & Scan Semantics)

</content>
