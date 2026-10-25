# Phase 13: Add Rights & Scan Semantics (Foundation) - Research

**Researched:** 2026-10-03
**Domain:** Main-process Telegram rights computation (GramJS/MTProto, TL layer 229) + dead-code removal in an existing executor
**Confidence:** HIGH

## Summary

This phase is almost entirely a **data-modeling and cleanup** phase, not a new-integration phase. Every piece of Telegram data it needs (`creator`, `adminRights.inviteUsers`, `defaultBannedRights.inviteUsers`, `bannedRights.inviteUsers`, `participantsCount`) is **already present on the same `Api.Chat`/`Api.Channel` entity objects** that `GroupEnumerator._classifyDialog` already holds in memory — confirmed by reading the generated layer-229 `node_modules/telegram/tl/api.d.ts` directly. No new Telegram API call is required to compute `canAdd` (ADD-04) or the `channel-full` pre-check (D-06). The membership-scan change (D-01) is a one-branch split of an existing `className` check in `MembershipScanner._checkMembership` that already runs today. The only code-deletion work (TAG-07) is removing an entire architecture layer (`tagClient.ts`, `tagApi.ts`, the Phase A/B/C two-phase split in `TagExecutor.ts`) that quick-task `261003-jni` already made functionally obsolete by moving the whole GramJS package to TL layer 229 — this phase just finishes the cleanup that task's summary explicitly deferred.

Two of the three "folded todos" listed in `13-CONTEXT.md` turn out to be **already shipped**: `git log` shows commit `be492cc` ("fix(04-09): apply CountryPicker folded todos — CZ default and cmdk shouldFilter fix") already set `DEFAULT_COUNTRY` to `CZ` and added `shouldFilter={false}` to the `<Command>` root in `CountryPicker.tsx`. The `.planning/todos/pending/` files are stale and should be verified/closed rather than re-implemented.

**Primary recommendation:** Extend `AdminDialogDTO` with `canAdd: boolean` and a new `addGreyReason: AddGreyReason | null` field (separate from the existing removal-only `GreyReason`), compute both inside `GroupEnumerator._classifyDialog` from data already on the entity (zero new API calls), extend `MembershipStatus` with `'banned'` in `MembershipScanner`, and collapse `TagExecutor` into a single-client, single-loop state machine that mirrors `RemovalExecutor.ts` exactly — issuing the now-generated `Api.messages.EditChatParticipantRank` directly through the shared `client` + `governor.run()`, with `tagClient.ts`/`tagApi.ts` and their tests deleted outright.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `canAdd` rights computation | API/Backend (main process, `GroupEnumerator`) | — | Rights are read from the raw Telegram entity; renderer must never derive rights (CLAUDE.md invariant, ADD-04) |
| `channel-full` (≥200 subscriber) pre-check | API/Backend (`GroupEnumerator`) | — | `participantsCount` lives on the same entity already classified there; no separate call |
| Banned-vs-not-member scan status | API/Backend (`MembershipScanner`) | — | Requires the live `channels.GetParticipant` response, which only the main process can issue (session, governor) |
| Add-mode grey-reason copy | Shared types (`src/shared/groupTypes.ts`) + i18n (both processes read, renderer displays) | Renderer (Phase 15 consumes) | Types are the single source of truth across the IPC boundary; copy is bilingual data, not logic |
| Tag write dispatch (`EditChatParticipantRank`) | API/Backend (`TagExecutor`, shared `client` + `governor`) | — | Must route through the same governed, single-session client as removal (account-wide throttling invariant) |
| Renderer grey/sort logic for Add mode | Renderer (Phase 15) | — | Explicitly out of scope for Phase 13 ("no renderer changes yet" per phase goal) |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ban-aware scan status**
- **D-01:** Extend `MembershipStatus` with a distinct `banned` value. For supergroups/channels the scanner maps `ChannelParticipantBanned` with `left` unset → `banned`, `ChannelParticipantLeft` (and `USER_NOT_PARTICIPANT`) → `not-member`. Remove mode treats `banned` exactly like `not-member` (nothing shipped changes); Add mode treats it as "needs unban first".
- **D-02:** A banned row is actionable in Add mode **only when the admin holds the ban right** in that group (the same right removal uses). Otherwise it is greyed with the `banned-no-unban-right` reason. No doomed runs.
- **D-03:** Unban-first applies to supergroups and channels only. Basic groups cannot reveal bans via `messages.GetFullChat`; they keep `member` / `not-member`, `messages.AddChatUser` is attempted directly in Phase 14, and a `USER_KICKED` refusal is reported there.

**canAdd rule**
- **D-04:** `canAdd = creator || adminRights.inviteUsers === true || defaultBannedRights.inviteUsers !== true` (open permissions: any member may invite). Computed in `GroupEnumerator` only; the renderer never derives rights.
- **D-05:** The identical rule applies to basic groups (`Api.Chat` exposes the same `creator` / `adminRights` / `defaultBannedRights` fields). Migrated and deactivated basic-group husks stay filtered out as today.
- **D-06:** Broadcast channels are included: `canAdd` follows D-04, while `canAct` (removal) stays `false` with the existing `broadcast-channel` reason. A broadcast channel whose known `participantsCount` is ≥ 200 is greyed **up front** with the `channel-full` reason (Telegram refuses direct adds past 200 subscribers; the invite-link fallback in Phase 14 covers those).

**Add-mode grey reasons**
- **D-07:** Groups the target is already in stay **visible, greyed, sorted below** actionable rows in Add mode (mirrors Remove mode's not-member rows), with the `already-member` reason.
- **D-08:** Four specific reason codes: `already-member`, `no-invite-right`, `channel-full`, `banned-no-unban-right`. Each gets its own English and Czech line in the groups i18n namespace (`greyReason` table), consistent in tone with the existing removal reasons.
- **D-09:** Claude drafts the English and Czech copy (formal vykání, short factual lines, e.g. "You don't have the invite right in this group" / "Nemáte právo přidávat členy v této skupině"); the user reviews it at UAT.

**TagExecutor cleanup (TAG-07)**
- **D-10:** **Full consolidation.** Delete `src/main/telegram/tagClient.ts`, `tagApi.ts` and their tests. `TagExecutor` issues the generated `Api.messages.EditChatParticipantRank` on the **main client** through `governor.run()`. Remove the Phase A/B/C two-phase ordering, the `tagClientFactory` and `restoreMainClientLayer` options, the reconnect mutex, and every layer-224 comment; drop the corresponding wiring in `src/main/index.ts`.
- **D-11:** Remove the "unparseable `Updates` response counts as success" tolerance. At layer 229 the response parses; a parse failure is a real error and surfaces as an `UNKNOWN` per-group failure.
- **D-12:** Tag writes stay **unconditional** (one write per selected group) even though the existing `rank` is now readable. Behaviour is identical to v1.6; `tagExecutor.test.ts` is adapted to the single-client shape with the same behavioural assertions.

### Claude's Discretion
- Exact shape of the DTO extension (e.g. `canAdd: boolean` + `addGreyReason: AddGreyReason | null` on `AdminDialogDTO` vs. a nested rights object), the `AddGreyReason` type name, and whether the scan result type gains the `banned` value directly or via a widened union.
- Whether the scanner also checks the admin's own `bannedRights.inviteUsers` restriction on their participant record (recommended if cheap; otherwise the server error is handled in Phase 14).
- Internal decomposition of `GroupEnumerator._classifyDialog` to compute both `canAct` and `canAdd` without duplicating the rights parsing.

### Deferred Ideas (OUT OF SCOPE)
- Skipping the tag write when the group already carries the identical tag (rank is readable at layer 229) — user chose unconditional writes for now; candidate for a later tag-polish phase alongside TAG-08/TAG-09.
- Keeping an "unparseable response" tolerance as defence in depth — rejected for this phase; the schema refresh step (`npm run tl:update`) is the intended mitigation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADD-02 | Add-mode checklist inverts: not-member groups actionable/pre-checked; already-member and no-invite-right groups greyed with cause-specific reason | `canAdd`/`addGreyReason` DTO extension (D-04–D-08) computed in `GroupEnumerator`; `banned` scan status (D-01) lets Phase 15 distinguish "already a member" from "not a member, banned, no unban right" per success criterion 3 |
| ADD-03 | Broadcast channels actionable in Add mode when admin holds invite right | D-06 rule + the verified `Api.Channel.bannedRights`/`adminRights`/`defaultBannedRights` fields (see Code Examples); `channel-full` pre-check at ≥200 `participantsCount` |
| ADD-04 | Each dialog carries a main-process-computed `canAdd` flag; renderer never derives rights | D-04/D-05 rule implemented inside `GroupEnumerator._classifyDialog`, mirroring the existing `canAct` computation exactly (same method, same entity, no new API call) |
| TAG-07 | TagExecutor no longer performs two-phase layer isolation; stale layer-224 comments removed; behaviour/tests unchanged | D-10/D-11/D-12 — confirmed `Api.messages.EditChatParticipantRank` (CONSTRUCTOR_ID `0xa00f32b0`) is now a first-class generated class in the layer-229 package, so the hand-rolled `tagApi.ts` serializer is no longer needed either |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack is Electron + GramJS in-process, TypeScript, single runtime** — no new runtime/process boundary may be introduced for this phase's work (confirmed: everything needed lives in the existing `GroupEnumerator`/`MembershipScanner`/`TagExecutor` main-process classes).
- **Rights are computed in main only; DTOs crossing IPC carry no `accessHash`** — the existing `AdminDialogDTO` pattern (no `accessHash` field) must be preserved when adding `canAdd`/`addGreyReason`.
- **All Telegram calls route through the shared `RateLimitGovernor`** with FLOOD_WAIT/PEER_FLOOD handling — the consolidated `TagExecutor` must keep calling `governor.run()` around every `client.invoke()`, exactly like `RemovalExecutor`.
- **Sequential-only execution; no parallel ("blast") calls** — not directly exercised by this phase (no new executor loop beyond simplifying the existing one), but the consolidated `TagExecutor` must not reintroduce any concurrency.
- **Session credentials encrypted at rest; shared `api_id`/`api_hash`** — unaffected by this phase.
- **GSD workflow enforcement** — this research feeds `/gsd:plan-phase`; no direct file edits should occur outside that workflow.

## Standard Stack

No new external packages are introduced by this phase. It operates entirely on the existing, already-verified stack:

| Library | Version (as installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `telegram` (GramJS) | `2.26.22` in `package.json`, but `node_modules/telegram` is patched to **TL layer 229** at `postinstall` via `scripts/tl-apply.mjs` from the git-tracked `vendor/telegram-api.tl` | MTProto User API client | Already the project's sole Telegram client; `Api.messages.EditChatParticipantRank`, `Api.ChatAdminRights`, `Api.ChatBannedRights`, `Api.ChannelParticipantBanned` all verified present in the generated `.d.ts` at the versions this phase needs |
| `big-integer` | `^1.6.52` | bigint-safe Telegram IDs | Already used throughout `GroupEnumerator`/`MembershipScanner`/`TagExecutor`/`RemovalExecutor` |
| `vitest` | project devDependency (see `package.json`) | Test runner (`npm test` → `vitest run`) | Already the project's only test framework; every existing `.test.ts` in `src/main/telegram/` uses it |

**Installation:** None required — no `npm install` step for this phase.

**Version verification performed:**
```bash
$ grep -c "exports.LAYER = 229" node_modules/telegram/tl/AllTLObjects.js   # => 1 (confirmed by quick 261003-jni)
$ grep -n "export class EditChatParticipantRank" node_modules/telegram/tl/api.d.ts
    export class EditChatParticipantRank extends Request<Partial<{
      peer: Api.TypeEntityLike; participant: Api.TypeEntityLike; rank: string;
    }>, Api.TypeUpdates> { CONSTRUCTOR_ID: 2685350576 /* = 0xa00f32b0 */; ... }
```
`2685350576` decimal = `0xa00f32b0` — matches the hand-rolled `tagApi.ts` constructor id exactly and matches `tlLayer.test.ts`'s existing assertion. `[VERIFIED: node_modules/telegram/tl/api.d.ts — local package inspection]`

## Package Legitimacy Audit

**Not applicable.** This phase installs no new external packages — it only computes new fields from data already returned by the existing, already-audited `telegram` dependency and deletes two internal modules (`tagClient.ts`, `tagApi.ts`). No `npm view`/slopcheck gate is required.

## Architecture Patterns

### System Architecture Diagram

```
                       ┌─────────────────────────────────────────┐
                       │          Main process (Electron)          │
                       │                                           │
  Telegram servers     │  client.getDialogs() ──► GroupEnumerator   │
  (MTProto, layer 229) │       │                  ._classifyDialog  │
        ▲    │          │       │                  ├─ canAct (existing, removal)
        │    │          │       │                  └─ canAdd + addGreyReason (NEW, D-04..D-06)
        │    ▼          │       ▼                                   │
        │  GetParticipant/GetFullChat ──► MembershipScanner          │
        │                │      ._checkMembership                    │
        │                │        └─ member | not-member | banned(NEW,D-01) | failed
        │                │                                           │
        │  EditChatParticipantRank ──► TagExecutor (CONSOLIDATED)    │
        └────────────────┘        single client + governor.run()    │
                       │        (no tagClient, no layer juggling)    │
                       │                                           │
                       │  AdminDialogDTO[] / ScanState ──► IPC ──►  │  (unchanged channels)
                       └─────────────────────────────────────────┘
                                          │
                                          ▼
                       Renderer (NO CHANGES in this phase — Phase 15 consumes
                       canAdd / addGreyReason / banned status)
```

### Recommended Project Structure

No new files/directories. Changes land inside existing modules:

```
src/
├── shared/
│   └── groupTypes.ts         # extend MembershipStatus, AdminDialogDTO, add AddGreyReason
├── main/telegram/
│   ├── GroupEnumerator.ts     # add canAdd/addGreyReason computation in _classifyDialog/_buildDTO
│   ├── MembershipScanner.ts   # split ChannelParticipantBanned branch out of the existing false-return
│   ├── TagExecutor.ts         # collapse to single-client loop mirroring RemovalExecutor.ts
│   ├── tagClient.ts           # DELETE (D-10)
│   ├── tagClient.test.ts      # DELETE (D-10)
│   ├── tagApi.ts              # DELETE (D-10)
│   ├── tagApi.test.ts         # DELETE (D-10)
│   └── __mocks__/telegramClient.ts  # add EditChatParticipantRank handler + canAdd/banned mock controls
├── main/index.ts              # remove tagClientFactory / restoreMainClientLayer wiring
└── renderer/
    ├── i18n/locales/{en,cs}/groups.json  # 4 new greyReason keys (D-08/D-09)
    └── auth/CountryPicker.tsx            # ALREADY DONE (see Pitfall "stale folded todos" below)
```

### Pattern 1: `canAdd` computed alongside `canAct` with zero new API calls

**What:** Both rights flags are pure functions of the same `Api.Chat`/`Api.Channel` entity object `GroupEnumerator` already holds after `getDialogs()`.
**When to use:** Inside `_classifyDialog`, immediately next to the existing `canAct` computation, so the two rights blocks stay colocated and the entity-field parsing isn't duplicated.
**Verified field shapes** (`[VERIFIED: node_modules/telegram/tl/api.d.ts]`):

```typescript
// Api.Chat (basic group) — layer 229, confirmed fields:
export class Chat {
  creator?: boolean
  id: long
  participantsCount: int          // NOT optional — directly on Chat, not just ChatFull
  adminRights?: Api.TypeChatAdminRights
  defaultBannedRights?: Api.TypeChatBannedRights
  migratedTo?: Api.TypeInputChannel
  deactivated?: boolean
}

// Api.Channel (supergroup/broadcast) — layer 229, confirmed fields:
export class Channel {
  creator?: boolean
  megagroup?: boolean
  broadcast?: boolean
  adminRights?: Api.TypeChatAdminRights
  bannedRights?: Api.TypeChatBannedRights       // the ADMIN'S OWN restriction in this channel
  defaultBannedRights?: Api.TypeChatBannedRights
  participantsCount?: int
}

// Api.ChatAdminRights — confirmed field name:
export class ChatAdminRights { inviteUsers?: boolean; banUsers?: boolean; /* ... */ }

// Api.ChatBannedRights — confirmed field name (note: `true` means FORBIDDEN):
export class ChatBannedRights { inviteUsers?: boolean; /* true = members CANNOT invite */ }
```

Implementation sketch for `GroupEnumerator.ts` (mirrors the existing `canAct` pattern at lines 179/203):

```typescript
// D-04/D-05: identical rule for Api.Chat and Api.Channel
function computeCanAdd(entity: Api.Chat | Api.Channel): boolean {
  const adminRights = entity.adminRights as { inviteUsers?: boolean } | null | undefined
  const defaultBanned = entity.defaultBannedRights as { inviteUsers?: boolean } | null | undefined
  return (
    entity.creator === true ||
    adminRights?.inviteUsers === true ||
    defaultBanned?.inviteUsers !== true   // open permissions: not forbidden = any member may invite
  )
}

// D-06: broadcast channel ≥200 subscriber pre-check, applied AFTER computeCanAdd
function applyChannelFullOverride(
  canAdd: boolean, type: GroupType, memberCount: number | null
): { canAdd: boolean; addGreyReason: AddGreyReason | null } {
  if (type === 'broadcast-channel' && memberCount !== null && memberCount >= 200) {
    return { canAdd: false, addGreyReason: 'channel-full' }
  }
  return { canAdd, addGreyReason: canAdd ? null : 'no-invite-right' }
}
```

**Claude's Discretion resolved:** the admin's own `bannedRights.inviteUsers` restriction (mentioned as a discretionary nice-to-have) is **cheaply available with zero extra calls** — `entity.bannedRights` is a field directly on the same `Api.Channel` object returned by `getDialogs()` (confirmed above). Recommend folding `entity.bannedRights?.inviteUsers !== true` into the `canAdd` rule as an additional AND-condition for channel types (basic groups' `Api.Chat` has no equivalent per-viewer `bannedRights` field in the schema — only `adminRights`/`defaultBannedRights` — so this extra check is channel-only). `[ASSUMED]` — this field's semantics (self-restriction vs. something else) should be spot-checked against a live account with a per-user restriction during implementation; Telegram's public docs describe the analogous `channels.channel.banned_rights` field as "restrictions imposed on *this* user in this channel," which matches the intended use, but no live empirical test was run in this research session.

### Pattern 2: `banned` membership status — one-branch split of an existing check

**What:** `MembershipScanner._checkMembership` already inspects `participant.className` after a *successful* `channels.GetParticipant` call (line 279 in current code) and returns `false` for both `ChannelParticipantLeft` and `ChannelParticipantBanned`. D-01 only requires separating those two cases.
**Verified field shape** (`[VERIFIED: node_modules/telegram/tl/api.d.ts]`):

```typescript
export class ChannelParticipantBanned {
  left?: boolean
  peer: Api.TypePeer
  kickedBy: long
  bannedRights: Api.TypeChatBannedRights
  rank?: string
}
```

```typescript
// Current (collapses both to false):
if (className === 'ChannelParticipantLeft' || className === 'ChannelParticipantBanned') {
  return false
}

// D-01 (split): participant is typed, so `left` is available on the Banned branch
if (className === 'ChannelParticipantBanned') {
  const isLeft = (participant as { left?: boolean }).left === true
  return isLeft ? 'not-member' : 'banned'   // function now returns MembershipStatus, not boolean
}
if (className === 'ChannelParticipantLeft') {
  return 'not-member'
}
// (USER_NOT_PARTICIPANT in the catch block already maps to 'not-member' today — unchanged)
```

Note this requires widening `_checkMembership`'s return type from `boolean` to `MembershipStatus` (or an equivalent discriminator) since `scan()`/`retryGroup()` currently do `status = isMember ? 'member' : 'not-member'` — both call sites need the three-way branch now.

D-03 scope: this split applies **only** to the `dialog.type === 'supergroup' || dialog.type === 'broadcast-channel'` branch. The `dialog.type === 'basic-group'` branch (which scans `messages.GetFullChat().fullChat.participants`) is untouched — it has no way to see a ban and must keep emitting `member`/`not-member` only.

### Pattern 3: Consolidated `TagExecutor` — single client, single loop (mirrors `RemovalExecutor`)

**What:** D-10 removes the entire Phase A/B/C split. The generated `Api.messages.EditChatParticipantRank` class (confirmed above) is invoked exactly like `Api.channels.EditBanned` is invoked in `RemovalExecutor._removeFromGroup` — through the shared `client` + `governor.run()`, no second client, no connect/disconnect lifecycle, no `_connectingTagClient` mutex.

```typescript
// TagExecutorOptions AFTER consolidation (compare to RemovalExecutorOptions):
export interface TagExecutorOptions {
  client: { invoke(request: unknown): Promise<unknown> }   // was: tagClientFactory + mainClient
  governor: RateLimitGovernor
  enumerator: GroupEnumerator
  resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string } | null }
  auditStore: TagAuditStore
  onStateChange: (state: TagState) => void
  // tagClientFactory: REMOVED
  // restoreMainClientLayer: REMOVED
}

// Per-dialog dispatch, folded into ONE loop (no separate pre-scan phase):
for (const dialog of selectedDialogs) {
  // generation/abort guard (unchanged pattern)
  if (dialog.type === 'basic-group') {
    outcome = { status: 'skipped', errorCode: 'TAG_UNSUPPORTED_BASIC_GROUP', ... }
  } else {
    const participantResult = await this._governor.run(() =>
      this._client.invoke(new Api.channels.GetParticipant({ channel: inputChannel, participant: inputUser }))
    )
    if (participantResult?.participant?.className === 'ChannelParticipantAdmin') {
      outcome = { status: 'skipped', errorCode: 'TAG_TARGET_IS_ADMIN', ... }
    } else {
      try {
        await this._governor.run(() =>
          this._client.invoke(new Api.messages.EditChatParticipantRank({ peer, participant: inputUser, rank: params.tag }))
        )
        outcome = { status: 'done', ... }
      } catch (err) {
        // NO isUnparseableUpdatesResponse() catch (D-11) — a parse failure is now a real error
        outcome = this._classifyTagError(err, dialog.id)   // falls through to UNKNOWN as today
      }
    }
  }
  // checkpoint, pace, generation guard — unchanged
}
```

Two separate `governor.run()` calls per eligible dialog (precheck + write) is the same call-count the current two-phase version already makes — no behavior change for `tagExecutor.test.ts`'s call-count assertions, only the removal of the connect/disconnect/layer-restore scaffolding around them.

**`finally` block simplifies to nothing tagClient-specific** — no `tagClient.disconnect()`, no `restoreMainClientLayer()` call. Only the generation/run-active flag resets remain (mirrors `RemovalExecutor`'s `finally`-free structure — note `RemovalExecutor` doesn't even need a `finally` block, which is a good signal the consolidated `TagExecutor` can drop its `finally` too, or keep a minimal one solely for `_runActive`/`_connectingTagClient` resets if those flags survive).

### Anti-Patterns to Avoid
- **Reintroducing any form of per-connection layer mutation** — `node_modules/telegram` is now pinned to layer 229 globally via `postinstall`; there is no remaining reason for any code to read or write `AllTLObjects.LAYER`. `tlLayer.test.ts` already guards against drift.
- **Computing `canAdd` or `addGreyReason` in the renderer** — violates ADD-04 and the CLAUDE.md "rights computed in main only" invariant. The renderer (Phase 15) must only branch on the DTO fields.
- **Treating `ChannelParticipantBanned` as an error path** — it is a successful `GetParticipant` response with a specific `className`, not a thrown RPC error (confirmed both by the schema and by the already-shipped, already-tested code path).
- **Keeping the "unparseable Updates = success" swallow** in the new direct `client.invoke()` call — D-11 explicitly forbids this; let it surface as `UNKNOWN`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serializing `messages.editChatParticipantRank` | A hand-rolled TL request object (the old `tagApi.ts` approach, necessary only because GramJS 2.26.22's stock schema lacked the method) | The generated `Api.messages.EditChatParticipantRank` class, now present in the layer-229-patched package | Confirmed present with the exact constructor id (`0xa00f32b0`) the hand-rolled version targeted — the vendor-patch step already solved this; hand-rolling it again would be pure regression |
| Detecting whether a participant is banned | A second, separate RPC call or heuristic timestamp comparison | The `className` discriminator already returned by the existing `channels.GetParticipant` call (`ChannelParticipantBanned` vs `ChannelParticipantLeft`) | Zero marginal API cost; the call is already made for every dialog during a scan |
| Checking whether the admin can invite | A fresh `channels.GetParticipantRequest` for the admin's own account | `entity.adminRights` / `entity.defaultBannedRights` / `entity.bannedRights`, all already present on the dialog entity from `getDialogs()` | Confirmed fields on `Api.Chat`/`Api.Channel`; an extra per-dialog self-lookup would reintroduce the exact "serialize through the governor per-group" cost the module's own avatar-deferral comment already warns against |

**Key insight:** This phase's entire value is in *not* making new network calls — every rights fact it needs is already sitting in objects the codebase fetches today. The main implementation risk is therefore not "how do I get this data" but "don't accidentally duplicate a fetch that already happened."

## Runtime State Inventory

> TAG-07 is a refactor/deletion of connection logic, not a rename, so this is a lightweight pass through the five categories rather than a rename audit.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `tag-job.json` (`TagJobFile` schema) is **unchanged** by this phase — `TagGroupOutcome`/`TagErrorCode`/job shape per D-12 stay identical; a job file written by the pre-consolidation code and one written after remain structurally compatible. None — verified by reading `src/shared/tagTypes.ts`, which this phase does not need to touch. |
| Live service config | None — no n8n/Datadog/Tailscale-style external service config exists in this project; Telegram-side state (the admin's actual rights) is read live on every run, never cached outside the process. None — verified by project scope (desktop app, no external service integrations). |
| OS-registered state | None — no Task Scheduler/launchd/pm2 registrations reference `tagClient`/`tagApi` by name. None — verified; this is a portable Electron app with no OS-level service registration. |
| Secrets/env vars | None — `tagClientFactory` reused `API_ID`/`API_HASH` and the existing session string; deleting it removes a *consumer* of those secrets, not the secrets themselves. `MRSPROPER_API_ID`/`MRSPROPER_API_HASH` remain required exactly as before. None — verified by reading `src/main/index.ts`'s `tagClientFactory` block (lines 325–338). |
| Build artifacts | `tagClient.ts`/`tagApi.ts` and their `.test.ts` files are the only artifacts of the old architecture; deleting the source files is sufficient — no compiled `.d.ts`/dist output is git-tracked (see `.gitignore:42` — `src/**/*.d.ts` is ignored), and no `npm` package needs reinstalling. None beyond the source deletions themselves — verified via `.gitignore` inspection. |

**Nothing found requiring data migration** — this phase's TAG-07 work is a pure code-structure simplification with an unchanged on-disk schema.

## Common Pitfalls

### Pitfall 1: Stale "folded todos" — do not re-implement already-shipped fixes
**What goes wrong:** `13-CONTEXT.md` folds in two pending todo files (`2026-06-11-default-country-czechia.md`, `2026-06-11-country-picker-rows-clickable.md`) as if they were still open work for this phase.
**Why it happens:** The todo files in `.planning/todos/pending/` were never moved/archived after the fix landed in commit `be492cc` ("fix(04-09): apply CountryPicker folded todos — CZ default and cmdk shouldFilter fix", 2026-06-13 era, well before this phase was scoped).
**How to avoid:** `src/renderer/auth/CountryPicker.tsx` **already** has `DEFAULT_COUNTRY = COUNTRY_OPTIONS.find((c) => c.code === 'CZ')` (line 72) and `<Command shouldFilter={false}>` (line 123). The plan should include a verification-only task (confirm both behaviors still work, e.g. via a quick manual check or an existing test) and then move/delete the two stale files under `.planning/todos/pending/` — not a re-implementation task.
**Warning signs:** If a plan task description says "change `DEFAULT_COUNTRY` to `CZ`" or "add `shouldFilter={false}`", that's a sign the planner read the todo file instead of the current source.

### Pitfall 2: Renaming/returning a different type from `_checkMembership` breaks two call sites silently
**What goes wrong:** `MembershipScanner._checkMembership` is called from both `scan()` and `retryGroup()`, and both currently do `status = isMember ? 'member' : 'not-member'` on its `Promise<boolean>` return. If `_checkMembership` is changed to return `MembershipStatus` directly (recommended, since `boolean` can't express `banned`), both call sites' ternaries must be removed/adjusted, or `banned` will never surface at either entry point.
**Why it happens:** The two call sites are >100 lines apart in the file and easy to update one at a time.
**How to avoid:** Grep `_checkMembership(` for all call sites before considering the change complete; update both `scan()` and `retryGroup()` together in the same task.
**Warning signs:** `membershipScanner.test.ts`'s existing `ChannelParticipantBanned` test (line 152, currently asserting `isMember=false`) will need its assertion updated to `status === 'banned'` — if that test still passes unmodified after the change, the split didn't actually take effect.

### Pitfall 3: `MembershipStatus` exhaustiveness — investigated, confirmed LOW risk
**What was checked:** Every renderer consumer of `MembershipStatus` (`GroupRow.tsx` line 114–116, `GroupsPane.tsx` line 112–152) was greped. **None use an exhaustive `switch` statement** — all are `===` comparisons with implicit `else`/fallthrough branches (e.g. `membershipStatus === 'member'`, `status === 'member' || status === null`). Adding `'banned'` to the `MembershipStatus` union will **not** cause a TypeScript compile error anywhere in the current renderer code; `'banned'` rows will simply fall into the existing "non-actionable" bucket in `GroupsPane.tsx`'s Remove-mode partition logic (`else { nonActionable.push(dialog) }`), which matches D-01's requirement that Remove mode treat `banned` exactly like `not-member`.
**Residual risk:** None currently, but flag for the planner: if Phase 15 later adds an exhaustive switch for Add-mode-specific UI, it must include the `banned` case explicitly.

### Pitfall 4: `Api.Chat.participantsCount` comment is now stale
**What goes wrong:** `GroupEnumerator._classifyDialog`'s basic-group branch currently comments "Api.Chat has no participantsCount in GramJS — it's on the full chat object" and hardcodes `memberCount: null`. This was true for GramJS 2.26.22's stock (layer 198) schema but **the layer-229-patched `Api.Chat` now has `participantsCount: int`** directly on the dialog entity (confirmed in `node_modules/telegram/tl/api.d.ts`).
**Why it happens:** The comment predates the TL-229 migration (quick task 261003-jni) and was never revisited.
**How to avoid:** Out of Phase 13's explicit scope (D-05 only requires the `canAdd` rule, not `memberCount` for basic groups), but flag it as a low-cost opportunistic fix if the planner wants to also populate `memberCount` for basic groups while touching this exact code block — **do not** silently change it without a task, since it alters `AdminDialogDTO.memberCount` output for a type that currently always reports `null`, which could affect existing UI sort-by-size behavior for basic groups.

### Pitfall 5: `ChannelParticipantBanned.left` semantics need a live-account sanity check
**What goes wrong:** D-01 maps `left` **unset** (falsy) → `banned` and implies `left` **set** (true) falls into the `not-member` bucket (grouped with `ChannelParticipantLeft`). Telegram's own documentation is not fully explicit about whether a classic "kick + ban" (removed and blocked from rejoining) sets `left: true` or `left: false` on the resulting `ChannelParticipantBanned` record.
**Why it happens:** Public MTProto docs under-document this exact combination; the project's existing Phase 0 spike methodology (empirical verification against a real test group) was used for comparable ambiguities in the Tag feature.
**How to avoid:** Treat D-01 as the locked behavioral contract (do not relitigate it), but the plan should include a verification step — ideally a live `channels.GetParticipant` call against a real previously-banned test account — before relying on the `left` flag distinction in production, OR gate the ambiguous case behind a conservative fallback (e.g., treat any `ChannelParticipantBanned` without further signal as `banned`, since false-negative "not-member" would silently deny the unban-first flow Phase 14 needs, whereas false-positive "banned" only costs an extra no-op ban-right check).
**Warning signs:** If a UAT tester reports that a target who was fully kicked-and-banned shows as a normal "not in this group" row instead of a "banned, needs unban" row, the `left` polarity is inverted from what D-01 assumed.

### Pitfall 6: Deleting `tagClient.ts`/`tagApi.ts` leaves dangling imports
**What goes wrong:** `src/main/telegram/TagExecutor.ts` imports `makeEditChatParticipantRankRequest` from `./tagApi` and `type { TagClient }` from `./tagClient`; `src/main/index.ts` imports `TagClient` from `./telegram/tagClient`. All three imports must be removed/replaced in the same change, or `tsc --build` fails immediately (which is actually the safety net — but the planner should list these three files explicitly as touch points, not rediscover them via compiler errors mid-task).
**How to avoid:** Task list should explicitly include: `TagExecutor.ts` (replace imports + options + loop body), `src/main/index.ts` (remove `tagClientFactory`/`restoreMainClientLayer` block, lines ~318–356, change `mainClient` wiring to a plain `client`), `__mocks__/telegramClient.ts` (add an `EditChatParticipantRank` handler since the mock currently has no case for it — needed for `tagExecutor.test.ts`'s write-path assertions to keep passing with the real constructor instead of the old hand-rolled factory object).

### Pitfall 7: `npm run typecheck` does not cover the renderer
**What goes wrong:** Per prior project memory, bare root `tsc --noEmit` checks zero files (`tsconfig.json` has `files: []` with project references). The project's own `typecheck` script (`tsc --noEmit -p tsconfig.node.json`) only covers `src/main/**`, `src/preload/**`, `src/shared/**` — **not** `src/renderer/**` (that's `tsconfig.web.json`, not referenced by `typecheck`).
**Why it matters here:** Phase 13 touches `src/shared/groupTypes.ts` (consumed by both main and renderer) and `src/renderer/i18n/locales/*/groups.json` (not type-checked at all, just JSON) plus the two already-shipped `CountryPicker.tsx` fixes (renderer, verification-only). Since this phase makes "no renderer changes" to `.tsx` logic, `npm run typecheck` is *sufficient* for this phase's actual code changes, but the safe, always-correct command per prior project memory is `npx tsc --build` (builds both referenced projects, main + web).
**How to avoid:** Use `npx tsc --build` as the canonical full-project type-check command in verification steps, not bare `tsc --noEmit`.

## Code Examples

### Extending shared types (`src/shared/groupTypes.ts`)

```typescript
// Source: this phase's D-01/D-04/D-08, modeled on the existing GreyReason/MembershipStatus pattern
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

### i18n additions (`src/renderer/i18n/locales/en/groups.json` and `cs/groups.json`)

Matching the existing `greyReason` table's tone exactly (D-09 — Claude drafts, user reviews at UAT):

```json
// en/groups.json — add to existing "greyReason" object
"already-member": "Already a member of this group",
"no-invite-right": "You don't have the invite right in this group",
"channel-full": "Channel has reached the 200-member direct-add limit",
"banned-no-unban-right": "You don't have the right to lift this ban"
```

```json
// cs/groups.json — add to existing "greyReason" object
"already-member": "Již je členem této skupiny",
"no-invite-right": "Nemáte právo přidávat členy v této skupině",
"channel-full": "Kanál dosáhl limitu 200 přímo přidaných členů",
"banned-no-unban-right": "Nemáte právo zrušit tento zákaz"
```

These four strings are `[ASSUMED]` drafts per D-09 — flagged for user UAT review, not auto-approved.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `tagClient.ts` patch-connect-restore of a module-global `AllTLObjects.LAYER` around a second `TelegramClient` connection | Whole `node_modules/telegram` package patched to layer 229 ambiently via `postinstall` (`scripts/tl-apply.mjs`) | 2026-10-03, quick task `261003-jni` | No per-connection layer juggling needed anywhere; `tagClient.ts` is pure dead weight once `TagExecutor` stops calling it (this phase) |
| Hand-rolled `tagApi.ts` TL-request serializer for `messages.editChatParticipantRank` (necessary because GramJS 2.26.22 stock schema lacked the method) | `Api.messages.EditChatParticipantRank` generated class, present because the vendored layer-229 schema includes it | Same 2026-10-03 quick task | `tagApi.ts`/`tagApi.test.ts` are now redundant; delete per D-10 |
| `MembershipScanner` collapses `ChannelParticipantBanned` and `ChannelParticipantLeft` to a single `false`/`not-member` | Split into `banned` vs `not-member` (D-01) | This phase | Enables Phase 14's unban-first flow and Phase 15's cause-specific grey reasons |

**Deprecated/outdated:**
- The module docblock comment in `tagClient.ts` already self-documents its own obsolescence ("layer-neutral since TL229") — this phase finishes what that comment implies by deleting the file outright rather than leaving it as a pass-through wrapper.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Api.Channel.bannedRights` represents the *admin's own* per-viewer restriction in that channel (not some other per-channel aggregate), making it safe to fold into the `canAdd` self-check with zero extra API calls | Pattern 1 (Don't Hand-Roll discretion item) | If this field means something else, the `canAdd` rule could falsely mark a restricted admin as able to invite, leading to a doomed Add-mode run for that specific group — low blast radius (single-group failure, not account-wide), caught by Phase 14's live-API error handling as a fallback |
| A2 | `ChannelParticipantBanned.left === false` (unset) is the correct signal for "banned but needs an explicit unban before re-invite," per D-01's literal wording | Pitfall 5 | If the polarity is inverted, Add-mode would either (a) never offer unban-first for truly kicked users (silent capability gap) or (b) offer it for users who already left normally (harmless extra no-op), depending on which direction is wrong; recommend a live spike before relying on it in Phase 14 |
| A3 | The four draft i18n strings (`already-member`, `no-invite-right`, `channel-full`, `banned-no-unban-right`) match the project's existing tone/formality (formal vykání in Czech, short factual English) well enough to pass UAT with only minor wording tweaks | Code Examples / i18n | Low risk — D-09 already designates these as Claude-drafted-user-reviewed; worst case is a UAT revision cycle, not a functional defect |

## Open Questions (RESOLVED)

1. **Does `entity.bannedRights.inviteUsers` reflect the logged-in admin's own restriction, or some other aggregate?**
   - What we know: the field exists on `Api.Channel` at layer 229 and is documented informally elsewhere as "restrictions imposed on this user in this channel."
   - What's unclear: no live empirical test was run in this research session (unlike the Phase 0 Tag spike, which did empirically verify its equivalent ambiguity).
   - Recommendation: either accept it as a best-effort optimization (fail open — i.e., don't gate `canAdd` on it, just use D-04's literal rule, and let Phase 14's live `channels.InviteToChannel` call surface a `RIGHT_FORBIDDEN`-style error if wrong) or spend one small verification task confirming it against a real restricted-admin test account before wiring it in. Given Claude's Discretion explicitly marks this as optional ("if cheap"), recommend the planner treat it as a stretch addition, not a blocking requirement for ADD-04.
   - **RESOLVED:** Per Claude's Discretion (13-CONTEXT.md), this self-check is deliberately NOT folded into the D-04 `canAdd` formula for this phase — D-04 ships as the literal fail-open rule. If the admin's own `bannedRights.inviteUsers` restriction is wrong in a specific group, Phase 14's live `channels.InviteToChannel` call surfaces the resulting server error (e.g. `RIGHT_FORBIDDEN`) at execution time instead.

2. **`ChannelParticipantBanned.left` polarity for a classic kick+ban** (see Pitfall 5 / Assumption A2).
   - What we know: D-01 is a locked decision with an explicit mapping.
   - What's unclear: whether that mapping matches live Telegram server behavior for the "banned AND removed" case specifically (as opposed to "banned but still technically a participant, restricted").
   - Recommendation: a one-off manual or scripted verification against a real test group (mirroring the existing Phase 0 spike pattern already used for the Tag feature) before Phase 14 builds the unban-first flow on top of this status.
   - **RESOLVED:** D-01 locks the mapping (`left` unset → `banned`, `left===true` → `not-member`) as the shipped contract for this phase; `membershipScanner.test.ts` (plan 13-02, Task 2) pins this polarity with an explicit test for both cases, documenting it as a tested, locked contract rather than an unverified assumption. The live-server empirical check against a real banned/kicked test account remains open and is tracked as a manual-only verification in 13-VALIDATION.md, to be completed before Phase 14 builds the unban-first flow on top of this status.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node_modules/telegram` patched to TL layer 229 | All of this phase's rights/scan/tag work | ✓ | confirmed `LAYER === 229` via `tlLayer.test.ts` and direct `grep` of `AllTLObjects.js` | — |
| `vitest` | Running/extending `groupEnumerator.test.ts`, `membershipScanner.test.ts`, `tagExecutor.test.ts` | ✓ | per `package.json` devDependency | — |
| `npx tsc --build` | Full project type-check (main + renderer) | ✓ | TypeScript via `@electron-toolkit/tsconfig` | `npm run typecheck` as a main-only fallback (insufficient alone per Pitfall 7, but fine since this phase makes no `.tsx` logic changes) |
| Live Telegram test account with a real banned/kicked member | Verifying Open Question 2 (`left` polarity) empirically | Unknown — not verified in this research session | — | If unavailable, ship D-01 as-is and treat Pitfall 5 as a known risk to monitor at UAT |

**Missing dependencies with no fallback:** None blocking.

**Missing dependencies with fallback:** A live test account for empirical `left`-flag verification (Open Question 2) — fallback is to ship the locked D-01 mapping as specified and monitor at UAT.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project-wide; see `package.json` `"test": "vitest run"`) |
| Config file | `electron.vite.config.ts` (vitest config is colocated; no separate `vitest.config.ts` found) |
| Quick run command | `npx vitest run src/main/telegram/GroupEnumerator.test.ts src/main/telegram/groupEnumerator.test.ts src/main/telegram/membershipScanner.test.ts src/main/telegram/tagExecutor.test.ts` *(note: `groupEnumerator.test.ts` lowercase-first is the actual sibling test file for `GroupEnumerator.ts` — confirmed via `find`; there is no separate `GroupEnumerator.test.ts`, only the lowercase one — double-check exact filename before scripting)* |
| Full suite command | `npm test` (`vitest run`, all ~33 test files) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADD-04 | `canAdd=true` when `creator===true` | unit | `npx vitest run src/main/telegram/groupEnumerator.test.ts -t "canAdd"` | ❌ Wave 0 — new `it()` blocks needed, mirroring existing `canAct=true when entity.creator=true` pattern at line 48 |
| ADD-04 | `canAdd=true` when `adminRights.inviteUsers===true` | unit | same file | ❌ Wave 0 |
| ADD-04 | `canAdd=false` when `adminRights.inviteUsers` absent AND `defaultBannedRights.inviteUsers===true` | unit | same file | ❌ Wave 0 |
| ADD-05 (D-05) | Basic group (`Api.Chat`) gets the identical `canAdd` rule | unit | same file, `describe('type detection — Api.Chat entity')` block | ❌ Wave 0 |
| ADD-03/D-06 | Broadcast channel `canAdd=true` with invite right, `canAct` stays `false` | unit | same file, `describe('type detection — broadcast channel')` block | ❌ Wave 0 |
| D-06 | Broadcast channel with `participantsCount >= 200` → `canAdd=false`, `addGreyReason='channel-full'` regardless of invite right | unit | same file | ❌ Wave 0 — requires extending `getDialogsResult` mock config with a `participantsCount` field (not currently in `MockClientConfig.getDialogsResult`, see Pitfall note below) |
| D-01 | `ChannelParticipantBanned` with `left` unset → `status='banned'` | unit | `npx vitest run src/main/telegram/membershipScanner.test.ts -t "Banned"` | Existing test at line 152 needs its assertion changed from `isMember=false` to `status==='banned'` — effectively a REPLACE, not purely additive |
| D-01 | `ChannelParticipantBanned` with `left=true` → `status='not-member'` | unit | same file | ❌ Wave 0 — new test, also resolves/documents Open Question 2's chosen polarity |
| D-03 | Basic-group scan never emits `banned` | unit | same file, `describe('scan — basic group membership')` | ❌ Wave 0 — add an explicit negative-assertion test |
| TAG-07/D-10 | `TagExecutor` issues `EditChatParticipantRank` directly on `client`, no `tagClient`/`tagClientFactory` | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | Existing `tagExecutor.test.ts` (795 lines) needs substantial rewrite to drop `mockTagClient`/`restoreMainClientLayer` fixtures — same behavioral assertions (D-12), different construction (`makeTagExecutor` helper needs a single `client` instead of `tagClientFactory`+`mainClient`) |
| TAG-07/D-11 | Unparseable response is NOT swallowed as success | unit | same file | ❌ Wave 0 — new test asserting an `UNKNOWN` outcome, replacing the deleted `tagClient.test.ts`'s equivalent coverage |
| TAG-07 | No `AllTLObjects`/layer-224 references remain | regression | `grep -rn "AllTLObjects\|layer-224\|restoreMainClientLayer\|tagClientFactory" src/main/telegram/TagExecutor.ts src/main/index.ts` (expect zero matches) | ❌ Wave 0 — this is a grep-based regression check, not a vitest test; recommend adding it as a plan verification step rather than a test file |
| TAG-07 | `tlLayer.test.ts` (layer 229 guard) still passes unmodified | regression | `npx vitest run src/main/telegram/tlLayer.test.ts` | ✓ Already exists, unaffected by this phase's changes |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run <file> -t "<pattern>"` for the file(s) touched
- **Per wave merge:** `npm test` (full suite — 33 files, confirms no regression in `removalExecutor.test.ts`, `groupEnumerator.test.ts`, `membershipScanner.test.ts`, `tagExecutor.test.ts`, `tlLayer.test.ts`)
- **Phase gate:** `npm test` green AND `npx tsc --build` clean (per Pitfall 7, not bare `tsc --noEmit`) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/main/telegram/groupEnumerator.test.ts` — new `it()` blocks for `canAdd` (D-04), basic-group parity (D-05), broadcast-channel `canAdd`/`channel-full` (D-06)
- [ ] `src/main/telegram/__mocks__/telegramClient.ts` — extend `MockClientConfig.getDialogsResult` entries with `inviteUsers`/`defaultBannedRights`/`participantsCount` fields (currently only `adminRights?: { banUsers?: boolean }` is modeled — line 130); extend `invoke()` dispatch to handle `EditChatParticipantRank` requests (currently absent) for the consolidated `tagExecutor.test.ts`
- [ ] `src/main/telegram/membershipScanner.test.ts` — modify the existing `ChannelParticipantBanned` test (line 152) to assert `'banned'`/`'not-member'` by `left` flag instead of a flat `isMember=false`; add the `left=true` case
- [ ] `src/main/telegram/tagExecutor.test.ts` — substantial rewrite of the `makeTagExecutor` test factory (lines ~140–180) to drop the two-client shape; the 10 existing `describe` blocks' *assertions* should stay behaviorally equivalent per D-12
- [ ] Delete `src/main/telegram/tagClient.ts`, `tagClient.test.ts`, `tagApi.ts`, `tagApi.test.ts` (D-10) — this *removes* 2 test files from the suite, a net negative line count that should not be mistaken for missing coverage
- [ ] No new test framework/config install needed — Vitest is already fully wired

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unaffected — this phase touches no auth/session code |
| V3 Session Management | no | Unaffected — the shared session (`StringSession`) is untouched; deleting `tagClientFactory`'s `new TelegramClient(new StringSession(client.session.save()...))` removes a second in-memory copy of the session string, which is a minor security *improvement* (one fewer place the session string transiently exists), not a regression |
| V4 Access Control | yes | `canAdd`/`canAct` are the access-control gate for destructive/state-changing actions; must continue to be computed exclusively in main (`GroupEnumerator`), never trusted from renderer input — already the existing, audited pattern (T-04-01) |
| V5 Input Validation | n/a (this phase) | No new user-facing input in this phase (no renderer UI) |
| V6 Cryptography | no | Unaffected — `safeStorage`/session encryption untouched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer-supplied `canAdd`/rights override (a compromised renderer process lying about rights to trigger an unauthorized add/removal) | Elevation of Privilege | `canAdd`/`canAct` are computed and enforced in the main process only; renderer never sends a rights flag back that main trusts (same invariant as existing `canAct`, verified unchanged by this phase) |
| Target/group identity spoofing via IPC payload | Tampering | Unaffected by this phase — `TagExecutor.execute()` already reads target identity exclusively from `resolver.getResolvedUser()` (T-05-04-B), a pattern this phase's consolidation preserves verbatim (only the *transport client* changes, not the identity-sourcing logic) |
| Stale `TagClient`'s second `StringSession` copy lingering in memory after disconnect | Information Disclosure (minor) | Resolved *by* this phase's consolidation — deleting the second client removes a second in-memory session copy entirely |

## Sources

### Primary (HIGH confidence)
- `node_modules/telegram/tl/api.d.ts` (local, patched to TL layer 229 by `scripts/tl-apply.mjs`) — `Api.Chat`, `Api.Channel`, `Api.ChatAdminRights`, `Api.ChatBannedRights`, `Api.ChannelParticipantBanned`, `Api.messages.EditChatParticipantRank`, `Api.messages.AddChatUser`, `Api.channels.InviteToChannel` field/constructor verification — direct file inspection, not training-data recall
- `src/main/telegram/tlLayer.test.ts` — existing regression guard confirming `LAYER === 229` and 5 constructor IDs including `Api.messages.EditChatParticipantRank`
- `src/main/telegram/GroupEnumerator.ts`, `MembershipScanner.ts`, `TagExecutor.ts`, `RemovalExecutor.ts`, `tagClient.ts`, `tagApi.ts` — direct source inspection with line numbers cited throughout
- `.planning/quick/261003-jni-move-gramjs-client-to-tl-layer-229-schem/261003-jni-SUMMARY.md` — authoritative record of what the layer-229 migration changed and explicitly deferred (TagExecutor cleanup → this phase)
- `git log` / `git show` on `src/renderer/auth/CountryPicker.tsx` — confirmed commit `be492cc` already applied both folded todos

### Secondary (MEDIUM confidence)
- WebSearch: "channels.inviteToChannel USERS_TOO_MUCH broadcast channel 200 subscribers limit" — confirms the 200-direct-add-limit product behavior (community/marketing sources, e.g. `telegram.org/faq_channels`-adjacent summaries), consistent with D-06's locked assumption; exact RPC error string (`USERS_TOO_MUCH` vs `CHANNELS_TOO_MUCH`) not confirmed from an official MTProto method-reference page in this session — treat the specific error-string choice as needing live confirmation in Phase 14 (where the actual `channels.InviteToChannel` call happens), not blocking for Phase 13 since Phase 13 only needs the `participantsCount >= 200` pre-check, not the error string
- WebSearch: `channels.getParticipant` / `channelParticipantBanned` — confirms `ChannelParticipantBanned.left` exists and distinguishes banned-and-left from banned-not-left at a conceptual level, but did not resolve the exact polarity needed for Open Question 2/Assumption A2

### Tertiary (LOW confidence)
- None — all claims above were either verified against local package files/source or explicitly flagged `[ASSUMED]`/logged as open questions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all referenced fields verified directly in the installed, patched package
- Architecture: HIGH — every proposed change mirrors an existing, shipped, tested pattern (`canAct` computation, `RemovalExecutor`'s single-client loop) in the same codebase
- Pitfalls: HIGH for the code-structure pitfalls (verified via direct source/grep inspection); MEDIUM for the `ChannelParticipantBanned.left` polarity pitfall, which is genuinely unverified and explicitly flagged as such

**Research date:** 2026-10-03
**Valid until:** 30 days (stable, project-internal domain; re-verify if `telegram` package or `vendor/telegram-api.tl` is updated again via `npm run tl:update` before this phase is planned/executed)
