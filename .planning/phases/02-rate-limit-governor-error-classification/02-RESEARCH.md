# Phase 2: Rate-Limit Governor & Error Classification - Research

**Researched:** 2026-06-11
**Domain:** GramJS error hierarchy, p-queue ESM compatibility, injectable timer patterns, Electron CJS main-process constraints
**Confidence:** HIGH (all critical claims verified against installed node_modules source or npm registry; one low-confidence assumption flagged)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Classifier unification & scope**
- D-01: Introduce a new, general operation-level classifier (`classifyRpcError`) returning `{ code, disposition, retryAfterSeconds? }` with disposition enum `wait | retry | skip | fail | hard-stop`.
- D-02: Do NOT refactor existing `classifyTelegramError()`. It is auth-specific, tested, and its output shape is login-UI-specific.
- D-03: Both classifiers share `floodWaitSeconds()` from `floodWait.ts` as the single FLOOD_WAIT duration parser.
- D-04: Phase 2 taxonomy: `FLOOD_WAIT` → `wait`; `PEER_FLOOD` → `hard-stop`; network/timeout → `retry`; session-invalid → `fail`; unmapped → `fail`. Extensible for Phase 5.

**Governor coverage**
- D-05: Governor is mandatory chokepoint for all post-auth operational calls. Exposes `governor.run(() => client.invoke(...))`. Enforces EXE-01.
- D-06: Interactive auth steps (phone/code/password) stay on existing inline FLOOD_WAIT handling. Do NOT route through governor.
- D-07: Resolves Phase 1 D-18 toward option (a): Phase 2 builds the real governor. Phase 1's `FloodWaitController` + `startFloodCountdown()` with injectable `TimingSource` are REUSED as the governor's countdown/timing mechanism.
- D-08: Post-session calls that today bypass any queue — `getMe`, `downloadProfilePhoto`, `auth.LogOut` invoke in `SessionManager` — SHOULD be routed through the governor.

**FLOOD_WAIT sleep policy**
- D-09: Always emit a countdown event for any FLOOD_WAIT the governor handles.
- D-10: Sleep = server-specified seconds + additive jitter. Jitter always additive: `jitter ∈ [0, J]` where `J = clamp(0.1 * seconds, 1s, 5s)`.
- D-11: Tiered absorption. Set GramJS `floodSleepThreshold` to ~60s. Governor catches `FloodWaitError` for longer waits, emits countdown, sleeps with jitter, resumes.
- D-12: Upper ceiling of 3600s/1 hour. Waits above this are classified as `fail` or distinct `wait-too-long` — not silent block.

**PEER_FLOOD & retry policy**
- D-13: PEER_FLOOD → `hard-stop`, zero retries. Governor classifies distinctly, does not retry. Job-level abort is Phase 5's concern.
- D-14: Bounded retry for transient errors: up to 3 retries with exponential backoff + jitter (~1s, 2s, 4s), then → `fail`. FLOOD_WAIT NOT counted against retry budget.

### Claude's Discretion
- Queue library: p-queue (concurrency=1) recommended; hand-rolled serial promise chain acceptable if planner prefers zero new deps. p-queue NOT yet installed.
- Exact event names/shapes, disposition enum concrete member names, governor class surface (`run`/`schedule`/`enqueue`), instantiation location in `SessionManager`.
- Proactive fixed inter-call delay: optional, recommend defaulting to 0.

### Deferred Ideas (OUT OF SCOPE)
- Removal-specific error codes (USER_PRIVACY_RESTRICTED, CHAT_ADMIN_REQUIRED, USER_NOT_PARTICIPANT, USER_ADMIN_INVALID) — Phase 5.
- Job-level abort, per-group checkpointing, crash recovery on PEER_FLOOD — Phase 5.
- On-screen rendering of the countdown / live progress UI — Phase 5/6.
- Proactive fixed inter-call pacing tuning.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXE-01 | All Telegram calls funnel through a single serialized, rate-limited governor (no parallel blasting) | p-queue concurrency=1 OR hand-rolled serial queue; governor.run() wraps all post-auth client calls |
| EXE-02 | App honors FLOOD_WAIT by sleeping the server-specified time and resuming (never treated as a hard failure) | GramJS FloodWaitError.seconds field gives parsed wait; governor sleeps + resumes; FloodWaitController from floodWait.ts drives the countdown |
| EXE-03 | App detects PEER_FLOOD distinctly and hard-stops the job (no retry), warning the user | PEER_FLOOD surfaces as RPCError with errorMessage==='PEER_FLOOD' (NOT a special class in telegram@2.26.22); classifyRpcError maps it to hard-stop; governor never retries it |
</phase_requirements>

---

## Summary

Phase 2 builds the single serialized rate-limit governor that all post-auth Telegram calls must funnel through. The research confirms all four technical unknowns from the CONTEXT.md and resolves the p-queue ESM compatibility concern.

**GramJS error shapes (verified against installed `telegram@2.26.22`):** `FloodWaitError` extends `FloodError` and carries a `.seconds` field parsed from `FLOOD_WAIT_(\d+)`. It is thrown when `FloodWaitError.seconds > client.floodSleepThreshold`. PEER_FLOOD is NOT a dedicated error class — it surfaces as a generic `RPCError` with `errorMessage === 'PEER_FLOOD'`, so detection must branch on `errorMessage`. The existing `floodWaitSeconds()` already handles the `.seconds`-first-then-regex priority correctly.

**p-queue ESM compatibility (verified):** p-queue@9.3.0 is pure ESM (`"type": "module"` implied by `"module"` field). The project's main process builds to CJS (no `"type": "module"` in root `package.json`). The correct fix is to add `p-queue` to the `noExternal` / bundled list in `electron.vite.config.ts` so Vite transpiles it into the CJS bundle. Electron 42 ships Node 24.16, which supports `require()` of ESM as a fallback, but bundling avoids runtime surprises. Alternatively, a zero-dep hand-rolled serial queue is equally viable and avoids the ESM configuration entirely.

**floodSleepThreshold integration point (verified):** The current `main/index.ts` sets `floodSleepThreshold: 5` on the `TelegramClient` constructor. This intentionally keeps login FLOOD_WAITs thrown (for the Phase 1 countdown UI). Phase 2's D-11 decision to raise the threshold to ~60s for operational calls means this constructor parameter must be updated in `main/index.ts`. The governor intercepts anything ABOVE the threshold; GramJS silently absorbs anything at-or-below it.

**Primary recommendation:** Implement the governor as a class in `src/main/telegram/governor.ts`, reusing `FloodWaitController` and `TimingSource` from `floodWait.ts`. Use p-queue bundled (not externalized), or a hand-rolled serial queue. Add `classifyRpcError` to `src/main/telegram/operationErrors.ts` (separate file from `errors.ts` per D-02). Add `OperationErrorCode` and `Disposition` types to `src/shared/opTypes.ts`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Serialized request queue (EXE-01) | API / Backend (main process) | — | Concurrency enforcement must be in the single privileged process that owns the TelegramClient; renderer has no access |
| FLOOD_WAIT sleep + resume (EXE-02) | API / Backend (main process) | — | GramJS runs in main; sleep must happen in the same process as the invoke call to block the queue |
| FLOOD_WAIT countdown events | API / Backend → IPC event stream | Renderer (future Phase 5/6) | Governor emits; renderer displays; Phase 2 only emits |
| PEER_FLOOD classification (EXE-03) | API / Backend (main process) | — | Must be classified before any retry logic runs; lives alongside the governor |
| Error disposition taxonomy | Shared types (`src/shared/opTypes.ts`) | — | Both main (governor) and renderer (Phase 5 progress) need the same typed codes |
| Auth FLOOD_WAIT (login flow) | API / Backend (main process) | — | Deliberately NOT in governor (D-06); stays in SessionManager / authFlow as is |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `telegram` (GramJS) | 2.26.22 (already installed) | MTProto client; `FloodWaitError`, `FloodError`, `RPCError` hierarchy used for detection | Already in project; verified error shapes via installed source |
| `FloodWaitController` / `TimingSource` (floodWait.ts) | Phase 1 (already exists) | Injectable countdown mechanism; reused as the governor's timing source per D-07/D-18 | Zero new dependencies; Phase 1 built this seam specifically for Phase 2 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `p-queue` | 9.3.0 | Serial job queue (concurrency=1) with pause/resume for FLOOD_WAIT sleep | Recommended per STACK.md; requires `noExternal` bundling in electron.vite.config.ts |
| Hand-rolled serial queue | — | Zero-dep alternative to p-queue: `let tail = Promise.resolve(); run = (fn) => tail = tail.then(fn)` | Use if planner wants to avoid ESM bundling configuration |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| p-queue | Hand-rolled serial queue | Hand-rolled is 4 lines, has no external risk, has no ESM complexity. p-queue adds pause/resume and a cleaner API for future Phase 5 concurrency tuning. Given the ESM bundling config is a one-liner, p-queue wins slightly. |
| New event emitter for countdown | Reuse FloodWaitController (D-07) | FloodWaitController already has injectable TimingSource for test fake-timers; reusing avoids duplicate countdown code |

**Installation (if using p-queue):**
```bash
npm install p-queue@9.3.0
```

**electron.vite.config.ts change required for p-queue (add to main config):**
```typescript
main: {
  build: {
    rollupOptions: {
      external: [] // remove p-queue from externals
    }
  }
  // OR: electron-vite 5 approach:
  // build.externalizeDeps: { exclude: ['p-queue'] }
}
```

**Version verification:**
```bash
npm view p-queue version   # → 9.3.0 [VERIFIED: npm registry]
npm view p-queue time.modified  # → 2026-05-16 (recently maintained)
```

---

## Package Legitimacy Audit

> slopcheck was unavailable at research time (permission denied for external install). All packages marked per the graceful degradation rule.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `p-queue` | npm | ~10 yrs (2016-10-28) | — | github.com/sindresorhus/p-queue | [ASSUMED] | Approved — maintained by sindresorhus (well-known OSS author), 53 published versions, last modified 2026-05-16, MIT license, 2 deps. Manual inspection: legitimate. |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck unavailable: package above is tagged [ASSUMED]. Planner should add a `checkpoint:human-verify` task before `npm install p-queue` if following strict protocol. Manual legitimacy indicators are strong.*

---

## Architecture Patterns

### System Architecture Diagram

```
POST-AUTH OPERATIONAL CALL (Phase 3+)
  Caller (TargetResolver / GroupEnumerator / RemovalExecutor)
    │
    │  governor.run(() => client.invoke(...))
    ▼
┌─────────────────────────────────────────────────────┐
│  RateLimitGovernor                                   │
│                                                      │
│  Serial queue (concurrency=1)                        │
│  ┌──────────────┐                                    │
│  │ pending jobs │──► execute next ──────────────┐   │
│  └──────────────┘                               │   │
│                                                  ▼   │
│                               try { await fn() }    │
│                                  │                  │
│                      ┌───────────┴──────────────┐   │
│                      │ classify error            │   │
│                      │  FloodWaitError           │   │
│                      │   → wait disposition      │   │
│                      │   → emit countdown event  │──────► IPC event stream
│                      │   → sleep(seconds+jitter) │       (consumers: Phase 5/6 UI)
│                      │   → retry (if ≤ ceiling)  │   │
│                      │                           │   │
│                      │  PEER_FLOOD errorMessage  │   │
│                      │   → hard-stop disposition │──────► caller gets hard-stop
│                      │   → NO retry              │   │
│                      │                           │   │
│                      │  network/transient         │   │
│                      │   → retry (≤3, exp backoff)│  │
│                      │   → fail after budget     │   │
│                      │                           │   │
│                      │  session-invalid          │   │
│                      │   → fail (surface to SM)  │   │
│                      │                           │   │
│                      │  unmapped RPCError        │   │
│                      │   → fail                  │   │
│                      └───────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │
         ▼
  GramJS TelegramClient (single instance in SessionManager)
         │
         ▼
  Telegram DCs (MTProto/TCP)

AUTH CALLS (phone/code/password login) ──────────────────────────────────────
  Bypass governor entirely (D-06). Handled by SessionManager / AuthFlow
  with existing inline FloodWaitController countdown (D-13).
```

### Recommended Project Structure

```
src/
├── main/
│   └── telegram/
│       ├── governor.ts          # NEW: RateLimitGovernor class (EXE-01/02/03)
│       ├── operationErrors.ts   # NEW: classifyRpcError(), OperationErrorCode enum
│       ├── floodWait.ts         # EXISTING: reused — FloodWaitController, TimingSource
│       ├── errors.ts            # EXISTING: classifyTelegramError() — do NOT touch
│       └── SessionManager.ts   # EXISTING: instantiates governor; routes post-auth calls
├── shared/
│   ├── opTypes.ts               # NEW: Disposition enum, OperationError type (shared main↔Phase 5)
│   └── authTypes.ts             # EXISTING: do NOT modify
```

### Pattern 1: GramJS FloodWaitError exact shape

```typescript
// Source: verified from node_modules/telegram/errors/RPCErrorList.d.ts (installed telegram@2.26.22)
// FloodWaitError extends FloodError extends RPCError
// FloodWaitError.seconds: number  ← parsed from FLOOD_WAIT_(\d+)
// FloodWaitError.errorMessage: string  ← e.g. "FLOOD_WAIT_30"
// FloodWaitError.code: number  ← 420 (inherited from FloodError)

import { errors } from 'telegram'
// errors.FloodWaitError
// errors.FloodError  (base class for flood-family)
// errors.RPCError    (base for all RPC errors)

// Detection in governor (use instanceof, then errorMessage as fallback):
if (err instanceof errors.FloodWaitError) {
  const seconds = err.seconds  // always present on FloodWaitError
  // ...
}
```

### Pattern 2: PEER_FLOOD detection — errorMessage, NOT instanceof

```typescript
// Source: verified from node_modules/telegram/errors/index.js — PEER_FLOOD is NOT
// in rpcErrorRe map and has NO dedicated class in telegram@2.26.22.
// It falls through RPCMessageToError as a generic RPCError with:
//   errorMessage === 'PEER_FLOOD'
//   code === 403 (ForbiddenError territory but typed as base RPCError)

// WRONG — no such class:
// if (err instanceof errors.PeerFloodError) { ... }

// CORRECT — branch on errorMessage (same Pitfall 4 convention as errors.ts):
const errorMessage = (err as { errorMessage?: string })?.errorMessage ?? ''
if (errorMessage === 'PEER_FLOOD') {
  return { code: 'PEER_FLOOD', disposition: 'hard-stop' }
}
```

### Pattern 3: Governor using FloodWaitController (D-07 reuse)

```typescript
// Source: src/main/telegram/floodWait.ts (Phase 1 — D-18 seam)
// FloodWaitController accepts a TimingSource in its constructor.
// Tests pass fake timers via vi.useFakeTimers() which replaces globalThis.setInterval.
// The governor constructs one FloodWaitController per instance.

import { FloodWaitController, floodWaitSeconds, TimingSource } from './floodWait'

class RateLimitGovernor {
  private readonly _floodController: FloodWaitController

  constructor(
    private readonly _client: GovernorClient,
    timingSource?: TimingSource,
    private readonly _onEvent?: (event: GovernorEvent) => void
  ) {
    this._floodController = new FloodWaitController(timingSource)
  }
  // ...
}
```

### Pattern 4: Additive jitter formula (D-10)

```typescript
// Source: D-10 decision in CONTEXT.md
// J = clamp(0.1 * seconds, 1, 5)
// sleep = seconds + Math.random() * J

function computeJitter(seconds: number): number {
  const J = Math.min(Math.max(0.1 * seconds, 1), 5)
  return Math.random() * J
}

async function sleepWithJitter(seconds: number, timing: TimingSource): Promise<void> {
  const jitter = computeJitter(seconds)
  const totalMs = (seconds + jitter) * 1000
  return new Promise<void>((resolve) => timing.setTimeout(resolve, totalMs))
}
```

> Note: `TimingSource` from `floodWait.ts` only defines `setInterval`/`clearInterval`. If the governor needs injectable `setTimeout` for sleep, it must extend `TimingSource` or define its own. The planner must decide whether to extend the existing `TimingSource` interface to add `setTimeout`/`clearTimeout` (cleanest for testing) or accept a separate sleep utility.

### Pattern 5: Exponential backoff for transient errors (D-14)

```typescript
// Source: D-14 decision in CONTEXT.md
// 3 retries: delays ~1s, 2s, 4s + jitter
// FLOOD_WAIT does NOT count against this budget

const BACKOFF_BASE_MS = [1000, 2000, 4000] as const

async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn() }
    catch (e) {
      if (!isTransientError(e) || attempt === maxRetries) throw e
      const base = BACKOFF_BASE_MS[attempt] ?? 4000
      const jitter = Math.random() * 500
      await sleep(base + jitter)
      lastErr = e
    }
  }
  throw lastErr
}
```

### Pattern 6: p-queue bundling fix for CJS main process

```typescript
// Source: verified from electron.vite.config.ts + node_modules/electron-vite analysis
// The main process builds to CJS (no "type":"module" in package.json).
// p-queue@9 is pure ESM and will be externalized by externalizeDepsPlugin.
// At runtime, require('p-queue') will fail in older Node; even Node 24 may warn.
// Fix: exclude p-queue from externalization so Vite bundles/transpiles it.

// In electron.vite.config.ts, main section:
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['p-queue'] })],
    // ...
  }
})
// OR use the newer config API:
// build: { externalizeDeps: { exclude: ['p-queue'] } }
```

### Anti-Patterns to Avoid

- **Direct client.invoke() calls outside the governor:** Any service calling `client.invoke()` directly bypasses EXE-01's serialization guarantee. The governor must be the only code path to the client for post-auth operational calls.
- **Treating PEER_FLOOD like FLOOD_WAIT:** They are both 420-class errors in Telegram's taxonomy but completely different signals. FLOOD_WAIT = "wait and retry"; PEER_FLOOD = "your account is spam-flagged, stop entirely." Conflating them is a safety failure.
- **Assuming `error instanceof FloodWaitError` catches all FLOOD_WAIT cases:** It catches the common path. The `floodWaitSeconds()` regex fallback handles edge cases where the error comes as a plain RPCError string rather than an instantiated FloodWaitError class.
- **Relying on `floodSleepThreshold` alone for UI countdown:** GramJS sleeps silently below the threshold — no event is emitted. The governor must always emit countdown events for waits it handles (D-09), which means the governor layer is necessary even for short waits that GramJS would auto-absorb.
- **Raising `floodSleepThreshold` without updating the governor integration:** The threshold controls what GramJS auto-absorbs (silent) vs what it throws (governor catches). If threshold is raised to 60s but the governor doesn't have proper countdown logic, short waits (1–60s) disappear silently from the user's perspective.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serial call queue | Custom async queue with manual chaining | `p-queue` concurrency=1 OR 4-line tail-chain | Queue management has subtle bugs: cancelled items, unhandled rejections in the chain, items not drained on abort. p-queue handles all of these. |
| FLOOD_WAIT countdown | New timer/interval logic | `FloodWaitController` from `floodWait.ts` | Phase 1 built this seam with injectable timing specifically for Phase 2. Duplicating it creates two countdown implementations to maintain. |
| FLOOD_WAIT duration parsing | New regex | `floodWaitSeconds()` from `floodWait.ts` | Already handles `.seconds`-first, `errorMessage`-fallback, `message`-fallback. D-03 mandates sharing it. |
| Retry backoff | Custom sleep loop | The pattern in this research (3 retries, BACKOFF_BASE_MS) | Not a library problem — the specific policy is small enough to hand-code correctly with the D-14 constraints. |

**Key insight:** The main "don't hand-roll" risk is the countdown logic. Phase 1 already solved it with proper testability; using it saves regression risk and keeps the codebase to one countdown implementation.

---

## Common Pitfalls

### Pitfall 1: PEER_FLOOD has no dedicated GramJS class — detection fails silently

**What goes wrong:** Developer writes `instanceof errors.PeerFloodError` (or similar) because `FloodWaitError` has its own class. The class does not exist in `telegram@2.26.22`. The `instanceof` check always returns `false`. PEER_FLOOD passes undetected and gets classified as `fail` (unmapped) rather than `hard-stop` — the governor retries it up to 3 times instead of stopping immediately.

**Why it happens:** The GramJS error class list (`RPCErrorList.d.ts`) only has `FloodWaitError`, `SlowModeWaitError`, `FloodTestPhoneWaitError`, and `MsgWaitError` in the flood family. PEER_FLOOD is not in `rpcErrorRe` (the regex-to-class map) and falls through `RPCMessageToError` as a plain `RPCError`.

**How to avoid:** Branch on `errorMessage === 'PEER_FLOOD'` first, before the flood-wait check. This follows the same `errorMessage`-not-`instanceof` pattern the existing `classifyTelegramError()` uses (PITFALLS.md Pitfall 4). Verify: `(err as {errorMessage?: string})?.errorMessage === 'PEER_FLOOD'`.

**Warning signs:** PEER_FLOOD showing up in the transient retry path; governor retrying after a spam-flag event; no `hard-stop` in test output when PEER_FLOOD is injected.

### Pitfall 2: floodSleepThreshold=5 in main/index.ts — updating it changes login behavior

**What goes wrong:** The current `TelegramClient` constructor in `main/index.ts` uses `floodSleepThreshold: 5`. This was intentional for login (Phase 1): short login FLOOD_WAITs (>5s) are thrown to trigger the countdown UI rather than silently absorbed. If Phase 2 raises this to 60s for operational calls, waits of 6–60s during login become silently absorbed — the countdown UI never fires for those durations.

**Why it happens:** There is one shared `TelegramClient` for both auth and operational calls. `floodSleepThreshold` is a client-wide setting.

**How to avoid:** The governor's own FLOOD_WAIT handling happens AFTER GramJS throws (when the error exceeds the threshold). The threshold controls silent-absorption, not governor behavior. Two viable approaches:
1. Keep threshold=5 — the governor catches all waits >5s. Short (≤5s) waits are silently absorbed by GramJS (acceptable, since short waits during operational calls are not worth a countdown).
2. Change threshold to 0 — ALL FLOOD_WAITs throw, governor handles 100% of them. This is consistent but means operational calls always get the full countdown even for 1-second waits (D-09 says always emit).

**Recommendation:** Set `floodSleepThreshold: 0` on the `TelegramClient` so the governor has full visibility over all FLOOD_WAIT events. The governor then decides (D-11) whether to emit a countdown based on the duration. This is the most consistent approach and avoids a confusing "sometimes silently absorbed" behavior.

**Warning signs:** Short FLOOD_WAIT events (1–5s) during phase testing not appearing in governor events; login countdown breaking after threshold change.

### Pitfall 3: p-queue ESM requires bundling, not externalizing

**What goes wrong:** `externalizeDepsPlugin()` in `electron.vite.config.ts` externalizes ALL `node_modules` deps. The CJS-format main process output (`require('p-queue')`) then fails at Electron runtime because `p-queue@9` is pure ESM — no `main` field, only `module` export. In Node 24 this may produce a warning or silently fail depending on Electron's require-ESM support status.

**Why it happens:** electron-vite's `externalizeDepsPlugin` is designed for CJS-compatible deps. Pure-ESM deps need to be bundled by Vite/Rollup rather than externalized.

**How to avoid:** Pass `exclude: ['p-queue']` to `externalizeDepsPlugin()`:
```typescript
externalizeDepsPlugin({ exclude: ['p-queue'] })
```
This tells Vite to bundle p-queue into the output rather than leaving it as an external `require()`. Vite handles the ESM-to-CJS transpilation during bundling.

**Alternatively:** Use the hand-rolled serial queue (no deps needed):
```typescript
let _tail: Promise<void> = Promise.resolve()
function run<T>(fn: () => Promise<T>): Promise<T> {
  const result = _tail.then(() => fn())
  _tail = result.then(() => {}, () => {})  // absorb errors in tail
  return result
}
```
This is 4 lines, has no ESM complexity, and satisfies EXE-01 perfectly for the current concurrency=1 requirement. p-queue's additional features (pause/resume, priority) are not needed in Phase 2.

**Warning signs:** `Error [ERR_REQUIRE_ESM]: require() of ES Module` in Electron main process logs at startup; governor fails to instantiate.

### Pitfall 4: Sleep function needs an injectable TimingSource for tests

**What goes wrong:** The governor's jitter sleep uses `setTimeout` (not `setInterval`). The existing `TimingSource` interface in `floodWait.ts` only defines `setInterval`/`clearInterval`. If the governor uses `globalThis.setTimeout` directly for sleep, tests cannot use `vi.useFakeTimers()` to advance time deterministically — tests for the 3600s ceiling, jitter addition, and retry backoff would require real waits.

**Why it happens:** The existing `TimingSource` was designed for countdown ticks (setInterval), not one-shot sleeps (setTimeout). The governor's sleep needs a different primitive.

**How to avoid:** Either (a) extend `TimingSource` to add `setTimeout`/`clearTimeout` fields, or (b) accept that `vi.useFakeTimers()` (Vitest) replaces `globalThis.setTimeout` globally, so the governor's sleep automatically uses fake time in tests without any interface injection needed.

**Recommendation:** Use approach (b) — `vi.useFakeTimers()` already handles `globalThis.setTimeout`. The governor can use `globalThis.setTimeout` directly for sleep and tests call `vi.advanceTimersByTime()`. Only the countdown (1-Hz `setInterval` ticks) needs the explicit `TimingSource` injection. This minimizes interface complexity.

**Warning signs:** Tests that verify sleep duration taking real time to run; `vi.advanceTimersByTime()` not advancing the governor's sleep.

---

## Code Examples

Verified patterns from installed `telegram@2.26.22` source:

### FloodWaitError class shape (verified from installed node_modules)

```typescript
// Source: node_modules/telegram/errors/RPCErrorList.d.ts
// telegram@2.26.22 — VERIFIED

// FloodWaitError class (extends FloodError extends RPCError):
//   .seconds: number        ← the parsed wait duration
//   .errorMessage: string   ← "FLOOD_WAIT_30" (the raw GramJS string)
//   .code: number           ← 420 (inherited from FloodError)

import { errors } from 'telegram'
// errors.FloodWaitError  ← exists
// errors.FloodError      ← base class, exists
// errors.RPCError        ← base, exists

// DOES NOT EXIST in telegram@2.26.22:
// errors.PeerFloodError  ← not in RPCErrorList.d.ts, not in rpcErrorRe map
```

### RPCMessageToError flow for PEER_FLOOD (verified)

```typescript
// Source: node_modules/telegram/errors/index.js — RPCMessageToError function
// telegram@2.26.22

// The rpcErrorRe map covers:
//   /FLOOD_WAIT_(\d+)/ → FloodWaitError
//   /FLOOD_PREMIUM_WAIT_(\d+)/ → FloodWaitError
//   + migrate errors, SlowModeWait, MsgWait, etc.
// 'PEER_FLOOD' is NOT in the map.
// Therefore: PEER_FLOOD returns new RPCError('PEER_FLOOD', request, 420 or 403)
// with .errorMessage === 'PEER_FLOOD'
// (HTTP code may be 420 or 403 depending on server response — branch only on errorMessage)
```

### Governor dispatch algorithm (pseudocode — planner writes the real impl)

```typescript
// Source: D-04, D-09, D-10, D-11, D-12, D-13, D-14 from CONTEXT.md

async function executeWithGovernorPolicy<T>(
  fn: () => Promise<T>,
  onEvent: (e: GovernorEvent) => void,
  floodController: FloodWaitController
): Promise<T> {
  let transientAttempts = 0
  const MAX_TRANSIENT = 3
  const FLOOD_CEILING_S = 3600

  while (true) {
    try {
      return await fn()
    } catch (err) {
      const classified = classifyRpcError(err)

      if (classified.disposition === 'hard-stop') {
        onEvent({ type: 'hard-stop', code: classified.code })
        throw err  // propagate — caller (Phase 5) handles job abort

      } else if (classified.disposition === 'wait') {
        const seconds = classified.retryAfterSeconds ?? 0
        if (seconds > FLOOD_CEILING_S) {
          onEvent({ type: 'wait-too-long', seconds })
          throw err  // D-12: above ceiling → surface to user
        }
        // D-09: always emit countdown
        await new Promise<void>((resolve) => {
          floodController.start(seconds, (tick) => onEvent({ type: 'flood-tick', ...tick }), resolve)
        })
        // D-10: jitter (additive, never less than server asked)
        const J = Math.min(Math.max(0.1 * seconds, 1), 5)
        await sleep((Math.random() * J) * 1000)
        // continue loop = retry same operation

      } else if (classified.disposition === 'retry') {
        if (transientAttempts >= MAX_TRANSIENT) {
          throw err  // D-14: exhaust retry budget → fail
        }
        const base = [1000, 2000, 4000][transientAttempts] ?? 4000
        await sleep(base + Math.random() * 500)
        transientAttempts++

      } else {
        // 'fail', 'skip', or unknown disposition
        throw err
      }
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GramJS error detection via `err.message` | Branch on `err.errorMessage` (RPCError field) | GramJS introduced separate `errorMessage` vs `message`; see PITFALLS.md Pitfall 4 | Must use `errorMessage` — `message` includes the request class suffix and differs from the raw Telegram code |
| `keytar` for keychain | Electron `safeStorage` | ~2022 | Already using safeStorage in Phase 1 — no change needed |
| No PEER_FLOOD dedicated class in GramJS | Branch on `errorMessage === 'PEER_FLOOD'` | Unchanged in telegram@2.26.22 | No instanceof check possible; string comparison required |

**Deprecated/outdated:**
- `SlowModeWaitError` (telegram@2.26.22): Exists as a FloodError subclass; surfaced by group slow-mode, not general FLOOD_WAIT. Governor classifier can treat it as `wait` if encountered (same as FloodWaitError — it has a `.seconds` field).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PEER_FLOOD surfaces as RPCError with `errorMessage === 'PEER_FLOOD'` in telegram@2.26.22 | Pattern 2, Pitfall 1 | Tagged [VERIFIED: installed node_modules source] — RPCMessageToError verified to not match PEER_FLOOD in rpcErrorRe, falls to `new RPCError(rpcError.errorMessage, ...)`. No risk. |
| A2 | `floodSleepThreshold: 0` is a valid value (GramJS clamps to `Math.min(value || 0, 86400)`) | Pitfall 2 | Tagged [VERIFIED: installed node_modules source] — `telegramBaseClient.js:139: this._floodSleepThreshold = Math.min(value || 0, 24 * 60 * 60)` — `0 || 0 = 0`, so threshold=0 means GramJS NEVER auto-absorbs. All flood errors throw to the governor. |
| A3 | p-queue@9.3.0 can be bundled by Vite via `externalizeDepsPlugin({ exclude: ['p-queue'] })` | Pitfall 3, Pattern 6 | [ASSUMED] — The electron-vite `externalizeDepsPlugin` `exclude` option was observed in the plugin source (`lib-q6ns0vZr.js`), but the exact API signature was not verified against a working build with p-queue. If the exclude option behaves differently, hand-rolled serial queue is the zero-risk fallback. |
| A4 | `vi.useFakeTimers()` advances `globalThis.setTimeout` in the Vitest node environment, making governor sleep testable without TimingSource injection | Pitfall 4 | [ASSUMED] — This is standard Vitest behavior for fake timers in node environment. The project already uses `vi.useFakeTimers()` in `floodWait.test.ts`. Low risk. |

**Risk summary:** A1 and A2 are verified from source. A3 and A4 are well-grounded assumptions with clear fallbacks. None are blocking.

---

## Open Questions

1. **Should `floodSleepThreshold` be set to 0 or kept at 5?**
   - What we know: `threshold=5` was intentional for login (Phase 1 CONTEXT.md notes). `threshold=0` gives the governor full visibility over all FLOOD_WAIT events.
   - What's unclear: Whether sub-5-second FLOOD_WAITs during operational calls (Phase 3+) should be silently absorbed or emitted as countdown events.
   - Recommendation: Set `threshold=0` for maximum governor control. D-09 says "always emit countdown" — this requires the governor to see all waits. A sub-1s wait will emit a countdown; consumers (D-09: "Consumers decide whether to render sub-second/tiny waits") can filter.

2. **Serial queue: p-queue with bundling config, or hand-rolled?**
   - What we know: p-queue requires one config change (exclude from externalization). Hand-rolled is 4 lines, zero deps, covers Phase 2's concurrency=1 requirement exactly.
   - What's unclear: Whether Phase 5 will want p-queue's pause/resume for job-level FLOOD_WAIT suspension.
   - Recommendation: Hand-rolled for Phase 2. If Phase 5 needs pause/resume, add p-queue then. The hand-rolled version is easier to test and has no ESM configuration risk.

3. **Does `TimingSource` need `setTimeout`/`clearTimeout` added?**
   - What we know: Existing `TimingSource` has `setInterval`/`clearInterval`. Governor sleep uses `setTimeout`. `vi.useFakeTimers()` replaces globalThis.setTimeout globally.
   - What's unclear: Whether the planner wants explicit interface injection for sleep (cleaner test boundaries) or accepts global fake timer replacement.
   - Recommendation: Accept global fake timer replacement (approach b in Pitfall 4). No interface change needed. Document that governor tests must call `vi.useFakeTimers()`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 22.22.0 (local) / 24.16.0 (in Electron 42) | — |
| Electron | Desktop shell | ✓ | 42.4.0 | — |
| `telegram` package | GramJS client | ✓ | 2.26.22 (installed) | — |
| Vitest | Test runner | ✓ | 4.1.8 (devDependency) | — |
| `p-queue` | Serial queue | ✗ | Not installed | Hand-rolled serial queue (0 deps) |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:**
- `p-queue`: requires `npm install p-queue@9.3.0` + electron.vite.config.ts change. Fallback: hand-rolled serial queue.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/main/telegram/governor.test.ts src/main/telegram/operationErrors.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXE-01 | Concurrent `governor.run()` calls execute one-at-a-time (verified via sequencing assertions) | unit | `npx vitest run src/main/telegram/governor.test.ts -t "serialization"` | ❌ Wave 0 |
| EXE-02 | FloodWaitError → governor sleeps `seconds+jitter` and resumes the call; countdown event emitted | unit + fake timers | `npx vitest run src/main/telegram/governor.test.ts -t "FLOOD_WAIT"` | ❌ Wave 0 |
| EXE-02 | D-12 ceiling: wait > 3600s → governor throws (does NOT sleep) | unit | `npx vitest run src/main/telegram/governor.test.ts -t "ceiling"` | ❌ Wave 0 |
| EXE-03 | PEER_FLOOD → disposition is hard-stop, governor does not retry | unit | `npx vitest run src/main/telegram/governor.test.ts -t "PEER_FLOOD"` | ❌ Wave 0 |
| EXE-03 | classifyRpcError maps PEER_FLOOD distinctly from FLOOD_WAIT | unit | `npx vitest run src/main/telegram/operationErrors.test.ts -t "PEER_FLOOD"` | ❌ Wave 0 |
| D-14 | Transient error → 3 retries with backoff, then fail | unit | `npx vitest run src/main/telegram/governor.test.ts -t "transient retry"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/main/telegram/governor.test.ts src/main/telegram/operationErrors.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (with expected 2 config test failures for env injection) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/main/telegram/governor.test.ts` — RED tests for EXE-01, EXE-02 (flood sleep + countdown), EXE-02 ceiling, D-14 transient retry
- [ ] `src/main/telegram/operationErrors.test.ts` — RED tests for EXE-03 (PEER_FLOOD distinct classification), D-04 taxonomy
- [ ] `src/shared/opTypes.ts` — `Disposition` enum, `OperationErrorCode` type (needed by both test files and implementation)

Existing test infrastructure (`vitest.config.ts`, `src/**/*.test.ts` glob, `node` environment, `@shared` alias) covers all phase requirements without modification.

---

## Security Domain

> security_enforcement not explicitly disabled in config.json — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Auth handled in Phase 1 SessionManager |
| V3 Session Management | no | Session handled in Phase 1 |
| V4 Access Control | no | Not applicable to rate-limit infrastructure |
| V5 Input Validation | yes | All governor event payloads are typed; no raw Telegram strings cross IPC boundary |
| V6 Cryptography | no | No new crypto in this phase |

### Known Threat Patterns for Rate-Limit Governor

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PEER_FLOOD classified as retryable (silently retry after spam-flag) | Tampering | Hard-stop on PEER_FLOOD with zero retries (D-13); classification verified via errorMessage string comparison |
| Long FLOOD_WAIT silently blocking main process | Denial of Service | D-12 ceiling at 3600s; waits above ceiling are surfaced as `fail` or `wait-too-long`, not silently blocked |
| Parallel goroutine blasting the Telegram account | Elevation of Privilege | Serial queue (concurrency=1) enforced architecturally — all post-auth calls through governor.run() |
| Raw Telegram error strings reaching renderer | Information Disclosure | governor emits typed `GovernorEvent` objects only; `OperationErrorCode` enum at IPC boundary (D-01 principle, same as Phase 1) |

---

## Sources

### Primary (HIGH confidence)

- `node_modules/telegram/errors/RPCErrorList.d.ts` — FloodWaitError class definition; `.seconds` field confirmed [VERIFIED: installed source, telegram@2.26.22]
- `node_modules/telegram/errors/RPCErrorList.js` — `rpcErrorRe` map; PEER_FLOOD absence confirmed [VERIFIED: installed source]
- `node_modules/telegram/errors/index.js` — `RPCMessageToError` implementation; PEER_FLOOD falls to generic RPCError [VERIFIED: installed source]
- `node_modules/telegram/errors/RPCBaseErrors.js` — FloodError code=420, ForbiddenError code=403 [VERIFIED: installed source]
- `node_modules/telegram/client/users.js` — `floodSleepThreshold` behavior: `e.seconds <= client.floodSleepThreshold` → sleep; otherwise throw [VERIFIED: installed source]
- `node_modules/telegram/client/telegramBaseClient.js` — `floodSleepThreshold` setter: `Math.min(value || 0, 86400)` — threshold=0 is valid [VERIFIED: installed source]
- `src/main/telegram/floodWait.ts` — `FloodWaitController`, `TimingSource`, `floodWaitSeconds()` [VERIFIED: codebase]
- `src/main/telegram/errors.ts` — `classifyTelegramError()` shape; `errorMessage`-not-`message` pattern [VERIFIED: codebase]
- `src/main/index.ts` — `floodSleepThreshold: 5` current value; integration point for governor [VERIFIED: codebase]
- `electron.vite.config.ts` — `externalizeDepsPlugin()` usage; CJS main process confirmed [VERIFIED: codebase]
- `out/main/index.js` — CJS `require('telegram')` confirms main process is CommonJS [VERIFIED: codebase]

### Secondary (MEDIUM confidence)

- `node_modules/electron-vite/dist/chunks/lib-q6ns0vZr.js` — `externalizeDepsPlugin` source; `exclude` option confirmed [VERIFIED: installed source]
- `node_modules/electron-vite/dist/chunks/lib-q6ns0vZr.js` — `supportESM()` returns true for Electron ≥28 [VERIFIED: installed source]
- npm registry: `electron@42.4.0` engines: `{ node: '>= 22.12.0' }` [VERIFIED: npm registry]
- npm registry: Electron 42.4.0 ships Node 24.16.0 [VERIFIED: releases.electronjs.org]
- npm registry: `p-queue@9.3.0`, MIT, maintained by sindresorhus, published 2026-05-16 [VERIFIED: npm registry]

### Tertiary (LOW confidence — confirmed from authoritative source)

None in this research. All key claims verified from installed source.

---

## Metadata

**Confidence breakdown:**
- GramJS error hierarchy: HIGH — verified from installed telegram@2.26.22 source (not training data)
- p-queue ESM integration: MEDIUM — the `noExternal`/`exclude` approach is verified from electron-vite source; the exact working syntax is A3 [ASSUMED]
- floodSleepThreshold=0 safety: HIGH — verified from telegramBaseClient.js setter
- PEER_FLOOD detection approach: HIGH — verified from rpcErrorRe absence and RPCMessageToError fallback

**Research date:** 2026-06-11
**Valid until:** 2026-08-11 (stable — GramJS error hierarchy rarely changes; verify if telegram package is updated beyond 2.26.22)
