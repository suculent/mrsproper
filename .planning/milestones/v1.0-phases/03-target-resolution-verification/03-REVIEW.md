---
phase: 03-target-resolution-verification
reviewed: 2026-06-11T17:22:43Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - src/main/index.ts
  - src/main/ipc/targetChannels.test.ts
  - src/main/ipc/targetChannels.ts
  - src/main/telegram/TargetResolver.ts
  - src/main/telegram/__mocks__/telegramClient.ts
  - src/main/telegram/operationErrors.test.ts
  - src/main/telegram/operationErrors.ts
  - src/main/telegram/targetResolver.test.ts
  - src/preload/index.ts
  - src/renderer/components/ui/badge.tsx
  - src/renderer/ipc/targetClient.ts
  - src/renderer/shell/AppShell.tsx
  - src/renderer/shell/StubbedWorkflowRegions.tsx
  - src/renderer/store/targetStore.ts
  - src/renderer/target/TargetCard.tsx
  - src/renderer/target/TargetInput.tsx
  - src/renderer/target/resolveCopy.ts
  - src/shared/channels.ts
  - src/shared/opTypes.ts
  - src/shared/targetTypes.ts
findings:
  critical: 3
  warning: 5
  info: 6
  total: 14
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-11T17:22:43Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Phase 3 (target resolution & verification) was reviewed across main-process service code (TargetResolver, targetChannels, operationErrors), the preload bridge, renderer UI (TargetInput, TargetCard, targetStore), and shared types. The security boundary is structurally sound: accessHash never appears in `ResolvedTargetDTO` or any IPC payload, all Telegram calls in TargetResolver route through `governor.run()`, and the IPC surface is Zod-validated.

However, the feature contains two independent production-breaking defects that the test suite cannot detect:

1. **The renderer crashes on the first successful resolution** — TargetCard calls hooks after a conditional early return (suppressed with eslint-disable), which violates React's hook invariant the moment the card transitions from hidden to visible.
2. **Resolution always fails against the real Telegram API** — TargetResolver duck-types peer IDs as native `bigint`, but GramJS (telegram@2.26.22) uses the `big-integer` library (plain objects, `typeof === 'object'`), so every real `ResolveUsername`/`ResolvePhone` response is rejected as "no public profile." The unit-test mock returns native `BigInt`, masking the divergence — tests pass, production is fully broken.

A third critical finding compounds the second: the synthetic `TARGET_NO_PUBLIC_PROFILE` error is never mapped by `classifyRpcError`, and the throw site drops the `errorMessage` field, so the user would see a misleading "Couldn't reach Telegram" network error instead of the intended copy.

The combination means the phase's core flow (resolve → verify → confirm) does not work end-to-end against the real API and would crash the UI even if it did. Warnings cover a broken account-wide serialization guarantee (two independent governor instances over one client), missing graceful degradation on avatar fetch, a missing in-flight/reset generation guard, an unbounded Zod string, and an input-handling defect that makes typing `@` impossible.

## Critical Issues

### CR-01: TargetCard violates Rules of Hooks — guaranteed React crash on first resolution

**File:** `src/renderer/target/TargetCard.tsx:74-82`
**Issue:** `useMemo` is called *after* a conditional early return:

```tsx
if (target.step !== 'resolved' && target.step !== 'confirmed') return null  // line 74
...
// eslint-disable-next-line react-hooks/rules-of-hooks
const avatarUrl = useMemo(() => bytesToDataUrl(t.avatar), [t.avatar])      // line 80
// eslint-disable-next-line react-hooks/rules-of-hooks
const initials = useMemo(() => getInitials(t.name), [t.name])              // line 82
```

TargetCard is mounted unconditionally in `StubbedWorkflowRegions`. On the initial render (`step: 'idle'`) it executes 1 hook (`useTargetStore`) and returns early. When the state transitions to `resolved`, the same component instance renders 3 hooks. React throws `"Rendered more hooks than during the previous render"`, which unmounts the component tree — the app UI dies the first time a user successfully resolves a target. Going back (resolved → idle via "Change target") triggers the mirror invariant ("Rendered fewer hooks..."). The two `eslint-disable react-hooks/rules-of-hooks` comments show the lint guard fired and was suppressed instead of fixed. There is no error boundary in the shell to contain the crash.
**Fix:** Move all hooks above the early return:

```tsx
export function TargetCard(): React.JSX.Element | null {
  const { target } = useTargetStore()
  const t = target.step === 'resolved' || target.step === 'confirmed' ? target.target : null
  const avatarUrl = useMemo(() => bytesToDataUrl(t?.avatar ?? null), [t?.avatar])
  const initials = useMemo(() => (t ? getInitials(t.name) : ''), [t?.name])
  if (!t) return null
  const isConfirmed = target.step === 'confirmed'
  ...
}
```

Remove both eslint-disable comments — they must never be needed again.

### CR-02: Resolution always fails in production — GramJS IDs are `big-integer` objects, not native `bigint`

**File:** `src/main/telegram/TargetResolver.ts:179, 186-188, 215-216, 222-224`
**Issue:** The peer check and user lookup assume native `bigint`:

```ts
const peer = resolved.peer as { userId?: bigint }
if (!peer || typeof peer.userId !== 'bigint') {        // line 179
  ... throw TARGET_NO_PUBLIC_PROFILE
}
const targetUser = (resolved.users as Array<{ id: bigint }>).find(
  (u) => u.id === peer.userId                          // line 187
)
```

Verified against the installed `telegram@2.26.22`: `tl/api.d.ts` declares `type long = BigInteger` from the `big-integer` package, and the runtime deserializer produces `big-integer` instances — plain objects. Therefore in production:

1. `typeof peer.userId` is `'object'`, never `'bigint'` → **every** real username/phone resolution (including valid users) falls into the `TARGET_NO_PUBLIC_PROFILE` throw at line 179/216. The feature is 100% broken against the real API.
2. Even if the typeof check were fixed, `u.id === peer.userId` compares `BigInteger` *objects by reference* — two distinct instances are never `===`, so `find()` returns undefined and resolution throws `USERNAME_NOT_OCCUPIED` for valid users.

The unit tests pass only because `__mocks__/telegramClient.ts` returns native `BigInt(...)` values (lines 184-196, 214-227), where both `typeof x === 'bigint'` and primitive `===` happen to work. This is a mock/production divergence that hides a total feature failure.
**Fix:** Compare via string form and accept both shapes; also store/reconstruct accordingly:

```ts
const peerUserId = (resolved.peer as { userId?: { toString(): string } })?.userId
if (peerUserId === undefined || peerUserId === null) { /* no-public-profile path */ }
const peerIdStr = peerUserId.toString()
const targetUser = (resolved.users as Array<{ id: { toString(): string } }>)
  .find((u) => u.id.toString() === peerIdStr)
```

Update `_resolvedUserId`/`_resolvedAccessHash` typing to the GramJS `BigInteger` type (or normalize to string and reconstruct with `bigInt(...)` for Phase 4 `Api.InputPeerUser`), and make the mock return `big-integer` instances (`bigInt('111111111')`) so tests exercise the real shape. Add one test asserting resolution succeeds when IDs are `big-integer` objects.

### CR-03: `TARGET_NO_PUBLIC_PROFILE` is unreachable — misclassified as NETWORK, wrong user-facing copy

**File:** `src/main/telegram/TargetResolver.ts:180-183, 216-219`; `src/main/telegram/operationErrors.ts:114-126`
**Issue:** Two compounding defects in the no-public-profile path:

1. `classifyRpcError` has **no branch** for `'TARGET_NO_PUBLIC_PROFILE'` (operationErrors.ts handles only `USERNAME_NOT_OCCUPIED` and `PHONE_NOT_OCCUPIED`), so `classifyRpcError({ errorMessage: 'TARGET_NO_PUBLIC_PROFILE' })` at TargetResolver.ts:182 returns `{ code: 'UNKNOWN', disposition: 'fail' }`. The `TARGET_NO_PUBLIC_PROFILE` member of `TargetErrorCode`/`OperationErrorCode` is dead — it can never be produced.
2. The throw then assigns only the *classified* fields onto the Error: `throw Object.assign(new Error('TARGET_NO_PUBLIC_PROFILE'), classified)`. The thrown error has `code`/`disposition` but **no `errorMessage` property**. The outer catch in `resolve()` (line 112) re-classifies it: empty `errorMessage` → the `!errorMessage` branch → `{ code: 'NETWORK', disposition: 'retry' }`.

Net effect: when a channel/group username (a non-user peer) is resolved, the user sees *"Couldn't reach Telegram. Check your connection and try again."* — actively misleading copy that sends the admin to debug their network. And because CR-02 currently funnels *every* production resolution through this path, this is the error every user would see for every lookup.
**Fix:** In `operationErrors.ts`, add a branch alongside the other Phase 3 codes:

```ts
if (errorMessage === 'TARGET_NO_PUBLIC_PROFILE') {
  return { code: 'TARGET_NO_PUBLIC_PROFILE', disposition: 'fail' }
}
```

In `TargetResolver.ts`, throw an error that carries `errorMessage` so the outer catch classifies it correctly:

```ts
throw Object.assign(new Error('TARGET_NO_PUBLIC_PROFILE'), {
  errorMessage: 'TARGET_NO_PUBLIC_PROFILE',
})
```

Add a classifier test (`TARGET_NO_PUBLIC_PROFILE → code TARGET_NO_PUBLIC_PROFILE, disposition fail`) and a resolver test where `resolved.peer` is a channel peer (no `userId`) asserting the error state code is `TARGET_NO_PUBLIC_PROFILE`, not `NETWORK`.

## Warnings

### WR-01: Two independent RateLimitGovernor instances break the account-wide concurrency=1 guarantee

**File:** `src/main/telegram/TargetResolver.ts:70-73`; `src/main/telegram/SessionManager.ts:128, 149`
**Issue:** TargetResolver constructs its own `new RateLimitGovernor(...)`, while SessionManager already owns one over the *same* `TelegramClient` (main/index.ts wires one client to both). The governor's serialization (EXE-01, "no feature can flood the account") is enforced per-instance via `_tail` — two instances are two independent serial queues, so a SessionManager-governed call (`getMe`, `downloadProfilePhoto`, `LogOut`) can execute concurrently with a resolver call. With `floodSleepThreshold: 0` every call hits Telegram unbuffered, and Phase 4+ will add a third consumer, multiplying the concurrency. The project constraint says *all* Telegram calls go through *the* rate-limit governor (singular).
**Fix:** Construct a single `RateLimitGovernor` in `main/index.ts` and inject it into both SessionManager and TargetResolver (add an optional `governor` constructor option, falling back to constructing one only for tests). This preserves account-wide serialization across features.

### WR-02: Avatar fetch failure aborts the entire resolution — no graceful degradation

**File:** `src/main/telegram/TargetResolver.ts:264-272`
**Issue:** `_fetchBio` is wrapped in try/catch (graceful: bio → null), but `_fetchAvatar` is not. `downloadProfilePhoto` performs network I/O and can throw (expired file reference, transient failure after the governor's retry budget, photo-download RPC errors). When it throws, the user's *already-successful* identity resolution is discarded and an error state is emitted — likely `UNKNOWN` or `NETWORK` — even though the DTO's primary purpose (visual identity confirmation) supports a documented no-photo fallback (D-12). The asymmetry with bio handling looks unintentional.
**Fix:** Mirror the bio pattern:

```ts
private async _fetchAvatar(user: ApiUserShape): Promise<Uint8Array | null> {
  try {
    const photoBuffer = await this._governor.run(() => this._client.downloadProfilePhoto(user))
    if (photoBuffer && photoBuffer.length > 0) return new Uint8Array(photoBuffer)
    return null
  } catch {
    return null  // D-12: fall back to initials avatar + no-photo notice
  }
}
```

### WR-03: No in-flight guard / generation token in TargetResolver — stale resolutions can overwrite newer state and survive reset()

**File:** `src/main/telegram/TargetResolver.ts:97-119, 136-140`
**Issue:** `resolve()` has no re-entrancy protection and `reset()` does not invalidate an in-flight resolution. Sequences that go wrong:
- `reset()` while a resolve is in flight: state goes `idle`, then the pending resolve completes and emits `resolved` — the cleared target resurrects, and `_resolvedUserId`/`_resolvedAccessHash` are repopulated *after* the reset that was supposed to clear them (violates D-14).
- Two overlapping `resolve()` calls (rapid double-Enter before the `resolving` push lands, or any future caller): the private `_resolvedUserId`/`_resolvedAccessHash` are written mid-flight by each path, so the *last emitted DTO* (what the admin sees and confirms) can correspond to a different user than what `getResolvedUser()` returns to Phase 4. For an app whose core promise is "never act on the wrong account," displayed-identity vs acted-identity divergence must be impossible by construction, not just discouraged by UI button disabling.
**Fix:** Add a generation counter:

```ts
private _generation = 0

async resolve(input: string): Promise<void> {
  const gen = ++this._generation
  ...
  if (gen !== this._generation) return   // check before every _emit and before assigning _resolvedUserId/_resolvedAccessHash
}
reset(): void {
  this._generation++   // invalidates any in-flight resolve
  ...
}
```

### WR-04: TARGET_RESOLVE Zod schema has no maximum length — unbounded string forwarded to the Telegram API

**File:** `src/main/ipc/targetChannels.ts:34-36`
**Issue:** `ResolveTargetSchema = z.object({ input: z.string().min(1) })` accepts arbitrarily large strings (a compromised or buggy renderer can send megabytes), which flow through `normalizeInput` and into `Api.contacts.ResolveUsername`/`ResolvePhone` on the wire. Telegram usernames max out at 32 chars and E.164 phones at 15 digits; everything beyond a small bound is garbage that wastes a governed API call and pokes the shared api_id with malformed requests. The project's stated posture is strict IPC input validation (ASVS V5) — bounding is part of that.
**Fix:** `input: z.string().trim().min(1).max(64)` (64 comfortably covers `https://t.me/` + username/phone forms). `.trim()` also closes the whitespace-only payload gap (see IN-03).

### WR-05: Typing `@` is impossible — the link-normalization branch eats it on every keystroke

**File:** `src/renderer/target/TargetInput.tsx:144-159`
**Issue:** `handleInputChange` treats `/^@/` as a "link" and replaces the field content with the normalized (`@`-stripped) value:

```ts
const isLink =
  value.trim().match(/^https?:\/\//i) ??
  value.trim().match(/^t\.me\//i) ??
  value.trim().match(/^@/)
setRawInput(isLink ? norm : value)
```

A user who follows the placeholder ("@username or phone number") and types `@` sees the character vanish on every keystroke — `normalizeInput('@')` yields `''`, and `'@j'` becomes `'j'`. D-04 specifies stripping the leading `@` during *paste/dispatch* normalization, not live while typing; the code's own comment ("otherwise use raw to allow natural editing") states the intent that this branch defeats. Functionally resolution still works (the username path strips `@` anyway), but the visible input fighting the user is a defect, and the mode chip flickers `none → username` confusingly.
**Fix:** Drop `value.trim().match(/^@/)` from the `isLink` condition — keep `@` in the raw input (detectMode already runs on the normalized value, and `buildDispatchValue` uses the normalized form). Reserve inline rewriting for genuine URL pastes only.

## Info

### IN-01: `registerTargetChannels` takes a `win` parameter it never uses

**File:** `src/main/ipc/targetChannels.ts:55-57`
**Issue:** The parameter is immediately discarded (`void win`) with a comment explaining it is "used indirectly by push helpers wired in main/index.ts" — i.e., not used here at all. Dead parameters invite callers to assume window-affinity that does not exist (and would be a stale-window bug if it did, per the WR-03 pattern in main/index.ts).
**Fix:** Remove the parameter: `registerTargetChannels(resolver: TargetResolver)`. Update the call site and tests.

### IN-02: Redundant refCount bookkeeping in targetStore duplicates `listeners.size` gating

**File:** `src/renderer/store/targetStore.ts:35-69`
**Issue:** `subscribe`/unsubscribe already gate start/stop on `listeners.size === 0`; `refCount` inside `startSubscriptions`/`stopSubscriptions` re-implements the same 0↔1 transition and can only ever hold 0 or 1. Two interlocking counters for one condition is a maintenance trap (a future caller of `stopSubscriptions` alone would drive refCount negative).
**Fix:** Delete `refCount`; have `startSubscriptions` guard on `targetStateSub !== null` instead.

### IN-03: Whitespace-only input passes IPC validation and emits a useless API call

**File:** `src/main/ipc/targetChannels.ts:35`; `src/main/telegram/TargetResolver.ts:98`
**Issue:** `' '` passes `z.string().min(1)`, then `input.trim()` in `resolve()` yields `''`, which routes to `ResolveUsername({ username: '' })` — a guaranteed-failing governed API call. Subsumed by the WR-04 fix (`.trim().min(1)`); listed separately so it gets its own test.
**Fix:** Covered by WR-04; add a test that `{ input: '   ' }` is rejected at the boundary.

### IN-04: FLOOD_WAIT error copy promises a countdown that may not exist

**File:** `src/renderer/target/resolveCopy.ts:15-16`; `src/main/telegram/governor.ts:151-162`
**Issue:** When the governor gives up on a flood (`seconds > 3600` ceiling, or `MAX_FLOOD_WAITS_PER_OP` budget exhausted), it emits `wait-too-long` (not `flood-tick`) and throws; the resolver maps this to error code `FLOOD_WAIT`, whose copy reads "Please wait for the countdown to finish" — but no countdown is running and the Find button is enabled. The user waits for nothing.
**Fix:** Either handle the `wait-too-long` GovernorEvent in targetStore (show a distinct "Telegram needs a longer break — try again later" message), or soften the FLOOD_WAIT copy to not reference a countdown unconditionally.

### IN-05: Flood-wait detection relies on `constructor.name` — fragile against bundling changes

**File:** `src/main/telegram/operationErrors.ts:52-57`
**Issue:** `isFloodWaitShaped` matches `ctorName === 'FloodWaitError'`. This currently works because `externalizeDepsPlugin()` keeps `telegram` un-bundled/un-minified, but any future change (bundling deps for portability, enabling main-bundle minification with class-name mangling) silently turns real FloodWaitErrors into `UNKNOWN`/fail — the prose `errorMessage` fallback regex won't match. A direct `instanceof` is immune.
**Fix:** `import { FloodWaitError } from 'telegram/errors'` and check `err instanceof FloodWaitError` first, keeping the token regex as the raw-RPC/mock fallback.

### IN-06: Dead fallback expression in `_buildDTO` name construction

**File:** `src/main/telegram/TargetResolver.ts:283`
**Issue:** `[firstName, lastName].filter(Boolean).join(' ').trim() || (user.firstName ?? '')` — if the left side is empty, `firstName` was necessarily falsy, so the right side is always `''`. The fallback is dead code that suggests handling that doesn't exist (e.g., deleted accounts with no name produce `name: ''`, which TargetCard then renders as an empty heading with empty initials unless `deleted` is set).
**Fix:** Replace with an explicit fallback, e.g. `|| 'Unknown account'` (or `'Deleted Account'` when `user.deleted`), and render the Ghost fallback whenever `!t.name`, not only when `t.deleted && !t.name`.

---

_Reviewed: 2026-06-11T17:22:43Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
