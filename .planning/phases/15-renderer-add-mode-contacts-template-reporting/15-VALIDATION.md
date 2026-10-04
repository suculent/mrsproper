---
phase: 15
slug: renderer-add-mode-contacts-template-reporting
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-04
updated: 2026-10-04
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
| 15-03-T1 | 15-03 | 1 | ADD-01 | T-15-09 | `isActionableForMode` predicate: Remove/Tag rule unchanged; Add rule = canAdd AND (not-member OR banned), pending rows excluded | unit | `npx vitest run src/renderer/groups/modeRules.test.ts` | ✅ created this plan | ⬜ pending |
| 15-03-T1 | 15-03 | 1 | ADD-01 | T-15-09 | mode switch clears `checkedDialogIds` and re-partitions without rescanning; existing Remove pre-check behavior provably unchanged | unit | `npx vitest run src/renderer/store/groupsStore.test.ts` | ✅ created this plan | ⬜ pending |
| 15-03-T3 | 15-03 | 1 | ADD-01 | — | wizardStage gains ADD_COMPLETE/ADD_STOPPED events (D-04), mirroring TAG_COMPLETE/TAG_STOPPED; all existing transitions unchanged | unit | `npx vitest run src/renderer/wizard/wizardStage.test.ts` | ✅ extended this plan | ⬜ pending |
| 15-05-T2 | 15-05 | 1 | ADD-05 | T-15-06 | contact add dispatched at most once per target via idempotent `maybeAddToContacts`; never throws on rejection | unit | `npx vitest run src/renderer/store/targetStore.test.ts` | ✅ created this plan | ⬜ pending |
| 15-03-T2 | 15-03 | 1 | ADD-12 | — | `computeAddGroups` mechanic notes (Invite/Add, ban-lifted-first suffix) | unit | `npx vitest run src/renderer/wizard/addValidation.test.ts` | ✅ created this plan | ⬜ pending |
| 15-10-T2 | 15-10 | 4 | ADD-12 | T-15-07 | confirm invokes `addActions.startAdd(dialogIds)` only (no identity, no resume) | source assertion | `grep -c "addActions.startAdd(" src/renderer/wizard/ReviewScreen.tsx` (expect 1) | ✅ | ⬜ pending |
| 15-07-T2 | 15-07 | 3 | ADD-13 | T-15-07 | addStore: startAdd / abortAdd / retryGroup / discardJob / resumeJobFromDisk with mocked client; cachedSnapshot stability; no `severity` field | unit | `npx vitest run src/renderer/store/addStore.test.ts` | ✅ created this plan | ⬜ pending |
| 15-02-T2 | 15-02 | 1 | ADD-13 | T-15-01, T-15-03 | clipboard write goes through a main-process, auth-gated, length-bounded IPC handler, never raw renderer clipboard | unit | `npx vitest run src/main/ipc/clipboardChannels.test.ts` | ✅ created this plan | ⬜ pending |
| 15-02-T3 | 15-02 | 1 | ADD-14 | T-15-02, T-15-03 | `ADD_EXPORT_LOG`: no-log result, cancelled dialog, successful copy; path from addLogStore, never from renderer; auth-gated | unit | `npx vitest run src/main/ipc/addChannels.test.ts` | ✅ extended this plan (18 cases) | ⬜ pending |
| 15-04-T3 | 15-04 | 1 | ADD-15 | T-15-10 | `add` namespace present and key-complete in en and cs (NAMESPACES const updated) | unit | `npx vitest run src/renderer/i18n/i18n.test.ts` | ✅ extended this plan | ⬜ pending |
| 15-01-T1 | 15-01 | 1 | ADD-16 | T-15-04 | `renderTemplate` + defaults relocated to `src/shared/dmTemplate.ts` with identical output; WR-03 no-re-match regression case | unit | `npx vitest run src/shared/dmTemplate.test.ts` | ✅ created this plan | ⬜ pending |
| 15-01-T2 | 15-01 | 1 | ADD-16 | T-15-04 | `templateChannels.ts` re-exports the shared module; existing TEMPLATE_GET/SET round-trip test untouched and still green | unit | `npx vitest run src/main/ipc/templateChannels.test.ts` | ✅ unchanged, still passes | ⬜ pending |
| 15-03-T2 | 15-03 | 1 | ADD-16 | T-15-04 | `validateDmTemplate`: `{links}` required, non-empty, ≤ `DM_TEMPLATE_MAX_LENGTH` (shared constant, not re-hardcoded) | unit | `npx vitest run src/renderer/wizard/addValidation.test.ts` | ✅ created this plan | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No standalone Wave 0 plan was created. Every new test file RESEARCH.md/the original validation draft flagged as "Wave 0 — must exist before implementation" is instead created in the FIRST task of the plan that owns its production code, using the `tdd="true"` + `<behavior>` task convention (RED-adjacent: behavior is specified exhaustively in the plan before the executor writes implementation). This satisfies the Nyquist Rule's "Wave 0 must create {test_file} first" clause without a separate wave, since no downstream plan consumes that production code before its own plan's task completes (wave dependency ordering already enforces this).

Resolved locations for every file VALIDATION.md's draft listed as missing:

- [x] `src/renderer/groups/modeRules.test.ts` → created in Plan 15-03, Task 1 (Wave 1)
- [x] `src/renderer/store/groupsStore.test.ts` → created in Plan 15-03, Task 1 (Wave 1)
- [x] `src/renderer/store/targetStore.test.ts` → created in Plan 15-05, Task 2 (Wave 1)
- [x] `src/renderer/store/addStore.test.ts` → created in Plan 15-07, Task 2 (Wave 3 — depends on Plan 15-06's preload bridge existing first)
- [x] `src/shared/dmTemplate.test.ts` → created in Plan 15-01, Task 1 (Wave 1)
- [x] `src/renderer/wizard/addValidation.test.ts` → created in Plan 15-03, Task 2 (Wave 1)
- [x] `src/main/ipc/clipboardChannels.test.ts` → created in Plan 15-02, Task 2 (Wave 1)
- [x] `src/renderer/wizard/reviewScreen.test.ts` → NOT extended; `computeAddGroups`'s tests live in `addValidation.test.ts` instead (it mirrors `tagValidation.ts`/`tagValidation.test.ts`'s precedent — `computeTagGroups` is tested in `tagValidation.test.ts`, not `reviewScreen.test.ts`, since it lives in a separate module). `reviewScreen.test.ts`'s existing `computePlannedActions`/`computeActionableTagCount` tests are left untouched and must still pass after Plan 15-10.
- [x] `src/main/ipc/addChannels.test.ts` → extended in Plan 15-02, Task 3 (Wave 1), 3 new cases (16-18)
- [x] `src/renderer/i18n/i18n.test.ts` → extended in Plan 15-04, Task 3 (Wave 1)
- [x] `src/main/ipc/templateChannels.test.ts` → unchanged (re-export preserves its import path; Plan 15-01, Task 2)
- Framework install: none — Vitest is already installed and configured project-wide.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mode switch visible in browse and checklist mode, disabled during runs; review screen offers only the mode's action | ADD-01 | Component rendering, no DOM in tests | Launch app, confirm target, toggle Remove/Tag/Add, observe checklist and review screen (Plans 15-09, 15-13) |
| Inverted checklist: pre-checked rows, grey reasons, banned note | ADD-02/ADD-03 presentation | Component rendering | Target with mixed membership; verify partition and notes in both languages (Plans 15-08, 15-09) |
| Contacts checkbox shown only in Add mode; failure notice | ADD-05 | Component + live Telegram | Live account: uncheck/check, confirm, verify contact in Telegram (Plan 15-11) |
| DM editor/preview: edit, save, reset, validation message, placeholder line | ADD-16 / ADD-12 | Component rendering | Edit template, remove `{links}`, verify Save disabled; reset to default (Plan 15-10) |
| Live progress, report rows with link + Copy + Premium hint, DM status line, retry | ADD-13 | Live Telegram run | Run against a privacy-restricted target; copy a link; retry a failed row (Plans 15-08, 15-09) |
| Export add log via save dialog; "No add log yet" state | ADD-14 | Native dialog | Export from report and from Settings; cancel; verify file contents (Plans 15-09, 15-12) |
| Resume / Discard prompt for an incomplete add job | ADD-08 UI | Needs app restart mid-run | Stop a run, relaunch, resume; verify continuation keeps the job id (Plans 15-12, 15-13) |
| Czech copy: vykání, 3-form plurals, no truncation | ADD-15 | Visual | Switch language to Czech and walk every new screen (Plan 15-04 content, all UI plans) |
| D-16: deleted/bot target disables the Add confirm button with an inline explanation | ADD-12 | Component rendering | Resolve a deleted/bot test account, switch to Add mode, verify the confirm button is disabled and the explanation renders (Plan 15-10) |
| Severity (Kick/Ban) persists correctly across a Remove→Tag→Add→Remove mode round-trip | ADD-01 (regression) | Component rendering | Set Ban, switch through Tag and Add, switch back to Remove, confirm Ban is still selected; relaunch confirms persistence survived (Plan 15-13) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every task across all 13 plans has `<verify><automated>`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (resolved via first-task-of-owning-plan convention, see above)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
