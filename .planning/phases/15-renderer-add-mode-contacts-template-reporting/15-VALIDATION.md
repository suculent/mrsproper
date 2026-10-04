---
phase: 15
slug: renderer-add-mode-contacts-template-reporting
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-04
updated: 2026-10-04
validated: 2026-10-04
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8, `environment: 'node'` (no DOM. Pure helpers and stores with mocked IPC clients; components are rendered statically via `renderToStaticMarkup` from `react-dom/server`, asserting on raw i18n keys — pattern established by Plan 15-14 in `GroupRow.test.tsx`) |
| **Config file** | `vitest.config.ts` (aliases `@shared` / `@main` / `@renderer`) |
| **Quick run command** | `npx vitest run src/renderer/store/addStore.test.ts` |
| **Full suite command** | `npx tsc --build && find src \( -name '*.js' -o -name '*.jsx' \) -newer package.json -delete 2>/dev/null; find src -name '*.d.ts' -newer package.json ! -name 'env.d.ts' ! -name 'i18next.d.ts' -delete 2>/dev/null; set -a; . ./.env; set +a; npx vitest run` |
| **Estimated runtime** | ~35 seconds (vitest alone ~4 s; 48 files / 618 tests as of 2026-10-04 audit) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --build`, then clean emitted artifacts (`find src \( -name '*.js' -o -name '*.jsx' \) -newer package.json -delete 2>/dev/null; find src -name '*.d.ts' -newer package.json ! -name 'env.d.ts' ! -name 'i18next.d.ts' -delete 2>/dev/null`), then `npx vitest run <touched test files>` — matches every `<verify><automated>` command in this phase's plans (the cleanup step prevents Vitest from running stale compiled output per the project's documented `tsc-noop-pitfall`).
- **After every plan wave:** Run the full suite command, plus `npm run build` (electron-vite) so renderer bundling errors surface
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-03-T1 | 15-03 | 1 | ADD-01 | T-15-09 | `isActionableForMode` predicate: Remove/Tag rule unchanged; Add rule = canAdd AND (not-member OR banned), pending rows excluded | unit | `npx vitest run src/renderer/groups/modeRules.test.ts` | ✅ created this plan | ✅ green |
| 15-03-T1 | 15-03 | 1 | ADD-01 | T-15-09 | mode switch clears `checkedDialogIds` and re-partitions without rescanning; existing Remove pre-check behavior provably unchanged | unit | `npx vitest run src/renderer/store/groupsStore.test.ts` | ✅ created this plan | ✅ green |
| 15-03-T3 | 15-03 | 1 | ADD-01 | — | wizardStage gains ADD_COMPLETE/ADD_STOPPED events (D-04), mirroring TAG_COMPLETE/TAG_STOPPED; all existing transitions unchanged | unit | `npx vitest run src/renderer/wizard/wizardStage.test.ts` | ✅ extended this plan | ✅ green |
| 15-05-T2 | 15-05 | 1 | ADD-05 | T-15-06 | contact add dispatched at most once per target via idempotent `maybeAddToContacts`; never throws on rejection | unit | `npx vitest run src/renderer/store/targetStore.test.ts` | ✅ created this plan | ✅ green |
| 15-03-T2 | 15-03 | 1 | ADD-12 | — | `computeAddGroups` mechanic notes (Invite/Add, ban-lifted-first suffix) | unit | `npx vitest run src/renderer/wizard/addValidation.test.ts` | ✅ created this plan | ✅ green |
| 15-10-T2 | 15-10 | 4 | ADD-12 | T-15-07 | confirm invokes `addActions.startAdd(dialogIds)` only (no identity, no resume) | source assertion | `grep -c "addActions.startAdd(" src/renderer/wizard/ReviewScreen.tsx` (expect 1) | ✅ | ✅ green |
| 15-07-T2 | 15-07 | 3 | ADD-13 | T-15-07 | addStore: startAdd / abortAdd / retryGroup / discardJob / resumeJobFromDisk with mocked client; cachedSnapshot stability; no `severity` field | unit | `npx vitest run src/renderer/store/addStore.test.ts` | ✅ created this plan | ✅ green |
| 15-02-T2 | 15-02 | 1 | ADD-13 | T-15-01, T-15-03 | clipboard write goes through a main-process, auth-gated, length-bounded IPC handler, never raw renderer clipboard | unit | `npx vitest run src/main/ipc/clipboardChannels.test.ts` | ✅ created this plan | ✅ green |
| 15-02-T3 | 15-02 | 1 | ADD-14 | T-15-02, T-15-03 | `ADD_EXPORT_LOG`: no-log result, cancelled dialog, successful copy; path from addLogStore, never from renderer; auth-gated | unit | `npx vitest run src/main/ipc/addChannels.test.ts` | ✅ extended this plan (cases 16-18; case 19 WR-02, case 20 T-15-03 added later) | ✅ green |
| 15-04-T3 | 15-04 | 1 | ADD-15 | T-15-10 | `add` namespace present and key-complete in en and cs (NAMESPACES const updated) | unit | `npx vitest run src/renderer/i18n/i18n.test.ts` | ✅ extended this plan | ✅ green |
| 15-01-T1 | 15-01 | 1 | ADD-16 | T-15-04 | `renderTemplate` + defaults relocated to `src/shared/dmTemplate.ts` with identical output; WR-03 no-re-match regression case | unit | `npx vitest run src/shared/dmTemplate.test.ts` | ✅ created this plan | ✅ green |
| 15-01-T2 | 15-01 | 1 | ADD-16 | T-15-04 | `templateChannels.ts` re-exports the shared module; existing TEMPLATE_GET/SET round-trip test untouched and still green | unit | `npx vitest run src/main/ipc/templateChannels.test.ts` | ✅ unchanged, still passes | ✅ green |
| 15-03-T2 | 15-03 | 1 | ADD-16 | T-15-04 | `validateDmTemplate`: `{links}` required, non-empty, ≤ `DM_TEMPLATE_MAX_LENGTH` (shared constant, not re-hardcoded) | unit | `npx vitest run src/renderer/wizard/addValidation.test.ts` | ✅ created this plan | ✅ green |
| 15-02-T1 | 15-02 | 1 | ADD-14 | T-15-02 | `addLogStore.getLogPath()` returns the userData-joined log path the export handler copies from | unit | `npx vitest run src/main/storage/addLogStore.test.ts` | ✅ created in 15-02 | ✅ green |
| quick-261004-p6t | — | post | ADD-14 | T-15-03 | `ADD_EXPORT_LOG` unauthenticated returns `{ ok: false }` without opening the dialog or copying (case 20) | unit | `npx vitest run src/main/ipc/addChannels.test.ts` | ✅ extended (be42017) | ✅ green |
| 15-14-T1 | 15-14 | gap | ADD-05 | T-15-14-01 | Add-mode actionable row renders undimmed/checked/interactive; non-actionable row shows Add-specific or renderer-derived "already-member" reason; Remove-mode rendering byte-identical | unit (static render) | `npx vitest run src/renderer/groups/GroupRow.test.tsx` | ✅ created in 15-14 | ✅ green |
| 15-14-T2 | 15-14 | gap | ADD-05 | T-15-14-02 | first scan-complete pre-check uses the active mode's partition rule, not hardcoded Remove | unit | `npx vitest run src/renderer/store/groupsStore.test.ts` | ✅ extended in 15-14 | ✅ green |
| 15-09-T1 | 15-09 | 4 | ADD-01 | — | ModeSwitch: one radiogroup, three radios in Remove/Tag/Add order, `aria-checked` follows `mode`, `disabled` adds real disabled attribute + tooltip title on all three | unit (static render) | `npx vitest run src/renderer/groups/ModeSwitch.test.tsx` | ✅ created by validation audit | ✅ green |
| 15-08-T2 | 15-08 | 3 | ADD-13 | T-15-08 | GroupRow Add subline: privacy-blocked row shows link-created + Copy button (+ Premium hint only when flagged); failed row shows Add-specific retry (not scan retry); done row has no buttons | unit (static render) | `npx vitest run src/renderer/groups/GroupRow.test.tsx` | ✅ extended by validation audit | ✅ green |
| 15-11-T1 | 15-11 | 2 | ADD-05 | T-15-06 | TargetCard: contacts checkbox (pre-checked, id `add-to-contacts`) rendered only when `mode='add'` in resolved and confirmed states; failure notice only after a failed add and only in Add mode | unit (static render, real store via mocked targetClient) | `npx vitest run src/renderer/target/TargetCard.test.tsx` | ✅ created by validation audit | ✅ green |
| 15-10-T2 | 15-10 | 4 | ADD-12 | T-15-05 | ReviewScreen D-16: normal target → confirm enabled, no explanation; deleted or bot target → confirm disabled + `confirmDisabledInvalidTarget`; Back stays enabled; guard is Add-mode only | unit (static render, real stores via mocked IPC clients) | `npx vitest run src/renderer/wizard/ReviewScreen.test.tsx` | ✅ created by validation audit | ✅ green |

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
| Mode switch click → checklist re-partition → review screen offers only the mode's action (interaction chain) | ADD-01 | Click handlers and parent wiring are not exercised by static render (rendering and disabled state now automated in `ModeSwitch.test.tsx`) | Launch app, confirm target, toggle Remove/Tag/Add, observe checklist and review screen (Plans 15-09, 15-13) |
| Inverted checklist: pre-checked rows, grey reasons, banned note | ADD-02/ADD-03 presentation | Component rendering | Target with mixed membership; verify partition and notes in both languages (Plans 15-08, 15-09) |
| Contact actually appears in Telegram after confirm; unchecking skips the add | ADD-05 | Live Telegram (checkbox visibility and failure notice now automated in `TargetCard.test.tsx`) | Live account: uncheck/check, confirm, verify contact in Telegram (Plan 15-11) |
| DM editor/preview: edit, save, reset, validation message, placeholder line | ADD-16 / ADD-12 | Component rendering | Edit template, remove `{links}`, verify Save disabled; reset to default (Plan 15-10) |
| Live progress counter, DM status line, Copy actually writes the clipboard, retry re-dispatches | ADD-13 | Live Telegram run (row rendering for link/Copy/Premium/retry now automated in `GroupRow.test.tsx`) | Run against a privacy-restricted target; copy a link; retry a failed row (Plans 15-08, 15-09) |
| Export add log via save dialog; "No add log yet" state | ADD-14 | Native dialog | Export from report and from Settings; cancel; verify file contents (Plans 15-09, 15-12) |
| Resume / Discard prompt for an incomplete add job | ADD-08 UI | Needs app restart mid-run | Stop a run, relaunch, resume; verify continuation keeps the job id (Plans 15-12, 15-13) |
| Czech copy: vykání, 3-form plurals, no truncation | ADD-15 | Visual | Switch language to Czech and walk every new screen (Plan 15-04 content, all UI plans) |
| D-16 against a real deleted/bot Telegram account end-to-end | ADD-12 | Needs a real deleted/bot account to resolve (disabled confirm + explanation rendering now automated in `ReviewScreen.test.tsx`) | Resolve a deleted/bot test account, switch to Add mode, verify the confirm button is disabled and the explanation renders (Plan 15-10) |
| Severity (Kick/Ban) persists correctly across a Remove→Tag→Add→Remove mode round-trip | ADD-01 (regression) | Component rendering | Set Ban, switch through Tag and Add, switch back to Remove, confirm Ban is still selected; relaunch confirms persistence survived (Plan 15-13) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every task across all 13 plans has `<verify><automated>`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (resolved via first-task-of-owning-plan convention, see above)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-04 by `/gsd-validate-phase 15` (full suite 48 files / 618 tests green)

---

## Validation Audit 2026-10-04

| Metric | Count |
|--------|-------|
| Requirements audited | 7 (ADD-01, 05, 12, 13, 14, 15, 16) — all COVERED |
| Gaps found | 4 (PARTIAL: compile-only verify on 15-08-T2, 15-09-T1, 15-10-T2, 15-11-T1) |
| Resolved | 4 (3 new test files + 1 extended; +25 tests, suite 45/593 → 48/618) |
| Escalated | 0 |
| Map rows added | 8 (15-02 getLogPath, T-15-03 quick task, 15-14-T1/T2, 4 gap closures) |

Notes:
- The original "no DOM" rationale for manual-only component checks no longer holds: Plan 15-14 proved `renderToStaticMarkup` works under `environment: 'node'`, and both stores' `getServerSnapshot` returns live state, so seeded store state is rendered. Manual-only rows were narrowed to what static render cannot reach (click handlers, live Telegram, native dialogs, app restart, Radix portals, linguistic quality).
- `npx tsc --build` emits `*.test.jsx` next to `.tsx` tests; the documented cleanup now deletes `*.jsx` too.
- No implementation files were changed by the audit.
