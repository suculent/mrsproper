---
phase: 02-rate-limit-governor-error-classification
fixed_at: 2026-06-11T16:38:00Z
review_path: .planning/phases/02-rate-limit-governor-error-classification/02-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 9
skipped: 1
status: partial
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-06-11T16:38:00Z
**Source review:** .planning/phases/02-rate-limit-governor-error-classification/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (1 Critical, 9 Warning; fix_scope = critical_warning, 5 Info findings excluded)
- Fixed: 9
- Skipped: 1

**Regression check (vs. stated baselines):**
- `npx vitest run`: 78 passed / 2 failed — the 2 failures are the known pre-existing AUTH-03 env-injection cases in `config.test.ts` (baseline was 72/74; +6 new tests added by these fixes, all passing).
- `tsc --noEmit -p tsconfig.node.json`: 8 errors remaining (baseline was 14) — all 6 in-scope errors fixed; the 8 remaining are the documented out-of-scope baseline (authChannels.ts, secrets.test.ts, authFlow.ts, config.ts).

## Fixed Issues

### CR-01: Offline or transient-error launch destroys a valid persisted session

**Files modified:** `src/main/telegram/SessionManager.ts`, `src/main/telegram/__mocks__/telegramClient.ts`, `src/main/telegram/SessionManager.test.ts`
**Commit:** a693c13
**Applied fix:** `initialize()` now wipes the session ONLY on dead-session errors (and the explicit `!isAuthorized` branch); any other error (offline launch, network failure, FLOOD_WAIT propagated from `_fetchIdentity`) routes to idle WITHOUT wiping. Added `connectPlainError` to the mock (plain Error with no `errorMessage` field, as the review requested) and a new test: "transient error: plain network error on connect → session NOT wiped, routes to idle".

### WR-01: In-scope files fail strict typecheck (6 errors)

**Files modified:** `src/main/telegram/SessionManager.ts`, `src/main/telegram/SessionManager.test.ts`, `package.json`
**Commit:** d991d5f
**Applied fix:** `new Api.auth.LogOut({})` → `new Api.auth.LogOut()` (no constructor arg per installed d.ts); removed unused `SecretsStore` and `floodWaitSeconds`/`FloodWaitController` imports and the dead `_floodController` field + construction; trimmed test imports to `{ describe, it, expect }`; updated the now-inaccurate composition doc header; added `"typecheck": "tsc --noEmit -p tsconfig.node.json"` script to package.json so this regression class is caught going forward.

### WR-02: Production CSP may never be applied — file:// loads bypass header injection

**Files modified:** `electron.vite.config.ts`, `src/main/index.ts`
**Commit:** 46af66c
**Applied fix:** Added an `injectProductionCsp()` Vite plugin (renderer, `apply: 'build'` only) that bakes the strict CSP into the built `index.html` as a `<meta http-equiv="Content-Security-Policy">` tag; the dev server keeps the relaxed header-based CSP untouched (HMR needs unsafe-inline/unsafe-eval). Verified by running `electron-vite build` — the meta tag is present in `out/renderer/index.html` with the full strict policy. Cross-reference comments added in both files to keep the two CSP strings in sync.

### WR-03: macOS re-activation creates a window never wired to SessionManager state

**Files modified:** `src/main/index.ts`
**Commit:** 393d39d
**Applied fix:** `const win` → `let currentWin`; the `activate` handler now reassigns `currentWin = createWindow()`, and `onStateChange` (plus the WR-04 governor bridge) emit to `currentWin`, so push events follow the live window across macOS re-activation.

### WR-04: onGovernorEvent never wired in production — FLOOD_WAIT is an invisible hang

**Files modified:** `src/main/index.ts`, `src/shared/channels.ts`
**Commit:** b455de0
**Applied fix:** Added `OP_GOVERNOR_EVENT = 'op:governorEvent'` channel constant (and CHANNELS entry); index.ts now passes `onGovernorEvent` which logs every typed GovernorEvent in main (`console.log('[governor]', …)`) AND forwards it to the renderer via `currentWin.webContents.send(OP_GOVERNOR_EVENT, event)`. Flood pauses are now both diagnosable in main and deliverable to the Phase 5 UI.

### WR-05: D-17 logout wipe deferred behind the governor's serial queue

**Files modified:** `src/main/telegram/SessionManager.ts`
**Commit:** c405619
**Applied fix:** `logout()` now races the governed `auth.LogOut` revocation against a bounded deadline (`LOGOUT_REVOKE_TIMEOUT_MS = 10s`, timer cleared after the race); the disconnect + local wipe + idle emit run unconditionally after the race. A logout stuck behind a mid-FLOOD_WAIT tail now reports `serverRevoked: false` after 10s and wipes anyway, restoring D-17's "local wipe ALWAYS happens" promptly. The revoke promise is settled-handled on both paths so a late rejection cannot become an unhandled rejection. (The alternative governor `abort()` API is Phase 5 scope — see WR-06.)

### WR-06: Governor FLOOD_WAIT retries unbounded with no cancellation

**Files modified:** `src/main/telegram/governor.ts`, `src/main/telegram/governor.test.ts`
**Commit:** 6e7c679
**Applied fix:** Added `MAX_FLOOD_WAITS_PER_OP = 3` — a single operation absorbs at most 3 FLOOD_WAIT sleeps; exceeding the budget emits a `wait-too-long` event and re-throws, so one pathological call can no longer starve the serialized pipeline (or logout) forever. New test verifies 1 initial attempt + 3 budgeted retries = 4 calls then rejection with a `wait-too-long` event. **Partial deferral:** the `AbortSignal`/`abort()` cancellation lever the review also suggested is deliberately deferred to Phase 5 (job-abort API) and documented as such in the constant's doc comment — the budget is the Phase 2 safety net.

### WR-07: floodWaitSeconds over-matches — any FloodError-family error with .seconds typed as FLOOD_WAIT, value unvalidated

**Files modified:** `src/main/telegram/operationErrors.ts`, `src/main/telegram/operationErrors.test.ts`, `src/main/telegram/governor.ts`
**Commit:** d76ff33
**Applied fix (adapted from review suggestion):** Added `isFloodWaitShaped()` guard in `classifyRpcError` plus clamping (`Number.isFinite(seconds) && seconds > 0`); the governor also skips starting the countdown when `seconds <= 0` (the `?? 0` default path). **Important adaptation:** the review suggested requiring a `FLOOD_WAIT_` prefix on `errorMessage`, but inspection of the installed `telegram@2.26.22` shows real `FloodWaitError` instances carry a PROSE `errorMessage` ("A wait of N seconds is required (caused by …)"), NOT `FLOOD_WAIT_n` — a literal prefix check would have broken classification of real GramJS errors. The implemented guard accepts `constructor.name === 'FloodWaitError'` OR a `\bFLOOD_WAIT(_\d+)?\b` token in errorMessage/message ("FLOOD_WAIT" is not a substring of "SLOWMODE_WAIT_n" or "FLOOD_TEST_PHONE_WAIT_n", so no over-match). 4 new tests: SLOWMODE_WAIT_22 → fail not wait; seconds=0 → not wait; negative seconds → not wait; real-GramJS-shaped FloodWaitError (prose message + class name) → wait with retryAfterSeconds=42.

### WR-09: SessionManager.restore() cannot restore anything

**Files modified:** `src/main/telegram/SessionManager.ts`, `src/main/index.ts`
**Commit:** 7b6e2f4
**Applied fix:** Added the review's suggested `restoreSession?: () => string | null` constructor option, symmetric to `onSessionPersist`. `_restoreSession()` now reads the durable store first (with a try/catch fallback to the in-memory mirror), and index.ts wires `restoreSession: () => secretsStore.restoreSession()`. `restore()`'s docstring corrected to describe actual behavior. index.ts's existing direct `initialize(savedSession)` launch path is unchanged (it needs the raw string earlier, to construct StringSession), but `restore()` is no longer a loaded API for future callers.

## Skipped Issues

### WR-08: SESSION_INVALID → 'fail' means a dead session mid-bulk-job neither hard-stops nor triggers session cleanup

**File:** `src/main/telegram/operationErrors.ts:79-81`; `src/shared/opTypes.ts:14, 57`
**Reason:** Deferred to Phase 5 per workflow context — the review's own fix is "Record an explicit Phase 5 requirement: the executor must treat SESSION_INVALID as job-fatal (abort remaining groups) and notify SessionManager to wipe + route to login", and the orchestrator confirms this requirement is already recorded as a Phase 5 item. Implementing a job-abort/executor-notification path now would half-build cross-phase architecture before the Phase 5 executor exists. The disposition decision ('fail' vs a dedicated 'session-fail'/hard-stop code) must be revisited when Phase 5 builds on it.
**Original issue:** When the session dies mid-job (AUTH_KEY_UNREGISTERED), every remaining per-group call is doomed, yet an executor consuming 'fail' would keep iterating N groups on a dead auth key; nothing routes operational dead-session detection back to SessionManager's wipe/idle handling outside initialize().

## Verification Notes

- Every fix passed Tier 1 (re-read) and Tier 2 (targeted vitest suite and/or `tsc --noEmit -p tsconfig.node.json`) verification before commit; WR-02 additionally verified with a full `electron-vite build` confirming the CSP meta tag in the built HTML.
- Logic-bearing changes (CR-01 wipe condition, WR-05 logout race, WR-06 flood budget, WR-07 shape guard) are covered by new/existing unit tests, but reviewers should confirm the WR-05 10s revocation deadline and the WR-06 budget of 3 match product expectations: **fixed: requires human verification** for those two thresholds (the mechanisms are tested; the chosen constants are judgment calls).
- No regressions: test suite 78/80 (same 2 pre-existing AUTH-03 baseline failures), tsc 8 errors (all from the documented out-of-scope baseline, down from 14).

---

_Fixed: 2026-06-11T16:38:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
