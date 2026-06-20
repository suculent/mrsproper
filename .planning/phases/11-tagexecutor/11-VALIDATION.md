---
phase: 11
slug: tagexecutor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run src/main/telegram/tagExecutor.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds (targeted), ~60s full |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-* | 01 | 1 | TAG-04 | — | per-group dispatch via mock tagClient; already-admin skip (no API call); basic-group skip | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-* | 02 | 1/2 | TAG-04, TAG-03 | — | generation-guard invalidation; checkpoint+resume from tag-job.json; PEER_FLOOD hard-stop (remaining pending); FLOOD_WAIT via governor | unit | `npx vitest run src/main/telegram/tagExecutor.test.ts` | ❌ W0 | ⬜ pending |
| 11-03-* | 03 | last | TAG-03 | T-05-04-B | identity from main process; reconnect-guard around tagClient open; index.ts stub replaced; onStateChange→emitTagState | unit + tsc | `npx tsc --build && npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/telegram/tagExecutor.test.ts` — mirror of `removalExecutor.test.ts` (per-group dispatch, skip paths, generation guard, checkpoint/resume, PEER_FLOOD, FLOOD_WAIT)
- Framework already installed (vitest) — no install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `editChatParticipantRank` RPC error strings (CHAT_ADMIN_REQUIRED vs RIGHT_FORBIDDEN, USER_NOT_PARTICIPANT) | TAG-04 | Requires a live Telegram account + real groups; error strings are provisional in the spec | Live probe during Phase 11 dev or Phase 12 UAT; classifier defaults unmapped → UNKNOWN so behavior is safe regardless |
| Main-client reconnect-race does not occur during the layer-224 window | TAG-03 | Timing/race condition with live GramJS auto-reconnect; not deterministically unit-testable | Observe a real tag run with the main client active; confirm no main-client disruption |

*Core executor behaviors (dispatch, skip, guard, checkpoint, resume, hard-stop, flood) all have automated coverage via mocked tagClient/governor.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
