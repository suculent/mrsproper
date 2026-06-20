# Phase 11: TagExecutor — Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 3 (TagExecutor.ts [new], tagExecutor.test.ts [new], index.ts [modified])
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/main/telegram/TagExecutor.ts` | service / state machine | request-response + event-driven | `src/main/telegram/RemovalExecutor.ts` | exact (parallel class — same structure, different per-group call) |
| `src/main/telegram/tagExecutor.test.ts` | test | N/A | `src/main/telegram/removalExecutor.test.ts` | exact (same mock strategy and test map) |
| `src/main/index.ts` | config / wiring | N/A | `src/main/index.ts` lines 173–334 | self (add tagExecutorRef alongside executorRef) |

---

## Pattern Assignments

### `src/main/telegram/TagExecutor.ts` (service, request-response + event-driven)

**Analog:** `src/main/telegram/RemovalExecutor.ts`

**Imports pattern** (lines 33–41):
```typescript
import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { TagState, TagGroupOutcome, TagJobFile } from '@shared/tagTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import type { GroupEnumerator } from './GroupEnumerator'
import type { TagAuditStore } from '../storage/tagAuditStore'
import { classifyRpcError } from './operationErrors'
import type { GovernorEvent } from '@shared/opTypes'
import { makeEditChatParticipantRankRequest } from './tagApi'
import type { TagClient } from './tagClient'
```

**Injectable client interface pattern** (lines 44–47):
```typescript
// RemovalExecutor defines RemovalExecutorClient { invoke(request): Promise<unknown> }
// TagExecutor receives TagClient directly (it has connect/invoke/disconnect)
// No separate interface needed — TagClient already satisfies the contract
```

**Constructor options pattern** (lines 51–64 of RemovalExecutor.ts):
```typescript
export interface TagExecutorOptions {
  /** The layer-224 TagClient — ephemeral per run (open at run start, tear down at end). */
  tagClient: TagClient
  /** Main layer-198 client — for already-admin GetParticipant check (read, not write). */
  mainClient: { invoke(request: unknown): Promise<unknown> }
  /** Shared account-wide RateLimitGovernor — all Telegram calls must go through it. */
  governor: RateLimitGovernor
  /** GroupEnumerator — provides dialog list and entity map. */
  enumerator: GroupEnumerator
  /** TargetResolver — provides resolved user id, accessHash, and display name. */
  resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string } | null }
  /** TagAuditStore — durable job-file persistence. */
  auditStore: TagAuditStore
  /** Called whenever TagState changes. Wired to emitTagState in production. */
  onStateChange: (state: TagState) => void
}
```

**Private state fields pattern** (lines 76–89 of RemovalExecutor.ts):
```typescript
// Mirror exactly — swap RemovalState for TagState, adjust idle shape
private _currentState: TagState = {
  step: 'idle',
  tag: '',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}

private _generation = 0
private _abortController: AbortController | null = null
private _runActive = false
```

**`_handleGovernorEvent()` pattern** (lines 113–118 of RemovalExecutor.ts):
```typescript
// Copy verbatim from RemovalExecutor — only type changes (TagState instead of RemovalState)
_handleGovernorEvent(event: GovernorEvent): void {
  if (!this._runActive) return
  if (event.type === 'flood-tick') {
    this._emit({ ...this._currentState, floodWaitRemaining: event.remaining })
  }
}
```

**`execute()` header and early-exit pattern** (lines 129–163 of RemovalExecutor.ts):
```typescript
// TagExecutor.execute() receives { dialogIds, tag } — NO severity param
async execute(params: { dialogIds: string[]; tag: string }): Promise<void> {
  const gen = ++this._generation
  this._runActive = true

  this._abortController = new AbortController()
  const signal = this._abortController.signal

  // T-05-04-B: read target from resolver, never from params
  const resolved = this._resolver.getResolvedUser()
  if (resolved === null) {
    this._runActive = false
    this._emit({ ...this._currentState, step: 'idle', floodWaitRemaining: null })
    return
  }

  const groupsState = this._enumerator.getState()
  if (groupsState.step !== 'loaded') {
    this._runActive = false
    this._emit({ ...this._currentState, step: 'idle', floodWaitRemaining: null })
    return
  }
  // ... filter dialogs, initJob, begin loop
}
```

**`auditStore.initJob()` call pattern** (lines 177–190 of RemovalExecutor.ts):
```typescript
// Adapt RemovalJobFile → TagJobFile: replace severity with tag, remove note
const jobId = new Date().toISOString()
const job: TagJobFile = {
  schemaVersion: 1,
  jobId,
  tag: params.tag,            // was: severity
  targetId,
  targetName,
  targetAccessHash: resolved.accessHash.toString(),
  dialogIds: params.dialogIds,
  outcomes: [],
  startedAt: jobId,
  status: 'running',
}
this._auditStore.initJob(job)
```

**Generation guard #1 (top of loop) pattern** (lines 207–233 of RemovalExecutor.ts):
```typescript
// Copy verbatim — only type is TagGroupOutcome; adapt emit shape for TagState
if (gen !== this._generation || signal.aborted) {
  const processedIds = new Set(outcomes.map(o => o.dialogId))
  const remainingDialogs = selectedDialogs.filter(d => !processedIds.has(d.id))
  const skippedOutcomes: TagGroupOutcome[] = remainingDialogs.map(d => ({
    dialogId: d.id,
    status: 'skipped' as const,
    timestamp: new Date().toISOString(),
  }))
  for (const skipped of skippedOutcomes) {
    this._auditStore.checkpoint(skipped.dialogId, skipped)
    outcomes.push(skipped)
  }
  this._auditStore.setStatus('stopped')
  this._runActive = false
  this._emit({
    step: 'stopped', tag, targetId, targetName,
    progress: { processed: outcomes.filter(o => o.status !== 'skipped').length, total },
    outcomes: [...outcomes],
    summary: this._buildSummary(outcomes, new Date().toISOString()),
    floodWaitRemaining: null,
  })
  return
}
```

**Pre-call state emit pattern** (lines 238–247 of RemovalExecutor.ts):
```typescript
// Copy verbatim — adapt for TagState shape (no severity field)
this._emit({
  step: 'running', tag, targetId, targetName,
  progress: { processed: outcomes.length, total },
  outcomes: [...outcomes],
  currentGroupId: dialog.id,
  floodWaitRemaining: null,
})
```

**Per-group dispatch + catch pattern** (lines 249–274 of RemovalExecutor.ts):
```typescript
let outcome: TagGroupOutcome
try {
  outcome = await this._tagGroup(dialog, resolved, params.tag)
} catch (err) {
  // PEER_FLOOD check MUST come first (operationErrors.ts Pitfall 1)
  const classified = classifyRpcError(err)
  if (classified.disposition === 'hard-stop') {
    // Hard-stop: do NOT mark remaining groups as skipped (resumable)
    // Do NOT checkpoint the failed group
    this._auditStore.setStatus('hard-stopped')
    this._runActive = false
    // NOTE: tagClient.disconnect() must also run here — add a finally or explicit call
    this._emit({
      step: 'hard-stopped', tag, targetId, targetName,
      progress: { processed: outcomes.length, total },
      outcomes: [...outcomes],
      summary: this._buildSummary(outcomes, new Date().toISOString()),
      floodWaitRemaining: null,
    })
    return
  }
  // Per-group failure isolation: classify and continue
  outcome = this._classifyTagError(err, dialog.id)
}
```

**Generation guard #2 (after await, before checkpoint) pattern** (lines 277–303 of RemovalExecutor.ts):
```typescript
// Pitfall 7: MUST run BEFORE auditStore.checkpoint
// Copy exactly — adapt types
if (gen !== this._generation || signal.aborted) {
  // [same mark-remaining-skipped block as guard #1]
  return
}
```

**Checkpoint and pacing pattern** (lines 306–310 of RemovalExecutor.ts):
```typescript
// Checkpoint BEFORE pacing (anti-pattern: pacing before checkpoint fires wrong order)
this._auditStore.checkpoint(dialog.id, outcome)
outcomes.push(outcome)

// Inter-group pacing: 2s base + up to 1s jitter (fires AFTER checkpoint)
await new Promise<void>(r => setTimeout(r, 2000 + Math.random() * 1000))
```

**Generation guard #3 (after pacing) pattern** (lines 313–339 of RemovalExecutor.ts):
```typescript
// Third guard — after pacing sleep, before advancing to next group
// Copy exactly — adapt types
if (gen !== this._generation || signal.aborted) {
  // [same mark-remaining-skipped block]
  return
}
```

**Generation guard #4 (post-loop, before complete) pattern** (lines 342–359 of RemovalExecutor.ts):
```typescript
// Final check before emitting complete — only a return, no skipped marking needed
if (gen !== this._generation || signal.aborted) {
  return
}

const completedAt = new Date().toISOString()
this._auditStore.setStatus('complete', completedAt)
this._runActive = false
this._emit({
  step: 'complete', tag, targetId, targetName,
  progress: { processed: outcomes.length, total },
  outcomes: [...outcomes],
  summary: this._buildSummary(outcomes, completedAt),
  floodWaitRemaining: null,
})
```

**`abortExecution()` pattern** (lines 370–395 of RemovalExecutor.ts):
```typescript
abortExecution(): void {
  this._generation++
  if (this._abortController) {
    this._abortController.abort()
    this._abortController = null
  }
  // WR-02: only emit 'idle' when NOT already running/stopping
  // For active runs: execute() loop handles 'stopped' emission
  if (this._currentState.step !== 'running' && this._currentState.step !== 'stopping') {
    this._emit({
      step: 'idle', tag: '', targetId: '', targetName: '',
      progress: { processed: 0, total: 0 },
      outcomes: [],
    })
  }
}
```

**`getState()` pattern** (line 462 of RemovalExecutor.ts):
```typescript
getState(): TagState {
  return this._currentState
}
```

**`_tagGroup()` method — per-group dispatch (TagExecutor-specific, no removal analog)**

This replaces `_removeFromGroup()`. Structure:

```typescript
private async _tagGroup(
  dialog: AdminDialogDTO,
  resolved: { id: bigint; accessHash: bigint },
  tag: string
): Promise<TagGroupOutcome> {
  const timestamp = new Date().toISOString()

  // Step 1: basic-group skip — detect from AdminDialogDTO.type (no API call)
  // Source: RESEARCH.md Pattern 3
  if (dialog.type === 'basic-group') {
    return { dialogId: dialog.id, status: 'skipped',
             errorCode: 'TAG_UNSUPPORTED_BASIC_GROUP', timestamp }
  }

  // Step 2: build InputPeerChannel from enumerator entity map
  // Source: RemovalExecutor.ts lines 531–539
  const channelEntity = this._enumerator.getDialogEntity(dialog.id) as {
    id?: { toString(): string }
    accessHash?: { toString(): string }
  } | null

  const channelId = bigInt(channelEntity?.id?.toString() ?? dialog.id)
  const channelAccessHash = channelEntity?.accessHash
    ? bigInt(channelEntity.accessHash.toString())
    : bigInt.zero

  const inputPeer = new Api.InputPeerChannel({ channelId, accessHash: channelAccessHash })
  const inputChannel = new Api.InputChannel({ channelId, accessHash: channelAccessHash })

  // Step 3: build InputPeerUser — T-05-04-B: never bigInt.zero
  // Source: RemovalExecutor.ts lines 495–498
  const inputUser = new Api.InputPeerUser({
    userId: bigInt(resolved.id.toString()),
    accessHash: bigInt(resolved.accessHash.toString()),
  })

  // Step 4: already-admin pre-flight check via main client (NOT tagClient — write-only)
  // Source: RESEARCH.md Pattern 3, Pitfall 4
  const participantResult = await this._governor.run(() =>
    this._mainClient.invoke(
      new Api.channels.GetParticipant({ channel: inputChannel, participant: inputUser })
    )
  ) as { participant?: { className?: string } }

  if (participantResult?.participant?.className === 'ChannelParticipantAdmin') {
    return { dialogId: dialog.id, status: 'skipped',
             errorCode: 'TAG_TARGET_IS_ADMIN', timestamp }
  }

  // Step 5: issue editChatParticipantRank — tagClient.invoke() already governor-wrapped
  // Source: RESEARCH.md Pitfall 3 — do NOT wrap in governor.run() again
  await this._tagClient.invoke(
    makeEditChatParticipantRankRequest(inputPeer, inputUser, tag)
  )

  return { dialogId: dialog.id, status: 'done', timestamp }
}
```

**`_classifyTagError()` method — error classifier pattern** (lines 613–649 of RemovalExecutor.ts):
```typescript
// Mirror _classifyRemovalError() — adapt error codes to TagErrorCode
// CRITICAL: re-throw on hard-stop FIRST (Pitfall 1 from RESEARCH.md)
private _classifyTagError(err: unknown, dialogId: string): TagGroupOutcome {
  const timestamp = new Date().toISOString()
  const msg: string = (err as { errorMessage?: string })?.errorMessage ?? ''

  if (msg === 'CHAT_ADMIN_REQUIRED' || msg === 'RIGHT_FORBIDDEN') {
    return { dialogId, status: 'failed', errorCode: 'TAG_NO_RIGHTS', timestamp }
  }

  if (msg === 'USER_NOT_PARTICIPANT' || msg === 'USER_ID_INVALID') {
    return { dialogId, status: 'failed', errorCode: 'TAG_USER_INVALID', timestamp }
  }

  if (msg === 'CHANNEL_PRIVATE') {
    return { dialogId, status: 'failed', errorCode: 'TAG_CHANNEL_INVALID', timestamp }
  }

  // Fall through to classifyRpcError for PEER_FLOOD / FLOOD_WAIT / NETWORK
  const classified = classifyRpcError(err)
  if (classified.disposition === 'hard-stop') {
    throw err  // Re-throw — execute() catch block handles PEER_FLOOD hard-stop
  }

  if (classified.disposition === 'retry' || classified.code === 'NETWORK') {
    return { dialogId, status: 'failed', errorCode: 'NETWORK', timestamp }
  }

  return { dialogId, status: 'failed', errorCode: 'UNKNOWN', timestamp }
}
```

**`_buildSummary()` method pattern** (lines 654–665 of RemovalExecutor.ts):
```typescript
// TagSummary uses 'tagged' not 'removed', 'skipped' (no 'alreadyGone')
private _buildSummary(outcomes: TagGroupOutcome[], completedAt: string) {
  return {
    tagged:  outcomes.filter(o => o.status === 'done').length,
    skipped: outcomes.filter(o => o.status === 'skipped').length,
    failed:  outcomes.filter(o => o.status === 'failed').length,
    completedAt,
  }
}
```

**tagClient lifecycle — NEW (no removal analog)**

These calls have no exact analog in RemovalExecutor but are required by CONTEXT.md §4.3:

```typescript
// At run start (before the loop — in execute(), after guard checks pass):
await this._tagClient.connect()

// At ALL terminal paths (complete, stopped, hard-stopped):
// Use try/finally to guarantee disconnect even when returning early.
// Pattern: wrap the main loop in try { ... } finally { await this._tagClient.disconnect() }
// Source: RESEARCH.md Pitfall 5
```

---

### `src/main/telegram/tagExecutor.test.ts` (test)

**Analog:** `src/main/telegram/removalExecutor.test.ts`

**Imports pattern** (lines 19–26 of removalExecutor.test.ts):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import bigInt from 'big-integer'
import { RateLimitGovernor } from './governor'
import { TagExecutor } from './TagExecutor'
import type { TagState, TagGroupOutcome } from '@shared/tagTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { TagAuditStore } from '../storage/tagAuditStore'
```

**`makeDialog()` factory pattern** (lines 32–45 of removalExecutor.test.ts):
```typescript
// Copy exactly — TagExecutor only handles 'supergroup' and 'basic-group'
// 'broadcast-channel' is also valid but tag tests focus on supergroup
function makeDialog(
  id: string,
  type: 'supergroup' | 'basic-group' | 'broadcast-channel' = 'supergroup'
): AdminDialogDTO {
  return {
    id, title: `Group ${id}`, avatar: null, memberCount: null,
    type, canAct: true, greyReason: null,
  }
}
```

**`makeTagAuditStore()` factory pattern** (lines 51–85 of removalExecutor.test.ts):
```typescript
// Adapt makeAuditStore() for TagAuditStore interface
// Key differences: TagAuditStore has no readJob returning RemovalJobFile; TagGroupOutcome
// has no 'already-gone' status; TagGroupOutcome has no 'note' field
function makeTagAuditStore(dialogIds: string[] = []): TagAuditStore & {
  checkpointCalls: Array<{ dialogId: string; outcome: TagGroupOutcome }>
  setStatusCalls: Array<{ status: string; completedAt?: string }>
  initJobCalled: boolean
} {
  const checkpointCalls: Array<{ dialogId: string; outcome: TagGroupOutcome }> = []
  const setStatusCalls: Array<{ status: string; completedAt?: string }> = []
  const state = { initJobCalled: false }
  let _dialogIds = [...dialogIds]
  const outcomes: TagGroupOutcome[] = []

  return {
    checkpointCalls,
    setStatusCalls,
    get initJobCalled() { return state.initJobCalled },
    initJob(job) {
      state.initJobCalled = true
      _dialogIds = [...job.dialogIds]
    },
    checkpoint(dialogId, outcome) {
      outcomes.push({ ...outcome, dialogId })
      checkpointCalls.push({ dialogId, outcome })
    },
    setStatus(status, completedAt?) {
      setStatusCalls.push({ status, completedAt })
    },
    readJob: () => null,
    clearJob: () => {},
    getRemaining() {
      const done = new Set(outcomes.map(o => o.dialogId))
      return _dialogIds.filter(id => !done.has(id))
    },
  }
}
```

**`makeTagExecutor()` factory pattern** (lines 93–146 of removalExecutor.test.ts):
```typescript
// Adapt makeExecutor() — replace mockClient with separate mockTagClient + mockMainClient
// mockTagClient: has connect/invoke/disconnect spies + per-dialogId error injection
// mockMainClient: has invoke spy for GetParticipant — returns 'ChannelParticipant' by default
function makeTagExecutor(config: {
  dialogs: AdminDialogDTO[]
  // dialogIds where GetParticipant returns ChannelParticipantAdmin (triggers skip)
  adminDialogIds?: string[]
  // dialogIds where invoke(editChatParticipantRank) throws with the mapped errorMessage
  tagErrorDialogIds?: Record<string, string>
  auditStore?: TagAuditStore
}) {
  // mockTagClient — tracks invoke calls for editChatParticipantRank
  const tagInvokeCalls: unknown[] = []
  const mockTagClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    invoke: vi.fn().mockImplementation(async (request: unknown) => {
      tagInvokeCalls.push(request)
      // Check per-dialog error injection (key: className 'messages.EditChatParticipantRank')
      // Tag requests don't carry dialogId — inject errors by call order or via
      // wrapping makeEditChatParticipantRankRequest in _tagGroup (needs dialogId capture)
      return {}
    }),
    tagInvokeCalls,
  }

  // mockMainClient — for GetParticipant (already-admin check)
  const mainInvokeCalls: unknown[] = []
  const mockMainClient = {
    invoke: vi.fn().mockImplementation(async (request: unknown) => {
      mainInvokeCalls.push(request)
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetParticipant' || className === 'channels.GetParticipant') {
        const channelId = (request as { channel?: { channelId?: { toString(): string } } })
          .channel?.channelId?.toString() ?? ''
        if (config.adminDialogIds?.includes(channelId)) {
          return { participant: { className: 'ChannelParticipantAdmin' } }
        }
        return { participant: { className: 'ChannelParticipant' } }
      }
      return {}
    }),
    mainInvokeCalls,
  }

  const governor = new RateLimitGovernor({ client: mockMainClient as never })

  const stubEnumerator = {
    getState: () => ({ step: 'loaded' as const, dialogs: config.dialogs }),
    getDialogEntity: (id: string) => {
      const dialog = config.dialogs.find(d => d.id === id)
      if (!dialog) return null
      if (dialog.type === 'basic-group') {
        return { id: { toString: () => id }, className: 'Chat' }
      }
      return {
        id: { toString: () => id },
        accessHash: { toString: () => '0' },
        className: 'Channel',
      }
    },
  }

  const stubResolver = {
    getResolvedUser: () => ({
      id: BigInt('99'),
      accessHash: BigInt('12345'),
    }),
  }

  const dialogIds = config.dialogs.map(d => d.id)
  const auditStore = config.auditStore ?? makeTagAuditStore(dialogIds)

  const states: TagState[] = []
  const onStateChange = (s: TagState) => states.push(s)

  const executor = new TagExecutor({
    tagClient: mockTagClient as never,
    mainClient: mockMainClient,
    governor,
    enumerator: stubEnumerator as never,
    resolver: stubResolver,
    auditStore,
    onStateChange,
  })

  return { executor, mockTagClient, mockMainClient, states, auditStore }
}
```

**Test describe block naming pattern** (removalExecutor.test.ts):
```typescript
// Map phase requirement IDs to describe block names — mirror the RMV-01/RMV-02/EXE-04
// naming convention from removalExecutor.test.ts for TAG-03/TAG-04

describe('TagExecutor — per-group dispatch (TAG-03)', () => { ... })
describe('TagExecutor — already-admin skip (TAG-04)', () => { ... })
describe('TagExecutor — basic-group skip (TAG-04)', () => { ... })
describe('TagExecutor — PEER_FLOOD hard-stop (TAG-03)', () => { ... })
describe('TagExecutor — abort (Stop tag run)', () => { ... })
describe('TagExecutor — generation guard', () => { ... })
describe('TagExecutor — _handleGovernorEvent + _runActive', () => { ... })
describe('TagExecutor — tagClient lifecycle (§4.3)', () => { ... })
```

**`beforeEach` fake timers pattern** (line 154 of removalExecutor.test.ts):
```typescript
beforeEach(() => {
  vi.useFakeTimers()
})
// Every describe block uses this — the pacing sleep (2s+) and inter-kick sleep (500ms)
// require fake timers; tests call `await vi.runAllTimersAsync()` before `await execPromise`.
```

---

### `src/main/index.ts` (config / wiring — MODIFIED)

**Analog:** `src/main/index.ts` lines 169–188 (executorRef + governor.onEvent) and lines 294–334 (executor construction + registerTagChannels stub)

**tagExecutorRef forward reference pattern** (mirror lines 173 and 187 of index.ts):
```typescript
// Add alongside the existing executorRef declaration (line 173)
let executorRef: import('./telegram/RemovalExecutor').RemovalExecutor | null = null
let tagExecutorRef: import('./telegram/TagExecutor').TagExecutor | null = null  // ADD THIS

// Inside governor.onEvent callback (line 187) — add after existing executorRef forwarding:
executorRef?._handleGovernorEvent(event)
tagExecutorRef?._handleGovernorEvent(event)  // ADD THIS
```

**New imports at top of index.ts** (pattern: mirror lines 17–18):
```typescript
// Add alongside existing IPC imports (lines 17–18 of index.ts):
import { registerTagChannels, emitTagState } from './ipc/tagChannels'
// TagExecutor and TagClient are imported lazily or at top:
import { TagExecutor } from './telegram/TagExecutor'
import { TagClient } from './telegram/tagClient'
```

**TagExecutor construction pattern** (replacing lines 316–334 of index.ts):
```typescript
// REPLACE the IDLE_TAG_STATE stub block (lines 316–334) with:

// Import emitTagState if not already imported above
const tagExecutor = new TagExecutor({
  // tagClient factory: TagExecutor constructs its own ephemeral TagClient per run
  // OR receive a tagClientFactory. Simpler: pass the inner TelegramClient + governor
  // so TagExecutor can call new TagClient({ inner: newTelegramClient(...), governor }) per run.
  // See RESEARCH.md Open Question 1 — passing a factory avoids TagExecutor importing API_ID/API_HASH.
  //
  // Pattern from executor construction (lines 298–307 of index.ts):
  mainClient: client as unknown as Parameters<typeof TagExecutor>[0]['mainClient'],
  governor,
  enumerator,
  resolver,
  auditStore: tagAuditStore,
  onStateChange: (state) => emitTagState(currentWin, state),
})
tagExecutorRef = tagExecutor

registerTagChannels(currentWin, tagExecutor, enumerator, tagAuditStore, () => sm.getState())
```

---

## Shared Patterns

### Generation Token Guard (D-15) — 5 check points
**Source:** `src/main/telegram/RemovalExecutor.ts` lines 207–345
**Apply to:** `TagExecutor.execute()` — all 5 guard points (3 inside loop + 1 post-loop + 1 in retryGroup if implemented)

The guard is a 3-line conditional `if (gen !== this._generation || signal.aborted)` that always:
1. Computes remaining dialogs (set subtraction on already-processed outcomes)
2. Marks each remaining dialog as `{ status: 'skipped', timestamp }` and checkpoints each
3. Calls `this._auditStore.setStatus('stopped')`, sets `_runActive = false`
4. Emits `step: 'stopped'` with accumulated outcomes + summary
5. Returns

**Pitfall (Pitfall 7):** Guard #2 runs BEFORE `auditStore.checkpoint()` — gen can change during the `await _tagGroup()` call and a stale outcome must not be persisted.

### PEER_FLOOD Hard-Stop
**Source:** `src/main/telegram/RemovalExecutor.ts` lines 253–271
**Apply to:** `TagExecutor.execute()` catch block, `TagExecutor._classifyTagError()` re-throw path

```typescript
// classifyRpcError() always runs PEER_FLOOD check first (operationErrors.ts line 83)
// In execute() catch: check classified.disposition === 'hard-stop' → setStatus, emit hard-stopped, return
// In _classifyTagError(): re-throw when classified.disposition === 'hard-stop' (never return outcome for PEER_FLOOD)
// Source: RemovalExecutor.ts lines 639–641
```

### Error Classification Pattern
**Source:** `src/main/telegram/RemovalExecutor.ts` lines 613–649
**Source:** `src/main/telegram/operationErrors.ts` lines 74–146
**Apply to:** `TagExecutor._classifyTagError()`

Branch order (CRITICAL — Pitfall 1):
1. Named RPC strings first (`CHAT_ADMIN_REQUIRED`, `USER_NOT_PARTICIPANT`, etc.)
2. `classifyRpcError(err)` for hard-stop (re-throw) / NETWORK (retry disposition)
3. Fall-through → `UNKNOWN`

### InputPeer Construction (64-bit safe)
**Source:** `src/main/telegram/RemovalExecutor.ts` lines 495–498, 531–539
**Apply to:** `TagExecutor._tagGroup()`

```typescript
// Always: bigInt(entity.id.toString()) — NEVER Number(entity.id) (Pitfall 2)
// Channel: new Api.InputPeerChannel({ channelId, accessHash: channelAccessHash })
// User:    new Api.InputPeerUser({ userId, accessHash })
// User accessHash: bigInt(resolved.accessHash.toString()) — NEVER bigInt.zero (T-05-04-B)
```

### `_emit()` closure pattern
**Source:** `src/main/telegram/RemovalExecutor.ts` lines 97–100

```typescript
// Constructor wires this._emit to update _currentState AND call onStateChange
this._emit = (state) => {
  this._currentState = state
  options.onStateChange(state)
}
// Use this._emit() everywhere — never options.onStateChange() directly
```

### `onStateChange` → IPC push wiring
**Source:** `src/main/ipc/tagChannels.ts` lines 178–182 (`emitTagState`)
**Source:** `src/main/index.ts` lines 303–306 (removal wiring to mirror)

```typescript
// emitTagState is already implemented in Phase 10 — just wire it:
onStateChange: (state) => emitTagState(currentWin, state)
```

### `governor.run()` for main-client reads
**Source:** `src/main/telegram/RemovalExecutor.ts` lines 510–518 (governor-wrapped invoke)
**Apply to:** `TagExecutor._tagGroup()` — already-admin `GetParticipant` call

```typescript
// Main-client reads (GetParticipant) MUST route through governor.run() like all other calls
await this._governor.run(() =>
  this._mainClient.invoke(new Api.channels.GetParticipant({ ... }))
)
// tagClient.invoke() already routes through governor internally — do NOT double-wrap
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| tagClient lifecycle in `execute()` (connect/disconnect) | service | event-driven | No existing executor connects/disconnects a secondary client per run. Pattern is new to Phase 11. |

The per-run `tagClient.connect()` / `tagClient.disconnect()` lifecycle inside `execute()` has no removal analog. The TagClient `connect()` method itself is already implemented (`src/main/telegram/tagClient.ts` lines 93–112). TagExecutor wraps these calls with:
- `await this._tagClient.connect()` — called once at run start, after early-exit guards pass
- `await this._tagClient.disconnect()` — called at ALL terminal paths (complete, stopped, hard-stopped) via `try { ... } finally { await this._tagClient.disconnect() }`

---

## Metadata

**Analog search scope:** `src/main/telegram/`, `src/main/ipc/`, `src/main/storage/`, `src/main/index.ts`, `src/shared/`
**Files scanned:** 9 (RemovalExecutor.ts, removalExecutor.test.ts, tagClient.ts, tagApi.ts, tagChannels.ts, tagTypes.ts, tagAuditStore.ts, operationErrors.ts, index.ts, __mocks__/telegramClient.ts)
**Pattern extraction date:** 2026-06-20
