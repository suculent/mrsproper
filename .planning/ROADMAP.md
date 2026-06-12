# Roadmap: MrProper

## Overview

MrProper is built discipline-first: the dependency spine (authenticated client -> rate-limit governor -> resolved target -> enumerated groups -> removal executor) is laid before any feature that touches Telegram at volume. Phase 1 stands up the portable Electron + GramJS shell, the phone/2FA auth state machine, the embedded shared credential, and OS-keystore-encrypted session persistence with a revoking logout. Phase 2 builds the single serialized rate-limit governor and error classifier that every later Telegram call funnels through — the load-bearing infrastructure that keeps the user's real account safe. Phases 3 and 4 deliver the central value prop (resolve and verify the *right* person, then enumerate only the groups where they're actually a member and the admin holds the ban right). Phase 5 is the throttled, type-branching, per-group-isolated removal engine. Phase 6 binds the full wizard with its safety gates (dry-run, final review, explicit confirm) and live progress. Phase 7 signs, notarizes, and verifies portable builds on clean machines so non-technical admins can actually run it.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation — Auth, Session & Portable Shell** - Authenticated, encrypted-session Electron+GramJS app that launches on macOS and Windows (completed 2026-06-10)
- [x] **Phase 2: Rate-Limit Governor & Error Classification** - Single serialized queue every Telegram call funnels through, with FLOOD_WAIT back-off and PEER_FLOOD hard-stop (completed 2026-06-11)
- [x] **Phase 3: Target Resolution & Verification** - Resolve a target to a stable numeric ID and visually confirm identity before any action (verification: gaps_found 2026-06-11) (completed 2026-06-11)
- [x] **Phase 4: Group Enumeration, Membership & Rights** - Membership-verified, rights-aware checklist of the groups the target can be removed from (verification: gaps_found 2026-06-12) (completed 2026-06-11)
- [x] **Phase 4.1: Target Search by Name (INSERTED)** - Find a deletion target by First + Last Name via group-scoped participant search with candidate disambiguation, ending in the same identity-confirmation gate (completed 2026-06-12)
- [x] **Phase 5: Removal Execution Engine** - Throttled, type-branched, per-group-isolated kick/ban executor with live progress and report (completed 2026-06-12)
- [x] **Phase 6: UI Integration — Wizard, Safety Gates & Progress** - End-to-end wizard with dry-run, final review, explicit confirm, and live execution view (completed 2026-06-12)
- [x] **Phase 7: Packaging, Signing & Release** - Code-signed, notarized portable builds verified launching on clean macOS and Windows machines (completed 2026-06-12)
- [ ] **Phase 8: Localization — i18n & Czech Translation (v1.5)** - Language switcher (English/Česky), i18n string externalization, full Czech translation — after v1 feature-freeze + UAT

## Phase Details

### Phase 1: Foundation — Auth, Session & Portable Shell

**Goal**: A user can install and launch a portable MrProper app on macOS or Windows, log in to their Telegram account (phone + code, including 2FA), stay logged in across launches via an encrypted session, and log out to fully revoke access.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, APP-01, APP-02
**Success Criteria** (what must be TRUE):

  1. User can launch the app from a portable build on both macOS and Windows without a developer environment
  2. User can log in with phone number + login code, and complete login when their account has a 2FA password
  3. User needs no per-user api_id registration — the app authenticates with its embedded credential
  4. After logging in and quitting, relaunching the app finds the user still logged in (session restored from encrypted-at-rest storage, key held in the OS keystore)
  5. User can log out, after which the server-side authorization is revoked and the local session blob is wiped (relaunch requires fresh login)

**Plans**: 5 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Scaffold electron-vite shell + hardened window + build-time credential injection + portable packaging

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Wave 0 test infra (Vitest + mock GramJS/safeStorage) + shared auth contract + [ASSUMED] package gate

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Encrypted session persistence + error classification + injectable FloodWaitController

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — Auth state machine + GramJS stepped flow + zod-validated IPC + locked-down preload

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-05-PLAN.md — Renderer: stepped login UI + identity shell + stubbed regions + revoking logout

**UI hint**: yes

### Phase 2: Rate-Limit Governor & Error Classification

**Goal**: Every Telegram call in the app routes through one serialized, rate-limited governor that honors FLOOD_WAIT by sleeping and resuming, and treats PEER_FLOOD as a distinct hard-stop — so no feature built later can flood the account.
**Depends on**: Phase 1
**Requirements**: EXE-01, EXE-02, EXE-03
**Success Criteria** (what must be TRUE):

  1. All Telegram requests pass through a single serialized queue with no parallel blasting (verifiable: concurrent call attempts execute one at a time)
  2. When the server returns FLOOD_WAIT_X, the governor sleeps the specified duration (with jitter) and resumes the call rather than failing — and emits a countdown event consumers can display
  3. A PEER_FLOOD response is classified distinctly from FLOOD_WAIT and hard-stops the operation with no retry
  4. A single error-classification function maps RPC errors to a typed enum with explicit skip / fail / retry dispositions, covered by mock-client tests

**Plans**: 4 plans
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Shared operation types (opTypes.ts) + RED test stubs for governor and classifier

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Implement classifyRpcError (operationErrors.ts) + RateLimitGovernor class (governor.ts) — GREEN all tests

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Wire governor into SessionManager + update floodSleepThreshold to 0 in main/index.ts

**Wave 4 (gap closure)** *(blocked on Wave 3 completion)*

- [x] 02-04-PLAN.md — Close verification gaps: route auth.LogOut through governor.run() (D-08), fix tsc errors in governor.test.ts, correct SESSION_INVALID docstrings

### Phase 3: Target Resolution & Verification

**Goal**: A user can specify a target by username or phone, have it resolved once to a stable numeric user ID acted on thereafter, and visually confirm it is the right person via avatar and identity details — with honest handling when resolution fails or no avatar exists.
**Depends on**: Phase 2
**Requirements**: TGT-01, TGT-02, TGT-03, TGT-04, VRF-01, VRF-02, VRF-03
**Success Criteria** (what must be TRUE):

  1. User can enter a username OR a phone number and the app resolves it to a stable numeric user ID + access_hash exactly once, early, and references that ID from then on
  2. User sees the target's avatar plus text identity (name, @username, numeric ID, bio) for confirmation
  3. When no avatar is available, user sees a clear no-photo fallback with the available identity details and can still choose to proceed (deliberate confirmation, not a dead end)
  4. When resolution fails, user gets a distinct, accurate message per cause: username not found, phone not in contacts, or no public profile

**Plans**: 6 plans
Plans:
**Wave 1** *(Plans 01 and 02 run in parallel — no file overlap)*

- [x] 03-01-PLAN.md — Shared contracts: targetTypes.ts, extend channels.ts/opTypes.ts, extend operationErrors + test + mock client
- [x] 03-02-PLAN.md — Badge component (shadcn add) + RED test stubs: targetResolver.test.ts + targetChannels.test.ts

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-03-PLAN.md — TargetResolver.ts (username + phone via ResolvePhone, bio, avatar) + targetChannels.ts (IPC handlers) — GREEN all tests

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-04-PLAN.md — Renderer wiring: targetClient.ts + targetStore.ts + extend preload/index.ts + wire TargetResolver in main/index.ts

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-05-PLAN.md — UI: resolveCopy.ts + TargetInput.tsx + TargetCard.tsx + replace stub region (has checkpoint)

**Wave 6 (gap closure)** *(blocked on code-review fix commits)*

- [x] 03-06-PLAN.md — Verify CR-01/CR-02/CR-03 fixes, fix targetClient.ts Window augmentation (tsconfig.web TS errors), human API smoke test

**UI hint**: yes

### Phase 4: Group Enumeration, Membership & Rights

**Goal**: For a resolved target, the user sees a checklist of only the groups where the target is actually a member, pre-checked for removal, with groups the user lacks ban rights in greyed-out and labeled by reason and group type.
**Depends on**: Phase 3
**Requirements**: GRP-01, GRP-02, GRP-03, GRP-04, GRP-05
**Success Criteria** (what must be TRUE):

  1. The list shows only groups where the target's membership was verified per group (no candidates the target isn't actually in)
  2. Each actionable group appears as a checkbox pre-checked for removal, and the user can uncheck groups to keep the target in them
  3. Groups where the user lacks the ban/kick right appear greyed-out with a specific reason and are not actionable
  4. The app detects each group's type (basic group vs supergroup vs channel) and uses it to determine removal capability and the correct grey-out reason
  5. The app window widens to a ~3x-wider two-pane layout below the header: target/search pane in the left third, groups display pane in the right two-thirds — saving vertical space and giving long group names room (user request 2026-06-11)

**Plans**: 11 plans
Plans:
**Wave 1** *(test stubs + mock client extensions)*

- [x] 04-01-PLAN.md — Wave 0: test stubs (groupEnumerator.test.ts, membershipScanner.test.ts, groupChannels.test.ts) + extend mock client

**Wave 2** *(parallel with Wave 1 complete — shared contracts)*

- [x] 04-02-PLAN.md — Shared types: groupTypes.ts + channels.ts augmentation (GROUP_*/SCAN_* constants)

**Wave 3** *(parallel — both blocked on Wave 2)*

- [x] 04-03-PLAN.md — GroupEnumerator.ts: dialog enumeration + type classification + rights detection (GREEN tests)
- [x] 04-04-PLAN.md — MembershipScanner.ts: per-target membership scan with streaming progress (GREEN tests)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-05-PLAN.md — IPC wiring: groupChannels.ts + preload bridge + main/index.ts service registration + window resize D-10

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 04-06-PLAN.md — Renderer foundation: groupsClient.ts + groupsStore.ts + checkbox.tsx + scroll-area.tsx

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 04-07-PLAN.md — Renderer leaf components: groupsCopy.ts + GroupRow.tsx

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 04-08-PLAN.md — GroupsPane.tsx: browse mode + checklist mode + scan progress + empty states

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 04-09-PLAN.md — AppShell.tsx two-pane restructure + delete StubbedWorkflowRegions + CountryPicker CZ fix

**Wave 9 (human checkpoint)** *(blocked on Wave 8 completion)*

- [x] 04-10-PLAN.md — Human visual verification: layout, scan flow, row states, interactivity

**Wave 10 (gap closure)** *(blocked on Wave 9 completion)*

- [x] 04-11-PLAN.md — Fix scan lifecycle bugs: CR-01 stale scan on target change, CR-02 retryGroup generation guard, CR-03 checkedDialogIds wipe on retry-complete

**UI hint**: yes — wide layout: left third = search/target pane, right two-thirds = groups pane; window default size widened accordingly

### Phase 4.1: Target Search by Name (INSERTED)

**Goal**: A user who knows only the target's first and/or last name can search for them across the groups they administer, pick the right person from a disambiguation list of candidates (avatar + identity details per candidate), and land in the exact same resolved-target confirmation gate as username/phone resolution — so name search is a third entry path, not a parallel flow.
**Depends on**: Phase 4 (requires the enumerated dialog/group list and group-type detection)
**Requirements**: TGT-05
**Architecture decision (2026-06-11)**: Name search is GROUP-SCOPED, not global. On-demand at search time (never prefetched at login), the app iterates the already-enumerated groups and runs server-side participant name search per group (`channels.GetParticipants` + `ChannelParticipantsSearch(q)` for supergroups/channels; full participant list + client-side filter for basic groups, which cap at ~200 members), all serialized through the rate-limit governor with progressive results. Rationale: global `contacts.Search` only finds users with a public @username or in contacts — a username-less bad actor is invisible to it, while group-scoped search finds exactly the removable population. Prefetching all participants at login was evaluated and rejected as too data-heavy (hundreds of paginated calls for large groups).
**Success Criteria** (what must be TRUE):

  1. User can enter a first + last name (or partial name) and the app searches participants of the user's enumerated groups via governor-routed per-group search calls, streaming results progressively with a visible scan progress indicator
  2. When multiple candidates match, user sees a disambiguation list with avatar, name, @username (if any), numeric ID, and which group(s) they were found in, deduplicated by user ID — and can pick one
  3. Picking a candidate resolves them through the existing TargetResolver path (stable numeric ID, exactly-once resolution) and lands in the same TargetCard confirm gate as username/phone entry
  4. When no candidates match after the scan completes, user gets a clear, accurate empty-state message (not an error and not a dead end — they can edit the search)

**Plans**: 5 plans

Plans:

**Wave 1** *(shared types + test stubs + mock client extension)*

- [x] 04.1-01-PLAN.md — Shared types (searchTypes.ts), channel constants, opTypes additions, mock client extension (GetParticipants/GetUsers), Wave 0 test stubs (Nyquist)

**Wave 2** *(implementation — blocked on Wave 1)*

- [x] 04.1-02-PLAN.md — ParticipantSearcher.ts (GREEN tests) + TargetResolver.resolveByCandidate()

**Wave 3** *(IPC wiring — blocked on Wave 2)*

- [x] 04.1-03-PLAN.md — searchChannels.ts + TARGET_RESET CR-01 update + main/index.ts wiring + preload bridge

**Wave 4** *(renderer foundation — blocked on Wave 3)*

- [x] 04.1-04-PLAN.md — searchClient.ts + searchStore.ts + TargetInput name mode extension + resolveCopy hint

**Wave 5** *(UI components + human checkpoint — blocked on Wave 4)*

- [x] 04.1-05-PLAN.md — searchCopy.ts + CandidateRow.tsx + CandidateList.tsx + AppShell wiring + visual verification

### Phase 5: Removal Execution Engine

**Goal**: A durable, sequential, throttled executor removes the target from each selected group using the correct mechanic for its type and the chosen kick/ban severity, isolating per-group failures and emitting live progress plus a final per-group report.
**Depends on**: Phase 4
**Requirements**: RMV-01, RMV-02, EXE-04, EXE-05
**Success Criteria** (what must be TRUE):

  1. User can choose per run between ban (blocks rejoin) and kick (removable, can rejoin), defaulting to kick
  2. The executor applies the correct mechanic per group type — basic-group `deleteChatUser` vs supergroup/channel `editBanned`, with kick implemented as restrict-then-unban
  3. Removal runs sequentially through the governor (concurrency=1) with each group's outcome checkpointed so a crash or mid-job PEER_FLOOD leaves recoverable state
  4. A failure in one group is isolated and does not abort the rest of the job
  5. The job emits live progress during execution and produces a per-group success/failure report afterward

**Plans**: 7 plans
Plans:
**Wave 1** *(parallel — shared types + mock client/test stubs)*

- [x] 05-01-PLAN.md — Shared contracts: removalTypes.ts, channels.ts + opTypes.ts augmentation (REMOVAL_* constants, RMV_* error codes)
- [x] 05-02-PLAN.md — Mock client extension (EditBanned/DeleteChatUser call-recording) + Wave 0 RED test stubs

**Wave 2** *(parallel — blocked on Wave 1)*

- [x] 05-03-PLAN.md — AuditStore: atomic job file persistence, checkpoint, resume detection (GREEN tests)
- [x] 05-04-PLAN.md — RemovalExecutor: type-branching engine, generation guard, abort, PEER_FLOOD hard-stop (GREEN tests)

**Wave 3** *(blocked on Wave 2)*

- [x] 05-05-PLAN.md — IPC wiring: removalChannels.ts + main/index.ts + preload bridge + TARGET_RESET CR-01 update

**Wave 4** *(blocked on Wave 3)*

- [x] 05-06-PLAN.md — Renderer foundation: removalClient, removalStore, removalCopy, RemovalConfirmDialog, ResumeJobDialog

**Wave 5 (human checkpoint)** *(blocked on Wave 4)*

- [x] 05-07-PLAN.md — GroupRow/GroupsPane removal surface + live verification checkpoint

### Phase 6: UI Integration — Wizard, Safety Gates & Progress

**Goal**: The full end-to-end wizard ties the services together, gating destructive action behind a dry-run preview and a final review screen that shows the target's numeric ID and exact affected groups, requiring one explicit confirmation before live execution with progress and report.
**Depends on**: Phase 5
**Requirements**: SAF-01, SAF-02, SAF-03
**Success Criteria** (what must be TRUE):

  1. Before any removal, the user can run a dry-run/preview that reports exactly what would happen without performing any removal
  2. The final review screen shows the target identity including numeric user ID alongside the exact list of affected groups and the chosen action
  3. Execution does not start until the user gives one explicit confirmation on the review screen
  4. During and after execution the user sees live per-group progress and a final success/failure report in the wizard

**Plans**: 5 plans
Plans:

**Wave 1** *(Plans 01 and 02 run in parallel — no file overlap)*

- [x] 06-01-PLAN.md — Shared contracts: removalTypes.ts floodWaitRemaining + SEVERITY_GET/SET channels + preload bridge + severityClient + Wave 0 test stubs
- [x] 06-02-PLAN.md — electron-store install + severityChannels.ts (main IPC) + RemovalExecutor _handleGovernorEvent flood plumbing + main/index.ts wiring

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-03-PLAN.md — wizardCopy.ts + StepIndicator.tsx + ReviewScreen.tsx (computePlannedActions, SAF-01/02/03) + reviewScreen.test.ts GREEN

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-04-PLAN.md — AppShell wizard stage machine + TargetCard onTargetConfirmed + GroupsPane: retire RemovalConfirmDialog, run-trigger re-wired, FLOOD_WAIT subline, structured summary band, Remove someone else

**Wave 4 (human checkpoint)** *(blocked on Wave 3 completion)*

- [x] 06-05-PLAN.md — Human visual verification: full wizard flow, Review screen content, single gate, FLOOD_WAIT subline, Remove someone else

**UI hint**: yes

### Phase 7: Packaging, Signing & Release

**Goal**: MrProper ships as code-signed, notarized portable installers that launch cleanly for non-technical admins on stock macOS and Windows without Gatekeeper or SmartScreen blocking. Electron 37.10.3 (macOS 11 Big Sur minimum) required for the primary admin's machine (D-16).
**Depends on**: Phase 6
**Requirements**: APP-03
**Success Criteria** (what SHOULD be TRUE):

  1. The macOS build is code-signed with a Developer ID and notarized — launches on a clean macOS 11 Big Sur (or later) machine without a Gatekeeper block (signed in-scope per D-01)
  2. The Windows build ships unsigned (D-05 — deferred); SmartScreen "More info → Run anyway" is the accepted v1 experience; instructions in README
  3. Launch is verified on ARM Mac (Apple Silicon), Intel Mac, macOS 11.7.10 Big Sur Mac (primary admin), and Windows VM — each reaching Telegram code-entry step (D-13, D-14)

**Plans**: 5 plans
Plans:

**Wave 1** *(Electron downgrade — must complete before all other work)*

- [x] 07-01-PLAN.md — Downgrade Electron ^42.0.0 → exact pin 37.10.3 (D-16 Big Sur compat); verify plist LSMinimumSystemVersion=11.0, tsc green, vitest green, dev smoke

**Wave 2** *(blocked on Wave 1 — depends on Electron 37 installed)*

- [x] 07-02-PLAN.md — electron-builder.yml signing config (remove identity:null, remove zip targets, add hardenedRuntime+entitlements); build/entitlements.mac.plist; .env.example notarization vars; version bump to 0.9.0

**Wave 3** *(blocked on Wave 2 — release script references finalized config)*

- [x] 07-03-PLAN.md — scripts/release.sh (pre-flight validated orchestrator: tsc, build, package:mac, package:win, spctl+stapler verify, artifact collect); README.md (SmartScreen instructions + macOS 11 min requirement)

**Wave 4 (checkpoint)** *(blocked on Wave 3)*

- [x] 07-04-PLAN.md — Run release script, confirm notarytool "status: Accepted", verify spctl+stapler pass on dev machine, confirm 4 artifacts in release/dist/

**Wave 5 (UAT checkpoint)** *(blocked on Wave 4 artifacts)*

- [x] 07-05-PLAN.md — Clean-machine UAT: ARM Mac + Intel Mac + Big Sur 11.7.10 Mac + Windows VM smoke tests (D-13/D-14/D-15/D-16)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Auth, Session & Portable Shell | 5/5 | Complete   | 2026-06-11 |
| 2. Rate-Limit Governor & Error Classification | 4/4 | Complete   | 2026-06-11 |
| 3. Target Resolution & Verification | 6/6 | Complete   | 2026-06-11 |
| 4. Group Enumeration, Membership & Rights | 11/11 | Complete   | 2026-06-12 |
| 4.1 Target Search by Name (INSERTED) | 5/5 | Complete   | 2026-06-12 |
| 5. Removal Execution Engine | 7/7 | Complete   | 2026-06-12 |
| 6. UI Integration — Wizard, Safety Gates & Progress | 5/5 | Complete   | 2026-06-12 |
| 7. Packaging, Signing & Release | 5/5 | Complete   | 2026-06-12 |
| 8. Localization — i18n & Czech Translation (v1.5) | 0/TBD | Not started | - |

### Phase 8: Localization — i18n & Czech Translation (v1.5)

**Goal**: A user can switch the app language via a `Language` settings row with `English` and `Česky` options, with every UI string externalized through an i18n framework and fully translated to Czech — shipped as v1.5, only after all v1 features are finished and UAT passes.
**Depends on**: Phase 7 (all v1 features complete + UAT passed)
**Requirements**: LOC-01 (Language switcher with English/Česky), LOC-02 (all UI strings externalized via i18n), LOC-03 (complete Czech translation)
**Success Criteria** (what must be TRUE):

  1. Settings menu has a `Language` row with `English` and `Česky` submenu options, and switching takes effect without restart (or with a clearly communicated reload)
  2. No user-facing string is hardcoded in components — all flow through the i18n layer (the existing copy-module pattern, e.g. resolveCopy.ts/errorCopy.ts, migrates into it)
  3. The full app is usable in Czech: every label, error message, confirmation gate, and progress string is translated
  4. Language preference persists across launches (non-secret pref storage)

**Notes**: Translation work must wait for feature-freeze + UAT, but i18n hygiene is prepared on-the-fly from now: phases 4-7 should keep all new user-facing strings in dedicated copy modules (the established `*Copy.ts` pattern) so extraction into the i18n framework is mechanical.

**Plans**: 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 8 to break down)
