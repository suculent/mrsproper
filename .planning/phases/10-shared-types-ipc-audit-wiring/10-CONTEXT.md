# Phase 10: Shared Types, IPC & Audit Wiring - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the typed contract and durable-state substrate the tag feature stands on — **no
executor and no UI yet**. Three deliverables:

1. **`src/shared/tagTypes.ts`** — `TagState`, `TagGroupOutcome`, `TagJobFile`, `TagErrorCode`,
   mirroring `src/shared/removalTypes.ts`. Single source of truth imported by main (TagExecutor
   in Phase 11, tagChannels, audit/job persistence) and renderer (Phase 12 store).
2. **`src/main/ipc/tagChannels.ts`** (+ `src/renderer/ipc/tagClient.ts`) — IPC handlers that
   register `TAG_*` channels, validate payloads with Zod at the boundary, and stream state to
   the renderer. Payload carries **only** `{ dialogIds, tag }`; target identity is read in the
   main process from `resolver.getResolvedUser()` (T-05-04-B invariant preserved).
3. **`tag-job.json` audit/checkpoint persistence** — a separate job file (mode `0o600`) written
   when a run starts, checkpointed per-group, and detected on launch to offer resume/discard.

Delivers **TAG-03** (resumable audit substrate) and **TAG-05** (IPC identity boundary).
Does NOT implement the write state machine (Phase 11) or any renderer UI (Phase 12).
</domain>

<decisions>
## Implementation Decisions

### Types & Job-File Schema
- `TagErrorCode` taxonomy: `TAG_TARGET_IS_ADMIN`, `TAG_UNSUPPORTED_BASIC_GROUP`, `TAG_NO_RIGHTS`,
  `TAG_USER_INVALID`, `TAG_CHANNEL_INVALID`, `NETWORK`, `UNKNOWN` — mirrors `RmvErrorCode` plus the
  provisional set in design spec §4.2. PEER_FLOOD is a run-level hard-stop, NOT a per-group code.
  (STATE blocker: exact live RPC error strings, e.g. `CHAT_ADMIN_REQUIRED` vs `RIGHT_FORBIDDEN`,
  are verified in Phase 11 — the taxonomy may be refined there, but the shape is set now.)
- `TagState` mirrors `RemovalState` exactly, with `tag: string` in place of `severity`. It carries
  `targetId` + `targetName` for renderer display and **never** `targetAccessHash` (same security
  boundary as removal — accessHash lives only on disk in `tag-job.json` and in main memory).
- `TagGroupOutcome` mirrors `RemovalGroupOutcome`: `dialogId`, `status` (`done` | `skipped` |
  `failed` — note no `already-gone` analog; the tag analogs are admin/basic-group skips), optional
  `errorCode`, `timestamp`. Skip annotations distinguish `TAG_TARGET_IS_ADMIN` vs
  `TAG_UNSUPPORTED_BASIC_GROUP`.
- Job file is a **separate `tag-job.json`** (not an extension of `removal-job.json`) so the shipped
  v1.0 removal path is untouched. Written with mode `0o600` (same as session + removal job).
- `TagJobFile.schemaVersion` starts at `1`; same migration-friendly shape as `RemovalJobFile`
  (ISO-timestamp `jobId` nonce, `targetAccessHash` persisted on disk only for resume, `dialogIds`
  full ordered list, per-group `outcomes` checkpointed, `status` of
  `running | complete | stopped | hard-stopped`).

### IPC & Resume Wiring
- Parallel modules: `src/main/ipc/tagChannels.ts` + `src/renderer/ipc/tagClient.ts`, with `TAG_*`
  channel constants mirroring `removalChannels` / `removalClient`. Do NOT fold into removal modules.
- Zod-validated handler payload is `{ dialogIds: string[], tag: string }` only. Target identity is
  read exclusively from `resolver.getResolvedUser()` in main — never accepted from the renderer
  (T-05-04-B). Validation rejects malformed payloads at the boundary.
- Resume detection: `tag-job.json` is detected **independently** from `removal-job.json` on launch
  and surfaces its own resume/discard prompt. Both job types could be incomplete simultaneously;
  each is handled in its own flow (same UX pattern as removal resume).
- Tag validation at the IPC boundary is defense-in-depth: reject empty and enforce a conservative
  max-length cap. Full charset + measured-length UX validation is deferred to Phase 12 (the exact
  Telegram tag max length is not yet measured — STATE blocker; use a conservative cap now and
  tighten in Phase 12).

### Claude's Discretion
- Exact `TAG_*` channel constant names, Zod schema layout, and where the job-file read/write helper
  lives (new module vs. extending an audit store) are at Claude's discretion, following the closest
  removal analog.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/removalTypes.ts` — exact structural template for `tagTypes.ts` (RemovalState,
  RemovalGroupOutcome, RemovalSummary, RemovalJobFile, RmvErrorCode + security-boundary comments).
- `src/main/ipc/removalChannels.ts` (+ `removalChannels.test.ts`) — IPC handler registration,
  Zod validation, state push channel, and the identity-from-resolver invariant to mirror.
- `src/renderer/ipc/removalClient.ts` — renderer-side IPC client wrapper to mirror as `tagClient.ts`.
- `src/main/storage/auditStore.ts` (+ `auditStore.test.ts`) — job-file persistence pattern
  (0o600 write, checkpoint-per-outcome, launch-time incomplete detection).
- `src/renderer/removal/ResumeJobDialog.tsx` — resume/discard prompt pattern (consumed in Phase 12).

### Established Patterns
- Shared types in `src/shared/*Types.ts` are the single source of truth, imported by both processes.
- IPC modules pair a main `*Channels.ts` (handlers) with a renderer `*Client.ts` (invoker).
- Job files persist to `userData/` with mode `0o600`; `schemaVersion` guards migration.
- Security boundary: renderer receives display fields only; accessHash stays in main + on-disk job.

### Integration Points
- `src/main/index.ts` (~line 145) — where the main `client`, governor, resolver, and removal IPC
  are wired; tag IPC registration and tag-job launch-detection slot in alongside.
- Phase 9 deliverables (`tagApi.ts`, the layer-224 `tagClient`) are consumed by Phase 11's
  TagExecutor, which in turn writes through the `tag-job.json` persistence built here.

</code_context>

<specifics>
## Specific Ideas

- Keep `tagTypes.ts` a pure type module (no runtime logic) so it compiles cleanly and is importable
  from both processes — mirror removalTypes.ts comment density and security-boundary annotations.
- Tests mirror `removalChannels.test.ts` and `auditStore.test.ts`: Zod payload acceptance/rejection
  (identity never accepted from renderer), 0o600 job-file write, checkpoint-per-group, and
  launch-time incomplete-job detection.

</specifics>

<deferred>
## Deferred Ideas

- The `TagExecutor` write state machine (per-group dispatch, generation guard, FLOOD_WAIT/PEER_FLOOD
  handling) — Phase 11.
- Renderer action picker, tag input, confirmation, live progress, results report — Phase 12.
- Measuring the real Telegram tag max length + charset, and tightening IPC/renderer validation — the
  measurement feeds Phase 12.
- Reading tags back / clearing tags / per-group tags / basic-group support — out of v1.6 scope.

</deferred>

---

*Phase: 10-shared-types-ipc-audit-wiring*
*Context gathered: 2026-06-20 via autonomous smart-discuss*
