# Member Tag Action — Design Spec

**Date:** 2026-06-20
**Status:** Draft — gated on Phase 0 empirical spike
**Author:** brainstormed with Claude

## 1. Summary

Add **Tag** as a third action in MrProper, alongside the existing Kick and Ban. The
administrator resolves a target user (existing flow), selects groups (existing flow),
enters **one tag string**, confirms, and the app sets that member tag identically across
every selected supergroup/channel — using the existing throttled, resumable, audited
execution machinery.

The feature targets Telegram's **Member Tags** feature (shipped March 2026): a short label
displayed next to a member's name. Crucially, a member tag does **not** require the member
to be an admin — it is the `rank` string extended to ordinary members. In the MTProto
schema this surfaces as a `rank:flags.2?string` field on the plain `channelParticipant`
constructor, and is set via the existing `channels.editAdmin(channel, user, adminRights, rank)`
method.

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

- **Q1 = YES →** proceed to Phase 1 (write-only `TagExecutor`) on stock GramJS 2.26.22.
- **Q1 = NO →** **stop and reassess.** The feature would require regenerating GramJS's TL
  schema against the newer member-tag protocol layer (bump `LAYER`, regenerate `api.ts` from
  the new `telegram_api.tl`, re-verify every other call still deserializes). That is a separate
  spec and a real maintenance burden — not undertaken without the user's explicit go-ahead.

**Deliverable:** the findings table below, filled in after running the spike.

### Spike findings (fill in after running `scripts/spike-member-tag.mjs`)

**Run date:** _TBD_
**GramJS version under test:** 2.26.22 (layer 198)
**Test group:** _TBD_ &nbsp;|&nbsp; **Non-admin target:** _TBD_ &nbsp;|&nbsp; **Already-admin target:** _TBD_

| # | Question | Finding | Outcome |
|---|----------|---------|---------|
| Q1 | Does layer-198 `editAdmin + rank` (all-false rights) set a member tag on a **non-admin** — badge appears, no promotion? | _TBD_ | ☐ YES ☐ NO |
| Q2 | What happens to an **already-admin** target's type / rights / title? (pre→post participant diff) | _TBD_ | ☐ untouched ☐ rights changed ☐ title overwritten |
| Q3 | Which right must the **acting** account hold? What RPC error if it lacks rights? Interaction with the group "Edit Own Tags" setting? | _TBD_ | error code: _____ |
| Q4 | Max tag length / allowed charset? Does empty string clear vs error? | _TBD_ | max len: ___, empty: ☐ clears ☐ errors |
| Q5 | Confirmed basic groups (`Chat`) unsupported by `channels.EditAdmin`? | _TBD_ | ☐ confirmed unsupported |

**Decision (from Q1):**
- ☐ **Q1 = YES** → proceed to Phase 1 (write-only `TagExecutor`).
- ☐ **Q1 = NO** → stop & reassess (GramJS TL-schema regeneration — separate spec).

**Already-admin decision (from Q2) — resolves §5:**
- ☐ Skip & flag &nbsp; ☐ Preserve rights, set tag

**Raw notes / surprises:**

> _paste relevant script output or observations here_

## 4. Architecture

Reuse-first, mirroring the removal pipeline. New `TagExecutor` is built as a **parallel class**
to `RemovalExecutor` (not a refactor of it) to avoid destabilizing the shipped v1.0 removal path.
Low-risk shared helpers (generation guard, inter-group pacing) may be extracted only where safe.

| Concern | Removal (existing) | Tag (new) |
|---------|--------------------|-----------|
| Executor | `RemovalExecutor` | `TagExecutor` (sibling; same state-machine shape) |
| Shared types | `src/shared/removalTypes.ts` | `src/shared/tagTypes.ts` |
| IPC channels | `src/main/ipc/removalChannels.ts` | `src/main/ipc/tagChannels.ts` |
| Audit job file | `removal-job.json` (0o600) | `tag-job.json` (0o600) |
| Per-group API call | `EditBanned` / `DeleteChatUser` | `editAdmin(rank)` |

`TagExecutor` reuses the existing patterns verbatim: generation-token guard (D-15), abort →
mark-remaining-skipped, per-group checkpoint before advancing, inter-group pacing (2s + jitter),
PEER_FLOOD hard-stop, FLOOD_WAIT auto-sleep via the shared governor, and resume via the audit
job file. The **only** substantive difference from `RemovalExecutor` is the body of the
per-group dispatch method.

### Shared types (`tagTypes.ts`, modeled on `removalTypes.ts`)

- `TagState` — like `RemovalState`, but the `severity: 'kick' | 'ban'` field is replaced by
  `tag: string`.
- `TagGroupOutcome` — `{ dialogId, status, errorCode?, timestamp }`.
- `TagJobFile` — like `RemovalJobFile`: `schemaVersion`, `jobId`, `tag`, `targetId`,
  `targetName`, `targetAccessHash`, `dialogIds`, `outcomes`, `startedAt`, `completedAt?`, `status`.
- `TagErrorCode` — see §4.2.

### 4.1 Per-group dispatch

- **basic-group** → outcome `skipped` (or `failed`) with `TAG_UNSUPPORTED_BASIC_GROUP`.
  `editAdmin` is channels-only. (Confirm in spike Q5.)
- **supergroup | broadcast-channel** → `channels.EditAdmin({ channel, userId,
  adminRights: ChatAdminRights{} (all false), rank: tag })`.
  - Already-admin handling per the **spike Q2** decision (§5).
  - Channel entity id + accessHash extracted via the same duck-typed `getDialogEntity()` path
    used by `RemovalExecutor` for `EditBanned`.
  - Target identity (id + accessHash) read from the **main-process resolver only**
    (`resolver.getResolvedUser()`), never from the renderer payload — preserves the existing
    T-05-04-B invariant.

### 4.2 Outcome model

- Outcome statuses: `done | skipped | failed`.
- `TagErrorCode`:
  - `TAG_NO_RIGHTS` — acting admin lacks the needed right (mapped from `CHAT_ADMIN_REQUIRED`).
  - `TAG_TARGET_IS_ADMIN` — target is already admin and policy says skip (mapped from
    `USER_ADMIN_INVALID`, or pre-checked; depends on §5 decision).
  - `TAG_UNSUPPORTED_BASIC_GROUP` — basic group, not supported.
  - `TAG_USER_INVALID` — target no longer resolvable (`USER_ID_INVALID`).
  - `TAG_CHANNEL_PRIVATE` — channel inaccessible (`CHANNEL_PRIVATE`).
  - `NETWORK` — transient.
  - `UNKNOWN` — fallthrough.
- PEER_FLOOD continues to map to the shared `hard-stop` disposition (resumable), exactly as in removal.

## 5. Deferred decision: already-admin targets

**Status: deferred to spike Q2.** Setting a tag via `editAdmin` risks overwriting an existing
admin's rights or custom title. The spike observes the actual server behavior, then one of:

- **Skip & flag** — skip groups where the target is already an admin; mark them in results so
  the operator handles them manually. (Safest; never touches existing admins' powers.)
- **Preserve rights, set tag** — read current `admin_rights` first, re-send those exact rights
  plus the new tag (read-modify-write; more calls per group).

This is the safety crux of the feature — the mirror of "don't remove the wrong person." The
choice is made once the spike shows what `editAdmin` actually does to an existing admin.

## 6. Safety & security

All existing invariants are preserved:

- **Explicit confirmation gate** showing the tag string + selected group count + group list
  before any write.
- **Target identity from the main-process resolver only** — never the renderer payload
  (T-05-04-B). The IPC payload carries only `dialogIds` and the `tag` string.
- **Already-admin protection** per the §5 spike decision.
- **Throttling** via the shared `RateLimitGovernor`; FLOOD_WAIT auto-sleep; PEER_FLOOD
  hard-stop; resume from `tag-job.json` — all unchanged from the removal engine.
- `tag-job.json` written with mode `0o600`, same as the session and removal job files.

## 7. GramJS reality (the constraint that shaped this design)

Installed GramJS **2.26.22** pins protocol **LAYER 198**. Findings:

- **Issuing** `editAdmin` with a `rank` string **works today** — the `EditAdmin` class already
  carries a `rank: string` field (it has backed admin custom titles for years). No new library
  capability is needed to *send* the call.
- **Reading** a member's tag back does **not** work: the installed `ChannelParticipant`
  constructor has only `userId / date / subscriptionUntilDate` — **no `rank` field**. The new
  schema's `channelParticipant` (with `rank:flags.2?string`) is a different constructor hash.
  Bumping the announced layer to obtain it would make the server send other new constructors
  that 2.26.22 cannot deserialize.

This is exactly why v1 is **write-only**: we issue the tag and trust the `Updates` response,
and we do **not** read tags back through `getParticipants`. This keeps the feature on stock
GramJS — *provided* spike Q1 confirms the server honors a layer-198 `editAdmin + rank` as a
member-tag set. If it does not, see the Phase 0 "stop and reassess" branch (§3).

## 8. Renderer / UX

- **Action picker**: Kick / Ban / **Tag** (chosen before the confirmation screen).
- **Tag input**: single text field with live length + charset validation (limits from spike Q4).
- **Confirmation screen**: shows the tag string, the target identity, and the selected group
  list/count.
- **Progress + results screens**: reused from the removal flow (processed/total, per-group
  outcome rows, FLOOD_WAIT countdown, summary band). Result rows surface the `TagErrorCode`
  values from §4.2.

## 9. Testing

Unit tests mirroring `removalExecutor.test.ts`:

- Asserts the exact `editAdmin` payload (all-false `ChatAdminRights` + the `rank` string).
- Basic-group → `TAG_UNSUPPORTED_BASIC_GROUP` skip.
- Already-admin handling per the §5 decision.
- Generation-guard invalidation of stale in-flight work.
- Checkpoint after each group; resume from `tag-job.json`.
- PEER_FLOOD hard-stop (resumable); FLOOD_WAIT auto-sleep.

Spike Q1–Q5 findings are recorded in §3's deliverable before Phase 1 code is written.

## 10. Implementation phasing

0. **Empirical spike** (throwaway script) — answer Q1–Q5; branch.
1. **Shared types + IPC** — `tagTypes.ts`, `tagChannels.ts`, `tag-job.json` audit wiring.
2. **`TagExecutor`** — write-only state machine; per-group `editAdmin` dispatch; tests.
3. **Renderer** — action picker, tag input + validation, confirmation, wire to progress/results.

Implementation (Phases 0–3) routes through the project's GSD workflow per CLAUDE.md.
