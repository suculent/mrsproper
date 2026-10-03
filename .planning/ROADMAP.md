# Roadmap: MrProper

## Milestones

- ✅ **v1.0 MVP** — Phases 1–8 (shipped 2026-06-13) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.6 Member Tag Action** — Phases 9–12 (shipped 2026-06-20) — see [milestones/v1.6-ROADMAP.md](milestones/v1.6-ROADMAP.md)
- 🚧 **v1.7 Add Mode** — Phases 13–15 (in progress)

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

<details>
<summary>✅ v1.6 Member Tag Action (Phases 9–12) — SHIPPED 2026-06-20</summary>

Full detail archived in [milestones/v1.6-ROADMAP.md](milestones/v1.6-ROADMAP.md).

- [x] **Phase 9: Tag API & Layer-224 Connection** (2/2 plans) — completed 2026-06-20
- [x] **Phase 10: Shared Types, IPC & Audit Wiring** (4/4 plans) — completed 2026-06-20
- [x] **Phase 11: TagExecutor** (3/3 plans) — completed 2026-06-20
- [x] **Phase 12: Renderer — Action Picker, Tag Input & Results** (4/4 plans) — completed 2026-06-20

</details>

### 🚧 v1.7 Add Mode (In Progress)

**Milestone Goal:** Let the admin add the resolved target to every selected group they are not yet
in, with the same safety, throttling and reporting as removal — direct invite/add where possible,
unban-first for banned targets, and a privacy-block fallback of unique expiring invite links sent
in one templated direct message.

- [x] **Phase 13: Add Rights & Scan Semantics (Foundation)** — `canAdd` rights flag, add-mode grey (completed 2026-10-03)
  reasons (incl. broadcast channels), TagExecutor layer-224 cleanup

- [ ] **Phase 14: AddExecutor — Dispatch, Privacy Fallback & Audit** — invite/add dispatch,
  unban-first, expiring invite links + single templated DM, typed outcomes, `add-job.json`
  checkpoint/resume

- [ ] **Phase 15: Renderer — Add Mode, Contacts, Template & Reporting** — mode switch, inverted
  checklist, add-to-contacts checkbox, DM template editing/preview, review/run/report wiring,
  add-log export, en/cs strings

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
- [x] 10-04-PLAN.md — main/index.ts + preload/index.ts wiring: registerTagChannels, launch detection, contextBridge entries

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

**Plans**: 3 plans
Plans:

- [x] 11-01-PLAN.md — tagExecutor.test.ts: failing RED tests for TagExecutor (all behaviors)
- [x] 11-02-PLAN.md — TagExecutor.ts: GREEN implementation — throttled, generation-guarded, tag-write state machine
- [x] 11-03-PLAN.md — index.ts wiring: replace stub, tagExecutorRef, onStateChange→emitTagState

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

**Plans**: 4 plans
Plans:

- [x] 12-01-PLAN.md — tagConstants + tagValidation + i18n namespace (en/cs) + wizardStage TAG events
- [x] 12-02-PLAN.md — tagStore: module-singleton, cachedSnapshot guard, tagActions (no retryGroup)
- [x] 12-03-PLAN.md — TagInput + TagResumeJobDialog + ReviewScreen 3-way picker/input/confirmation
- [x] 12-04-PLAN.md — GroupRow tagStatus slot + GroupsPane tag progress/results + AppShell wiring

**UI hint**: yes

### Phase 13: Add Rights & Scan Semantics (Foundation)

**Goal**: The main process can tell, for every enumerated dialog, whether the target can be added there and why not — including broadcast channels when the admin holds the invite right — and the dead layer-224 isolation code is gone from `TagExecutor`, with no renderer changes yet
**Depends on**: Phase 12 (existing codebase; Add Mode is additive, no shipped Remove/Tag path changes)
**Requirements**: ADD-02, ADD-03, ADD-04, TAG-07
**Success Criteria** (what must be TRUE):

  1. Every `AdminDialogDTO` carries a `canAdd` boolean computed in `GroupEnumerator` from creator status, the `inviteUsers` admin right, or default permissions allowing invites — the renderer never derives this itself
  2. A broadcast channel where the admin holds the invite right reports `canAdd: true` even though it keeps `canAct: false` for removal (Remove mode is unaffected); a broadcast channel without the invite right reports `canAdd: false`
  3. The membership/rights data available to the renderer distinguishes, per dialog, "already a member" from "not a member, no invite right" so Add mode can grey a row with a cause-specific reason instead of a generic one
  4. `TagExecutor` contains no two-phase layer isolation logic, no `restoreMainClientLayer` calls, and no stale layer-224 comments; the existing `tagExecutor.test.ts` suite passes unmodified in behavior (tag writes still work end-to-end at the now-default TL layer 229)

**Plans**: 3 plans
Plans:
**Wave 1**

- [x] 13-01-PLAN.md — groupTypes.ts canAdd/addGreyReason + GroupEnumerator rights computation + i18n copy + folded CountryPicker todos

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 13-02-PLAN.md — MembershipScanner banned-vs-not-member scan status split
- [x] 13-03-PLAN.md — TagExecutor layer-224 cleanup: delete tagClient.ts/tagApi.ts, consolidate to single-client loop, rewire main/index.ts

**UI hint**: no

### Phase 14: AddExecutor — Dispatch, Privacy Fallback & Audit

**Goal**: An add run invites the target into every selected group through the correct Telegram mechanic, lifts bans first, falls back to unique expiring invite links with a single templated DM when privacy blocks a direct add, and checkpoints/resumes exactly like the removal and tag executors
**Depends on**: Phase 13
**Requirements**: ADD-06, ADD-07, ADD-08, ADD-09, ADD-10, ADD-11
**Success Criteria** (what must be TRUE):

  1. For each selected supergroup/broadcast-channel `AddExecutor` issues `channels.InviteToChannel`, and for each selected basic group it issues `messages.AddChatUser` — both routed through the shared governor with FLOOD_WAIT countdown, PEER_FLOOD hard-stop, and ~3s inter-group pacing
  2. A group where the target is currently banned has the ban lifted before the invite/add call is issued, in the same governor-throttled run
  3. A privacy-blocked group yields a unique, single-use invite link that expires 5 days after creation; at run end every link generated across the run is sent to the target in exactly one direct message, with a distinct reported outcome if that DM itself is refused by the target's privacy settings (the links are still retained for the admin)
  4. Every per-group outcome is one of `done | already-member | privacy-blocked | failed(code) | skipped`, checkpointed to `add-job.json` as it happens; relaunching with an incomplete job detects it, and resuming a stopped or hard-stopped run continues from the last checkpoint
  5. TDD tests mirror `removalExecutor.test.ts` / `tagExecutor.test.ts` coverage: per-group dispatch (both mechanics), unban-first, link generation + expiry, checkpoint + resume, PEER_FLOOD hard-stop, FLOOD_WAIT via the governor

**Plans**: 11 plans
Plans:
**Wave 1**

- [x] 14-01-PLAN.md — addTypes.ts + channels.ts constants + REQUIREMENTS.md ADD-09 wording alignment
- [x] 14-02-PLAN.md — mock TelegramClient RPC extension + TargetResolver deleted/bot/contact flags

**Wave 2** *(blocked on Wave 1)*

- [ ] 14-03-PLAN.md — addAuditStore.ts: add-job.json persistence + sameDialogIdSet (TDD)
- [ ] 14-04-PLAN.md — addLogStore.ts: append-only add-log.txt writer (TDD)
- [ ] 14-05-PLAN.md — contactService.ts: non-blocking contacts.AddContact wrapper (TDD)
- [ ] 14-06-PLAN.md — templateChannels.ts: DM template store + renderTemplate + EN/CS defaults (TDD)

**Wave 3** *(blocked on Wave 2)*

- [ ] 14-07-PLAN.md — addExecutor.test.ts: failing RED tests for AddExecutor (all behaviors)

**Wave 4** *(blocked on Wave 3)*

- [ ] 14-08-PLAN.md — AddExecutor.ts: core dispatch, unban-first, privacy-block+link, error classification (GREEN-A)

**Wave 5** *(blocked on Wave 4)*

- [ ] 14-09-PLAN.md — AddExecutor.ts: continuation-based resume, end-of-run DM, add-log append (GREEN-B)

**Wave 6** *(blocked on Wave 5)*

- [ ] 14-10-PLAN.md — addChannels.ts: ADD_* IPC handlers + target:addContact (TDD)

**Wave 7** *(blocked on Wave 6)*

- [ ] 14-11-PLAN.md — main/index.ts + preload/index.ts wiring, targetChannels.ts TARGET_RESET extension

**UI hint**: no

### Phase 15: Renderer — Add Mode, Contacts, Template & Reporting

**Goal**: The admin can switch into Add mode, review an inverted checklist, opt in/out of adding the target to contacts, edit and preview the invite-link DM template, confirm, watch live progress, read the per-group report, and export the add log — fully in English and Czech
**Depends on**: Phase 14
**Requirements**: ADD-01, ADD-05, ADD-12, ADD-13, ADD-14, ADD-15, ADD-16
**Success Criteria** (what must be TRUE):

  1. A Remove/Tag/Add mode switch is visible on the groups pane before the checklist is reviewed; switching modes resets the checklist selection and determines which action (Kick/Ban, Tag, Add) the review screen offers
  2. In Add mode the checklist inverts — groups the target is not in and the admin can invite into are actionable and pre-checked, while groups they're already in or where the admin lacks the invite right are greyed with a cause-specific reason — and the target card shows a pre-checked "Add to contacts" / "Přidat do kontaktů" checkbox that, when unchecked, routes privacy-blocked groups straight to links
  3. The user can edit the invite-link DM template (default template provided in English and Czech, with placeholders for the target's name and the link list); the edited template persists across runs
  4. The review screen shows the add consequence line, the exact group list, and the exact rendered DM text (reflecting the current template) before one explicit confirmation is required to start the run; target identity is sourced from the main process only, never passed up from the renderer
  5. Live per-group progress appears during an add run, a per-group results report (with retry per failed group) appears afterward, and the admin can export the add log to a plain-text file via a save dialog — every new string in this phase exists in both English and Czech (formal vykání, 3-form plurals)

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
| 10. Shared Types, IPC & Audit Wiring | v1.6 | 4/4 | Complete    | 2026-06-20 |
| 11. TagExecutor | v1.6 | 3/3 | Complete    | 2026-06-20 |
| 12. Renderer — Action Picker, Tag Input & Results | v1.6 | 0/0 | Complete    | 2026-06-20 |
| 13. Add Rights & Scan Semantics (Foundation) | v1.7 | 3/3 | Complete    | 2026-10-03 |
| 14. AddExecutor — Dispatch, Privacy Fallback & Audit | v1.7 | 2/11 | In Progress|  |
| 15. Renderer — Add Mode, Contacts, Template & Reporting | v1.7 | 0/0 | Not started | - |
</content>
