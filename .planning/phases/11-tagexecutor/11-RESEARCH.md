# Phase 11: TagExecutor — Research

**Researched:** 2026-06-20
**Domain:** TypeScript state machine (Electron main process) — tag-write executor mirroring RemovalExecutor
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Layer-224 connection guard & lifecycle**
- Use "only open tagClient when idle" assertion plus a short mutex around the connect/layer-patch window. Before opening the tagClient, TagExecutor asserts no removal/enumeration run is in flight; it holds a "no main reconnect" guard during tagClient.connect() and releases it immediately after the LAYER restore. Spec §4.3's recommended approach — prefer it until it demonstrably fails.
- Alternatives — separate Node worker, or vendoring a GramJS patch making LAYER an instance option — are explicitly NOT pre-built.
- tagClient lifecycle: open at run start (in the idle window), keep write-only, tear down at end of run. On resume, reconnect a fresh tagClient.
- All tagClient invokes route through the shared RateLimitGovernor (governor.run()).

**Per-group dispatch**
- For each selected supergroup/channel, build InputPeerChannel{ channelId, accessHash } (group) and InputPeerUser{ userId, accessHash } (target) from ids+accessHashes held in the main process only — GroupEnumerator entity map + resolver.getResolvedUser(). Never from the renderer payload (T-05-04-B; IPC payload is only { dialogIds, tag }).
- Issue the editChatParticipantRank request (from tagApi.ts) through the tagClient, wrapped in governor.run().
- Already-admin: detect ChannelParticipantAdmin from participant data already held by GroupEnumerator (main layer-198). Mark skipped with TAG_TARGET_IS_ADMIN WITHOUT issuing the API call. If a group's participant data is missing from the enumerator, fall back to a getParticipants fetch via the main client.
- Basic group (Chat): detect by group type from the enumerator; mark skipped with TAG_UNSUPPORTED_BASIC_GROUP without an API call (v1 decision).

**Outcome model & error mapping**
- Outcome statuses: done | skipped | failed (mirrors TagGroupOutcome from Phase 10).
- Single error classifier (mirroring removal's typed classifier). Exact RPC strings are confirmed live in this phase; provisional map: CHAT_ADMIN_REQUIRED/RIGHT_FORBIDDEN → TAG_NO_RIGHTS; USER_NOT_PARTICIPANT → TAG_USER_INVALID (existing TagErrorCode); rank length/charset reject → UNKNOWN (no TAG_RANK_INVALID in tagTypes.ts); private/unresolvable → TAG_CHANNEL_INVALID / TAG_USER_INVALID.
- Any unmapped RPC error → UNKNOWN, recorded as per-group failed outcome, run CONTINUES.
- Do NOT hard-stop on unknowns.

**Throttle, hard-stop & generation guard**
- FLOOD_WAIT: absorbed by the shared governor (sleep + jitter + resume) with a countdown event forwarded to the renderer (reuse removal's flood-event pattern, scoped to tag).
- PEER_FLOOD: hard-stop the run immediately — remaining groups are left pending (NOT marked skipped), the run is resumable via tag-job.json.
- Generation-token guard (D-15): mirror RemovalExecutor verbatim.
- Inter-group pacing: 2s + jitter (mirror removal).

### Claude's Discretion
- Exact method signatures, the internal shape of the generation guard/mutex, and where the reconnect-guard coordination lives (TagExecutor vs a small helper) are at Claude's discretion, following the closest RemovalExecutor analog.

### Deferred Ideas (OUT OF SCOPE)
- Renderer action picker, tag input, confirmation, live progress, results report — Phase 12.
- "Preserve title" mode for admins (read current rank, restore after) — out of v1.6 scope.
- Basic-group (Chat) tagging support — skipped in v1.6.
- Separate-worker / GramJS-LAYER-instance-option alternatives.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAG-04 | Groups where the target is already an admin are skipped and flagged; basic groups are skipped; every group's outcome is reported. | §4.1 + §5 dispatch logic: detect ChannelParticipantAdmin before calling API; getParticipants fallback; outcomes checkpoint on TagAuditStore. |
| TAG-03 (consumer) | Tag writes are throttled through the shared rate-limit governor (FLOOD_WAIT honored, PEER_FLOOD hard-stops) and the run is resumable via tag-job audit file. | RemovalExecutor loop structure, governor.run() wiring, tag-job.json initJob/checkpoint/setStatus/resume path. |
</phase_requirements>

---

## Summary

`TagExecutor` is a new class in `src/main/telegram/TagExecutor.ts` that is a structural sibling to `RemovalExecutor`. It executes the "tag" action across selected supergroups/channels: for each group it issues a single `editChatParticipantRank` RPC call (from `tagApi.ts`) over the layer-224 `TagClient` connection, wrapped in the shared `governor.run()` for account-wide rate limiting. The state machine mirrors `RemovalExecutor` verbatim — generation-token guard, abort → mark-remaining-skipped, per-group checkpoint before advancing, inter-group pacing (2 s + jitter), PEER_FLOOD hard-stop (remaining left pending), FLOOD_WAIT via governor, resume from `tag-job.json`.

The two substantive differences from `RemovalExecutor` are: (a) per-group call is `tagClient.invoke(makeEditChatParticipantRankRequest(...))` instead of `EditBanned`/`DeleteChatUser`; (b) the `tagClient` must be opened (connect + LAYER patch-restore) at run start with a "no main reconnect" guard around the brief LAYER-mutation window. The executor satisfies the `TagExecutorLike` interface from `tagChannels.ts` and drops directly into `registerTagChannels` in `src/main/index.ts` replacing the stub. It also exposes `_handleGovernorEvent` (same as `RemovalExecutor`) and is wired in `main/index.ts` so governor flood-tick events propagate to `TagState` as `floodWaitRemaining`.

**Primary recommendation:** Copy the `RemovalExecutor.ts` + `removalExecutor.test.ts` structure, replace the per-group dispatch block, add `tagClient` lifecycle (connect/disconnect), add the already-admin/basic-group pre-flight skip, and adapt the error classifier to `TagErrorCode`. Do not touch `RemovalExecutor.ts`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tag-write execution loop | API/Backend (Electron main) | — | Governor, tagClient, and entity maps all live in main process; renderer never touches tag writes |
| Layer-224 connection lifecycle | API/Backend (Electron main) | — | LAYER global mutation must be serialized in the single main process; no renderer involvement |
| Already-admin detection | API/Backend (Electron main) | — | GroupEnumerator entity map and getParticipants fallback are main-only (T-04-01) |
| Job-file persistence | Database/Storage (tagAuditStore) | API/Backend | TagAuditStore owns disk I/O; TagExecutor calls it after each group |
| State streaming to renderer | API/Backend (IPC push) | — | emitTagState via onStateChange callback, mirroring removalChannels pattern |
| Rate-limit enforcement | API/Backend (governor) | — | Shared RateLimitGovernor owns FLOOD_WAIT/PEER_FLOOD; TagExecutor calls governor.run() |

---

## RemovalExecutor Structure — Exhaustive Inventory

This section is the core of the research, as TagExecutor mirrors it exactly.

### Constructor Options Pattern

`RemovalExecutorOptions` takes:
- `client: RemovalExecutorClient` — injectable interface with `invoke(request): Promise<unknown>`
- `governor: RateLimitGovernor`
- `enumerator: GroupEnumerator`
- `resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string } | null }`
- `auditStore: AuditStore`
- `onStateChange: (state: RemovalState) => void`

`TagExecutorOptions` will take the same pattern but replace `client` with `tagClient: TagClient` (or the TagClientInner interface), replace `auditStore: AuditStore` with `auditStore: TagAuditStore`, and replace `onStateChange: (state: RemovalState)` with `onStateChange: (state: TagState) => void`. [VERIFIED: src/main/telegram/RemovalExecutor.ts]

### Private State Fields

```typescript
private _generation = 0           // D-15 generation token
private _abortController: AbortController | null = null
private _runActive = false        // gates _handleGovernorEvent forwarding (T-06-02-04)
private _currentState: TagState = { /* idle shape */ }
```

TagExecutor `_currentState` idle shape differs from RemovalExecutor: `{ step: 'idle', tag: '', targetId: '', targetName: '', progress: { processed: 0, total: 0 }, outcomes: [] }` [VERIFIED: src/shared/tagTypes.ts]

### Generation Token Guard (D-15) — Exact Flow

The guard is checked at FIVE points inside the `execute()` loop (critical, all must be replicated):

1. **Top of loop** (before emitting pre-call state) — exits → marks remaining skipped → emits 'stopped'
2. **After `await _tagFromGroup()`** (before checkpoint) — exits → marks remaining skipped → emits 'stopped'
3. **After pacing `setTimeout`** — exits → marks remaining skipped → emits 'stopped'
4. **After the entire loop** (final check before emitting 'complete') — returns early
5. Within `retryGroup()` — after the `await`, before `_emit()`

In every exit case, all remaining (not yet checkpointed) groups are marked `skipped` and checkpointed, `setStatus('stopped')` is called, `_runActive = false` is set, and the 'stopped' state is emitted. [VERIFIED: src/main/telegram/RemovalExecutor.ts lines 206–340]

### `execute()` Full Sequence

```
1. gen = ++this._generation
2. this._runActive = true
3. this._abortController = new AbortController(); signal = ...
4. resolved = this._resolver.getResolvedUser()  → null → _runActive=false, emit idle, return
5. groupsState = this._enumerator.getState()    → not loaded → _runActive=false, emit idle, return
6. selectedDialogs = dialogIds.map(id → allDialogs.find(...)).filter(defined)
7. auditStore.initJob({ schemaVersion:1, jobId, tag, targetId, targetName, targetAccessHash, dialogIds, outcomes:[], startedAt, status:'running' })
8. emit initial 'running' state (processed:0, total, outcomes:[])
9. for each dialog:
   a. gen guard check #1 → mark remaining skipped, setStatus('stopped'), emit 'stopped', return
   b. emit 'running' { currentGroupId: dialog.id, floodWaitRemaining: null }
   c. outcome = await _tagGroup(dialog, resolved, tag)  [or catch → classify]
      - on PEER_FLOOD (hard-stop): setStatus('hard-stopped'), _runActive=false, emit 'hard-stopped', return
      - on other error: _classifyTagError(err, dialog.id) → outcome
   d. gen guard check #2 (after await, before checkpoint) → mark remaining skipped, emit 'stopped', return
   e. auditStore.checkpoint(dialog.id, outcome)
   f. outcomes.push(outcome)
   g. await sleep(2000 + Math.random() * 1000)  // pacing
   h. gen guard check #3 (after pacing) → mark remaining skipped, emit 'stopped', return
10. gen guard check #4 (post-loop, before complete)
11. auditStore.setStatus('complete', completedAt)
12. _runActive = false
13. emit 'complete' with summary
```

[VERIFIED: src/main/telegram/RemovalExecutor.ts lines 129–360]

### `abortExecution()` Exact Semantics [VERIFIED]

```typescript
abortExecution(): void {
  this._generation++
  if (this._abortController) {
    this._abortController.abort()
    this._abortController = null
  }
  // If not running/stopping → emit 'idle' immediately (TARGET_RESET path)
  // If running/stopping → do NOT emit here; execute() loop emits 'stopped' with correct outcomes
  if (this._currentState.step !== 'running' && this._currentState.step !== 'stopping') {
    this._emit({ step: 'idle', tag: '', targetId: '', targetName: '',
                 progress: { processed: 0, total: 0 }, outcomes: [] })
  }
}
```

Key invariant: for an active run, `abortExecution()` only increments `_generation` and aborts the controller. The execute loop detects the increment at the next guard checkpoint and emits the authoritative 'stopped' state with accumulated outcomes. Emitting in abortExecution would produce a double-emit with stale outcomes.

### `_handleGovernorEvent()` — Flood-Tick Forwarding [VERIFIED]

```typescript
_handleGovernorEvent(event: GovernorEvent): void {
  if (!this._runActive) return   // no-op outside a run (T-06-02-04)
  if (event.type === 'flood-tick') {
    this._emit({ ...this._currentState, floodWaitRemaining: event.remaining })
  }
}
```

This is wired in `main/index.ts` via `governor.onEvent`. For `TagExecutor`, `main/index.ts` must be updated similarly: a `tagExecutorRef` forward reference receives the constructed `TagExecutor` and forwards governor events to `tagExecutorRef?._handleGovernorEvent(event)`. [VERIFIED: src/main/index.ts lines 173–188]

### `_buildSummary()` Shape

```typescript
_buildSummary(outcomes: TagGroupOutcome[], completedAt: string): TagSummary {
  return {
    tagged: outcomes.filter(o => o.status === 'done').length,
    skipped: outcomes.filter(o => o.status === 'skipped').length,
    failed: outcomes.filter(o => o.status === 'failed').length,
    completedAt,
  }
}
```

`TagSummary` field is `tagged` (not `removed`); `skipped` (not `alreadyGone`). No `alreadyGone` concept in tag. [VERIFIED: src/shared/tagTypes.ts]

---

## TagClient Lifecycle (Phase 9 Deliverable) — Key Facts

`TagClient` wraps a `TagClientInner` and provides:
- `connect()` — patch-connect-restore for LAYER, guarded by `_connecting` flag
- `invoke(request)` — routes through `governor.run()` (always, no direct inner call)
- `disconnect()` — tears down the inner client

**The `_connecting` flag** prevents double-mutation of `LAYER` within TagClient itself. Phase 11 adds the higher-level contract: TagExecutor opens TagClient only when no removal/enumeration is in flight. [VERIFIED: src/main/telegram/tagClient.ts]

**Production wiring (Phase 11 task):** `TagExecutor` must construct a `TelegramClient` from the same `StringSession` as the main client (shared session, no re-auth), wrap it in a `TagClient`, and call `tagClient.connect()` at the start of each run and `tagClient.disconnect()` at the end. The `TagClient` instance is ephemeral per run (new TagClient per execute/resume call). [CITED: docs/superpowers/specs/2026-06-20-member-tag-action-design.md §4.3]

**Reconnect-race guard (Phase 11 responsibility):** The CONTEXT.md decision is to use an "only open tagClient when idle" assertion. Practically: before calling `tagClient.connect()`, assert that no removal/enumeration run is in flight (check `executor.getState().step !== 'running'` and `enumerator.getState().step !== 'loading'`). Since the governor serializes all Telegram calls, and `tagClient.connect()` does NOT route through the governor (it's a connection, not an invoke), the guard is a logical assertion + a brief mutex around the connect window. The spec recommends a simple boolean mutex (similar to `_connecting` in TagClient). [CITED: docs/superpowers/specs/2026-06-20-member-tag-action-design.md §4.3]

---

## Per-Group Dispatch — _tagGroup() Method

### InputPeer Construction

Mirror `RemovalExecutor._removeFromGroup()` exactly for the entity extraction:

```typescript
// Group peer — InputPeerChannel (supergroups/channels only; basic-group already skipped)
const channelEntity = this._enumerator.getDialogEntity(dialog.id) as {
  id?: { toString(): string }
  accessHash?: { toString(): string }
} | null

const channelId = bigInt(channelEntity?.id?.toString() ?? dialog.id)
const channelAccessHash = channelEntity?.accessHash
  ? bigInt(channelEntity.accessHash.toString())
  : bigInt.zero

const inputPeer = new Api.InputPeerChannel({ channelId, accessHash: channelAccessHash })

// User peer — InputPeerUser from resolver (T-05-04-B: never bigInt.zero)
const inputUser = new Api.InputPeerUser({
  userId: bigInt(resolved.id.toString()),
  accessHash: bigInt(resolved.accessHash.toString()),
})
```

[VERIFIED: src/main/telegram/RemovalExecutor.ts lines 495–540]

### The API Call

```typescript
await this._tagClient.invoke(
  makeEditChatParticipantRankRequest(inputPeer, participant, tag)
)
```

`tagClient.invoke()` already routes through `governor.run()` internally — no additional wrapping needed. [VERIFIED: src/main/telegram/tagClient.ts line 123]

### Already-Admin Pre-Flight Check [VERIFIED by spec §5]

Before issuing the API call:

```typescript
// Step 1: check from enumerator entity map
const entity = this._enumerator.getDialogEntity(dialog.id)
if (entity) {
  const participantType = (entity as { className?: string })?.className
  // When the GroupEnumerator stores it, the entity is the Chat/Channel, not the participant.
  // The participant data must come from a different source — see below.
}
```

**Critical clarification:** `GroupEnumerator._dialogMap` stores the `Api.Chat` or `Api.Channel` entity (the group entity), NOT the per-member participant record. The `ChannelParticipantAdmin` detection requires per-member participant data. The CONTEXT.md says "participant data already held by GroupEnumerator (main layer-198)" — but GroupEnumerator does NOT cache per-member participant data. The correct reading is: use the GroupEnumerator's `getDialogEntity()` to get the group entity, then separately fetch the target's participant record via `getParticipants` on the main client. [VERIFIED: src/main/telegram/GroupEnumerator.ts]

**Practical implementation:**
1. Fetch the target's participant record using `client.invoke(new Api.channels.GetParticipant({ channel: inputChannel, participant: inputUser }))` via `governor.run()` on the **main client** (not tagClient — this is a read, not a tag write).
2. If `participant.className === 'ChannelParticipantAdmin'` → skip with `TAG_TARGET_IS_ADMIN`.
3. If fetch throws `USER_NOT_PARTICIPANT` → map to `TAG_USER_INVALID` (or skip — matches the skipped path with no admin concern since user isn't a member). The CONTEXT.md notes: if missing from enumerator data, fall back to `getParticipants` fetch via main client. This is the primary path, not a fallback.

**Basic-group detection:** Read from `dialog.type === 'basic-group'` (the `AdminDialogDTO` field) — this is already in the GroupEnumerator's loaded state. No additional API call needed for basic-group detection.

[ASSUMED: The "participant data already held by GroupEnumerator" phrasing in CONTEXT.md refers to the basic-group type detection (which IS in AdminDialogDTO), while the already-admin detection requires a live `channels.GetParticipant` call.]

---

## Error Classifier — _classifyTagError()

Mirror `RemovalExecutor._classifyRemovalError()` with `TagErrorCode` values. Key mapping:

| GramJS errorMessage | Outcome |
|---------------------|---------|
| `CHAT_ADMIN_REQUIRED` | `{ status: 'failed', errorCode: 'TAG_NO_RIGHTS' }` |
| `USER_NOT_PARTICIPANT` | `{ status: 'failed', errorCode: 'TAG_USER_INVALID' }` |
| `USER_ID_INVALID` | `{ status: 'failed', errorCode: 'TAG_USER_INVALID' }` |
| `CHANNEL_PRIVATE` | `{ status: 'failed', errorCode: 'TAG_CHANNEL_INVALID' }` |
| PEER_FLOOD (hard-stop) | **re-throw** — outer loop catches and hard-stops |
| FLOOD_WAIT (via governor) | transparent — governor absorbs before error reaches here |
| Network / no errorMessage | `{ status: 'failed', errorCode: 'NETWORK' }` |
| Anything else | `{ status: 'failed', errorCode: 'UNKNOWN' }` |

Note on `RIGHT_FORBIDDEN`: provisional from spec §4.2 — if live probing in this phase reveals that `editChatParticipantRank` returns `RIGHT_FORBIDDEN` (not `CHAT_ADMIN_REQUIRED`) for missing `manage_ranks` right, add it as a second branch mapping to `TAG_NO_RIGHTS`. Branch order: PEER_FLOOD first (critical, per existing `classifyRpcError` pattern).

**TagErrorCode gap vs CONTEXT.md:** CONTEXT.md mentions `TAG_USER_NOT_PARTICIPANT` and `TAG_RANK_INVALID` and `TAG_CHANNEL_PRIVATE`, but the shipped `tagTypes.ts` (Phase 10 deliverable) defines: `TAG_TARGET_IS_ADMIN | TAG_UNSUPPORTED_BASIC_GROUP | TAG_NO_RIGHTS | TAG_USER_INVALID | TAG_CHANNEL_INVALID | NETWORK | UNKNOWN`. [VERIFIED: src/shared/tagTypes.ts]

The CONTEXT.md provisional error codes do not match what Phase 10 shipped. The planner must map to the actual shipped `TagErrorCode` values. `TAG_USER_INVALID` covers both `USER_NOT_PARTICIPANT` and `USER_ID_INVALID`. There is no `TAG_RANK_INVALID` — rank rejections map to `UNKNOWN`. If Phase 11 confirms a clean `RANK_INVALID` RPC string, `tagTypes.ts` can be extended in Wave 0 of Phase 11.

[VERIFIED: src/shared/tagTypes.ts — no TAG_USER_NOT_PARTICIPANT, no TAG_RANK_INVALID, no TAG_CHANNEL_PRIVATE in shipped types]

---

## TagExecutorLike Interface Contract

From `src/main/ipc/tagChannels.ts`: [VERIFIED]

```typescript
export interface TagExecutorLike {
  getState(): TagState
  abortExecution(): void
  execute(args: { dialogIds: string[]; tag: string }): Promise<void>
}
```

`TagExecutor.execute()` receives `{ dialogIds: string[]; tag: string }` — the `tag` string comes from the IPC payload (validated by Zod in `tagChannels.ts`). Target identity is read from `resolver.getResolvedUser()` inside `execute()`, never from the execute args.

---

## index.ts Wiring — What Phase 11 Must Change

The current `src/main/index.ts` stub (lines 316–331) must be replaced:

```typescript
// CURRENT STUB (Phase 10):
const IDLE_TAG_STATE: TagState = { step: 'idle', tag: '', ... }
registerTagChannels(currentWin,
  { getState: () => IDLE_TAG_STATE, abortExecution: () => {}, execute: async () => {} },
  enumerator, tagAuditStore, () => sm.getState()
)

// PHASE 11 REPLACEMENT:
import { TagExecutor } from './telegram/TagExecutor'
import { emitTagState } from './ipc/tagChannels'

let tagExecutorRef: TagExecutor | null = null

// In governor.onEvent callback — add alongside existing executorRef forwarding:
tagExecutorRef?._handleGovernorEvent(event)

// TagExecutor construction:
const tagExecutor = new TagExecutor({
  mainClient: client,          // for getParticipants fallback (already-admin check)
  governor,
  enumerator,
  resolver,
  auditStore: tagAuditStore,
  onStateChange: (state) => emitTagState(currentWin, state),
})
tagExecutorRef = tagExecutor

registerTagChannels(currentWin, tagExecutor, enumerator, tagAuditStore, () => sm.getState())
```

The exact `TagExecutorOptions` type is at Claude's discretion. The key additions vs `RemovalExecutorOptions`: (a) a way to construct the layer-224 `tagClient` (needs `API_ID`, `API_HASH`, and the session string from `client.session.save()`), or receive a factory/constructor; (b) a `mainClient` for the `getParticipants` already-admin check. [VERIFIED: src/main/index.ts lines 296–331]

---

## Standard Stack

### Core (all pre-existing in codebase, no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `telegram` (GramJS) | 2.26.22 | `Api.InputPeerChannel`, `Api.InputPeerUser`, `Api.channels.GetParticipant`, `bigInt` via `big-integer` | Already installed; tagApi.ts uses its classes |
| `big-integer` | bundled with `telegram` | 64-bit safe integer for channel/user IDs | Same pattern as RemovalExecutor — bigInt(str) for all IDs |
| `src/main/telegram/tagApi.ts` | Phase 9 | `makeEditChatParticipantRankRequest` factory | The vendored TL request object |
| `src/main/telegram/tagClient.ts` | Phase 9 | `TagClient` class | Layer-224 connection wrapper |
| `src/main/storage/tagAuditStore.ts` | Phase 10 | `TagAuditStore` interface | Job-file persistence |
| `src/shared/tagTypes.ts` | Phase 10 | `TagState`, `TagGroupOutcome`, `TagJobFile`, `TagErrorCode` | Shared type contracts |
| `src/main/telegram/governor.ts` | Phase 2 | `RateLimitGovernor` | Shared account-wide rate limiter |
| `src/main/telegram/operationErrors.ts` | Phase 2 | `classifyRpcError` | PEER_FLOOD/FLOOD_WAIT/NETWORK classification |

### No New Packages Required

TagExecutor requires zero new npm dependencies. All needed types, utilities, and API classes are already in the codebase. [VERIFIED: codebase survey]

---

## Package Legitimacy Audit

> No new packages are installed in this phase. The section is not applicable.

**Packages added by this phase:** None — all dependencies are pre-existing codebase modules.

---

## Architecture Patterns

### System Architecture Diagram

```
IPC (tag:start) → tagChannels.ts registerTagChannels
                       ↓ executor.execute({ dialogIds, tag })
                  TagExecutor
                  ├── resolver.getResolvedUser() → InputPeerUser (target identity)
                  ├── enumerator.getState() → selectedDialogs (ordered)
                  ├── tagAuditStore.initJob() → tag-job.json created
                  └── for each dialog
                        ├── [basic-group?] → skipped TAG_UNSUPPORTED_BASIC_GROUP
                        ├── main client: GetParticipant → [admin?] → skipped TAG_TARGET_IS_ADMIN
                        │                                            (governor.run())
                        ├── tagClient.invoke(editChatParticipantRank)
                        │       ↓ TagClient.invoke() → governor.run() → inner.invoke()
                        │       ↓ RateLimitGovernor (FLOOD_WAIT sleep / PEER_FLOOD rethrow)
                        ├── tagAuditStore.checkpoint(outcome)
                        └── sleep(2s + jitter)
                  ↓
           TagState emitted via onStateChange → emitTagState → renderer (IPC push)
```

### Recommended Project Structure

```
src/main/telegram/
├── TagExecutor.ts          # NEW — this phase's primary deliverable
├── tagExecutor.test.ts     # NEW — mirroring removalExecutor.test.ts
├── tagApi.ts               # Phase 9 — consumed unchanged
├── tagClient.ts            # Phase 9 — consumed unchanged
├── RemovalExecutor.ts      # DO NOT MODIFY
└── governor.ts             # DO NOT MODIFY
src/main/
└── index.ts                # MODIFIED: replace stub with real TagExecutor
```

### Pattern 1: Generation Token Guard

Three checks exist inside the loop body; an additional post-loop check before 'complete'. Each check must inline the "mark remaining skipped" logic — it cannot be refactored to a helper without introducing async race risks. Mirror `RemovalExecutor` exactly for guard placement.

```typescript
// Source: src/main/telegram/RemovalExecutor.ts (lines 206–340)
if (gen !== this._generation || signal.aborted) {
  const processedIds = new Set(outcomes.map(o => o.dialogId))
  const remainingDialogs = selectedDialogs.filter(d => !processedIds.has(d.id))
  for (const d of remainingDialogs) {
    const skipped: TagGroupOutcome = { dialogId: d.id, status: 'skipped', timestamp: new Date().toISOString() }
    this._auditStore.checkpoint(skipped.dialogId, skipped)
    outcomes.push(skipped)
  }
  this._auditStore.setStatus('stopped')
  this._runActive = false
  this._emit({ step: 'stopped', tag, targetId, targetName,
    progress: { processed: outcomes.filter(o => o.status !== 'skipped').length, total },
    outcomes: [...outcomes], summary: this._buildSummary(outcomes, new Date().toISOString()),
    floodWaitRemaining: null })
  return
}
```

### Pattern 2: PEER_FLOOD Hard-Stop

```typescript
// Source: src/main/telegram/RemovalExecutor.ts (lines 254–270)
const classified = classifyRpcError(err)
if (classified.disposition === 'hard-stop') {
  // DO NOT checkpoint the failed group
  // DO NOT mark remaining groups as skipped
  this._auditStore.setStatus('hard-stopped')
  this._runActive = false
  this._emit({ step: 'hard-stopped', tag, targetId, targetName,
    progress: { processed: outcomes.length, total },
    outcomes: [...outcomes], summary: this._buildSummary(outcomes, new Date().toISOString()),
    floodWaitRemaining: null })
  return
}
```

### Pattern 3: Tag-Specific Pre-Flight (new, no removal analog)

```typescript
// basic-group: detect from AdminDialogDTO.type (no API call)
if (dialog.type === 'basic-group') {
  return { dialogId: dialog.id, status: 'skipped', errorCode: 'TAG_UNSUPPORTED_BASIC_GROUP', timestamp }
}

// already-admin: fetch via main client GetParticipant (governor-wrapped, main client not tagClient)
const participantResult = await this._governor.run(() =>
  this._mainClient.invoke(new Api.channels.GetParticipant({ channel: inputChannel, participant: inputUser }))
) as { participant?: { className?: string } }
if (participantResult?.participant?.className === 'ChannelParticipantAdmin') {
  return { dialogId: dialog.id, status: 'skipped', errorCode: 'TAG_TARGET_IS_ADMIN', timestamp }
}
```

### Anti-Patterns to Avoid

- **Do NOT call `tagClient.connect()` outside the `execute()` / run-start path** — the tagClient must be ephemeral per run, not shared across calls.
- **Do NOT invoke `getParticipants` through `tagClient`** — tagClient is write-only. Already-admin check uses the main client.
- **Do NOT skip the `_connecting` race guard** — TagClient's existing guard covers double-connect within TagClient itself; TagExecutor's idle-window check covers cross-client interference.
- **Do NOT call both EditBanned calls inside a single governor.run()** — not applicable to TagExecutor (single call per group), but retain awareness.
- **Do NOT fire inter-group pacing BEFORE checkpoint** — pacing fires AFTER `auditStore.checkpoint()` (line 310 of RemovalExecutor).
- **Do NOT pass `bigInt.zero` for target accessHash** — always use `bigInt(resolved.accessHash.toString())`.
- **Do NOT emit 'stopped' from `abortExecution()`** when `_currentState.step === 'running'` — let the execute loop do it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting / FLOOD_WAIT sleep | Custom sleep + retry loop | `governor.run()` (via tagClient.invoke()) | Governor handles FLOOD_WAIT, PEER_FLOOD, transient retry, and serialization (EXE-01–03) |
| TL serialization of editChatParticipantRank | Custom binary serializer | `makeEditChatParticipantRankRequest()` from tagApi.ts | Phase 9 already vendored the proven request factory with golden-byte tests |
| LAYER patch-connect-restore | Inline LAYER mutation | `TagClient.connect()` | Phase 9 already implemented and tested the race-safe lifecycle |
| Job-file persistence + atomic write | Custom file I/O | `createTagAuditStore()` from tagAuditStore.ts | Phase 10 implemented atomic write + Zod validation + getRemaining() |
| 64-bit integer for IDs | `Number` or native `bigint` | `bigInt()` from `big-integer` | GramJS returns big-integer objects; plain Number loses precision for IDs > 2^53 |

---

## Common Pitfalls

### Pitfall 1: PEER_FLOOD must check BEFORE classifyRpcError for per-group errors

**What goes wrong:** The `_classifyTagError()` method calls `classifyRpcError(err)` at the end for unmapped errors. If PEER_FLOOD is not checked first in the outer catch block (in `execute()`), and the inner `_classifyTagError()` also calls `classifyRpcError()`, there is a risk of swallowing the hard-stop. **RemovalExecutor solves this correctly:** `_classifyRemovalError()` re-throws on `classified.disposition === 'hard-stop'`, and the `execute()` catch block checks `classified.disposition === 'hard-stop'` first.
**Prevention:** Replicate the exact two-level structure: outer `execute()` catches PEER_FLOOD and hard-stops; inner `_classifyTagError()` re-throws on hard-stop (never returns an outcome for PEER_FLOOD).

### Pitfall 2: 64-bit precision loss for channel IDs / accessHashes

**What goes wrong:** `entity.id` and `entity.accessHash` from GramJS are `big-integer` library objects, not native BigInt or Number. Calling `.toString()` gives the decimal string. Feeding them to `bigInt()` or passing directly to `Api.InputPeerChannel` is safe. Casting to `Number()` or using `===` comparisons destroys precision for IDs > 2^53.
**Prevention:** Always `bigInt(entity.id.toString())` — never `Number(entity.id)`.

### Pitfall 3: tagClient.invoke() is already governor-wrapped — don't double-wrap

**What goes wrong:** `TagClient.invoke()` calls `this._governor.run(() => this._inner.invoke(request))` internally. Wrapping the `tagClient.invoke()` call in another `governor.run()` at the TagExecutor level would nest governors, double-serializing the call.
**Prevention:** Call `await this._tagClient.invoke(request)` directly inside `_tagGroup()`. Do NOT wrap in `this._governor.run()`.

### Pitfall 4: already-admin GetParticipant call MUST go through the main client + governor, not tagClient

**What goes wrong:** Fetching participant data through `tagClient` (which is write-only and connected at layer-224) breaks the write-only contract and risks parsing layer-224 channel participant constructors through a layer-198 schema.
**Prevention:** `_mainClient.invoke(new Api.channels.GetParticipant(...))` wrapped in `this._governor.run()`.

### Pitfall 5: tagClient must be torn down at run end (including hard-stop and abort paths)

**What goes wrong:** If the tagClient is not disconnected on PEER_FLOOD hard-stop or abort, the layer-224 connection leaks and the next run cannot safely re-open it.
**Prevention:** `await this._tagClient.disconnect()` in a `finally` block or at all terminal paths. On resume, construct a new tagClient (fresh connection).

### Pitfall 6: abortExecution() during idle/stopped/complete must not leave phantom 'stopped' state

**What goes wrong:** If `abortExecution()` unconditionally emits 'stopped', calling it from `registerTargetChannels` → TARGET_RESET path (when executor is idle or already complete) would show a false "stopped" state with empty outcomes.
**Prevention:** Match RemovalExecutor exactly — only emit 'idle' from `abortExecution()` when `_currentState.step` is NOT 'running'/'stopping'. Let the execute loop handle 'stopped' emission for active runs.

### Pitfall 7: gen guard BEFORE checkpoint — race between gen increment and persist

**What goes wrong:** If generation changes DURING the `await _tagGroup()` call, and the guard check runs AFTER `auditStore.checkpoint()`, a stale outcome is persisted to `tag-job.json` for a run that has been superseded.
**Prevention:** The second gen guard check (Point 2 in the execute sequence above) runs BEFORE `auditStore.checkpoint()` — mirror RemovalExecutor lines 276–303 exactly.

### Pitfall 8: TagErrorCode mismatch between CONTEXT.md and shipped tagTypes.ts

**What goes wrong:** CONTEXT.md's outcome model section references `TAG_USER_NOT_PARTICIPANT`, `TAG_RANK_INVALID`, `TAG_CHANNEL_PRIVATE` — codes that do NOT exist in the shipped `tagTypes.ts`. Using them would cause TypeScript errors.
**Prevention:** Map to shipped codes: `TAG_USER_INVALID` for USER_NOT_PARTICIPANT; `UNKNOWN` for rank rejects; `TAG_CHANNEL_INVALID` for CHANNEL_PRIVATE.

---

## Runtime State Inventory

> This is a refactor phase that adds a new file without renaming or migrating existing state.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `tag-job.json` — schema already correct from Phase 10 | None — TagExecutor uses same schema |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None — TagExecutor constructs new TelegramClient from same StringSession (in-process only) | None |
| Build artifacts | None — pure .ts addition | None |

**Nothing found requiring migration.** The only index.ts change is replacing the stub object with the real `TagExecutor` instance.

---

## Environment Availability

> Phase 11 is pure TypeScript code in the Electron main process. No new external tools, services, or CLIs are required. All dependencies are already present in the project.

Step 2.6: SKIPPED (no external dependencies beyond the existing Node.js + TypeScript toolchain verified in prior phases).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (no version pinned in config; follows package.json devDependencies) |
| Config file | `vitest.config.ts` at project root |
| Quick run command | `npx vitest run src/main/telegram/tagExecutor.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TAG-04 | already-admin target → skipped with TAG_TARGET_IS_ADMIN, no API call | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-04 | basic-group → skipped with TAG_UNSUPPORTED_BASIC_GROUP, no API call | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-04 | per-group outcome reported (done/skipped/failed with errorCode) | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-03 | successful tag run: editChatParticipantRank called once per group | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-03 | PEER_FLOOD mid-run → step=hard-stopped; remaining left pending (not skipped) | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-03 | FLOOD_WAIT absorbed by governor; run continues; floodWaitRemaining emitted | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-03 | abortExecution() during group 2 of 3 → remaining marked skipped, step=stopped | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-03 | generation guard: stale run result not emitted after new execute() | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-03 | per-group checkpoint before advancing to next group | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-03 | _handleGovernorEvent no-op when _runActive=false | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| TAG-03 | _handleGovernorEvent emits floodWaitRemaining during active run | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| §4.3 | tagClient connected at layer-224 (connect called before invoke) | unit (integration with mock tagClient) | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |
| §4.3 | tagClient disconnected at run end (complete, stopped, hard-stopped) | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ Wave 0 |

### Mock Strategy (mirroring removalExecutor.test.ts)

The test file should create:
1. A `mockTagClient` with a spy on `invoke()` that records `editChatParticipantRank` calls and supports injected error behavior per `dialogId`.
2. A `mockMainClient` with a spy on `invoke()` for `GetParticipant` calls — returns `{ participant: { className: 'ChannelParticipant' } }` by default, `ChannelParticipantAdmin` for admin-flagged dialog IDs, throws `USER_NOT_PARTICIPANT` for non-member dialog IDs.
3. A `makeTagAuditStore()` factory mirroring `makeAuditStore()` in removalExecutor.test.ts — in-memory with `checkpointCalls`, `setStatusCalls`, `initJobCalled`.
4. A `makeTagExecutor(config)` factory creating all stubs + a `TagExecutor` instance, returning `{ executor, mockTagClient, mockMainClient, states, auditStore }`.

```typescript
// Source pattern: src/main/telegram/removalExecutor.test.ts (lines 51–146)
function makeTagAuditStore(): TagAuditStore & {
  checkpointCalls: Array<{ dialogId: string; outcome: TagGroupOutcome }>
  setStatusCalls: Array<{ status: string }>
  initJobCalled: boolean
}
```

The `mockTagClient` does NOT need `connect()`/`disconnect()` to actually patch LAYER — it just needs to be a stub that records calls. TagClient's layer-224 behavior is already tested in `tagClient.test.ts`.

### Sampling Rate

- **Per task commit:** `npx vitest run src/main/telegram/tagExecutor.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/main/telegram/tagExecutor.test.ts` — primary test file (all tests above)
- [ ] `src/main/telegram/TagExecutor.ts` — implementation file

*(No framework gaps — existing Vitest infrastructure covers all phase requirements)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | T-05-04-B: target identity always from resolver.getResolvedUser(), never from IPC payload |
| V5 Input Validation | yes (indirect) | TagStartSchema (Zod, in tagChannels.ts Phase 10 — not re-implemented here) |
| V6 Cryptography | no | — |

### Known Threat Patterns for this Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer-injected target identity | Tampering | T-05-04-B: read from `resolver.getResolvedUser()` inside `execute()`, not from args |
| Race between tag run and removal run during layer patch | Elevation | "Only open tagClient when idle" assertion + boolean mutex around connect window |
| Silent tag of admin (clobbers custom title) | Tampering | Pre-flight `GetParticipant` check → skip with TAG_TARGET_IS_ADMIN |
| Job file poisoning via corrupted tag-job.json | Tampering | tagAuditStore.readJob() Zod-validates before returning (T-10-03, Phase 10) |
| Flood attack via tag writes | Denial of Service | governor.run() serializes all calls; PEER_FLOOD hard-stop (T-05-04-C analog) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GroupEnumerator._dialogMap` stores `Api.Chat`/`Api.Channel` group entities, not per-member participant records. Therefore the already-admin check requires a live `channels.GetParticipant` call via the main client, not a cached lookup. | Per-Group Dispatch / Already-Admin | Low risk: confirmed by reading GroupEnumerator.ts lines 66, 177; the `_dialogMap` assignment is always `entity` (the group). If GramJS dialogs also expose a participant object (unlikely), the GetParticipant call still works correctly. |
| A2 | `channels.GetParticipant` returns `{ participant: { className: 'ChannelParticipantAdmin' } }` for admin members in GramJS 2.26.22's layer-198 deserialization. | Per-Group Dispatch | Medium risk: `className` on participant objects is a GramJS convention but the exact string should be verified against installed GramJS. Production-safe: a wrong className would cause admins to NOT be skipped (tag would be applied), which is recoverable. |
| A3 | RPC error string for insufficient rights is `CHAT_ADMIN_REQUIRED` (as in removal). `RIGHT_FORBIDDEN` may also appear. Both map to `TAG_NO_RIGHTS`. | Error Classifier | Medium risk: exact error strings for `editChatParticipantRank` must be confirmed by live probe in Phase 11. If neither matches, errors fall to `UNKNOWN` which continues the run — acceptable per CONTEXT.md. |
| A4 | A newly constructed `TelegramClient` initialized from an existing `StringSession.save()` string re-uses the same Telegram session (no re-auth) and can connect at layer-224 after the LAYER patch without a new login challenge. | TagClient Lifecycle | High confidence based on Phase 0 spike findings and spec §4.3. The spike proved patch-connect-restore on a second TelegramClient works with the same session string. |

---

## Open Questions

1. **Where does TagExecutor get the API_ID/API_HASH and StringSession to create the inner TelegramClient for tagClient?**
   - What we know: `TagClient` wraps a `TagClientInner` (inner client). In production, the inner client is a `TelegramClient` constructed with `new StringSession(client.session.save())`.
   - What's unclear: how to inject `API_ID`/`API_HASH` into TagExecutor without importing `config.ts` from the telegram module (it uses `import.meta.env`).
   - Recommendation: Pass the inner `TelegramClient` as a pre-constructed dependency to `TagExecutorOptions` (already created externally in `main/index.ts`). Or pass a factory: `tagClientFactory: () => TagClient`. This mirrors how `RemovalExecutor` receives `client` rather than constructing it.

2. **Reconnect-race mutex scope: TagExecutor private field vs module-level singleton?**
   - What we know: The CONTEXT.md says a boolean mutex around the connect window.
   - What's unclear: should this mutex be a private `_connectingTagClient: boolean` field on TagExecutor, or a shared cross-executor flag?
   - Recommendation: Private field on TagExecutor is sufficient. The "only open when idle" check (verifying `executor.getState().step !== 'running'` before calling tagClient.connect()) is the primary guard. The mutex is only needed for the brief LAYER-mutation window during TagClient.connect() itself — which TagClient already handles internally with `_connecting`. TagExecutor just needs to assert the executor is idle before entering the connect window.

3. **Does `editChatParticipantRank` return `USER_NOT_PARTICIPANT` when the target is not a member (to be confirmed in Phase 11)?**
   - What we know: spec §4.2 lists `TAG_USER_NOT_PARTICIPANT` as a candidate.
   - What's unclear: whether this is the actual RPC error string from the server.
   - Recommendation: Map `USER_NOT_PARTICIPANT` → `TAG_USER_INVALID` in the error classifier (existing code handles both cases with the same outcome). If Phase 11 confirms a distinct code is needed, `tagTypes.ts` can be extended.

---

## Sources

### Primary (HIGH confidence — verified from codebase)
- `src/main/telegram/RemovalExecutor.ts` — exhaustive structure survey, all patterns verified line-by-line
- `src/main/telegram/removalExecutor.test.ts` — test structure verified for mock patterns
- `src/main/telegram/tagClient.ts` — TagClient API, lifecycle, _connecting guard
- `src/main/telegram/tagApi.ts` — makeEditChatParticipantRankRequest, InputPeer usage
- `src/shared/tagTypes.ts` — TagState, TagGroupOutcome, TagJobFile, TagErrorCode (exact shipped values)
- `src/main/storage/tagAuditStore.ts` — TagAuditStore interface, initJob/checkpoint/setStatus/readJob/clearJob
- `src/main/ipc/tagChannels.ts` — TagExecutorLike interface, emitTagState, registerTagChannels
- `src/main/telegram/GroupEnumerator.ts` — getDialogEntity returns group entity (not participant), AdminDialogDTO.type
- `src/main/telegram/governor.ts` — governor.run() contract, _tail serialization, GovernorEvent types
- `src/main/telegram/operationErrors.ts` — classifyRpcError, PEER_FLOOD/FLOOD_WAIT/NETWORK dispatch
- `src/main/index.ts` — current stub wiring (lines 316–331), governor.onEvent pattern (lines 175–188)
- `src/main/telegram/__mocks__/telegramClient.ts` — mock patterns for test factory
- `docs/superpowers/specs/2026-06-20-member-tag-action-design.md` — §4, §4.1, §4.2, §4.3, §5, §9

### Secondary (MEDIUM confidence)
- `vitest.config.ts` — confirmed test framework and include pattern

---

## Metadata

**Confidence breakdown:**
- RemovalExecutor mirror structure: HIGH — read every line of RemovalExecutor.ts
- TagClient lifecycle/connect: HIGH — read tagClient.ts in full
- TagTypes / error codes: HIGH — read tagTypes.ts; identified CONTEXT.md vs shipped-code discrepancy
- Already-admin detection path: MEDIUM — GroupEnumerator stores group entity not participant; GetParticipant call pattern inferred from codebase (not a novel pattern)
- Exact RPC error strings: LOW — provisional from spec §4.2; must be confirmed by live probe in Phase 11

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable, internal codebase — no external library drift risk)

---

## RESEARCH COMPLETE
