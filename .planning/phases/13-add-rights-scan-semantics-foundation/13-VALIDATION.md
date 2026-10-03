---
phase: 13
slug: add-rights-scan-semantics-foundation
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-03
approved: 2026-10-03
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (project-wide; `package.json` `"test": "vitest run"`) |
| **Config file** | `electron.vite.config.ts` (vitest config is colocated; no separate `vitest.config.ts`) |
| **Quick run command** | `npx vitest run src/main/telegram/groupEnumerator.test.ts src/main/telegram/membershipScanner.test.ts src/main/telegram/tagExecutor.test.ts` |
| **Full suite command** | `npm test` (`vitest run`, full suite — 33 files pre-phase, 31 post-phase once `tagClient.test.ts`/`tagApi.test.ts` are deleted per D-10) |
| **Estimated runtime** | ~15-30s (quick, 3 targeted files) / ~90-120s (full suite) |

---

## Sampling Rate

- **After every task commit:** Run a targeted `npx vitest run <file touched> -t "<pattern>"` for the file(s) that task modified (or `npx tsc --build` for type-only/wiring tasks)
- **After every plan wave:** Run `npm test` (full suite — confirms no regression in `removalExecutor.test.ts`, `groupEnumerator.test.ts`, `membershipScanner.test.ts`, `tagExecutor.test.ts`, `tlLayer.test.ts`)
- **Before `/gsd:verify-work`:** Full suite must be green AND `npx tsc --build` clean (not bare `tsc --noEmit`, which checks zero files in this repo — per RESEARCH.md Pitfall 7)
- **Max feedback latency:** ~120 seconds (full-suite upper bound)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | ADD-04 | T-13-02 / T-13-03 | AddGreyReason/canAdd fields added to the DTO carry no accessHash; new i18n copy is static, non-executable JSON | typecheck | `npx tsc --build` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | ADD-03, ADD-04 | T-13-01 | `canAdd` is computed exclusively in `GroupEnumerator` from `entity.creator`/`adminRights`/`defaultBannedRights`; the renderer never derives it (ADD-04 invariant) | unit (TDD) | `npx vitest run src/main/telegram/groupEnumerator.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 1 | ADD-02 | — | N/A (renderer-only folded-todo verification, no security-relevant code path) | regression | `ls .planning/todos/done/2026-06-11-default-country-czechia.md .planning/todos/done/2026-06-11-country-picker-rows-clickable.md 2>&1` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | ADD-02 | T-13-04 | `banned` status is read only from the Telegram server's own authenticated RPC response; basic-group path restricted to `member`/`not-member` only (D-03 — bans are not visible via `messages.GetFullChat`) | typecheck | `npx tsc --build` | ✅ | ⬜ pending |
| 13-02-02 | 02 | 2 | ADD-02 | T-13-04 | The `left`-flag polarity (D-01) is locked as a documented, tested contract rather than an unverified assumption | unit (TDD) | `npx vitest run src/main/telegram/membershipScanner.test.ts` | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 2 | TAG-07 | T-13-06 / T-13-07 | Second in-memory `StringSession` copy eliminated; `EditChatParticipantRank`/`GetParticipant` both routed through `governor.run()` on the single shared authenticated client | regression (grep) | `grep -rn "AllTLObjects\|layer-224\|restoreMainClientLayer\|tagClientFactory" src/main/telegram/TagExecutor.ts \| wc -l` | ✅ | ⬜ pending |
| 13-03-02 | 03 | 2 | TAG-07 | T-13-08 | No dangling `tagClientFactory`/`restoreMainClientLayer`/`TagClient` references survive the wiring simplification (compile-time safety net via `tsc`) | typecheck | `npx tsc --build` | ✅ | ⬜ pending |
| 13-03-03 | 03 | 2 | TAG-07 | T-13-09 / T-13-06 | A parse failure on `EditChatParticipantRank` surfaces as a real `UNKNOWN` failed outcome instead of being silently recorded as `done` (D-11) | unit (TDD) | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/telegram/__mocks__/telegramClient.ts` — extend `MockClientConfig.getDialogsResult` with `adminRights.inviteUsers` / `defaultBannedRights.inviteUsers` / `participantsCount` fields, and thread them through the `getDialogs` mock's `Api.Chat`/`Api.Channel` construction — performed by **13-01 Task 1** (13-01-01)
- [ ] `src/main/telegram/groupEnumerator.test.ts` — new `it()` blocks for `canAdd` (D-04), basic-group parity (D-05), broadcast-channel `canAdd`/`channel-full` (D-06) — performed by **13-01 Task 2** (13-01-02)
- [ ] `src/main/telegram/membershipScanner.test.ts` — replace the existing `ChannelParticipantBanned` assertion (`isMember=false` → `status==='banned'`) and add the `left=true` → `'not-member'` case plus a basic-group negative assertion — performed by **13-02 Task 2** (13-02-02)
- [ ] `src/main/telegram/tagClient.ts`, `tagClient.test.ts`, `tagApi.ts`, `tagApi.test.ts` — deleted outright (D-10) — performed by **13-03 Task 1** (13-03-01)
- [ ] `src/main/telegram/__mocks__/telegramClient.ts` — extend `invoke()` dispatch to handle `EditChatParticipantRank` requests (recording calls, error injection via `tagErrorDialogIds`) — performed by **13-03 Task 3** (13-03-03)
- [ ] `src/main/telegram/tagExecutor.test.ts` — rewrite the `makeTagExecutor` factory to a single-client fixture, add the new D-11 `UNKNOWN`-outcome test — performed by **13-03 Task 3** (13-03-03)
- [ ] No new test framework/config install needed — Vitest is already fully wired project-wide

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Czech and English `addGreyReason` copy tone/accuracy (`already-member`, `no-invite-right`, `channel-full`, `banned-no-unban-right`) | ADD-04 (D-09) | Subjective language/tone review — Claude drafts formal-vykání Czech and short factual English per D-09, but the user is the final arbiter of wording, not an automated check | At UAT, open `src/renderer/i18n/locales/en/groups.json` and `.../cs/groups.json`, read the four new `greyReason` entries aloud in context, and confirm tone/formality matches the existing removal-reason lines; request wording tweaks if needed |
| `ChannelParticipantBanned.left` polarity for a real kick+ban vs. a restricted-but-present ban, against a live Telegram server | ADD-02 (D-01, Open Question 2) | No live Telegram test account with a real banned/kicked member was available during this research/planning session (RESEARCH.md Environment Availability); the locked D-01 mapping is a documented assumption (A2), not yet empirically confirmed against live server behavior | Before Phase 14 builds the unban-first flow: using a real test account and a disposable supergroup/channel, ban then kick a test user, call `GetParticipant` on that user, and confirm `left` is unset/false while still banned (matching D-01's `'banned'` mapping); if inverted, flag as a blocking fix before Phase 14 starts |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-03
