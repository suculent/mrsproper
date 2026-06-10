# Architecture Research

**Domain:** Cross-platform desktop app driving the Telegram MTProto **User** API to bulk-remove a target across many admin-owned groups, with rate-limit-safe throttled execution.
**Researched:** 2026-06-10
**Confidence:** HIGH on component decomposition, data flow, and the throttled-executor design; MEDIUM-HIGH on the stack/runtime-boundary recommendation (Electron + GramJS) — driven by MTProto library maturity, verified against official Telegram error docs and GramJS/Telethon API surfaces.

---

## TL;DR Recommendation (the load-bearing architectural decision)

**Run the MTProto client in-process in the Electron main process using GramJS, with the UI in the renderer talking to it over Electron IPC.**

Rationale, evidence-driven:

- **The MTProto library choice dictates the runtime.** The User API (required — Bot API cannot enumerate the admin's groups, per PROJECT.md Out-of-Scope) has three realistic library options:
  - **GramJS** (Node/TypeScript) — mature, actively maintained, runs natively in Electron's main process. Session persistence via `StringSession` (`client.session.save()`) is a first-class, documented feature.
  - **grammers** (Rust) — would fit a Tauri core, but is community-maintained with **rare releases** and an **unaudited crypto/auth path** (its own README warns to review `grammers-crypto` and the auth part of `grammers-mtproto` if security is critical). For a tool holding a real session and doing destructive actions, that is a poor foundation.
  - **Telethon** (Python) — the most battle-tested User-API library (best FLOOD_WAIT ergonomics via `flood_sleep_threshold`), but in a desktop app it must run as a **PyInstaller sidecar over IPC**, adding a process boundary, ~40MB+ packaging weight, and a serialization layer.
- **In-process beats sidecar here.** A sidecar (Tauri+grammers, or Tauri/Electron+Telethon) introduces an IPC marshalling boundary for *every* Telegram call, a second runtime to package and code-sign on macOS + Windows, and lifecycle/crash-recovery complexity. GramJS lets the executor, queue, and Telegram client live in one address space — the throttled job loop can `await` RPCs directly and keep a single in-memory back-off clock.
- **Tauri's bundle-size win (~2.5MB vs ~85MB) is real but not decisive** for an admin-installed tool used occasionally; it would be *paid back in full* by the sidecar tax and the immature Rust MTProto stack. If bundle size or per-user api_id/api_hash registration were hard constraints, revisit — but PROJECT.md ships a shared api_id/api_hash and prioritizes "easy to run," which Electron + electron-builder satisfies on both OSes.

**The UI ↔ MTProto-runtime boundary is therefore: Renderer (UI) ⇄ Electron IPC ⇄ Main process (session manager + services + executor + GramJS client).** No Telegram credential, session string, or raw GramJS object ever crosses into the renderer.

If the team strongly prefers Rust/Tauri for distribution reasons, the **fallback** is Tauri core + **Telethon Python sidecar** over a length-prefixed JSON-RPC stdio channel — accept the sidecar tax to get Telethon's superior flood handling, rather than betting on unaudited `grammers`.

---

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                      RENDERER (UI layer — web frontend)                 │
│  ┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌──────────┐ ┌─────────┐  │
│  │  Login   │ │  Target   │ │   Group      │ │  Review/ │ │ Progress│  │
│  │  wizard  │ │  resolve  │ │   checklist  │ │  confirm │ │ + report│  │
│  └────┬─────┘ └─────┬─────┘ └──────┬───────┘ └────┬─────┘ └────┬────┘  │
│       │             │              │              │            │       │
│       └─────────────┴──────────────┴── UI state store ─────────┘       │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  Electron IPC (typed request/response
                                 │  + main→renderer event stream)
┌────────────────────────────────▼──────────────────────────────────────┐
│                    MAIN PROCESS (Node) — application core               │
│                                                                         │
│   ┌─────────────────────────  Service layer  ────────────────────────┐ │
│   │ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐              │ │
│   │ │ TargetResolver│ │GroupEnumerator│ │MembershipVerif│             │ │
│   │ │ (username/    │ │ (admin's      │ │ (target ∈     │             │ │
│   │ │  phone→user)  │ │  groups+rights)│ │  group?)     │             │ │
│   │ └──────┬────────┘ └──────┬───────┘ └──────┬────────┘              │ │
│   │        └─────────────────┴────────────────┘                       │ │
│   │                          │                                        │ │
│   │              ┌───────────▼─────────────┐                          │ │
│   │              │  RemovalJobExecutor      │  emits progress events  │ │
│   │              │  (throttled queue +      │──────────┐              │ │
│   │              │   FLOOD_WAIT back-off)   │          │              │ │
│   │              └───────────┬─────────────┘          │              │ │
│   └──────────────────────────┼────────────────────────┼──────────────┘ │
│                              │                         │                │
│   ┌──────────────────────────▼─────────┐   ┌───────────▼────────────┐   │
│   │  SessionManager / MTProto client    │   │  Results/AuditStore    │   │
│   │  (single GramJS TelegramClient,     │   │  (job state, per-group │   │
│   │   api_id/api_hash, auth flow)       │   │   outcomes, resumable) │   │
│   └──────────────────┬──────────────────┘   └───────────┬────────────┘   │
└──────────────────────┼──────────────────────────────────┼───────────────┘
                       │ MTProto/TCP (TLS)                 │
              ┌────────▼────────┐                 ┌────────▼─────────┐
              │ Telegram DCs    │                 │ OS keychain +    │
              │ (User API)      │                 │ encrypted disk   │
              └─────────────────┘                 └──────────────────┘
```

### Component Responsibilities

| Component | Responsibility (owns) | Typical Implementation |
|-----------|----------------------|------------------------|
| **UI layer (renderer)** | Wizard flow, rendering avatar/identity, the pre-checked group checklist, greyed-out no-rights rows, ban/kick toggle, final review, live progress + final report. Holds *no* secrets. | Web frontend (React/Svelte/Vue) in Electron renderer; subscribes to a state store fed by IPC events. |
| **SessionManager / MTProto client** | The single source of truth for the Telegram connection. Owns the one `TelegramClient`, embedded `api_id`/`api_hash`, the phone→code→2FA auth state machine, session string persistence, and logout/clear. All Telegram I/O funnels through here. | GramJS `TelegramClient` + `StringSession`, instantiated once in main process. |
| **TargetResolver** | Turn a username **or** phone into a concrete user entity; fetch identity (name, username, id, bio) and avatar bytes; classify resolution failures (not-occupied, privacy-restricted, not-in-contacts). | `contacts.resolveUsername` / `contacts.resolvePhone`; profile-photo download with no-photo fallback. |
| **GroupEnumerator** | List the admin's dialogs, filter to groups/supergroups/megagroups (exclude broadcast channels/DMs), and determine the admin's **own** rights per group (does the logged-in account have ban/kick permission here?). | GramJS `iterDialogs()` filtered to chat/megagroup; admin-rights from the participant/chat object. |
| **MembershipVerifier** | For each candidate group, answer "is the *target* a member?" cheaply, and capture removal mechanics (basic group vs supergroup). Drives which groups appear in the checklist. | Per-group `channels.GetParticipant` (single-user check) — not full participant scans. Maps `USER_NOT_PARTICIPANT` → "not a member". |
| **RemovalJobExecutor** | Model "remove target from N groups" as one cancellable, observable, resumable job: a sequential throttled queue with FLOOD_WAIT back-off, concurrency cap, per-item retry classification, and progress events. | In-process async queue/worker loop (e.g. `p-queue` concurrency=1) wrapping ban/kick RPCs. |
| **Results/AuditStore** | Durable record of job definition (target id + selected group ids + mode) and per-group outcomes, enabling resume-after-crash and the post-run report. | SQLite (better-sqlite3) or a structured JSON job file in app data dir. |
| **Secret storage** | Encrypted-at-rest session string; OS keychain integration; where the shipped api_id/api_hash live. | OS keychain (Keychain / Windows Credential Manager) for the session secret; api_id/api_hash compiled into the main bundle. |

---

## Recommended Project Structure

```
src/
├── renderer/                 # UI layer — no secrets, no GramJS imports
│   ├── views/                # login, resolve, checklist, review, progress
│   ├── store/                # UI state; subscribes to IPC event stream
│   └── ipc/                  # typed client wrappers over ipcRenderer
│
├── main/                     # Electron main process — the application core
│   ├── ipc/                  # IPC handlers; the ONLY surface the UI can call
│   ├── telegram/
│   │   ├── SessionManager.ts # single TelegramClient, auth state machine
│   │   ├── client.ts         # GramJS construction, api_id/api_hash injection
│   │   └── errors.ts         # parse RPC errors → typed domain errors
│   ├── services/
│   │   ├── TargetResolver.ts
│   │   ├── GroupEnumerator.ts
│   │   └── MembershipVerifier.ts
│   ├── jobs/
│   │   ├── RemovalJobExecutor.ts  # throttled queue + back-off + events
│   │   ├── RemovalJob.ts          # job/item state model
│   │   └── backoff.ts             # FLOOD_WAIT sleep + retry policy
│   ├── storage/
│   │   ├── secrets.ts        # keychain read/write of session string
│   │   └── auditStore.ts     # SQLite/JSON job + outcomes persistence
│   └── config.ts             # embedded api_id/api_hash, app data paths
│
└── shared/
    ├── types.ts              # IPC DTOs, domain models (Target, GroupRow, JobState)
    └── events.ts             # event names + payload contracts
```

### Structure Rationale

- **`renderer/` vs `main/` is the security boundary, not just a layout choice.** Keeping every GramJS import and every secret in `main/` guarantees a compromised/inspected renderer cannot read the session or call Telegram directly. The renderer only knows IPC channel names and DTO shapes from `shared/`.
- **`services/` are stateless-ish orchestrators over the one client.** They take the `SessionManager`'s client by injection; they don't each open connections. This keeps a single back-off clock and a single rate-limit surface.
- **`jobs/` is isolated** because the throttled executor is the riskiest, most testable unit — it should be unit-testable with a mock Telegram client (simulate FLOOD_WAIT, USER_NOT_PARTICIPANT) with no network.
- **`storage/` separates "secret" (keychain) from "audit" (disk DB).** Different security profiles: the session is keychain-grade; the audit log is ordinary app data.

---

## Architectural Patterns

### Pattern 1: Single MTProto client behind a service facade (one connection, many callers)

**What:** Exactly one `TelegramClient` lives in `SessionManager`. TargetResolver, GroupEnumerator, MembershipVerifier, and RemovalJobExecutor all receive that client and never construct their own.
**When to use:** Always, for this app. MTProto auth is per-connection and rate limits are per-account — multiple clients would multiply FLOOD_WAIT risk and complicate session persistence.
**Trade-offs:** Single point of failure / serialization point (good — it makes throttling enforceable); requires all Telegram access to be funneled, which is exactly the discipline you want.

```typescript
// All services depend on the SAME client instance.
class GroupEnumerator {
  constructor(private session: SessionManager) {}
  async listAdminGroups(): Promise<GroupRow[]> {
    const client = this.session.client; // never `new TelegramClient(...)`
    const rows: GroupRow[] = [];
    for await (const dialog of client.iterDialogs()) {
      if (!dialog.isGroup) continue;            // skip DMs + broadcast channels
      rows.push(toGroupRow(dialog, adminRightsOf(dialog)));
    }
    return rows;
  }
}
```

### Pattern 2: Throttled, observable, resumable Job for "remove from N groups"

**What:** Model the bulk removal as a first-class `RemovalJob` with an ordered list of `RemovalItem` (one per selected group), each in a state (`pending → running → succeeded | failed | skipped`). A worker drains the queue **sequentially** (concurrency = 1), persisting each transition so a crash/quit can resume. Cancellation flips a token the loop checks between items.
**When to use:** The core execution path. This is the heart of the app.
**Trade-offs:** Sequential is slower than parallel, but Telegram FLOOD_WAITs reward pacing and punish bursts (per PROJECT.md, rate limits are a first-class constraint). Persistence adds I/O per item but buys resumability and the audit report for free.

```typescript
async function runJob(job: RemovalJob, client, emit, token: CancelToken) {
  for (const item of job.items) {
    if (token.cancelled) { emit({ type: 'cancelled', at: item.groupId }); return; }
    if (item.state !== 'pending') continue;          // resume: skip done items
    emit({ type: 'item-start', groupId: item.groupId });
    try {
      await withFloodWaitBackoff(() => removeTarget(client, item, job.mode));
      item.state = 'succeeded';
    } catch (e) {
      const cls = classifyTelegramError(e);          // typed domain error
      item.state = cls.terminal ? 'failed' : 'failed';
      item.error = cls.code;                          // e.g. USER_NOT_PARTICIPANT
    }
    await auditStore.persist(item);                   // crash-safe checkpoint
    emit({ type: 'item-done', groupId: item.groupId, state: item.state, error: item.error });
    await sleep(job.minGapMs);                        // gentle inter-item pacing
  }
  emit({ type: 'job-done', summary: summarize(job) });
}
```

### Pattern 3: Centralized FLOOD_WAIT back-off wrapper

**What:** A single helper wraps every rate-limitable RPC. On a `420 FLOOD_WAIT_X`, read the `seconds` value Telegram returns, emit a "waiting" event to the UI (so progress shows a countdown, not a freeze), sleep that long, then retry. A configurable threshold caps auto-sleep (above it, surface to the user instead of blocking for an hour).
**When to use:** Wrap **all** participant checks and removal calls. Enumeration too if it ever flood-waits.
**Trade-offs:** Auto-sleeping is the desired behavior (the product explicitly never wants to hit limits), but unbounded sleeps must be capped + made visible so the app doesn't appear hung.

```typescript
async function withFloodWaitBackoff<T>(fn: () => Promise<T>, emit, max = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (e) {
      const wait = floodWaitSeconds(e);               // parse FLOOD_WAIT_X
      if (wait == null || attempt >= max) throw e;
      emit({ type: 'flood-wait', seconds: wait });    // UI shows countdown
      await sleep(wait * 1000 + 250);                 // small safety margin
    }
  }
}
```

*Note:* GramJS performs some FLOOD_WAIT auto-handling internally below a threshold, similar to Telethon's `flood_sleep_threshold`. Centralizing it yourself anyway gives you the **progress events** (countdown to UI) and a single tunable policy — don't rely solely on library defaults for a user-facing countdown.

### Pattern 4: Auth as an explicit state machine in SessionManager

**What:** Login is multi-step and stateful (`needPhone → needCode → maybeNeed2FA → authorized`). Model it explicitly; IPC calls advance the machine (`submitPhone`, `submitCode`, `submitPassword`). On `authorized`, save the session string to the keychain.
**When to use:** Always — phone + code + optional 2FA can't be a single call.
**Trade-offs:** More states to handle, but it maps cleanly to the login wizard UI and makes error states (wrong code, bad password) localized.

---

## Data Flow

### Happy path: login → list groups → resolve target → verify membership → confirm → execute

```
LOGIN
  Renderer(login wizard) --IPC submitPhone--> SessionManager
  SessionManager --MTProto sendCode--> Telegram --> (state: needCode)
  Renderer --IPC submitCode--> SessionManager --signIn--> Telegram
     ├─ if 2FA: (state: needPassword) --IPC submitPassword--> checkPassword
     └─ authorized --> SessionManager.saveSession() --> OS keychain (encrypted)

RESOLVE TARGET
  Renderer(resolve) --IPC resolveTarget(username|phone)--> TargetResolver
  TargetResolver --resolveUsername / resolvePhone--> Telegram
     ├─ success --> download avatar (or no-photo fallback) + identity
     │             --IPC--> Renderer renders avatar + name/username/id/bio
     └─ failure  --> typed error (NOT_OCCUPIED / PRIVACY / NOT_IN_CONTACTS)
                   --IPC--> Renderer shows graceful "couldn't resolve" message

ENUMERATE + VERIFY  (can run as one combined "scan" step)
  Renderer(checklist) --IPC scanGroups(targetId)--> GroupEnumerator
  GroupEnumerator --iterDialogs--> Telegram  -> admin's groups + admin's own rights
  For each group:  MembershipVerifier --GetParticipant(group, targetId)--> Telegram
     ├─ participant  --> include row, pre-checked, action=allowed-if-admin-has-rights
     ├─ USER_NOT_PARTICIPANT --> exclude row (target not here)
     └─ admin lacks ban right --> include row but GREYED-OUT with reason
  --IPC scan-progress events--> Renderer fills checklist incrementally

CONFIRM
  Renderer(review) shows target identity + exact affected-group list + mode(ban|kick)
  User makes one explicit confirmation --IPC startRemoval(jobDef)--> RemovalJobExecutor

EXECUTE  (see throttled path below)
```

### Throttled-execution path (the cancellable/observable/resumable job)

```
startRemoval(jobDef = {targetId, mode: ban|kick, groupIds[]})
  RemovalJobExecutor: build RemovalJob {items: pending per groupId}
  auditStore.create(job)                      # durable job record

  worker loop (concurrency = 1):
    ┌─ for each pending item ──────────────────────────────────────────┐
    │  check cancel token ──► if cancelled: emit 'cancelled', stop      │
    │  removeTarget(client, item, mode):                                │
    │     basic group  -> messages.DeleteChatUser                       │
    │     supergroup   -> channels.EditBanned(view_messages=false ...)  │
    │                     (ban = block rejoin; kick = restrict then     │
    │                      unrestrict so they can rejoin)               │
    │  wrapped in withFloodWaitBackoff:                                 │
    │     on FLOOD_WAIT_X -> emit 'flood-wait'{seconds} -> sleep -> retry│
    │  classify result:                                                 │
    │     ok                       -> item.succeeded                    │
    │     USER_NOT_PARTICIPANT     -> item.skipped  (already gone)      │
    │     CHAT_ADMIN_REQUIRED      -> item.failed   (lost rights)       │
    │     other RPC error          -> item.failed   (record code)       │
    │  auditStore.persist(item)    # crash-safe checkpoint              │
    │  emit 'item-done'{groupId, state, error}  -> UI live progress     │
    │  sleep(minGapMs)             # gentle inter-item pacing           │
    └──────────────────────────────────────────────────────────────────┘
  emit 'job-done'{summary: success/fail/skip counts} -> UI final report

RESUME (after crash/quit):
  on startup, auditStore.findIncompleteJob() -> offer "resume"
  worker skips items already succeeded/failed; re-runs only 'pending'/'running'
```

### State / event model (main → renderer)

```
RemovalJobExecutor (in main) ──emits──► IPC event channel ──► Renderer store
  events: scan-progress | item-start | item-done | flood-wait | cancelled | job-done
Renderer never polls; it subscribes. UI is a pure function of the latest event stream
+ the durable job snapshot fetched on demand (getJobState).
```

---

## Session / Credential Storage Architecture

| Secret | Where it lives | Why |
|--------|----------------|-----|
| **api_id / api_hash** | Compiled into the main-process bundle (`config.ts`), shipped with the binary. | PROJECT.md ships shared app-wide credentials so users do zero registration. These are not high-value secrets (they identify the *app*, not the *account*) — obfuscation is best-effort, not a security boundary. |
| **Session string** (the account-access secret) | **OS keychain** (macOS Keychain / Windows Credential Manager) via a native keychain binding; the GramJS `StringSession` value is the payload. | A leaked session string = full account access (per PROJECT.md). Keychain gives OS-level encryption-at-rest and avoids hand-rolling crypto. Renderer can never read it — only `SessionManager` in main touches it. |
| **Audit / job state** | App data dir (SQLite or JSON), ordinary file perms. | Non-secret operational data; needs to survive crashes for resume + report, not encryption-grade protection. |

**Logout** = delete the keychain entry **and** call the Telegram log-out RPC to invalidate the session server-side, then clear in-memory client state. Deleting only the local copy leaves a live session on Telegram's side — clear both.

**If a native keychain dependency is undesirable** (packaging/signing friction on Windows), the fallback is an encrypted local vault: a key derived from an OS-provided secret store (e.g. Electron `safeStorage`, which uses Keychain on macOS and DPAPI on Windows) encrypting the session blob on disk. Prefer the keychain; `safeStorage` is the pragmatic second choice and avoids a native module.

---

## Error-Handling Architecture (Telegram-specific)

All RPC errors pass through one `classifyTelegramError()` in `telegram/errors.ts`, mapping raw GramJS errors to a typed domain enum with a UI disposition. Telegram's `420 FLOOD` category carries `FLOOD_WAIT_X` ("wait X seconds"); everything else is a `400/403`-class semantic error.

| Telegram error | Where it surfaces | Classification | UI / executor disposition |
|----------------|-------------------|----------------|---------------------------|
| **FLOOD_WAIT_X** (420) | any RPC, esp. removals | Retryable, timed | Auto-sleep `X`s (capped); emit `flood-wait` countdown; retry. **Never** count as failure. |
| **USER_NOT_PARTICIPANT** | MembershipVerifier; executor | Benign / already-done | Verifier: exclude group from list. Executor: mark item **skipped** (target already gone), not failed. |
| **CHAT_ADMIN_REQUIRED** | executor (and rights pre-check) | Terminal per-group | Pre-empted by greying-out at checklist time; if it still fires (rights changed mid-run), mark item **failed** with "no longer have rights". |
| **USERNAME_NOT_OCCUPIED** | TargetResolver (username path) | Resolution failure | "No such username" — graceful non-resolution; offer phone lookup instead. |
| **phone not resolvable / not in contacts** (e.g. PEER_ID_INVALID / privacy on `resolvePhone`) | TargetResolver (phone path) | Resolution failure | Explain Telegram limits phone lookup to **contacts**; suggest username. Per PROJECT.md, handle gracefully — this is expected, not a bug. |
| **USER_PRIVACY_RESTRICTED** | TargetResolver (avatar/identity) | Partial data | Show identity without avatar (no-photo fallback); proceed. |
| **USER_ADMIN_INVALID / can't ban an admin** | executor | Terminal per-group | Mark item failed: "target is an admin here, can't remove." |
| **ServerError / RpcCallFail (500-class)** | any RPC | Transient | Bounded exponential retry (separate from FLOOD policy); then fail item. |

Design rules:
- **Two retry policies, kept distinct:** FLOOD_WAIT (sleep the exact server-given seconds) vs transient server errors (bounded exponential backoff). Don't conflate.
- **Classification, not strings:** the executor branches on a typed enum so "skip vs fail vs retry" is testable without a network.
- **Failures are per-item, never fatal to the job:** one bad group must not abort the run; record it and continue. The final report shows per-group outcomes (PROJECT.md requirement).

---

## Suggested Build Order (foundational → dependent)

1. **SessionManager + auth state machine + GramJS client wiring + keychain session persistence.** Foundational — *nothing* works without an authenticated client, and session storage is a core safety requirement. Deliverable: log in (phone/code/2FA), persist, relaunch without re-login, logout clears both local + server session.
2. **`telegram/errors.ts` classification + `withFloodWaitBackoff`.** Build the error/back-off spine early; every later component depends on it. Unit-testable against a mock client (no UI yet).
3. **TargetResolver.** Depends on (1). Username + phone resolution, identity + avatar with no-photo and non-resolution fallbacks. First visible "it does something" milestone.
4. **GroupEnumerator + MembershipVerifier.** Depend on (1)+(2). Produce the group rows: member? + admin's own rights? This yields the checklist data model (pre-checked, greyed-out-with-reason).
5. **Results/AuditStore.** Job + per-item persistence. Build before the executor so the executor can checkpoint from day one (resumability is cheaper built-in than retrofitted).
6. **RemovalJobExecutor.** Depends on (1),(2),(5). The throttled, cancellable, observable, resumable queue. The riskiest unit — test against a mock client simulating FLOOD_WAIT / USER_NOT_PARTICIPANT / CHAT_ADMIN_REQUIRED before any real removals.
7. **UI layer + IPC contracts**, integrated progressively against each service as it lands (login wizard with 1, resolve view with 3, checklist with 4, review+progress+report with 6). The final review/confirm gate and live-progress UI bind last, on top of the executor's event stream.

**Critical-path note:** items 1, 2, 5, 6 are the spine (auth → error policy → durability → executor). 3 and 4 are parallelizable once 1+2 exist. The UI can be stubbed against fake IPC handlers from the start so frontend and core proceed in parallel.

---

## Anti-Patterns

### Anti-Pattern 1: Putting GramJS (or any Telegram call / the session string) in the renderer
**What people do:** Import the MTProto client in the web frontend "to keep it simple."
**Why it's wrong:** The renderer is the least-trusted process; a leaked session = full account takeover. It also forks the rate-limit clock across processes.
**Do this instead:** All Telegram I/O and secrets in main; renderer reaches them only via typed IPC. (This is also why Electron, where main is real Node, fits better than a setup that pushes logic to a webview.)

### Anti-Pattern 2: Parallel-blasting removals to go "fast"
**What people do:** `Promise.all` the kicks across N groups.
**Why it's wrong:** Reliably triggers FLOOD_WAIT and risks account restriction — the exact outcome PROJECT.md forbids.
**Do this instead:** Sequential queue (concurrency 1), inter-item pacing, centralized FLOOD_WAIT back-off with a UI countdown.

### Anti-Pattern 3: Verifying membership by downloading full participant lists
**What people do:** `getParticipants(group)` and search the result for the target.
**Why it's wrong:** Expensive, paginated, capped (Telegram limits large fetches), and multiplies API load across every group — itself a flood risk.
**Do this instead:** Per-group single-user `GetParticipant(group, target)`; treat `USER_NOT_PARTICIPANT` as the clean "not a member" signal.

### Anti-Pattern 4: Treating FLOOD_WAIT or USER_NOT_PARTICIPANT as job failures
**What people do:** Catch-all → mark group "failed."
**Why it's wrong:** FLOOD_WAIT means "wait and retry" (success pending); USER_NOT_PARTICIPANT means "already done." Reporting them as failures misleads the admin into re-running destructive actions.
**Do this instead:** FLOOD_WAIT → retry after sleep; USER_NOT_PARTICIPANT → **skipped/already-gone**; reserve "failed" for genuine, terminal errors.

### Anti-Pattern 5: Non-resumable, in-memory-only job state
**What people do:** Hold the job list in memory; a crash/quit mid-run loses progress.
**Why it's wrong:** Bulk runs are long (back-off pauses); losing state forces a risky full re-run and breaks the per-group report.
**Do this instead:** Checkpoint each item to the AuditStore; offer resume on restart; the same store powers the final report.

### Anti-Pattern 6: Sidecar/IPC for the MTProto client without a forcing reason
**What people do:** Reach for Tauri + Rust `grammers`, or a Python/Telethon sidecar, by default.
**Why it's wrong here:** `grammers` is unaudited and rarely released (bad for a destructive, session-holding tool); a Telethon sidecar adds a second runtime, IPC marshalling per call, and macOS/Windows packaging + signing overhead. The bundle-size win doesn't pay for it for an occasional admin tool.
**Do this instead:** In-process GramJS in Electron main. Reserve the Tauri+Telethon-sidecar option as a deliberate fallback only if Rust/Tauri distribution is a hard requirement.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Telegram User API (MTProto) | Single persistent `TelegramClient` in main; TCP/TLS to Telegram DCs | Per-account rate limits → funnel all calls through one throttled client. Auth is per-connection. |
| OS keychain | macOS Keychain / Windows Credential Manager via native binding (or Electron `safeStorage` fallback) | Stores the session string. Renderer has no access. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Renderer (UI) ↔ Main (core) | **Electron IPC** — typed request/response for actions; main→renderer **event stream** for progress | The single trust + security boundary. DTOs in `shared/`. No GramJS object or secret ever crosses it. |
| Services ↔ SessionManager | Direct in-process call; injected shared client | One client, one back-off clock, one rate-limit surface. |
| Executor ↔ AuditStore | Direct in-process call; checkpoint per item | Enables resume + final report. |
| Executor ↔ UI | Event stream over IPC (`flood-wait`, `item-done`, `job-done`, …) | UI is a function of events; never polls Telegram. |

---

## Sources

- Telegram official error reference — 420/FLOOD_WAIT_X semantics and error categories: https://core.telegram.org/api/errors (HIGH)
- `contacts.resolveUsername` / `contacts.resolvePhone` (phone resolution limited by privacy/contacts): https://core.telegram.org/method/contacts.resolveUsername , https://core.telegram.org/method/contacts.resolvePhone (HIGH)
- GramJS — client, `StringSession` persistence, dialogs/participants, `channels.EditBanned` / `GetParticipant`: https://github.com/gram-js/gramjs , https://gram.js.org/ , https://painor.gitbook.io/gramjs/ (HIGH on existence/API shape)
- grammers (Rust MTProto) — maturity/unaudited caveat, rare releases: https://github.com/Lonami/grammers , https://gramme.rs/ (MEDIUM-HIGH)
- Telethon — `flood_sleep_threshold` auto-retry, `GetParticipant` single-user check, RPC error model (reference for the fallback sidecar option and error taxonomy): https://docs.telethon.dev/en/stable/concepts/errors.html , https://docs.telethon.dev/en/stable/modules/client.html (HIGH)
- Tauri vs Electron bundle/runtime trade-offs; Tauri+Python sidecar packaging; Tauri keyring/safeStorage options: https://www.gethopp.app/blog/tauri-vs-electron , https://github.com/charlesportwoodii/tauri-plugin-keyring (MEDIUM)
- tgkit error reference (USER_NOT_PARTICIPANT / CHAT_ADMIN_REQUIRED / USERNAME_NOT_OCCUPIED descriptions): https://tgkit.io/telegram-error-codes/ (MEDIUM)

---
*Architecture research for: cross-platform desktop MTProto bulk-removal tool (MrProper)*
*Researched: 2026-06-10*
