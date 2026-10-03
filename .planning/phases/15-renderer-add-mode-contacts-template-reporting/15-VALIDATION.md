---
phase: 15
slug: renderer-add-mode-contacts-template-reporting
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-04
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8, `environment: 'node'` (no DOM — component rendering cannot be unit-tested; pure helpers and stores with mocked IPC clients only) |
| **Config file** | `vitest.config.ts` (aliases `@shared` / `@main` / `@renderer`) |
| **Quick run command** | `npx vitest run src/renderer/store/addStore.test.ts` |
| **Full suite command** | `npx tsc --build && find src -name '*.js' -newer package.json -delete 2>/dev/null; find src -name '*.d.ts' -newer package.json ! -name 'env.d.ts' ! -name 'i18next.d.ts' -delete 2>/dev/null; set -a; . ./.env; set +a; npx vitest run` |
| **Estimated runtime** | ~35 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --build` then `npx vitest run <touched test files>`
- **After every plan wave:** Run the full suite command, plus `npm run build` (electron-vite) so renderer bundling errors surface
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | 0 | ADD-01 | — | `isActionableForMode` predicate: Remove rule unchanged; Add rule = canAdd AND (not-member OR banned) | unit | `npx vitest run src/renderer/groups/modeRules.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-01 | — | mode switch clears `checkedDialogIds` and re-partitions without rescanning | unit | `npx vitest run src/renderer/store/groupsStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-05 | — | contact add dispatched at most once per target, at confirmation or run confirmation; never blocks | unit | `npx vitest run src/renderer/store/targetStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-12 | T-15-01 | `computeAddGroups` mechanic notes incl. ban-lifted-first; deleted/bot target blocks confirm | unit | `npx vitest run src/renderer/wizard/reviewScreen.test.ts` | ✅ extend | ⬜ pending |
| TBD | — | — | ADD-12 | T-15-01 | confirm invokes `startAdd(dialogIds)` only (no identity, no resume) | source assertion | `grep -c "startAdd(" src/renderer/store/addStore.ts` and review | ✅ | ⬜ pending |
| TBD | — | — | ADD-13 | — | addStore: startAdd / abortAdd / retryGroup / discardJob / resume with mocked client; pendingJob cleared on dispatch | unit | `npx vitest run src/renderer/store/addStore.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-13 | T-15-02 | clipboard write goes through a main-process IPC, never raw renderer clipboard | unit | `npx vitest run src/main/ipc/clipboardChannels.test.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | ADD-14 | T-15-03 | `ADD_EXPORT_LOG`: no-log result, cancelled dialog, successful copy; path from store, never from renderer | unit | `npx vitest run src/main/ipc/addChannels.test.ts` | ✅ extend | ⬜ pending |
| TBD | — | — | ADD-15 | — | `add` namespace present and key-complete in en and cs (NAMESPACES const updated) | unit | `npx vitest run src/renderer/i18n/i18n.test.ts` | ✅ extend | ⬜ pending |
| TBD | — | — | ADD-16 | — | `renderTemplate` + defaults relocated to `src/shared/dmTemplate.ts` with identical output; preview placeholder rendering | unit | `npx vitest run src/shared/dmTemplate.test.ts src/main/ipc/templateChannels.test.ts` | ❌ W0 / ✅ | ⬜ pending |
| TBD | — | — | ADD-16 | T-15-04 | `validateDmTemplate`: `{links}` required, non-empty, ≤ 4000 chars | unit | `npx vitest run src/renderer/wizard/addValidation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs, plan, and wave columns are filled by the planner once PLAN.md files exist.*

---

## Wave 0 Requirements

- [ ] `src/renderer/groups/modeRules.test.ts` — pure predicate tests (new)
- [ ] `src/renderer/store/groupsStore.test.ts` — selection reset on mode switch (new)
- [ ] `src/renderer/store/targetStore.test.ts` — contact-add dispatch timing (new)
- [ ] `src/renderer/store/addStore.test.ts` — mirrors `tagStore.test.ts` mocked-client idiom (new)
- [ ] `src/shared/dmTemplate.test.ts` — shared render helper (new)
- [ ] `src/renderer/wizard/addValidation.test.ts` — template validator (new)
- [ ] `src/main/ipc/clipboardChannels.test.ts` — clipboard IPC (new)
- [ ] Extend: `reviewScreen.test.ts`, `addChannels.test.ts`, `i18n.test.ts`, `templateChannels.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mode switch visible in browse and checklist mode, disabled during runs; review screen offers only the mode's action | ADD-01 | Component rendering, no DOM in tests | Launch app, confirm target, toggle Remove/Tag/Add, observe checklist and review screen |
| Inverted checklist: pre-checked rows, grey reasons, banned note | ADD-02/ADD-03 presentation | Component rendering | Target with mixed membership; verify partition and notes in both languages |
| Contacts checkbox shown only in Add mode; failure notice | ADD-05 | Component + live Telegram | Live account: uncheck/check, confirm, verify contact in Telegram |
| DM editor/preview: edit, save, reset, validation message, placeholder line | ADD-16 / ADD-12 | Component rendering | Edit template, remove `{links}`, verify Save disabled; reset to default |
| Live progress, report rows with link + Copy + Premium hint, DM status line, retry | ADD-13 | Live Telegram run | Run against a privacy-restricted target; copy a link; retry a failed row |
| Export add log via save dialog; "No add log yet" state | ADD-14 | Native dialog | Export from report and from Settings; cancel; verify file contents |
| Resume / Discard prompt for an incomplete add job | ADD-08 UI | Needs app restart mid-run | Stop a run, relaunch, resume; verify continuation keeps the job id |
| Czech copy: vykání, 3-form plurals, no truncation | ADD-15 | Visual | Switch language to Czech and walk every new screen |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
