---
phase: 12
slug: renderer-action-picker-tag-input-results
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (+ React Testing Library where used by existing renderer tests) |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run src/renderer/wizard/reviewScreen.test.ts src/renderer/store/tagStore.test.ts src/renderer/i18n/i18n.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (targeted), ~60s full |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for touched areas
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-* (constant + i18n) | early | 1 | TAG-01 | — | TAG_MAX_LENGTH shared constant; `tag` namespace registered (en+cs) | unit | `npx vitest run src/renderer/i18n/i18n.test.ts` | ❌ W0 | ⬜ pending |
| 12-* (tagStore) | mid | 1/2 | TAG-06 | — | tagStore mirrors removalStore; onTagState subscription; pendingJob; snapshot stability | unit | `npx vitest run src/renderer/store/tagStore.test.ts` | ❌ W0 | ⬜ pending |
| 12-* (ReviewScreen picker+input) | mid | 2 | TAG-01 | — | 3-way picker; tag input 16-cap + charset reject; action-switch resets input | unit (RTL) | `npx vitest run src/renderer/wizard/reviewScreen.test.ts` | ⚠️ extend | ⬜ pending |
| 12-* (progress + results) | late | 2/3 | TAG-06 | — | per-group progress, FLOOD_WAIT countdown, outcome labels, hard-stopped vs complete | unit | `npx vitest run` (GroupsPane/tag render tests) | ❌ W0 | ⬜ pending |
| 12-* (wiring + resume) | last | 3 | TAG-01, TAG-06 | — | AppShell routes run/report by action; independent tag ResumeJobDialog; Kick/Ban unaffected | unit + tsc | `npx tsc --build && npx vitest run` | ⚠️ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/renderer/store/tagStore.test.ts` — mirror of removalStore tests (subscription, actions, pendingJob)
- [ ] `src/renderer/i18n/i18n.test.ts` — extend NAMESPACES to include `tag` (the registration gate)
- [ ] `src/renderer/wizard/reviewScreen.test.ts` — extend for 3-way picker + tag input validation + action-switch reset
- Framework already installed (vitest + RTL) — no install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real tag max-length/charset accepted by Telegram | TAG-01 | The 16-char cap is provisional; the true limit was never measured live | Live UAT: enter a 16-char tag, run against a real group, confirm acceptance; try >16 and confirm inline rejection |
| Live progress + FLOOD_WAIT countdown render correctly during a real run | TAG-06 | Requires a live multi-group tag run | UAT: start a real tag run, observe per-group progress + countdown + final report |
| Day/Night theme + en/cs for all new tag surfaces | TAG-01/06 | Visual; theme + language toggles | UAT: toggle theme + language on every tag screen |

*Component logic (picker switching, validation, store subscription, outcome-label mapping, i18n key presence) all has automated coverage.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
