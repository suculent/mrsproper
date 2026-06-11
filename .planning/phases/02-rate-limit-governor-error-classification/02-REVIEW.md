---
phase: 02-rate-limit-governor-error-classification
reviewed: 2026-06-11T14:04:11Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/main/index.ts
  - src/main/telegram/SessionManager.test.ts
  - src/main/telegram/SessionManager.ts
  - src/main/telegram/__mocks__/telegramClient.ts
  - src/main/telegram/governor.test.ts
  - src/main/telegram/governor.ts
  - src/main/telegram/operationErrors.test.ts
  - src/main/telegram/operationErrors.ts
  - src/shared/opTypes.ts
findings:
  critical: 1
  warning: 9
  info: 5
  total: 15
status: issues_found
---

# Phase 2: Code Review Report (post-gap-closure 02-04)

**Reviewed:** 2026-06-11T14:04:11Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This review replaces the prior 02-REVIEW.md and reflects the state after gap-closure plan 02-04 (auth.LogOut routed through `governor.run()`, logout mock reworked to `logoutErrorCode: MockRPCErrorCode`, governor.test.ts tsc fixes, SESSION_INVALID disposition comments aligned to 'fail').

What holds up under scrutiny: PEER_FLOOD is checked before any flood-wait parsing (operationErrors.ts:61 precedes :68), the 3600s ceiling throws before sleeping, transient retry is bounded at 3 attempts with the documented backoff, the hand-rolled tail-chain serializes correctly and cannot wedge on rejection (`.then(resolve, reject)` handlers never throw, so `_tail` never rejects), and the prior review's CR-01 (SESSION_INVALID contract contradiction) was resolved by aligning the opTypes.ts/governor.ts comments to the 'fail' decision. All 19 tests across the three in-scope suites pass (verified by running them).

What does not hold up:

1. **`SessionManager.initialize()` destroys a valid persisted session on any transient error** — launching the app offline wipes the on-disk session and forces full re-login (Critical).
2. **The reviewed files still fail strict typecheck.** `npx tsc --noEmit -p tsconfig.node.json` reports 6 errors in the in-scope files — including TS2345 on the exact line gap-closure 02-04 added (`new Api.auth.LogOut({})` at SessionManager.ts:288; `auth.LogOut` takes no constructor argument per the installed GramJS d.ts).
3. **Governor events are still not wired to IPC in production** (`onGovernorEvent` never passed in index.ts), so with `floodSleepThreshold: 0` every FLOOD_WAIT on a governed call is an invisible hang of up to ~1 hour. This was flagged in the prior review and remains open.
4. The governor has no cap on consecutive FLOOD_WAIT retries and no cancellation, and `logout()`'s D-17 wipe now queues behind that unbounded chain.

Out-of-scope observation (not counted in findings): `tsc -p tsconfig.node.json` also fails in `src/main/ipc/authChannels.ts:58` (unused `win`), `src/main/storage/secrets.test.ts:12-14` (unused imports), `src/main/telegram/authFlow.ts:165` (unused `err`), and `src/main/telegram/config.ts:5-6` (missing `ImportMetaEnv` augmentation). The 2 failing config.test.ts cases are the known AUTH-03 env-injection baseline.

## Critical Issues

### CR-01: Offline or transient-error launch destroys a valid persisted session

**File:** `src/main/telegram/SessionManager.ts:179-189`
**Issue:** `initialize()` wipes the session for ANY error, not just dead-session errors:

```ts
} catch (err) {
  if (isDeadSessionError(err)) {
    this._wipeSessionLocally()
    this._emit({ step: 'idle' })
    return
  }
  // Other connection error — still route to login safely
  this._wipeSessionLocally()   // ← also wipes on plain NETWORK errors
  this._emit({ step: 'idle' })
}
```

If the user launches the app with no network connectivity (offline laptop, captive portal, Telegram briefly unreachable), `client.connect()` rejects with a plain network error, `isDeadSessionError()` is false, and execution falls through to `_wipeSessionLocally()` — which fires `onSessionWipe` → `secretsStore.wipeSession()` in production (`index.ts:136-138`), deleting the encrypted on-disk session. A fully valid login (phone + code + 2FA) is destroyed by a transient condition that the project's own classifier marks `disposition: 'retry'` (`operationErrors.ts:86-88`).

The same wipe also fires if `_fetchIdentity()` (line 175) fails: a FLOOD_WAIT > 3600s on `getMe`, or three exhausted NETWORK retries, propagates into this catch and wipes the session.

**Fix:** Wipe only on dead-session errors (and the explicit `!isAuthorized` branch); on other errors keep the session and route to idle (or a dedicated offline/retry state):

```ts
} catch (err) {
  if (isDeadSessionError(err)) {
    this._wipeSessionLocally()
    this._emit({ step: 'idle' })
    return
  }
  // Transient error — session may still be valid. Do NOT wipe.
  this._emit({ step: 'idle' })
}
```

There is no test for "initialize with a network error does not wipe" — add one (the mock needs a plain-Error `connectError` variant; today `MockRPCErrorCode` only produces RPC-shaped errors).

## Warnings

### WR-01: In-scope files fail strict typecheck (6 errors), including the gap-closure line itself

**File:** `src/main/telegram/SessionManager.ts:288, 30, 33, 113`; `src/main/telegram/SessionManager.test.ts:13`
**Issue:** `npx tsc --noEmit -p tsconfig.node.json` (strict) fails. In-scope errors:

- `SessionManager.ts(288,78): TS2345: Argument of type '{}' is not assignable to parameter of type 'void'.` — `new Api.auth.LogOut({})`. Verified against `node_modules/telegram/tl/api.d.ts:21245`: `class LogOut extends Request<void, auth.TypeLoggedOut>` — no constructor argument. This is the exact line added by 02-04. Runtime-harmless, but it breaks the typecheck gate in a project whose stated TypeScript rationale is "strong typing matters when a typo triggers a destructive EditBanned call."
- `SessionManager.ts(30,1): TS6133` — `SecretsStore` imported, never used.
- `SessionManager.ts(33,10): TS6133` — `floodWaitSeconds` imported, never used.
- `SessionManager.ts(113,20): TS6133` — `_floodController` declared and constructed (line 134) but never used; the controller now lives inside the governor, this field is dead residue.
- `SessionManager.test.ts(13,32 / 13,36): TS6133` — `vi` and `beforeEach` imported, never used.

`electron-vite build` is transform-only (no typecheck) and package.json has no `typecheck` script, so nothing catches these.

**Fix:**
```ts
// SessionManager.ts:288
await this._governor.run(() => this._client.invoke(new Api.auth.LogOut()))
```
Remove the `SecretsStore` and `floodWaitSeconds` imports, the `_floodController` field and its construction; trim the test import to `import { describe, it, expect } from 'vitest'`. Add a `"typecheck"` script so this regression class is caught going forward.

### WR-02: Production CSP may never be applied — `file://` loads bypass header injection and index.html has no CSP meta tag

**File:** `src/main/index.ts:54-72`; `src/renderer/index.html:3-7`
**Issue:** The strict production CSP is delivered only via `webRequest.onHeadersReceived`, but the packaged app loads the renderer with `loadFile` (`file://`, line 82). Header-based CSP for `file://` documents is unreliable in Electron (no real HTTP response headers; Electron's security guidance prescribes a `<meta http-equiv="Content-Security-Policy">` tag for file-loaded content). `src/renderer/index.html` has no CSP meta tag, so if header injection does not apply to the `file://` document in the shipped Electron version, the packaged renderer runs with NO CSP while the code comment asserts "Production (packaged): strict." Sandbox + contextIsolation limit blast radius, but the declared defense-in-depth control is unverified.

**Fix:** Add the strict CSP as a meta tag in `index.html` (inject the dev-relaxed variant in dev via electron-vite), or verify in a packaged build that an inline-script violation is actually blocked. Keep header injection for the dev server path.

### WR-03: macOS re-activation creates a window that is never wired to SessionManager state

**File:** `src/main/index.ts:154-158`
**Issue:** `app.on('activate')` calls `createWindow()` and discards the result. `emitAuthState` stays bound to the original `win` (line 133-135). On macOS the app keeps running after the window closes (`window-all-closed` skips darwin); after re-activation, every pushed auth-state event targets the destroyed original window — `emitAuthState`'s `isDestroyed()` guard means they are silently dropped, never delivered to the new window. The re-activated UI only sees state via pull (`AUTH_GET_STATE` / handler return values); all async push transitions (and any future governor events) are lost. Standard macOS lifecycle → degraded UI.

**Fix:** Track the current window (`let currentWin = createWindow()`, reassigned in `activate`) and emit to it: `onStateChange: (s) => emitAuthState(currentWin, s)`. The IPC handlers already close over `sm`, so only the emit target needs rebinding.

### WR-04: `onGovernorEvent` is never wired in production — FLOOD_WAIT during initialize/logout is an invisible hang (carried over from prior review, still open)

**File:** `src/main/index.ts:117-144`; `src/main/telegram/SessionManager.ts:100-101`
**Issue:** `SessionManagerOptions.onGovernorEvent` is documented as "wired to IPC in production," but `index.ts` never passes it, so the governor's emitter defaults to a no-op (`governor.ts:77`). With `floodSleepThreshold: 0` (index.ts:113), every FLOOD_WAIT on the governed calls (`getMe` / `downloadProfilePhoto` in `_fetchIdentity`, `auth.LogOut` in `logout`) reaches the governor, which sleeps up to 3600s + jitter while emitting flood-tick events into the void. The user sees a frozen launch or a dead logout button for up to an hour with zero feedback — D-09's whole purpose defeated for every governor-routed call that exists today.

**Fix:** Wire a minimal bridge in index.ts (new channel constant in `src/shared/channels.ts`):
```ts
onGovernorEvent: (event) => {
  if (!win.isDestroyed()) win.webContents.send(OP_GOVERNOR_EVENT, event)
},
```
or at minimum log governor events in main so the hang is diagnosable. If wiring is deliberately deferred to Phase 5, correct the doc comment and record the deferral.

### WR-05: D-17 logout wipe is deferred behind the governor's serial queue and unbounded flood retries

**File:** `src/main/telegram/SessionManager.ts:284-305`; `src/main/telegram/governor.ts:101-103`
**Issue:** Routing `auth.LogOut` through `governor.run()` (the 02-04 change) has two side effects:
1. Logout queues behind whatever is already in `_tail`. If a prior governed call is mid-FLOOD_WAIT sleep (up to 3600s + jitter), the `finally` block performing the D-17 local wipe and `idle` emit cannot run until the chain drains — the user's explicit "log me out" is blocked for up to an hour.
2. If `auth.LogOut` itself draws a FLOOD_WAIT ≤ 3600s, the governor sleeps and retries indefinitely (WR-06) before `logout()` reaches catch/finally at all. D-17 says the local wipe ALWAYS happens; in practice it happens only after the governor eventually settles, and there is no cancellation mechanism to force it.

**Fix:** Decouple the local wipe from server-call completion — wipe immediately (or after a bounded timeout) and let the revocation race a deadline:
```ts
const revoke = this._governor.run(() => this._client.invoke(new Api.auth.LogOut()))
const serverRevoked = await Promise.race([
  revoke.then(() => true, () => false),
  new Promise<boolean>((r) => setTimeout(() => r(false), LOGOUT_TIMEOUT_MS)),
])
// disconnect + _wipeSessionLocally() + emit idle unconditionally here
```
or give the governor an abort API (see WR-06).

### WR-06: Governor FLOOD_WAIT retries are unbounded with no cancellation — one pathological call starves the entire serialized pipeline

**File:** `src/main/telegram/governor.ts:134-162`
**Issue:** The `wait` path retries with no cap on consecutive FLOOD_WAITs or cumulative wait ("FLOOD_WAIT retries are NOT counted against transient budget", line 161). Each individual wait is capped at 3600s (D-12), but a server returning FLOOD_WAIT_3000 on every attempt loops forever: sleep ~50 min → retry → FLOOD_WAIT → sleep → … Because EXE-01 serializes everything through `_tail`, every subsequently enqueued operation — including logout (WR-05) — is starved indefinitely. `RateLimitGovernor` exposes no `abort()`/`AbortSignal`, so nothing short of process exit recovers.

**Fix:** Add a consecutive-FLOOD_WAIT budget (e.g., max 3 consecutive waits or a cumulative ceiling, then throw with a `wait-too-long`-style event), and/or accept an `AbortSignal` in `run()` that is checked before each retry and short-circuits the sleep. This also provides Phase 5's job-abort lever.

### WR-07: `floodWaitSeconds` over-matches — any GramJS FloodError-family error with `.seconds` is typed as FLOOD_WAIT, and the value is unvalidated

**File:** `src/main/telegram/floodWait.ts:41-42`; `src/main/telegram/operationErrors.ts:68-75`; `src/main/telegram/governor.ts:136, 146-156`
**Issue:** `floodWaitSeconds()` returns any numeric `err.seconds` before looking at the message. Verified in `node_modules/telegram/errors/RPCErrorList.js`: `SlowModeWaitError`, `FloodTestPhoneWaitError`, and `MsgWaitError` all extend `FloodError` and set `.seconds`. Consequences:
- `SLOWMODE_WAIT_n` etc. are classified as `code: 'FLOOD_WAIT'` — a typed code that misreports the actual condition, in the module whose stated contract is "NO raw Telegram string crosses a layer boundary" precisely so consumers can trust the code.
- The value is not validated: `seconds <= 0` or non-finite flows into the wait path. With `seconds = 0` (also reachable via the governor's `retryAfterSeconds ?? 0` default), `startFloodCountdown(0, …)` can emit `flood-tick` with `remaining: -1`; a negative `seconds` yields a negative `setTimeout` → effectively delay-free retry, which combined with WR-06's unbounded loop becomes a tight retry loop against Telegram.

**Fix:** In `classifyRpcError`, confirm the flood family before trusting `.seconds` (e.g., require `FLOOD_WAIT_`/known wait prefixes on `errorMessage`, or map SLOWMODE_WAIT to its own code at Phase 5), and clamp: treat non-finite or `<= 0` seconds as not-a-wait. In the governor, skip starting the countdown when `seconds === 0`.

### WR-08: SESSION_INVALID → 'fail' means a dead session mid-bulk-job neither hard-stops nor triggers session cleanup outside initialize()

**File:** `src/main/telegram/operationErrors.ts:79-81`; `src/shared/opTypes.ts:14, 57`
**Issue:** Gap-closure 02-04 resolved the prior review's contract contradiction by documenting that SESSION_INVALID maps to `'fail'` ("surface error, continue job"). The residual behavioral risk stands and is now load-bearing for Phase 5: when the session dies mid-job (AUTH_KEY_UNREGISTERED), every remaining per-group call is doomed, yet the executor consuming `'fail'` will keep iterating N groups, issuing N doomed RPCs on a dead auth key. The governor also emits no event for `'fail'` dispositions, and nothing routes an operational dead-session detection back to SessionManager's wipe/idle handling (that only exists inside `initialize()`'s catch).
**Fix:** Record an explicit Phase 5 requirement: the executor must treat SESSION_INVALID as job-fatal (abort remaining groups) and notify SessionManager to wipe + route to login — or revisit the disposition (a dedicated `'session-fail'` or hard-stop with its own code) before Phase 5 builds on `'fail'`.

### WR-09: `SessionManager.restore()` cannot restore anything — contradicts its own documentation

**File:** `src/main/telegram/SessionManager.ts:192-199, 343-351`
**Issue:** `restore()` claims to read "the persisted session string from the secrets store," but `_restoreSession()` reads only the in-memory `_encryptedSession` field, which is always `undefined` on a freshly constructed SessionManager (it is populated only by `_persistSession()` within the same process lifetime). On a new instance, `restore()` always degenerates to `initialize(undefined)` → idle, silently discarding any on-disk session. Production index.ts bypasses it (reads `secretsStore.restoreSession()` directly), so today it is dead code — but it is a loaded API: any future caller following the docstring gets silent session loss.
**Fix:** Delete `restore()`, or inject a `restoreSession(): string | null` callback symmetric to `onSessionPersist` and read from the real store. At minimum, correct the docstring.

## Info

### IN-01: Stale "RED test" headers in all three test files

**File:** `src/main/telegram/SessionManager.test.ts:1-19`; `src/main/telegram/governor.test.ts:1-17`; `src/main/telegram/operationErrors.test.ts:1-14`
**Issue:** All three files still claim the implementations do not exist and the imports "WILL FAIL with 'Cannot find module' — that is the correct RED state." The modules exist and all 19 tests pass. Misleading to future readers.
**Fix:** Rewrite headers to describe what each suite verifies; drop the RED-state narrative.

### IN-02: Governor constructor requires a client it explicitly discards

**File:** `src/main/telegram/governor.ts:35-39, 72-78`
**Issue:** `GovernorOptions.client` is required and `GovernorClient.invoke` is a required method, yet the constructor does `void options.client` and never uses it. Callers (SessionManager, every test) are forced to construct a client solely to satisfy the type. A required-but-unused dependency will confuse Phase 3+ implementers about who actually invokes the client.
**Fix:** Make `client` optional or remove it from `GovernorOptions` until a governor-internal use exists.

### IN-03: Nested `governor.run()` calls deadlock — undocumented footgun for Phase 3+

**File:** `src/main/telegram/governor.ts:89-111`
**Issue:** If a governed `fn` awaits `governor.run(...)` on the same instance, the inner call chains behind the outer one in `_tail` and never starts — permanent deadlock. Current callers are sequential, not nested, so it's latent, but the class doc tells Phase 3+ that "every call funnels through this class" without warning against reentrancy.
**Fix:** Add a prominent doc warning, or detect reentrancy (in-flight flag / AsyncLocalStorage) and throw a descriptive error.

### IN-04: Test name "succeeds on retry 2" — the test succeeds on retry 1

**File:** `src/main/telegram/governor.test.ts:222-244`
**Issue:** The mock fails once and succeeds on the second call (`toHaveBeenCalledTimes(2)`), i.e., success on the FIRST retry. The name misstates coverage.
**Fix:** Rename to "succeeds on first retry," or add a second failing attempt if retry-2 coverage was intended.

### IN-05: Inline `require('electron')` in each storage callback

**File:** `src/main/index.ts:120-131`
**Issue:** Each storage callback does `require('electron')` per invocation. `safeStorage` can be imported at the top alongside `app`/`BrowserWindow`; only its use must be deferred past `ready`, which these callbacks already are (constructed inside `app.whenReady()`). Mixing CJS `require` into the otherwise ESM-style module obscures the dependency.
**Fix:** Add `safeStorage` to the existing top-level electron import and reference it directly.

---

_Reviewed: 2026-06-11T14:04:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
