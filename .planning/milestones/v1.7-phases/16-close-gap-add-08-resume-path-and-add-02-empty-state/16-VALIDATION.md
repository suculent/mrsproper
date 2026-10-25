---
phase: 16
slug: close-gap-add-08-resume-path-and-add-02-empty-state
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-04
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Scaffolded by plan-phase (`--skip-research`, no RESEARCH.md); Test Infrastructure and Sampling Rate
> carried over from 15-VALIDATION.md (same repo, same suite). Per-task map is filled by the planner/executor.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8, `environment: 'node'` (no DOM. Pure helpers and stores with mocked IPC clients; components are rendered statically via `renderToStaticMarkup` from `react-dom/server`, asserting on raw i18n keys — pattern established by Plan 15-14 in `GroupRow.test.tsx`) |
| **Config file** | `vitest.config.ts` (aliases `@shared` / `@main` / `@renderer`) |
| **Quick run command** | `npx vitest run src/renderer/store/addStore.test.ts src/main/telegram/addExecutor.test.ts` |
| **Full suite command** | `npx tsc --build && find src \( -name '*.js' -o -name '*.jsx' \) -newer package.json -delete 2>/dev/null; find src -name '*.d.ts' -newer package.json ! -name 'env.d.ts' ! -name 'i18next.d.ts' -delete 2>/dev/null; set -a; . ./.env; set +a; npx vitest run` |
| **Estimated runtime** | ~35 seconds (vitest alone ~4 s; 48 files / 618 tests as of 2026-10-04 audit; baseline 616/618 with 2 known `config.test.ts` env failures) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --build`, then clean emitted artifacts (`find src \( -name '*.js' -o -name '*.jsx' \) -newer package.json -delete 2>/dev/null; find src -name '*.d.ts' -newer package.json ! -name 'env.d.ts' ! -name 'i18next.d.ts' -delete 2>/dev/null`), then `npx vitest run <touched test files>` — the cleanup step prevents Vitest from running stale compiled output per the project's documented `tsc-noop-pitfall`.
- **After every plan wave:** Run the full suite command, plus `npm run build` (electron-vite) so renderer bundling errors surface
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | ADD-08 | — | — | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Cross-process resume test (CONTEXT D-05): stopped job → renderer-side resume call with full dialog-id set → `AddExecutor.execute`; asserts same job id, prior outcomes retained, skipped groups reprocessed, follow-up CONTINUATION block written
- [ ] `src/renderer/store/addStore.test.ts:273` — update the "empty remaining → return" lock-in for D-02

*Existing Vitest infrastructure covers all phase requirements; no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Resume from launch prompt after app relaunch continues the same job without re-resolving the target | ADD-08 | Requires a live Telegram session and a real relaunch | Start an Add run, Stop it, quit and relaunch the app, choose Resume on the prompt; confirm the run continues, the report renders, and the add log has a CONTINUATION block |
| Add-mode empty-state copy reads correctly in en/cs | ADD-02 | Wording review | Pick a target already in every invitable group; confirm "Nothing to add" with the cause-aware body line in both languages |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
