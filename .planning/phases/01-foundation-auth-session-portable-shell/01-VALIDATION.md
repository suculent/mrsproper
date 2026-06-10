---
phase: 1
slug: foundation-auth-session-portable-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (per 01-RESEARCH.md Validation Architecture) |
| **Config file** | none — Wave 0 installs (`vitest.config.ts`) |
| **Quick run command** | `npx vitest run --changed` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --changed`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Populated by the planner / executor from RESEARCH.md §Validation Architecture. The research maps these unit-testable surfaces against a mock GramJS client: auth state-machine transitions (phone→code→2FA), session encrypt/restore round-trip, and Telegram error classification. See Manual-Only for real-login and portable-build checks.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | — | AUTH-01..05 | — | auth state machine + session round-trip | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` + `vitest` install — no framework exists yet (greenfield)
- [ ] Mock GramJS client fixture — for auth state machine + session tests
- [ ] Test stubs for AUTH-01..05 (auth transitions, session encrypt/restore, error classification)

*Planner fills exact file list from RESEARCH.md §Validation Architecture.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Telegram login (phone+code+2FA) with embedded api_id | AUTH-01, AUTH-02, AUTH-03 | Requires a real Telegram account + live MTProto servers; cannot mock the server SRP exchange end-to-end | Run the app, log in with a real account incl. 2FA; confirm identity (name/@username/avatar) displays |
| Session survives relaunch (encrypted at rest) | AUTH-04 | Requires real OS keystore (Keychain/DPAPI) + app restart | Log in, quit, relaunch → still logged in; confirm `session.bin` is ciphertext |
| Revoking logout (server-side + local wipe) | AUTH-05 | Requires live server auth revocation | Log out, confirm re-login required; check Telegram "active sessions" no longer lists the app |
| Portable build launches on macOS and Windows | APP-01, APP-02 | Requires real OS environments / clean machines | Build portable artifacts, launch on macOS and Windows without a dev environment |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
