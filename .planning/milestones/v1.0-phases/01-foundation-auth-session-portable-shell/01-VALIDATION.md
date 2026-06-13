---
phase: 1
slug: foundation-auth-session-portable-shell
status: executing
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v4.1.8 (installed plan 01-02) |
| **Config file** | `vitest.config.ts` (node env, `src/**/*.test.ts`, @shared/@main aliases) |
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

> Wave 0 complete: all test files created. RED state confirmed (6 failing suites). Plans 03/04 turn them GREEN.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| authFlow-happy | 01-02 | 0 | AUTH-01 | T-02-02 | phone→code happy path advances to authorized | unit (mock client) | `npx vitest run src/main/telegram/authFlow.test.ts` | ✅ | ❌ RED |
| authFlow-code-error | 01-02 | 0 | AUTH-01 | T-02-02 | wrong/expired code stays on code step (D-12) | unit | `npx vitest run src/main/telegram/authFlow.test.ts -t "code error"` | ✅ | ❌ RED |
| authFlow-2fa | 01-02 | 0 | AUTH-02 | T-02-02 | SESSION_PASSWORD_NEEDED → needPassword → authorized | unit | `npx vitest run src/main/telegram/authFlow.test.ts -t "2fa"` | ✅ | ❌ RED |
| errors-password | 01-02 | 0 | AUTH-02 | T-02-02 | wrong 2FA password classified, stays on password step | unit | `npx vitest run src/main/telegram/errors.test.ts -t "password"` | ✅ | ❌ RED |
| config-auth03 | 01-02 | 0 | AUTH-03 | — | api_id/api_hash present at build, absent from committed source | unit + grep | `npx vitest run src/main/telegram/config.test.ts` | ✅ | ❌ RED (env not injected in test) |
| secrets-roundtrip | 01-02 | 0 | AUTH-04 | T-02-01 | session encrypt→write→read→decrypt round-trips identically | unit (mock safeStorage) | `npx vitest run src/main/storage/secrets.test.ts` | ✅ | ❌ RED |
| secrets-unavailable | 01-02 | 0 | AUTH-04 | T-02-01 | isEncryptionAvailable()===false → no plaintext written, routes to login | unit | `npx vitest run src/main/storage/secrets.test.ts -t "unavailable"` | ✅ | ❌ RED |
| session-dead | 01-02 | 0 | AUTH-04 | T-02-02 | dead session (AUTH_KEY_UNREGISTERED on connect) → wipe + login | unit | `npx vitest run src/main/telegram/SessionManager.test.ts -t "dead session"` | ✅ | ❌ RED |
| logout-ok | 01-02 | 0 | AUTH-05 | T-02-02 | logout server-revoke success → local wiped | unit | `npx vitest run src/main/telegram/SessionManager.test.ts -t "logout ok"` | ✅ | ❌ RED |
| logout-server-fail | 01-02 | 0 | AUTH-05 | T-02-02 | logout server-revoke FAILS → local STILL wiped + serverRevoked:false (D-17) | unit | `npx vitest run src/main/telegram/SessionManager.test.ts -t "logout server fail"` | ✅ | ❌ RED |
| floodwait-parse | 01-02 | 0 | D-13 | — | FLOOD_WAIT_x parsed via .seconds and message regex | unit | `npx vitest run src/main/telegram/floodWait.test.ts` | ✅ | ❌ RED |
| floodwait-countdown | 01-02 | 0 | D-13 | — | countdown ticks emitted with fake timers, submit re-enabled at 0 | unit (fake timers) | `npx vitest run src/main/telegram/floodWait.test.ts` | ✅ | ❌ RED |
| errors-rpc-map | 01-02 | 0 | AUTH-01..05 | — | each RPCError code → correct AuthErrorCode + UI copy key | unit | `npx vitest run src/main/telegram/errors.test.ts` | ✅ | ❌ RED |
| real-login | N/A | N/A | AUTH-01, AUTH-02, AUTH-03 | — | real Telegram login (phone+code+2FA) with embedded api_id | **manual/integration** | manual checklist | N/A | ⬜ pending |
| session-persist | N/A | N/A | AUTH-04 | — | session survives relaunch (encrypted at rest) | **manual** | manual on device | N/A | ⬜ pending |
| logout-server | N/A | N/A | AUTH-05 | — | revoking logout + local wipe | **manual** | manual against live Telegram | N/A | ⬜ pending |
| portable-macos | N/A | N/A | APP-01 | — | portable build launches on clean macOS | **manual** | manual on clean machine | N/A | ⬜ pending |
| portable-win | N/A | N/A | APP-02 | — | portable build launches on clean Windows | **manual** | manual on clean machine/VM | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest.config.ts` + `vitest` install — installed plan 01-02 (vitest@4.1.8)
- [x] Mock GramJS client fixture — `src/main/telegram/__mocks__/telegramClient.ts`
- [x] Mock safeStorage fixture — `src/main/storage/__mocks__/safeStorage.ts`
- [x] Test stubs for AUTH-01 (authFlow.test.ts): phone→code happy, code error, expired code
- [x] Test stubs for AUTH-02 (authFlow.test.ts + errors.test.ts): 2fa path, password error
- [x] Test stubs for AUTH-03 (config.test.ts): api_id/api_hash guard + grep check
- [x] Test stubs for AUTH-04 (secrets.test.ts + SessionManager.test.ts): round-trip, unavailable, dead session
- [x] Test stubs for AUTH-05 (SessionManager.test.ts): logout ok, logout server fail (D-17)
- [x] Test stubs for D-13 (floodWait.test.ts): parse + countdown ticks + done signal

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Wave 0 complete (plan 01-02). GREEN status pending plan 03/04 implementations.
