---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
verified: 2026-10-04T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 14: AddExecutor — Dispatch, Privacy Fallback & Audit Verification Report

**Phase Goal:** An add run invites the target into every selected group through the correct Telegram mechanic, lifts bans first, falls back to unique expiring invite links with a single templated DM when privacy blocks a direct add, and checkpoints/resumes exactly like the removal and tag executors.
**Verified:** 2026-10-04T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Supergroup/broadcast-channel dispatch uses `channels.InviteToChannel`; basic group uses `messages.AddChatUser`; both routed through `governor.run()` with FLOOD_WAIT/PEER_FLOOD handling and ~3s inter-group pacing | ✓ VERIFIED | `src/main/telegram/AddExecutor.ts:646-732` (`_addToGroup`) — every `client.invoke()` call wrapped in `this._governor.run()` (verified by grep: 7 call sites, all governor-wrapped). Pacing `setTimeout(r, 2000 + Math.random()*1000)` at line 385, identical to `RemovalExecutor.ts:310` / `TagExecutor.ts:234`. PEER_FLOOD hard-stop re-thrown before classification (`classifyRpcError` disposition check at lines 352-356, 770-773) and propagated through `_handleLoopHardStop`/`_emitHardStopped`. Tests: `addExecutor.test.ts` describe blocks "per-group dispatch" (line 240) and "PEER_FLOOD hard-stop" (line 859). |
| 2 | A banned group has the ban lifted (own `EditBanned` governor call) before the invite call, same throttled run | ✓ VERIFIED | `AddExecutor.ts:698-714` — `channels.EditBanned` with empty `ChatBannedRights({untilDate:0})` is its own `governor.run()` call, immediately followed by a separate `governor.run()` for `InviteToChannel`. D-04 (no re-ban on invite failure) explicitly documented and tested (`addExecutor.test.ts:416`, "D-04: ... NO second (re-ban) EditBanned call is ever issued"). Basic groups correctly skip the ban check (Phase 13 D-03, tested at line 433). |
| 3 | Privacy-blocked group yields a unique single-use link expiring 5 days later; one DM at run end carries every link; DM refusal reported distinctly, links retained | ✓ VERIFIED | `_buildPrivacyBlockedOutcome` (`AddExecutor.ts:842-886`): `usageLimit:1`, `expireDate = now+432000s`, title truncated to 32 chars, link checkpointed inline with outcome (D-10/D-11). End-of-run DM block (lines 402-478): exactly one `SendMessage` only when `step` reaches `complete`, aggregates links across all segments (stale links >5 days regenerated first), `dmStatus` set to `sent`/`refused`/`not-needed`; a refusal (privacy strings, or CR-02-fixed NETWORK/unknown path) leaves outcomes/links unchanged. Tests at `addExecutor.test.ts:1174-1427` cover all these paths including the two-segment resume aggregation (line 1370) and the "links UNCHANGED" assertion (line 1233). |
| 4 | Every outcome is one of `done\|already-member\|privacy-blocked\|failed(code)\|skipped`, checkpointed to `add-job.json` live; relaunch detects an incomplete job; stopped/hard-stopped runs resume from checkpoint | ✓ VERIFIED | `src/shared/addTypes.ts` `AddGroupOutcome.status` union matches D-19 exactly (5 values + typed `AddErrorCode`). `AddAuditStore.checkpoint()` writes atomically (tmp+rename, mode 0o600) after every group (`addAuditStore.ts:200-219`, with CR-01's dialogId-dedup fix applied). `main/index.ts:427-429` reads `add-job.json` on launch and logs incomplete-job detection (mirrors removal/tag precedent; Resume/Discard UI explicitly deferred to Phase 15 per CONTEXT D-16). D-20 continuation-based resume (`AddExecutor.ts:264-306`) reuses the on-disk `jobId`/outcomes via `sameDialogIdSet()` when `resume:true` and target+dialog-set match; `addChannels.ts` computes `resume` server-side from `auditStore.readJob()`, never trusting the renderer (T-14-16). Tests: `addExecutor.test.ts:1053-1173` (continuation-based resume) and `addAuditStore.test.ts` (dedup-by-dialogId regression). |
| 5 | TDD tests mirror removalExecutor/tagExecutor coverage: dispatch (both mechanics), unban-first, link gen+expiry, checkpoint+resume, PEER_FLOOD hard-stop, FLOOD_WAIT via governor | ✓ VERIFIED | `addExecutor.test.ts` (1640 lines, 54 tests) has 12 top-level `describe` blocks covering exactly these areas (lines 240, 368, 453, 504, 549, 660, 728, 859, 1053, 1174, 1428, 1561). Uses a real `RateLimitGovernor` instance against a mocked client (same pattern as Removal/Tag), so FLOOD_WAIT absorption is exercised through the actual governor, not re-implemented. Full suite run during verification: 37 files / 501 tests passing (matches 14-REVIEW-FIX.md's claimed baseline exactly). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/addTypes.ts` | AddErrorCode/AddGroupOutcome/AddJobFile/AddState/AddLogBlockEntry/DmTextProvider | ✓ VERIFIED | 201 lines, all types present, D-19 5-status union, D-16 job-file shape, D-17/18 log-block shape |
| `src/main/telegram/AddExecutor.ts` | Executor mirroring RemovalExecutor/TagExecutor shape | ✓ VERIFIED | 974 lines, all D-01..D-20 behaviors implemented and wired; post-review-fix code re-read directly (not inferred from SUMMARY) |
| `src/main/storage/addAuditStore.ts` | Atomic job-file store, 0o600, Zod-validated, `sameDialogIdSet` | ✓ VERIFIED | 284 lines; CR-01 dedup-by-dialogId fix present in `checkpoint()` |
| `src/main/storage/addLogStore.ts` | Append-only plain-text log, 0o600 | ✓ VERIFIED | 164 lines; WR-04 defensive `chmodSync` fix present |
| `src/main/telegram/contactService.ts` | Non-blocking `contacts.AddContact` wrapper | ✓ VERIFIED | 66 lines; never throws, skips when already contact |
| `src/main/ipc/templateChannels.ts` | TEMPLATE_GET/SET, renderTemplate, EN/CS defaults | ✓ VERIFIED | 133 lines; WR-03 single-pass regex fix present |
| `src/main/ipc/addChannels.ts` | ADD_* + TARGET_ADD_CONTACT handler set | ✓ VERIFIED | 267 lines; 4-layer gate chain, resume computed server-side, accessHash stripped on ADD_GET_JOB |
| `src/main/telegram/__mocks__/telegramClient.ts` | InviteToChannel/AddChatUser/ExportChatInvite/SendMessage/AddContact + error/missingInvitees injection | ✓ VERIFIED | 747 lines; includes `exportChatInvitePeerFloodPeerIds` added for CR-03 regression tests |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `main/index.ts` | `AddExecutor` | `new AddExecutor({...})`, `addExecutorRef` | ✓ WIRED | Shares single client/governor/enumerator/scanner/resolver with Removal/Tag |
| `main/index.ts` | `registerAddChannels` | direct call with executor/enumerator/auditStore/contactService/authState | ✓ WIRED | |
| `main/index.ts` | `registerTemplateChannels` / `preloadTemplateCache` | direct call before executor construction | ✓ WIRED | Cache warmed before any `execute()` can run |
| `targetChannels.ts` (TARGET_RESET) | `AddExecutor.abortExecution()` | `addExecutor?.abortExecution()` | ✓ WIRED | T-14-19, confirmed in `main/index.ts:438` call and `targetChannels.ts:110` |
| `preload/index.ts` | `ADD_*`/`TEMPLATE_*`/`TARGET_ADD_CONTACT` channels | `ipcRenderer.invoke(...)` bridges | ✓ WIRED | All renderer-facing bridge functions present |
| `AddExecutor` | `classifyRpcError` | hard-stop disposition check before every per-group/DM/link-export catch | ✓ WIRED | Verified at 7 distinct catch sites (CR-03 fix) |

### Code Review Findings — Fix Verification

14-REVIEW.md found 3 critical + 4 warning issues. 14-REVIEW-FIX.md claims all 7 fixed. Each was independently re-verified by reading the current source (not trusting the fix report):

| ID | Issue | Fix Verified In Code |
|----|-------|----------------------|
| CR-01 | checkpoint() duplicated dialogId rows on resume | `addAuditStore.ts:208-218` — dedup filter present |
| CR-02 | Non-privacy DM failure wedged the run forever | `AddExecutor.ts:467-477` — `console.error` + `dmStatus:'refused'` + full terminal-state bookkeeping still runs |
| CR-03 | PEER_FLOOD during ExportChatInvite swallowed into `failed` | 5 call sites all check `classifyRpcError(err).disposition === 'hard-stop'` before swallowing (lines 364-367, 681, 728, 784, 799, 432) |
| WR-01 | retryGroup() hard-stop vanished silently | `AddExecutor.ts:569-572` + `_hardStopRetry()` (line 621) |
| WR-02 | fwd_limit retry fired on any non-terminal error | `_isKnownAddTerminalError()` (line 745) now returns true unless disposition is `'fail'` |
| WR-03 | Sequential replace let target name corrupt DM text | `templateChannels.ts:46` — single-pass regex callback |
| WR-04 | chmod comment overstated append-mode guarantee | `addLogStore.ts:149-158` — defensive one-time `chmodSync` + corrected header comment |

All 7 confirmed fixed in the actual `main`-branch source, not merely claimed.

### Data-Flow Trace (Level 4)

Not applicable in the renderer sense (no UI in this phase) — traced instead at the IPC/state level: `AddExecutor._emit()` → `onStateChange` → `emitAddState()` → `win.webContents.send(ADD_STATE, ...)`, and `AddAuditStore.checkpoint()`/`setStatus()` write real data (not static stubs) to `add-job.json` on every state transition, confirmed by direct code read (no hardcoded empty returns found).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npx tsc --build` | Exit 0, no stray `.js`/`.d.ts` emitted beside sources | ✓ PASS |
| Full test suite | `vitest run` (with `.env` loaded) | 37 files / 501 tests passing | ✓ PASS |
| ADD-09 wording alignment | `grep -c "channel at the direct-add cap" REQUIREMENTS.md` | 0 matches (wording adjusted per D-12) | ✓ PASS |
| No debt markers in touched files | grep TODO/FIXME/XXX/HACK/PLACEHOLDER across all 11 phase-touched files | 0 real matches (3 incidental hits are prose describing template placeholders, not markers) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ADD-06 | 14-01/07/08/10/11 | Throttled sequential dispatch via governor, FLOOD_WAIT/PEER_FLOOD handling | ✓ SATISFIED | AddExecutor dispatch loop |
| ADD-07 | 14-01/07/08 | Unban-first | ✓ SATISFIED | EditBanned-then-InviteToChannel, D-04 |
| ADD-08 | 14-01/03/07/09/10/11 | Checkpointed job file, resume | ✓ SATISFIED | addAuditStore + D-20 continuation |
| ADD-09 | 14-01/07/08 | Typed outcome vocabulary | ✓ SATISFIED | addTypes.ts, D-19 |
| ADD-10 | 14-01/07/08 | Unique 5-day single-use invite link | ✓ SATISFIED | _buildPrivacyBlockedOutcome |
| ADD-11 | 14-01/07/09 | Single end-of-run DM, refusal reported | ✓ SATISFIED | end-of-run DM block |
| ADD-05 (main-process half) | 14-02/05/10 | TargetResolver deleted/bot/contact flags + contactService + TARGET_ADD_CONTACT IPC | ✓ SATISFIED | main-process half only, per CONTEXT.md scoping — UI half (checkbox) is Phase 15 |
| ADD-14 (main-process half) | 14-04/11 | add-log.txt store | ✓ SATISFIED | addLogStore.ts — export-via-save-dialog UI is Phase 15 |
| ADD-16 (main-process half) | 14-06/11 | Template store + render function + IPC | ✓ SATISFIED | templateChannels.ts — editor/preview UI is Phase 15 |

**Note (informational, not a gap):** `.planning/REQUIREMENTS.md`'s traceability table marks ADD-05, ADD-14, and ADD-16 as fully `Complete` under `Phase 15` ownership, even though Phase 15 (the UI half) has not yet run — only `.planning/phases/15-*` does not exist yet. This phase's own commit (`7c395ad`) flipped those checkboxes. The main-process halves this phase owns are genuinely complete and verified above; the full-requirement "Complete" marking is premature bookkeeping that Phase 15's verification will need to reconcile (the UI pieces — checkbox, editor/preview, save-dialog export — do not exist yet). This does not block Phase 14's own goal, which explicitly scopes to the main-process halves only.

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers, no empty stub returns, no hardcoded-empty data flows in any of the 11 files this phase created or modified.

### Human Verification Required

None — all 5 ROADMAP success criteria resolve to automated, codebase-verifiable evidence. The 5 items in 14-VALIDATION.md's "Manual-Only Verifications" table (real-server `missing_invitees` shape, DM-refusal server behavior, `expire_date` semantics, `InviteToChannel` no-op-for-member behavior, `AddChatUser` `USER_KICKED` string) are pre-existing documented residual-risk items requiring a live Telegram account — they describe server-behavior confidence levels already called out as MEDIUM in 14-RESEARCH.md and explicitly deferred to live-account testing in the validation plan itself, not newly-discovered gaps from this verification pass.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria are implemented, wired, and covered by passing automated tests. All 3 critical and 4 warning findings from the post-execution code review were re-verified as genuinely fixed by reading the current source directly (not by trusting 14-REVIEW-FIX.md's narrative). The full test suite (37 files / 501 tests) and `tsc --build` are green on the current `main` branch state.

---

_Verified: 2026-10-04T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
