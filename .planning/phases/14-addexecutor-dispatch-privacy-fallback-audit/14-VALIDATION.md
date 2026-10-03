---
phase: 14
slug: addexecutor-dispatch-privacy-fallback-audit
status: draft
nyquist_compliant: false
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
| TBD | — | 0 | ADD-06 | — | Dispatch by dialog type via governor, ~3s pacing | unit | `npx vitest run -t "per-group dispatch" src/main/telegram/addExecutor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-06 | — | FLOOD_WAIT absorbed via governor with countdown | unit | `npx vitest run -t "FLOOD_WAIT" src/main/telegram/addExecutor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-06 | — | PEER_FLOOD hard-stops, remaining groups not skipped | unit | `npx vitest run -t "PEER_FLOOD hard-stop" src/main/telegram/addExecutor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-07 | — | EditBanned in own governor.run() before invite | unit | `npx vitest run -t "unban-first" src/main/telegram/addExecutor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-07 | — | Ban stays lifted when subsequent invite fails | unit | `npx vitest run -t "ban stays lifted" src/main/telegram/addExecutor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-08 | — | add-job.json atomic write, 0o600, accessHash stripped from safe view | unit | `npx vitest run src/main/storage/addAuditStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-08 | — | Resume preserves jobId + outcomes across segments | unit | `npx vitest run -t "resume" src/main/telegram/addExecutor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-09 | — | Outcome vocabulary + error-code mapping | unit | `npx vitest run -t "outcome classification" src/main/telegram/addExecutor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-10 | — | ExportChatInvite on privacy-block, usageLimit=1, expireDate=+5d | unit | `npx vitest run -t "invite link" src/main/telegram/addExecutor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-11 | — | One SendMessage at run end; refusal → distinct dm status, links retained | unit | `npx vitest run -t "direct message" src/main/telegram/addExecutor.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-05 | — | contacts.AddContact non-blocking, skip if already contact | unit | `npx vitest run src/main/contacts/contactService.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-14 | — | add-log append-only, one block per run, 0o600 | unit | `npx vitest run src/main/storage/addLogStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-16 | — | Template store get/set with schema validation, default by language, render | unit | `npx vitest run src/main/ipc/templateChannels.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs, plan, and wave columns are filled by the planner once PLAN.md files exist.*

---

## Wave 0 Requirements

- [ ] `src/main/telegram/__mocks__/telegramClient.ts` — extend with `InviteToChannel`, `AddChatUser`, `ExportChatInvite`, `SendMessage`, `AddContact` dispatch branches, call-recording arrays, and `missingInvitees` injection
- [ ] `src/shared/addTypes.ts` — new type module
- [ ] `src/main/storage/addAuditStore.ts` + `addAuditStore.test.ts` — new, with continuation-aware resume contract
- [ ] `src/main/storage/addLogStore.ts` + `addLogStore.test.ts` — new, append-only plain-text writer
- [ ] `src/main/telegram/AddExecutor.ts` + `addExecutor.test.ts` — new, cloned from RemovalExecutor shape
- [ ] `src/main/telegram/targetResolver.test.ts` — new assertions for extended `getResolvedUser()` shape (deleted/bot/contact flags)
- [ ] `src/main/ipc/addChannels.ts` + contact/template IPC modules + `.test.ts` files — new, mirroring `tagChannels.ts` security-gate pattern

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `InviteToChannel` returns `missing_invitees` for a privacy-restricted user | ADD-10 | Telegram server behaviour; cannot be unit-tested | Live account: add a user with "Groups & channels: My contacts" privacy to a supergroup; confirm `privacy-blocked` outcome and a 5-day single-use link in the group's invite manager |
| DM refusal when target blocks messages from non-contacts | ADD-11 | Telegram privacy enforcement is server-side | Live account: target with "Messages: My contacts"; confirm distinct DM-refused outcome and links retained in add-job.json / add log |
| `expire_date` absolute vs relative semantics | ADD-10 | Undocumented RPC detail flagged MEDIUM in research | Live account: export a link, inspect expiry in Telegram client equals creation + 5 days |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
