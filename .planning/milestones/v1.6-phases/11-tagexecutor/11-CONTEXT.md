# Phase 11: TagExecutor - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build `src/main/telegram/TagExecutor.ts` — a **parallel class** to `RemovalExecutor` (NOT a
refactor of it) that executes tag writes as a throttled, generation-guarded, resumable state
machine. It consumes the Phase 9 substrate (`tagApi.ts` request factory, the layer-224 `TagClient`
wrapper) and the Phase 10 substrate (`tagTypes.ts`, `tagAuditStore` / `tag-job.json`, `tagChannels`
IPC). It is wired in place of the Phase 10 stub `TagExecutorLike` passed to `registerTagChannels`.

Delivers **TAG-04** (already-admin/basic-group skip + per-group outcome reporting) and completes
**TAG-03**'s executor consumer (throttled, resumable runs).

Does NOT touch `RemovalExecutor` (shipped v1.0 path must stay stable) and does NOT build any
renderer UI (Phase 12).
</domain>

<decisions>
## Implementation Decisions

### Layer-224 connection guard & lifecycle
- **Main-client reconnect-race guard (the §4.3 risk, deferred from Phase 9 to here):** use the
  "only open `tagClient` when idle" assertion plus a short mutex around the connect/layer-patch
  window. Before opening the `tagClient`, `TagExecutor` asserts no removal/enumeration run is in
  flight; it holds a "no main reconnect" guard during `tagClient.connect()` and releases it
  immediately after the LAYER restore. This is spec §4.3's recommended approach — prefer it until
  it demonstrably fails. (Alternatives — separate Node worker, or vendoring a GramJS patch making
  LAYER an instance option — are explicitly NOT pre-built.)
- **tagClient lifecycle:** open at run start (in the idle window), keep **write-only**, tear down at
  end of run. On resume, reconnect a fresh tagClient.
- All `tagClient` invokes route through the **shared `RateLimitGovernor`** (`governor.run()`) so
  account-wide throttling holds across the 198 main client and the 224 tag client ("no feature can
  flood the account").

### Per-group dispatch
- For each selected supergroup/channel, build `InputPeerChannel{ channelId, accessHash }` (group)
  and `InputPeerUser{ userId, accessHash }` (target) from ids+accessHashes held in the **main
  process only** — GroupEnumerator entity map + `resolver.getResolvedUser()`. Never from the
  renderer payload (T-05-04-B; IPC payload is only `{ dialogIds, tag }`).
- Issue the `editChatParticipantRank` request (from `tagApi.ts`) through the `tagClient`, wrapped in
  `governor.run()`.
- **Already-admin:** detect `ChannelParticipantAdmin` from participant data already held by
  `GroupEnumerator` (main layer-198). Mark `skipped` with `TAG_TARGET_IS_ADMIN` **without** issuing
  the API call (avoids clobbering the admin's custom title — same `rank` field, per spec §5). If a
  group's participant data is missing from the enumerator, fall back to a `getParticipants` fetch
  via the main client.
- **Basic group (`Chat`):** detect by group type from the enumerator; mark `skipped` with
  `TAG_UNSUPPORTED_BASIC_GROUP` without an API call (v1 decision — legacy/low-value).

### Outcome model & error mapping
- Outcome statuses: `done | skipped | failed` (mirrors `TagGroupOutcome` from Phase 10).
- **Single error classifier** (mirroring removal's typed classifier). Exact RPC strings are
  confirmed live in this phase; the provisional map: `CHAT_ADMIN_REQUIRED`/`RIGHT_FORBIDDEN` →
  `TAG_NO_RIGHTS`; `USER_NOT_PARTICIPANT` → `TAG_USER_NOT_PARTICIPANT`; rank length/charset reject →
  `TAG_RANK_INVALID`; private/unresolvable → `TAG_CHANNEL_PRIVATE` / `TAG_USER_INVALID`. **Any
  unmapped RPC error → `UNKNOWN`, recorded as a per-group `failed` outcome, and the run CONTINUES**
  (non-retryable per-group, mirrors removal's T-03-02 disposition). Do NOT hard-stop on unknowns.

### Throttle, hard-stop & generation guard
- **FLOOD_WAIT:** absorbed by the shared governor (sleep + jitter + resume) with a countdown event
  forwarded to the renderer (reuse removal's flood-event pattern, scoped to tag).
- **PEER_FLOOD:** hard-stop the run immediately — remaining groups are left **pending** (NOT marked
  skipped), the run is resumable via `tag-job.json` (maps to the shared `hard-stop` disposition, as
  in removal).
- **Generation-token guard (D-15):** mirror `RemovalExecutor` verbatim. `abortExecution()` or a new
  `execute()` invalidates any stale in-flight run; remaining groups are marked `skipped` and
  `tag-job.json` is checkpointed. Per-group checkpoint is written before advancing to the next group.
- Inter-group pacing: 2s + jitter (mirror removal).

### Claude's Discretion
- Exact method signatures, the internal shape of the generation guard/mutex, and where the
  reconnect-guard coordination lives (TagExecutor vs a small helper) are at Claude's discretion,
  following the closest `RemovalExecutor` analog.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design contract (authoritative)
- `docs/superpowers/specs/2026-06-20-member-tag-action-design.md` — read §4 (architecture),
  §4.1 (per-group dispatch), §4.2 (outcome model + error codes), §4.3 (layer-224 connection +
  reconnect race), §5 (already-admin RESOLVED), §6 (safety), §9 (testing).

### Phase 9 + Phase 10 deliverables (consumed by this phase)
- `src/main/telegram/tagApi.ts` — the vendored `editChatParticipantRank` request factory + golden bytes.
- `src/main/telegram/tagClient.ts` — the layer-224 `TagClient` patch-connect-restore wrapper
  (`_connecting` guard present; main-client reconnect mitigation is THIS phase's job).
- `src/shared/tagTypes.ts` — `TagState`, `TagGroupOutcome`, `TagJobFile`, `TagErrorCode`.
- `src/main/storage/tagAuditStore.ts` — `tag-job.json` persistence (checkpoint, readJob, setStatus,
  clearJob).
- `src/main/ipc/tagChannels.ts` — `registerTagChannels` + `TagExecutorLike` interface (the contract
  TagExecutor must satisfy: `getState()`, `abortExecution()`, `execute({ dialogIds, tag })`).

### Patterns to mirror (do NOT modify)
- `src/main/telegram/RemovalExecutor.ts` — the sibling to mirror: generation-token guard, abort →
  mark-remaining-skipped, per-group checkpoint, inter-group pacing, PEER_FLOOD hard-stop, FLOOD_WAIT
  via governor, resume from job file.
- `src/main/telegram/removalExecutor.test.ts` — the test analog to mirror.
- `src/main/telegram/governor.ts` — `governor.run()` contract.

</canonical_refs>

<specifics>
## Specific Ideas

- TagExecutor must satisfy the Phase 10 `TagExecutorLike` interface so it drops into
  `registerTagChannels` replacing the stub (`src/main/index.ts` currently passes
  `{ getState, abortExecution, execute: async () => {} }`).
- Wire `onStateChange → emitTagState` (Phase 10 left this as a forward reference) so live progress
  reaches the renderer in Phase 12.
- TDD mirroring `removalExecutor.test.ts`: per-group dispatch with a mock `tagClient`, already-admin
  skip (no API call), generation-guard invalidation of a stale run, checkpoint + resume from
  `tag-job.json`, PEER_FLOOD hard-stop (remaining left pending), FLOOD_WAIT absorbed via the governor.

</specifics>

<deferred>
## Deferred Ideas

- Renderer action picker, tag input, confirmation, live progress, results report — Phase 12.
- "Preserve title" mode for admins (read current rank, restore after) — out of v1.6 scope.
- Basic-group (`Chat`) tagging support — skipped in v1.6; plausibly addable later.
- Separate-worker / GramJS-LAYER-instance-option alternatives for the layer-224 connection — only if
  the patch-connect-restore + mutex demonstrably fails.

</deferred>

---

*Phase: 11-tagexecutor*
*Context gathered: 2026-06-20 via autonomous smart-discuss*
