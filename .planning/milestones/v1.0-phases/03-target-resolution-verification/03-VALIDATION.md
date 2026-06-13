---
phase: 3
slug: target-resolution-verification
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-11
updated: 2026-06-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.8 |
| **Config file** | vitest.config.ts (root) |
| **Quick run command** | `npm test -- --reporter=verbose src/main/telegram/targetResolver.test.ts src/main/ipc/targetChannels.test.ts src/main/telegram/operationErrors.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/main/telegram/targetResolver.test.ts src/main/ipc/targetChannels.test.ts src/main/telegram/operationErrors.test.ts`
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green; `npx tsc --noEmit` must exit 0
- **Max feedback latency:** ~15 seconds (quick run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | TGT-03 | T-03-01 | ResolvedTargetDTO has no accessHash field | unit (tsc) | `npx tsc --noEmit` | ✅ W0 creates | ⬜ pending |
| 3-01-02 | 01 | 1 | TGT-04 | T-03-02 | USERNAME_NOT_OCCUPIED → TARGET_USERNAME_NOT_FOUND/fail | unit | `npm test -- src/main/telegram/operationErrors.test.ts` | ✅ extend existing | ⬜ pending |
| 3-02-01 | 02 | 1 | VRF-01..03 | T-03-03 | targetResolver.test.ts stubs assert no accessHash in state | unit (RED) | `npm test -- src/main/telegram/targetResolver.test.ts 2>&1 \| grep "Cannot find module"` | ❌ W0 creates | ⬜ pending |
| 3-02-02 | 02 | 1 | VRF-03 | T-03-04 | Zod validation test asserts malformed payload rejected | unit (RED) | `npm test -- src/main/ipc/targetChannels.test.ts 2>&1 \| grep "Cannot find module"` | ❌ W0 creates | ⬜ pending |
| 3-03-01 | 03 | 2 | TGT-01,TGT-03,VRF-01,VRF-02 | T-03-05,T-03-07,T-03-08 | accessHash private; direct invoke; bigint.toString() | unit (GREEN) | `npm test -- src/main/telegram/targetResolver.test.ts` | ❌ Plan 03 creates | ⬜ pending |
| 3-03-02 | 03 | 2 | TGT-02,TGT-04,VRF-03 | T-03-06 | Zod gate + confirm gate advancing state | unit (GREEN) | `npm test -- src/main/ipc/targetChannels.test.ts` | ❌ Plan 03 creates | ⬜ pending |
| 3-04-01 | 04 | 3 | TGT-01..04 | T-03-09 | preload exposes resolveTarget with input forwarding | unit (tsc) | `npx tsc --noEmit` | ✅ extend existing | ⬜ pending |
| 3-04-02 | 04 | 3 | VRF-03 | T-03-10 | onGovernorEvent subscription in targetStore | unit (tsc) | `npx tsc --noEmit` | ✅ extend existing | ⬜ pending |
| 3-05-01 | 05 | 4 | TGT-01,TGT-02,TGT-04 | T-03-14 | Link normalization; client-side validation before dispatch | human-verify | See Plan 05 checkpoint task | ❌ Plan 05 creates | ⬜ pending |
| 3-05-02 | 05 | 4 | VRF-01,VRF-02,VRF-03 | T-03-12,T-03-15 | Avatar display, no-photo notice, confirm gate UI | human-verify | See Plan 05 checkpoint task | ❌ Plan 05 creates | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The following must be created in Wave 1 (Plans 01 and 02) before Wave 2 implementations begin:

- [x] `src/shared/targetTypes.ts` — TargetState, ResolvedTargetDTO, TargetErrorCode (Plan 01, Task 1)
- [x] `src/shared/channels.ts` — TARGET_* channel constants (Plan 01, Task 1, extend)
- [x] `src/shared/opTypes.ts` — OperationErrorCode TARGET_* extensions (Plan 01, Task 1, extend)
- [x] `src/main/telegram/operationErrors.ts` — USERNAME_NOT_OCCUPIED + PHONE_NOT_OCCUPIED branches (Plan 01, Task 2, extend)
- [x] `src/main/telegram/__mocks__/telegramClient.ts` — ResolveUsername/ResolvePhone/GetFullUser invoke dispatch (Plan 01, Task 2, extend)
- [ ] `src/renderer/components/ui/badge.tsx` — Badge component (Plan 02, Task 1 — `npx shadcn add badge`)
- [ ] `src/main/telegram/targetResolver.test.ts` — RED tests for TGT-01..04, VRF-01..02 (Plan 02, Task 1)
- [ ] `src/main/ipc/targetChannels.test.ts` — RED tests for VRF-03 confirm gate (Plan 02, Task 2)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Phone mode disclosure hint visible | TGT-02 / D-10 | Visual UI element — no automated DOM assertion in Electron renderer | Type a phone number in the input; verify the disclosure hint appears below the field |
| Flood countdown during lookup | TGT-04 / D-17 | Requires live FLOOD_WAIT from Telegram; not reproducible in unit tests | Trigger a FLOOD_WAIT (many rapid lookups); verify Find button shows "Try again in mm:ss" countdown |
| 64px avatar + colored-initials fallback | VRF-01 / D-12 | Visual rendering — Vitest cannot render Electron UI | Resolve a user with no avatar; verify colored-initials circle + no-photo Alert appear |
| Confirmed target locked state | VRF-03 / D-11 | Visual state transition (card border ring, CheckCircle2) | Click "Yes, this is the person"; verify green confirm label appears, buttons hide, input collapses |
| Change target clears downstream state | D-14 | Downstream state (Phase 4 group list) not yet implemented | Click "Change target"; verify input is re-enabled and card disappears |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or human-verify checkpoint
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (tsc counts)
- [x] Wave 0 covers all MISSING references (Plans 01+02)
- [x] No watch-mode flags in any automated command
- [x] Feedback latency < 15s for quick run
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned (pending execution)
