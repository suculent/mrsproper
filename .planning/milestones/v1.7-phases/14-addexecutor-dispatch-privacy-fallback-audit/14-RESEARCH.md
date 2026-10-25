# Phase 14: AddExecutor — Dispatch, Privacy Fallback & Audit - Research

**Researched:** 2026-10-03
**Domain:** GramJS/MTProto layer-229 write operations (channel invite, basic-group add, invite-link export, contact add, direct message) wired into the existing governor/executor/audit-store architecture
**Confidence:** HIGH on dispatch mechanics, error taxonomy, and architecture mirroring; MEDIUM on a handful of RPC-shape specifics that are undocumented and must be live-verified; HIGH on one critical architectural deviation from RemovalExecutor/TagExecutor (see Summary)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Executor shape & per-group dispatch**
- D-01: `AddExecutor` mirrors `RemovalExecutor`/`TagExecutor`: strictly sequential, every Telegram call through `governor.run()` on the single shared client, FLOOD_WAIT absorbed by the governor with a countdown event forwarded to the renderer, PEER_FLOOD hard-stops the run with remaining groups left pending (not skipped), ~3s inter-group pacing (base + jitter) fired after the outcome is checkpointed, generation-token guard with abort-first semantics (WR-01: a superseded run exits silently; only an explicit abort marks remaining groups skipped), per-group checkpoint before advancing, and `retryGroup()` for failed groups after complete/stopped/hard-stopped.
- D-02: Per selected dialog: supergroup/broadcast channel → if scan status is `banned`, `channels.EditBanned` with empty `ChatBannedRights` first (own `governor.run()`), then `channels.InviteToChannel`; basic group → `messages.AddChatUser` directly (no ban visibility, per Phase 13 D-03; a `USER_KICKED` refusal becomes a failed outcome). `InputChannel`/`InputUser` built from the enumerator entity map and `resolver.getResolvedUser()` in main only; IPC payload carries dialog ids and run options, never identity.
- D-03: `messages.AddChatUser.fwd_limit`: send `1000`; if the server explicitly rejects the value, retry that call once with `100`.
- D-04: If a ban was lifted and the invite that follows fails for any reason, the ban stays lifted. No re-ban write.
- D-05: Before issuing any call, the executor checks the resolved `User` flags. A deleted account or a bot yields `failed(ADD_TARGET_INVALID)` for every selected group with zero API traffic.
- D-06: A target found to be a participant at run time (`USER_ALREADY_PARTICIPANT` or equivalent) is recorded as `already-member`, not a failure.

**Privacy block & contact-add**
- D-07: Privacy block detection uses the layer-229 response: both invite calls return `messages.InvitedUsers`; if `missing_invitees` contains the target, outcome is `privacy-blocked`. Legacy error strings meaning the same thing (`USER_PRIVACY_RESTRICTED`, `USER_NOT_MUTUAL_CONTACT`) are mapped to `privacy-blocked` too.
- D-08: Contact add is NOT part of the run. Phase 14 provides a main-process contact service plus an IPC handler (e.g. `target:add-contact`) that Phase 15 calls at target confirmation. Uses `contacts.AddContact` with the resolved user's names, skips when already a contact, keeps the contact afterwards, non-blocking (`{ ok, code? }`), failure never prevents the run from starting. Executor performs no retry of a blocked invite; a block goes straight to the link.
- D-09: A missing invitee flagged `premium_would_allow_invite` stays `privacy-blocked` and still gets a link; outcome carries `premiumWouldAllow: true`.
- D-10: The invite link is exported inline, in the same per-group step, immediately after the block is detected, checkpointed together with the `privacy-blocked` outcome.

**Invite links & the direct message**
- D-11: `messages.ExportChatInvite` with `usage_limit: 1`, `expire_date = now + 5 days`, `request_needed: false`, title `Admin • {target display name}`, truncated to Telegram's 32-character title limit.
- D-12: A broadcast channel hitting the direct-add cap mid-run (`USERS_TOO_MUCH` on `InviteToChannel`) takes the link fallback: outcome `privacy-blocked` with `reason: 'channel-full'`. A channel-cap `failed` code exists only when the link export itself is refused. Resolves PROJECT.md vs ADD-09 wording conflict in favour of PROJECT.md; ADD-09's text should be adjusted during planning.
- D-13: The single DM is sent only when the run reaches `complete`. Stopped/hard-stopped runs keep links in `add-job.json`; a resumed run's completion sends one DM covering links from every segment. Links older than 5 days at send time are regenerated first. One DM per run, ever; no DM when the run produced zero links.
- D-14: The DM is attempted once through the governor even when a missing invitee carried `premium_required_for_pm`. On refusal the run finishes with `dmStatus: 'refused'`; outcomes stay `privacy-blocked`; links remain in the job file and add log.
- D-15: Template placeholders `{name}`/`{links}` (single-brace), one template in electron-store preferences, default by app language when none stored. Phase 14 ships store + render function + get/set IPC.

**Job file, resume & add log**
- D-16: Separate `add-job.json`: `schemaVersion: 1`, mode `0o600`, ISO `jobId`, `targetId`+`targetName` (+accessHash on disk only), ordered `dialogIds`, run options, per-group outcomes (optional `link`, `reason`, `premiumWouldAllow`, `errorCode`, timestamp), `dmStatus` (`pending|sent|refused|not-needed`), `status` (`running|complete|stopped|hard-stopped`). Detected independently on launch with its own Resume/Discard prompt (prompt UI is Phase 15; detection + IPC are here).
- D-17: Add log is plain-text `add-log.txt` next to job files, mode `0o600`, append-only, kept forever.
- D-18: One log block per run, written at terminal state: timestamp, target id+name, groups actually added, groups that received a link with the links, DM status. Failed/skipped groups NOT logged. A resumed run appends a follow-up block referencing the original job id, listing only what that segment added; nothing rewritten in place.

**Outcome vocabulary**
- D-19: Exactly `done | already-member | privacy-blocked | failed | skipped`. `privacy-blocked` carries `reason: 'privacy'|'channel-full'`, `link`, `premiumWouldAllow`. Failed codes follow the ADD-09 list with removal/tag naming (`ADD_NO_RIGHTS`, `ADD_NOT_MUTUAL_CONTACT`, `ADD_USER_CHANNELS_TOO_MUCH`, `ADD_USER_KICKED`, `ADD_TARGET_INVALID`, `ADD_CHANNEL_FULL`, `NETWORK`, `UNKNOWN`); exact RPC-string mapping confirmed during research (see Code Examples / Common Pitfalls below), shape set now. PEER_FLOOD remains run-level hard-stop, never per-group. Unknown RPC errors are `failed(UNKNOWN)`, run continues.

### Claude's Discretion
- Module/constant names (`AddExecutor.ts`, `addAuditStore.ts`, `addLogStore.ts`, `addChannels.ts`, `addTypes.ts`, contact service, `ADD_*` channels), Zod payload schemas, exact RPC-error → code table, jitter values, how "already a contact" is detected from the resolved `User`.
- Whether expired links are revoked when regenerated, and how the DM text is built when a group's link was regenerated.
- Default template wording in English and Czech (formal vykání): Claude drafts, user reviews at UAT.
- Layout of the plain-text log block and its follow-up block marker.
- Whether the template snapshot used for the DM is stored in `add-job.json` for resume fidelity.

### Deferred Ideas (OUT OF SCOPE)
- Re-banning the target when an invite fails after an unban — rejected.
- JSON Lines log format — rejected in favour of plain text.
- Sending a partial DM on manual Stop — rejected; one DM per run at completion.
- Phase 15 follow-ons: contact-add failure notice, "Premium would allow this" hint, Resume/Discard prompt UI for `add-job.json`.
- REQUIREMENTS.md ADD-09 wording to be aligned with D-12 during planning (this research extends that alignment note to the "not mutual contact" wording too — see Common Pitfalls).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADD-06 | Throttled sequential add run via governor (`InviteToChannel`/`AddChatUser`), FLOOD_WAIT countdown, PEER_FLOOD hard-stop, ~3s pacing | Confirmed constructors/fields for both RPCs at layer 229; governor/pacing pattern identical to RemovalExecutor — see Architecture Patterns, Code Examples |
| ADD-07 | Banned target: lift ban before inviting | `channels.EditBanned` with empty `ChatBannedRights` confirmed as the same call RemovalExecutor already issues for unban; sequencing documented — see Code Examples |
| ADD-08 | Per-group checkpoint to `add-job.json`; relaunch detects incomplete job; stopped/hard-stopped run resumable | **Critical finding**: resume must preserve `jobId` and accumulate outcomes across segments (unlike Removal/Tag) — see Summary and Architecture Patterns §Continuation-based resume |
| ADD-09 | Typed per-group outcomes incl. failure codes | Full RPC error list verified against official Telegram docs for `channels.inviteToChannel`, `messages.addChatUser`, `messages.sendMessage`, `contacts.addContact`, `messages.exportChatInvite` — see Code Examples, Common Pitfalls |
| ADD-10 | Export unique single-use invite link expiring in 5 days | `messages.ExportChatInvite` fields confirmed (`usageLimit`, `expireDate`, `title`, `requestNeeded`) — see Code Examples |
| ADD-11 | One DM with all links at run end; refusal reported distinctly | `messages.SendMessage` error list confirmed (privacy/block errors); DM-at-completion + cross-segment aggregation design documented — see Architecture Patterns |
| ADD-05 (main half) | Confirm-time contact add | `contacts.AddContact` fields confirmed incl. `phone: ''` acceptability; `User.contact`/`mutualContact` flags located — see Code Examples, Common Pitfalls (TargetResolver gap) |
| ADD-14 (main half) | Add log store | Mirrors `auditStore.ts` atomic-write pattern but append-only plain text — see Architecture Patterns |
| ADD-16 (main half) | Template store + render function + IPC | Mirrors `severityChannels.ts` ESM-safe electron-store pattern — see Architecture Patterns |
</phase_requirements>

## Summary

AddExecutor is a fourth parallel executor class, built by cloning `RemovalExecutor`'s shape (generation-token guard, abort semantics, governor routing, per-group checkpointing, inter-group pacing) exactly as `TagExecutor` did in Phase 11. All five Telegram RPCs this phase needs — `channels.InviteToChannel`, `messages.AddChatUser`, `messages.ExportChatInvite`, `channels.EditBanned` (reused verbatim from RemovalExecutor's unban call), `messages.SendMessage`, and `contacts.AddContact` — are confirmed present, parseable, and camelCase-fielded at the now-ambient TL layer 229 (`node_modules/telegram@2.26.22`). No new npm packages, no TL schema gaps, no GramJS version bump needed.

**Primary recommendation:** Clone `RemovalExecutor.ts` → `AddExecutor.ts` and `removalExecutor.test.ts` → `addExecutor.test.ts` as the starting skeleton (same pattern Phase 11 used for TagExecutor), then layer in the Add-specific dispatch branches, privacy-block/link/DM logic, and — critically — a resume path that deviates from both existing executors.

**Critical architectural finding (HIGH confidence, not explicit in CONTEXT.md):** RemovalExecutor and TagExecutor both call `auditStore.initJob()` unconditionally at the top of every `execute()`, minting a fresh `jobId` and an empty `outcomes` array every time — their "Resume" is really "start a new job over the remaining dialogIds," which is fine because neither feature aggregates anything *across* job boundaries. AddExecutor cannot use that pattern as-is: D-13 requires the final DM to cover links generated across every stop/resume segment of **the same run**, and D-18 requires the add-log's follow-up block to reference "the original job id." Both decisions presuppose job-id continuity across a stop→resume cycle. The recommended design (detailed in Architecture Patterns) is: `execute()` checks for an existing non-`complete` `add-job.json` whose `dialogIds` set matches the request; if found, it **continues** that job (same `jobId`, outcomes seeded from disk, `dmStatus` carried over) instead of calling `initJob()` fresh, and the per-group loop iterates `auditStore.getRemaining()` rather than blindly over the full requested list. A genuinely new target/run still gets a fresh `jobId` via `initJob()`. This must be decided explicitly in planning — it is the single highest-risk design gap left by CONTEXT.md.

**Second finding (HIGH confidence):** `resolver.getResolvedUser()` today returns only `{ id, accessHash, name }` (verified in `TargetResolver.ts`). D-05's deleted/bot pre-check and D-08's contact service both need `deleted`, `bot`, `contact`, and `mutualContact` flags off the resolved `Api.User`, which `TargetResolver` already fetches (it already builds `ResolvedTargetDTO.deleted`/`.bot` for the renderer) but does not retain in private state after resolution completes. This phase needs a small, additive `TargetResolver` extension (new private fields + an extended return shape on `getResolvedUser()`, or a sibling method) — not a new resolver.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-group dispatch (invite/add mechanic selection) | API/Backend (main process) | — | Identity + entity accessHash never leave main; mirrors Removal/Tag |
| Unban-before-invite sequencing | API/Backend (main process) | — | Same governor-wrapped `EditBanned` call RemovalExecutor already issues |
| Privacy-block detection & classification | API/Backend (main process) | — | Requires raw RPC response shape (`missing_invitees`) + raw error strings — never surfaced to renderer |
| Invite-link export | API/Backend (main process) | — | `ExportChatInvite` requires `InputPeer` built from entity map (main-only) |
| Contact add (confirm-time) | API/Backend (main process) | — | `contacts.AddContact` requires resolved `InputUser`; IPC exposes only `{ ok, code? }` |
| Final DM dispatch | API/Backend (main process) | — | `SendMessage` requires `InputPeerUser`; rendered text built from main-held template + target name |
| Template storage/render | API/Backend (main process) | — | electron-store preference, same tier as severity/theme/language prefs |
| Job checkpoint / resume detection | API/Backend (main process) + Database/Storage (disk) | — | `add-job.json`, same tier as `removal-job.json`/`tag-job.json` |
| Add log | Database/Storage (disk) | API/Backend (main process writes it) | Plain-text file, main-process-only write, Phase 15 copies it via save dialog |
| Live progress / review / template editor UI | Browser/Client (renderer) | — | Explicitly out of scope this phase (`UI hint: no`); Phase 15 |

## Standard Stack

### Core
No new libraries. This phase extends the existing main-process stack:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `telegram` (GramJS) | 2.26.22 (pinned in `package.json`, confirmed current via `npm view telegram version`) | MTProto client — `Api.channels.InviteToChannel`, `Api.messages.AddChatUser`, `Api.messages.ExportChatInvite`, `Api.channels.EditBanned`, `Api.messages.SendMessage`, `Api.contacts.AddContact` | Already the project's sole Telegram client; all six constructors verified present at the vendored layer-229 schema (`node_modules/telegram/tl/AllTLObjects.js` → `LAYER === 229`) |
| `big-integer` | ^1.6.52 | 64-bit-safe id/accessHash/randomId construction | Already used by every executor for `InputPeerUser`/`InputChannel` construction |
| `zod` | ^4.4.3 | IPC payload validation | Already the project's sole validation library |

### Supporting
No new supporting libraries — `electron-store` (already a dependency, used by `severityChannels.ts`) is the pattern to reuse for the DM template preference (D-15).

### Alternatives Considered
Not applicable — this phase adds zero new dependencies; it is pure application code on top of the already-vetted stack.

**Installation:** None required.

**Version verification:**
```
$ npm view telegram version
2.26.22
$ node -e "console.log(require('telegram/tl/AllTLObjects').LAYER)"
229
```
Both match `package.json`'s pinned version and the quick-task 261003-jni layer-229 migration. No action needed.

## Package Legitimacy Audit

Not applicable — this phase introduces **no new external packages**. All runtime dependencies used (`telegram@2.26.22`, `big-integer`, `zod`, `electron-store`) are already installed, already used by shipped code (RemovalExecutor, TagExecutor, severityChannels), and were vetted in prior phases. No `slopcheck`/registry audit required.

## Architecture Patterns

### System Architecture Diagram

```
                              ADD_START (dialogIds, runOptions)
                                       │
                                       ▼
                         ┌─────────────────────────┐
                         │   addChannels.ts (IPC)   │  Zod validate → auth gate →
                         │                          │  double-start guard → dialog-map gate
                         └────────────┬─────────────┘
                                      ▼
                         ┌─────────────────────────┐
                         │      AddExecutor         │◄───── resolver.getResolvedUser()
                         │      .execute()          │       (extended: + deleted/bot flags)
                         └────────────┬─────────────┘
                                      │
                    ┌─────────────────┼──────────────────────┐
                    ▼                 ▼                      ▼
         addAuditStore.readJob()  (decide: fresh job      enumerator.getState()
         (existing non-complete?)   vs. continue existing   .dialogs / getDialogEntity()
                    │                jobId — see            (InputChannel/InputPeerUser
                    │                "Continuation-based     construction, main-only)
                    │                resume" below)
                    ▼
         ┌──────────────────────────── per-group loop (governor-serialized) ───────────────────────────┐
         │  dialog.type === 'basic-group'?                                                               │
         │     └─ messages.AddChatUser(chatId, InputUser, fwdLimit=1000→100 fallback)                    │
         │  dialog.type is supergroup/broadcast-channel?                                                 │
         │     ├─ scan status 'banned'? → channels.EditBanned(empty rights) [own governor.run()] first   │
         │     └─ channels.InviteToChannel(InputChannel, [InputUser])                                    │
         │                                                                                                │
         │  response: messages.InvitedUsers { updates, missingInvitees[] }                                │
         │     ├─ target in missingInvitees → privacy-blocked                                             │
         │     │      └─ messages.ExportChatInvite(peer, usageLimit=1, expireDate=+5d, title) [own call]  │
         │     ├─ thrown USER_ALREADY_PARTICIPANT → already-member                                        │
         │     ├─ thrown USER_PRIVACY_RESTRICTED/USER_NOT_MUTUAL_CONTACT → privacy-blocked (+ link)       │
         │     ├─ thrown USERS_TOO_MUCH (broadcast, InviteToChannel) → privacy-blocked reason=channel-full │
         │     ├─ thrown PEER_FLOOD → classifyRpcError hard-stop → outer catch → run hard-stopped          │
         │     └─ other mapped RPC error → failed(ADD_*) ; unmapped → failed(UNKNOWN)                      │
         │                                                                                                │
         │  checkpoint outcome → addAuditStore.checkpoint() → ~3s pacing → next group                     │
         └────────────────────────────────────────────────────────────────────────────────────────────────┘
                                      │ (loop reaches natural end: no abort, no supersession)
                                      ▼
                    status === 'complete' AND dmStatus === 'pending' AND any outcome has a link?
                                      │ yes
                                      ▼
                    for each privacy-blocked outcome with a link older than 5 days:
                       re-export via ExportChatInvite, update outcome.link, checkpoint
                                      ▼
                    render template({name, links}) → messages.SendMessage(InputPeerUser, text, randomId)
                       success → dmStatus='sent'   refusal (privacy/blocked) → dmStatus='refused'
                                      ▼
                    addLogStore.appendBlock(job)  (new block if resumed segment; references original jobId)
                                      ▼
                    emit AddState{step:'complete', outcomes, summary, dmStatus}
```

### Recommended Project Structure
```
src/shared/
├── addTypes.ts              # AddState, AddGroupOutcome, AddJobFile, AddErrorCode (mirrors tagTypes.ts)
src/main/telegram/
├── AddExecutor.ts            # cloned from RemovalExecutor.ts shape
├── addExecutor.test.ts
├── __mocks__/telegramClient.ts   # extend: InviteToChannel, AddChatUser, ExportChatInvite,
│                                  #         SendMessage, AddContact dispatch branches
src/main/contacts/            # or src/main/telegram/contactService.ts
├── contactService.ts         # contacts.AddContact wrapper, "already a contact" check
src/main/storage/
├── addAuditStore.ts          # mirrors tagAuditStore.ts, adds continuation-aware readJob() contract
├── addLogStore.ts            # new: append-only plain-text writer (mode 0o600)
├── addTemplateStore.ts       # or fold into a new templateChannels.ts — electron-store, mirrors severityChannels.ts
src/main/ipc/
├── addChannels.ts            # ADD_START/ABORT/RETRY_GROUP/GET_STATE/GET_JOB/DISCARD_JOB
├── contactChannels.ts        # or fold contact-add handler into addChannels.ts
├── templateChannels.ts       # TEMPLATE_GET/TEMPLATE_SET (or ADD_TEMPLATE_*)
src/shared/channels.ts        # + ADD_*, TARGET_ADD_CONTACT (or similar), TEMPLATE_* constants
```

### Pattern 1: Continuation-based resume (the key deviation from Removal/Tag)
**What:** Unlike RemovalExecutor/TagExecutor (which always `initJob()` fresh and treat "resume" as "start a new job over the remaining ids"), AddExecutor must detect an existing non-`complete` job and continue its lineage so the final DM and the add-log's follow-up block can reference the original run.
**When to use:** Every `execute()` call — the branch is internal, not a separate public method, to keep the `AddExecutorLike`/IPC contract identical to Removal/Tag's shape.
**Example (recommended shape, not yet existing code):**
```typescript
// Inside AddExecutor.execute(), before building a fresh job:
const existing = this._auditStore.readJob()
const isContinuation =
  existing !== null &&
  existing.status !== 'complete' &&
  existing.targetId === targetId &&
  sameDialogSet(existing.dialogIds, params.dialogIds)   // helper: order-insensitive set equality

let job: AddJobFile
let outcomes: AddGroupOutcome[]
if (isContinuation) {
  job = existing!                      // SAME jobId — do not call initJob()
  outcomes = [...existing!.outcomes]   // seed from disk, not empty
} else {
  const jobId = new Date().toISOString()
  job = { schemaVersion: 1, jobId, targetId, targetName, targetAccessHash, dialogIds: params.dialogIds,
           outcomes: [], dmStatus: 'pending', startedAt: jobId, status: 'running' }
  this._auditStore.initJob(job)
  outcomes = []
}
const remaining = this._auditStore.getRemaining()   // works for both: empty-outcomes job → all ids
// loop over `remaining`, not params.dialogIds, in both cases
```
**Open question for planner:** exact equality rule for "same run" (target id alone vs. target id + dialogIds) — flagged below in Open Questions.

### Pattern 2: Per-group dispatch with privacy fallback
**What:** The core per-group write, structured so the `missing_invitees` happy-path and the legacy-error path converge on one `privacy-blocked` outcome builder.
**When to use:** The `_addToGroup` private method (direct analog of `RemovalExecutor._removeFromGroup` / `TagExecutor._tagGroup`).
**Example:**
```typescript
// Source: vendor/telegram-api.tl (layer 229) + node_modules/telegram/tl/api.d.ts (verified)
import { Api } from 'telegram'

async function _inviteToChannelOrGroup(
  dialog: AdminDialogDTO,
  resolved: { id: bigint; accessHash: bigint },
  entity: { id?: { toString(): string }; accessHash?: { toString(): string } } | null,
  client: AddExecutorClient,
  governor: RateLimitGovernor,
): Promise<{ missingInvitees: Array<{ userId: unknown; premiumWouldAllowInvite?: boolean }> }> {
  const inputUser = new Api.InputPeerUser({
    userId: bigInt(resolved.id.toString()),
    accessHash: bigInt(resolved.accessHash.toString()),
  })

  if (dialog.type === 'basic-group') {
    const chatId = entity?.id ? bigInt(entity.id.toString()) : bigInt(dialog.id)
    try {
      const result = (await governor.run(() =>
        client.invoke(new Api.messages.AddChatUser({ chatId, userId: inputUser, fwdLimit: 1000 }))
      )) as { missingInvitees: unknown[] }
      return result as { missingInvitees: Array<{ userId: unknown }> }
    } catch (err) {
      // D-03: explicit-rejection fallback — retry once with fwdLimit: 100.
      // (Exact rejecting error string not documented; treat any thrown error on the
      // first attempt that is NOT already a known terminal code as eligible for one retry.)
      const result = (await governor.run(() =>
        client.invoke(new Api.messages.AddChatUser({ chatId, userId: inputUser, fwdLimit: 100 }))
      )) as { missingInvitees: unknown[] }
      return result as { missingInvitees: Array<{ userId: unknown }> }
    }
  }

  // supergroup | broadcast-channel
  const channelId = bigInt(entity?.id?.toString() ?? dialog.id)
  const channelAccessHash = entity?.accessHash ? bigInt(entity.accessHash.toString()) : bigInt.zero
  const inputChannel = new Api.InputChannel({ channelId, accessHash: channelAccessHash })

  const result = (await governor.run(() =>
    client.invoke(new Api.channels.InviteToChannel({ channel: inputChannel, users: [inputUser] }))
  )) as { missingInvitees: Array<{ userId: unknown; premiumWouldAllowInvite?: boolean }> }
  return result
}
```
Note the response shape confirmed from `node_modules/telegram/tl/api.d.ts`:
```typescript
export class InvitedUsers extends VirtualClass<{
  updates: Api.TypeUpdates
  missingInvitees: Api.TypeMissingInvitee[]   // camelCase at the JS boundary
}>
export class MissingInvitee extends VirtualClass<{
  premiumWouldAllowInvite?: boolean
  premiumRequiredForPm?: boolean
  userId: long
}>
```

### Pattern 3: Unban-before-invite (D-02, D-04)
**What:** Reuse `RemovalExecutor`'s existing unban call verbatim — it is the exact same RPC Phase 14 needs, already proven against the mock and (per Phase 13 UAT) a live account.
**Example:**
```typescript
// Source: RemovalExecutor.ts lines 579-591 (the "unban" half of the kick mechanic) — reuse as-is
await governor.run(() =>
  client.invoke(
    new Api.channels.EditBanned({
      channel: inputChannel,
      participant: inputUser,
      bannedRights: new Api.ChatBannedRights({
        untilDate: 0,
        // All ban flags omitted → all default to false (unban)
      }),
    })
  )
)
// D-04: if the EditBanned call throws, propagate — outer catch classifies it as a failed outcome,
// the ban is NOT restored. If EditBanned succeeds but InviteToChannel then fails, the ban also
// stays lifted (two independent governor.run() calls — D-02 explicitly forbids combining them).
```

### Pattern 4: Invite-link export (D-10, D-11)
```typescript
// Source: node_modules/telegram/tl/api.d.ts (ExportChatInvite request / ChatInviteExported response)
const expireDate = Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60   // absolute unix seconds — see Open Questions
const rawTitle = `Admin • ${targetName}`
const title = rawTitle.length > 32 ? rawTitle.slice(0, 32) : rawTitle  // D-11 32-char cap [ASSUMED limit]

const exported = (await governor.run(() =>
  client.invoke(
    new Api.messages.ExportChatInvite({
      peer: inputPeerForDialog,   // InputPeerChannel or InputPeerChat depending on dialog.type
      usageLimit: 1,
      expireDate,
      title,
      requestNeeded: false,
    })
  )
)) as { link: string; expireDate?: number }

// exported.link is the value to store on the outcome and later render into {links}.
```

### Pattern 5: Contact add (D-05 precheck data source + D-08 service)
```typescript
// D-05: pre-check — zero API traffic when deleted or bot.
// Requires extending TargetResolver.getResolvedUser() (or a sibling method) to expose these
// flags — they are NOT currently retained after resolve() completes (see Common Pitfalls).
if (resolvedFull.deleted || resolvedFull.bot) {
  return selectedDialogIds.map(id => ({
    dialogId: id, status: 'failed', errorCode: 'ADD_TARGET_INVALID', timestamp: now(),
  }))
}

// D-08: contacts.AddContact — confirmed fields (node_modules/telegram/tl/api.d.ts):
//   id: InputUser, firstName: string (required, non-empty — CONTACT_NAME_EMPTY otherwise),
//   lastName: string, phone: string (empty string explicitly documented as acceptable —
//   "may be omitted to simply add the user to the contact list, without a phone number"),
//   note?: TextWithEntities (omit)
if (!resolvedFull.contact) {
  await governor.run(() =>
    client.invoke(new Api.contacts.AddContact({
      id: inputUser,
      firstName: resolvedFull.firstName || resolvedFull.name || 'Contact',
      lastName: resolvedFull.lastName ?? '',
      phone: '',
    }))
  )
}
```

### Pattern 6: Final DM dispatch (D-13, D-14)
```typescript
// messages.SendMessage requires a client-generated randomId (64-bit) — this codebase always
// uses client.invoke() directly (never the high-level client.sendMessage() helper, consistent
// with the "never call client.kickParticipant()" anti-pattern guard elsewhere), so randomId
// must be generated explicitly:
import { randomBytes } from 'node:crypto'
function makeRandomId(): BigInteger {
  return bigInt(randomBytes(8).toString('hex'), 16)
}

const text = renderTemplate(template, { name: targetName, links: linkList.join('\n') })
try {
  await governor.run(() =>
    client.invoke(new Api.messages.SendMessage({
      peer: inputPeerUser,
      message: text,
      randomId: makeRandomId(),
    }))
  )
  dmStatus = 'sent'
} catch (err) {
  const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
  if (msg === 'USER_PRIVACY_RESTRICTED' || msg === 'USER_IS_BLOCKED' ||
      msg === 'YOU_BLOCKED_USER' || msg === 'PRIVACY_PREMIUM_REQUIRED') {
    dmStatus = 'refused'
  } else {
    // PEER_FLOOD / FLOOD_WAIT / NETWORK still flow through classifyRpcError via governor.run()'s
    // normal propagation — a hard-stop here is a genuine run hard-stop, not a dmStatus value.
    throw err
  }
}
```

### Anti-Patterns to Avoid
- **Minting a new `jobId` on every `execute()` call (RemovalExecutor/TagExecutor's default):** breaks D-13 (cross-segment DM aggregation) and D-18 (follow-up log block referencing the original job id). See Pattern 1.
- **Using `client.sendMessage()` or `client.invoke(new Api.channels.EditBanned(...))` through any GramJS high-level helper:** every other executor in this codebase calls `client.invoke()` directly for testability/determinism (mock dispatches on constructor name); AddExecutor must do the same for all six new RPCs.
- **Treating `USERS_TOO_MUCH` uniformly:** on `InviteToChannel` for a broadcast channel it is a `privacy-blocked`/`channel-full` link-fallback case (D-12); on `AddChatUser` for a basic group there is no equivalent decision in CONTEXT.md — flagged as an Open Question, do not silently reuse the broadcast-channel branch.
- **Combining the unban call and the invite call inside one `governor.run()`:** D-02 requires them as two independent governor-wrapped calls (mirrors RemovalExecutor's explicit anti-pattern guard against combining EditBanned calls).
- **Re-banning after a failed invite:** explicitly rejected (D-04, Deferred Ideas).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| FLOOD_WAIT / PEER_FLOOD / transient-retry policy | A new throttle loop in AddExecutor | `RateLimitGovernor.run()` (existing, shared singleton) | Already implements the 3-attempt budget, flood ceiling, and hard-stop disposition this phase's success criteria require verbatim |
| RPC error → typed code translation | Ad-hoc string matching inline in AddExecutor | `classifyRpcError()` (existing `operationErrors.ts`) for the shared PEER_FLOOD/FLOOD_WAIT/NETWORK layer, with a new `_classifyAddError()` only for the ADD-specific named-string branches (same pattern as `_classifyTagError`) | Keeps the hard-stop-first branch order (Pitfall 1) correct without duplicating it |
| Job-file atomic persistence | A bespoke read-modify-write for `add-job.json` | Clone `tagAuditStore.ts`'s `writeAtomic` (write-to-temp + rename, mode 0o600) | Crash-safety already solved; only the schema and the continuation-read semantics (Pattern 1) are new |
| 64-bit random ID generation for `SendMessage` | `Math.random()`-based ids (collision/precision risk) | `node:crypto.randomBytes(8)` → `big-integer` (shown in Pattern 6) | GramJS's own `randomBigInt` helper does exactly this; reproducing it inline keeps the dependency surface at zero while staying correct for 64-bit randomId |
| Template placeholder rendering | A templating library (Handlebars, mustache, etc.) | A two-line `String.replace(/{name}/g, ...).replace(/{links}/g, ...)` | D-15 specifies exactly two literal placeholders; a templating engine is unjustified complexity and risks i18next `{{ }}` syntax collisions the user explicitly avoided |

**Key insight:** every piece of infrastructure this phase needs (throttling, error classification, atomic job persistence, electron-store preferences) already exists and is proven in production by RemovalExecutor/TagExecutor/severityChannels. The only genuinely new logic is: (1) the dispatch branch selection, (2) privacy-block/link/DM orchestration, and (3) continuation-aware resume. Everything else should be copy-adapt, not reinvent.

## Common Pitfalls

### Pitfall 1: `getResolvedUser()` does not expose `deleted`/`bot`/`contact`/`mutualContact`
**What goes wrong:** D-05's pre-check and D-08's contact service both need these flags; a naive implementation will try to read them off the existing `{ id, accessHash, name }` return shape and fail to compile, or worse, silently treat every target as non-deleted/non-bot/non-contact.
**Why it happens:** `TargetResolver` already computes `deleted`/`bot` into `ResolvedTargetDTO` for the renderer badge (D-18 of an earlier phase) but discards them — only `_resolvedUserId`/`_resolvedAccessHash`/`_resolvedName` are retained in private state.
**How to avoid:** Add `_resolvedDeleted`/`_resolvedBot`/`_resolvedContact`/`_resolvedMutualContact` private fields (set alongside the existing three, at every call site that currently sets `_resolvedUserId`), and extend `getResolvedUser()`'s return type (or add a sibling method) to surface them. This is a small, additive change to `TargetResolver.ts` and should be an explicit task in this phase's plan.
**Warning signs:** TypeScript error on `resolved.deleted` when writing `AddExecutor`, or a test using a `deleted: true` mock resolved user that still dispatches API calls.

### Pitfall 2: Resume semantics copied verbatim from Removal/Tag break the cross-segment DM
**What goes wrong:** If `AddExecutor.execute()` is cloned byte-for-byte from `RemovalExecutor.execute()`, every "resume" call mints a fresh `jobId` and empty `outcomes`, discarding the links accumulated in the previous (stopped/hard-stopped) segment — the final DM will only ever contain the last segment's links, violating D-13, and the add-log's follow-up block (D-18) has no original job id to reference.
**Why it happens:** Removal/Tag never needed cross-job aggregation, so their `initJob()`-always pattern was never a bug for them.
**How to avoid:** Implement Pattern 1 (Continuation-based resume) above. Decide and document in the plan the exact "same run" equality rule (see Open Questions).
**Warning signs:** A test asserting "resume a stopped run, complete it, check `dmStatus`" that passes even when the mock DM-send call only receives the second segment's links — write the test to assert the DM is called with a `message` string containing links from BOTH segments.

### Pitfall 3: `USERS_TOO_MUCH` is not one error, it is (at least) two different situations
**What goes wrong:** D-12 defines link-fallback behavior for `USERS_TOO_MUCH` specifically on `channels.InviteToChannel` for a broadcast channel mid-run. `messages.AddChatUser` (basic groups) also documents `USERS_TOO_MUCH` (per official docs: "the maximum number of users has been exceeded") but CONTEXT.md never discusses a link-fallback for basic groups, and Phase 13 never defined a `channel-full` grey reason for basic groups (only broadcast channels ≥200 subscribers).
**Why it happens:** The same error string is reused by Telegram for structurally different caps (per-channel 200-direct-add ceiling vs. basic-group's own member ceiling), and CONTEXT.md's D-12 is scoped narrowly ("A broadcast channel that hits the direct-add cap").
**How to avoid:** Map `USERS_TOO_MUCH` on `InviteToChannel` for a broadcast/supergroup channel to `privacy-blocked`/`channel-full` (D-12, with link export). Map `USERS_TOO_MUCH` on `AddChatUser` for a basic group to `failed(ADD_CHANNEL_FULL)` with **no** link fallback, since D-12's rationale (PROJECT.md's channel-cap-with-link-workaround) was never extended to basic groups and basic groups' member cap is a hard ceiling with no link-bypass precedent in CONTEXT.md. Flag this explicitly to the user/planner rather than silently picking one — see Open Questions.
**Warning signs:** A basic-group test asserting `privacy-blocked` on `USERS_TOO_MUCH` that nobody explicitly approved.

### Pitfall 4: ADD-09's literal wording vs. D-07's locked mapping for "not mutual contact"
**What goes wrong:** REQUIREMENTS.md's ADD-09 text lists "not mutual contact" as one of the parenthetical `failed` causes, implying an `ADD_NOT_MUTUAL_CONTACT` code should actually be *produced*. D-07 (locked) instead routes `USER_NOT_MUTUAL_CONTACT` into the `privacy-blocked` outcome (same bucket as `USER_PRIVACY_RESTRICTED`), not `failed`. If `ADD_NOT_MUTUAL_CONTACT` is defined in the `AddErrorCode` type (as D-19 requires for shape-completeness) but never actually assigned by the classifier, that's correct per D-07 — but it is easy to misread D-19's error-code list as "these must all be reachable" and mistakenly add a second, redundant `failed` branch for `USER_NOT_MUTUAL_CONTACT`.
**Why it happens:** D-19 lists the full ADD-09 code vocabulary for shape purposes while D-07 locks the actual dispatch of two of those strings to a different outcome entirely. This mirrors the already-flagged ADD-09/D-12 `channel-full` wording conflict (Deferred Ideas already calls that one out for planning alignment).
**How to avoid:** Keep `ADD_NOT_MUTUAL_CONTACT` defined in the type (for shape-completeness / future-proofing) but do not wire a classifier branch that produces it from `USER_NOT_MUTUAL_CONTACT` — that string must produce `privacy-blocked`, per D-07. Flag ADD-09's wording for the same "align during planning" treatment the Deferred Ideas section already applies to the channel-full conflict.
**Warning signs:** A classifier test expecting `failed(ADD_NOT_MUTUAL_CONTACT)` for `USER_NOT_MUTUAL_CONTACT` — this test is testing the wrong (REQUIREMENTS.md-literal, D-07-contradicting) behavior.

### Pitfall 5: `USER_ALREADY_PARTICIPANT` on `InviteToChannel` is unconfirmed — may not throw at all
**What goes wrong:** D-06 requires `already-member` when the target is already a participant. Official docs confirm `USER_ALREADY_PARTICIPANT` as a thrown error for `messages.addChatUser` (basic groups), but **do not** list it for `channels.inviteToChannel` — for channels, Telegram historically either silently no-ops (returns success, no-op updates) or omits the already-member user from `missing_invitees` without any error at all.
**Why it happens:** Undocumented RPC behavior difference between the legacy basic-group RPC and the channel RPC.
**How to avoid:** Do not assume `InviteToChannel` throws for an existing member. Treat it defensively: if the call succeeds with no error and no corresponding `missing_invitees` entry for the target, but the target was already confirmed `member` by Phase 13's scan data, classify as `already-member` from the **scan status already known pre-run**, not purely from a thrown error. Verify this behavior against a live account before trusting a test-only assumption.
**Warning signs:** A production run where an already-member target in a channel silently reports `done` instead of `already-member` because no error was ever thrown.

### Pitfall 6: `expire_date` on `ExportChatInvite` — absolute vs. relative is undocumented by core.telegram.org
**What goes wrong:** Official docs for `messages.exportChatInvite` describe `expire_date` only as "the specified expiration date" without stating absolute-unix-seconds vs. relative-seconds-from-now.
**Why it happens:** Telegram's method-reference pages are thin on semantics for `int`-typed date fields; the convention is inferred from sibling fields (`chatInviteExported.date`, `chatInviteExported.expire_date`, both `int` in the same TL object, where `date` is unambiguously an absolute creation timestamp).
**How to avoid:** Use `Math.floor(Date.now()/1000) + 5*24*60*60` (absolute unix seconds), consistent with every other `int`-typed date field in the TL schema (`untilDate` in `ChatBannedRights`, `date` in `ChatInviteExported`, etc. — all absolute). This is [ASSUMED] at MEDIUM confidence from TL convention consistency, not a documented guarantee — verify the returned `ChatInviteExported.expireDate` round-trips correctly against a live or sandbox account during implementation.
**Warning signs:** A link that expires immediately (if the field were relative-from-send and a huge future absolute value were passed) or never-expires (opposite mismatch).

### Pitfall 7: 32-character title limit (D-11) is a user-asserted constraint, not found in official docs
**What goes wrong:** `messages.exportChatInvite`'s official error table lists no explicit title-length error, and no length limit is documented on `core.telegram.org`.
**Why it happens:** CONTEXT.md's D-11 states "truncated to Telegram's 32-character title limit" — this appears to be prior project/user knowledge not sourced from the docs fetched during this research session.
**How to avoid:** Truncate to 32 chars as locked by D-11 regardless (it is a locked decision, not up for research debate), but tag the *limit value itself* `[ASSUMED]` in the Assumptions Log so a live-account check can confirm Telegram doesn't reject or silently truncate at a different length.
**Warning signs:** `TITLE_INVALID` or similar on a real account with a 32-char title, or Telegram accepting titles longer than 32 chars (meaning the truncation is unnecessarily aggressive, not wrong).

## Code Examples

### Confirmed layer-229 constructor IDs (verified against installed `telegram@2.26.22`)
```
InvitedUsers:        0x7f5defa6   (messages.InvitedUsers)
MissingInvitee:       0x628c9224
InviteToChannel:      0xc9e33d54  (channels.inviteToChannel)
AddChatUser:          0xcbc6d107  (messages.addChatUser)
ExportChatInvite:     0xa455de90  (messages.exportChatInvite)
ChatInviteExported:   0xa22cbd96
AddContact:           0xd9ba2e54  (contacts.addContact)
SendMessage:          0xfef48f62  (messages.sendMessage)
EditBanned:           0x96e6cd81  (channels.editBanned — already in use by RemovalExecutor)
LAYER:                229
```
Verification commands run this session:
```bash
node -e "
const { Api } = require('telegram');
console.log(Api.messages.InvitedUsers.CONSTRUCTOR_ID.toString(16));
console.log(Api.channels.InviteToChannel.CONSTRUCTOR_ID.toString(16));
console.log(Api.messages.AddChatUser.CONSTRUCTOR_ID.toString(16));
console.log(Api.messages.ExportChatInvite.CONSTRUCTOR_ID.toString(16));
console.log(Api.contacts.AddContact.CONSTRUCTOR_ID.toString(16));
console.log(require('telegram/tl/AllTLObjects').LAYER);
"
# → 7f5defa6 / c9e33d54 / cbc6d107 / a455de90 / d9ba2e54 / 229
```

### Confirmed request/response field shapes (from `node_modules/telegram/tl/api.d.ts`)
```typescript
// channels.inviteToChannel
export class InviteToChannel extends Request<Partial<{
  channel: Api.TypeEntityLike
  users: Api.TypeEntityLike[]
}>, messages.TypeInvitedUsers> {}

// messages.addChatUser
export class AddChatUser extends Request<Partial<{
  chatId: long
  userId: Api.TypeEntityLike
  fwdLimit: int
}>, messages.TypeInvitedUsers> {}

// messages.exportChatInvite
export class ExportChatInvite extends Request<Partial<{
  legacyRevokePermanent?: boolean
  requestNeeded?: boolean
  peer: Api.TypeEntityLike
  expireDate?: int
  usageLimit?: int
  title?: string
  subscriptionPricing?: Api.TypeStarsSubscriptionPricing
}>, Api.TypeExportedChatInvite> {}

// contacts.addContact
export class AddContact extends Request<Partial<{
  addPhonePrivacyException?: boolean
  id: Api.TypeEntityLike
  firstName: string
  lastName: string
  phone: string
  note?: Api.TypeTextWithEntities
}>, Api.TypeUpdates> {}

// channels.editBanned (already used by RemovalExecutor — unchanged)
export class EditBanned extends Request<Partial<{
  channel: Api.TypeEntityLike
  participant: Api.TypeEntityLike
  bannedRights: Api.TypeChatBannedRights
}>, Api.TypeUpdates> {}
```

### Confirmed RPC error vocabulary (verified against `core.telegram.org/method/*` this session)

| Method | Error string | Meaning | Recommended outcome |
|--------|--------------|---------|----------------------|
| `channels.inviteToChannel` | `USER_NOT_MUTUAL_CONTACT` | 403, privacy | `privacy-blocked` (D-07) |
| `channels.inviteToChannel` | `USER_PRIVACY_RESTRICTED` | 403, privacy | `privacy-blocked` (D-07) |
| `channels.inviteToChannel` | `CHAT_ADMIN_REQUIRED` | 403, no rights | `failed(ADD_NO_RIGHTS)` |
| `channels.inviteToChannel` | `USER_KICKED` | 400, previously kicked (cannot rejoin) | `failed(ADD_USER_KICKED)` |
| `channels.inviteToChannel` | `INPUT_USER_DEACTIVATED` | 400, deleted account | `failed(ADD_TARGET_INVALID)` (defensive — D-05 should pre-empt this) |
| `channels.inviteToChannel` | `USER_CHANNELS_TOO_MUCH` | 403, target in too many channels | `failed(ADD_USER_CHANNELS_TOO_MUCH)` |
| `channels.inviteToChannel` | `USERS_TOO_MUCH` | 400, channel at direct-add cap | `privacy-blocked` reason `channel-full` (D-12) — see Pitfall 3 for scope |
| `channels.inviteToChannel` | `CHANNEL_PRIVATE` | 406, admin not joined | `failed(UNKNOWN)` or a new code — not in D-19's list; flag as Open Question |
| `messages.addChatUser` | `USER_NOT_MUTUAL_CONTACT` | privacy | `privacy-blocked` (D-07) |
| `messages.addChatUser` | `USER_PRIVACY_RESTRICTED` | privacy | `privacy-blocked` (D-07) |
| `messages.addChatUser` | `CHAT_ADMIN_REQUIRED` | no rights | `failed(ADD_NO_RIGHTS)` |
| `messages.addChatUser` | `USER_ALREADY_PARTICIPANT` | already in group | `already-member` (D-06) |
| `messages.addChatUser` | `INPUT_USER_DEACTIVATED` | deleted account | `failed(ADD_TARGET_INVALID)` (defensive) |
| `messages.addChatUser` | `USERS_TOO_MUCH` | basic-group cap | `failed(ADD_CHANNEL_FULL)` — no link fallback, see Pitfall 3 |
| `messages.addChatUser` | `USER_KICKED` | CONTEXT.md D-02 asserts this is possible for basic groups; **not** in official docs for this method [MEDIUM] | `failed(ADD_USER_KICKED)` |
| `messages.sendMessage` | `USER_PRIVACY_RESTRICTED` | target's DM privacy | `dmStatus: 'refused'` (D-14) |
| `messages.sendMessage` | `USER_IS_BLOCKED` / `YOU_BLOCKED_USER` | block relationship | `dmStatus: 'refused'` |
| `messages.sendMessage` | `PRIVACY_PREMIUM_REQUIRED` | target requires Premium to receive DMs | `dmStatus: 'refused'` |
| `contacts.addContact` | `CONTACT_NAME_EMPTY` | firstName was empty | surface as `{ ok: false, code: 'CONTACT_NAME_EMPTY' }` from the non-blocking service (D-08) |
| any governed call | `PEER_FLOOD` | global flood protection | hard-stop (existing `classifyRpcError`, unchanged) |

All rows sourced from `core.telegram.org/method/channels.inviteToChannel`, `.../messages.addChatUser`, `.../messages.sendMessage`, `.../contacts.addContact`, `.../messages.exportChatInvite` (fetched this session) — tagged `[CITED: core.telegram.org]`. The `messages.addChatUser` / `USER_KICKED` row is tagged `[ASSUMED]` per CONTEXT.md D-02's own caveat, not found in the official error table for that method.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| TagExecutor's two-phase layer-224 connection (`tagClient.ts`, `restoreMainClientLayer`) | Single ambient layer-229 client, all writes via the one shared `client` | Quick task 261003-jni (2026-10-03), consolidated by Phase 13 TAG-07 | AddExecutor needs **no** second client or layer juggling at all — every RPC in this phase goes through the same `client`/`governor` RemovalExecutor and TagExecutor already share |

**Deprecated/outdated:** None relevant to this phase's RPCs — all six constructors are current, non-deprecated TL objects at layer 229.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `expire_date` on `ExportChatInvite`/`ChatInviteExported` is absolute unix seconds, not relative | Code Examples Pattern 4, Pitfall 6 | A link expires immediately or never, defeating D-10's 5-day constraint; must live-verify the round-trip |
| A2 | Telegram enforces a 32-character title limit on `ExportChatInvite.title` | Pattern 4, Pitfall 7 | Truncation either unnecessary (limit is actually higher) or insufficient (limit is lower, causing `TITLE_INVALID`); low risk since D-11 locks the truncation behavior regardless, but the exact number should be confirmed |
| A3 | `channels.inviteToChannel` does not throw for an already-participating user (silently no-ops or omits from `missing_invitees`) | Pitfall 5 | If it actually throws `USER_ALREADY_PARTICIPANT` (undocumented for this method), the classifier needs an explicit branch; if it silently succeeds with no signal at all, must rely on pre-run scan status instead of the RPC response |
| A4 | `messages.addChatUser` can throw `USER_KICKED` for a previously-kicked basic-group member (per CONTEXT.md D-02, not in official docs) | Code Examples error table | If the real error string differs, `ADD_USER_KICKED` never fires and the outcome falls through to `UNKNOWN` instead — degrades error-message quality, not correctness |
| A5 | `USERS_TOO_MUCH` on `messages.addChatUser` (basic group) should be `failed(ADD_CHANNEL_FULL)` with no link fallback | Pitfall 3 | If the user actually wants the same link-fallback behavior as broadcast channels, this under-serves the admin (a failed add instead of a usable link); needs explicit confirmation during planning/discuss |
| A6 | `contacts.AddContact` accepts `phone: ''` without error (per official docs' explicit statement) | Pattern 5 | Low risk — if wrong, the contact-add call fails and the non-blocking `{ ok: false }` path (D-08) absorbs it gracefully regardless |
| A7 | `TargetResolver` can be safely extended with `_resolvedDeleted`/`_resolvedBot`/`_resolvedContact`/`_resolvedMutualContact` private fields without affecting Removal/Tag's existing `getResolvedUser()` consumers | Pitfall 1, Code Examples Pattern 5 | Low risk — purely additive; Removal/Tag destructure only `{id, accessHash, name}` today and would be unaffected by extra fields on the return object |

## Open Questions (RESOLVED in planning — see 14-07-PLAN.md `<behavior>` block, D-20)

1. **"Same run" equality rule for continuation-based resume (Pattern 1)** — RESOLVED (D-20): `ADD_START` passes a `resume` hint computed from `addAuditStore.readJob()`; `AddExecutor` re-validates same `targetId` + order-insensitive `dialogIds` set (`sameDialogIdSet`) before continuing the old jobId, else starts a fresh job.
   - What we know: D-13/D-18 require job-id continuity across stop→resume segments; D-16 says detection+IPC are this phase's job, the Resume/Discard *prompt* is Phase 15's.
   - What's unclear: the exact trigger condition `execute()` (or a distinct method) uses to decide "this call continues job X" vs. "this is a genuinely new run" — target-id match alone, or target-id + identical `dialogIds` set, or an explicit flag passed down from the IPC layer (which itself would need to read `addAuditStore.readJob()` before calling `executor.execute()`)?
   - Recommendation: decide in planning. The cleanest options are (a) the IPC handler (`addChannels.ts`'s `ADD_START`) reads the existing job itself and passes an explicit `{ resume: boolean }` flag into `execute()`, keeping `AddExecutor` itself simple, or (b) `AddExecutor.execute()` does the detection internally (shown in Pattern 1) so the IPC contract stays identical to Removal/Tag's `{ dialogIds, ...options }`. Option (a) is more explicit and testable; option (b) requires fewer IPC surface changes.

2. **`USERS_TOO_MUCH` on basic groups — link fallback or hard failure? (Pitfall 3 / A5)** — RESOLVED: basic group → `failed(ADD_CHANNEL_FULL)`, no link; broadcast/supergroup → `privacy-blocked` reason `channel-full` + inline link (Plan 14-08).
   - What we know: D-12 explicitly scopes the link-fallback behavior to broadcast channels hitting `InviteToChannel`'s cap.
   - What's unclear: whether the same user-friendly link-fallback should extend to basic groups hitting their own member cap via `AddChatUser`.
   - Recommendation: default to `failed(ADD_CHANNEL_FULL)` (no link) for basic groups per the literal scope of D-12, but flag this explicitly for user confirmation during `/gsd:discuss-phase` or planning — it's a one-line decision, not a research gap.

3. **`CHANNEL_PRIVATE` on `InviteToChannel` — not in D-19's error-code vocabulary** — RESOLVED: maps to `failed(UNKNOWN)` (Plan 14-08).
   - What we know: official docs list `CHANNEL_PRIVATE` (406) as a possible error for `channels.inviteToChannel` ("You haven't joined this channel/supergroup").
   - What's unclear: this should be structurally impossible in practice (the admin is enumerating their own dialogs, so they're necessarily joined) — but defensive classification still needs a bucket. D-19's code list has no `ADD_CHANNEL_PRIVATE` equivalent.
   - Recommendation: map to `failed(UNKNOWN)` (safe default per D-19's unmapped-error rule) rather than inventing a new code for an error that should never realistically occur.

4. **Does `InviteToChannel`'s success response ever include updates that reveal "already a member" without an error or a `missing_invitees` entry? (A3)** — RESOLVED: dual signal — pre-run scanner status `member` short-circuits with zero RPCs; runtime `USER_ALREADY_PARTICIPANT` is the defensive second signal (Plans 14-07/14-08).
   - What we know: the TL response only exposes `updates` + `missingInvitees`; no documented "already present" signal distinct from silent success.
   - What's unclear: whether to rely purely on the pre-run Phase-13 scan status (`already-member` addGreyReason — though those rows are greyed/non-selectable in the UI per Phase 13 D-07, so they shouldn't even reach the executor) or add a defensive post-hoc check.
   - Recommendation: trust Phase 13's `addGreyReason: 'already-member'` filtering at the UI layer (Phase 15) to prevent already-member dialogs from ever being selected; the executor only needs to handle the *mid-run* case (target joined between scan and run) via whatever signal the live RPC actually returns — confirm with a live-account smoke test during implementation, since this is unverifiable from documentation alone.

## Environment Availability

Skipped — this phase has no new external dependencies. It reuses the already-verified GramJS client (`telegram@2.26.22`, TL layer 229, confirmed installed and ambient this session), the existing governor/enumerator/resolver/audit-store infrastructure, and `electron-store` (already a dependency). `npx tsc --build` (project references via root `tsconfig.json` → `tsconfig.node.json`/`tsconfig.web.json`) and `npx vitest run` are the existing verification commands; no new tool installation is required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 (confirmed via `npx vitest --version`) |
| Config file | Project-level Vitest config (no new config needed — mirrors `removalExecutor.test.ts`/`tagExecutor.test.ts`, which use the shared root config) |
| Quick run command | `npx vitest run src/main/telegram/addExecutor.test.ts` |
| Full suite command | `npx tsc --build && find src -name '*.js' -newer package.json -delete 2>/dev/null; find src -name '*.d.ts' -newer package.json -delete 2>/dev/null; npx vitest run` (CLAUDE.md: delete stray emitted `.js`/`.d.ts` beside sources before running Vitest, or they shadow the edited `.ts` sources) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| ADD-06 | InviteToChannel/AddChatUser dispatch by dialog type, governed, ~3s pacing | unit | `npx vitest run -t "per-group dispatch" src/main/telegram/addExecutor.test.ts` | ❌ Wave 0 |
| ADD-06 | FLOOD_WAIT absorbed via governor with countdown forwarded | unit | `npx vitest run -t "FLOOD_WAIT" src/main/telegram/addExecutor.test.ts` | ❌ Wave 0 |
| ADD-06 | PEER_FLOOD hard-stops, remaining groups NOT skipped | unit | `npx vitest run -t "PEER_FLOOD hard-stop" src/main/telegram/addExecutor.test.ts` | ❌ Wave 0 |
| ADD-07 | Banned target: EditBanned (own governor.run()) before invite | unit | `npx vitest run -t "unban-first" src/main/telegram/addExecutor.test.ts` | ❌ Wave 0 |
| ADD-07 | Ban stays lifted when subsequent invite fails (D-04) | unit | `npx vitest run -t "ban stays lifted" src/main/telegram/addExecutor.test.ts` | ❌ Wave 0 |
| ADD-08 | Per-group checkpoint to `add-job.json`, atomic write, 0o600 | unit | `npx vitest run src/main/storage/addAuditStore.test.ts` | ❌ Wave 0 |
| ADD-08 | Resume preserves jobId + outcomes across segments (Pattern 1) | unit | `npx vitest run -t "resume" src/main/telegram/addExecutor.test.ts` | ❌ Wave 0 — this is the highest-value new test per the Summary's critical finding |
| ADD-09 | Outcome vocabulary + error-code mapping (table in Code Examples) | unit | `npx vitest run -t "outcome classification" src/main/telegram/addExecutor.test.ts` | ❌ Wave 0 |
| ADD-10 | ExportChatInvite called inline on privacy-block, usageLimit=1, expireDate=+5d | unit | `npx vitest run -t "invite link" src/main/telegram/addExecutor.test.ts` | ❌ Wave 0 |
| ADD-11 | One SendMessage at run completion with all accumulated links; refusal → dmStatus:'refused' | unit | `npx vitest run -t "direct message" src/main/telegram/addExecutor.test.ts` | ❌ Wave 0 |
| ADD-05 (main half) | contacts.AddContact non-blocking, skip-if-already-contact | unit | `npx vitest run src/main/contacts/contactService.test.ts` (or wherever placed) | ❌ Wave 0 |
| ADD-14 (main half) | add-log.txt append-only, one block per run, 0o600 | unit | `npx vitest run src/main/storage/addLogStore.test.ts` | ❌ Wave 0 |
| ADD-16 (main half) | Template store get/set, default by language, render function | unit | `npx vitest run src/main/ipc/templateChannels.test.ts` (or equivalent) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run -t "<describe block>" <file>` for the file(s) touched.
- **Per wave merge:** `npx tsc --build` (delete stray `.js`/`.d.ts` beside sources per CLAUDE.md) then `npx vitest run` (full suite — 31+ files, 375+ tests as of Phase 13's baseline).
- **Phase gate:** full suite green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/main/telegram/__mocks__/telegramClient.ts` — extend with `InviteToChannel`, `AddChatUser`, `ExportChatInvite`, `SendMessage`, `AddContact` dispatch branches, call-recording arrays, and a way to inject `missingInvitees` (mirrors the existing `editBannedCalls`/`tagErrorDialogIds` pattern). This is a prerequisite for every other test file in this phase.
- [ ] `src/shared/addTypes.ts` — new type module (no existing file).
- [ ] `src/main/storage/addAuditStore.ts` + `.test.ts` — new, with the continuation-aware `readJob()`/resume contract (Pattern 1) as a first-class test, not an afterthought.
- [ ] `src/main/storage/addLogStore.ts` + `.test.ts` — new, append-only plain-text writer.
- [ ] `src/main/telegram/AddExecutor.ts` + `addExecutor.test.ts` — new, cloned from `RemovalExecutor`/`removalExecutor.test.ts` shape per the Primary recommendation.
- [ ] `TargetResolver.ts` extension (Pitfall 1) — no new test *file*, but `targetResolver.test.ts` (existing) needs new assertions for the extended `getResolvedUser()` shape.
- [ ] `src/main/ipc/addChannels.ts` + contact/template IPC modules + `.test.ts` files — new, mirror `tagChannels.ts`'s security-gate pattern.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|---------------------|
| V2 Authentication | no | No new auth surface — reuses existing `getAuthState()` gate pattern from `removalChannels.ts`/`tagChannels.ts` |
| V3 Session Management | no | No change to session handling |
| V4 Access Control | yes | Dialog-id cross-check against `enumerator.getState().dialogs` (mirrors T-05-05-A/T-10-07) — renderer cannot inject groups not in the current enumeration; identity (`resolved.id`/`accessHash`) read exclusively from `resolver.getResolvedUser()` in main, never accepted from IPC payload (T-05-04-B invariant, unchanged) |
| V5 Input Validation | yes | Zod schemas for `ADD_START` (`dialogIds`, run options — no identity fields), template get/set (string length bound), contact-add trigger (no payload beyond confirmation) |
| V6 Cryptography | no | No new crypto surface — `randomId` for `SendMessage` is a non-secret, server-visible dedupe nonce (not a security boundary), generated via `node:crypto.randomBytes` for correctness (64-bit uniqueness), not confidentiality |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Renderer injects a `dialogId` not in the current enumeration to trigger an invite into an unintended group | Tampering | Dialog-map cross-check in `addChannels.ts` (mirrors `removalChannels.ts` T-05-05-A exactly) |
| Renderer attempts to pass target identity (id/accessHash) directly in the `ADD_START` payload | Tampering / Elevation | Zod schema admits only `{ dialogIds, options }`; `AddExecutor.execute()` reads identity exclusively from `resolver.getResolvedUser()` (T-05-04-B invariant) |
| `add-job.json` or `add-log.txt` readable by other OS users | Information Disclosure | Mode `0o600` on both, mirroring `removal-job.json`/`tag-job.json`'s existing pattern |
| A second `ADD_START` call while a run is active overwrites the active job mid-run | Tampering / DoS | Double-start guard (`currentStep === 'running' \|\| 'stopping'` → return current state without dispatching), mirrors T-05-05/T-10-09 exactly |
| Contact-add or DM-send accidentally exposes target's phone number or accessHash to the renderer | Information Disclosure | `contacts.AddContact` call and its `{ ok, code? }` response never include the target's resolved identity fields; DM text is built and sent entirely in main, renderer never sees the rendered message body with identity baked in beyond what it already displays via `ResolvedTargetDTO` |

## Sources

### Primary (HIGH confidence)
- `node_modules/telegram/tl/api.d.ts` (installed `telegram@2.26.22`, patched to layer 229 via `scripts/tl-apply.mjs`) — confirmed field names (`missingInvitees`, `premiumWouldAllowInvite`, `premiumRequiredForPm`, `userId`, `expireDate`, `usageLimit`, `requestNeeded`, `title`, `fwdLimit`, `chatId`, `firstName`, `lastName`, `phone`) and constructor IDs for `InvitedUsers`, `MissingInvitee`, `InviteToChannel`, `AddChatUser`, `ExportChatInvite`, `ChatInviteExported`, `AddContact`, `SendMessage`, `EditBanned`.
- `vendor/telegram-api.tl` (git-tracked layer-229 TDLib schema) — confirmed TL definitions: `missingInvitee#628c9224`, `messages.invitedUsers#7f5defa6`, `messages.addChatUser#cbc6d107`, `channels.inviteToChannel#c9e33d54`, `messages.exportChatInvite#a455de90`, `chatInviteExported#a22cbd96`, `contacts.addContact#d9ba2e54`, `messages.sendMessage#fef48f62`.
- `node -e "require('telegram')..."` live introspection this session — confirmed `LAYER === 229` and all constructor IDs resolve (no `TypeNotFoundError`).
- Existing shipped code read in full this session: `src/main/telegram/RemovalExecutor.ts`, `TagExecutor.ts`, `operationErrors.ts`, `governor.ts`, `errors.ts`, `src/main/storage/auditStore.ts`, `tagAuditStore.ts`, `src/main/ipc/removalChannels.ts`, `tagChannels.ts`, `severityChannels.ts`, `src/shared/removalTypes.ts`, `tagTypes.ts`, `groupTypes.ts`, `channels.ts`, `src/main/index.ts`, `src/main/telegram/__mocks__/telegramClient.ts`, `src/main/telegram/TargetResolver.ts` (partial).

### Secondary (MEDIUM confidence)
- `core.telegram.org/method/channels.inviteToChannel`, `.../messages.addChatUser`, `.../messages.sendMessage`, `.../contacts.addContact`, `.../messages.exportChatInvite` — fetched this session (WebFetch); each page's error table and parameter descriptions are official but thin on some semantics (expire_date absolute-vs-relative, title length limit not stated).
- `.planning/quick/261003-jni-move-gramjs-client-to-tl-layer-229-schem/261003-jni-SUMMARY.md` — confirms the layer-229 migration's scope and explicitly flags that `TagExecutor.ts`'s comments (not logic relevant to this phase) were intentionally left for Phase 13's cleanup, already completed.

### Tertiary (LOW confidence)
- None used as a basis for any locked recommendation in this document — all WebSearch findings were cross-verified against `core.telegram.org` official pages before being cited above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all reused code already shipped and tested.
- Architecture (dispatch mechanics): HIGH — all six RPC constructors and field shapes directly verified against the installed package and vendored schema.
- Architecture (resume/continuation design): HIGH confidence in the *problem* (CONTEXT.md's D-13/D-18 genuinely require it) and the *recommended shape* (Pattern 1), MEDIUM on the exact trigger-condition detail (flagged as Open Question 1 — a planning decision, not a research gap).
- Pitfalls: HIGH for the TargetResolver gap and the resume-continuation gap (both directly observed in the current codebase); MEDIUM for the undocumented RPC-shape specifics (A1, A3, A4, A7) which require live-account verification before being treated as settled.

**Research date:** 2026-10-03
**Valid until:** 30 days (stable dependency: GramJS pinned, layer 229 ambient and unlikely to change again soon; the undocumented RPC-shape items (A1, A3, A4) should be re-verified at implementation time regardless of staleness, via a live-account smoke test as Phase 13 did for its `left` polarity question)
