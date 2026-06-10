---
phase: 01-foundation-auth-session-portable-shell
plan: 04
subsystem: auth-core
tags: [tdd, green, auth-flow, session-manager, ipc, contextbridge, d-01, d-02, d-05, d-12, d-13, d-17, d-18, auth-01, auth-02, auth-04, auth-05]

requires:
  - 01-03 (secrets.ts + errors.ts + floodWait.ts leaf utilities)

provides:
  - src/main/telegram/authFlow.ts — AuthFlow class + startPhone/submitCode/submitPassword/fetchIdentity module functions
  - src/main/telegram/SessionManager.ts — single-client auth state machine + persist/restore/logout orchestration
  - src/main/ipc/authChannels.ts — registerAuthChannels() with zod-validated ipcMain.handle registrations
  - src/main/index.ts — wired: TelegramClient + SessionManager + registerAuthChannels + sm.initialize (restore-on-launch)
  - src/preload/index.ts — contextBridge whitelist (8 members: submitPhone/submitCode/submitPassword/resendCode/getAuthState/logout/onAuthState/onFloodTick)

affects:
  - Plan 05 (renderer wraps window.mrproper — exact API surface documented below)
  - Phase 2 governor (FloodWaitController D-18 seam already in floodWait.ts — unchanged)
  - All subsequent phases (SessionManager is the single service facade every later phase extends)

tech-stack:
  added:
    - zod (already installed in plan 02) — used for IPC payload validation in authChannels.ts
  patterns:
    - Stepped GramJS auth (sendCode → Api.auth.SignIn → SESSION_PASSWORD_NEEDED catch → signInWithPassword callback form)
    - Injectable client pattern on AuthFlow and SessionManager — mock substitution for unit tests
    - zod .parse() on every inbound IPC payload (V5 trust boundary enforcement)
    - D-17 always-wipe: logout finally block runs wipeSession regardless of server revocation outcome
    - D-18 FloodWaitController seam: timing source injectable for Phase 2 governor

key-files:
  created:
    - src/main/telegram/authFlow.ts (225 lines)
    - src/main/telegram/SessionManager.ts (260 lines)
    - src/main/ipc/authChannels.ts (120 lines)
  modified:
    - src/main/index.ts (wired SessionManager + restore-on-launch)

key-decisions:
  - "AuthFlow is a class (not pure functions) because the tests instantiate new AuthFlow(client, creds, emit) — tests dictate the shape"
  - "SessionManager takes { client, storage, onStateChange, onSessionWipe } — injectable for tests; production wires real safeStorage inline in index.ts"
  - "logout() uses Api.auth.LogOut in try + wipeSession in finally — always wipes local regardless of server outcome (D-17)"
  - "SESSION_PASSWORD_NEEDED branch checks err.errorMessage === 'SESSION_PASSWORD_NEEDED' exactly (Pitfall 4)"
  - "signInWithPassword uses callback form per A2 resolution: password: async (_hint) => passwordString"
  - "config.test.ts 2 tests remain RED intentionally — they test build-time env injection (MRPROPER_API_ID/API_HASH) not available in Vitest env"

duration: 15min
completed: 2026-06-10
---

# Phase 01 Plan 04: Auth Core — authFlow.ts, SessionManager.ts, IPC Channels, Preload Summary

**TDD GREEN: Stepped GramJS auth flow, auth state machine, zod-validated IPC trust boundary, restore-on-launch — 10 target tests GREEN, 33/35 total tests GREEN**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-10T21:09:03Z
- **Completed:** 2026-06-10
- **Tasks:** 2
- **Files created:** 3; Files modified: 1

## Accomplishments

### Task 1: authFlow.ts + SessionManager (AUTH-01/02/04/05)

**authFlow.ts — AuthFlow class (injectable client) + module-level functions:**

- `AuthFlow(client, apiCreds, onStateChange)` — stepped auth flow for one login session
- `submitPhone({ dialCode, national })` → emits `sendingCode` → `needCode` (stores `phoneCodeHash` internally)
- `submitCode({ code })` → `invoke(Api.auth.SignIn)` → emits `authorized` (happy path) or `needPassword` on `SESSION_PASSWORD_NEEDED`
- `submitPassword({ password })` → `signInWithPassword` with callback form `password: async (hint) => value` (A2 resolution) → emits `authorized`
- Error handling: FLOOD_WAIT starts FloodWaitController + emits countdown ticks; other errors `classifyTelegramError` → `error` state with `retryStep` (D-12 — stays on offending step)
- Module-level `startPhone`, `submitCode`, `submitPassword`, `fetchIdentity` functions also exported
- `fetchIdentity` → `getMe()` + `downloadProfilePhoto()` → `{ name, username|null, id, avatar: Uint8Array|null }`

**SessionManager.ts — auth state machine with injectable deps:**

- Constructor: `{ client, storage, onStateChange, onSessionWipe, apiCreds? }`
- `initialize(sessionString?)` — connects + checkAuthorization; on `AUTH_KEY_UNREGISTERED`/dead session → `_wipeSessionLocally()` + emit `idle`
- `submitPhone/submitCode/submitPassword` — delegates to a per-session `AuthFlow`
- On `authorized` state: `persistSession(client.session.save())` via in-memory encrypted store
- `logout()` — `Api.auth.LogOut` in try, `disconnect()` + `_wipeSessionLocally()` in finally, returns `{ serverRevoked }`
- `getState()` — returns current `AuthState` for `AUTH_GET_STATE` IPC handler

**Test results:**

```
npx vitest run src/main/telegram/authFlow.test.ts src/main/telegram/SessionManager.test.ts

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Duration  226ms
```

- `-t "2fa"` GREEN: SESSION_PASSWORD_NEEDED → needPassword → authorized
- `-t "code error"` GREEN: PHONE_CODE_INVALID/EXPIRED → error.retryStep === 'code' (D-12)
- `-t "dead session"` GREEN: AUTH_KEY_UNREGISTERED on connect → wipe + idle
- `-t "logout ok"` GREEN: server revoke → serverRevoked:true, wipe called
- `-t "logout server fail"` GREEN: server revoke throws → serverRevoked:false, wipe STILL called (D-17)

### Task 2: zod-validated IPC handlers + restore-on-launch

**src/main/ipc/authChannels.ts:**

- `registerAuthChannels(win, sm)` registers 6 `ipcMain.handle` channels
- `SubmitPhoneSchema`, `SubmitCodeSchema`, `SubmitPasswordSchema` — zod schemas, `.parse()` on every inbound payload
- Malformed payloads throw `ZodError` before reaching SessionManager (T-04-02 mitigation)
- `emitAuthState(win, state)` and `emitFloodTick(win, tick)` helpers for main → renderer events
- Handlers return `AuthState` or `LogoutResult` — no GramJS objects, no session strings (T-04-01 mitigation)

**src/preload/index.ts — already correct from plan 01; verified clean:**

- `exposeInMainWorld('mrproper', {...})` with 8 whitelisted members
- No `session.save`, `StringSession`, or `API_HASH` reference (automated grep guard passed)
- `onAuthState` and `onFloodTick` return `() => void` unsubscribe functions

**src/main/index.ts wiring:**

- `createWindow()` now returns `BrowserWindow`
- After `app.whenReady()`: `createSecretsStore()` → `restoreSession()` → `TelegramClient(StringSession, API_ID, API_HASH, { floodSleepThreshold: 5 })`
- `SessionManager` constructed with safeStorage-backed storage + `emitAuthState` as `onStateChange`
- `registerAuthChannels(win, sm)` called
- `sm.initialize(savedSession)` called for restore-on-launch (sends first `AuthState` to renderer)

**Automated verification:**

```
node -e "...grep guards..." → ipc+preload boundary ok

npx vitest run → Tests 33 passed, 2 failed (config.test.ts — intentionally RED, build-time env injection)
```

## window.mrproper API Surface (for Plan 05 renderer)

```typescript
// Declared on Window by preload/index.ts — plan 05 renderer uses these
interface MrProper {
  // Invoke channels (return Promises)
  submitPhone(p: { dialCode: string; national: string }): Promise<AuthState>
  submitCode(p: { code: string }): Promise<AuthState>
  submitPassword(p: { password: string }): Promise<AuthState>
  resendCode(): Promise<AuthState>
  getAuthState(): Promise<AuthState>
  logout(): Promise<LogoutResult>  // { serverRevoked: boolean }

  // Event subscriptions (return unsubscribe functions)
  onAuthState(cb: (state: AuthState) => void): () => void
  onFloodTick(cb: (tick: FloodTick) => void): () => void
}

// Accessed as: window.mrproper.submitPhone(...)
// AuthState, LogoutResult, FloodTick are from src/shared/authTypes.ts
```

## Verification

```
npx vitest run src/main/telegram/authFlow.test.ts src/main/telegram/SessionManager.test.ts

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Duration  226ms
```

Full suite (excluding intentionally-RED config.test.ts):

```
 Test Files  5 passed (+ 1 failed: config.test.ts expected RED)
      Tests  33 passed | 2 failed (config API_ID/API_HASH — build-time env, not vitest env)
```

## Task Commits

1. **Task 1: authFlow.ts + SessionManager** — `1fcb4e4`
   - `src/main/telegram/authFlow.ts` (225 lines)
   - `src/main/telegram/SessionManager.ts` (260 lines)
2. **Task 2: IPC handlers + restore-on-launch** — `bded6bd`
   - `src/main/ipc/authChannels.ts` (120 lines)
   - `src/main/index.ts` (updated)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] createWindow() needed to return BrowserWindow**
- **Found during:** Task 2 wiring (the plan requires `registerAuthChannels(win, sm)` but createWindow returned void)
- **Issue:** `const win = createWindow()` would be `void` — IPC emitters need the window reference
- **Fix:** Changed return type to `BrowserWindow` and added `return mainWindow`
- **Files modified:** `src/main/index.ts`
- **Commit:** bded6bd

**2. [Rule 2 - Missing] floodWait emission in AuthFlow needed AuthState emit approach**
- **Found during:** Task 1 (AuthFlow has no access to win.webContents for flood ticks directly)
- **Issue:** Plan notes that floodTick events should go to renderer; AuthFlow can only call `onStateChange`
- **Fix:** AuthFlow emits `floodWait` AuthState updates (secondsRemaining on each tick) + final `needCode`/`needPassword` state on completion. The IPC layer sends the state via `win.webContents.send(AUTH_STATE, state)`. Separate `AUTH_FLOOD_TICK` events emitted by dedicated `emitFloodTick` helper in authChannels.ts for callers that need the raw FloodTick type.
- **Commit:** 1fcb4e4

### config.test.ts RED (intentional — documented in plan wave context)

The 2 tests `AUTH-03: API_ID is a positive integer` and `AUTH-03: API_HASH is a non-empty string` remain RED. These test build-time define injection (`MRPROPER_API_ID`/`MRPROPER_API_HASH`) which is absent in the Vitest environment. The plan explicitly notes: "The config.test.ts env-injection test may remain RED — note it if so, do not force it green by faking env." Confirmed intentional.

## Threat Surface Scan

All 6 IPC channels (`ipcMain.handle`) registered in authChannels.ts are in the plan's threat register:

| Channel | STRIDE | Mitigation Applied |
|---------|--------|--------------------|
| auth:submitPhone | T-04-02 (injection) | SubmitPhoneSchema.parse() ✓ |
| auth:submitCode | T-04-02 | SubmitCodeSchema.parse() ✓ |
| auth:submitPassword | T-04-02 | SubmitPasswordSchema.parse() ✓ |
| auth:resendCode | T-04-02 | no payload (safe) ✓ |
| auth:getState | T-04-01 (disclosure) | returns AuthState DTO only ✓ |
| auth:logout | T-04-03 (repudiation) | Api.auth.LogOut + always wipe ✓ |

No new network endpoints, file access patterns, or trust-boundary changes beyond what the plan specified.

T-04-04 (dead session reuse): `initialize()` detects `AUTH_KEY_UNREGISTERED` → wipeSession + idle ✓
T-04-05 (FLOOD_WAIT hang): `floodSleepThreshold: 5` in TelegramClient constructor → waits throw ✓

## Known Stubs

None. All modules are complete implementations delivering the plan's behavioral requirements.

## Self-Check

Files created:
- src/main/telegram/authFlow.ts: FOUND
- src/main/telegram/SessionManager.ts: FOUND
- src/main/ipc/authChannels.ts: FOUND
- .planning/phases/01-foundation-auth-session-portable-shell/01-04-SUMMARY.md: FOUND

Commits:
- 1fcb4e4: FOUND
- bded6bd: FOUND

## Self-Check: PASSED
