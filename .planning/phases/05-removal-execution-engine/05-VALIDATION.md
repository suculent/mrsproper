---
phase: 5
slug: removal-execution-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | electron-vite project setup (existing) |
| **Quick run command** | `npx vitest run src/main/telegram/removalExecutor.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~6 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command plus `npx tsc --noEmit`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite green (known exception: config.test.ts AUTH-03 env-dependent RED tests)
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

> Filled per task by the planner. Source: 05-RESEARCH.md "Validation Architecture".

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | RMV-01/RMV-02/EXE-04/EXE-05 | — | revokeHistory never true; correct mechanic per chat type | unit | `npx vitest run src/main/telegram/removalExecutor.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/telegram/removalExecutor.test.ts` — stubs for: ban = single EditBanned (viewMessages, untilDate 0); kick = restrict-then-unban two-call sequence; basic group = DeleteChatUser without revokeHistory + ban-fallback annotation; per-group failure isolation; USER_NOT_PARTICIPANT → already-gone success; PEER_FLOOD → hard-stop with checkpoint; abort mid-run → remaining skipped; generation-guard race
- [ ] `src/main/storage/auditStore.test.ts` (or equivalent) — stubs for: atomic write (temp-rename), per-outcome checkpoint persistence, incomplete-job detection on launch, resume-from-first-unprocessed
- [ ] Mock client extension — `channels.EditBanned`, `messages.DeleteChatUser` dispatch branches with call-recording for sequence assertions
- [ ] Existing vitest infrastructure covers the rest

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live removal against a real group (throwaway account/group) | RMV-01/RMV-02 | Destructive; requires live MTProto + test group | Run a ban (Phase 5 default) against a test target in a throwaway group; verify target removed and cannot rejoin; verify per-row statuses + report |
| Pacing feel (2s + jitter) and FLOOD_WAIT countdown | EXE-04 | Timing/visual | Run a multi-group removal; confirm visible inter-group pacing and flood subline if triggered |
| Crash-resume flow | EXE-05 | Requires app kill mid-job | Kill the app mid-run; relaunch; verify Resume/Discard dialog and correct continuation from first unprocessed group |
