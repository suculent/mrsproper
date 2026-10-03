# Phase 13: Add Rights & Scan Semantics (Foundation) - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 12 (3 modified-in-place + wiring + mocks + i18n + 3 test files + 4 deleted)
**Analogs found:** 12 / 12 (every file is itself its own best analog — this phase edits existing modules in place; no net-new modules are created)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/shared/groupTypes.ts` | model (shared types) | transform (DTO shape) | itself (existing `GreyReason`/`MembershipStatus`/`AdminDialogDTO` block) | exact — extend in place |
| `src/main/telegram/GroupEnumerator.ts` (`_classifyDialog`/`_buildDTO`) | service (main-process classifier) | transform (entity → DTO, zero new API calls) | itself (existing `canAct` computation, lines 179/203/227) | exact — mirror the existing OR-rule pattern |
| `src/main/telegram/MembershipScanner.ts` (`_checkMembership`) | service (main-process scan) | request-response (single GetParticipant call → status) | itself (existing `className` branch, lines 276-282) | exact — widen return type, split one branch |
| `src/main/telegram/TagExecutor.ts` | service (executor state machine) | event-driven / batch (per-group loop + state emission) | `src/main/telegram/RemovalExecutor.ts` | exact — RemovalExecutor is the single-client, single-loop shape TagExecutor must become |
| `src/main/index.ts` (TagExecutor wiring block, lines ~314-356) | config/wiring (composition root) | event-driven (constructs executor from shared client/governor) | `src/main/index.ts` RemovalExecutor wiring block (lines 297-312) | exact — same file, sibling block to copy the shape from |
| `src/main/telegram/__mocks__/telegramClient.ts` | test double (mock client) | request-response (dispatch by `ctorName`/`className`) | itself — existing `EditBanned`/`DeleteChatUser` dispatch blocks (lines 402-436) | exact — add an `EditChatParticipantRank` case using the same shape |
| `src/renderer/i18n/locales/en/groups.json` / `cs/groups.json` | config (i18n data) | — | itself — existing `greyReason` table | exact — append 4 keys, same table |
| `src/main/telegram/groupEnumerator.test.ts` | test | unit | itself — existing `canAct`/`type detection` describe blocks | exact |
| `src/main/telegram/membershipScanner.test.ts` | test | unit | itself — existing `ChannelParticipantBanned` test (line 152) | exact — replace assertion, add sibling case |
| `src/main/telegram/tagExecutor.test.ts` | test | unit | `src/main/telegram/removalExecutor.test.ts` (`makeExecutor` single-client factory) | exact — `makeTagExecutor`'s two-client fixture collapses to RemovalExecutor's one-client shape |
| `src/main/telegram/tagClient.ts`, `tagClient.test.ts`, `tagApi.ts`, `tagApi.test.ts` | dead code (delete) | — | n/a | n/a — deletion, no analog needed |

## Pattern Assignments

### `src/shared/groupTypes.ts` (model, transform)

**Analog:** itself — `src/shared/groupTypes.ts` lines 12-59 (existing `GreyReason`/`MembershipStatus`/`AdminDialogDTO`)

**Current shape to extend** (verbatim, lines 16-59):
```typescript
export type GreyReason =
  | 'not-creator'
  | 'no-ban-right'
  | 'broadcast-channel'
  | 'not-admin'
  | 'verify-failed'

export interface AdminDialogDTO {
  id: string
  title: string
  avatar: Uint8Array | null
  memberCount: number | null
  type: GroupType
  canAct: boolean
  greyReason: GreyReason | null
}

export type MembershipStatus = 'pending' | 'member' | 'not-member' | 'failed'
```

**Extension pattern (mirror `GreyReason`'s naming/doc-comment style exactly):**
```typescript
export type MembershipStatus = 'pending' | 'member' | 'not-member' | 'banned' | 'failed'

/** Reason an Add-mode row is non-actionable. Separate from GreyReason (removal-only). */
export type AddGreyReason =
  | 'already-member'
  | 'no-invite-right'
  | 'channel-full'
  | 'banned-no-unban-right'

export interface AdminDialogDTO {
  // ...existing fields unchanged...
  canAct: boolean
  greyReason: GreyReason | null
  /** True if the admin can add members here (ADD-04). Computed in GroupEnumerator only. */
  canAdd: boolean
  /** Reason this row is non-actionable in Add mode, or null if canAdd is true. */
  addGreyReason: AddGreyReason | null
}
```
Keep the doc-comment style used for `GroupType`/`GreyReason` (block comment above each type explaining its purpose + which decision ID it backs).

---

### `src/main/telegram/GroupEnumerator.ts` (service, transform — zero new API calls)

**Analog:** itself — the existing `canAct` computation inside `_classifyDialog` (lines 179, 203-204, 219-230) and `_buildDTO` (lines 244-262)

**Core pattern to mirror (basic-group branch, lines 175-191):**
```typescript
const canAct = entity.creator === true || (entity.adminRights as { banUsers?: boolean } | null | undefined)?.banUsers === true
const greyReason: GreyReason | null = canAct ? null : 'not-creator'

return this._buildDTO({
  id,
  title,
  entity,
  type: 'basic-group',
  canAct,
  greyReason,
  memberCount: null,
})
```

**New `canAdd` computation — colocate immediately next to `canAct`, same entity, no new call (D-04/D-05):**
```typescript
const adminRights = entity.adminRights as { inviteUsers?: boolean } | null | undefined
const defaultBanned = entity.defaultBannedRights as { inviteUsers?: boolean } | null | undefined
const canAdd =
  entity.creator === true ||
  adminRights?.inviteUsers === true ||
  defaultBanned?.inviteUsers !== true   // open permissions: not forbidden = any member may invite
```

**Broadcast-channel branch override (D-06) — apply AFTER the base `canAdd` rule, using the same `memberCount` already computed at line 219-220:**
```typescript
let addGreyReason: AddGreyReason | null = canAdd ? null : 'no-invite-right'
if (type === 'broadcast-channel' && memberCount !== null && memberCount >= 200) {
  canAdd = false
  addGreyReason = 'channel-full'
}
```

**`_buildDTO` extension (lines 244-262) — add the two new params/fields in the same place `canAct`/`greyReason` live:**
```typescript
private _buildDTO(params: {
  id: string
  title: string
  entity: Api.Chat | Api.Channel
  type: GroupType
  canAct: boolean
  greyReason: GreyReason | null
  canAdd: boolean
  addGreyReason: AddGreyReason | null
  memberCount: number | null
}): AdminDialogDTO {
  return {
    id: params.id,
    title: params.title,
    avatar: null,
    memberCount: params.memberCount,
    type: params.type,
    canAct: params.canAct,
    greyReason: params.greyReason,
    canAdd: params.canAdd,
    addGreyReason: params.addGreyReason,
  }
}
```

**Pitfall 4 (opportunistic, NOT required by this phase):** the basic-group branch's comment "Api.Chat has no participantsCount in GramJS" (line 189) is stale post-layer-229; do not silently change `memberCount: null` to a real value unless a task explicitly asks for it — out of scope per RESEARCH.md.

---

### `src/main/telegram/MembershipScanner.ts` (service, request-response — one-branch split)

**Analog:** itself — `_checkMembership`'s existing `className` check (lines 276-282)

**Current (collapses both to false):**
```typescript
const className = participant?.className ?? ''
if (className === 'ChannelParticipantLeft' || className === 'ChannelParticipantBanned') {
  return false
}
return true
```

**D-01 split — widen `_checkMembership`'s return type from `Promise<boolean>` to `Promise<MembershipStatus>` (excluding `'pending'`/`'failed'`, which the call sites still own) and split the branch:**
```typescript
if (className === 'ChannelParticipantBanned') {
  const isLeft = (participant as { left?: boolean }).left === true
  return isLeft ? 'not-member' : 'banned'
}
if (className === 'ChannelParticipantLeft') {
  return 'not-member'
}
return 'member'
```
Also update the `catch` branch's `USER_NOT_PARTICIPANT` return (line 286) from `false` to `'not-member'`.

**Pitfall 2 — BOTH call sites must change together (Pitfall from RESEARCH.md, verified both exist):**
- `scan()` line 134-135: `const isMember = await this._checkMembership(...); status = isMember ? 'member' : 'not-member'` → replace with `status = await this._checkMembership(...)` directly (the function now returns the final status).
- `retryGroup()` line 207-208: same ternary, same replacement.

**D-03 scope guard (unchanged branch):** the `dialog.type === 'basic-group'` branch (lines 293-323) returns a plain `boolean` via `participants.some(...)` — this branch stays boolean and the caller must keep converting it (`'member' | 'not-member'` only, never `'banned'`). Recommend the private method return `MembershipStatus` uniformly by doing `return participants.some(...) ? 'member' : 'not-member'` directly at the end of the basic-group branch, matching the channel branch's new return style.

---

### `src/main/telegram/TagExecutor.ts` (service, event-driven/batch — full consolidation)

**Analog:** `src/main/telegram/RemovalExecutor.ts` (entire file is the target shape; TagExecutor must become a tag-flavored copy of its structure)

**Options interface — copy RemovalExecutorOptions' single-client shape (lines 51-64 of RemovalExecutor.ts):**
```typescript
export interface RemovalExecutorOptions {
  client: RemovalExecutorClient
  governor: RateLimitGovernor
  enumerator: GroupEnumerator
  resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string } | null }
  auditStore: AuditStore
  onStateChange: (state: RemovalState) => void
}
```
**Apply to TagExecutor:** delete `tagClientFactory`, `mainClient`, `restoreMainClientLayer` from `TagExecutorOptions`; add a single `client: { invoke(request: unknown): Promise<unknown> }` field (matches `RemovalExecutorClient`'s shape exactly — reuse that same minimal interface pattern, or declare an equivalent `TagExecutorClient`).

**Constructor — mirror RemovalExecutor's flat field assignment (lines 91-101):**
```typescript
constructor(options: RemovalExecutorOptions) {
  this._client = options.client
  this._governor = options.governor
  this._enumerator = options.enumerator
  this._resolver = options.resolver
  this._auditStore = options.auditStore
  this._emit = (state) => {
    this._currentState = state
    options.onStateChange(state)
  }
}
```
**Apply to TagExecutor:** drop `_tagClientFactory`, `_mainClient`, `_restoreMainClientLayer`, `_connectingTagClient` fields entirely; keep `_generation`, `_abortController`, `_runActive` (these guard patterns are unchanged — D-10 only removes the two-client machinery, not the generation/abort/pacing invariants).

**Per-dialog dispatch — mirror RemovalExecutor's single `for` loop with one try/catch per dialog (lines 205-274), replacing TagExecutor's current Phase A/B/C split:**
```typescript
for (const dialog of selectedDialogs) {
  if (gen !== this._generation || signal.aborted) {
    // mark remaining skipped + emit 'stopped' — reuse _markRemainingSkippedAndStop
  }

  this._emit({ step: 'running', /* ... */ currentGroupId: dialog.id, floodWaitRemaining: null })

  let outcome: TagGroupOutcome
  if (dialog.type === 'basic-group') {
    outcome = { dialogId: dialog.id, status: 'skipped', errorCode: 'TAG_UNSUPPORTED_BASIC_GROUP', timestamp: new Date().toISOString() }
  } else {
    try {
      const participantResult = await this._governor.run(() =>
        this._client.invoke(new Api.channels.GetParticipant({ channel: inputChannel, participant: inputUser }))
      ) as { participant?: { className?: string } }

      if (participantResult?.participant?.className === 'ChannelParticipantAdmin') {
        outcome = { dialogId: dialog.id, status: 'skipped', errorCode: 'TAG_TARGET_IS_ADMIN', timestamp: new Date().toISOString() }
      } else {
        await this._governor.run(() =>
          this._client.invoke(new Api.messages.EditChatParticipantRank({ peer: inputPeer, participant: inputUser, rank: params.tag }))
        )
        outcome = { dialogId: dialog.id, status: 'done', timestamp: new Date().toISOString() }
      }
    } catch (err) {
      const classified = classifyRpcError(err)
      if (classified.disposition === 'hard-stop') {
        this._emitHardStopped(outcomes, ctx)   // mirrors RemovalExecutor lines 253-271
        return
      }
      outcome = this._classifyTagError(err, dialog.id)
    }
  }

  // generation guard BEFORE checkpoint (Pitfall 7 — unchanged from RemovalExecutor lines 276-303)
  if (gen !== this._generation || signal.aborted) { /* mark remaining skipped, return */ }

  this._auditStore.checkpoint(dialog.id, outcome)
  outcomes.push(outcome)
  await new Promise<void>(r => setTimeout(r, 2000 + Math.random() * 1000))

  if (gen !== this._generation || signal.aborted) { /* mark remaining skipped, return */ }
}
```
**D-11 — do NOT re-add an "unparseable response = success" catch.** `RemovalExecutor._removeFromGroup` never has such a tolerance (confirms the target pattern); any `catch` around `EditChatParticipantRank` must fall straight into `_classifyTagError`, same as RemovalExecutor's `_classifyRemovalError`.

**`finally` block — RemovalExecutor's `execute()` has NO `finally` block at all** (confirmed by reading the full method, lines 129-360: every exit path inline-resets `_runActive`/emits state, no `finally`). **Apply to TagExecutor:** delete the entire `finally` block (lines 339-359 of current TagExecutor.ts) that calls `tagClient.disconnect()`/`_restoreMainClientLayer()`; reset `_runActive = false` inline at each return path exactly like RemovalExecutor does (lines 142, 155, 220-221, 259, 291, 327-328 pattern).

**Error classification — keep TagExecutor's existing `_classifyTagError` (lines 516-547) almost verbatim; it already mirrors `_classifyRemovalError`'s structure** (hard-stop-first, then named RPC strings, then NETWORK, then UNKNOWN fallthrough) — no analog change needed there, only remove the Phase-labeling comments referencing layer-224.

**Unused imports to remove (Pitfall 6):**
```typescript
import { makeEditChatParticipantRankRequest } from './tagApi'   // DELETE
import type { TagClient } from './tagClient'                     // DELETE
```
Replace the direct-construction write call with `new Api.messages.EditChatParticipantRank({ peer, participant: inputUser, rank: params.tag })` (already imported via `import { Api } from 'telegram'` at the top of TagExecutor.ts, line 36).

---

### `src/main/index.ts` — TagExecutor wiring (config/wiring)

**Analog:** itself — the RemovalExecutor wiring block immediately above it (lines 297-312)

**Target shape to copy (RemovalExecutor wiring, lines 301-310):**
```typescript
const executor = new RemovalExecutor({
  client: client as unknown as ConstructorParameters<typeof RemovalExecutor>[0]['client'],
  governor,
  enumerator,
  resolver,
  auditStore,
  onStateChange: (state) => {
    emitRemovalState(currentWin, state)
  },
})
```

**Apply to TagExecutor wiring (replace lines 318-354):** delete the `tagClientFactory` closure (lines 325-338, the `new TagClient({ inner: new TelegramClient(...) })` block) and the `restoreMainClientLayer` async closure (lines 345-348); replace with:
```typescript
const tagExecutor = new TagExecutor({
  client: client as unknown as ConstructorParameters<typeof TagExecutor>[0]['client'],
  governor,
  enumerator,
  resolver,
  auditStore: tagAuditStore,
  onStateChange: (state) => emitTagState(currentWin, state),
})
```
**Also remove the now-dead top-level imports** (grep confirmed at lines 19-20):
```typescript
import { TagExecutor } from './telegram/TagExecutor'   // KEEP (updated class)
import { TagClient } from './telegram/tagClient'        // DELETE
```
Check for any now-unused `StringSession`/`TelegramClient`/`API_ID`/`API_HASH` imports that were ONLY used by the deleted `tagClientFactory` block — the main client wiring (line ~154, per RESEARCH.md) still needs `TelegramClient`/`StringSession`/`API_ID`/`API_HASH` for its own construction, so these imports likely stay; verify with a grep before removing.

---

### `src/main/telegram/__mocks__/telegramClient.ts` (test double, request-response)

**Analog:** itself — the existing `EditBanned` dispatch block (lines 402-420) and `DeleteChatUser` block (lines 422-436)

**Pattern to copy (EditBanned block, lines 402-420):**
```typescript
if (ctorName === 'EditBanned' || (request as { className?: string })?.className === 'channels.EditBanned') {
  const channelId = (request as { channel?: { channelId?: { toString(): string } } })
    .channel?.channelId?.toString() ?? ''
  // ...record call, check error/success config maps, return {} on success
}
```

**New `EditChatParticipantRank` dispatch — same shape, new config fields:**
```typescript
/** Records each EditChatParticipantRank call for tagExecutor.test.ts assertions. */
editChatParticipantRankCalls?: Array<{ channelId: string; rank: string }>

// inside invoke():
if (ctorName === 'EditChatParticipantRank' || (request as { className?: string })?.className === 'messages.EditChatParticipantRank') {
  const channelId = (request as { peer?: { channelId?: { toString(): string } } }).peer?.channelId?.toString() ?? ''
  const rank = (request as { rank?: string }).rank ?? ''
  _editChatParticipantRankCalls.push({ channelId, rank })
  if (config.tagErrorDialogIds?.[channelId]) {
    const msg = config.tagErrorDialogIds[channelId]!
    throw Object.assign(new Error(msg), { errorMessage: msg })
  }
  return {}
}
```
Initialize `config.editChatParticipantRankCalls = []` in the factory function body (mirrors lines 203-207's `editBannedCalls`/`deleteChatUserCalls` reset pattern) and expose it on the returned `client` object (mirrors lines 525-526).

**Existing `MockClientConfig.getDialogsResult` entries (lines 124-134) need new optional fields for D-04/D-06 tests:**
```typescript
getDialogsResult?: Array<{
  entity: 'Chat' | 'Channel' | 'ChannelBroadcast'
  id: string
  title: string
  megagroup?: boolean
  creator?: boolean
  adminRights?: { banUsers?: boolean; inviteUsers?: boolean }      // add inviteUsers
  defaultBannedRights?: { inviteUsers?: boolean }                   // NEW
  participantsCount?: number                                       // NEW (for D-06 channel-full test)
  migratedTo?: unknown
  deactivated?: boolean
}>
```
Thread these through the `getDialogs` mock implementation (lines 458-470) by adding `defaultBannedRights: d.defaultBannedRights, participantsCount: d.participantsCount` to both `Object.assign(new Api.Chat(...))` and `Object.assign(new Api.Channel(...))` calls, mirroring how `adminRights`/`creator` are already threaded through.

**`GetParticipant` mock (lines 348-358) needs a `ChannelParticipantBanned` case for the new `banned` scan tests:**
```typescript
/** If set, GetParticipant returns ChannelParticipantBanned (with optional left flag) for these dialogIds. */
bannedDialogIds?: Record<string, { left?: boolean }>

// inside the existing GetParticipant block, before the default member return:
if (config.bannedDialogIds?.[channelId]) {
  return { participant: { className: 'ChannelParticipantBanned', left: config.bannedDialogIds[channelId]!.left ?? false } }
}
```

---

### i18n — `src/renderer/i18n/locales/{en,cs}/groups.json` (config data)

**Analog:** itself — the existing `greyReason` table (en: lines 2-8; cs: lines 2-8)

**Pattern — append 4 keys matching the existing tone/formality exactly (D-08/D-09):**
```json
// en/groups.json — inside "greyReason"
"already-member": "Already a member of this group",
"no-invite-right": "You don't have the invite right in this group",
"channel-full": "Channel has reached the 200-member direct-add limit",
"banned-no-unban-right": "You don't have the right to lift this ban"
```
```json
// cs/groups.json — inside "greyReason" (formal vykání, matches existing "Nemáte právo k zákazu v této skupině" tone)
"already-member": "Již je členem této skupiny",
"no-invite-right": "Nemáte právo přidávat členy v této skupině",
"channel-full": "Kanál dosáhl limitu 200 přímo přidaných členů",
"banned-no-unban-right": "Nemáte právo zrušit tento zákaz"
```
Insert alphabetically or append after `verify-failed` — match whichever ordering convention the existing 5 keys follow (current order is not alphabetical, it's conceptual: not-creator → no-ban-right → broadcast-channel → not-admin → verify-failed; append the 4 new keys as a new conceptual group at the end, after `verify-failed`).

---

### `src/main/telegram/groupEnumerator.test.ts` (test, unit)

**Analog:** itself — existing `describe('type detection — Api.Chat entity')` (line 35) and the `canAct=true when entity.creator=true` test (line 48)

**Pattern to copy (structure of an existing canAct test):**
```typescript
it('canAct=true when entity.creator=true', async () => {
  const { enumerator } = makeEnumerator({
    getDialogsResult: [{ entity: 'Chat', id: '1', title: 'G1', creator: true }],
  })
  await enumerator.enumerateAtLogin()
  const loaded = enumerator.getState()
  if (loaded.step === 'loaded') {
    expect(loaded.dialogs[0].canAct).toBe(true)
  }
})
```
**New tests to add, same `makeEnumerator`/assertion style, asserting `canAdd`/`addGreyReason` instead of `canAct`/`greyReason`:**
- `canAdd=true` when `creator===true` (D-04)
- `canAdd=true` when `adminRights.inviteUsers===true` (D-04)
- `canAdd=false` + `addGreyReason='no-invite-right'` when `adminRights.inviteUsers` absent AND `defaultBannedRights.inviteUsers===true` (D-04)
- Basic-group parity test in the `'type detection — Api.Chat entity'` block (D-05)
- Broadcast-channel block (line 171): `canAdd=true` with invite right while `canAct` stays `false` (D-06); `canAdd=false`+`addGreyReason='channel-full'` when `participantsCount >= 200` regardless of invite right (D-06)

---

### `src/main/telegram/membershipScanner.test.ts` (test, unit)

**Analog:** itself — the existing `ChannelParticipantBanned` test (lines 152-167, currently asserting `status === 'not-member'`)

**REPLACE this existing assertion (not purely additive — Pitfall 2 from RESEARCH.md):**
```typescript
// BEFORE (current, line 165):
expect(result?.status).toBe('not-member')

// AFTER (D-01, left unset → banned):
expect(result?.status).toBe('banned')
```
**ADD a sibling test for the `left: true` polarity (resolves/documents Open Question 2's chosen mapping):**
```typescript
it('status=not-member when GetParticipant returns ChannelParticipantBanned with left=true', async () => {
  const dialog = makeDialog('100', 'supergroup')
  const { scanner, states } = makeScanner({
    dialogs: [dialog],
    participantOverrides: { '100': { className: 'ChannelParticipantBanned', left: true } },
  })
  await scanner.scan()
  const complete = states.find(s => s.step === 'complete')
  if (complete?.step === 'complete') {
    expect(complete.results.find(r => r.dialogId === '100')?.status).toBe('not-member')
  }
})
```
**ADD a D-03 negative-assertion test** confirming the basic-group scan path (separate `describe` block, per RESEARCH.md structure) never emits `'banned'` even when configured with `basicGroupParticipants` that exclude the target.

---

### `src/main/telegram/tagExecutor.test.ts` (test, unit — substantial rewrite)

**Analog:** `src/main/telegram/removalExecutor.test.ts` — `makeExecutor` factory (lines 93+) and `makeDialog`/`makeAuditStore` helpers (lines 32-91)

**Target shape (RemovalExecutor's single-client factory pattern — reconstructed from the single-client option shape used at `makeExecutor`'s call into `new RemovalExecutor({...})`):**
```typescript
function makeExecutor(config: {
  dialogs: AdminDialogDTO[]
  removeAlreadyGoneDialogIds?: string[]
  removeErrorDialogIds?: Record<string, string>
  auditStore?: AuditStore
}) {
  // single mock client built via createMockTelegramClient or an inline stub
  // governor + enumerator stub + resolver stub + auditStore
  // new RemovalExecutor({ client, governor, enumerator, resolver, auditStore, onStateChange })
}
```

**Apply to `makeTagExecutor`:** delete the current two-client fixture (lines 97-177: `mockTagClient` with `connect`/`disconnect`/`invoke` spies, `mockMainClient` with its own `invoke` dispatcher, and the `restoreMainClientLayer` spy). Replace with a single `mockClient` object exposing one `invoke` that dispatches BOTH `GetParticipant` (admin pre-check) and `EditChatParticipantRank` (write) by `ctorName`/`className`, matching `__mocks__/telegramClient.ts`'s new dispatch pattern above. Construct via:
```typescript
const executor = new TagExecutor({
  client: mockClient,
  governor,
  enumerator: stubEnumerator as never,
  resolver: stubResolver,
  auditStore,
  onStateChange,
})
return { executor, mockClient, states, auditStore, dialogIds }
```
**D-12 — keep all 10 existing `describe` blocks' behavioral assertions unchanged** (call counts, outcome statuses, skip/fail codes); only the construction fixture and the two-governor-run-call-count expectation (precheck + write, same as before — RESEARCH.md confirms "no behavior change for tagExecutor.test.ts's call-count assertions") need updating.

**D-11 new test — add an `UNKNOWN` outcome test replacing the deleted `tagClient.test.ts`'s "unparseable response" coverage:**
```typescript
it('a parse failure on EditChatParticipantRank surfaces as UNKNOWN (D-11, no swallow)', async () => {
  // mockClient.invoke throws a non-RPC-shaped parse error for EditChatParticipantRank
  // assert outcome.status === 'failed' && outcome.errorCode === 'UNKNOWN'
})
```

---

## Shared Patterns

### Rights computed in main only (CLAUDE.md invariant, T-04-01)
**Source:** `src/main/telegram/GroupEnumerator.ts` `_classifyDialog`/`_buildDTO` (existing `canAct` pattern)
**Apply to:** `canAdd`/`addGreyReason` computation — same method, same entity fields, zero new IPC surface. Never derive rights in `src/renderer/**`.

### Governor-wrapped Telegram calls, single shared client
**Source:** `src/main/telegram/RemovalExecutor.ts` lines 548-559 / 563-591 (every `client.invoke()` wrapped in `this._governor.run(() => ...)`)
**Apply to:** The consolidated `TagExecutor`'s `GetParticipant` precheck and `EditChatParticipantRank` write — both become `this._governor.run(() => this._client.invoke(...))` calls on the one shared client, exactly like RemovalExecutor's `EditBanned`/`DeleteChatUser` calls.

### Generation-token guard + per-group checkpoint + inter-group pacing
**Source:** `src/main/telegram/RemovalExecutor.ts` lines 205-340 (the full `for` loop: guard → emit running → try/catch → guard before checkpoint → checkpoint → pacing sleep → guard after pacing)
**Apply to:** TagExecutor's consolidated loop body — structurally identical, only the per-group work (GetParticipant + EditChatParticipantRank vs EditBanned/DeleteChatUser) differs.

### PEER_FLOOD hard-stop ordering
**Source:** `src/main/telegram/RemovalExecutor.ts` `_classifyRemovalError` (lines 613-649) — `classifyRpcError(err).disposition === 'hard-stop'` checked and re-thrown BEFORE any named-string mapping
**Apply to:** TagExecutor's existing `_classifyTagError` already follows this ordering (lines 516-523) — preserve verbatim when consolidating.

### Mock client request dispatch by ctorName/className
**Source:** `src/main/telegram/__mocks__/telegramClient.ts` lines 402-436 (`EditBanned`/`DeleteChatUser` blocks — `ctorName === 'X' || className === 'y.X'` guard, then record call, check config-driven error maps, return `{}` on success)
**Apply to:** The new `EditChatParticipantRank` mock case and any `canAdd`/`banned`-related `getDialogsResult`/`GetParticipant` extensions.

### i18n greyReason table conventions
**Source:** `src/renderer/i18n/locales/en/groups.json` / `cs/groups.json` lines 2-8
**Apply to:** The 4 new `AddGreyReason` keys — same object (`greyReason`), same short-factual English / formal-vykání Czech tone.

## No Analog Found

None. Every file in this phase's scope is an in-place modification of an existing, already-patterned module, or a deletion. No net-new module requires an external analog search.

## Metadata

**Analog search scope:** `src/shared/groupTypes.ts`, `src/main/telegram/{GroupEnumerator,MembershipScanner,TagExecutor,RemovalExecutor}.ts`, `src/main/telegram/__mocks__/telegramClient.ts`, `src/main/index.ts`, `src/renderer/i18n/locales/{en,cs}/groups.json`, `src/main/telegram/{groupEnumerator,membershipScanner,tagExecutor,removalExecutor}.test.ts`
**Files scanned:** 11 read in full + 2 targeted test-file greps/reads
**Pattern extraction date:** 2026-10-03
