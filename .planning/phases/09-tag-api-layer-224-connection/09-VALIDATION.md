---
phase: 9
slug: tag-api-layer-224-connection
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
---

# Phase 9 — Validation Strategy

> Reconstructed from artifacts during /gsd:validate-phase (State B — no VALIDATION.md existed at plan time).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run src/main/telegram/tagApi.test.ts src/main/telegram/tagClient.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds (targeted) |

---

## Per-Task Verification Map

| Task | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01 tagApi | TAG-02 | editChatParticipantRank serializes to exact golden bytes (constructor a00f32b0 + InputPeerChannel + InputPeerUser + TL-string rank) | unit | `npx vitest run src/main/telegram/tagApi.test.ts` | ✅ | ✅ green (7) |
| 09-02 tagClient | TAG-02 | layer patched to 224 before connect, restored to 198 after (even on throw); invokes route through shared governor; write-only | unit | `npx vitest run src/main/telegram/tagClient.test.ts` | ✅ | ✅ green (7) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/main/telegram/tagApi.test.ts` — golden-byte assertion (7 tests)
- [x] `src/main/telegram/tagClient.test.ts` — LAYER restore + governor routing (7 tests)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real layer-224 handshake + main-client non-disruption | TAG-02 | Requires a live Telegram connection; timing/reconnect behavior is not deterministically unit-testable | Observed live during the Phase 0 spike (proven); re-confirm under a real tag run (also tracked in Phase 11/12 UAT) |

*Pure serialization + layer-patch + governor-routing behaviors all have automated coverage.*

---

## Validation Sign-Off

- [x] All tasks have automated verify or are documented manual-only
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-20 (via /gsd:validate-phase)

## Validation Audit 2026-06-20
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

TAG-02 covered by 14 green automated tests (tagApi 7 + tagClient 7). No MISSING gaps; reconstructed VALIDATION.md and marked compliant.
