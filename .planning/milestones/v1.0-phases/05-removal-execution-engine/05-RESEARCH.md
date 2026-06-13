# Phase 5: Removal Execution Engine — Research

**Researched:** 2026-06-12
**Domain:** GramJS removal mechanics, job durability, IPC/store wiring, engine state machine
**Confidence:** HIGH (all blockers resolved against installed source)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Severity default:** Phase 5 test default is `'ban'`; engine + IPC accept `severity: 'kick' | 'ban'` parameter. No visible selector ships in Phase 5.
- **Ban semantics:** Permanent (untilDate=0). No timed-ban.
- **Ban on basic groups:** Fall back to kick with an explicit per-group annotation in progress + report ("Removed — rejoin can't be blocked in basic groups").
- **Durability:** Job state persisted as JSON in `app.getPath('userData')`, written after every group outcome — AuditStore. Resume/Discard offered on launch for incomplete jobs. No silent auto-resume.
- **PEER_FLOOD mid-job:** Hard-stop, checkpoint, surface warning. Job stays resumable.
- **No automatic per-group retry within a run.** Failed groups land in the report with a per-group retry affordance.
- **Pacing:** 2s base + 1–2s random jitter between group removals, on top of governor FLOOD_WAIT.
- **Execution order:** Checklist order (same as enumeration order).
- **Abort semantics:** Stop affordance — current call finishes, remaining groups marked `skipped`, checkpoint preserved.
- **No membership re-verification** before each removal. Treat `USER_NOT_PARTICIPANT` as `already-gone` (success).
- **Live progress:** per-group status on existing checklist rows + progress counter (same visual language as membership scan).
- **Report:** per-group outcome + summary counts (removed / already gone / failed / skipped) + timestamp, persisted in job file.
- **Minimal destructive-confirm dialog** in Phase 5 before engine runs (full wizard Phase 6).
- **TARGET_RESET mid-run:** refuse target change while a job is running ("Stop the removal first"). Main-process handler aborts-with-checkpoint defensively (belt-and-suspenders).
- **IPC/store/client patterns:** Follow searchChannels/searchStore patterns from Phase 4.1.
- **Error codes:** Extend `OperationErrorCode` with `RMV_*` members; non-retryable disposition per T-03-02 pattern.

### Claude's Discretion

- Exact job file schema, file naming, and rotation (e.g., one active job + archived reports).
- IPC channel names, store shape, component-level changes.
- Exact error-code mapping for removal failures.

### Deferred Ideas (OUT OF SCOPE)

- Visible Kick/Ban selector UI + severity persistence — Phase 6 wizard.
- Dry-run preview and full final review screen — Phase 6.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RMV-01 | User can choose per run between ban (block rejoin) and kick (removable, can rejoin) | Engine accepts `severity` param; `kick` implemented as restrict-then-unban (verified from `chats.js`); `ban` uses `viewMessages=true untilDate=0` |
| RMV-02 | App applies correct removal mechanic per group type (basic `deleteChatUser` vs supergroup/channel `editBanned`; kick = restrict-then-unban) | Mechanic dispatch verified against installed `telegram@2.26.22`; exact constructor signatures documented below |
| EXE-04 | App shows live progress during execution | Per-group status streaming follows `MembershipScanner`/`ParticipantSearcher` state-machine pattern; generation-guard + abort proven in existing code |
| EXE-05 | App shows per-group success/failure report after execution, with each group's failure isolated | Per-group isolation already proven in scan; job-file persistence enables audit trail and rehydration |

</phase_requirements>

---

## Summary

Phase 5 builds the durable, throttled, type-branching executor that removes the target from each selected group. All critical mechanics have been verified directly against the installed `telegram@2.26.22` source in `node_modules/telegram/client/chats.js` and `tl/api.d.ts` / `tl/apiTl.js`. The STATE.md MEDIUM-confidence blocker is now resolved at HIGH confidence.

**Kick mechanic (authoritative from `chats.js` lines 329–343):** For supergroup/channel, GramJS's own `kickParticipant` calls `channels.EditBanned` twice: (1) `bannedRights: { viewMessages: true, untilDate: 0 }` to restrict, then (2) `bannedRights: { untilDate: 0 }` (all-false/empty rights) to unban, with a 500ms sleep between. This is the official GramJS convention. The Phase 5 engine must mirror this exact two-call pattern for kick.

**Ban mechanic:** Single `channels.EditBanned` call with `bannedRights: { viewMessages: true, untilDate: 0 }` — permanent, no second call.

**Basic group:** `messages.DeleteChatUser({ chatId: BigInt, userId: InputUser, revokeHistory?: boolean })`. No ban semantics available; always fallback to kick regardless of severity for this type.

The engine shape follows `MembershipScanner`/`ParticipantSearcher` closely: constructor options inject client + governor + enumerator + resolver + onStateChange; generation token guards every async boundary; abort increments generation. Job durability uses the same `app.getPath('userData')` pattern as `secrets.ts`, with atomic write-rename.

**Primary recommendation:** Implement `RemovalExecutor` as a state-machine class mirroring `MembershipScanner`, dispatch removal via governor-routed `client.invoke()` directly (never via `client.kickParticipant()` which calls `getInputEntity` internally and can trigger auto-casts), write job file after every checkpoint, expose IPC channels following the `searchChannels` pattern.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Removal API calls (DeleteChatUser, EditBanned) | Main process | — | GramJS runs in Electron main; all Telegram calls must go through governor.run() |
| Pacing / FLOOD_WAIT / PEER_FLOOD handling | Main process (governor) | — | Governor is the single serialization point (EXE-01) |
| Job state persistence (AuditStore) | Main process | — | Uses `app.getPath('userData')` and `node:fs` — renderer has no fs access |
| Resume/Discard detection on launch | Main process | Renderer (dialog) | Main detects incomplete job; renderer shows ResumeJobDialog |
| Live progress emission | Main process (push) | Renderer (consume) | `win.webContents.send` push, mirrors scan:state pattern |
| Per-group error isolation | Main process (RemovalExecutor) | — | Continue loop on per-group failure, same pattern as MembershipScanner |
| Severity semantics dispatch | Main process | — | kick/ban branching on group type happens in executor, not renderer |
| Minimal confirm dialog | Renderer | — | RemovalConfirmDialog is a pure UI component |
| Run-trigger button + progress display | Renderer | — | GroupsPane/GroupRow additions; props flow from removalStore |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `telegram` (GramJS) | 2.26.22 (pinned) | `Api.messages.DeleteChatUser`, `Api.channels.EditBanned`, `Api.ChatBannedRights`, `Api.InputPeerUser`, `Api.InputChannel` | Already installed, authoritative MTProto user client |
| `electron` (safeStorage / app) | 42.x (installed) | `app.getPath('userData')` for job file location | Already in use for session persistence; same pattern |
| `node:fs` | Node built-in | Atomic job file write (write-temp-rename), read, delete | Used in secrets.ts; same pattern |
| `zod` | 4.x (installed) | IPC payload validation for removal channels | Established in all existing channel handlers |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `big-integer` | bundled with telegram | BigInt fields for chatId/channelId/accessHash/userId | All GramJS API constructors require `big-integer` instances for `long` fields |
| `node:crypto` | Node built-in | Job file nonce/versioning if needed | Only if job schema versioning requires a hash |

### No new npm packages required

`p-queue` is **not in `package.json`** and is **not needed**: the governor already serializes all calls via its tail-chain (`_tail`). The per-group 2s+jitter proactive pacing is implemented as `setTimeout` inside the executor loop between governor calls, the same pattern the governor uses for FLOOD_WAIT sleep. Adding `p-queue` would be redundant and create a second serialization layer conflicting with the governor's own. [VERIFIED: node_modules/telegram inspection + package.json inspection]

---

## Package Legitimacy Audit

No new npm packages are required in Phase 5. All dependencies (`telegram`, `electron`, `zod`, `big-integer`) are already installed and previously vetted. Registry vetting gate: not applicable.

| Package | Status |
|---------|--------|
| `telegram` | Already installed, pinned at 2.26.22 |
| `electron` | Already installed, devDependency |
| `zod` | Already installed |
| All others | Built-ins or already installed |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Renderer                    Main Process                   Telegram MTProto
─────────────               ─────────────                  ────────────────
[GroupsPane]                                               
  [run-trigger btn]──IPC:removal:start─→[RemovalChannels]
                                              │
                                         [RemovalExecutor]
                                              │ reads
                                         [resolver.getResolvedUser()]
                                         [enumerator.getState()]
                                              │
                                         for each checked dialog:
                                              │─ dispatch: group type?
                                              │
                                      ┌───── basic-group ──────────┐
                                      │  governor.run(             │
                                      │   DeleteChatUser{          │
                                      │    chatId, userId })       │
                                      └────────────────────────────┘
                                              │
                                      ┌───── supergroup/channel ───┐
                                      │  governor.run(             │
                                      │   EditBanned ban:          │
                                      │    {viewMessages,untilDate=0})
                                      │                            │
                                      │  [kick only: sleep 500ms,  │
                                      │   governor.run(EditBanned  │
                                      │    unban: {untilDate=0})]  │
                                      └────────────────────────────┘
                                              │
                                         checkpoint → AuditStore
                                         (write job file to userData)
                                              │
                                    IPC push: removal:state ──────→ [removalStore]
                                                                      [GroupRow status]
                                                                      [progress bar]
```

### Recommended Project Structure

```
src/
├── main/
│   ├── telegram/
│   │   └── RemovalExecutor.ts          # Engine class — mirrors MembershipScanner.ts
│   ├── storage/
│   │   └── auditStore.ts               # Job file read/write/atomic-rotate
│   └── ipc/
│       └── removalChannels.ts          # IPC handler registration + emitRemovalState()
├── shared/
│   ├── channels.ts                     # + REMOVAL_* constants
│   ├── opTypes.ts                      # + RMV_* OperationErrorCode members
│   └── removalTypes.ts                 # RemovalState, RemovalJobFile, RemovalOutcome DTOs
└── renderer/
    ├── removal/
    │   ├── RemovalConfirmDialog.tsx
    │   ├── ResumeJobDialog.tsx
    │   └── removalCopy.ts
    ├── ipc/
    │   └── removalClient.ts            # window.mrsproper.* bridge
    └── store/
        └── removalStore.ts             # useSyncExternalStore mirror
```

### Pattern 1: RemovalExecutor — State Machine (mirrors MembershipScanner)

**What:** An injectable-client class with generation-token abort, per-group isolation, governor-routed calls, and `onStateChange` push.

**When to use:** Always — this is the single executor entry point.

```typescript
// Source: verified against MembershipScanner.ts + chats.js lines 308–349
export class RemovalExecutor {
  private _generation = 0
  private _abortController: AbortController | null = null

  async execute(params: { severity: 'kick' | 'ban' }): Promise<void> {
    const gen = ++this._generation
    this._abortController = new AbortController()
    const signal = this._abortController.signal

    const resolved = this._resolver.getResolvedUser()
    if (!resolved) { this._emit({ step: 'error', ... }); return }

    const groupsState = this._enumerator.getState()
    if (groupsState.step !== 'loaded') { this._emit({ step: 'error', ... }); return }

    // Only process checked, actionable dialogs (passed in from IPC payload — list of dialogIds)
    for (const dialog of checkedDialogs) {
      if (gen !== this._generation || signal.aborted) return  // D-15 generation guard

      this._emit({ step: 'running', currentGroupId: dialog.id, ... })

      let outcome: RemovalOutcome
      try {
        outcome = await this._removeFromGroup(dialog, resolved, params.severity)
      } catch (err) {
        outcome = this._classifyRemovalError(err)
      }

      // Checkpoint BEFORE re-checking generation (crash safety)
      this._auditStore.checkpoint(dialog.id, outcome)

      if (gen !== this._generation || signal.aborted) return

      // Proactive pacing: 2s base + 1–2s jitter
      await new Promise<void>(r => setTimeout(r, 2000 + Math.random() * 1000))

      if (gen !== this._generation || signal.aborted) return

      this._emit({ step: 'running', ... })
    }
    this._emit({ step: 'complete', ... })
  }
}
```

### Pattern 2: Removal Mechanic Dispatch

**What:** Type-branch per `dialog.type`, then severity-branch.

```typescript
// Source: verified against node_modules/telegram/client/chats.js lines 308–349
// and tl/apiTl.js line 1601 (DeleteChatUser) + line 1868 (EditBanned)

private async _removeFromGroup(
  dialog: AdminDialogDTO,
  resolved: { id: bigint; accessHash: bigint },
  severity: 'kick' | 'ban'
): Promise<RemovalOutcome> {
  const entity = this._enumerator.getDialogEntity(dialog.id)

  // --- Basic group: messages.DeleteChatUser (no ban support) ---
  if (dialog.type === 'basic-group') {
    const chatEntity = entity as { id?: { toString(): string } } | null
    const chatId = chatEntity?.id
      ? bigInt(chatEntity.id.toString())
      : bigInt(dialog.id)

    // InputUser for basic groups — use the resolved user's actual bigInt
    const inputUser = new Api.InputPeerUser({
      userId: bigInt(resolved.id.toString()),
      accessHash: bigInt(resolved.accessHash.toString()),
    })

    await this._governor.run(() =>
      this._client.invoke(new Api.messages.DeleteChatUser({
        chatId,
        userId: inputUser,
        // revokeHistory: false (default) — do NOT revoke; see Pitfall 4
      }))
    )
    // Basic groups never support ban — always annotate if severity was 'ban'
    return { status: 'done', note: severity === 'ban' ? 'basic-group-ban-fallback' : null }
  }

  // --- Supergroup / broadcast-channel: channels.EditBanned ---
  if (dialog.type === 'supergroup' || dialog.type === 'broadcast-channel') {
    const channelEntity = entity as {
      id?: { toString(): string }
      accessHash?: { toString(): string }
    } | null
    const channelId = bigInt(channelEntity?.id?.toString() ?? dialog.id)
    const accessHash = channelEntity?.accessHash
      ? bigInt(channelEntity.accessHash.toString())
      : bigInt.zero

    const inputChannel = new Api.InputChannel({ channelId, accessHash })
    const inputUser = new Api.InputPeerUser({
      userId: bigInt(resolved.id.toString()),
      accessHash: bigInt(resolved.accessHash.toString()),
    })

    if (severity === 'ban') {
      // Single call — permanent ban
      await this._governor.run(() =>
        this._client.invoke(new Api.channels.EditBanned({
          channel: inputChannel,
          participant: inputUser,
          bannedRights: new Api.ChatBannedRights({
            viewMessages: true,
            untilDate: 0,  // permanent
          }),
        }))
      )
      return { status: 'done', note: null }

    } else {
      // Kick = restrict-then-unban (VERIFIED from chats.js lines 329–343)
      // Step 1: restrict (viewMessages=true, untilDate=0)
      await this._governor.run(() =>
        this._client.invoke(new Api.channels.EditBanned({
          channel: inputChannel,
          participant: inputUser,
          bannedRights: new Api.ChatBannedRights({
            viewMessages: true,
            untilDate: 0,
          }),
        }))
      )
      // Step 2: unban (empty/all-false rights, untilDate=0)
      // GramJS chats.js uses sleep(500) between the two calls — mirror this
      await new Promise<void>(r => setTimeout(r, 500))
      await this._governor.run(() =>
        this._client.invoke(new Api.channels.EditBanned({
          channel: inputChannel,
          participant: inputUser,
          bannedRights: new Api.ChatBannedRights({ untilDate: 0 }),
        }))
      )
      return { status: 'done', note: null }
    }
  }

  throw new Error(`Unknown dialog type: ${dialog.type}`)
}
```

### Pattern 3: AuditStore — Atomic Job File

**What:** Write-temp-rename for crash safety; one active job file per session; schema-versioned.

```typescript
// Source: pattern from secrets.ts (same userData path pattern)
const JOB_FILE = 'removal-job.json'
const JOB_FILE_TMP = 'removal-job.json.tmp'

function writeJobFile(job: RemovalJobFile): void {
  const dir = app.getPath('userData')
  const tmpPath = join(dir, JOB_FILE_TMP)
  const finalPath = join(dir, JOB_FILE)
  fs.writeFileSync(tmpPath, JSON.stringify(job, null, 2), { mode: 0o600 })
  fs.renameSync(tmpPath, finalPath)  // atomic on POSIX; near-atomic on Windows
}
```

### Pattern 4: Per-Group Error Classification

```typescript
// Extend classifyRpcError pattern — RMV_* codes, all 'fail' disposition (T-03-02)
function classifyRemovalError(err: unknown): RemovalOutcome {
  const msg: string = (err as { errorMessage?: string })?.errorMessage ?? ''
  if (msg === 'USER_NOT_PARTICIPANT') return { status: 'already-gone' }
  if (msg === 'USER_ADMIN_INVALID')   return { status: 'failed', code: 'RMV_TARGET_IS_ADMIN' }
  if (msg === 'CHAT_ADMIN_REQUIRED')  return { status: 'failed', code: 'RMV_NO_RIGHTS' }
  if (msg === 'USER_ID_INVALID')      return { status: 'failed', code: 'RMV_USER_INVALID' }
  if (msg === 'CHANNEL_PRIVATE')      return { status: 'failed', code: 'RMV_CHANNEL_PRIVATE' }
  if (!msg)                           return { status: 'failed', code: 'NETWORK' }
  return { status: 'failed', code: 'UNKNOWN' }
  // Note: PEER_FLOOD is classified by governor as hard-stop BEFORE reaching this function
}
```

### Anti-Patterns to Avoid

- **Using `client.kickParticipant(entity, participant)` from GramJS high-level API:** This calls `getInputEntity()` internally which may trigger AUTO_CASTS and fail with `CastError` when the entity is not in GramJS's internal entity cache — the same defect already documented in GroupEnumerator and MembershipScanner. Always use `client.invoke(new Api.channels.EditBanned(...))` directly with explicit InputChannel/InputPeerUser constructed from the stored entity's id+accessHash.
- **Passing `bigInt.zero` as accessHash for the removal target:** The accessHash from `resolver.getResolvedUser()` is authoritative. `bigInt.zero` causes `CastError` on `InputPeerUser` resolution (documented STATE.md lesson from Phase 4).
- **Constructing InputUser for `DeleteChatUser.userId` from the string dialog.id:** `userId` in `DeleteChatUser` expects the TARGET's InputUser, not the chat's id. Always build it from `resolved.id + resolved.accessHash`.
- **Setting `revokeHistory: true` in `DeleteChatUser`:** Side-effect deletes the target's message history for ALL members in the basic group. Set to `false` (or omit; default is false per the `flags.0?true` schema).
- **Calling `EditBanned` on a user who is the group creator:** Returns `USER_ADMIN_INVALID`. The GroupEnumerator's `canAct` flag should already exclude these groups from the checklist, but the executor must handle the error gracefully as a per-group failure.
- **Running both EditBanned calls in a single governor.run():** The governor serializes at the call level. Two `await governor.run(...)` in sequence is correct; wrapping both in one `fn` would remove the 500ms sleep from governor visibility.
- **Forgetting the pacing sleep during the kick two-call sequence:** The 500ms between restrict and unban is within a single group's processing; the 2s+jitter inter-group pacing comes AFTER the group completes (after both calls).

---

## Removal Mechanics — Blocker Resolution

This section resolves the STATE.md MEDIUM-confidence blocker at HIGH confidence.

### Source of Truth

All findings verified against:
- `/Users/igraczech/Repositories/MrProper/node_modules/telegram/client/chats.js` lines 308–349 [VERIFIED: local node_modules]
- `/Users/igraczech/Repositories/MrProper/node_modules/telegram/tl/apiTl.js` lines 1601, 1868, 956 [VERIFIED: local node_modules]
- `/Users/igraczech/Repositories/MrProper/node_modules/telegram/tl/api.d.ts` lines 11423–11465, 23547–23562, 27302–27315 [VERIFIED: local node_modules]

### `messages.DeleteChatUser` — Basic Groups

**TL schema:** `messages.deleteChatUser#a2185cab flags:# revoke_history:flags.0?true chat_id:long user_id:InputUser = Updates;`

**TypeScript constructor (from `api.d.ts` line 23547):**
```typescript
new Api.messages.DeleteChatUser({
  chatId: bigint,       // required — the chat's numeric ID as big-integer
  userId: TypeEntityLike, // required — InputPeerUser or InputUser for the target
  revokeHistory?: boolean // optional flag — OMIT (false by default); true deletes their messages
})
```

**Confidence:** HIGH — verified from installed source.

**Notes:**
- `userId` is typed as `TypeEntityLike` in the d.ts, which includes `InputPeerUser`. Use `new Api.InputPeerUser({ userId, accessHash })` built from `resolver.getResolvedUser()`.
- `revokeHistory` MUST be omitted or `false`. Setting `true` deletes the target's messages from the chat for everyone — a destructive side-effect the user did not confirm.
- Basic groups do NOT support ban semantics (no `ChatBannedRights` support). Always perform a kick (the delete) regardless of the `severity` parameter, and annotate the outcome with `'basic-group-ban-fallback'` when severity was `'ban'`.

### `channels.EditBanned` — Supergroups and Channels

**TL schema:** `channels.editBanned#96e6cd81 channel:InputChannel participant:InputPeer banned_rights:ChatBannedRights = Updates;`

**TypeScript constructor (from `api.d.ts` line 27302):**
```typescript
new Api.channels.EditBanned({
  channel: TypeEntityLike,          // required — InputChannel built from entity id+accessHash
  participant: TypeEntityLike,      // required — InputPeerUser for target
  bannedRights: TypeChatBannedRights, // required — Api.ChatBannedRights instance
})
```

**`ChatBannedRights` constructor (from `api.d.ts` line 11423):**
```typescript
new Api.ChatBannedRights({
  viewMessages?: boolean,   // true = banned (cannot read/write)
  sendMessages?: boolean,
  sendMedia?: boolean,
  // ... (full list in api.d.ts 11423–11465)
  untilDate: int,           // required — 0 = permanent; Unix timestamp = expires then
})
```

**Confidence:** HIGH — verified from installed source.

### Kick Mechanic — RESOLVED (HIGH confidence)

**Source:** `node_modules/telegram/client/chats.js` lines 329–343 — GramJS's own `kickParticipant` implementation for `CHANNEL` type entities:

```javascript
// Step 1: restrict (viewMessages=true → cannot see/send)
request = new tl_1.Api.channels.EditBanned({
  channel: peer,
  participant: user,
  bannedRights: new tl_1.Api.ChatBannedRights({
    untilDate: 0,
    viewMessages: true,
  }),
})
resp = await client.invoke(request)
await sleep(500)  // 500ms between calls

// Step 2: unban (all-false rights — user can rejoin)
await client.invoke(new tl_1.Api.channels.EditBanned({
  channel: peer,
  participant: user,
  bannedRights: new tl_1.Api.ChatBannedRights({ untilDate: 0 }),
}))
```

This is the `restrict-then-unban` pattern. The "unban" step uses `ChatBannedRights({ untilDate: 0 })` with ALL permission flags omitted (undefined/false) — this sets empty banned rights, which Telegram interprets as "no restrictions" (user can rejoin). The 500ms sleep is GramJS's own pacing between the two calls.

The Phase 5 executor mirrors this EXACTLY using two `governor.run()` calls with a `setTimeout(500)` between them (the pacing sleep is inside the single-group processing block, before the inter-group 2s+jitter pacing).

### Ban Mechanic

Single call: `EditBanned` with `{ viewMessages: true, untilDate: 0 }`. No second call. User is permanently banned from the channel/supergroup and cannot rejoin without the admin unbanning them.

### Broadcast-Channel Notes

`GroupEnumerator` sets `canAct: false` and `greyReason: 'broadcast-channel'` for all broadcast channels — they cannot appear in the checked removal set. The executor will never receive a broadcast-channel dialog. If one somehow appears (defensive), treat as an error outcome `RMV_CHANNEL_PRIVATE` and continue.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serialized execution queue | Custom promise chain | Existing `governor._tail` (via `governor.run()`) | Governor already enforces concurrency=1 globally |
| FLOOD_WAIT sleep + retry | Custom retry loop | `governor.run()` handles FLOOD_WAIT automatically | D-11 (floodSleepThreshold=0) makes all FLOOD_WAITs visible to governor |
| PEER_FLOOD detection | `err.errorMessage === 'PEER_FLOOD'` inline checks | `classifyRpcError()` + governor emits `hard-stop` GovernorEvent | Existing classifier already handles this; governor emits `hard-stop` before rethrowing |
| Atomic file write | `writeFileSync` direct | Write-to-temp + `renameSync` (pattern from secrets.ts) | Direct write is not crash-safe; rename is near-atomic |
| Entity resolution for removal | `client.getInputEntity()` / `client.kickParticipant()` | Direct `client.invoke()` with explicit InputChannel/InputPeerUser | GramJS high-level methods trigger AUTO_CASTS via `getInputEntity()`; entity cache may miss; causes `CastError` (Phase 4 lesson) |

---

## Runtime State Inventory

> Skip condition: greenfield executor. No rename/migration/refactor in scope for Phase 5.

Not applicable — Phase 5 is a new feature addition, not a rename or refactor. No runtime state needs migration.

---

## Common Pitfalls

### Pitfall 1: Using `client.kickParticipant()` instead of `client.invoke()`
**What goes wrong:** `kickParticipant()` calls `client.getInputEntity()` internally, which queries GramJS's entity cache. If the entity is not cached (common for peers not in recent dialogs), it triggers a network request outside the governor — bypassing rate limiting. It also triggers `AUTO_CASTS` which can produce `CastError` when the peer type doesn't match expectations.
**Why it happens:** Attractive high-level API, but it has hidden dependencies.
**How to avoid:** Always `client.invoke(new Api.channels.EditBanned(...))` directly with explicit types built from `enumerator.getDialogEntity()` id+accessHash.
**Warning signs:** `CastError: Found wrong type for channel` in the main process log.

### Pitfall 2: Wrong accessHash on InputPeerUser for the removal target
**What goes wrong:** `CastError` or silent wrong-entity removal if `bigInt.zero` is passed as accessHash.
**Why it happens:** Training data examples sometimes show `new Api.InputPeerUser({ userId, accessHash: bigInt.zero })`.
**How to avoid:** Always use `resolver.getResolvedUser()` which provides the real accessHash from Phase 3 resolution. This is the T-03-01 pattern — resolver owns the accessHash.
**Warning signs:** `CastError: Found wrong type for InputPeer` in main process.

### Pitfall 3: Setting `revokeHistory: true` in `DeleteChatUser`
**What goes wrong:** Deletes the target's messages from the basic group for ALL members — a destructive side-effect not confirmed by the user.
**Why it happens:** The parameter is exposed in the constructor; an implementer might think it's a good cleanup step.
**How to avoid:** Always omit `revokeHistory` (defaults to `false`). The phase scope is "remove person from groups", not "erase their history".
**Warning signs:** Users report unexpected message deletion in basic groups.

### Pitfall 4: Single-call kick (no unban step)
**What goes wrong:** Kick works (user is removed), but the user is immediately re-banned (cannot rejoin) because `viewMessages: true` is still in effect. This makes "kick" semantically identical to "ban" — user cannot rejoin.
**Why it happens:** The two-call pattern is non-obvious; a developer sees one `EditBanned` call and stops there.
**How to avoid:** Mirror exactly the pattern in `chats.js` lines 329–343: restrict call + 500ms sleep + unban call.
**Warning signs:** Users report that kicked members cannot rejoin the group.

### Pitfall 5: Calling `EditBanned` on a group creator or yourself
**What goes wrong:** Returns `USER_ADMIN_INVALID` (for trying to ban/kick the group creator or a higher-rank admin) or silently fails/raises a different error.
**Why it happens:** GroupEnumerator's `canAct` flag filters groups where the ADMIN has rights, but does not filter groups where the TARGET is the creator.
**How to avoid:** Classify `USER_ADMIN_INVALID` as `{ status: 'failed', code: 'RMV_TARGET_IS_ADMIN' }` per-group and continue; surface "They're an admin here" in the row failure copy.
**Warning signs:** Per-group failure with `USER_ADMIN_INVALID` errorMessage.

### Pitfall 6: PEER_FLOOD mid-loop not terminating the run
**What goes wrong:** The executor catches the error per-group and continues, running more API calls on a flagged account — potentially worsening the restriction.
**Why it happens:** The per-group `try/catch` looks similar for all errors.
**How to avoid:** The governor emits a `hard-stop` GovernorEvent before rethrowing PEER_FLOOD. The executor must subscribe to governor events (or classify the rethrown error) and abort immediately on `hard-stop`. The governor re-throws the original error after emitting the event, so a `classifyRpcError(err).disposition === 'hard-stop'` check in the executor's outer catch will catch it.
**Warning signs:** Multiple failed groups all showing PEER_FLOOD.

### Pitfall 7: Race between abort and job checkpoint
**What goes wrong:** If `abortExecution()` increments the generation while a `governor.run()` await is in progress, the checkpoint write after the `await` may write to a discarded job's file.
**Why it happens:** Async gap between the API call and the checkpoint write.
**How to avoid:** The generation check MUST happen AFTER the `governor.run()` await AND before the checkpoint write. The job file checkpoint should only run when `gen === this._generation`. If the generation has changed (abort fired during await), skip the checkpoint and return.
**Warning signs:** Discarded job file gets partial update from an aborted run.

### Pitfall 8: Migrated basic groups (`migrated_to`)
**What goes wrong:** A basic group that has been migrated to a supergroup has a `migrated_to` pointer in its `Api.Chat` entity. Calling `DeleteChatUser` on it will fail or operate on the wrong entity.
**Why it happens:** GroupEnumerator uses `getDialogs({ ignoreMigrated: true })` — this should already filter these out. But if one slips through, the executor needs to handle it.
**How to avoid:** GroupEnumerator already passes `ignoreMigrated: true` to `getDialogs()` (verified in `GroupEnumerator.ts` line 88). This is belt-and-suspenders: if a `basic-group` dialog arrives with `migrated_to` set on its entity, classify the removal as `failed` with `RMV_CHANNEL_PRIVATE` or `UNKNOWN` and continue.
**Warning signs:** `CHAT_INVALID` or unexpected RPC error on basic group removal.

### Pitfall 9: Two `governor.run()` calls within a single group's kick processing count as two serialized ops
**What goes wrong:** Pacing arithmetic error — if the developer adds the inter-group 2s+jitter sleep before both calls for a kick, the second restrict/unban call gets an extra 2s delay that was not intended.
**How to avoid:** The 500ms between restrict and unban is WITHIN the group processing. The 2s+jitter inter-group pacing fires ONCE, after both calls for a kick are complete (i.e., after the group outcome is checkpointed). Structure: `[restrict call] → [500ms] → [unban call] → [checkpoint] → [2s+jitter] → [next group]`.

---

## IPC Architecture for Phase 5

### Channel Constants (add to `shared/channels.ts`)

```typescript
export const REMOVAL_START   = 'removal:start'    // { severity, dialogIds }
export const REMOVAL_ABORT   = 'removal:abort'
export const REMOVAL_RETRY_GROUP = 'removal:retryGroup'  // { dialogId }
export const REMOVAL_GET_STATE   = 'removal:getState'
export const REMOVAL_STATE       = 'removal:state'  // push: main → renderer
export const REMOVAL_GET_JOB     = 'removal:getJob' // on-launch job file check
export const REMOVAL_DISCARD_JOB = 'removal:discardJob'
```

### Zod Schemas for IPC Validation

```typescript
const RemovalStartSchema = z.object({
  severity: z.enum(['kick', 'ban']),
  dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500),
})

const RemovalRetryGroupSchema = z.object({
  dialogId: z.string().min(1).max(30),
})
```

### Security Gates

- `removal:start` requires `authState.step === 'authorized'` (same as scan:start in groupChannels.ts line pattern). Renderer cannot inject accessHash — executor reads from `resolver.getResolvedUser()`.
- `removal:retryGroup` validates dialogId against the current job's known dialogIds to prevent re-running a removal for a group not in the original job.
- `TARGET_RESET` must call `executor.abortExecution()` first (CR-01 ordering), then proceed with scan/resolver reset. If a job is running, abort-with-checkpoint rather than silent wipe.

### Store Shape (`shared/removalTypes.ts`)

```typescript
export type RemovalRunStep =
  | 'idle'
  | 'confirming'     // dialog open, not yet dispatched
  | 'running'
  | 'stopping'       // abort requested, current call in flight
  | 'stopped'        // user aborted, resumable
  | 'complete'
  | 'hard-stopped'   // PEER_FLOOD, resumable

export interface RemovalGroupOutcome {
  dialogId: string
  status: 'done' | 'already-gone' | 'failed' | 'skipped'
  errorCode?: RmvErrorCode  // only when status='failed'
  note?: 'basic-group-ban-fallback' | null
  timestamp: string
}

export interface RemovalState {
  step: RemovalRunStep
  severity: 'kick' | 'ban'
  targetId: string
  targetName: string
  progress: { processed: number; total: number }
  outcomes: RemovalGroupOutcome[]  // accumulated as the run progresses
  summary?: RemovalSummary         // only when step='complete'|'stopped'|'hard-stopped'
  currentGroupId?: string          // the group currently being processed
}

export interface RemovalJobFile {
  schemaVersion: 1
  jobId: string                    // uuid or timestamp-based nonce
  severity: 'kick' | 'ban'
  targetId: string
  targetName: string
  targetAccessHash: string         // stored for resume — still needs accessHash for invoke()
  dialogIds: string[]              // full ordered list for resume
  outcomes: RemovalGroupOutcome[]  // checkpointed after each group
  startedAt: string
  completedAt?: string
  status: 'running' | 'complete' | 'stopped' | 'hard-stopped'
}
```

### Resume Flow

On launch, `main/index.ts` (after app.whenReady) reads the job file before calling `sm.initialize()`. If found and `status !== 'complete'`:
1. Construct `RemovalExecutor` with job-file data
2. Emit `RemovalState` with step `stopped` or `hard-stopped` + existing outcomes
3. Renderer detects non-complete step on first `removal:getState` response → shows `ResumeJobDialog`
4. User clicks Resume → `removal:start` with the remaining (unprocessed) dialogIds
5. User clicks Discard → `removal:discardJob` → job file deleted, `RemovalState` resets to `idle`

---

## Job File Schema

```typescript
// File: userData/removal-job.json
// Written atomically via write-to-temp + rename
// Schema version 1 (increment if shape changes)
{
  "schemaVersion": 1,
  "jobId": "2026-06-12T14:32:00.000Z",      // ISO timestamp used as nonce
  "severity": "ban",
  "targetId": "123456789",
  "targetName": "Anna Nováková",
  "targetAccessHash": "9876543210",           // needed for resume (resolver may not be live)
  "dialogIds": ["111", "222", "333"],         // full ordered list (checklist order)
  "outcomes": [
    { "dialogId": "111", "status": "done",      "timestamp": "2026-06-12T14:32:01.000Z" },
    { "dialogId": "222", "status": "already-gone", "timestamp": "2026-06-12T14:32:03.000Z" }
  ],
  "startedAt": "2026-06-12T14:32:00.000Z",
  "status": "running"                         // 'running' = incomplete = prompt Resume/Discard
}
```

**Rotation:** When a new job starts, the existing job file (if `status === 'complete'`) is overwritten. Incomplete job files are retained until Discard or completion. There is no archive in v1 (v2 AUD-01 requirement).

---

## RMV_* Error Code Extensions

Add to `src/shared/opTypes.ts` `OperationErrorCode` union, all with disposition `'fail'` (T-03-02 pattern — non-retryable, continue job):

```typescript
// Phase 5 additions — per-group removal failure codes
| 'RMV_TARGET_IS_ADMIN'    // USER_ADMIN_INVALID — target is admin, must demote first
| 'RMV_NO_RIGHTS'          // CHAT_ADMIN_REQUIRED — admin lost rights since scan
| 'RMV_USER_INVALID'       // USER_ID_INVALID — user no longer resolvable
| 'RMV_CHANNEL_PRIVATE'    // CHANNEL_PRIVATE — channel inaccessible
```

`USER_NOT_PARTICIPANT` is NOT a `RMV_*` code — it maps directly to the `already-gone` outcome (not a failure) and is handled in the executor before `classifyRpcError()`.

`PEER_FLOOD` is already classified as `hard-stop` in `classifyRpcError()` — no new code needed; governor emits the event and rethrows.

---

## Environment Availability

> This phase is purely main-process code + renderer additions. No new external CLIs or services.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node:fs` | AuditStore job file | ✓ | Node 20 built-in | — |
| `node:path` | Job file path | ✓ | Node 20 built-in | — |
| `telegram` (GramJS) | RemovalExecutor API calls | ✓ | 2.26.22 (pinned) | — |
| `electron.app.getPath('userData')` | Job file location | ✓ | Electron 42.x installed | — |
| `vitest` | Tests | ✓ | 4.x installed | — |

**Missing dependencies with no fallback:** none.

---

## Validation Architecture

> `workflow.nyquist_validation` is not explicitly `false` in config.json — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` (inherited from electron-vite) |
| Quick run command | `vitest run --reporter=verbose src/main/telegram/removalExecutor.test.ts` |
| Full suite command | `vitest run` |

### Mock Client Extensions Required (Wave 0)

The existing `createMockTelegramClient` in `__mocks__/telegramClient.ts` must be extended with:

```typescript
// Add to MockClientConfig:
// Phase 5: removal mock controls
removeSuccessDialogIds?: string[]         // EditBanned/DeleteChatUser succeeds silently
removeAlreadyGoneDialogIds?: string[]     // returns USER_NOT_PARTICIPANT
removeErrorDialogIds?: Record<string, string>  // dialogId → errorMessage

// In invoke() dispatch:
if (ctorName === 'EditBanned' || className === 'channels.EditBanned') {
  const channelId = (request as { channel?: { channelId?: { toString(): string } } })
    .channel?.channelId?.toString() ?? ''
  if (config.removeAlreadyGoneDialogIds?.includes(channelId)) {
    throw Object.assign(new Error('USER_NOT_PARTICIPANT'), { errorMessage: 'USER_NOT_PARTICIPANT' })
  }
  if (config.removeErrorDialogIds?.[channelId]) {
    throw Object.assign(new Error(config.removeErrorDialogIds[channelId]!),
      { errorMessage: config.removeErrorDialogIds[channelId]! })
  }
  return {}  // success
}

if (ctorName === 'DeleteChatUser' || className === 'messages.DeleteChatUser') {
  const chatId = (request as { chatId?: { toString(): string } }).chatId?.toString() ?? ''
  if (config.removeAlreadyGoneDialogIds?.includes(chatId)) {
    throw Object.assign(new Error('USER_NOT_PARTICIPANT'), { errorMessage: 'USER_NOT_PARTICIPANT' })
  }
  if (config.removeErrorDialogIds?.[chatId]) {
    throw Object.assign(new Error(config.removeErrorDialogIds[chatId]!),
      { errorMessage: config.removeErrorDialogIds[chatId]! })
  }
  return {}  // success
}
```

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RMV-01 | `severity='ban'` triggers `EditBanned(viewMessages=true)` | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| RMV-01 | `severity='kick'` triggers restrict-then-unban two-call sequence | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| RMV-02 | Basic group uses `DeleteChatUser` regardless of severity | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| RMV-02 | Supergroup uses `EditBanned` for both ban and kick | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| RMV-02 | `USER_NOT_PARTICIPANT` treated as `already-gone` (success) | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| EXE-04 | Per-group `onStateChange` fired with `removing` before and outcome after each group | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| EXE-05 | Per-group failure isolated: one `USER_ADMIN_INVALID` does not abort remaining groups | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| EXE-05 | Job file checkpointed after each group; simulate crash → resume from first unprocessed | unit | `vitest run ... auditStore.test.ts` | ❌ Wave 0 |
| EXE-03 (ext) | PEER_FLOOD mid-run causes hard-stop; unprocessed groups NOT marked skipped | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| CONTEXT | Abort mid-run: current group completes, remaining marked `skipped` | unit (deferred race test) | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| CONTEXT | Generation guard: stale retry result from discarded job never renders | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |
| CONTEXT | IPC `removal:start` validates payload with Zod, security-gates on auth state | unit | `vitest run ... removalChannels.test.ts` | ❌ Wave 0 |
| CONTEXT | Ban on basic group annotates outcome with `basic-group-ban-fallback` | unit | `vitest run ... removalExecutor.test.ts` | ❌ Wave 0 |

### Key Test Patterns (from existing test suite)

**Deferred-promise race tests (abort):** See `membershipScanner.test.ts` for the established pattern — create a deferred promise that blocks the mock's `invoke()`, call `execute()` (don't await), call `abortExecution()`, then resolve the promise and verify remaining groups are skipped.

**Job persistence test:** `auditStore.test.ts` — write a partial job with 2 of 3 groups checkpointed, read it back, verify the resume-from index points to the 3rd group.

**PEER_FLOOD mid-run:** Configure mock to throw `PEER_FLOOD` on the 2nd group of 3. Execute. Verify: group 1 = done, group 2 = N/A (hard-stop emitted), group 3 = queued (not skipped). Verify `hard-stop` GovernorEvent was emitted.

### Sampling Rate

- **Per task commit:** `vitest run --reporter=verbose src/main/telegram/removalExecutor.test.ts src/main/storage/auditStore.test.ts src/main/ipc/removalChannels.test.ts`
- **Per wave merge:** `vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/main/telegram/removalExecutor.test.ts` — RED stubs for RMV-01, RMV-02, EXE-04, EXE-05, abort, PEER_FLOOD, generation guard
- [ ] `src/main/storage/auditStore.test.ts` — job file write/read/atomic-rotate/resume tests
- [ ] `src/main/ipc/removalChannels.test.ts` — Zod validation, auth gate, security gate for retryGroup
- [ ] Extend `src/main/telegram/__mocks__/telegramClient.ts` with `removeSuccessDialogIds`, `removeAlreadyGoneDialogIds`, `removeErrorDialogIds` mock controls

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `authState.step === 'authorized'` security gate in `removal:start` IPC handler |
| V3 Session Management | no | Session already managed by SessionManager |
| V4 Access Control | yes | `dialogIds` in `removal:start` payload validated to be subset of known enumerator dialogs |
| V5 Input Validation | yes | Zod `RemovalStartSchema` validates severity enum + dialogIds array bounds |
| V6 Cryptography | no | Job file stores no secrets; only target name + ID (non-sensitive metadata) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer injects fake `dialogIds` for groups not in checklist | Tampering | Validate `dialogIds` against `enumerator.getState().dialogs` map in IPC handler before starting executor |
| Renderer injects fake `targetId` via `removal:start` | Tampering | Executor reads target from `resolver.getResolvedUser()` only — IPC carries NO targetId |
| Renderer injects `severity: 'nuke'` (invalid enum) | Tampering | Zod `z.enum(['kick','ban'])` rejects at IPC boundary |
| Race: `TARGET_RESET` fires while removal is running | Tampering/DoS | CR-01: abort executor first; executor defensively aborts-with-checkpoint |
| Job file read from disk with corrupted/injected content | Tampering | Schema validation on read via Zod before using job data |
| `revokeHistory: true` injected by renderer | Tampering | `revokeHistory` is executor-controlled, never renderer-supplied |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `untilDate = now + 60s` for kick | restrict-then-unban (two EditBanned calls) | GramJS `kickParticipant` (v2.x established) | Proper kick semantics — user can rejoin; not a timed ban |
| `client.kickParticipant()` high-level API | `client.invoke(new Api.channels.EditBanned(...))` directly | Phase 4 CastError lesson | Avoids AUTO_CASTS / entity cache misses |
| `p-queue` for sequencing | Governor tail-chain | Phase 2 (governor design) | Single serialization point; no second queue needed |

---

## Open Questions

> All open questions resolved with dispositions — no unresolved questions remain.

### OQ-1: kick = restrict-then-unban vs untilDate~=now+60s — RESOLVED

**Resolution:** The `restrict-then-unban` two-call pattern is confirmed at HIGH confidence from `node_modules/telegram/client/chats.js` lines 329–343. The `untilDate=now+60s` approach is NOT what GramJS uses — it would create a 60-second timed ban (user cannot rejoin for 60 seconds), not a proper kick. The Phase 5 engine must use the two-call pattern exactly as GramJS implements it.

### OQ-2: Should the inter-group 2s pacing sleep go through `governor.run()`? — RESOLVED

**Resolution:** No. The pacing sleep is a proactive delay between API calls, not an API call itself. It uses `setTimeout` directly (same pattern as the governor's own FLOOD_WAIT sleep in `governor.ts` line 180). Wrapping a `setTimeout` in `governor.run()` would serialize it unnecessarily.

### OQ-3: Should `broadcast-channel` dialogs be silently skipped or fail? — RESOLVED

**Resolution:** `GroupEnumerator` already marks all broadcast channels as `canAct: false` — they never appear in the checked removal set. If a broadcast-channel dialog somehow reaches the executor, treat as `{ status: 'failed', code: 'RMV_CHANNEL_PRIVATE' }` and continue. No special casing needed in the happy path.

### OQ-4: Should the job file store `targetAccessHash`? — RESOLVED

**Resolution:** Yes. On resume after a crash, `resolver.getResolvedUser()` may return `null` (the session was restored but no target was re-resolved). The job file needs enough data to reconstruct the `InputPeerUser` for the remaining groups. Store `targetAccessHash` as a string in the job file. Since the job file is in `userData` with mode 0o600, this is acceptable (same risk profile as the session file's path-disclosure; the actual accessHash is not a session credential).

### OQ-5: Does `DeleteChatUser` need `revokeHistory`? — RESOLVED

**Resolution:** Always omit (default false). `revokeHistory: true` deletes the target's messages from the chat for all members — a destructive side-effect outside the confirmed scope.

---

## Assumptions Log

> All claims in this research were verified from installed source or the codebase directly. No user confirmation needed.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `fs.renameSync` is near-atomic on Windows | AuditStore pattern | Job file corruption on crash mid-rename on Windows (very short window; acceptable for v1) |
| A2 | `ChatBannedRights({ untilDate: 0 })` with all flags omitted produces "no restrictions" (unban) | Removal mechanic | Kick would silently fail to unban; user cannot rejoin |

**A2 verification note:** The TL schema confirms `chatBannedRights#9f120418 flags:#` — every permission field is `flags.N?true`, meaning omitting them produces flag bits = 0, which means "not restricted". `untilDate=0` means "permanent" for this restriction object, but with no restriction bits set, Telegram interprets it as a complete unban. This matches what `chats.js` line 339–343 does (`new Api.ChatBannedRights({ untilDate: 0 })`). Confidence: HIGH.

---

## Sources

### Primary (HIGH confidence)

- `node_modules/telegram/client/chats.js` lines 308–349 — kick mechanic, ban mechanic (authoritative GramJS implementation, installed from npm `telegram@2.26.22`)
- `node_modules/telegram/tl/apiTl.js` lines 956, 1601, 1868 — TL schema definitions for `ChatBannedRights`, `messages.DeleteChatUser`, `channels.EditBanned`
- `node_modules/telegram/tl/api.d.ts` lines 11423–11465, 23547–23562, 27302–27315 — TypeScript constructor signatures
- `src/main/telegram/MembershipScanner.ts` — state-machine/generation-guard/abort/emission pattern
- `src/main/telegram/governor.ts` — governor.run() serialization + FLOOD_WAIT + PEER_FLOOD
- `src/main/telegram/operationErrors.ts` — classifyRpcError() pattern for RMV_* extension
- `src/main/telegram/GroupEnumerator.ts` — entity map, getDialogEntity(), InputChannel construction pattern
- `src/main/storage/secrets.ts` — userData file write pattern (mode 0o600, lazy electron require)
- `src/main/index.ts` — service wiring, window lifecycle, guard pattern
- `src/main/ipc/searchChannels.ts` — IPC channel pattern (Zod validation, security gates, emit helper)
- `src/renderer/store/groupsStore.ts` — useSyncExternalStore pattern, checkedDialogIds, _prevScanStep
- `src/renderer/ipc/searchClient.ts` — renderer IPC client pattern
- `src/shared/channels.ts` — established channel namespace
- `src/shared/opTypes.ts` — Disposition, OperationErrorCode, ClassifiedOperationError shapes
- `package.json` — confirms `p-queue` is NOT a dependency; confirmed `telegram@2.26.22`, `electron@42.x`, `zod@4.x`, `vitest@4.x`

### Secondary (MEDIUM confidence — web, not consulted for primary decisions)

None consulted — all primary decisions resolved from installed source.

---

## Metadata

**Confidence breakdown:**
- Removal mechanics (DeleteChatUser/EditBanned signatures, kick pattern): HIGH — verified from installed source
- Engine architecture (state machine, generation guard, abort): HIGH — directly mirrors existing MembershipScanner
- Job file persistence (AuditStore): HIGH — mirrors secrets.ts pattern
- IPC wiring (channel/store/client pattern): HIGH — mirrors searchChannels/searchStore/searchClient
- Error surface (RMV_* codes, USER_ADMIN_INVALID, CHAT_ADMIN_REQUIRED): HIGH — verified from TL schema and GramJS source
- Windows rename atomicity: MEDIUM — documented as near-atomic but not POSIX-guaranteed

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable — GramJS 2.26.22 is pinned, no upgrade in scope)
