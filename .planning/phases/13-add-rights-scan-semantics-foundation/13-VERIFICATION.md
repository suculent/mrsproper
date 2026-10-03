---
phase: 13-add-rights-scan-semantics-foundation
verified: 2026-10-03T18:20:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 13: Add Rights & Scan Semantics Foundation Verification Report

**Phase Goal:** The main process can tell, for every enumerated dialog, whether the target can be added there and why not — including broadcast channels when the admin holds the invite right — and the dead layer-224 isolation code is gone from `TagExecutor`, with no renderer changes yet.
**Verified:** 2026-10-03T18:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every `AdminDialogDTO` carries a `canAdd` boolean computed in `GroupEnumerator` from creator status, `inviteUsers` admin right, or default permissions — renderer never derives it | ✓ VERIFIED | `src/shared/groupTypes.ts:56-59` adds `canAdd: boolean` / `addGreyReason: AddGreyReason \| null` to `AdminDialogDTO`. `src/main/telegram/GroupEnumerator.ts` has a private `_computeCanAdd(entity)` helper (lines ~255-262) implementing `creator === true \|\| adminRights?.inviteUsers === true \|\| defaultBannedRights?.inviteUsers !== true`, called from all three `_classifyDialog` branches (basic-group, supergroup, broadcast-channel) and threaded through `_buildDTO`. No renderer file computes `canAdd`/`addGreyReason` anywhere (grep across `src/renderer` for `_computeCanAdd`/rights derivation returns nothing — only consumption via DTO fields would occur in Phase 15, not yet present). `groupEnumerator.test.ts` has 10 dedicated `canAdd`/`addGreyReason` tests across all 3 branches, all passing. |
| 2 | A broadcast channel with the invite right reports `canAdd: true` while `canAct: false` is unaffected; without the invite right, `canAdd: false` | ✓ VERIFIED | `GroupEnumerator.ts` broadcast-channel branch always sets `canAct: false, greyReason: 'broadcast-channel'` (removal semantics untouched) and independently computes `canAdd`/`addGreyReason` via `_computeCanAdd`. Tests: `'canAdd=true while canAct stays false when admin holds the invite right (D-06, ADD-03)'` and `'canAdd=false with addGreyReason=no-invite-right when the admin lacks the invite right (D-06)'` both pass (`groupEnumerator.test.ts:308-349`). |
| 3 | Membership/rights data distinguishes "already a member" from "not a member, no invite right" per dialog so Add mode can grey with a cause-specific reason | ✓ VERIFIED | `MembershipStatus` widened to include `'banned'` (`groupTypes.ts:65`); `AddGreyReason` union carries `'already-member' \| 'no-invite-right' \| 'channel-full' \| 'banned-no-unban-right'` (`groupTypes.ts:27-31`), each backed by English (`src/renderer/i18n/locales/en/groups.json:8-11`) and Czech (`cs/groups.json:8-11`) copy. `MembershipScanner._checkMembership` now returns the full `MembershipStatus` discriminator (not a boolean), splitting `ChannelParticipantBanned`(left unset) → `'banned'` from `ChannelParticipantBanned`(left=true)/`ChannelParticipantLeft`/`USER_NOT_PARTICIPANT` → `'not-member'`, tested in `membershipScanner.test.ts:154-184`. Basic-group path proven (by a dedicated negative-assertion test, line 228-242) to never emit `'banned'` (D-03). The `'already-member'`/`'banned-no-unban-right'` grey-reason *values* exist as data; their gating/sort/render logic is explicitly and correctly deferred to Phase 15 per the plan's own must-haves — this matches the phase goal's "no renderer changes yet" scope boundary, not a gap. |
| 4 | `TagExecutor` contains no two-phase layer isolation logic, no `restoreMainClientLayer` calls, no stale layer-224 comments; existing `tagExecutor.test.ts` passes unmodified in behavior | ✓ VERIFIED | `grep -rn "AllTLObjects\|layer-224\|restoreMainClientLayer\|tagClientFactory\|_connectingTagClient" src/main/telegram/TagExecutor.ts src/main/index.ts` returns zero matches. `tagClient.ts`, `tagClient.test.ts`, `tagApi.ts`, `tagApi.test.ts` confirmed deleted (`ls` → "No such file or directory" for all four). `TagExecutor.ts` has exactly one `for (const dialog of selectedDialogs)` loop and issues `new Api.messages.EditChatParticipantRank(...)` through `this._governor.run(() => this._client.invoke(...))` on the single injected client (no second client/connect/disconnect). `main/index.ts`'s `TagExecutor` wiring (lines 321-328) mirrors `RemovalExecutor`'s single-client shape exactly, with no `tagClientFactory`/`restoreMainClientLayer`/`TagClient` import. `npx vitest run src/main/telegram/tagExecutor.test.ts` → 14/14 pass including a new D-11 `UNKNOWN`-outcome regression test proving no "unparseable response = success" tolerance was reintroduced. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/groupTypes.ts` | `AddGreyReason` type, `AdminDialogDTO.canAdd`/`addGreyReason`, widened `MembershipStatus` | ✓ VERIFIED | All three present exactly as specified; `npx tsc --build` exits 0 confirming no consumer breaks |
| `src/main/telegram/GroupEnumerator.ts` | `canAdd`/`addGreyReason` computation, zero new API calls | ✓ VERIFIED | `_computeCanAdd` reads only already-fetched entity fields (`creator`, `adminRights`, `defaultBannedRights`, `participantsCount`); no new `governor.run`/`invoke` call added |
| `src/renderer/i18n/locales/en/groups.json` / `cs/groups.json` | 4 new bilingual `greyReason` keys | ✓ VERIFIED | `already-member`, `no-invite-right`, `channel-full`, `banned-no-unban-right` present in both files with distinct EN/CS copy |
| `src/main/telegram/__mocks__/telegramClient.ts` | `adminRights.inviteUsers`/`defaultBannedRights`/`participantsCount` mock support + `EditChatParticipantRank` dispatch | ✓ VERIFIED | Both present; `MockClientConfig` extended (lines 130-134), `getDialogs` threads new fields through `Api.Chat`/`Api.Channel` construction (lines 496-498); `EditChatParticipantRank` dispatch branch added (lines 456-465) with `editChatParticipantRankCalls`/`tagErrorDialogIds` recording |
| `src/main/telegram/MembershipScanner.ts` | `_checkMembership` returns `MembershipStatus` directly, both call sites updated | ✓ VERIFIED | `scan()` (line 134) and `retryGroup()` (line 206) both call `await this._checkMembership(...)` directly with no boolean ternary; `grep -c "await this._checkMembership"` = 2 |
| `src/main/telegram/TagExecutor.ts` | Single-client, single-loop state machine | ✓ VERIFIED | One loop, `this._governor.run(() => this._client.invoke(...))` used ≥2 times (precheck + write), no dead files imported |
| `src/main/index.ts` | Simplified `TagExecutor` wiring, no `tagClientFactory` | ✓ VERIFIED | Wiring block mirrors `RemovalExecutor`'s single-client cast pattern |
| `src/main/telegram/tagClient.ts`/`tagClient.test.ts`/`tagApi.ts`/`tagApi.test.ts` | Deleted | ✓ VERIFIED | All four confirmed absent from the filesystem |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `GroupEnumerator.ts` | `groupTypes.ts` | `AdminDialogDTO.canAdd` / `AddGreyReason` import | ✓ WIRED | `import type { ... AddGreyReason } from '@shared/groupTypes'`; `canAdd:`/`addGreyReason:` populated in all 3 `_buildDTO` call sites |
| `groupEnumerator.test.ts` | `__mocks__/telegramClient.ts` | `getDialogsResult` config fields | ✓ WIRED | Test file configures `adminRights.inviteUsers`/`defaultBannedRights`/`participantsCount`; mock threads them into constructed `Api.Chat`/`Api.Channel` entities |
| `TagExecutor.ts` | `governor.ts` | `this._governor.run(() => this._client.invoke(new Api.messages.EditChatParticipantRank(...)))` | ✓ WIRED | Confirmed at `TagExecutor.ts:335-338` |
| `main/index.ts` | `TagExecutor.ts` | `new TagExecutor({ client, governor, enumerator, resolver, auditStore, onStateChange })` | ✓ WIRED | Confirmed at `main/index.ts:321-328`, single-client shape, no dead constructor params |

### Data-Flow Trace (Level 4)

Not applicable in the strict rendering sense — this phase is main-process-only (no renderer UI consumes the new fields yet, by design: "no renderer changes yet"). The relevant data-flow check is that `canAdd`/`addGreyReason`/`'banned'` status are computed from **real entity fields already fetched by `getDialogs()`/`GetParticipant()`**, not hardcoded or stubbed:

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `GroupEnumerator._computeCanAdd` | `canAdd` | `entity.creator`/`entity.adminRights`/`entity.defaultBannedRights` (fields on the already-fetched `Api.Chat`/`Api.Channel` from `getDialogs()`) | Yes | ✓ FLOWING |
| `MembershipScanner._checkMembership` | `status` ('banned'/'not-member') | `participant.className`/`participant.left` from the real `channels.GetParticipant` RPC response | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| GroupEnumerator computes canAdd/addGreyReason correctly across all 3 dialog types + channel-full override | `npx vitest run src/main/telegram/groupEnumerator.test.ts` | 26/26 pass | ✓ PASS |
| MembershipScanner banned/not-member split + left-polarity + basic-group negative case | `npx vitest run src/main/telegram/membershipScanner.test.ts` | all pass | ✓ PASS |
| TagExecutor single-client rewrite preserves all prior behavior + new D-11 UNKNOWN test | `npx vitest run src/main/telegram/tagExecutor.test.ts` | 14/14 pass | ✓ PASS |
| tlLayer regression guard (layer-229 import, unaffected by TagExecutor rewrite) | `npx vitest run src/main/telegram/tlLayer.test.ts` | pass | ✓ PASS |
| Type safety across the widened shared DTO/status types | `npx tsc --build` | exit 0 | ✓ PASS |
| Full project regression | `npx vitest run` (with `.env` sourced) | 368/368 pass, 31/31 files | ✓ PASS |
| Full project regression without `.env` (documented pre-existing gap) | `npx vitest run src/main/telegram/config.test.ts` (env unset) | 2/3 fail (`AUTH-03` env-var tests) | ✓ PASS (confirmed pre-existing, untouched by Phase 13 — last modified in commit `ea57b7c`, unrelated to this phase) |

### Probe Execution

Not applicable — this is not a migration/tooling phase with declared probes; no `scripts/*/tests/probe-*.sh` files exist and none are referenced in the Phase 13 plans/summaries.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ADD-02 | 13-01 | Add-mode checklist inversion data + cause-specific grey reason | ✓ SATISFIED (data foundation) | `canAdd`/`addGreyReason` computed and tested in `GroupEnumerator`; `'already-member'`/`'banned-no-unban-right'` data values exist. Note: the user-visible checklist-inversion *rendering* is explicitly scoped to Phase 15 (ROADMAP Phase 15 success criterion 2) — REQUIREMENTS.md marks ADD-02 "Complete" at Phase 13 based on the roadmap's own phase-to-requirement mapping; this is a pre-existing roadmap design decision, not a gap introduced by this verification. |
| ADD-03 | 13-01 | Broadcast channels actionable in Add mode with invite right | ✓ SATISFIED | `GroupEnumerator.ts` broadcast-channel branch, tested at `groupEnumerator.test.ts:308-349` |
| ADD-04 | 13-01 | `canAdd` flag computed in main process only | ✓ SATISFIED | `_computeCanAdd` is private to `GroupEnumerator`; no renderer derivation found |
| TAG-07 | 13-03 | TagExecutor layer-224 cleanup | ✓ SATISFIED | Confirmed via grep + deleted files + passing test suite |

**Orphaned requirements check:** `.planning/REQUIREMENTS.md` traceability table maps exactly ADD-02, ADD-03, ADD-04, TAG-07 to Phase 13, matching all 4 requirement IDs declared across the 3 plans' frontmatter. No orphaned requirements.

### Anti-Patterns Found

None. Scanned all files modified across the 3 plans (`groupTypes.ts`, `GroupEnumerator.ts`, `groupEnumerator.test.ts`, `MembershipScanner.ts`, `membershipScanner.test.ts`, `TagExecutor.ts`, `main/index.ts`, `__mocks__/telegramClient.ts`, `tagExecutor.test.ts`, both `groups.json` locale files) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|placeholder|coming soon|not yet implemented|not available` — zero matches across all files.

### Human Verification Required

None. This phase is main-process/data-layer only, with no renderer UI changes (by design, per the phase goal). All behaviors are verifiable programmatically via tests and static analysis, and were verified above.

### Gaps Summary

No gaps found. All 4 ROADMAP success criteria verified against actual code (not SUMMARY.md claims): `canAdd`/`addGreyReason` computation is real and tested across all three dialog-type branches including the broadcast-channel `canAdd`/`canAct` independence and the 200-member `channel-full` override; `MembershipScanner` genuinely splits `'banned'` from `'not-member'` with the documented `left`-flag polarity and a basic-group negative-assertion test; `TagExecutor`'s two-phase layer-224 architecture and all four dead files (`tagClient.ts`/`.test.ts`, `tagApi.ts`/`.test.ts`) are confirmed gone, replaced by a single-client, single-loop design mirroring `RemovalExecutor`. `npx tsc --build` exits 0, and the full test suite passes 368/368 with `.env` sourced (2 pre-existing, unrelated `config.test.ts` env-var failures confirmed when `.env` is unset, matching the verification notes exactly). All referenced git commits exist in history; working tree is clean.

---

*Verified: 2026-10-03T18:20:00Z*
*Verifier: Claude (gsd-verifier)*
