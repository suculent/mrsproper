# Phase 2: Rate-Limit Governor & Error Classification - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

> **Discussion note:** The user delegated all implementation decisions for this
> phase ("Don't want to discuss this. Do your best."). Every decision below is
> Claude's recommended default, chosen to (a) satisfy the Phase 2 success
> criteria, (b) reuse the D-18 seams Phase 1 deliberately left, and (c) avoid
> rewriting the completed, tested Phase 1 auth path. Planner may refine any of
> these; none were user-locked.

<domain>
## Phase Boundary

This phase builds the **single serialized rate-limit governor and error
classifier** that every later Telegram feature call funnels through. It delivers:
a concurrency=1 queue so calls execute one at a time (no parallel blasting); a
FLOOD_WAIT handler that sleeps the server-specified duration (with jitter) and
resumes, emitting a countdown event consumers can display; a PEER_FLOOD path
classified distinctly and hard-stopped with no retry; and one error-classification
function that maps raw GramJS RPC errors to a typed enum with explicit
**skip / fail / retry / wait / hard-stop** dispositions — covered by mock-client tests.

**In scope:** EXE-01 (single serialized rate-limited governor), EXE-02 (honor
FLOOD_WAIT by sleeping + resuming, never a hard failure), EXE-03 (PEER_FLOOD
detected distinctly and hard-stops with no retry). The governor is **library
infrastructure** here — it exposes a `run()`/`schedule()` entry and emits events;
it is wired into the operational call surface but is not yet driving a real bulk job.

**Out of scope (later phases):** the actual calls that flow through it — target
resolution (Phase 3), group enumeration & rights (Phase 4), the removal executor
and its per-group checkpointing/job-abort recovery (Phase 5), live progress UI and
the countdown's on-screen rendering (Phase 5/6). Removal-specific error codes
(USER_PRIVACY_RESTRICTED, CHAT_ADMIN_REQUIRED, USER_NOT_PARTICIPANT, etc.) are
**not enumerated now** — Phase 2 ships the extensible disposition framework; Phase 5
registers those codes against it.

</domain>

<decisions>
## Implementation Decisions

### Classifier unification & scope
- **D-01:** Introduce a **new, general operation-level classifier**
  (e.g. `classifyRpcError(err): { code, disposition, retryAfterSeconds? }`) in
  `src/main/telegram/`. It returns a disposition enum — `wait | retry | skip |
  fail | hard-stop` — distinct from the auth classifier's `retryStep`/`uiCopyKey`
  output. The two classifiers serve different concerns and stay separate.
- **D-02:** **Do NOT refactor the existing `classifyTelegramError()`** (auth-flow
  specific, returns `AuthErrorCode` + `uiCopyKey` + `retryStep`). It is complete,
  tested (`errors.test.ts`), and its output shape is genuinely login-UI-specific.
  Rewriting it onto the new disposition enum buys nothing and risks Phase 1
  regressions.
- **D-03:** **Share the low-level primitive, not the classifier.** Both layers
  reuse `floodWaitSeconds()` (already exported from `floodWait.ts`) for FLOOD_WAIT
  parsing so there is one source of truth for the wait duration.
- **D-04:** Phase 2's taxonomy enumerates only the **rate-limit + transport/general**
  codes: `FLOOD_WAIT` → `wait`; `PEER_FLOOD` → `hard-stop`; network/timeout/transient
  → `retry`; session-invalid (e.g. `AUTH_KEY_UNREGISTERED` / unauthorized) → `fail`
  (surface, route to re-login — already handled by SessionManager); everything
  unmapped → `fail`. The enum + registry are **extensible** so Phase 5 adds
  removal-specific codes mapping to `skip`/`fail` without touching the governor.

### Governor coverage (D-18 resolution)
- **D-05:** The governor is the **mandatory chokepoint for all post-auth
  operational calls** (Phase 3+ resolution, enumeration, removal). It owns one
  serial queue (concurrency=1) and exposes a single entry like
  `governor.run(() => client.invoke(...))`. This is where EXE-01's "no parallel
  blasting" is enforced.
- **D-06:** **Leave the interactive auth steps (phone/code/password) on their
  existing inline FLOOD_WAIT handling.** They predate any session, are already
  human-paced and effectively serial, and carry bespoke UI countdown semantics
  (D-13: `retryStep`-aware inline error + live countdown). Routing them through the
  governor adds integration surface and regression risk for no flood-safety gain
  (login is not a volume vector).
- **D-07:** This resolves the Phase 1 **D-18** cross-phase flag toward "option (a)
  generalized": Phase 2 builds the real governor; Phase 1's `FloodWaitController`
  + `startFloodCountdown()` (with their injectable `TimingSource`) are **reused as
  the governor's countdown/timing mechanism**, not reimplemented. The governor
  constructs a `FloodWaitController` (or the same timing-source pattern) so login
  floods and operation floods share one countdown implementation.
- **D-08:** **Recommended literal-compliance bridge:** the cheap *post-session*
  calls that today bypass any queue — `getMe`, `downloadProfilePhoto`, and the
  `auth.LogOut` invoke in `SessionManager` — SHOULD be routed through the governor
  too, since they run after a session exists and cost nothing to serialize. This
  honors success-criterion #1 ("all Telegram requests pass through a single
  serialized queue") for everything except the genuinely pre-session interactive
  login dialog. Planner: flag if a verifier reads criterion #1 as *literally*
  every call including login — D-06 is a deliberate, documented exception.

### FLOOD_WAIT sleep policy
- **D-09:** **Always emit a countdown event** for any FLOOD_WAIT the governor
  handles (satisfies EXE-02 "emits a countdown event consumers can display").
  Consumers decide whether to render sub-second/tiny waits.
- **D-10:** **Sleep = server-specified seconds + additive jitter.** Jitter is
  always additive (never sleep *less* than the server asked): `jitter ∈ [0, J]`
  where `J = clamp(0.1 * seconds, 1s, 5s)`. Purpose: de-synchronize retries and
  stay clear of the threshold. (Jitter source is implementation detail.)
- **D-11:** **Tiered absorption.** Set GramJS `floodSleepThreshold` to a moderate
  value (~60s) so the library auto-absorbs short waits silently; the governor
  catches `FloodWaitError` for longer waits, emits the countdown, and sleeps
  with jitter and resumes.
- **D-12:** **Upper ceiling.** For an absurdly long wait (recommend ceiling
  **3600s / 1 hour**), the governor does **not** silently block — it classifies it
  as a surfaced disposition (`fail` or a distinct `wait-too-long` code) so the
  consumer (Phase 5/6) can pause the job and inform the user rather than freezing
  the app. Below the ceiling: auto-sleep + resume.

### PEER_FLOOD & retry policy
- **D-13:** **PEER_FLOOD → `hard-stop`, zero retries.** The governor surfaces a
  distinct typed code and does not retry or swallow it (EXE-03). The governor's
  responsibility ends at *classify-distinctly-and-don't-retry*; **job-level abort,
  per-group checkpointing, and the user warning are Phase 5's** responsibility
  consuming this signal. (Whether the queue is torn down vs. the single op rejected
  is a Phase 5 concern — Phase 2 just must not retry and must keep PEER_FLOOD
  type-distinct from FLOOD_WAIT.)
- **D-14:** **Bounded retry for transient errors.** Network/timeout/transient
  failures get up to **3 retries with exponential backoff + jitter** (~1s, 2s, 4s),
  then → `fail`. FLOOD_WAIT (`wait`) is **not** counted against the retry budget —
  it is sleep-and-resume up to the D-12 ceiling. PEER_FLOOD = 0 retries.

### Claude's Discretion
- Queue library choice: **p-queue (concurrency=1)** per STACK.md is the
  recommendation, but a small hand-rolled serial promise chain is acceptable if the
  planner prefers zero new deps. `p-queue` is **not yet installed** (only `telegram`
  is in package.json) — adding it is a planning decision.
- Exact event names/shapes the governor emits (countdown tick, retry attempt,
  hard-stop), the disposition enum's concrete member names, the governor class
  surface (`run`/`schedule`/`enqueue`), and where it's instantiated in
  `SessionManager` are all planner's discretion as long as the dispositions and
  serialization guarantees above hold.
- Proactive fixed inter-call delay (STACK.md suggests 1–2s between calls) is
  optional tuning — recommend leaving a hook for it but defaulting to 0 and relying
  on FLOOD_WAIT back-off, to avoid slowing small jobs needlessly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — product definition, core value, the rate-limit & safety constraints
- `.planning/REQUIREMENTS.md` — v1 requirements (this phase: EXE-01, EXE-02, EXE-03)
- `.planning/ROADMAP.md` §"Phase 2" — phase goal and the four success criteria

### Prior-phase decisions (load-bearing — the D-18 seam this phase resolves)
- `.planning/phases/01-foundation-auth-session-portable-shell/01-CONTEXT.md` §D-13, §D-18 — the FLOOD_WAIT-during-login countdown and the explicit "Phase 2 generalizes this" cross-phase flag

### Research (load-bearing for this phase)
- `.planning/research/STACK.md` — GramJS `floodSleepThreshold` semantics (auto-sleep ≤ threshold, throws `FloodWaitError` above), p-queue concurrency=1 recommendation, proactive inter-call delay guidance
- `.planning/research/ARCHITECTURE.md` — service/MTProto-client design and where the governor sits relative to SessionManager
- `.planning/research/PITFALLS.md` — FLOOD_WAIT vs PEER_FLOOD handling, shared-api_id flood risk, the "use `errorMessage` not `message`" GramJS error-shape caveat (Pitfall 4)

### Existing code this phase extends (full paths)
- `src/main/telegram/floodWait.ts` — `floodWaitSeconds()`, `startFloodCountdown()`, `FloodWaitController` (injectable `TimingSource` — the D-18 seam to reuse)
- `src/main/telegram/errors.ts` — `classifyTelegramError()` (auth-specific; do NOT refactor — D-02)
- `src/main/telegram/SessionManager.ts` — owns the `TelegramClient`; where the governor gets instantiated and the operational call surface is routed (D-05, D-08)
- `src/main/telegram/__mocks__/telegramClient.ts` — mock client to drive the governor's mock-client tests (success criterion #4)
- `src/shared/authTypes.ts` — `FloodTick`, `AuthErrorCode` (the new disposition enum lives alongside, likely in shared types)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`FloodWaitController` / `startFloodCountdown()` (`floodWait.ts`)** — built in
  Phase 1 with a constructor-injectable `TimingSource` *specifically* as the D-18
  seam for this governor. Reuse as the governor's countdown/timing mechanism;
  tests drive it with `vi.useFakeTimers()`.
- **`floodWaitSeconds()` (`floodWait.ts`)** — shared FLOOD_WAIT duration parser;
  both the auth classifier and the new operation classifier use it (D-03).
- **Mock client (`__mocks__/telegramClient.ts`)** — the established pattern for
  deterministically testing Telegram error paths without a network (criterion #4).

### Established Patterns
- **`errorMessage`-not-`message` branching** — the existing classifier branches on
  GramJS's `errorMessage` field (PITFALLS Pitfall 4). The new classifier MUST follow
  the same convention.
- **Typed-enum-at-the-boundary** — Phase 1 established that NO raw Telegram string
  crosses a layer boundary; every error is mapped to a typed code first. The new
  disposition classifier continues this.
- **Injectable timing/clock for testability** — Phase 1's `TimingSource` injection
  pattern (fake timers in tests, real timers in prod) is the model for the
  governor's sleep/back-off so FLOOD_WAIT and retry-backoff are testable without
  real waits.

### Integration Points
- The governor is instantiated inside / alongside **`SessionManager`** (which owns
  the single `TelegramClient`) and becomes the funnel for every Phase 3+ call.
  Phases 3/4/5 call `governor.run(() => client.…)` rather than the client directly.
- The disposition enum becomes the **contract Phase 5's executor consumes** to
  decide skip-this-group vs fail-vs hard-stop-the-job.

</code_context>

<specifics>
## Specific Ideas

No specific user references — the user delegated decisions. The guiding intent
(from PROJECT.md / ROADMAP overview) is that this governor is the *load-bearing
safety infrastructure*: "no feature built later can flood the account." Bias every
ambiguous call toward protecting the user's real Telegram account over speed.

</specifics>

<deferred>
## Deferred Ideas

- **Removal-specific error codes** (USER_PRIVACY_RESTRICTED, CHAT_ADMIN_REQUIRED,
  USER_NOT_PARTICIPANT, USER_ADMIN_INVALID, etc.) and their skip/fail mapping —
  Phase 5, registered against this phase's extensible disposition framework.
- **Job-level abort, per-group checkpointing, and crash recovery** on PEER_FLOOD —
  Phase 5 (EXE-04/05 territory; the governor only emits the distinct signal).
- **On-screen rendering of the countdown / live progress UI** — Phase 5/6. Phase 2
  only emits the events.
- **Proactive fixed inter-call pacing tuning** — leave a hook; revisit if the
  shared api_id shows flood pressure in real runs.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 2-Rate-Limit Governor & Error Classification*
*Context gathered: 2026-06-11*
