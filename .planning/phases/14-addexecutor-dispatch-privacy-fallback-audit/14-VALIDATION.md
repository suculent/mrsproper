---
phase: 14
slug: addexecutor-dispatch-privacy-fallback-audit
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-03
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 |
| **Config file** | Project-level Vitest config (shared root config; no new config needed) |
| **Quick run command** | `npx vitest run src/main/telegram/addExecutor.test.ts` |
| **Full suite command** | `npx tsc --build && find src -name '*.js' -newer package.json -delete 2>/dev/null; find src -name '*.d.ts' -newer package.json -delete 2>/dev/null; npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run -t "<describe block>" <touched test file>`
- **After every plan wave:** Run the full suite command (tsc --build, delete stray emitted .js/.d.ts beside sources, then vitest run)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | ADD-06..ADD-11 | T-14-01 | addTypes.ts defines the full outcome/job/log/DM-text contract every later task implements against | typecheck | `npx tsc --build` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | ADD-06..ADD-11 | — | ADD_*/TARGET_ADD_CONTACT/TEMPLATE_* channel constants exist and are in the CHANNELS namespace | typecheck | `npx tsc --build` | ❌ W0 | ⬜ pending |
| 14-01-03 | 01 | 1 | ADD-09 | — | REQUIREMENTS.md ADD-09 wording aligned with D-07/D-12 routing | manual grep | `grep -c "channel at the direct-add cap" .planning/REQUIREMENTS.md` (expect 0) | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | ADD-06, ADD-09, ADD-10 | — | Mock TelegramClient supports InviteToChannel/AddChatUser/ExportChatInvite/SendMessage/AddContact dispatch + error/missingInvitees injection | typecheck | `npx tsc --build` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | ADD-05 | T-14-02 | resolver.getResolvedUser() returns deleted/bot/contact for all 3 resolution paths; stale-resolution restore covers the new fields | unit (TDD) | `npx vitest run src/main/telegram/targetResolver.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-01/02 | 03 | 2 | ADD-08 | T-14-03, T-14-04 | add-job.json atomic write, 0o600, Zod-validated readJob, sameDialogIdSet helper | unit (TDD) | `npx vitest run src/main/storage/addAuditStore.test.ts` | ❌ W0 | ⬜ pending |
| 14-04-01/02 | 04 | 2 | ADD-14 | T-14-05 | add-log.txt append-only, 0o600, one block per run, follow-up marker | unit (TDD) | `npx vitest run src/main/storage/addLogStore.test.ts` | ❌ W0 | ⬜ pending |
| 14-05-01/02 | 05 | 2 | ADD-05 | T-14-06 | contacts.AddContact non-blocking, skip-if-contact, never throws | unit (TDD) | `npx vitest run src/main/telegram/contactService.test.ts` | ❌ W0 | ⬜ pending |
| 14-06-01/02 | 06 | 2 | ADD-16 | T-14-07, T-14-08 | renderTemplate single-brace substitution, EN/CS defaults, TEMPLATE_GET/SET Zod-validated | unit (TDD) | `npx vitest run src/main/ipc/templateChannels.test.ts` | ❌ W0 | ⬜ pending |
| 14-07-01 | 07 | 3 | ADD-06..ADD-11 | T-14-09 | All AddExecutor behavior expressed as failing tests (RED) — dispatch, unban, D-05 precheck, already-member, privacy-block+link, channel-full branching, error classification, hard-stop/abort, resume, DM, add-log | unit (TDD, RED) | `npx vitest run src/main/telegram/addExecutor.test.ts` (expect non-zero, missing-module reason) | ❌ W0 | ⬜ pending |
| 14-08-01 | 08 | 4 | ADD-06, ADD-07, ADD-09, ADD-10 | T-14-10, T-14-11, T-14-12 | Per-group dispatch (both mechanics), unban-first, D-05 precheck, privacy-block+inline link, channel-full branching, full error classification, PEER_FLOOD hard-stop, retryGroup | unit (TDD, GREEN) | `npx vitest run src/main/telegram/addExecutor.test.ts -t "per-group dispatch\|unban-before-invite\|D-05 pre-flight\|already-member\|privacy-blocked\|channel-full branching\|error classification\|PEER_FLOOD hard-stop\|retryGroup"` | ❌ W0 | ⬜ pending |
| 14-09-01 | 09 | 5 | ADD-08, ADD-11 | T-14-13, T-14-14 | D-20 continuation-based resume; end-of-run DM aggregation across segments; add-log append with isFollowUp | unit (TDD, GREEN) | `npx vitest run src/main/telegram/addExecutor.test.ts` (full file, no filter) | ❌ W0 | ⬜ pending |
| 14-10-01/02 | 10 | 6 | ADD-06, ADD-08, ADD-05 | T-14-15, T-14-16, T-14-17, T-14-18 | ADD_* IPC 4-layer gate chain, resume computed server-side, GET_JOB strips accessHash, target:addContact never throws | unit (TDD) | `npx vitest run src/main/ipc/addChannels.test.ts` | ❌ W0 | ⬜ pending |
| 14-11-01 | 11 | 7 | ADD-16 | — | Synchronous template/language cache so DmTextProvider stays sync while electron-store stays async | typecheck | `npx tsc --build` | ❌ W0 | ⬜ pending |
| 14-11-02 | 11 | 7 | ADD-06, ADD-08, ADD-05, ADD-14, ADD-16 | T-14-19, T-14-20 | AddExecutor/addChannels/templateChannels wired into main/index.ts + preload bridge; TARGET_RESET aborts an active add run | typecheck + regression | `npx tsc --build && npx vitest run src/main/ipc/targetChannels.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs use the `{phase}-{plan}-{task}` convention; a `/` joins RED+GREEN task pairs that live in one TDD plan.*

---

## Wave 0 Requirements

Wave 0 = this phase's first two dependency-graph waves (1-2), which scaffold every contract and
test-infrastructure piece later waves build against. All now have a concrete plan:

- [x] `src/main/telegram/__mocks__/telegramClient.ts` — extended in Plan 14-02 with `InviteToChannel`, `AddChatUser`, `ExportChatInvite`, `SendMessage`, `AddContact` dispatch branches, call-recording arrays, and `missingInvitees`/error injection
- [x] `src/shared/addTypes.ts` — new type module, Plan 14-01
- [x] `src/main/storage/addAuditStore.ts` + `addAuditStore.test.ts` — Plan 14-03, with the continuation-aware `sameDialogIdSet` helper
- [x] `src/main/storage/addLogStore.ts` + `addLogStore.test.ts` — Plan 14-04, append-only plain-text writer
- [x] `src/main/telegram/AddExecutor.ts` + `addExecutor.test.ts` — RED in Plan 14-07, GREEN in Plans 14-08/14-09
- [x] `src/main/telegram/targetResolver.test.ts` — new assertions in Plan 14-02 for the extended `getResolvedUser()` shape
- [x] `src/main/ipc/addChannels.ts` + contact (`contactService.ts`, Plan 14-05)/template (`templateChannels.ts`, Plan 14-06) modules + `.test.ts` files — Plan 14-10 for addChannels, mirroring `tagChannels.ts`'s security-gate pattern

*Boxes above indicate "a plan now exists for this gap," not "this has been executed" — execution status is tracked per-task in the table above, and flips to ✅ only as `/gsd:execute-phase` runs each plan.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `InviteToChannel` returns `missing_invitees` for a privacy-restricted user | ADD-10 | Telegram server behaviour; cannot be unit-tested | Live account: add a user with "Groups & channels: My contacts" privacy to a supergroup; confirm `privacy-blocked` outcome and a 5-day single-use link in the group's invite manager |
| DM refusal when target blocks messages from non-contacts | ADD-11 | Telegram privacy enforcement is server-side | Live account: target with "Messages: My contacts"; confirm distinct DM-refused outcome and links retained in add-job.json / add log |
| `expire_date` absolute vs relative semantics | ADD-10 | Undocumented RPC detail flagged MEDIUM in research | Live account: export a link, inspect expiry in Telegram client equals creation + 5 days |
| `channels.inviteToChannel` silent no-op (or omission from `missing_invitees`) for an already-participating user | ADD-09 | Undocumented RPC behavior difference vs `messages.addChatUser` (14-RESEARCH.md Pitfall 5 / A3) | Live account: invite an existing member to a supergroup via InviteToChannel directly; confirm no thrown error and observe whether `missingInvitees` omits them |
| `messages.addChatUser` `USER_KICKED` for a previously-kicked basic-group member | ADD-09 | Not in official docs for this method (14-RESEARCH.md A4), only asserted by CONTEXT.md D-02 | Live account: kick a user from a basic group, then attempt to re-add via AddChatUser; confirm the exact error string |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (planning-time sign-off; execution-time status per task still ⬜ pending until `/gsd:execute-phase 14` runs)
