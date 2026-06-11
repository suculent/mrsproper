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
- [ ] **Phase 3: Target Resolution & Verification** - Resolve a target to a stable numeric ID and visually confirm identity before any action
- [ ] **Phase 4: Group Enumeration, Membership & Rights** - Membership-verified, rights-aware checklist of the groups the target can be removed from
- [ ] **Phase 5: Removal Execution Engine** - Throttled, type-branched, per-group-isolated kick/ban executor with live progress and report
- [ ] **Phase 6: UI Integration — Wizard, Safety Gates & Progress** - End-to-end wizard with dry-run, final review, explicit confirm, and live execution view
- [ ] **Phase 7: Packaging, Signing & Release** - Code-signed, notarized portable builds verified launching on clean macOS and Windows machines

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

**Plans**: TBD
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

**Plans**: TBD
**UI hint**: yes

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

**Plans**: TBD

### Phase 6: UI Integration — Wizard, Safety Gates & Progress

**Goal**: The full end-to-end wizard ties the services together, gating destructive action behind a dry-run preview and a final review screen that shows the target's numeric ID and exact affected groups, requiring one explicit confirmation before live execution with progress and report.
**Depends on**: Phase 5
**Requirements**: SAF-01, SAF-02, SAF-03
**Success Criteria** (what must be TRUE):

  1. Before any removal, the user can run a dry-run/preview that reports exactly what would happen without performing any removal
  2. The final review screen shows the target identity including numeric user ID alongside the exact list of affected groups and the chosen action
  3. Execution does not start until the user gives one explicit confirmation on the review screen
  4. During and after execution the user sees live per-group progress and a final success/failure report in the wizard

**Plans**: TBD
**UI hint**: yes

### Phase 7: Packaging, Signing & Release

**Goal**: MrProper ships as code-signed, notarized portable installers that launch cleanly for non-technical admins on stock macOS and Windows without Gatekeeper or SmartScreen blocking.
**Depends on**: Phase 6
**Requirements**: APP-03
**Success Criteria** (what must be TRUE):

  1. The macOS build is code-signed with a Developer ID and notarized, and launches on a clean macOS machine without a Gatekeeper block
  2. The Windows build is code-signed and launches on a clean Windows machine without a SmartScreen block
  3. Launch is verified on clean VMs covering both OSes (and Intel + ARM macOS) from the distributed installers

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Auth, Session & Portable Shell | 5/5 | Complete   | 2026-06-11 |
| 2. Rate-Limit Governor & Error Classification | 4/4 | Complete   | 2026-06-11 |
| 3. Target Resolution & Verification | 0/TBD | Not started | - |
| 4. Group Enumeration, Membership & Rights | 0/TBD | Not started | - |
| 5. Removal Execution Engine | 0/TBD | Not started | - |
| 6. UI Integration — Wizard, Safety Gates & Progress | 0/TBD | Not started | - |
| 7. Packaging, Signing & Release | 0/TBD | Not started | - |
