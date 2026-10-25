---
phase: 17
slug: close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-24
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.8 (`environment: 'node'`; renderer tests via `renderToStaticMarkup`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <path/to/file.test.ts>` |
| **Full suite command** | `npx vitest run && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json` |
| **Estimated runtime** | ~60 seconds |

Never use bare `npx tsc --build` (it emits `.js` and `.d.ts` into `src/`, and Vitest then runs stale code).

---

## Sampling Rate

- **After every task commit:** run the targeted `npx vitest run <file>`
- **After every plan wave:** run the full suite command
- **Before `/gsd:verify-work`:** the full suite must be green (baseline 52 files / 667 tests; more expected), and `git status` must show no stray `.js`/`.d.ts` in `src/`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

The planner fills in task IDs. The decision-level map is in `17-RESEARCH.md` § Validation Architecture.

| Decision | Requirement | Test Type | Automated Command | File Exists | Status |
|----------|-------------|-----------|-------------------|-------------|--------|
| D-01/D-03/D-04 job view (17-04-T1, 17-05-T1) | ADD-08 | unit + static render | `npx vitest run src/renderer/groups/addPaneState.test.ts src/renderer/groups/GroupsPane.job.test.tsx` | ✅ (GroupsPane test) | ✅ green |
| D-02 mode lock (17-04-T1) | ADD-08 | static render | `npx vitest run src/renderer/groups/ModeSwitch.test.tsx` | ✅ | ✅ green |
| D-05 lookup lock (17-02-T1) | ADD-12 | unit (ipc handlers) | `npx vitest run src/main/ipc/targetChannels.test.ts src/main/ipc/searchChannels.test.ts` | ✅ | ✅ green |
| D-06/D-08 retry identity (17-02-T2) | ADD-12 | unit | `npx vitest run src/main/telegram/addExecutor.test.ts` | ✅ | ✅ green |
| D-07 mismatch reject (narrow) (17-03-T1, 17-08-T1) | ADD-12 | unit + IPC integration | `npx vitest run src/main/ipc/addChannels.test.ts src/main/telegram/addExecutor.test.ts` | ✅ | ✅ green |
| D-10 F3 persisted banned (17-01-T1) | ADD-07/08 | unit + store round trip | `npx vitest run src/main/storage/addAuditStore.test.ts src/main/telegram/addExecutor.test.ts` | ✅ | ✅ green |
| D-11 F4 stopped Resume (17-06-T1) | ADD-08 | unit (store) | `npx vitest run src/renderer/store/addStore.test.ts` | ✅ | ✅ green |
| D-12 F5 retry log + DM (17-06-T2) | ADD-11/14 | unit | `npx vitest run src/main/telegram/addExecutor.test.ts` | ✅ | ✅ green |
| D-13 F6 detected language (17-07-T1) | ADD-16 | unit | `npx vitest run src/main/ipc/languageChannels.test.ts` | ✅ | ✅ green |
| D-14 relaunch IPC test (17-08-T1) | ADD-08/12 | integration | `npx vitest run src/main/telegram/addResume.ipc.integration.test.ts` | ✅ | ✅ green |
| D-14 no-groups empty (17-08-T2) | ADD-02 | unit | `npx vitest run src/renderer/groups/addPaneState.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/main/telegram/addResume.ipc.integration.test.ts`: relaunch through real `registerAddChannels` + `registerTargetChannels` + `AddExecutor`. Covers F1 (Stop works) and F2 (mismatch rejected, lookup blocked).
- [x] `src/renderer/groups/GroupsPane.job.test.tsx` (or a pure `getPaneView` test plus an extracted Add band component test)
- [ ] Job card static-render test (`JobTargetCard`)
- [ ] Real-store Zod round-trip case in `addAuditStore.test.ts` for the new persisted fields

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Relaunch resume shows band, job card and locked mode switch; Stop works | ADD-08 | Needs a real Electron relaunch and a Telegram account | Start an add run, quit the app mid-run, relaunch, click Resume, confirm the band, job card and Stop all work |
| Retry DM delivered to target | ADD-11 | Live Telegram privacy behavior | Retry a privacy-blocked row and check the target receives the one-link DM |
| First launch on a Czech OS: DM matches the preview | ADD-16 | OS locale | Clear the saved language, launch with OS language cs, and compare the preview with the sent DM |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
