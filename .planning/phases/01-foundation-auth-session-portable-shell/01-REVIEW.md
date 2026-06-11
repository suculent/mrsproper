---
phase: 01-foundation-auth-session-portable-shell
reviewed: 2026-06-11T10:00:00Z
depth: deep
files_reviewed: 53
files_reviewed_list:
  - electron-builder.yml
  - electron.vite.config.ts
  - postcss.config.js
  - tailwind.config.ts
  - src/main/index.ts
  - src/main/ipc/authChannels.ts
  - src/main/storage/secrets.ts
  - src/main/storage/secrets.test.ts
  - src/main/storage/__mocks__/safeStorage.ts
  - src/main/telegram/config.ts
  - src/main/telegram/authFlow.ts
  - src/main/telegram/authFlow.test.ts
  - src/main/telegram/SessionManager.ts
  - src/main/telegram/SessionManager.test.ts
  - src/main/telegram/errors.ts
  - src/main/telegram/errors.test.ts
  - src/main/telegram/floodWait.ts
  - src/main/telegram/floodWait.test.ts
  - src/main/telegram/__mocks__/telegramClient.ts
  - src/preload/index.ts
  - src/renderer/App.tsx
  - src/renderer/auth/CodeStep.tsx
  - src/renderer/auth/CountryPicker.tsx
  - src/renderer/auth/FloodCountdown.tsx
  - src/renderer/auth/PasswordStep.tsx
  - src/renderer/auth/PhoneStep.tsx
  - src/renderer/auth/errorCopy.ts
  - src/renderer/auth/errorCopy.test.ts
  - src/renderer/auth/phoneValidation.test.ts
  - src/renderer/components/ui/alert.tsx
  - src/renderer/components/ui/avatar.tsx
  - src/renderer/components/ui/button.tsx
  - src/renderer/components/ui/command.tsx
  - src/renderer/components/ui/dialog.tsx
  - src/renderer/components/ui/input.tsx
  - src/renderer/components/ui/label.tsx
  - src/renderer/components/ui/popover.tsx
  - src/renderer/components/ui/select.tsx
  - src/renderer/components/ui/tooltip.tsx
  - src/renderer/index.html
  - src/renderer/ipc/authClient.ts
  - src/renderer/lib/utils.ts
  - src/renderer/main.tsx
  - src/renderer/shell/AppShell.tsx
  - src/renderer/shell/IdentityDisplay.tsx
  - src/renderer/shell/LogoutDialog.tsx
  - src/renderer/shell/SettingsMenu.tsx
  - src/renderer/shell/StubbedWorkflowRegions.tsx
  - src/renderer/store/authStore.ts
  - src/renderer/styles/globals.css
  - src/shared/authTypes.ts
  - src/shared/channels.ts
findings:
  critical: 0
  high: 2
  medium: 3
  low: 3
  total: 8
status: issues-found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-06-11T10:00:00Z
**Depth:** deep
**Files Reviewed:** 53
**Status:** issues-found

---

## Summary

Phase 1 delivers the portable Electron shell, a stepped MTProto auth flow (phone → code → 2FA), encrypted session persistence via `safeStorage`, and a zod-validated IPC trust boundary. The architecture is broadly sound: `contextIsolation + sandbox + nodeIntegration=false`, no session string crossing the IPC boundary, `safeStorage`-only encryption with `0o600` file perms, and `D-17` logout always wipes local state regardless of server outcome.

Two High-severity bugs were found — both functional, not security: the `resendCode` handler is a stub that emits a fake state transition without calling `sendCode` on the wire, and a FLOOD_WAIT that arrives during phone submission leaves the user stranded on the code step after the countdown with no code ever sent. Three Medium issues cover a race condition in `_ensureConnected`, a flood-tick channel that is wired in the renderer but never emitted from main, and a `nativeTheme` listener that accumulates on macOS window re-creation. No hardcoded credentials were found in tracked files; the IPC trust boundary (D-02) is correctly implemented.

---

## High Issues

### HI-01: `resendCode` does not resend — stub emits fake state

**File:** `src/main/telegram/SessionManager.ts:256-278`

**Issue:** `SessionManager.resendCode()` contains a `try/catch` block that never calls `client.sendCode` (or any Telegram API). It only emits `{ step: 'sendingCode' }` followed immediately by `{ step: 'needCode' }`. The user sees a "Resend code" confirmation in the UI, but no code is dispatched via Telegram. The `catch` branch is dead — there is nothing in the `try` body that can throw.

```typescript
// Current: fake resend — no network call
this._emit({ step: 'sendingCode' })
try {
  this._emit({ step: 'needCode', sentTo: 'Telegram app', canResend: true })
} catch (err) { /* unreachable */ }
```

**Fix:** Delegate to `AuthFlow.submitPhone` using the phone number already stored in `_authFlow._phoneNumber`. Since `_phoneNumber` is private, either expose a `resendCode()` method on `AuthFlow` that calls `sendCode` with the stored number, or store the phone number in `SessionManager` when `submitPhone` is first called.

```typescript
// In SessionManager.resendCode():
if (!this._authFlow) {
  this._emit({ step: 'error', code: 'UNKNOWN', retryStep: 'phone' })
  return
}
// Delegate — AuthFlow.resendCode() calls client.sendCode with _phoneNumber
await this._authFlow.resendCode()
```

---

### HI-02: FLOOD_WAIT during `sendCode` (phone step) routes user to code step with no code sent

**File:** `src/main/telegram/authFlow.ts:197-224`

**Issue:** When GramJS returns a `FLOOD_WAIT` error from `sendCode` (i.e., `defaultRetryStep === 'phone'`), `_handleError` forces `retryStep` to `'code'` (line 197) because the `floodWait` union type disallows `'phone'`. When the countdown finishes, `onDone` emits `{ step: 'needCode', sentTo: 'Telegram app', canResend: true }`. The UI transitions to the code-entry step (triggering `localFlow = 'code'` in `App.tsx`), but the user has no code — `sendCode` was never completed.

```typescript
// Line 197 — forced mapping hides the real step:
const retryStep = defaultRetryStep === 'phone' ? 'code' : defaultRetryStep as 'code' | 'password'
// ...
// onDone emits needCode — but sendCode never succeeded:
this._emit({ step: 'needCode', sentTo: 'Telegram app', canResend: true })
```

**Fix:** Add `'phone'` as a valid `retryStep` to the `floodWait` union in `src/shared/authTypes.ts`, or treat a phone-step flood as a `'phone'`-retryStep flood and have `onDone` route back to `'idle'` (or a "try again" phone state) rather than `needCode`. The simplest safe fix:

```typescript
// In src/shared/authTypes.ts:
| { step: 'floodWait'; retryStep: 'phone' | 'code' | 'password'; secondsRemaining: number }

// In authFlow.ts _handleError onDone:
if (retryStep === 'phone') {
  this._emit({ step: 'idle' })
} else if (retryStep === 'code') {
  this._emit({ step: 'needCode', sentTo: 'Telegram app', canResend: true })
} else {
  this._emit({ step: 'needPassword' })
}
```

---

## Medium Issues

### ME-01: `_ensureConnected` has a check-then-act race condition

**File:** `src/main/telegram/SessionManager.ts:318-322`

**Issue:** `_ensureConnected` reads `_connected` then awaits `client.connect()`. Because `_connected` is only set to `true` after the `await` resolves, two concurrent IPC calls to `submitPhone` (possible in Electron since IPC is async and both calls enter the event queue before either resolves) both pass the `if (!this._connected)` guard and both call `client.connect()`. GramJS may tolerate a double connect but the behavior is undocumented and the internal TCP session could be corrupted.

```typescript
private async _ensureConnected(): Promise<void> {
  if (this._connected) return   // both callers see false simultaneously
  await this._client.connect()  // both call this
  this._connected = true
}
```

**Fix:** Use a connecting-promise sentinel so concurrent calls await the same inflight connect:

```typescript
private _connectingPromise: Promise<void> | null = null

private _ensureConnected(): Promise<void> {
  if (this._connected) return Promise.resolve()
  if (this._connectingPromise) return this._connectingPromise
  this._connectingPromise = this._client.connect().then(() => {
    this._connected = true
    this._connectingPromise = null
  })
  return this._connectingPromise
}
```

---

### ME-02: `AUTH_FLOOD_TICK` channel is never emitted — countdown in renderer always lags

**File:** `src/main/ipc/authChannels.ts:115-118` / `src/renderer/store/authStore.ts:51-53`

**Issue:** `emitFloodTick(win, tick)` is exported from `authChannels.ts` and `onFloodTick` is subscribed in `authStore.ts`, but `emitFloodTick` is never called from anywhere in the codebase. The flood countdown works indirectly because `AuthFlow._handleError` emits a new `floodWait` AuthState on every tick via the `AUTH_STATE` channel, and `authStore` seeds `floodRemaining` from `state.secondsRemaining`. However:

1. The `onFloodTick` subscription (`authClient.onFloodTick`) is wired and holds a reference but never fires — dead subscription with no cleanup benefit.
2. `floodRemaining` in the store is only updated when a full AuthState push arrives. If the state push and the tick update diverge (e.g., the renderer subscribes late), the displayed countdown could be wrong.

The real fix is to either: (a) actually call `emitFloodTick` in `SessionManager`'s flood controller's `onTick` callback, or (b) remove the `AUTH_FLOOD_TICK` channel and the `onFloodTick` plumbing entirely and drive the renderer countdown purely from `floodWait.secondsRemaining` in AuthState pushes.

**Fix (option b — remove the dead channel):**
- Remove `emitFloodTick` from `authChannels.ts`
- Remove `AUTH_FLOOD_TICK` from `channels.ts` and `preload/index.ts`
- Remove `onFloodTick` subscription from `authStore.ts`
- Drive `floodRemaining` entirely from `state.secondsRemaining` when `state.step === 'floodWait'`

---

### ME-03: `nativeTheme` listener accumulates on macOS re-activation

**File:** `src/main/index.ts:47`

**Issue:** `nativeTheme.on('updated', syncRendererTheme)` is called inside `createWindow()`. On macOS, when all windows are closed the app remains running, and clicking the Dock icon triggers the `'activate'` event which calls `createWindow()` again. Each call to `createWindow()` adds another `'updated'` listener to `nativeTheme` without removing the previous one. The stale listeners close over the old (destroyed) `mainWindow` reference; `executeJavaScript` on a destroyed window throws, which is caught by `.catch(() => {})`. Over multiple window cycles this accumulates listeners and triggers unnecessary work.

```typescript
// In createWindow() — registered unconditionally, never removed:
nativeTheme.on('updated', syncRendererTheme)
```

**Fix:** Remove the listener when the window is closed:

```typescript
const onThemeUpdated = (): void => syncRendererTheme()
nativeTheme.on('updated', onThemeUpdated)
mainWindow.on('closed', () => {
  nativeTheme.removeListener('updated', onThemeUpdated)
})
```

---

## Low Issues

### LO-01: `SessionManager._floodController` is constructed but never used

**File:** `src/main/telegram/SessionManager.ts:109,128`

**Issue:** `SessionManager` constructs a `FloodWaitController` at line 128 and stores it at line 109 as `this._floodController`. It is never called anywhere in `SessionManager`. The actual flood countdown is owned by `AuthFlow._floodController`. This is dead code that adds confusion about which controller drives the countdown.

**Fix:** Remove `_floodController` from `SessionManager` until Phase 2 requires it for bulk-operation floods (per D-18 intent).

---

### LO-02: `SessionManager` does not stop `AuthFlow`'s flood countdown on logout

**File:** `src/main/telegram/SessionManager.ts:289-310`

**Issue:** `logout()` wipes the session and emits `{ step: 'idle' }`, but `this._authFlow` is not nulled out and `AuthFlow._floodController` is not stopped. If a flood countdown was active when logout was triggered (edge case: user opens settings menu during a FLOOD_WAIT), the countdown continues running and emits `floodWait` state updates after the `idle` state, causing the renderer to flip back from the login screen to a flood countdown.

**Fix:** Before the `finally` block in `logout()`, stop the AuthFlow's flood controller and clear the reference:

```typescript
// Before finally in logout():
this._authFlow?._floodController.stop()
this._authFlow = null
```

(This requires making `_floodController` accessible from `SessionManager`, e.g., by adding a `dispose()` method to `AuthFlow`.)

---

### LO-03: `console.error` in `authStore` action handlers logs potentially sensitive context

**File:** `src/renderer/store/authStore.ts:102,111,120,129,140`

**Issue:** All five `authActions` catch blocks call `console.error('[authStore] …', err)`. In Electron's renderer, `console.error` output is visible in DevTools and (depending on logging configuration) may be forwarded to a log file. The `err` object passed from a rejected IPC call could include stack traces or serialized payloads. While no plaintext password is in the error (Zod errors report field names, not values), this is worth cleaning up before any remote-logging integration is added.

**Fix:** Either remove the `console.error` calls (errors are pushed to state by the main process anyway), or sanitize: log only `err instanceof Error ? err.message : String(err)` without the full `err` object.

---

_Reviewed: 2026-06-11T10:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
