# Member Tag Action — Design Spec

**Date:** 2026-06-20
**Status:** Spike complete (§3) — design revised; ready for Phase 1 planning
**Author:** brainstormed with Claude

## 1. Summary

Add **Tag** as a third action in MrProper, alongside the existing Kick and Ban. The
administrator resolves a target user (existing flow), selects groups (existing flow),
enters **one tag string**, confirms, and the app sets that member tag identically across
every selected supergroup/channel — using the existing throttled, resumable, audited
execution machinery.

The feature targets Telegram's **Member Tags** feature (shipped March 2026): a short label
displayed next to a member's name. A member tag does **not** require the member to be an admin —
it is the `rank` string extended to ordinary members (`rank:flags.2?string` on the plain
`channelParticipant` constructor).

**Setter (confirmed by the §3 spike):** the tag is written via
**`messages.editChatParticipantRank(peer, participant, rank)`** (constructor `a00f32b0`), issued at
**protocol layer 224** — *not* `channels.editAdmin`, which the spike proved inert on member tags.
Stock GramJS 2.26.22 lacks both the method and layer-224 support, so the design vendors a single
hand-serialized request and issues it over an isolated layer-224 connection (see §4, §7).

## 2. Scope

**In scope (v1):**

- Assign **one** tag string to the resolved target across **all selected** supergroups/channels.
- Reuse the existing resolve → select → confirm → throttled-run → results pipeline.
- "Write-only" model: issue the tag and trust the server `Updates` response. **No reading
  back / displaying of existing tags.**

**Out of scope (YAGNI):**

- Clearing/removing an existing tag (setting empty).
- Different tags per group.
- Basic-group ("legacy") support — member tags are a channels-namespace feature.
- Reading or displaying a member's current tag in the UI (requires GramJS TL-schema work — see §7).
- Replacing the removal feature. Kick/Ban remain unchanged.

## 3. Phase 0 — Empirical Verification Spike (GATES EVERYTHING)

Public MTProto method docs lag the live feature, and the official client cannot be traffic-
introspected (SSL pinning). Therefore Phase 0 is an **empirical** test, not a documentation
exercise. It is a **throwaway Node script** (`scripts/spike-member-tag.mjs`) — no production
code is committed.

> **Note on session:** the script performs its **own fresh interactive GramJS login**
> (`StringSession` + `client.start()`, api_id/api_hash from `.env`). It does **not** reuse the
> app's production session — that is encrypted via Electron `safeStorage` (Keychain/DPAPI),
> which is only decryptable inside the Electron main process, not from a plain Node script.

The script:

1. Resolves a **non-admin** test member in a test supergroup the admin controls.
2. Calls `channels.EditAdmin({ channel, userId, adminRights: ChatAdminRights{all-false}, rank: "TESTTAG" })`.
3. **Operator looks at the Telegram client** — does `TESTTAG` appear as a member tag on that
   non-admin member (matching the observed "membertag" badge), or did it demote / error?
4. Repeats against an **already-admin** member, observing what happens to that admin's
   existing rights and title.
5. Tries an over-long string to observe the max length / charset constraint.

### Questions the spike must answer

| # | Question | Decides |
|---|----------|---------|
| Q1 | Does layer-198 `editAdmin + rank` with all-false rights set a member tag on a non-admin (vs demote/error)? | Whether v1 is buildable on stock GramJS at all |
| Q2 | What happens to an **already-admin** target's rights/title when called this way? | The deferred already-admin handling decision (§5) |
| Q3 | Which admin right must the **acting** account hold to set another member's tag? Interaction with the group "Edit Own Tags" permission? | Pre-flight rights check / `TAG_NO_RIGHTS` classification |
| Q4 | Max tag length and allowed charset? | Renderer input validation |
| Q5 | Confirmed: basic groups unsupported? | Per-type dispatch (§4) |

### Branch on the result

> **⚠️ SUPERSEDED:** The spike disproved this section's framing. The premise — that
> `editAdmin + rank` is the member-tag setter — was **wrong**. The real setter is
> **`messages.editChatParticipantRank`**, and the feature **is buildable on stock GramJS
> 2.26.22** via the technique the spike proved. See "Spike findings — FINAL" below; §4 and §7
> need revision accordingly.

**Deliverable:** the findings below.

### Spike findings — FINAL (2026-06-20)

**GramJS under test:** 2.26.22 (npm latest; runtime banner says 2.26.21), default LAYER 198.
**Test group:** "Testovací 🌹" — `Channel`/megagroup, id `3906767609`, caller is creator.
**Non-admin target:** "Simple SIM" `@testovaci42`, id `8471834904` — plain member, pre-existing tag `"tag"`.

**THE KEY FINDING — the setter is NOT `editAdmin`:**

```
messages.editChatParticipantRank#a00f32b0 peer:InputPeer participant:InputPeer rank:string = Updates
```

This `messages`-namespace method (NOT `channels.editAdmin`) is the member-tag setter. Proven
end-to-end: hand-crafting this request and sending it at **layer 224** changed the target's tag
`"tag"` → `"testtag"` on a **non-admin, with no promotion**, confirmed by reading
`channelParticipant.rank` back from the raw response bytes. Tag was then restored to `"tag"`.

| Q | Finding |
|---|---------|
| **Setter** | `messages.editChatParticipantRank(peer, participant, rank)`. `channels.editAdmin + rank` is **inert** on member tags (tried at layers 198 *and* 224 — tag stayed `"tag"`; that confirmed the original design premise was wrong). |
| **Non-admins** | ✅ Tag set on a plain member; participant stays `channelParticipant#1bd54456` (flags=4, rank bit only). **No promotion.** Resolves §5 in part: tagging does not touch admin status. |
| **Layer** | The method + reading require **layer 224**. Per-call `InvokeWithLayer` is rejected (`CONNECTION_LAYER_INVALID`); the whole connection must negotiate 224 (patch `AllTLObjects.LAYER` before connect — GramJS reads it at connect-time). |
| **Permissions** | Schema shows `chatAdminRights.manage_ranks` (flags.18 — admin sets *others'* tags) and `chatBannedRights.edit_rank` (flags.26 — the "Edit Own Tags" member self-serve permission). |
| **Reading** | `channelParticipant` gained `rank:flags.2?string` at the new layer. Readable at 224. |
| **Max length / charset** | Not yet measured (deferred to implementation — try over-long strings via the proven path). |
| **Basic groups** | `editChatParticipantRank` takes `InputPeer`, so it may work on basic `Chat` too (not yet tested). The earlier channels-only assumption may not hold — verify in Phase 1. |

**GramJS reality:** npm's latest `telegram` is still **2.26.22** (Feb 2025) — it has neither
`editChatParticipantRank` nor layer-224 constructors. **No dependency-upgrade shortcut exists.**

**DECISION: FEASIBLE — build it.** Confirmed buildable on stock GramJS 2.26.22 using the spike's
proven technique:
1. Resolve target + groups with the existing layer-198 client (unchanged).
2. For tag writes, use a **layer-224 connection** (patch `LAYER` before connect) and a
   **hand-defined `editChatParticipantRank` request** (id `a00f32b0`; serialize
   `InputPeer` + `InputPeer` + TL-string rank — see `scripts/spike-member-tag.mjs`).
3. **Write-only** fits perfectly: `editChatParticipantRank` returns an *empty* `Updates` that
   parses fine even at 198 — so the tag client never has to parse layer-224 dialog/participant
   responses (those are done by the 198 client; ids+accessHashes are passed across).

The open design problem is the **global `LAYER` coordination** (it's a module-level constant, so a
naive patch would force the *main* 198 client to 224 and break its dialog/participant parsing).
§4 and §7 must be revised around a dedicated, isolated layer-224 tag connection.

**§5 already-admin:** partly resolved — tagging a non-admin does not promote. The
read-modify-write concern for *existing admins* still needs a Phase-1 decision (does
`editChatParticipantRank` on an admin disturb their `editAdmin` rank/rights?). One more probe.

**Raw notes / surprises:**

> - The non-admin target carried a pre-existing member tag `"tag"`, which made the negative result
>   unambiguous: a successful `editAdmin(rank:"testtag")` left it as `"tag"`.
> - `editAdmin` with all-false `ChatAdminRights` does NOT promote a non-admin (useful to know).
> - `client.getEntity(<bare numeric id>)` resolves as `PeerUser` and fails for groups — the script
>   now resolves numeric group ids via the dialog list instead.
> - `StringSession` is exported from `telegram/sessions`, not the package root.
> - **Layer-override experiment (2026-06-20):** wrapping `editAdmin` in `InvokeWithLayer(N)`
>   for N ∈ {214, 220, 224} was **rejected by the server with `CONNECTION_LAYER_INVALID`** at
>   every value — the call never executed. Per-call layer override is not viable mid-session
>   (`InvokeWithLayer` must wrap `InitConnection` during the connection handshake). Conclusion
>   reinforced: there is no per-request shortcut; honoring the member-tag layer requires the
>   whole connection to negotiate it, i.e. a GramJS client whose TL schema + LAYER match.

## 4. Architecture (revised after the spike)

> This section was rewritten once the spike (§3) proved the setter is
> `messages.editChatParticipantRank` at layer 224 — **not** `channels.editAdmin`.

Reuse-first, mirroring the removal pipeline. `TagExecutor` is a **parallel class** to
`RemovalExecutor` (not a refactor) to avoid destabilizing the shipped v1.0 removal path. It reuses
the existing patterns verbatim: generation-token guard (D-15), abort → mark-remaining-skipped,
per-group checkpoint before advancing, inter-group pacing (2s + jitter), PEER_FLOOD hard-stop,
FLOOD_WAIT handling via the shared `RateLimitGovernor`, and resume via an audit job file. The two
substantive differences from `RemovalExecutor` are (a) the per-group call and (b) that the call is
issued over a **separate layer-224 connection** (see §4.3).

| Concern | Removal (existing) | Tag (new) |
|---------|--------------------|-----------|
| Executor | `RemovalExecutor` | `TagExecutor` (sibling) |
| Shared types | `src/shared/removalTypes.ts` | `src/shared/tagTypes.ts` |
| IPC channels | `src/main/ipc/removalChannels.ts` | `src/main/ipc/tagChannels.ts` |
| Audit job file | `removal-job.json` (0o600) | `tag-job.json` (0o600) |
| Telegram client | shared layer-198 `client` | **dedicated layer-224 `tagClient`** (§4.3) |
| Per-group call | `EditBanned` / `DeleteChatUser` | hand-defined `messages.editChatParticipantRank` |

### New component: `src/main/telegram/tagApi.ts`

GramJS 2.26.22 has no `editChatParticipantRank` class, so we vendor exactly one TL request,
modeled on the proven `scripts/spike-member-tag.mjs` serializer:

```
messages.editChatParticipantRank#a00f32b0 peer:InputPeer participant:InputPeer rank:string = Updates
```

A factory returns a minimal GramJS-compatible request object — `{ classType: 'request',
CONSTRUCTOR_ID: 0xa00f32b0, SUBCLASS_OF_ID: 2331323052, async resolve(){}, getBytes(),
readResult(reader) }` — where `getBytes()` concatenates the constructor id (LE) +
`InputPeerChannel.getBytes()` + `InputPeerUser.getBytes()` + a TL-string-encoded rank. (Reuse
GramJS's `Api.InputPeerChannel` / `Api.InputPeerUser` for the two peers; implement the TL-string
encoder per the spike.) `readResult` reads the response generically; the response is an **empty
`Updates`** that parses fine even at layer 198 (verified), so the tag client never has to parse
layer-224 dialog/participant constructors.

### 4.1 Per-group dispatch

For each selected group, `TagExecutor` builds `InputPeerChannel{ channelId, accessHash }` (group)
and `InputPeerUser{ userId, accessHash }` (target) from ids+accessHashes **resolved by the main
layer-198 client** (GroupEnumerator entity map + `resolver.getResolvedUser()`), then issues the
`editChatParticipantRank` request through the **`tagClient`** (§4.3), wrapped in the shared
`governor.run()` for account-wide throttling.

- **supergroup / broadcast-channel** → `InputPeerChannel` + the tag write.
- **basic-group (`Chat`)** → **probed (2026-06-20):** `editChatParticipantRank` with `InputPeerChat`
  was **accepted by the server** (no RPC error; the response was an unparseable layer-224 `Updates`,
  i.e. processed), and `chatParticipant` carries `rank:flags.0?string` per schema. However the
  round-trip was **not cleanly confirmed** (the only safe self-target was the chat *creator* — a
  confound — and layer-198 reads can't surface basic-chat rank; real third-party members were not
  tagged to avoid a visible side effect). Basic groups are a **legacy, low-value** case. **v1
  decision: skip** basic groups (`TAG_UNSUPPORTED_BASIC_GROUP`); support is plausible and can be
  added later if a real need appears.
- Target/group identity always comes from the **main process**, never the renderer payload
  (preserves the T-05-04-B invariant). The IPC payload carries only `dialogIds` + the `tag` string.

### 4.2 Outcome model

- Outcome statuses: `done | skipped | failed`.
- `TagErrorCode` (mapped from `editChatParticipantRank` RPC errors — exact strings confirmed in
  Phase 1, candidates from the schema/observed behavior):
  - `TAG_NO_RIGHTS` — caller lacks the `manage_ranks` admin right (likely `CHAT_ADMIN_REQUIRED`
    or a `RIGHT_FORBIDDEN`-style error).
  - `TAG_TARGET_IS_ADMIN` — target is already an admin; skipped to avoid clobbering their custom
    title (§5). Detected from participant data before the call (not an RPC error).
  - `TAG_RANK_INVALID` — rank rejected (length/charset).
  - `TAG_USER_NOT_PARTICIPANT` — target not a member of this group.
  - `TAG_UNSUPPORTED_BASIC_GROUP` — basic group, pending §4.1 verification.
  - `TAG_CHANNEL_PRIVATE` / `TAG_USER_INVALID` — inaccessible / unresolvable.
  - `NETWORK`, `UNKNOWN`.
- PEER_FLOOD continues to map to the shared `hard-stop` disposition (resumable), as in removal.

### 4.3 The layer-224 connection (the core new problem)

`editChatParticipantRank` and the layer-224 handshake are required; the main shared `client`
(`src/main/index.ts:145`) runs at **layer 198** and must stay there (its dialog/participant/removal
parsing depends on 198 constructors). `AllTLObjects.LAYER` is a **module-global** read at
connect-time, so the two connections cannot both rely on the constant simultaneously.

**Recommended approach — patch-connect-restore around an isolated `tagClient`:**

1. A second `TelegramClient` (`tagClient`) is created from the **same `StringSession`** as the main
   client (no re-auth — the session string is shared in-process).
2. Just before `tagClient.connect()`: set `AllTLObjects.LAYER = 224`; immediately after connect
   resolves, restore `AllTLObjects.LAYER = 198`. Because `LAYER` is read only at connect-time, the
   `tagClient`'s connection stays pinned at 224 while the constant is back to 198 for everyone else.
3. The **main client must not (re)connect during that brief window.** Mitigations: only open the
   `tagClient` at the start of a tag run (when no removal/enumeration is in flight), and serialize
   via the shared governor. GramJS auto-reconnect on the main client during the window is the one
   real risk — Phase 1 must guard it (e.g. a short mutex / "no main reconnect" assertion).
4. All `tagClient` invokes route through the **shared `governor`** so account-wide rate limiting
   still holds across both connections ("no feature can flood the account").
5. `tagClient` is **write-only** and torn down at the end of the run.

**Alternatives if the reconnect race proves fragile** (note, don't pre-build): (a) vendor a tiny
GramJS patch making `LAYER` an instance option rather than a global; (b) run the tag client in a
separate Node worker/process. Prefer the patch-connect-restore until it demonstrably fails.

## 5. Already-admin targets — RESOLVED (probed 2026-06-20)

Both questions are now answered empirically:

- **Non-admin:** `editChatParticipantRank` tags a plain member and **does not promote** them
  (participant stays `channelParticipant`, rank-only).
- **Existing admin:** probed by tagging an admin (`ChannelParticipantAdmin`, rank `""`) with
  `"PROBEADMIN"`, then restoring. Result: the admin **stayed `ChannelParticipantAdmin` — not
  demoted, rights untouched** (the method has no `admin_rights` parameter, so it is *structurally
  incapable* of changing rights), **but their custom title `rank` was overwritten** (`""` →
  `"PROBEADMIN"`), since admin title and member tag are the **same `rank` field**.

**Decision: skip & flag already-admin targets.** Rights are never at risk, but tagging an admin
would silently clobber their custom admin title — undesirable. The `TagExecutor` detects admin
status (the group's participant data is already available from `GroupEnumerator`/`getParticipants`)
and marks those groups `skipped` with `TAG_TARGET_IS_ADMIN` so the operator handles them manually.
(A future "preserve title" mode could read the admin's current rank first, but that's out of v1 scope.)

## 6. Safety & security

- **Explicit confirmation gate** showing the tag string + selected group count + group list.
- **Target/group identity from the main process only** (T-05-04-B); IPC payload carries only
  `dialogIds` + `tag`.
- **Already-admin protection** per §5 (default skip & flag pending the probe).
- **Account-wide throttling** preserved: `tagClient` invokes go through the **shared governor**,
  so tag writes can't flood the account any more than removals can.
- **Main-client integrity:** the layer-224 window is tightly scoped and restored (§4.3); the main
  198 client's behavior is otherwise untouched.
- `tag-job.json` written `0o600`, like the session and removal job files.

## 7. GramJS reality (revised — confirmed by the spike)

- **Setter:** `messages.editChatParticipantRank#a00f32b0`. **Proven** to set a non-admin's tag
  (`"tag"` → `"testtag"`, then restored) when sent at layer 224. `channels.editAdmin + rank` is
  **inert** on member tags (tested at layers 198 and 224).
- **Layer:** required = **224**. Per-call `InvokeWithLayer` is rejected
  (`CONNECTION_LAYER_INVALID`); the whole connection must negotiate 224 via the patched `LAYER`
  constant at connect-time (verified — handshake at 224 succeeds with stock GramJS).
- **Write-only is the enabler:** `editChatParticipantRank` returns an **empty `Updates`** that
  parses fine at layer 198, so the tag client needs no layer-224 deserialization. (Reading tags
  back *would* require the layer-224 `channelParticipant` constructor — out of scope for v1.)
- **No upstream shortcut:** npm's latest `telegram` is still **2.26.22** (Feb 2025); it has neither
  the method nor layer-224 constructors. Hence the vendored one-method request (§4) + the
  isolated layer-224 connection (§4.3).
- **Permissions (from schema):** `chatAdminRights.manage_ranks` (admin tags others) and
  `chatBannedRights.edit_rank` (member self-tags). Phase 1 may pre-check `manage_ranks` to grey
  out groups where the caller can't tag.

## 8. Renderer / UX

- **Action picker**: Kick / Ban / **Tag** (chosen before the confirmation screen).
- **Tag input**: single text field with live length/charset validation (exact limits measured in
  Phase 1 via the proven path).
- **Confirmation screen**: shows the tag string, target identity, and the selected group list/count.
- **Progress + results**: reused from the removal flow; result rows surface the §4.2 `TagErrorCode`
  values (including already-admin skips and any basic-group skips).

## 9. Testing

- **`tagApi.ts` unit test** — assert the exact serialized bytes of `editChatParticipantRank`
  (constructor id `b0320fa0` LE + `InputPeerChannel` + `InputPeerUser` + TL-string rank), using the
  spike's verified hex as the golden fixture.
- **`TagExecutor` tests** mirroring `removalExecutor.test.ts`: per-group dispatch with a mock
  `tagClient`, already-admin skip, generation-guard invalidation, checkpoint + resume from
  `tag-job.json`, PEER_FLOOD hard-stop, FLOOD_WAIT via the governor.
- **Layer-224 connection lifecycle test** — patch-connect-restore leaves `AllTLObjects.LAYER` at
  198 afterward; `tagClient` invokes route through the shared governor.

## 10. Implementation phasing

0. **Empirical spike — DONE** (§3). Setter, layer, permissions, no-promotion all confirmed; the
   `scripts/spike-member-tag.mjs` serializer is the reference for `tagApi.ts`.
1. **`tagApi.ts` + layer-224 `tagClient`** — vendored `editChatParticipantRank` request and the
   patch-connect-restore connection (§4.3); plus the one already-admin probe (§5) and the basic-
   group probe (§4.1).
2. **Shared types + IPC + audit** — `tagTypes.ts`, `tagChannels.ts`, `tag-job.json` wiring.
3. **`TagExecutor`** — write-only state machine over `tagClient`; per-group dispatch; tests.
4. **Renderer** — action picker, tag input + validation, confirmation, wire to progress/results.

Implementation routes through the project's GSD workflow per CLAUDE.md.
