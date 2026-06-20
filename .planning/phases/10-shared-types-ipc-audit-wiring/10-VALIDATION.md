---
phase: 10
slug: shared-types-ipc-audit-wiring
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run src/main/ipc/tagChannels.test.ts src/main/storage/tagAuditStore.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (targeted), ~60s full |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for touched files
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-* | 01 | 1 | TAG-03 | — | tagTypes compile cleanly; type-distinct from removal | unit (tsc) | `npx tsc --build` | ❌ W0 | ⬜ pending |
| 10-02-* | 02 | 2 | TAG-03 | — | tag-job.json written 0o600; checkpoint per-outcome; launch-time incomplete detection | unit | `npx vitest run src/main/storage/tagAuditStore.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-* | 03 | 2 | TAG-05 | T-05-04-B | Zod payload carries only {dialogIds, tag}; identity from resolver only, never renderer | unit | `npx vitest run src/main/ipc/tagChannels.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/storage/tagAuditStore.test.ts` — mirror of `auditStore.test.ts` (0o600 write, checkpoint, incomplete detection)
- [ ] `src/main/ipc/tagChannels.test.ts` — mirror of `removalChannels.test.ts` (Zod accept/reject, identity-from-resolver invariant)
- Framework already installed (vitest) — no install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Renderer resume/discard prompt actually surfaces on launch | TAG-03 | Renderer UI is Phase 12; only the main→renderer surfacing channel is testable here | Phase 12 UAT will confirm visually; Phase 10 verifies the IPC surfacing emits incomplete-job state |

*Main-process behaviors all have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-20 (via /gsd:validate-phase)

## Validation Audit 2026-06-20
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

TAG-03 + TAG-05 covered by 24 green automated tests (tagAuditStore 12 + tagChannels 12) plus `tsc --build` for tagTypes. No MISSING gaps; flipped nyquist_compliant → true.
