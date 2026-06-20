# Phase 9: Tag API & Layer-224 Connection - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning
**Source:** Design spec (brainstormed + empirically validated via Phase 0 spike)

<domain>
## Phase Boundary

Build the two foundational pieces the member-tag feature stands on, with **no UI and no
executor yet**:

1. **`src/main/telegram/tagApi.ts`** — a vendored TL request for
   `messages.editChatParticipantRank#a00f32b0 peer:InputPeer participant:InputPeer rank:string = Updates`,
   which GramJS 2.26.22 does not ship. A factory returns a minimal GramJS-compatible request object.
2. **An isolated layer-224 `tagClient`** — a second `TelegramClient` (sharing the main client's
   `StringSession`) that connects at protocol layer 224 via "patch-connect-restore" of the global
   `AllTLObjects.LAYER`, routes all invokes through the **shared `RateLimitGovernor`**, is
   **write-only**, and is torn down after use — without disturbing the main layer-198 client.

Delivers **TAG-02** (and the layer/throttle substrate later phases build on).
</domain>

<decisions>
## Implementation Decisions (LOCKED — proven by the Phase 0 spike)

### Setter method
- The member-tag setter is `messages.editChatParticipantRank` (constructor id `0xa00f32b0`),
  **not** `channels.editAdmin` (proven inert on member tags). Empirically confirmed: it set a
  non-admin's tag at layer 224 with no promotion.

### tagApi.ts serialization
- Mirror the proven serializer in `scripts/spike-member-tag.mjs` (`makeEditChatParticipantRankRequest`
  + `serializeTLString`). Request object shape: `{ className, classType:'request',
  CONSTRUCTOR_ID:0xa00f32b0, SUBCLASS_OF_ID:2331323052, async resolve(){}, getBytes(), readResult() }`.
- `getBytes()` = constructor id (LE) + `Api.InputPeerChannel.getBytes()` + `Api.InputPeerUser.getBytes()`
  + TL-string(rank). `readResult(reader)` = `reader.tgReadObject()`.
- **Golden fixture:** for channel `3906767609`/hash `6143171097270719809`, user
  `8471834904`/hash `-7811701663729573470`, rank `"testtag"`, the bytes are exactly
  `b0320fa0fcbbbc27f98adce800000000419544a790ed40554ca5e8dd18f1f5f801000000a221129ab94297930774657374746167`.
  Use this as the unit-test assertion.

### Layer-224 connection (patch-connect-restore)
- `tagClient = new TelegramClient(new StringSession(<same session string as main>), API_ID, API_HASH, {...})`.
- Immediately before `tagClient.connect()`: set `require('telegram/tl/AllTLObjects').LAYER = 224`;
  immediately after connect resolves: restore `= 198`. GramJS reads `AllTLObjects.LAYER` at
  connect-time (verified: `telegramBaseClient.js`/`TelegramClient.js`), so the mutation pins only
  the tagClient connection at 224; everyone else stays at 198.
- The main client **must not (re)connect during that brief window** — guard it (short mutex /
  "no main reconnect" assertion). This is the one real risk; treat it as a first-class concern.
- All `tagClient` invokes route through the **shared `governor.run()`** (account-wide throttling
  must hold across both connections — "no feature can flood the account").
- **Write-only:** `editChatParticipantRank` returns an empty `Updates` that parses fine at layer
  198, so the tagClient never needs layer-224 deserialization. Do NOT call getDialogs/getParticipants
  on the tagClient.

### Probes already resolved (constraints, not tasks)
- Tagging an **already-admin** keeps their rights but overwrites their title → later phases
  **skip & flag admins**. (Not exercised in this phase, but the tagApi must not assume non-admin.)
- **Basic groups** are skipped in v1.6.

### Security
- Same invariants as removal: target/group identity from the **main process only**; no secrets to
  disk beyond the existing session; tagClient shares the encrypted session, never re-auths.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design contract (authoritative)
- `docs/superpowers/specs/2026-06-20-member-tag-action-design.md` — the full design; read §3
  (spike findings + golden bytes), §4 (architecture, `tagApi.ts`), §4.3 (the layer-224 connection),
  §7 (GramJS reality), §9 (testing).

### Proven reference implementation
- `scripts/spike-member-tag.mjs` — the working serializer (`makeEditChatParticipantRankRequest`,
  `serializeTLString`) and the LAYER patch (`--force-layer`) this phase productionizes.

### Existing patterns to mirror / integrate with
- `src/main/telegram/RemovalExecutor.ts` — invoke + `Api.InputPeerUser`/`InputChannel` + big-integer
  construction conventions.
- `src/main/index.ts` (~line 145) — where the shared layer-198 `client` and the one
  `RateLimitGovernor` are constructed and wired; the `tagClient` slots in alongside.
- `src/main/telegram/governor.ts` — `governor.run()` contract the tagClient invokes must use.
- `src/main/telegram/SessionManager.ts` — how the session string is obtained/persisted (the
  tagClient reuses it).
</canonical_refs>

<specifics>
## Specific Ideas

- Keep `tagApi.ts` tiny and pure (no client/connection logic) — just the request factory + string
  encoder, fully unit-testable against the golden hex.
- The layer-224 connection lifecycle (patch → connect → restore → use → teardown) likely belongs in
  a small dedicated module (e.g. `tagClient.ts` / a `withLayer224Connection` helper) so the race
  window and governor wiring live in one testable place.
- Unit tests (Vitest, mirroring existing telegram tests): golden-byte assertion for tagApi;
  LAYER-restored-to-198 assertion for the connection helper; governor-routing assertion.
</specifics>

<deferred>
## Deferred Ideas

- The `TagExecutor` state machine — Phase 11.
- Shared types / IPC / audit — Phase 10.
- Renderer — Phase 12.
- Reading tags back / clearing tags / basic-group support — out of v1.6 scope.
</deferred>

---

*Phase: 09-tag-api-layer-224-connection*
*Context gathered: 2026-06-20 from the validated design spec*
