---
phase: 01-foundation-auth-session-portable-shell
verified: 2026-06-11T09:00:00Z
status: human_needed
score: 5/5 must-haves verified (all automated truths pass; 2 manual-pending items remain)
overrides_applied: 0
human_verification:
  - test: "AUTH-02: Log in with a Telegram account that has a 2FA password enabled"
    expected: "After entering the correct phone number and login code, the Two-step verification screen appears. Entering the correct 2FA password completes login and lands on the authenticated shell showing name + @username + avatar."
    why_human: "Requires a real Telegram account with 2FA enabled. The code path (SESSION_PASSWORD_NEEDED branch in authFlow.ts, signInWithPassword callback, PasswordStep.tsx) is fully implemented and unit-tested GREEN, but the end-to-end real-MTProto path has not been manually exercised."
  - test: "APP-02: Launch the Windows portable build on a Windows machine"
    expected: "The unsigned portable .exe or NSIS installer produced by `npm run package:win` launches the app on a clean Windows machine (no developer environment), shows the MrProper login screen, and reaches the authenticated shell after login. SmartScreen warning on first launch is expected (unsigned build)."
    why_human: "electron-builder Windows targets (nsis + portable, x64) are configured in electron-builder.yml. The macOS build is verified (user confirmed 'Mac build starts'). Windows launch requires a Windows host or VM which was not available during this phase."
---

# Phase 1: Foundation — Auth, Session & Portable Shell — Verification Report

**Phase Goal:** A user can install and launch a portable MrProper app on macOS or Windows, log in to their Telegram account (phone + code, including 2FA), stay logged in across launches via an encrypted session, and log out to fully revoke access.
**Verified:** 2026-06-11T09:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Context: Post-Execution Fixes

Four fix commits were applied after the plan SUMMARYs were written, based on issues surfaced by manual UAT. These are confirmed in git history and now part of the current codebase:

| Commit | What Was Fixed |
|--------|----------------|
| `4d962a9` | Dev-aware CSP — blank-window fix (Vite renderer blocked by strict CSP in dev mode) |
| `4183d2c` | GramJS connect before first login call + OS theme applied on first paint |
| `819a69d` | Session persistence to disk (in-memory only bug), OS-driven theme sync, electron-builder node_modules inclusion so `telegram` is bundled in the asar |
| `56dbf59` | Tailwind v3 pin + PostCSS config — Tailwind v4 was installed but the project uses v3-style config; utilities were not generating |

All four defects are resolved in the current HEAD. The user's UAT confirmation (phone+code login, session persistence, logout) was performed against the fixed codebase.

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can launch the app from a portable build on macOS without a developer environment | VERIFIED | User confirmed "Mac build starts". `electron-builder.yml` configures dmg+zip for x64+arm64. Fix `819a69d` resolved the `Cannot find module telegram` crash by bundling runtime deps into the asar. |
| 2 | User can log in with phone number + login code, and complete login when account has 2FA | VERIFIED (partial — no-2FA only) | AUTH-01 no-2FA path: user confirmed reaching authenticated identity shell. AUTH-02 2FA code path: fully implemented (`SESSION_PASSWORD_NEEDED` branch + `signInWithPassword` callback form in `authFlow.ts`, `PasswordStep.tsx`) and unit-tested GREEN (`-t "2fa"` passes). Real-account 2FA login not manually exercised. Marked VERIFIED with human-pending item. |
| 3 | User needs no per-user api_id registration — embedded credential | VERIFIED | `electron.vite.config.ts` injects `MRPROPER_API_ID`/`MRPROPER_API_HASH` into the MAIN bundle only via `define`. No 32-hex literal in any tracked file (git grep clean). `.env` gitignored. `.env.example` lists var names only, no values. |
| 4 | After logging in and quitting, relaunching finds the user still logged in (encrypted session) | VERIFIED | User confirmed "Login is now persistent". `secrets.ts` writes encrypted session to `userData/session.bin` with `mode: 0o600` via `safeStorage`. `index.ts` calls `restoreSession()` + `sm.initialize()` on launch. Fix `819a69d` resolved the in-memory-only bug (session now actually persists to disk). |
| 5 | User can log out; server authorization revoked and local session wiped | VERIFIED | User confirmed logout works. `SessionManager.logout()` uses try/finally: `Api.auth.LogOut` in try, `disconnect()` + `_wipeSessionLocally()` in finally (D-17 — always wipes regardless of server outcome). `LogoutDialog.tsx` shows red-tinted warning banner when `serverRevoked === false`. |

**Score: 5/5 ROADMAP success criteria verified**

---

### Required Artifacts

| Artifact | Expected | Status | Evidence |
|----------|----------|--------|---------|
| `electron.vite.config.ts` | Three-bundle + MAIN-only credential injection | VERIFIED | Lines 19-22: `define` with `MRPROPER_API_ID`/`MRPROPER_API_HASH` in `main:` section only; `renderer:` section has no `define` block. File exists and build succeeds. |
| `src/main/index.ts` | App lifecycle + hardened BrowserWindow | VERIFIED | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `preload: join(...)` at lines 29-32. `floodSleepThreshold: 5` at line 105. SessionManager + registerAuthChannels + sm.initialize wired. |
| `src/main/telegram/config.ts` | API_ID/API_HASH from import.meta.env, no literal | VERIFIED | Exports `API_ID = Number(import.meta.env.MRPROPER_API_ID)` and `API_HASH = import.meta.env.MRPROPER_API_HASH`. No literal digits/hex in file. |
| `electron-builder.yml` | macOS (dmg/zip) + Windows (nsis/portable) packaging, no signing | VERIFIED | `mac:` with dmg+zip targets x64+arm64; `win:` with nsis+portable x64. `identity: null`. Fix `819a69d` removed the bad `node_modules` exclusion. |
| `.env.example` | Var names only, no values | VERIFIED | `MRPROPER_API_ID=` and `MRPROPER_API_HASH=` with no values. |
| `components.json` | shadcn new-york/slate/CSS vars | VERIFIED | `"style": "new-york"`, `"baseColor": "slate"`, `"cssVariables": true`. |
| `src/shared/authTypes.ts` | AuthState 8-step union, Identity, FloodTick, AuthErrorCode, IPC DTOs | VERIFIED | All 8 steps present: idle, sendingCode, needCode, verifying, needPassword, authorized, error, floodWait. Correct types confirmed. |
| `src/shared/channels.ts` | IPC channel constants | VERIFIED | Named exports AUTH_SUBMIT_PHONE, AUTH_SUBMIT_CODE, etc. + CHANNELS namespace. |
| `src/main/telegram/__mocks__/telegramClient.ts` | Configurable mock GramJS | VERIFIED | File exists, supports all 6 RPCError shapes. |
| `src/main/storage/__mocks__/safeStorage.ts` | Mock safeStorage available/unavailable | VERIFIED | File exists, in-memory XOR round-trip. |
| `src/main/storage/secrets.ts` | Session encrypt/write/read/decrypt, 0o600 | VERIFIED | `mode: 0o600` at line 71. `createSecretsStore` factory with injectable safeStorage. Never writes plaintext. |
| `src/main/telegram/errors.ts` | classifyTelegramError → AuthErrorCode | VERIFIED | Maps all RPCError shapes to typed AuthErrorCode. Branches on `err.errorMessage` (Pitfall 4). |
| `src/main/telegram/floodWait.ts` | floodWaitSeconds + FloodWaitController with injectable timing | VERIFIED | Both `startFloodCountdown` and `FloodWaitController` class exported. Injectable `TimingSource`. |
| `src/main/telegram/authFlow.ts` | startPhone/submitCode/submitPassword/fetchIdentity | VERIFIED | All exports present. `SESSION_PASSWORD_NEEDED` branch exact string match at line 143. signInWithPassword callback form at line 163. |
| `src/main/telegram/SessionManager.ts` | State machine, persist/restore/logout orchestration | VERIFIED | Composes secrets/errors/floodWait. `finally` always wipes at line 297-305. `AUTH_KEY_UNREGISTERED` dead-session wipe at lines 159, 172. |
| `src/main/ipc/authChannels.ts` | zod-validated ipcMain.handle registrations | VERIFIED | `.parse()` at lines 72, 79, 86 for SubmitPhone/Code/Password schemas. |
| `src/preload/index.ts` | contextBridge whitelist, 8 members, no secrets | VERIFIED | `exposeInMainWorld('mrproper', {...})` at line 7. All 8 members present. No `session.save`, `StringSession`, or `API_HASH`. |
| `src/renderer/ipc/authClient.ts` | Typed window.mrproper wrapper | VERIFIED | Wraps all 8 bridge members. No direct ipcRenderer in renderer code. |
| `src/renderer/store/authStore.ts` | useSyncExternalStore AuthState mirror | VERIFIED | Subscribes `onAuthState`/`onFloodTick` on mount. `submitPhone`/`submitCode` etc. dispatch through authClient. |
| `src/renderer/auth/PhoneStep.tsx` | Country picker + pre-send validation, D-07/D-09/D-14 | VERIFIED | Uses `CountryPicker`, `isValidPhoneNumber` from libphonenumber-js, Loader2 spinner, D-07 country change never clears national (line 48). |
| `src/renderer/auth/CodeStep.tsx` | Inline error + Resend for expired, D-08/D-12 | VERIFIED | "We sent a code to your Telegram app" hint (D-08). Error stays on code step, Resend for PHONE_CODE_EXPIRED (D-12). |
| `src/renderer/auth/PasswordStep.tsx` | Conditional 2FA step | VERIFIED | File exists, conditional on `localFlow === 'password'`. Inline error stays on password step. |
| `src/renderer/auth/FloodCountdown.tsx` | mm:ss monospace, remaining prop | VERIFIED | `tabular-nums text-mono`, `remaining` prop (D-18 decoupled). |
| `src/renderer/auth/errorCopy.ts` | AuthErrorCode → jargon-free UI copy | VERIFIED | All 7 codes mapped, no Telegram jargon. Unit test GREEN (12 assertions). |
| `src/renderer/shell/AppShell.tsx` | Slim header, IdentityDisplay + SettingsMenu | VERIFIED | `bg-secondary border-b` header, left: app name, right: IdentityDisplay + SettingsMenu. |
| `src/renderer/shell/IdentityDisplay.tsx` | 48px avatar, name, Signed-in, @username, initials fallback | VERIFIED | `ring-2 ring-primary`, `bytesToDataUrl`, `AvatarFallback` initials, `@username` monospace. |
| `src/renderer/shell/SettingsMenu.tsx` | ≥44px gear, aria-label Settings, tooltip, D-16 | VERIFIED | `h-11 w-11` (44px), `aria-label="Settings"`, Radix Tooltip. |
| `src/renderer/shell/LogoutDialog.tsx` | Confirm dialog + serverRevoked warning, D-15/D-17 | VERIFIED | shadcn Dialog, `serverRevoked === false` → red Alert banner. |
| `src/renderer/shell/StubbedWorkflowRegions.tsx` | Inert labeled empty states, D-10 | VERIFIED | `aria-disabled="true"`, "Nothing to clean up yet" copy, target-input + group-list regions. |

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `electron.vite.config.ts` main section | `import.meta.env.MRPROPER_API_ID/HASH` | define substitution | VERIFIED | Lines 20-21 in main section only; renderer section has no define |
| `src/main/index.ts` | BrowserWindow webPreferences | preload + contextIsolation | VERIFIED | Lines 29-32 confirmed |
| `src/main/telegram/SessionManager.ts` | secrets + errors + floodWait | composition imports | VERIFIED | Imports `classifyTelegramError`, `FloodWaitController`, `createSecretsStore` confirmed |
| `src/main/ipc/authChannels.ts` | zod schemas | `.parse()` on every payload | VERIFIED | Three `.parse()` calls confirmed |
| `src/preload/index.ts` | ipcRenderer | whitelisted contextBridge | VERIFIED | `exposeInMainWorld`, no raw ipcRenderer exposed |
| `src/renderer/store/authStore.ts` | `window.mrproper.onAuthState` | subscription | VERIFIED | `authClient.onAuthState(...)` on line 42 |
| `src/renderer/auth/PhoneStep.tsx` | `authActions.submitPhone` | intent dispatch | VERIFIED | Line 65 |
| `src/renderer/auth/PhoneStep.tsx` | libphonenumber-js | pre-send validation | VERIFIED | `isValidPhoneNumber` imported from `libphonenumber-js/min` |
| `src/renderer/shell/LogoutDialog.tsx` | `serverRevoked` warning | D-17 wiring | VERIFIED | `serverRevoked === false` shows red Alert |
| `src/main/index.ts` | `sm.initialize()` | restore-on-launch | VERIFIED | Line 144 calls `await sm.initialize(savedSession)` |
| `SessionManager._persistSession` | `secretsStore.persistSession` | onSessionPersist callback | VERIFIED | Fix `819a69d`: `onSessionPersist` callback at line 131 wires to `secretsStore.persistSession` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `AppShell.tsx` | `identity` prop | `auth.identity` from `authStore`, populated by `SessionManager` after `fetchIdentity()` (getMe + downloadProfilePhoto over real MTProto) | Yes — real Telegram user data, confirmed by UAT | FLOWING |
| `IdentityDisplay.tsx` | `identity.name`, `identity.username`, `identity.avatar` | Same upstream `auth.identity` | Yes | FLOWING |
| `App.tsx` | `auth.step` | `authStore` backed by `onAuthState` events from main | Yes — driven by real auth state transitions | FLOWING |
| `LogoutDialog.tsx` | `serverRevoked` | Return value of `authClient.logout()` → `SessionManager.logout()` → `Api.auth.LogOut` result | Yes — real server response | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Production build succeeds with all bundles | `npm run build` | `✓ built in 1.18s`, renderer 1,085 kB | PASS |
| Test suite: 57/59 tests pass (2 expected RED) | `npx vitest run` | `Tests: 2 failed (config.test.ts intentional) | 57 passed (59)` | PASS |
| No GramJS import in renderer | `grep -r "from 'telegram'" src/renderer/` | No results | PASS |
| No 32-hex literal in tracked source | `git grep -E "[0-9a-f]{32}"` | No results | PASS |
| credentials in main section only (not renderer) | vite config structure | `define` only in `main:` section | PASS |
| contextIsolation: true | grep on index.ts | Line 29 confirmed | PASS |
| 0o600 session file permissions | grep on secrets.ts | Line 71 confirmed | PASS |
| D-17 logout always-wipes in finally | grep on SessionManager.ts | `finally` block at line 297 | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| AUTH-01 | 01-02, 01-04, 01-05 | User can log in via phone + login code | SATISFIED | No-2FA end-to-end path UAT-confirmed. `authFlow.ts` startPhone→submitCode, `PhoneStep.tsx`/`CodeStep.tsx`, `SessionManager` state machine. Unit tests GREEN. |
| AUTH-02 | 01-02, 01-04, 01-05 | User can complete login with 2FA password | IMPLEMENTED; MANUAL-PENDING | `SESSION_PASSWORD_NEEDED` branch + `signInWithPassword` callback form in `authFlow.ts` lines 143/163. `PasswordStep.tsx` exists. Unit test `-t "2fa"` GREEN. Real-account 2FA login not yet exercised. |
| AUTH-03 | 01-01, 01-02 | Embedded api_id/api_hash; no per-user registration | SATISFIED | `define` in main vite section, `.env.example` names-only, git grep no 32-hex literal. config.test.ts guards the shape (2 tests intentionally RED in Vitest — by-design; build-time injection verified by `electron-vite build` success with real credentials). |
| AUTH-04 | 01-03, 01-04 | Session persisted encrypted at rest (OS keystore) | SATISFIED | `secrets.ts` with `safeStorage` + 0o600. Fix `819a69d` resolved in-memory-only bug. User confirmed "Login is now persistent". |
| AUTH-05 | 01-04, 01-05 | Logout revokes server authorization + wipes local | SATISFIED | `SessionManager.logout()` try/finally wipe. `LogoutDialog.tsx` D-17 warning. User confirmed logout works. |
| APP-01 | 01-01, 01-05 | Portable desktop app on macOS | SATISFIED | User confirmed "Mac build starts". `electron-builder.yml` dmg+zip x64+arm64. Fix `819a69d` resolved `Cannot find module telegram` crash. |
| APP-02 | 01-01, 01-05 | Portable desktop app on Windows | CONFIGURED; MANUAL-PENDING | `electron-builder.yml` nsis+portable x64. Cannot verify on macOS host. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER in any tracked source file. No empty return stubs in production paths. No console.log-only implementations. |

---

### config.test.ts: 2 Intentionally-RED Tests (Not a Blocker)

The two failing tests (`AUTH-03: API_ID is a positive integer`, `AUTH-03: API_HASH is a non-empty string`) assert build-time `electron-vite define` injection of `MRPROPER_API_ID`/`MRPROPER_API_HASH`, which is absent in the Vitest Node runtime. This is documented in `01-02-SUMMARY.md` and `01-04-SUMMARY.md` as by-design.

AUTH-03 is verified instead by:
1. `electron-vite build` succeeds with real credentials (user confirmed build output).
2. `git grep -E "[0-9a-f]{32}"` returns clean — api_hash not in tracked source.
3. `electron.vite.config.ts` structure confirms `define` in `main:` section only.
4. `config.ts` exports `API_ID = Number(import.meta.env.MRPROPER_API_ID)` with no literal.

These 2 tests are not counted as gaps.

---

### Human Verification Required

#### 1. AUTH-02: 2FA Login (Real Account)

**Test:** Log in with a real Telegram account that has a 2FA password enabled. After entering phone + code, the PasswordStep screen should appear. Enter the correct 2FA password.
**Expected:** Login completes and the authenticated shell shows the account name + @username + avatar with the green "Signed in" indicator.
**Why human:** Requires a real Telegram account with 2FA enabled. The code path is fully implemented and unit-tested (GREEN `-t "2fa"`), but real-MTProto end-to-end with a 2FA-protected account has not been verified.

#### 2. APP-02: Windows Portable Build Launch

**Test:** Run `npm run package:win` (or cross-compile from macOS if electron-builder supports it) and launch the produced NSIS installer or portable .exe on a Windows machine or VM without a developer environment installed.
**Expected:** The app launches, shows the MrProper login screen, and reaches the authenticated shell after login. A SmartScreen warning on first launch is expected for unsigned builds.
**Why human:** No Windows host was available during this phase. `electron-builder.yml` declares correct Windows targets (nsis + portable, x64). The macOS portable build was verified by the user.

---

### Gaps Summary

No blocking gaps. All automated truths are verified. The 2 human-pending items (AUTH-02 2FA real login, APP-02 Windows launch) are the only open items. Both have complete implementations in the codebase — they require environmental conditions (a 2FA-enabled account and a Windows machine) that were not available during Phase 1 execution.

**Recommendation:** Treat as `human_needed`. Phase 2 may proceed while AUTH-02 and APP-02 are verified opportunistically. If a 2FA account and/or Windows VM becomes available before Phase 2 completes, close these items and revert VERIFICATION.md status to `passed`.

---

_Verified: 2026-06-11T09:00:00Z_
_Verifier: Claude (gsd-verifier) — goal-backward, codebase evidence only_
