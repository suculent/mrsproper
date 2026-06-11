---
phase: 2
slug: rate-limit-governor-error-classification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/main/telegram/governor.test.ts src/main/telegram/operationErrors.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/main/telegram/governor.test.ts src/main/telegram/operationErrors.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD (planner fills) | — | — | EXE-01 | — | Concurrent `governor.run()` calls execute one-at-a-time | unit | `npx vitest run src/main/telegram/governor.test.ts -t "serialization"` | ❌ W0 | ⬜ pending |
| TBD (planner fills) | — | — | EXE-02 | — | FloodWaitError → sleep `seconds+jitter`, resume, countdown event emitted | unit + fake timers | `npx vitest run src/main/telegram/governor.test.ts -t "FLOOD_WAIT"` | ❌ W0 | ⬜ pending |
| TBD (planner fills) | — | — | EXE-02 | — | D-12 ceiling: wait > 3600s → surfaced, not slept | unit | `npx vitest run src/main/telegram/governor.test.ts -t "ceiling"` | ❌ W0 | ⬜ pending |
| TBD (planner fills) | — | — | EXE-03 | — | PEER_FLOOD → hard-stop disposition, zero retries | unit | `npx vitest run src/main/telegram/governor.test.ts -t "PEER_FLOOD"` | ❌ W0 | ⬜ pending |
| TBD (planner fills) | — | — | EXE-03 | — | classifyRpcError maps PEER_FLOOD distinctly from FLOOD_WAIT | unit | `npx vitest run src/main/telegram/operationErrors.test.ts -t "PEER_FLOOD"` | ❌ W0 | ⬜ pending |
| TBD (planner fills) | — | — | D-14 | — | Transient error → 3 retries with backoff + jitter, then fail | unit | `npx vitest run src/main/telegram/governor.test.ts -t "transient retry"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/telegram/governor.test.ts` — stubs for EXE-01, EXE-02 (flood sleep + countdown + ceiling), D-14 transient retry
- [ ] `src/main/telegram/operationErrors.test.ts` — stubs for EXE-03 (PEER_FLOOD distinct classification), D-04 taxonomy
- [ ] `src/shared/opTypes.ts` — `Disposition` enum, `OperationErrorCode` type (needed by both test files and implementation)

Existing test infrastructure (`vitest.config.ts`, `src/**/*.test.ts` glob, `node` environment, `@shared` alias) covers all phase requirements without modification.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real FLOOD_WAIT against live Telegram | EXE-02 | Cannot trigger server-side rate limit deterministically in CI | Observe governor behavior during Phase 5 bulk-run UAT; mock-client tests cover the logic path |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
