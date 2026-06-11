---
phase: 4
slug: group-enumeration-membership-rights
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

**Note:** Existing vitest config targets `environment: 'node'` with `include: ['src/**/*.test.ts']`. No jsdom/@testing-library/react installed — Phase 4 automated tests cover main-process services only; renderer behavior is verified manually.

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | GRP-01 | — | MembershipScanner returns only verified-member groups | unit | `npm test` | ❌ W0 `src/main/telegram/membershipScanner.test.ts` | ⬜ pending |
| TBD | TBD | TBD | GRP-01 | — | `channels.GetParticipant` USER_NOT_PARTICIPANT → not-member result | unit | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GRP-01 | — | Basic group membership via `messages.GetFullChat` participant list | unit | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GRP-04 | — | Supergroup without `adminRights.banUsers` → canAct=false | unit | `npm test` | ❌ W0 `src/main/telegram/groupEnumerator.test.ts` | ⬜ pending |
| TBD | TBD | TBD | GRP-04 | — | Basic group non-creator → canAct=false | unit | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GRP-05 | — | `Api.Chat` → 'basic-group' | unit | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GRP-05 | — | `Api.Channel` megagroup=true → 'supergroup' | unit | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GRP-05 | — | `Api.Channel` megagroup=false → 'broadcast-channel' | unit | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GRP-02, GRP-03 | — | IPC: scan:start triggers scan; groups:getState returns dialogs; Zod validation on inputs | unit | `npm test` | ❌ W0 `src/main/ipc/groupChannels.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs filled by planner.*

---

## Wave 0 Requirements

- [ ] `src/main/telegram/groupEnumerator.test.ts` — stubs for GRP-04, GRP-05 (type detection + rights detection)
- [ ] `src/main/telegram/membershipScanner.test.ts` — stubs for GRP-01 (membership verification)
- [ ] `src/main/ipc/groupChannels.test.ts` — stubs for GRP-02/GRP-03 IPC handler validation + state push
- [ ] Mock client extensions in `src/main/telegram/__mocks__/telegramClient.ts` — add `getDialogs`, `channels.GetParticipant`, `messages.GetFullChat` mock controls

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Checklist renders pre-checked, uncheckable groups | GRP-02 | No renderer test infra (no jsdom/@testing-library) | Resolve a target, observe groups pane: each actionable group has a checked checkbox; uncheck/recheck works |
| Greyed-out groups show reason + group type label | GRP-03, GRP-05 | No renderer test infra | Verify a group where admin lacks ban rights appears greyed with specific reason text and type badge |
| Two-pane wide layout (left third search, right two-thirds groups) | UI hint | Visual layout | Launch app; window opens ~3x wider; panes proportioned 1/3 : 2/3 below header |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
