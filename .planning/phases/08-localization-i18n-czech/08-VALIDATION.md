---
phase: 8
slug: localization-i18n-czech
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-13
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.8 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test` (runs `vitest run`) |
| **Full suite command** | `npm test && tsc --build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && tsc --build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | LOC-01 | T-08-01 | Zod rejects invalid locale in LANGUAGE_SET | unit | `npm test -- src/main/ipc/languageChannels.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | LOC-01 | T-08-02 | Zod rejects invalid theme in THEME_SET | unit | `npm test -- src/main/ipc/themeChannels.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | LOC-02 | — | i18n init loads all 6 namespaces; t() returns non-empty strings | unit | `npm test -- src/renderer/i18n/i18n.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | LOC-03 | — | Czech plurals: 1→_one, 2→_few, 5→_other; no key passthrough | unit | `npm test -- src/renderer/i18n/i18n.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | LOC-02 | — | errorCopy assertions rewritten against i18n layer | unit | `npm test -- src/renderer/auth/errorCopy.test.ts` (rewritten) | ✅ (rewrite) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Planner fills Task IDs/Plan/Wave when plans are created.*

---

## Wave 0 Requirements

- [ ] `src/main/ipc/languageChannels.test.ts` — stubs for LOC-01 language IPC
- [ ] `src/main/ipc/themeChannels.test.ts` — stubs for LOC-01 theme IPC
- [ ] `src/renderer/i18n/i18n.test.ts` — stubs for LOC-02 (init/namespaces), LOC-03 (Czech plurals)
- [ ] `src/renderer/auth/errorCopy.test.ts` — rewrite (not create new) to test i18n layer instead of deleted module

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Instant language switch without restart | LOC-01 | Visual whole-app re-render | Launch app, Settings → Language → Česky; verify all visible strings flip without reload |
| No wrong-language/wrong-theme flash at startup | LOC-01 | Timing-sensitive visual behavior | Set Czech + Day, quit, relaunch; observe first paint |
| Full-app Czech usability sweep | LOC-03 | Translation quality is human judgment | Walk wizard end-to-end in Czech; check every screen, error, gate, progress string |
| Theme override survives OS theme change | — | nativeTheme interplay (research open question 2) | Set Day theme, toggle macOS dark mode, verify app stays Day |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
