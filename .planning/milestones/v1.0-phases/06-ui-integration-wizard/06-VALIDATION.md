---
phase: 06
slug: ui-integration-wizard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npx vitest run --reporter=verbose 2>&1 \| tail -20` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose 2>&1 | tail -20`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green AND `npx tsc --build --force` passes
- **Max feedback latency:** 60 seconds

> **Critical:** Use `tsc --build --force` (NOT `tsc --noEmit`) — the root tsconfig has `files: []` and uses project references; `tsc --noEmit` is a known no-op (Phase 5 finding).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD at planning | — | — | SAF-01 | — | Review screen shows target numeric ID + exact affected groups before any removal | unit (computePlannedActions, pure fn) | `npx vitest run src/renderer/wizard/reviewScreen.test.ts -x` | ❌ W0 | ⬜ pending |
| Plan 04 Task 3 | 04 | 3 | SAF-02 | T-06-04-03 | Stage transitions enforced by getNextStage pure function; execution cannot bypass Review stage | unit (getNextStage, pure fn) | `npx vitest run src/renderer/wizard/wizardStage.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD at planning | — | — | SAF-03 | — | Dry-run reports exact per-group mechanic predictions with zero Telegram calls | unit (computePlannedActions) | `npx vitest run src/renderer/wizard/reviewScreen.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD at planning | — | — | FLOOD_WAIT subline | — | floodWaitRemaining propagates executor → store → UI | unit (RemovalExecutor + mock governor) | `npx vitest run src/main/telegram/removalExecutor.test.ts -x` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note:** vitest environment is `node`, not jsdom — React component rendering tests are not supported. Test the dry-run computation and stage machine as pure functions, not React rendering.

---

## Wave 0 Requirements

- [ ] `src/renderer/wizard/reviewScreen.test.ts` — stubs for SAF-01 / SAF-03 dry-run computation (pure function, no React); filled in Plan 03
- [ ] `src/renderer/wizard/wizardStage.test.ts` — stubs planted in Plan 01; filled with real `getNextStage()` assertions in Plan 04 Task 3 (pure function extracted into `wizardStage.ts`)

> **SAF-02 coverage approach:** Stage transition rules are extracted into `src/renderer/wizard/wizardStage.ts` as a pure `getNextStage(stage, event): WizardStage` function in Plan 04 Task 3. This makes all 9 transition assertions fully automatable in vitest (no jsdom needed). AppShell calls `setStage()` explicitly at action points and may optionally call `getNextStage` as a transition guard — stage is never derived.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Review screen visual layout (identity block, avatar, group list readability) | SAF-01 | React rendering not testable in node vitest env | Launch app, resolve a target, reach Review screen, confirm numeric ID + avatar + full group list visible |
| Live per-group progress + final report during execution | SAF-03 | Requires live wizard run end-to-end | Run a dry-run then a live run against a test group; observe per-row status, progress indicator, summary band |
| Resume flow: ResumeJobDialog advances wizard to Run stage | SAF-02 (resume path) | Requires a simulated pending job on disk | Launch app with a pending job file present; confirm dialog appears; click Resume; confirm Run stage loads |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
