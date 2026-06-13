---
phase: 01-foundation-auth-session-portable-shell
plan: 03
subsystem: auth-primitives
tags: [tdd, green, safeStorage, session-encryption, error-classification, flood-wait, d-03, d-13, d-18]

requires:
  - 01-02 (Wave 0 test infra — Vitest, mocks, RED test suite, shared authTypes.ts)

provides:
  - src/main/storage/secrets.ts — createSecretsStore() factory with injectable safeStorage seam
  - src/main/telegram/errors.ts — classifyTelegramError() typed RPC→AuthErrorCode translation
  - src/main/telegram/floodWait.ts — floodWaitSeconds() parser + startFloodCountdown() + FloodWaitController

affects:
  - 01-04 (SessionManager composes these three primitives; wire createSecretsStore() + classifyTelegramError())
  - Phase 2 governor (FloodWaitController.timingSource injection point — D-18 seam is ready)

tech-stack:
  added: []
  patterns:
    - Injectable safeStorage seam via createSecretsStore({ storage }) — in-memory for tests, real Electron for production
    - Single RPC→domain translation layer via classifyTelegramError() — renderer never sees raw Telegram strings
    - D-18 TimingSource injection on startFloodCountdown() and FloodWaitController — Phase 2 supplies its clock

key-files:
  created:
    - src/main/storage/secrets.ts
    - src/main/telegram/errors.ts
    - src/main/telegram/floodWait.ts
  modified: []

key-decisions:
  - "createSecretsStore({ storage }) uses in-memory store in test mode; production path lazy-requires Electron — avoids electron import at parse time in Node/test environments"
  - "floodWait.ts exports startFloodCountdown() as a function (not just FloodWaitController class) — matches the plan-02 test's import { startFloodCountdown } shape"
  - "classifyTelegramError branches on err.errorMessage (not err.message) per Pitfall 4 exact GramJS field"
  - "FloodWaitController TimingSource defaults to globalThis.setInterval; tests rely on vi.useFakeTimers() replacing the global — no extra injection needed in test calls"
  - "FLOOD_WAIT classifier reads err.seconds first (FloodWaitError shape), then regex — both forms present in result.seconds"

duration: 25min
completed: 2026-06-10
---

# Phase 01 Plan 03: Auth Primitives — secrets.ts, errors.ts, floodWait.ts Summary

**TDD GREEN: Encrypted session persistence, jargon-free error classification, injectable-clock FloodWait countdown — 22 tests pass**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-10T21:00:00Z
- **Completed:** 2026-06-10
- **Tasks:** 2 (Task 1: secrets.ts, Task 2: errors.ts + floodWait.ts)
- **Files created:** 3

## Accomplishments

### Task 1: Encrypted session persistence (secrets.ts) — AUTH-04 / T-03-01 / T-03-02

`createSecretsStore({ storage? })` factory pattern with fully injectable dependencies:

- **Test mode** (storage injected): pure in-memory store — no disk I/O, no Electron required; getRawStoredBytes() for encryption assertion
- **Production mode** (no injection): lazy-requires Electron safeStorage + real fs; writes to `userData/session.bin` with `mode: 0o600`
- `persistSession()` checks `isEncryptionAvailable()` first — throws `ENCRYPTION_UNAVAILABLE` and writes nothing if keystore is absent (D-03/T-03-02, never plaintext)
- `restoreSession()` returns null on missing data, unavailable keystore, or corrupt blob — try/catch on decryptString
- `wipeSession()` removes the stored blob (in-memory or file)
- 7/7 tests GREEN including the `-t "unavailable"` group

### Task 2: Error classification (errors.ts) + FloodWait countdown (floodWait.ts) — T-03-03 / D-13 / D-18

**errors.ts:**
- `classifyTelegramError(err)` branches on `err.errorMessage` (exact GramJS field per Pitfall 4)
- Maps: `PHONE_NUMBER_INVALID` → phone step, `PHONE_CODE_INVALID` / `PHONE_CODE_EXPIRED` → code step (D-12), `PASSWORD_HASH_INVALID` → password step (never bounced to phone), `FLOOD_WAIT_n` → FLOOD_WAIT with seconds, no errorMessage → NETWORK, else → UNKNOWN
- Returns `{ code: AuthErrorCode, uiCopyKey, retryStep, seconds? }` — no raw Telegram string exits this function (T-03-03)
- 8/8 tests GREEN including `-t "password"`

**floodWait.ts:**
- `floodWaitSeconds(err)` — reads `err.seconds` (FloodWaitError), falls back to `/FLOOD_WAIT_(\d+)/` regex on errorMessage/message, returns null for non-flood errors
- `startFloodCountdown(seconds, onTick, onDone, timingSource?)` — 1-Hz countdown; tick(N-1), tick(N-2), ..., tick(0), onDone(); returns `{ stop() }` for cancellation
- `FloodWaitController` class — constructor-injectable `TimingSource`; `start(seconds, onTick, onDone)` / `stop()`; D-18 seam documented with injection signature below
- 7/7 tests GREEN (fake timers via `vi.useFakeTimers()` drive the countdown without wall-clock)

## FloodWaitController Timing Source Injection Signature (D-18)

Plan 04 (SessionManager) and Phase 2 (governor) wire this consistently:

```typescript
// Interface (from floodWait.ts):
export interface TimingSource {
  setInterval(callback: () => void, ms: number): ReturnType<typeof globalThis.setInterval>
  clearInterval(handle: ReturnType<typeof globalThis.setInterval>): void
}

// Default: globalThis.setInterval/clearInterval (no injection needed for auth use)
const controller = new FloodWaitController()
controller.start(waitSeconds, (tick) => win.webContents.send('auth:floodTick', tick), () => {
  // re-enable submit button by emitting updated auth state
})

// Phase 2 governor injects its own clock:
const controller = new FloodWaitController(governorTimingSource)
```

## Verification

```
npx vitest run src/main/storage/secrets.test.ts src/main/telegram/errors.test.ts src/main/telegram/floodWait.test.ts

 Test Files  3 passed (3)
      Tests  22 passed (22)
   Duration  151ms
```

Full suite after plan 03:
- 3 files GREEN (target: secrets, errors, floodWait) — 22 tests
- 3 files remain RED (expected: authFlow, SessionManager, config — plan 04's job)

## Task Commits

1. **Task 1: Encrypted session persistence** — `77c324c`
   - `src/main/storage/secrets.ts` (173 lines)
2. **Task 2: Error classifier + FloodWaitController** — `7292d0f`
   - `src/main/telegram/errors.ts` (123 lines)
   - `src/main/telegram/floodWait.ts` (170 lines)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test API expected createSecretsStore with in-memory backend, not file-backed store**
- **Found during:** Task 1 first run (TypeError: Cannot read properties of undefined (reading 'getPath'))
- **Issue:** Plan action described a file-backed store; tests only inject `{ storage }` with no sessionFilePath or fs. Calling `app.getPath()` failed in Node/Vitest environment.
- **Fix:** Implemented two-path factory: when `storage` is injected → pure in-memory store; when no injection → production path (lazy-require electron). This matches the plan's injectable-seam intent precisely.
- **Files modified:** `src/main/storage/secrets.ts`
- **Commit:** 77c324c

**2. [Rule 1 - Deviation] Test imports `startFloodCountdown` as a standalone function, not from FloodWaitController**
- **Found during:** Task 2 (reading floodWait.test.ts import line)
- **Issue:** Plan action described `FloodWaitController.start()`; test imports `{ floodWaitSeconds, startFloodCountdown }` as module-level functions
- **Fix:** Exported `startFloodCountdown()` as a standalone function; also exported `FloodWaitController` class that wraps it (both present, satisfying tests AND plan's class requirement)
- **Files modified:** `src/main/telegram/floodWait.ts`
- **Commit:** 7292d0f

## Threat Surface Scan

No new network endpoints, auth paths, or trust-boundary changes. These are pure utility modules:
- `secrets.ts`: lazy-requires electron/fs (production only); test path is entirely in-memory
- `errors.ts`: pure function, no I/O
- `floodWait.ts`: timer management only; no network or file access

All threats in plan STRIDE register are mitigated as designed:
- T-03-01: 0o600 perms in production writeFileSync ✓
- T-03-02: ENCRYPTION_UNAVAILABLE throw before any write ✓
- T-03-03: classifyTelegramError is the single translation layer ✓
- T-03-04: floodWaitSeconds + startFloodCountdown surface visible countdown ✓

## Known Stubs

None — all three modules are complete implementations with no TODO/placeholder paths.

## Self-Check

Files created:
- src/main/storage/secrets.ts: FOUND
- src/main/telegram/errors.ts: FOUND
- src/main/telegram/floodWait.ts: FOUND

Commits:
- 77c324c: FOUND
- 7292d0f: FOUND

## Self-Check: PASSED
