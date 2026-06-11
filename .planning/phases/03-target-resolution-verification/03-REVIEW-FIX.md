---
phase: 03-target-resolution-verification
fixed_at: 2026-06-11T20:10:00Z
review_path: .planning/phases/03-target-resolution-verification/03-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-06-11T20:10:00Z
**Source review:** .planning/phases/03-target-resolution-verification/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (3 Critical, 5 Warning; 6 Info findings excluded by fix_scope=critical_warning)
- Fixed: 8
- Skipped: 0

**Verification:** Full vitest suite after every fix: 112 passing (+9 new tests added with the fixes). The only failures are the 2 pre-existing `src/main/telegram/config.test.ts` env-var failures (MRPROPER_API_ID/MRPROPER_API_HASH unset) — explicitly out of scope, present before any fix. `tsc --noEmit` (both tsconfig.node.json and tsconfig.web.json): zero NEW errors; CR-02 additionally **cleared 4 pre-existing** type errors in TargetResolver.ts.

## Fixed Issues

### CR-01: TargetCard violates Rules of Hooks — guaranteed React crash on first resolution

**Files modified:** `src/renderer/target/TargetCard.tsx`
**Commit:** 93ed262
**Applied fix:** Moved both `useMemo` calls above the conditional early return by deriving a nullable `t` binding (`resolved`/`confirmed` → target, else null) and feeding the memos `t?.avatar ?? null` / `t?.name ?? ''`. The early return now happens after all hooks. Both `eslint-disable react-hooks/rules-of-hooks` comments removed.

### CR-02: Resolution always fails in production — GramJS IDs are `big-integer` objects, not native `bigint`

**Files modified:** `src/main/telegram/TargetResolver.ts`, `src/main/telegram/__mocks__/telegramClient.ts`, `src/main/telegram/targetResolver.test.ts`
**Commit:** f75ae83
**Applied fix:**
- TargetResolver: replaced `typeof peer.userId !== 'bigint'` duck-typing with a `LongLike { toString(): string }` presence check, and replaced the reference-equality `u.id === peer.userId` user lookup with decimal-string comparison (`u.id.toString() === peerIdStr`) in both username and phone paths. Private `_resolvedUserId`/`_resolvedAccessHash` are normalized to native bigint via `BigInt(x.toString())` (works for both shapes; Phase 4 reconstructs the GramJS long with `bigInt(id.toString())`). `_fetchBio` now passes the original GramJS BigInteger objects through to `Api.InputPeerUser` unchanged (type-only `import type { BigInteger } from 'big-integer'`) and skips the call when accessHash is absent instead of sending a fabricated zero hash.
- Mock client: returns `bigInt(...)` instances (`big-integer` package, the exact production shape — typeof 'object') for `peer.userId`, `user.id`, and `accessHash` in both ResolveUsername and ResolvePhone responses, eliminating the mock/production divergence that masked the bug.
- Test added: resolution succeeds when IDs are big-integer objects; asserts `typeof === 'object'` and that peer/user ID instances are never reference-equal.
- Note: `big-integer` is imported only as a type in production code and at runtime only in the test mock; it is a guaranteed transitive dependency of the pinned `telegram@2.26.22` and was not added to package.json.

### CR-03: `TARGET_NO_PUBLIC_PROFILE` is unreachable — misclassified as NETWORK, wrong user-facing copy

**Files modified:** `src/main/telegram/operationErrors.ts`, `src/main/telegram/TargetResolver.ts`, `src/main/telegram/__mocks__/telegramClient.ts`, `src/main/telegram/operationErrors.test.ts`, `src/main/telegram/targetResolver.test.ts`
**Commit:** 8faf765
**Applied fix:** Added the `TARGET_NO_PUBLIC_PROFILE → { code: 'TARGET_NO_PUBLIC_PROFILE', disposition: 'fail' }` branch to `classifyRpcError` alongside the other Phase 3 codes. Both TargetResolver throw sites now attach `errorMessage: 'TARGET_NO_PUBLIC_PROFILE'` to the thrown Error so the outer catch in `resolve()` classifies it correctly instead of falling into the `!errorMessage` → NETWORK branch. Added a `resolveUsernameChannelPeer` mock option (returns a `PeerChannel`-shaped peer with `channelId`, no `userId`). Tests added: classifier mapping test, and a resolver test asserting a channel-username resolution emits error code `TARGET_NO_PUBLIC_PROFILE`, not `NETWORK`.

### WR-01: Two independent RateLimitGovernor instances break the account-wide concurrency=1 guarantee

**Files modified:** `src/main/index.ts`, `src/main/telegram/SessionManager.ts`, `src/main/telegram/TargetResolver.ts`
**Commit:** 08f366c
**Applied fix:** Added an optional `governor?: RateLimitGovernor` constructor option to both SessionManager and TargetResolver (`options.governor ?? new RateLimitGovernor(...)` — private instance constructed only for tests). `main/index.ts` now constructs ONE account-wide `RateLimitGovernor` (with the single `[governor]` log + `OP_GOVERNOR_EVENT` renderer bridge, closing over the mutable `currentWin`) and injects it into both consumers, restoring the account-wide serial queue. The duplicate per-feature `onGovernorEvent` bridges were removed.

### WR-02: Avatar fetch failure aborts the entire resolution — no graceful degradation

**Files modified:** `src/main/telegram/TargetResolver.ts`, `src/main/telegram/__mocks__/telegramClient.ts`, `src/main/telegram/targetResolver.test.ts`
**Commit:** cab5a6a
**Applied fix:** Wrapped `_fetchAvatar` in try/catch mirroring `_fetchBio` — any download error returns `null` (D-12 initials-avatar + no-photo-notice fallback) instead of discarding the successful identity resolution. Added a `downloadProfilePhotoError` mock option (RPC-shaped so the governor fails immediately rather than running NETWORK backoff in tests) and a test asserting a thrown download still yields `step: 'resolved'` with `avatar: null`.

### WR-03: No in-flight guard / generation token in TargetResolver

**Files modified:** `src/main/telegram/TargetResolver.ts`, `src/main/telegram/targetResolver.test.ts`
**Commit:** 245204c
**Applied fix:** Added a `_generation` counter: `resolve()` claims `gen = ++this._generation`; `reset()` increments it before clearing state. The generation is checked (a) inside `_resolveByUsername`/`_resolveByPhone` immediately before writing `_resolvedUserId`/`_resolvedAccessHash` (stale → throws a module-level `STALE_RESOLUTION` sentinel, also skipping the now-pointless bio/avatar governed calls), and (b) in `resolve()` before emitting both the resolved and error states (stale → silent return). Tests added: reset-during-in-flight-resolve leaves state idle with `getResolvedUser() === null` and never emits a post-reset `resolved`; overlapping resolves — the newest wins and `getResolvedUser()` matches the displayed identity.

### WR-04: TARGET_RESOLVE Zod schema has no maximum length

**Files modified:** `src/main/ipc/targetChannels.ts`, `src/main/ipc/targetChannels.test.ts`
**Commit:** db046ec
**Applied fix:** Schema is now `z.string().trim().min(1).max(64)` — bounds the input (64 covers `https://t.me/` + max username/phone forms) and rejects whitespace-only payloads (also closes IN-03). Tests added: whitespace-only payload rejected, 65-char payload rejected (resolver never called in either case), plus an in-bounds sanity test.

### WR-05: Typing `@` is impossible — the link-normalization branch eats it on every keystroke

**Files modified:** `src/renderer/target/TargetInput.tsx`
**Commit:** 20d86bf
**Applied fix:** Removed `value.trim().match(/^@/)` from the `isLink` condition in `handleInputChange` — inline rewriting is now reserved for genuine URL pastes (`https?://`, `t.me/`). The leading `@` stays in the raw input while typing; it is still stripped during dispatch normalization (D-04), so resolution behavior is unchanged.

## Out of Scope (not fixed)

Info findings IN-01 through IN-06 were excluded by `fix_scope: critical_warning`. Note: IN-03's substantive gap (whitespace-only payload) was incidentally closed by the WR-04 `.trim()` fix and has a boundary test.

The 2 pre-existing `config.test.ts` failures (MRPROPER_API_ID/MRPROPER_API_HASH env vars unset) were explicitly out of scope and untouched.

---

_Fixed: 2026-06-11T20:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
