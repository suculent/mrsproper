# Phase 2: Rate-Limit Governor & Error Classification - Pattern Map

**Mapped:** 2026-06-11
**Files analyzed:** 6 (3 new source files, 2 new test files, 2 modified files)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/main/telegram/governor.ts` | service | event-driven + request-response | `src/main/telegram/floodWait.ts` (FloodWaitController) + `src/main/telegram/SessionManager.ts` | role-match + pattern-reuse |
| `src/main/telegram/operationErrors.ts` | utility | transform | `src/main/telegram/errors.ts` (classifyTelegramError) | exact-role |
| `src/shared/opTypes.ts` | model | — | `src/shared/authTypes.ts` (AuthErrorCode, FloodTick) | exact-role |
| `src/main/telegram/governor.test.ts` | test | event-driven + fake-timers | `src/main/telegram/floodWait.test.ts` | exact-role |
| `src/main/telegram/operationErrors.test.ts` | test | transform | `src/main/telegram/errors.test.ts` | exact-role |
| `src/main/telegram/SessionManager.ts` (modified) | service | request-response | itself — targeted additions only | self |
| `src/main/index.ts` (modified) | config | — | itself — one-line `floodSleepThreshold` change | self |

---

## Pattern Assignments

### `src/main/telegram/governor.ts` (service, event-driven)

**Primary analog:** `src/main/telegram/floodWait.ts`
**Secondary analog:** `src/main/telegram/SessionManager.ts`

**Imports pattern** (analog: `floodWait.ts` lines 24, 58–61; `SessionManager.ts` lines 27–33):
```typescript
import type { FloodTick } from '@shared/authTypes'
import { FloodWaitController, floodWaitSeconds, TimingSource } from './floodWait'
// opTypes imported once written:
import type { Disposition, OperationErrorCode } from '@shared/opTypes'
```
The project uses `@shared` path alias (defined in `vitest.config.ts` and `electron.vite.config.ts`) for all shared-type imports. Import from `'./floodWait'` directly — no barrel index exists.

**Injectable constructor pattern** (analog: `floodWait.ts` lines 126–131, `SessionManager.ts` lines 102–129):
```typescript
// FloodWaitController (floodWait.ts lines 126–131):
export class FloodWaitController {
  private readonly _timing: TimingSource
  private _stopFn: (() => void) | null = null

  constructor(timingSource: TimingSource = DEFAULT_TIMING) {
    this._timing = timingSource
  }
  // ...
}

// SessionManager constructor shape (SessionManager.ts lines 102–129):
export class SessionManager {
  private readonly _client: SessionManagerClient
  private readonly _floodController: FloodWaitController
  // ...
  constructor(options: SessionManagerOptions) {
    this._client = options.client
    // ...
    this._floodController = new FloodWaitController()
  }
}
```
Copy this pattern: governor receives `client`, optional `TimingSource`, and optional event callback via a typed options object or direct constructor params. Construct `FloodWaitController` with the injected `TimingSource` so tests can drive fake timers.

**Typed options/client interface pattern** (analog: `SessionManager.ts` lines 49–98):
```typescript
// SessionManager.ts lines 49–73 — minimal injectable client surface:
export interface SessionManagerClient {
  connect(): Promise<void>
  disconnect(): Promise<void>
  checkAuthorization(): Promise<boolean>
  // ...
  invoke(request: unknown): Promise<unknown>
  getMe(): Promise<{ firstName: string; ... }>
  downloadProfilePhoto(entity: unknown): Promise<Buffer | Uint8Array | null>
  session: { save(): string }
}

// SessionManager.ts lines 84–98 — options bag:
export interface SessionManagerOptions {
  client: SessionManagerClient
  storage: SessionManagerStorage
  onStateChange: (state: AuthState) => void
  onSessionWipe?: () => void
  onSessionPersist?: (sessionString: string) => void
  apiCreds?: { apiId: number; apiHash: string }
}
```
The governor should define its own minimal `GovernorClient` interface (just `invoke`) and receive an `onEvent` callback the same way `onStateChange` is passed — typed, optional, constructor-injected.

**Private helper naming convention** (analog: `SessionManager.ts` lines 302–367):
```typescript
private _persistSession(sessionString: string): void { ... }
private _restoreSession(): string | null { ... }
private _wipeSessionLocally(): void { ... }
private async _fetchIdentity(): Promise<Identity> { ... }
```
All private methods are prefixed with `_`. Follow this exactly.

**Dead-session / errorMessage branching pattern** (analog: `SessionManager.ts` lines 36–45):
```typescript
const DEAD_SESSION_ERRORS = new Set([
  'AUTH_KEY_UNREGISTERED',
  'SESSION_REVOKED',
  'AUTH_KEY_DUPLICATED',
])

function isDeadSessionError(err: unknown): boolean {
  const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
  return DEAD_SESSION_ERRORS.has(msg)
}
```
The governor's `classifyRpcError` call follows the same `(err as { errorMessage?: string })?.errorMessage ?? ''` extraction — never branch on `err.message`.

**FloodWaitController.start() call shape** (analog: `floodWait.ts` lines 137–149):
```typescript
start(
  seconds: number,
  onTick: (tick: FloodTick) => void,
  onDone: () => void
): void {
  this.stop()
  const { stop } = startFloodCountdown(
    seconds,
    (remaining) => onTick({ remaining }),
    onDone,
    this._timing
  )
  this._stopFn = stop
}
```
The governor passes its event callback wrapped to emit `{ type: 'flood-tick', remaining }`. The `FloodWaitController` already converts the bare `remaining: number` into a `FloodTick` object — no reshaping needed at the call site.

**try/finally pattern for cleanup** (analog: `SessionManager.ts` lines 277–298):
```typescript
async logout(): Promise<LogoutResult> {
  let serverRevoked = false
  try {
    await this._client.invoke(new Api.auth.LogOut({}))
    serverRevoked = true
  } catch {
    serverRevoked = false
  } finally {
    try {
      await this._client.disconnect()
    } catch {
      // Best-effort disconnect — don't let this block the wipe
    }
    this._connected = false
    this._wipeSessionLocally()
    this._emit({ step: 'idle' })
  }
  return { serverRevoked }
}
```
The governor's retry loop uses the same try/catch-in-a-loop structure; error handling never swallows unexpectedly — it classifies first, then decides to throw or continue.

---

### `src/main/telegram/operationErrors.ts` (utility, transform)

**Analog:** `src/main/telegram/errors.ts` (exact role match)

**File header comment pattern** (analog: `errors.ts` lines 1–17):
```typescript
/**
 * Telegram error classification (T-03-03 / UI-SPEC Copywriting Contract).
 *
 * classifyTelegramError() is the SINGLE translation layer between raw GramJS RPCErrors
 * and the typed AuthErrorCode domain. NO raw Telegram string reaches the renderer UI.
 *
 * Every RPCError maps to:
 *   - code:      typed AuthErrorCode from src/shared/authTypes.ts
 *   ...
 */
```
`operationErrors.ts` needs the same documentation contract in the header: what function it exports, what it maps FROM and TO, and which RESEARCH pitfalls it protects against.

**Imports pattern** (analog: `errors.ts` lines 19):
```typescript
import type { AuthErrorCode } from '@shared/authTypes'
```
For `operationErrors.ts`:
```typescript
import type { OperationErrorCode, Disposition, ClassifiedOperationError } from '@shared/opTypes'
import { floodWaitSeconds } from './floodWait'
```

**Result type pattern** (analog: `errors.ts` lines 22–32):
```typescript
export interface ClassifiedError {
  /** Typed error code — never a raw Telegram string. */
  code: AuthErrorCode
  /** UI copy key — renderer looks this up in its copy table; NO jargon. */
  uiCopyKey: string
  /** Which auth step to remain on after this error (D-12). */
  retryStep: 'phone' | 'code' | 'password'
  /** Seconds to wait — only present for FLOOD_WAIT errors. */
  seconds?: number
}
```
The operation classifier result type is analogous:
```typescript
export interface ClassifiedOperationError {
  code: OperationErrorCode
  disposition: Disposition
  retryAfterSeconds?: number  // only for 'wait' disposition
}
```

**Classifier function signature and errorMessage extraction** (analog: `errors.ts` lines 59–63):
```typescript
export function classifyTelegramError(err: unknown): ClassifiedError {
  const errorMessage: string =
    (err as { errorMessage?: string })?.errorMessage ?? ''
  // ...
}
```
Copy this exactly. `classifyRpcError` must extract `errorMessage` the same way — never use `err.message`.

**Branch order pattern** (analog: `errors.ts` lines 65–133):
```typescript
// 1. Exact string matches first (Pitfall 4 — errorMessage, not message)
if (errorMessage === 'PHONE_NUMBER_INVALID') { ... }
if (errorMessage === 'PHONE_CODE_INVALID') { ... }
// ...

// 2. Pattern match (FLOOD_WAIT_n)
const floodMatch = /FLOOD_WAIT_(\d+)/.exec(errorMessage)
if (floodMatch) {
  const seconds =
    typeof (err as { seconds?: number })?.seconds === 'number'
      ? (err as { seconds: number }).seconds
      : Number(floodMatch[1])
  return { code: 'FLOOD_WAIT', ... seconds }
}

// 3. No errorMessage → network/connection failure
if (!errorMessage) { return { code: 'NETWORK', ... } }

// 4. Unmapped → UNKNOWN
return { code: 'UNKNOWN', ... }
```
For `classifyRpcError`, the branch order is:
1. `errorMessage === 'PEER_FLOOD'` → `hard-stop` (BEFORE flood-wait check — Pitfall 1 in RESEARCH)
2. `err instanceof errors.FloodWaitError` or `floodWaitSeconds(err) !== null` → `wait`
3. Session-invalid errorMessages (`AUTH_KEY_UNREGISTERED`, `SESSION_REVOKED`, etc.) → `fail`
4. Network/no errorMessage → `retry`
5. Unmapped RPCError → `fail`

Note: `floodWaitSeconds()` from `floodWait.ts` is the shared primitive for step 2 (D-03 — do not rewrite the regex).

**Constants block pattern** (analog: `errors.ts` lines 38–46):
```typescript
const COPY_KEYS = {
  PHONE_NUMBER_INVALID: 'auth.error.phoneNumberInvalid',
  // ...
} as const
```
For `operationErrors.ts`, use a similar const Set for session-invalid codes (mirrors `DEAD_SESSION_ERRORS` in `SessionManager.ts` lines 36–40):
```typescript
const SESSION_INVALID_ERRORS = new Set([
  'AUTH_KEY_UNREGISTERED',
  'SESSION_REVOKED',
  'AUTH_KEY_DUPLICATED',
  'AUTH_KEY_INVALID',
])
```

---

### `src/shared/opTypes.ts` (model)

**Analog:** `src/shared/authTypes.ts` (exact role match)

**File header pattern** (analog: `authTypes.ts` lines 1–4):
```typescript
// Shared types imported by both main and renderer.
// Single source of truth for auth state, IPC DTOs, and error codes.
// Plans 03/04/05 implement against these exact shapes.
```

**Typed union / string literal type pattern** (analog: `authTypes.ts` lines 17–25):
```typescript
// authTypes.ts — string literal union type for error codes:
export type AuthErrorCode =
  | 'PHONE_NUMBER_INVALID'
  | 'PHONE_CODE_INVALID'
  | 'PHONE_CODE_EXPIRED'
  | 'PASSWORD_HASH_INVALID'
  | 'FLOOD_WAIT'
  | 'NETWORK'
  | 'UNKNOWN'
```
`opTypes.ts` uses the same pattern for both `OperationErrorCode` and `Disposition`:
```typescript
export type Disposition = 'wait' | 'retry' | 'skip' | 'fail' | 'hard-stop'

export type OperationErrorCode =
  | 'FLOOD_WAIT'
  | 'PEER_FLOOD'
  | 'SESSION_INVALID'
  | 'NETWORK'
  | 'UNKNOWN'
  // Phase 5 extends this with: USER_PRIVACY_RESTRICTED, CHAT_ADMIN_REQUIRED, etc.
```

**Interface pattern** (analog: `authTypes.ts` lines 5–14, `FloodTick` lines 12–14):
```typescript
// authTypes.ts lines 5–14:
export interface Identity {
  name: string
  username: string | null
  id: string
  avatar: Uint8Array | null
}

export interface FloodTick {
  remaining: number
}
```
`opTypes.ts` needs analogous interfaces for the governor's event payloads and the classified error result — flat, typed, no raw strings.

**No barrel/index file** — the project imports shared types directly from the file (`@shared/authTypes`, `@shared/channels`). `opTypes.ts` is imported as `@shared/opTypes`.

---

### `src/main/telegram/governor.test.ts` (test, fake-timers)

**Analog:** `src/main/telegram/floodWait.test.ts` (closest: fake-timers + countdown events)
**Secondary analog:** `src/main/telegram/errors.test.ts` (error helper shape)

**File header / RED annotation pattern** (analog: `floodWait.test.ts` lines 1–17):
```typescript
/**
 * RED tests for floodWait.ts (D-13: FLOOD_WAIT countdown).
 * These tests import the NOT-YET-EXISTING implementation by its exact intended path.
 * They WILL FAIL with "Cannot find module" — that is the correct RED state.
 * Plans 03/04 turn them GREEN by implementing the actual floodWait module.
 *
 * Test map (01-RESEARCH §Validation Architecture + §Pattern 5):
 *   - FLOOD_WAIT_x parsed via .seconds and message regex
 *   - countdown ticks emitted with fake timers
 *   - submit re-enabled at 0 (D-13)
 */
```

**Imports pattern** (analog: `floodWait.test.ts` lines 13–17):
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
// import the module under test:
import { RateLimitGovernor } from './governor'
```
No `beforeEach` in the flood test — only `afterEach` for `vi.useRealTimers()`. Follow the same minimal import set.

**Fake-timers setup/teardown pattern** (analog: `floodWait.test.ts` lines 54–98):
```typescript
describe('startFloodCountdown — tick emission (D-13)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits one tick per second counting down from N to 1, then calls onDone at 0', async () => {
    vi.useFakeTimers()
    const ticks: number[] = []
    let doneCalled = false

    startFloodCountdown(3, (remaining) => ticks.push(remaining), () => { doneCalled = true })

    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(1000)

    expect(ticks).toEqual([2, 1, 0])
    expect(doneCalled).toBe(true)
  })
  // ...
})
```
`governor.test.ts` uses the same structure: `vi.useFakeTimers()` inside each test, `afterEach(() => vi.useRealTimers())`, and `vi.advanceTimersByTime()` to drive the FLOOD_WAIT sleep and retry backoff without real waits.

**Error helper factory pattern** (analog: `errors.test.ts` lines 20–28, `floodWait.test.ts` lines 20–28):
```typescript
// errors.test.ts lines 20–28:
function makeRPCError(
  errorMessage: string,
  seconds?: number
): Error & { errorMessage: string; seconds?: number } {
  const err = new Error(errorMessage) as Error & { errorMessage: string; seconds?: number }
  err.errorMessage = errorMessage
  if (seconds !== undefined) err.seconds = seconds
  return err
}

// floodWait.test.ts lines 20–28:
function makeFloodError(seconds: number): Error & { errorMessage: string; seconds: number } {
  const err = new Error(`FLOOD_WAIT_${seconds}`) as Error & {
    errorMessage: string
    seconds: number
  }
  err.errorMessage = `FLOOD_WAIT_${seconds}`
  err.seconds = seconds
  return err
}
```
`governor.test.ts` needs both of these helpers. Add a `makePeerFloodError()` variant too:
```typescript
function makePeerFloodError(): Error & { errorMessage: string } {
  const err = new Error('PEER_FLOOD') as Error & { errorMessage: string }
  err.errorMessage = 'PEER_FLOOD'
  return err
}
```

**Mock client usage pattern** (analog: `src/main/telegram/__mocks__/telegramClient.ts` lines 80–187):
```typescript
// Create a configurable mock via factory:
export function createMockTelegramClient(config: MockClientConfig = {}) {
  const client = {
    invoke: async (request: unknown): Promise<unknown> => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      if (ctorName === 'LogOut' || ...) {
        if (config.logoutError) throw config.logoutError
        return { futureAuthToken: null }
      }
      return {}
    },
    // ...
  }
  return client
}
```
`governor.test.ts` does NOT import the auth mock directly — it creates a simpler inline mock with just `invoke: vi.fn()` that can be configured to throw or resolve on demand. The existing mock is too auth-specific (signIn, sendCode) for the governor tests.

**describe block structure** (analog: `errors.test.ts` lines 30–79):
```typescript
describe('classifyTelegramError — error code mapping', () => {
  it('PHONE_CODE_INVALID → AuthErrorCode.PHONE_CODE_INVALID', () => { ... })
  it('FLOOD_WAIT_x → AuthErrorCode.FLOOD_WAIT, preserves seconds', () => { ... })
  it('unknown RPC error → AuthErrorCode.UNKNOWN', () => { ... })
  it('network/generic error (no errorMessage) → AuthErrorCode.NETWORK', () => { ... })
})
```
Use the same flat `describe` → `it` layout. One describe per behavior cluster: serialization, FLOOD_WAIT handling, PEER_FLOOD, transient retry, D-12 ceiling.

---

### `src/main/telegram/operationErrors.test.ts` (test, transform)

**Analog:** `src/main/telegram/errors.test.ts` (exact match)

**Imports pattern** (analog: `errors.test.ts` lines 13–17):
```typescript
import { describe, it, expect } from 'vitest'
import type { AuthErrorCode } from '@shared/authTypes'
import { classifyTelegramError } from './errors'
```
For `operationErrors.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import type { OperationErrorCode, Disposition } from '@shared/opTypes'
import { classifyRpcError } from './operationErrors'
```

**Test body pattern** (analog: `errors.test.ts` lines 31–79):
```typescript
it('PHONE_CODE_INVALID → AuthErrorCode.PHONE_CODE_INVALID', () => {
  const result = classifyTelegramError(makeRPCError('PHONE_CODE_INVALID'))
  expect(result.code).toBe<AuthErrorCode>('PHONE_CODE_INVALID')
  expect(result.retryStep).toBe('code')
  expect(result.uiCopyKey).toBeTruthy()
})
```
Each test: call the classifier, assert `.code` as the typed enum (`toBe<OperationErrorCode>(...)`), assert `.disposition`. Use the same single-assertion-per-property style — no `toMatchObject` sprawl.

**No vi/fake timers needed** in `operationErrors.test.ts` — the classifier is pure synchronous transform. No `afterEach` cleanup required.

---

### `src/main/telegram/SessionManager.ts` (modified — D-08 additions)

**Self-analog** — targeted additions to the existing file.

**Where to add governor** (analog: `SessionManager.ts` lines 109–129):
```typescript
// Current constructor field (line 109):
private readonly _floodController: FloodWaitController

// Add alongside:
private readonly _governor: RateLimitGovernor  // NEW Phase 2

// Current constructor body (lines 119–129):
constructor(options: SessionManagerOptions) {
  this._client = options.client
  // ...
  this._floodController = new FloodWaitController()
  // ADD:
  this._governor = new RateLimitGovernor(options.client, options.onGovernorEvent)
}
```

**Calls to route through governor (D-08)** — `_fetchIdentity` lines 351–367 and `logout` lines 277–298:
```typescript
// BEFORE (SessionManager.ts line 352–353):
const me = await this._client.getMe()
const photo = await this._client.downloadProfilePhoto(me)

// AFTER (D-08: route post-session calls through governor):
const me = await this._governor.run(() => this._client.getMe())
const photo = await this._governor.run(() => this._client.downloadProfilePhoto(me))

// BEFORE (SessionManager.ts line 282):
await this._client.invoke(new Api.auth.LogOut({}))

// AFTER:
await this._governor.run(() => this._client.invoke(new Api.auth.LogOut({})))
```
Preserve the existing `try/catch/finally` structure — only the `await` call target changes.

**Import addition** (analog: `SessionManager.ts` lines 27–33):
```typescript
// Add to existing imports:
import { RateLimitGovernor } from './governor'
```

---

### `src/main/index.ts` (modified — one-line change)

**Self-analog** — single field change in the TelegramClient constructor.

**Current pattern** (analog: `main/index.ts` lines 102–112):
```typescript
const client = new TelegramClient(
  new StringSession(savedSession),
  API_ID,
  API_HASH,
  {
    connectionRetries: 5,
    // RESEARCH Pitfall 5: set low so login flood-waits throw (surfaced as D-13 countdown)
    // rather than silently sleeping and freezing the UI
    floodSleepThreshold: 5,
  }
)
```

**Change** (D-11 / RESEARCH Pitfall 2 + Assumption A2 — threshold=0 for full governor visibility):
```typescript
const client = new TelegramClient(
  new StringSession(savedSession),
  API_ID,
  API_HASH,
  {
    connectionRetries: 5,
    // Phase 2 D-11: set to 0 so ALL FLOOD_WAITs throw to the governor rather than being
    // silently absorbed. Governor decides per D-09 whether to emit a countdown event.
    // floodSleepThreshold=0 is valid: Math.min(0 || 0, 86400) = 0 (verified: telegramBaseClient.js).
    floodSleepThreshold: 0,
  }
)
```

---

## Shared Patterns

### errorMessage extraction (apply to: `operationErrors.ts`, `governor.ts`)

**Source:** `src/main/telegram/errors.ts` lines 62–63 and `src/main/telegram/SessionManager.ts` lines 37–44

```typescript
// ALWAYS use errorMessage, never message (RESEARCH PITFALLS.md Pitfall 4):
const errorMessage: string =
  (err as { errorMessage?: string })?.errorMessage ?? ''

// For Set-based membership check (SessionManager.ts lines 37–44 pattern):
function isSomeErrorCategory(err: unknown): boolean {
  const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
  return SOME_ERROR_SET.has(msg)
}
```

### Injectable TimingSource (apply to: `governor.ts`, `governor.test.ts`)

**Source:** `src/main/telegram/floodWait.ts` lines 56–66

```typescript
export interface TimingSource {
  setInterval(callback: () => void, ms: number): ReturnType<typeof globalThis.setInterval>
  clearInterval(handle: ReturnType<typeof globalThis.setInterval>): void
}

const DEFAULT_TIMING: TimingSource = {
  setInterval: (cb, ms) => globalThis.setInterval(cb, ms),
  clearInterval: (h) => globalThis.clearInterval(h),
}
```
The governor reuses this interface as-is for `FloodWaitController` injection. For the governor's own sleep (one-shot `setTimeout` for jitter and retry backoff), rely on `vi.useFakeTimers()` replacing `globalThis.setTimeout` globally — no interface extension needed (RESEARCH Pitfall 4 / Assumption A4).

### @shared path alias (apply to: all new files)

**Source:** `vitest.config.ts` lines 12–15 and verified in `electron.vite.config.ts`

```typescript
resolve: {
  alias: {
    '@shared': resolve(__dirname, 'src/shared'),
    '@main': resolve(__dirname, 'src/main'),
  },
}
```
Use `@shared/opTypes` for the disposition/error types, `@shared/authTypes` for `FloodTick`. Never use relative `../../shared/...` paths.

### Private field naming (apply to: `governor.ts`)

**Source:** `src/main/telegram/SessionManager.ts` throughout

All private instance fields are prefixed `_` (e.g., `_client`, `_floodController`, `_emit`). All private methods are also `_`-prefixed. Follow this exactly.

### Fake-timers teardown (apply to: `governor.test.ts`)

**Source:** `src/main/telegram/floodWait.test.ts` lines 54–57

```typescript
afterEach(() => {
  vi.useRealTimers()
})
```
Every describe block that uses `vi.useFakeTimers()` must have this teardown. Do not place `vi.useFakeTimers()` at the describe scope — call it inside each `it` that needs it so tests that don't need fake timers aren't affected.

### Typed test helper factory (apply to: `governor.test.ts`, `operationErrors.test.ts`)

**Source:** `src/main/telegram/__mocks__/telegramClient.ts` lines 27–41 and `errors.test.ts` lines 20–28

```typescript
// Standard RPC error factory (errors.test.ts pattern):
function makeRPCError(
  errorMessage: string,
  seconds?: number
): Error & { errorMessage: string; seconds?: number } {
  const err = new Error(errorMessage) as Error & { errorMessage: string; seconds?: number }
  err.errorMessage = errorMessage
  if (seconds !== undefined) err.seconds = seconds
  return err
}
```
Both test files need this helper. For `governor.test.ts`, extend with `makePeerFloodError()` and a transient network error factory (plain `new Error('fetch failed')` with no `errorMessage`).

---

## No Analog Found

All Phase 2 files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

| File | Note |
|---|---|
| `src/main/telegram/governor.ts` | No existing governor; FloodWaitController + SessionManager provide 90% of needed patterns. The serial queue body (retry loop, FLOOD_WAIT ceiling, PEER_FLOOD branch) follows the pseudocode in RESEARCH.md §Pattern `executeWithGovernorPolicy` directly. |

---

## Metadata

**Analog search scope:** `src/main/telegram/`, `src/shared/`, `src/main/`
**Files read:** `floodWait.ts`, `errors.ts`, `SessionManager.ts`, `__mocks__/telegramClient.ts`, `authTypes.ts`, `channels.ts`, `main/index.ts`, `floodWait.test.ts`, `errors.test.ts`, `vitest.config.ts`
**Files scanned (find):** 8 test files located, 2 shared type files
**Pattern extraction date:** 2026-06-11
