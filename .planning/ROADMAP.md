# Roadmap: MrProper

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped 2026-06-13) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.6 Member Tag Action** — Phases 9–12 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–8) — SHIPPED 2026-06-13</summary>

- [x] Phase 1: Foundation — Auth, Session & Portable Shell (5/5 plans) — completed 2026-06-10
- [x] Phase 2: Rate-Limit Governor & Error Classification (4/4 plans) — completed 2026-06-11
- [x] Phase 3: Target Resolution & Verification (6/6 plans) — completed 2026-06-11
- [x] Phase 4: Group Enumeration, Membership & Rights (11/11 plans) — completed 2026-06-11
- [x] Phase 4.1: Target Search by Name (INSERTED) (5/5 plans) — completed 2026-06-12
- [x] Phase 5: Removal Execution Engine (7/7 plans) — completed 2026-06-12
- [x] Phase 6: UI Integration — Wizard, Safety Gates & Progress (5/5 plans) — completed 2026-06-12
- [x] Phase 7: Packaging, Signing & Release (5/5 plans) — completed 2026-06-12
- [x] Phase 8: Localization — i18n & Czech Translation (v1.5) (9/9 plans) — completed 2026-06-13

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v1.6 Member Tag Action (In Progress)

**Milestone Goal:** Add a "Tag" action alongside Kick/Ban that sets a Telegram member tag across selected groups via `messages.editChatParticipantRank` (layer 224), reusing the throttled, resumable, audited execution pipeline. Phase 0 spike is complete — setter confirmed, layer-224 technique proven.

- [x] **Phase 9: Tag API & Layer-224 Connection** — Vendored `editChatParticipantRank` request and isolated layer-224 `tagClient` via patch-connect-restore (completed 2026-06-20)
- [ ] **Phase 10: Shared Types, IPC & Audit Wiring** — `tagTypes.ts`, `tagChannels.ts`, `tag-job.json` audit wiring, IPC trust boundary
- [ ] **Phase 11: TagExecutor** — Write-only state machine over `tagClient` mirroring `RemovalExecutor`; per-group dispatch, already-admin skip, resume
- [ ] **Phase 12: Renderer — Action Picker, Tag Input & Results** — Tag action in UI, tag string input with validation, confirmation screen, live progress and per-group report

## Phase Details

### Phase 9: Tag API & Layer-224 Connection
**Goal**: The `editChatParticipantRank` request can be issued to the Telegram API at layer 224 via an isolated `tagClient` without disturbing the main layer-198 client
**Depends on**: Phase 8 (existing codebase)
**Requirements**: TAG-02
**Success Criteria** (what must be TRUE):
  1. `tagApi.ts` exports a factory that produces a GramJS-compatible `editChatParticipantRank` request whose serialized bytes match the spike's golden hex fixture (constructor id `b0320fa0` LE + InputPeerChannel + InputPeerUser + TL-string rank)
  2. A `tagClient` connects at layer 224 using the patch-connect-restore technique (`AllTLObjects.LAYER` is restored to 198 immediately after `tagClient.connect()` resolves, verified by a unit test reading `LAYER` after the call)
  3. `tagClient` invocations route through the shared `governor.run()`, preserving account-wide throttling for tag writes
  4. The main layer-198 `client` continues to enumerate groups and resolve targets correctly after `tagClient` has connected (no layer bleed-through)
**Plans**: 2 plans
Plans:
- [x] 09-01-PLAN.md — tagApi.ts: vendored editChatParticipantRank factory + TL-string encoder with golden-byte tests
- [x] 09-02-PLAN.md — tagClient.ts: patch-connect-restore wrapper with governor routing and lifecycle tests
**UI hint**: no

### Phase 10: Shared Types, IPC & Audit Wiring
**Goal**: The typed contract between main and renderer for tag operations exists, is validated at the IPC boundary, and tag runs are durably checkpointed to `tag-job.json`
**Depends on**: Phase 9
**Requirements**: TAG-03, TAG-05
**Success Criteria** (what must be TRUE):
  1. `src/shared/tagTypes.ts` defines `TagState`, `TagGroupOutcome`, `TagJobFile`, and `TagErrorCode` — mirroring the removal types; TypeScript compile passes with no errors
  2. `src/main/ipc/tagChannels.ts` registers IPC handlers; the Zod-validated handler payload carries only `dialogIds` (string array) and `tag` (string), never target identity — target identity is read exclusively from `resolver.getResolvedUser()` in the main process (T-05-04-B invariant preserved)
  3. A `tag-job.json` file is written to disk with `0o600` permissions when a tag run starts, updated per-group as outcomes are checkpointed, and readable on next launch to detect an incomplete run
  4. On launch, an incomplete `tag-job.json` is detected and surfaced to the renderer so the user can resume or discard (same pattern as removal job resume)
**Plans**: 4 plans
Plans:
- [x] 10-01-PLAN.md — tagTypes.ts + channels.ts: shared type module and TAG_* IPC channel constants
- [x] 10-02-PLAN.md — tagAuditStore.ts + test: tag-job.json persistence with TDD (atomic write, 0o600, checkpoint, readJob, getRemaining)
- [x] 10-03-PLAN.md — tagChannels.ts + test + tagClient.ts: IPC handlers with 4-layer security gates and renderer IPC client (TDD)
- [ ] 10-04-PLAN.md — main/index.ts + preload/index.ts wiring: registerTagChannels, launch detection, contextBridge entries
**UI hint**: no

### Phase 11: TagExecutor
**Goal**: Tag writes execute as a throttled, generation-guarded, resumable state machine that correctly handles already-admin targets, basic groups, FLOOD_WAIT, and PEER_FLOOD without modifying the existing `RemovalExecutor`
**Depends on**: Phase 10
**Requirements**: TAG-04
**Success Criteria** (what must be TRUE):
  1. For each selected supergroup/channel, `TagExecutor` builds `InputPeerChannel` + `InputPeerUser` from ids and accessHashes held in the main process (never from renderer payload) and issues `editChatParticipantRank` through the `tagClient` wrapped in `governor.run()`
  2. A group where the target is already an admin (`ChannelParticipantAdmin`) is marked `skipped` with `TAG_TARGET_IS_ADMIN` without issuing the API call; a basic group is marked `skipped` with `TAG_UNSUPPORTED_BASIC_GROUP`
  3. PEER_FLOOD hard-stops the run immediately (no remaining groups skipped); FLOOD_WAIT is absorbed by the governor with a countdown event forwarded to the renderer; the run is resumable via `tag-job.json`
  4. A generation-token guard (D-15 pattern) invalidates any stale in-flight run when `abortExecution()` is called or a new `execute()` starts; remaining groups are marked `skipped` and `tag-job.json` is checkpointed
  5. TDD tests mirror `removalExecutor.test.ts`: per-group dispatch with a mock `tagClient`, already-admin skip, generation-guard invalidation, checkpoint + resume, PEER_FLOOD hard-stop, FLOOD_WAIT via the governor
**Plans**: TBD
**UI hint**: no

### Phase 12: Renderer — Action Picker, Tag Input & Results
**Goal**: The user can choose "Tag", enter a tag string, confirm against the target identity and group list, watch live progress, and read a per-group outcome report — all without touching the existing Kick/Ban flow
**Depends on**: Phase 11
**Requirements**: TAG-01, TAG-06
**Success Criteria** (what must be TRUE):
  1. The action picker (Kick / Ban / Tag) is visible on the review screen; selecting "Tag" reveals a text input with live length and charset validation; the input rejects strings that exceed the measured limit or contain disallowed characters, with an inline error message
  2. The confirmation screen shows the tag string, the target's identity (avatar + name + username + ID), and the exact list of selected groups before any write occurs; the user must explicitly confirm before execution starts
  3. The live progress view updates per group during the run, showing which group is being processed; FLOOD_WAIT countdown appears when the governor is waiting
  4. The per-group results report surfaces all outcome states: `done`, `skipped` (with `TAG_TARGET_IS_ADMIN` or `TAG_UNSUPPORTED_BASIC_GROUP` label), `failed` (with error code), and distinguishes a `hard-stopped` run from a completed one
  5. The existing Kick and Ban flows are unaffected; switching between action types resets the tag input without carrying over stale state
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 5/5 | Complete | 2026-06-10 |
| 2. Rate-Limit Governor | v1.0 | 4/4 | Complete | 2026-06-11 |
| 3. Target Resolution | v1.0 | 6/6 | Complete | 2026-06-11 |
| 4. Group Enumeration | v1.0 | 11/11 | Complete | 2026-06-11 |
| 4.1 Target Search by Name | v1.0 | 5/5 | Complete | 2026-06-12 |
| 5. Removal Execution Engine | v1.0 | 7/7 | Complete | 2026-06-12 |
| 6. UI Integration | v1.0 | 5/5 | Complete | 2026-06-12 |
| 7. Packaging & Release | v1.0 | 5/5 | Complete | 2026-06-12 |
| 8. Localization (v1.5) | v1.0 | 9/9 | Complete | 2026-06-13 |
| 9. Tag API & Layer-224 Connection | v1.6 | 2/2 | Complete   | 2026-06-20 |
| 10. Shared Types, IPC & Audit Wiring | v1.6 | 3/4 | In Progress|  |
| 11. TagExecutor | v1.6 | 0/TBD | Not started | - |
| 12. Renderer — Action Picker, Tag Input & Results | v1.6 | 0/TBD | Not started | - |
