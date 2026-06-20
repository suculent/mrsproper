---
phase: 11-tagexecutor
reviewed: 2026-06-20T12:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/main/telegram/TagExecutor.ts
  - src/main/telegram/tagExecutor.test.ts
  - src/main/index.ts
findings:
  critical: 3
  warning: 3
  info: 2
  total: 8
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-06-20T12:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed TagExecutor.ts (state machine), tagExecutor.test.ts (unit tests), and src/main/index.ts
(wiring). Cross-referenced against RemovalExecutor.ts, tagClient.ts, operationErrors.ts,
tagApi.ts, and tagAuditStore.ts for correctness.

The generation-token guard (D-15), PEER_FLOOD hard-stop semantics, checkpoint ordering, and
_classifyTagError branch order are all correctly implemented and faithfully mirror
RemovalExecutor. The layer-224 TagClient is not double-wrapped in governor.run(). The GetParticipant
pre-flight correctly uses the main client through the governor, not tagClient.

Three blockers were found:
1. tagClient.connect() has no error-handler: if it throws, _connectingTagClient and _runActive
   are left permanently true, and tagClient.disconnect() is never called (no try/finally around
   the connect call itself).
2. tagInnerClient in index.ts is constructed with client.session.save() BEFORE sm.initialize()
   runs — on a fresh login (savedSession == '') the inner client holds an empty session and
   will fail authentication when TagClient.connect() is invoked.
3. TARGET_RESET (registerTargetChannels) is not wired to tagExecutor.abortExecution() — a
   TARGET_RESET mid-tag-run leaves the tag executor running against a cleared resolver.

RemovalExecutor.ts and related removal files were not modified (confirmed via file listing and
targeted grep; no findings touch those files).

---

## Critical Issues

### CR-01: tagClient.connect() not wrapped in try/finally — permanent state corruption on connect failure

**File:** `src/main/telegram/TagExecutor.ts:191-194`
**Issue:** The connect window between `_connectingTagClient = true` and `_connectingTagClient = false`
is not protected by a try/finally. If `this._tagClient.connect()` throws (network error, stale
session, AllTLObjects race), `_connectingTagClient` is left permanently `true` and `_runActive`
is left `true`. All future calls to `execute()` will hit the guard at line 181 and return
immediately (emitting idle) — the executor is permanently wedged. Furthermore, `tagClient.disconnect()`
is never called (the `try/finally` at line 227 is not yet entered), so the inner TelegramClient
is left in an indeterminate state.

**Fix:**
```typescript
// Connect the layer-224 tagClient (brief mutex around the connect window)
this._connectingTagClient = true
try {
  await this._tagClient.connect()
} catch (connectErr) {
  this._connectingTagClient = false
  this._runActive = false
  this._emit({
    ...this._currentState,
    step: 'idle',
    floodWaitRemaining: null,
  })
  return
}
this._connectingTagClient = false
```

Alternatively, wrap the entire section from the `_connectingTagClient = true` assignment through
the try/finally block so that disconnect() is also guaranteed on connect failure.

---

### CR-02: tagInnerClient constructed with stale session (client.session.save() called before sm.initialize())

**File:** `src/main/index.ts:322-327`
**Issue:** `tagInnerClient` is constructed at line 322 using `client.session.save()`. At that
point `sm.initialize()` has NOT yet been called (it runs at line 382). On a fresh-login path
(`savedSession == ''`), `client.session.save()` returns an empty string — the `tagInnerClient`
is initialized with an empty `StringSession`. When the user later logs in (populating `client.session`),
the `tagInnerClient`'s session remains frozen at the empty value captured at construction time.
On first login, `TagClient.connect()` will attempt to authenticate with an empty session and
will fail (likely with AUTH_KEY_UNREGISTERED or a connection error), silently falling through
as `UNKNOWN` in `_classifyTagError`.

On a returning-user path (`savedSession` is non-empty), the session string is valid at
construction time but is a static copy — if the session rotates mid-run (e.g. after a server-side
re-auth), the `tagInnerClient` holds a stale string. The main client's session is kept live by
GramJS; the `tagInnerClient`'s session is not.

**Fix:** Construct `tagInnerClient` lazily — inside `TagExecutor.execute()` or inside
`TagClient.connect()` — using `client.session.save()` at the moment just before `connect()` is
called, so the session string is current. Alternatively, pass the main client's session object
(not a saved string snapshot) so the inner client shares the live session reference.

```typescript
// Option A: defer tagInnerClient construction to just before connect, inside TagClient
async connect(): Promise<void> {
  if (this._connecting) throw new Error('TagClient: connect() already in progress')
  // Rebuild session from live main client immediately before connect
  const sessionStr = this._getSessionString() // injected callback
  this._inner = new TelegramClient(new StringSession(sessionStr), ...)
  ...
}
```

A simpler short-term fix that avoids restructuring: move the `tagInnerClient` construction to
after `await sm.initialize(savedSession || undefined)` (line 382), though this requires
deferring `tagClientInstance` and `tagExecutor` construction as well.

---

### CR-03: TARGET_RESET does not abort the tag executor — tag run continues against cleared resolver

**File:** `src/main/index.ts:377`
**Issue:** `registerTargetChannels(currentWin, resolver, scanner, searcher, executor)` passes the
`RemovalExecutor` as the `executor` argument but does NOT pass `tagExecutor`. The `TARGET_RESET`
handler at `targetChannels.ts:97` calls `executor?.abortExecution()` — this aborts removal
but leaves any in-flight tag run running. After `resolver.reset()` fires, the tag executor's
next call to `this._resolver.getResolvedUser()` (in the generation guard or at a new execute)
returns `null`, but the CURRENT in-flight run has already captured `resolved` and `targetId`
from the start — so it continues tagging the stale (now-cleared) target.

This is a security concern: the user resets to pick a different target, but the tag run is still
writing the old target's tag to groups until it naturally completes.

**Fix:**
```typescript
// src/main/index.ts — pass tagExecutor to registerTargetChannels
registerTargetChannels(currentWin, resolver, scanner, searcher, executor, tagExecutor)
```

Update `registerTargetChannels` signature to accept an optional second executor:
```typescript
export function registerTargetChannels(
  win: BrowserWindow,
  resolver: TargetResolver,
  scanner: { abortScan(): void },
  searcher: { abortSearch(): void },
  executor?: { abortExecution(): void },
  tagExecutor?: { abortExecution(): void }
): void {
  ...
  ipcMain.handle(TARGET_RESET, () => {
    executor?.abortExecution()
    tagExecutor?.abortExecution()
    ...
  })
}
```

---

## Warnings

### WR-01: Generation guard #4 (post-loop) returns without clearing _runActive or writing audit status

**File:** `src/main/telegram/TagExecutor.ts:360-363`
**Issue:** When generation guard #4 fires (line 361), the function returns without setting
`this._runActive = false` or calling `this._auditStore.setStatus(...)`. The new `execute()`
call will immediately overwrite `_runActive = true` so the window is narrow, but if
`abortExecution()` fires in this exact gap (e.g. during the `await` that triggers the generation
change), `_runActive` stays `true` and `_handleGovernorEvent` continues forwarding events for
a run that has silently ended. The audit file also retains status `'running'` rather than
`'stopped'`.

This is the same pattern as `RemovalExecutor.ts:343` (the reference implementation has the same
omission), so this may be an accepted limitation — but it should be documented or fixed
consistently.

**Fix:** Mirror the stopped path — set `_runActive = false` and call `setStatus('stopped')` in
guard #4:
```typescript
if (gen !== this._generation || signal.aborted) {
  this._auditStore.setStatus('stopped')
  this._runActive = false
  return
}
```

---

### WR-02: tagInnerClient constructed WITHOUT floodSleepThreshold: 0 — FLOOD_WAIT may be silently absorbed

**File:** `src/main/index.ts:322-327`
**Issue:** The main client at line 149 is constructed with `floodSleepThreshold: 0` so that
all FLOOD_WAIT errors reach the governor (as required by D-09). The `tagInnerClient` at line 322
is constructed with `{ connectionRetries: 5 }` only — `floodSleepThreshold` defaults to `60`
(GramJS default). This means FLOOD_WAIT responses on tag writes where the wait is ≤ 60 seconds
will be silently absorbed by GramJS inside the inner client's invoke loop rather than thrown to
the governor. The governor never sees these floods, so:
  - No `flood-tick` events are emitted for the UI countdown.
  - The `p-queue` concurrency-1 guarantee is bypassed for the duration of the sleep.
  - The tag run hangs silently without surfacing progress to the user.

**Fix:**
```typescript
const tagInnerClient = new TelegramClient(
  new StringSession(client.session.save() as unknown as string),
  API_ID,
  API_HASH,
  {
    connectionRetries: 5,
    floodSleepThreshold: 0,  // Required: same as main client — all floods must reach the governor
  }
)
```

---

### WR-03: _classifyTagError hard-stop re-throw is dead code when called from the outer catch block

**File:** `src/main/telegram/TagExecutor.ts:500-508`
**Issue:** `_classifyTagError()` starts by calling `classifyRpcError(err)` and re-throwing on
`hard-stop` (lines 505-508). However, it is only ever called from the outer catch block at
line 293, which has already checked for `hard-stop` at line 275 and returned (line 290) before
reaching line 293. No hard-stop error can ever reach `_classifyTagError`. The re-throw is dead
code in all current call paths.

This diverges from `_classifyRemovalError` in RemovalExecutor.ts, where the hard-stop check
is at the END (lines 638-641), after named-string checks — and IS reachable because it's called
without a prior hard-stop filter in the outer catch. TagExecutor's outer catch pre-filters before
delegating, making the re-throw inside `_classifyTagError` unreachable.

The code is not wrong per se, but the dead branch creates a false impression that `_classifyTagError`
is a standalone classifier (callable with any error), when in practice it requires a pre-filtered
caller. If the outer catch is ever refactored, the dead branch could become a false safety net
(not reached because the outer catch still filters first).

**Fix:** Either document clearly that `_classifyTagError` expects non-hard-stop errors only and
remove the internal re-throw, OR restructure to match `_classifyRemovalError` where the outer
catch does NOT pre-filter and the named-string checks come first.

---

## Info

### IN-01: Test comment in §4.3 lifecycle test cites wrong guard mechanism

**File:** `src/main/telegram/tagExecutor.test.ts:666-667`
**Issue:** The comment says "Because _runActive is true, the idle assertion fails early → connect
NOT called again." The actual guard that short-circuits the second execute() is
`_connectingTagClient` (line 181 of TagExecutor.ts), not a `_runActive` check. `_runActive` is
set to `true` at the top of both calls but is not checked before connect; the `_connectingTagClient`
flag is what prevents the second connect. The test passes correctly but the comment misleads
future readers about which invariant provides the protection.

**Fix:** Update the comment:
```typescript
// Second execute() while first is in-flight:
// The first call sets _connectingTagClient = true during its connect window;
// the second call hits the _connectingTagClient guard at line 181 and returns early
// without calling connect() again.
```

---

### IN-02: Redundant double-classification of PEER_FLOOD in the outer catch block

**File:** `src/main/telegram/TagExecutor.ts:272-293`
**Issue:** In the outer catch block (line 272), `classifyRpcError(err)` is called at line 274
to check for hard-stop. If not hard-stop, `_classifyTagError(err, dialog.id)` is called at
line 293, which calls `classifyRpcError(err)` again internally (line 505). PEER_FLOOD is
classified twice per error for all non-hard-stop paths (which never contain PEER_FLOOD by
definition, making the second call's hard-stop branch dead). This is a minor redundancy — no
behavioral impact — but adds complexity compared to the cleaner
`_classifyRemovalError` pattern where classification is consolidated.

**Fix:** Remove the pre-check in the outer catch and let `_classifyTagError` handle all
classification (including re-throwing hard-stop), matching the RemovalExecutor pattern:
```typescript
} catch (err) {
  // _classifyTagError re-throws on hard-stop (Pitfall 1), returns outcome otherwise
  outcome = this._classifyTagError(err, dialog.id)
}
```
This requires the hard-stop block in `_classifyTagError` to become the primary hard-stop handler
(emitting hard-stopped state and returning), not a re-throw.

---

_Reviewed: 2026-06-20T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
