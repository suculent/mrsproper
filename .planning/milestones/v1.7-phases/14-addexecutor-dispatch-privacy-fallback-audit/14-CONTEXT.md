# Phase 14: AddExecutor — Dispatch, Privacy Fallback & Audit - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Main-process execution engine for Add mode, no renderer changes. A new `AddExecutor` (cloned from `RemovalExecutor`'s shape) invites the resolved target into every selected dialog through the correct Telegram mechanic (`channels.InviteToChannel` for supergroups and broadcast channels, `messages.AddChatUser` for basic groups), lifts a ban first where the Phase 13 scan reported `banned`, and when Telegram reports the target as a privacy-blocked invitee it exports a unique single-use invite link that expires in 5 days and, once the run completes, sends every link in one direct message rendered from the ADD-16 template. Every per-group outcome is checkpointed to its own `add-job.json` with the same resume/discard contract as removal and tag jobs, and a plain-text add log records what was done. Phase 14 also ships the main-process halves that Phase 15's UI will call: the confirm-time contact-add IPC (ADD-05), the template store + renderer (ADD-16) and the add-log store (ADD-14). Requirements owned here: ADD-06, ADD-07, ADD-08, ADD-09, ADD-10, ADD-11.

</domain>

<decisions>
## Implementation Decisions

### Executor shape & per-group dispatch
- **D-01:** `AddExecutor` mirrors `RemovalExecutor` and the consolidated `TagExecutor`: strictly sequential, every Telegram call through `governor.run()` on the single shared client, FLOOD_WAIT absorbed by the governor with a countdown event forwarded to the renderer, PEER_FLOOD hard-stops the run with remaining groups left pending (not skipped), ~3 s inter-group pacing (base + jitter) fired after the outcome is checkpointed, generation-token guard with the abort-first semantics fixed in Phase 13 (WR-01: a superseded run exits silently; only an explicit abort marks remaining groups skipped), per-group checkpoint before advancing, and `retryGroup()` for failed groups after complete/stopped/hard-stopped.
- **D-02:** Per selected dialog: supergroup / broadcast channel → if the scan status is `banned`, `channels.EditBanned` with empty `ChatBannedRights` first (own `governor.run()`), then `channels.InviteToChannel`; basic group → `messages.AddChatUser` directly (no ban visibility, per Phase 13 D-03; a `USER_KICKED` refusal becomes a failed outcome). `InputChannel` / `InputUser` are built from the enumerator entity map and `resolver.getResolvedUser()` in main only; the IPC payload carries dialog ids and run options, never identity.
- **D-03:** `messages.AddChatUser.fwd_limit`: the user wants the maximum history the server allows. Send `1000`; if the server explicitly rejects the value, retry that call once with `100`. Telegram documents 100 as the ceiling and appears to clamp silently, so in practice the first call is expected to succeed.
- **D-04:** If a ban was lifted and the invite that follows fails for any reason, the ban stays lifted. No re-ban write; the per-group outcome reports the add failure.
- **D-05:** Before issuing any call, the executor checks the resolved `User` flags. A deleted account or a bot yields `failed(ADD_TARGET_INVALID)` for every selected group with zero API traffic. Phase 15 may additionally block confirmation, but the executor guards regardless.
- **D-06:** A target found to be a participant at run time (`USER_ALREADY_PARTICIPANT` or equivalent) is recorded as `already-member`, not as a failure.

### Privacy block & contact-add
- **D-07:** Privacy block detection uses the layer-229 response: both invite calls return `messages.InvitedUsers`; if `missing_invitees` contains the target, the outcome is `privacy-blocked`. Legacy error strings that mean the same thing (`USER_PRIVACY_RESTRICTED`, `USER_NOT_MUTUAL_CONTACT`) are mapped to `privacy-blocked` as well, so the fallback runs in both shapes.
- **D-08:** The contact add is **not** part of the run. Phase 14 provides a main-process contact service plus an IPC handler (e.g. `target:add-contact`) that Phase 15 calls at target confirmation when the "Add to contacts" box is checked. It uses `contacts.AddContact` with the resolved user's names, skips when the user is already a contact, keeps the contact afterwards (supersedes target-resolution D-07's no-contact rule for this flow), and is **non-blocking**: it returns `{ ok, code? }` and failure never prevents the run from starting. The executor receives nothing about contacts and performs **no retry** of a blocked invite; a block goes straight to the link.
- **D-09:** A missing invitee flagged `premium_would_allow_invite` stays `privacy-blocked` and still gets a link; the outcome carries `premiumWouldAllow: true` so Phase 15 can show a hint. No separate failed code.
- **D-10:** The invite link is exported **inline**, in the same per-group step, immediately after the block is detected, and is checkpointed together with the `privacy-blocked` outcome. A stopped run never loses a link it already created.

### Invite links & the direct message
- **D-11:** `messages.ExportChatInvite` with `usage_limit: 1`, `expire_date = now + 5 days`, `request_needed: false`, and a **title** of the form `Admin • {target display name}` (neutral prefix, app name deliberately not leaked), truncated to Telegram's 32-character title limit.
- **D-12:** A broadcast channel that hits the direct-add cap during the run (`USERS_TOO_MUCH` on `InviteToChannel`) takes the **link fallback**, not a failure: outcome `privacy-blocked` with `reason: 'channel-full'`, link exported inline and included in the DM. A channel-cap `failed` code exists only for the case where the link export itself is refused. This resolves the PROJECT.md vs ADD-09 wording conflict in favour of PROJECT.md; ADD-09's text should be adjusted during planning.
- **D-13:** The single DM is sent **only when the run reaches `complete`**. Stopped and hard-stopped runs keep their links in `add-job.json` and send nothing; when a resumed run completes, one DM covers links from every segment. Links older than 5 days at send time are regenerated first. One DM per run, ever; no DM when the run produced zero links.
- **D-14:** The DM is attempted once through the governor even when a missing invitee carried `premium_required_for_pm`. On refusal the run finishes with `dmStatus: 'refused'`, the outcomes stay `privacy-blocked`, and the links remain in the job file and the add log for the admin to pass along another way (ADD-11).
- **D-15:** Template: single-brace placeholders `{name}` and `{links}` (no clash with i18next's `{{ }}`); `{links}` renders one link per line. **One** user template persisted in the existing electron-store preferences (same mechanism as severity, theme, language); when none is stored, the built-in default for the current app language (en / cs) is used at render time. Phase 14 ships the store, the renderer function and the get/set IPC so Phase 15 only has to add the editor and preview.

### Job file, resume & add log
- **D-16:** Separate `add-job.json` (parallel to `removal-job.json` / `tag-job.json`, Phase 10 convention): `schemaVersion: 1`, mode `0o600`, ISO `jobId`, `targetId` + `targetName` (+ accessHash on disk only), the ordered `dialogIds`, run options, per-group outcomes (each with optional `link`, `reason`, `premiumWouldAllow`, `errorCode`, timestamp), `dmStatus` (`pending | sent | refused | not-needed`), and `status` of `running | complete | stopped | hard-stopped`. Detected independently of the other job files on launch with its own Resume / Discard prompt (prompt UI is Phase 15; detection + IPC are here).
- **D-17:** The add log is a **plain-text** file `add-log.txt` next to the job files, mode `0o600`, append-only, kept forever (no pruning). Phase 15's export is a straight copy through a save dialog.
- **D-18:** One log block per run, written when the run reaches a terminal state (complete, stopped or hard-stopped): timestamp, target id and display name, the groups actually added, the groups that received a link together with the links, and the DM status. Failed and skipped groups are **not** logged (they live in `add-job.json` and the Phase 15 report). A resumed run appends a follow-up block that references the original job id and lists only what that segment added; nothing is rewritten in place.

### Outcome vocabulary
- **D-19:** Per-group outcomes are exactly `done | already-member | privacy-blocked | failed | skipped`. `privacy-blocked` carries `reason: 'privacy' | 'channel-full'`, the `link`, and `premiumWouldAllow`. Failed codes follow the ADD-09 list with the removal/tag naming style (`ADD_NO_RIGHTS`, `ADD_NOT_MUTUAL_CONTACT`, `ADD_USER_CHANNELS_TOO_MUCH`, `ADD_USER_KICKED`, `ADD_TARGET_INVALID`, `ADD_CHANNEL_FULL`, `NETWORK`, `UNKNOWN`); the exact RPC-string mapping is confirmed during research, the shape is set now. PEER_FLOOD remains a run-level hard-stop, never a per-group code. Unknown RPC errors are `failed(UNKNOWN)` and the run continues.

### Claude's Discretion
- Module and constant names (`AddExecutor.ts`, `addAuditStore.ts`, `addLogStore.ts`, `addChannels.ts`, `addTypes.ts`, contact service, `ADD_*` channels), Zod payload schemas, the exact RPC-error → code table, jitter values, and how "already a contact" is detected from the resolved `User`.
- Whether expired links are revoked when regenerated, and how the DM text is built when a group's link was regenerated.
- Default template wording in English and Czech (formal vykání): Claude drafts, user reviews at UAT.
- Layout of the plain-text log block and its follow-up block marker.
- Whether the template snapshot used for the DM is stored in `add-job.json` for resume fidelity.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope
- `.planning/REQUIREMENTS.md` — ADD-05..ADD-11, ADD-14, ADD-16 definitions (ADD-09's channel-cap wording to be adjusted per D-12)
- `.planning/ROADMAP.md` §Phase 14 — goal and the five success criteria; §Phase 15 — what this phase must leave ready for the renderer
- `.planning/PROJECT.md` §Current Milestone — locked user decisions for Add mode (mode switch, broadcast channels, unban-first, contact-add, links, DM, log)

### Prior decisions this phase builds on
- `.planning/phases/13-add-rights-scan-semantics-foundation/13-CONTEXT.md` — D-01 `banned` polarity (confirmed live), D-02/D-03 unban scope, D-04..D-06 `canAdd` rule and `channel-full` grey
- `.planning/phases/13-add-rights-scan-semantics-foundation/13-REVIEW-FIX.md` — WR-01/WR-05 abort-vs-generation semantics the new executor must mirror
- `.planning/milestones/v1.6-phases/11-tagexecutor/11-CONTEXT.md` — per-group dispatch, outcome model, hard-stop and generation-guard decisions (layer-224 section is obsolete)
- `.planning/milestones/v1.6-phases/10-shared-types-ipc-audit-wiring/10-CONTEXT.md` — parallel-module convention, separate job files, 0o600, identity-never-from-renderer boundary

### Telegram API surface
- `vendor/telegram-api.tl` — layer-229 schema: `channels.inviteToChannel` / `messages.addChatUser` → `messages.InvitedUsers { updates, missing_invitees }`, `missingInvitee { premium_would_allow_invite, premium_required_for_pm }`, `messages.exportChatInvite { expire_date, usage_limit, title, request_needed }`, `contacts.addContact`, `channels.editBanned`, `messages.sendMessage`
- `.planning/quick/261003-jni-move-gramjs-client-to-tl-layer-229-schem/261003-jni-SUMMARY.md` — how the vendored schema is applied; why `InvitedUsers` parses at all

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/telegram/RemovalExecutor.ts` (666 lines) — the executor template: options interface with injectable client, `_generation` / `AbortController` / `_runActive`, `execute()` loop, `retryGroup()`, `abortExecution()`, `_classifyRemovalError`, `_buildSummary`, governor event forwarding. Clone its shape; keep the Phase 13 WR-01/WR-05 ordering (abort check before generation check, hard-stop path checks abort first).
- `src/main/telegram/TagExecutor.ts` — the most recent single-client executor; its `_tagGroup` precheck pattern is the analog for the pre-flight deleted/bot and banned checks.
- `src/main/storage/auditStore.ts` + `src/main/storage/tagAuditStore.ts` — atomic write-then-rename job-file stores typed to their job file; `addAuditStore.ts` follows the same factory + `AuditStoreDeps` injection. The add-log store is a sibling with append semantics.
- `src/main/telegram/operationErrors.ts` (`classifyRpcError`, dispositions incl. `hard-stop`) and `src/main/telegram/errors.ts` — reuse for FLOOD_WAIT / PEER_FLOOD / NETWORK; add the `ADD_*` mapping on top as `_classifyAddError`.
- `src/main/ipc/removalChannels.ts` / `tagChannels.ts` — START / ABORT / RETRY_GROUP / GET_STATE / GET_JOB / DISCARD_JOB handler set with Zod validation; `addChannels.ts` mirrors it plus contact-add and template get/set handlers.
- `src/main/ipc/severityChannels.ts` — ESM-safe lazy electron-store factory with schema-validated `set`; the template preference uses the same pattern.
- `src/shared/removalTypes.ts`, `src/shared/tagTypes.ts` — `*GroupOutcome`, `*JobFile`, `*JobFileSafe` (accessHash stripped) shapes to mirror in `src/shared/addTypes.ts`.
- `src/main/telegram/__mocks__/telegramClient.ts` — call-recording mock with per-request dispatch branches; extend with `InviteToChannel`, `AddChatUser`, `ExportChatInvite`, `EditBanned` (exists), `SendMessage`, `AddContact` and a way to inject `missing_invitees`.
- `src/main/telegram/MembershipScanner.ts` scan results and `GroupEnumerator` DTOs supply `membershipStatus` (`banned` → unban-first) and `canAdd` / `addGreyReason` per dialog.

### Established Patterns
- Rights and identity computed in main only; IPC payloads carry dialog ids and options, never accessHash (T-04-01 / T-05-04-B).
- One governor, one client: every write goes through `governor.run()`; never two Telegram calls inside one `run()`.
- Job files are per-feature, `0o600`, atomic, with independent resume detection.
- Tests: `removalExecutor.test.ts` / `tagExecutor.test.ts` fixtures with `makeDialog` helpers (already carrying `canAdd` / `addGreyReason` since Phase 13); `tsc --build` then `vitest run`, deleting stray emitted `.js`/`.d.ts` beside sources before running tests.

### Integration Points
- `src/main/index.ts` — wire `AddExecutor` next to `RemovalExecutor` / `TagExecutor` with `{ client, governor, enumerator, resolver, addAuditStore, addLogStore, templateStore, onStateChange }`; register `addChannels`.
- `src/shared/channels.ts` — new `ADD_*` channel constants.
- Launch-time job detection — add `add-job.json` alongside the removal and tag checks (prompt rendering is Phase 15).

</code_context>

<specifics>
## Specific Ideas

- Link title example from the user: `Admin • Jan Novák`. Prefix is intentionally neutral so the app name does not appear in the group's invite-link manager.
- History forwarding for basic groups should be "as much as Telegram allows"; the 1000 → 100 fallback encodes that intent.
- The add log is for the admin's own records: plain, human-readable, successes and links only, one block per run.

</specifics>

<deferred>
## Deferred Ideas

- Re-banning the target when an invite fails after an unban — rejected for this phase (leave lifted).
- JSON Lines log format — rejected in favour of plain text; revisit only if a future feature needs to query the log.
- Sending a partial DM on manual Stop — rejected; one DM per run at completion.
- Phase 15 follow-ons surfaced here: a notice when the confirm-time contact add fails, a "Premium would allow this" hint on privacy-blocked rows, and the Resume / Discard prompt for `add-job.json`.
- REQUIREMENTS.md ADD-09 wording ("channel at the direct-add cap" as a failed code) to be aligned with D-12 during planning.

</deferred>

---

*Phase: 14-addexecutor-dispatch-privacy-fallback-audit*
*Context gathered: 2026-10-03*
