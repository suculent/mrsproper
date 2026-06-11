---
phase: 02-rate-limit-governor-error-classification
reviewed: 2026-06-11T10:31:41Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/main/index.ts
  - src/main/telegram/SessionManager.ts
  - src/main/telegram/governor.test.ts
  - src/main/telegram/governor.ts
  - src/main/telegram/operationErrors.test.ts
  - src/main/telegram/operationErrors.ts
  - src/shared/opTypes.ts
findings:
  critical: 1
  warning: 8
  info: 5
  total: 14
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-06-11T10:31:41Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the Phase 2 rate-limit governor, RPC error classifier, shared operation types, and the governor wiring into SessionManager / main index. The core invariants hold: PEER_FLOOD is checked before any FLOOD_WAIT parsing (operationErrors.ts:61 precedes :68), jitter is strictly additive (governor.ts:154-155), the 3600s ceiling throws instead of sleeping (governor.ts:139-142), `errorMessage` (not `message`) is the branch field, and the serialization tail-chain is correct (the tail never rejects, so a failed operation cannot wedge the queue). The `floodSleepThreshold: 0` claim in index.ts was verified against GramJS source (`Object.assign` merge + `Math.min(value || 0, 86400)` setter — 0 survives). All 15 phase tests pass.

However: the classifier's SESSION_INVALID disposition contradicts the shared-type contract it claims to implement (hard-stop vs fail — a dead session mid-bulk-job will NOT abort the job), the FLOOD_WAIT detector over-matches any GramJS error carrying a `.seconds` field (SLOWMODE_WAIT, FLOOD_TEST_PHONE_WAIT), governor events are never wired to IPC in production so a launch-time FLOOD_WAIT silently stalls the app for up to an hour, and `tsc -p tsconfig.node.json` fails with three NEW errors introduced by this phase's test file (on top of the known Phase-1 baseline).

Known pre-existing baseline items (Phase 1 tsc errors in authChannels/secrets.test/mocks/authFlow/config/SessionManager unused symbols, 2 failing AUTH-03 config env tests) are excluded per instructions.

## Critical Issues

### CR-01: SESSION_INVALID disposition contradicts the shared contract — dead session mid-job will not hard-stop

**File:** `src/main/telegram/operationErrors.ts:79-81`, contradicted by `src/shared/opTypes.ts:14` and `:57`, and `src/main/telegram/governor.ts:128`
**Issue:** The shared contract that this phase declares as its source of truth (`opTypes.ts:5` — "Plans 02-02 and 02-03 implement against these exact shapes") defines `hard-stop` as "PEER_FLOOD / session-invalid: abort the job immediately" (opTypes.ts:14), and the `hard-stop` GovernorEvent doc says "PEER_FLOOD **or session-invalid** surfaced — job must hard-stop" (opTypes.ts:57). The governor comment repeats this: "PEER_FLOOD or session-invalid — abort immediately" (governor.ts:128). But the classifier maps all `SESSION_INVALID_ERRORS` to `disposition: 'fail'` (operationErrors.ts:80), which `opTypes.ts:13` defines as "unrecoverable but non-fatal: surface error, **continue job**."

Consequences:
1. A session revoked mid-bulk-removal (AUTH_KEY_UNREGISTERED, SESSION_REVOKED) will not emit a `hard-stop` event, so the Phase 5 executor built against the documented contract will continue iterating remaining groups, issuing N more doomed RPC calls with a dead auth key, while the user believes removals are proceeding.
2. The `hard-stop` event's `code: OperationErrorCode` field can in practice only ever be `'PEER_FLOOD'`, making part of the event contract dead.

Semantically, continuing a destructive bulk job after the session dies is wrong for this product regardless of which document wins — every subsequent call fails, and the user needs to re-login. The tests (operationErrors.test.ts:87-97) assert the `'fail'` behavior, so tests and implementation agree with each other but both disagree with the typed contract.

**Fix:** Make session-invalid a hard-stop, matching the contract:
```typescript
// operationErrors.ts
if (SESSION_INVALID_ERRORS.has(errorMessage)) {
  return { code: 'SESSION_INVALID', disposition: 'hard-stop' }
}
```
Update operationErrors.test.ts:87-97 to expect `'hard-stop'`. If `'fail'` is genuinely the intended design, then opTypes.ts:14, opTypes.ts:57, and governor.ts:128 must all be corrected instead — but the abort-on-dead-session semantics are the defensible choice for a bulk destructive tool.

## Warnings

### WR-01: FLOOD_WAIT detection over-matches any error carrying a numeric `.seconds` field

**File:** `src/main/telegram/operationErrors.ts:68` (via `src/main/telegram/floodWait.ts:41-42`)
**Issue:** `floodWaitSeconds()` returns `err.seconds` for ANY error with a numeric `.seconds` property, before ever inspecting `errorMessage`. Verified in GramJS source (`node_modules/telegram/errors/RPCErrorList.js`): `SlowModeWaitError` (SLOWMODE_WAIT_X) and `FloodTestPhoneWaitError` (FLOOD_TEST_PHONE_WAIT_X) also carry `.seconds`. Both would be classified `code: 'FLOOD_WAIT', disposition: 'wait'` and silently slept on by the governor, mislabeled in every emitted event. Additionally, the regex fallback on plain `err.message` means any wrapped/re-thrown error whose message merely *mentions* "FLOOD_WAIT_30" classifies as a flood wait. The classifier header claims to be "the SINGLE translation layer" for all Phase 3+ operations (getParticipants, EditBanned, etc.), where these adjacent error types are reachable.
**Fix:** Require the FLOOD_WAIT code to be present before trusting `.seconds`:
```typescript
// operationErrors.ts — gate on the canonical errorMessage prefix
const waitSeconds =
  errorMessage.startsWith('FLOOD_WAIT') ? floodWaitSeconds(err) : null
```
(or tighten `floodWaitSeconds()` itself to check `errorMessage` starts with `FLOOD_WAIT` before reading `.seconds` — note floodWait.ts is shared with the login path, so gating in operationErrors.ts is the lower-risk change.)

### WR-02: Any error without `errorMessage` is classified NETWORK and retried — masks programming errors

**File:** `src/main/telegram/operationErrors.ts:86-88`, `src/main/telegram/governor.ts:165-183`
**Issue:** Branch 4 treats every error lacking `.errorMessage` as a transient network failure with `disposition: 'retry'`. That includes `TypeError`/`RangeError`/any bug thrown from the caller-supplied `fn` (e.g., `cannot read property of undefined`). The governor will then retry a deterministic programming error 4 times with ~7s of backoff before surfacing it, emitting misleading `retry-attempt` events to the UI, and finally throwing the raw error labeled as if it were network trouble.
**Fix:** Narrow the network branch — e.g., exclude obvious programmer-error types and/or match known network shapes:
```typescript
if (!errorMessage) {
  if (err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError) {
    return { code: 'UNKNOWN', disposition: 'fail' }
  }
  return { code: 'NETWORK', disposition: 'retry' }
}
```

### WR-03: Unbounded consecutive FLOOD_WAIT loop — no cumulative budget or escalation

**File:** `src/main/telegram/governor.ts:134-163`
**Issue:** FLOOD_WAIT retries are explicitly excluded from the transient budget (line 161) and there is no counter or cumulative-wait ceiling for repeated floods on the same operation. The 3600s ceiling (D-12) is per-wait only. If Telegram repeatedly returns sub-ceiling waits (e.g., FLOOD_WAIT_3500 over and over — exactly the pattern when a shared api_id is being throttled, a risk CLAUDE.md calls out), a single `run()` call blocks the entire serialized queue indefinitely, emitting only flood-ticks, with no event that lets Phase 5 or the user abort or distinguish "stuck forever" from "almost done."
**Fix:** Track consecutive flood retries (or cumulative slept seconds) per operation and surface via the existing escape hatch after a bound, e.g.:
```typescript
if (++floodRetries > MAX_FLOOD_RETRIES || (cumulativeWaitS += seconds) > FLOOD_CEILING_S) {
  this._onEvent({ type: 'wait-too-long', seconds })
  throw err
}
```

### WR-04: Governor events are never wired in production — launch-time FLOOD_WAIT silently stalls the app up to 1 hour

**File:** `src/main/index.ts:117-144` (missing `onGovernorEvent`), `src/main/telegram/SessionManager.ts:101` (doc claims "wired to IPC in production")
**Issue:** `SessionManagerOptions.onGovernorEvent` is documented as "wired to IPC in production," but `main/index.ts` constructs SessionManager without it, so every governor event (`flood-tick`, `hard-stop`, `wait-too-long`, `retry-attempt`) is dropped into the `(() => {})` default (governor.ts:77). Combined with this phase's `floodSleepThreshold: 0` change (index.ts:113), a FLOOD_WAIT on `getMe()` during `initialize()` now reaches the governor, which sleeps up to 3600s + jitter — during which no auth state has been emitted and no countdown is visible. The window is already shown (`ready-to-show`), so the user stares at a stuck launch screen for up to an hour with zero feedback. At the Phase 1 baseline (`floodSleepThreshold: 5`), waits >5s threw immediately instead.
**Fix:** Wire the callback in index.ts (and have the renderer at minimum log/display it):
```typescript
onGovernorEvent: (event) => {
  if (!win.isDestroyed()) win.webContents.send('governor:event', event)
},
```
If full UI consumption is deferred to Phase 5, either bound the startup sleep (e.g., treat floods during `initialize()` as dead-session-style "route to idle without wipe") or correct the misleading doc comment and accept/record the stall as a known gap.

### WR-05: `_onEvent` consumer exceptions are unguarded — can replace the classified error or crash the main process

**File:** `src/main/telegram/governor.ts:130, 148, 172-176`
**Issue:** The governor invokes the consumer-supplied `onEvent` callback with no try/catch.
1. Hard-stop path (line 130): if `_onEvent` throws, that exception propagates instead of the original PEER_FLOOD error — the caller receives the consumer's bug and the real abort cause is lost.
2. Flood-tick path (line 148): the callback runs inside a real `setInterval` tick (floodWait.ts:95). A throw there is an uncaught exception in the Electron main process — a crash — and the interval handle is never cleared. The obvious future consumer, `webContents.send` on a window closed mid-countdown, throws exactly this way unless every consumer remembers to guard.
**Fix:** Make emission non-throwing once at the source:
```typescript
private _safeEmit(event: GovernorEvent): void {
  try { this._onEvent(event) } catch { /* consumer bug must not alter governor flow */ }
}
```
and use `_safeEmit` at all four emission sites.

### WR-06: `initialize()` wipes a valid persisted session on ANY transient error — offline launch destroys credentials

**File:** `src/main/telegram/SessionManager.ts:179-189`
**Issue:** The catch block in `initialize()` wipes the session (`_wipeSessionLocally()` → `secretsStore.wipeSession()` in production) for every non-dead-session error, including: `connect()` failure when the machine is offline at launch, and `_fetchIdentity()` failures after the governor's 3-retry NETWORK budget is exhausted (~7s of outage). The result: launching MrProper without internet permanently destroys the encrypted session and forces a full phone+code+2FA re-login. This phase routed `_fetchIdentity` through the governor specifically to harden this path (retries), but the catch-all wipe defeats that hardening for any failure that outlasts the budget — and `connect()` is not governed at all. (Lines pre-date this phase but sit in a reviewed file and directly interact with this phase's retry changes; not on the excluded baseline list.)
**Fix:** Only wipe on confirmed dead sessions; preserve the session on transient failures:
```typescript
} catch (err) {
  if (isDeadSessionError(err)) {
    this._wipeSessionLocally()
    this._emit({ step: 'idle' })
    return
  }
  // Transient (offline, flood, network): keep the persisted session, surface error state
  this._emit({ step: 'error', code: 'NETWORK', retryStep: 'phone' })
}
```

### WR-07: Governor rethrows raw GramJS errors — classification is discarded and callers must re-classify

**File:** `src/main/telegram/governor.ts:131, 141, 168, 187`
**Issue:** Every failure path throws the original raw `err` (containing raw Telegram strings in `message`/`errorMessage`) after computing — and discarding — the `ClassifiedOperationError`. The phase invariant says no raw Telegram strings cross layer boundaries; T-02-06 sanitizes the *event* channel, but the `run()` rejection channel delivers raw GramJS errors. Phase 5 callers must call `classifyRpcError` a second time on every rejection (duplicated work, risk of divergence if the two call sites drift), and any caller that naively forwards `error.message` over IPC leaks raw Telegram strings to the renderer.
**Fix:** Throw a typed error carrying the classification, preserving the original via `cause`:
```typescript
export class GovernorError extends Error {
  constructor(readonly classified: ClassifiedOperationError, cause: unknown) {
    super(`Operation failed: ${classified.code}`, { cause })
  }
}
// in _executeWithPolicy: throw new GovernorError(classified, err)
```

### WR-08: New TypeScript errors introduced by this phase — node project type-check fails on new code

**File:** `src/main/telegram/governor.test.ts:13, 185, 211`
**Issue:** `npx tsc --noEmit -p tsconfig.node.json` reports three errors in this brand-new file (definitionally not part of the known Phase-1 baseline):
- Line 13: TS6196 — `Disposition` imported but never used.
- Lines 185, 211: TS2554 "Expected 0 arguments, but got 1" — `client.invoke({})` called against mocks typed as zero-arg (`vi.fn(async () => {...})`). The `createMockClient` factory has the same flaw (`invokeImpl?: () => Promise<unknown>`, line 43-47) at every `client.invoke({})` call site that happens to dodge inference.
Tests pass at runtime because vitest does not type-check, but the project's stated rationale for TypeScript is "strong typing matters when a typo triggers a destructive `EditBanned` call" — adding new type errors erodes the gate that is supposed to catch that. (Note: the root `tsconfig.json` is solution-style with `files: []`, so a bare `npx tsc --noEmit` reports nothing — anyone verifying with that command gets a false clean.)
**Fix:**
```typescript
import type { GovernorEvent } from '@shared/opTypes' // drop Disposition

function createMockClient(invokeImpl?: (req?: unknown) => Promise<unknown>) { ... }
const invokeMock = vi.fn(async (_req?: unknown) => { throw makePeerFloodError() })
```

## Info

### IN-01: `GovernorOptions.client` is a dead parameter

**File:** `src/main/telegram/governor.ts:35-39, 76`
**Issue:** The constructor accepts a required `client` with a required `invoke()` and immediately discards it (`void options.client`). The governor never invokes the client; callers capture their own reference via closure. Every consumer (SessionManager:135-138, all tests) is forced to supply an unused dependency, and the `GovernorClient` interface implies a contract that does not exist.
**Fix:** Remove `client` from `GovernorOptions` (and the `GovernorClient` interface) until a phase actually needs it, or mark it optional.

### IN-02: `resultPromise.catch(() => {})` silences fire-and-forget failures without any logging

**File:** `src/main/telegram/governor.ts:108`
**Issue:** The pre-attached no-op rejection handler is needed to suppress premature unhandled-rejection warnings under fake timers, but it also means a Phase 5 caller that forgets to await/handle `run()` will have its failure (including hard-stops) vanish with no trace.
**Fix:** Log in the suppression handler (main-process logger or `console.error` until one exists) so dropped rejections leave evidence.

### IN-03: Countdown reaches 0 up to ~5s before the operation actually resumes

**File:** `src/main/telegram/governor.ts:146-156`
**Issue:** The FloodWaitController counts down exactly `seconds` (first tick at `seconds - 1`, reaching 0 at `seconds`), while the governor sleeps `seconds + jitter` (jitter up to 5s). The UI will display "0s remaining" while the queue is still paused for up to 5 more seconds. Also, the initial value `seconds` is never emitted — the first tick lands a full second after the wait starts.
**Fix:** Start the countdown from `Math.ceil(seconds + jitterSeconds)` (compute jitter before starting the countdown), and/or emit an initial tick synchronously.

### IN-04: macOS re-activation creates a window with no auth-state wiring

**File:** `src/main/index.ts:154-158`
**Issue:** The `activate` handler calls `createWindow()` but `emitAuthState`/`onStateChange` remain closed over the original (now destroyed) `win`, and `registerAuthChannels` was bound once to it. The `isDestroyed()` guard in `emitAuthState` prevents a crash, but the re-created window never receives `auth:state` events — the renderer is stuck at its initial state until restart. Pre-existing (Phase 1 lines), noted because the file is in scope and Phase 5 will rely on the same window reference for governor events.
**Fix:** Track the current window in a mutable reference used by both `emitAuthState` and the future governor-event emitter, and re-assign it in the `activate` handler.

### IN-05: Misleading test name — "succeeds on retry 2" succeeds on the first retry

**File:** `src/main/telegram/governor.test.ts:222-244`
**Issue:** The mock fails once and succeeds on the second call, i.e., the first retry (`expect(invokeMock).toHaveBeenCalledTimes(2)`), not "retry 2." The name will mislead anyone using it to reason about the retry budget.
**Fix:** Rename to "transient error that succeeds on the first retry resolves successfully."

---

_Reviewed: 2026-06-11T10:31:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
