---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
fixed_at: 2026-10-03T22:23:37Z
review_path: .planning/phases/14-addexecutor-dispatch-privacy-fallback-audit/14-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-10-03T22:23:37Z
**Source review:** .planning/phases/14-addexecutor-dispatch-privacy-fallback-audit/14-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-04)
- Fixed: 7
- Skipped: 0

All commits were made on an isolated worktree branch (`gsd-reviewfix/14-*`), fast-forwarded
onto `main` after this report was produced. The full suite (`tsc --build` then `vitest run`
with `.env` loaded) is green: **501 passed / 37 test files**, up from 489 before this pass
(12 new/adjusted regression tests across the 7 commits).

## Fixed Issues

### CR-01: Resuming a previously-skipped dialog writes duplicate/contradictory entries into add-job.json

**Files modified:** `src/main/storage/addAuditStore.ts`, `src/main/storage/addAuditStore.test.ts`
**Commit:** a31c11f
**Status:** fixed: requires human verification (state-handling logic fix — exercised by a new
regression test, but a human should confirm the dedup-by-dialogId semantics are correct for
every future caller of `checkpoint()`)
**Applied fix:** `AddAuditStore.checkpoint()` now filters out any existing entry with the same
`dialogId` before appending the new outcome (option (a) from the review), so a continuation
resume reprocessing a previously-`skipped` dialog replaces the stale row instead of duplicating
it. Added a test asserting that checkpointing the same `dialogId` twice (skipped → done) leaves
exactly one entry with the final status.

### CR-02: A non-privacy DM-send failure permanently wedges the Add feature for the rest of the session

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** 636f162
**Status:** fixed: requires human verification (control-flow/terminal-state logic — exercised by
two new regression tests covering the NETWORK and PEER_FLOOD branches)
**Applied fix:** The end-of-run DM-send catch no longer re-throws for every non-privacy error.
PEER_FLOOD now hard-stops the run (consistent with the main dispatch loop and T-14-11); any other
failure (NETWORK, exceeded FLOOD_WAIT, unrecognized RPC error) is logged via `console.error`
(message only, never DM text/links) and resolves `dmStatus` to `'refused'`, so `setStatus`,
`_emit`, and `appendBlock` still run and the executor always reaches a terminal state with
`_runActive` reset. Added tests for a NETWORK-classified SendMessage failure (run still reaches
`'complete'`) and a PEER_FLOOD SendMessage failure (run reaches `'hard-stopped'`).

### CR-03: PEER_FLOOD during invite-link export is swallowed into a per-group failure instead of hard-stopping the run

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`, `src/main/telegram/__mocks__/telegramClient.ts`
**Commit:** 94777cd
**Status:** fixed: requires human verification (hard-stop propagation logic across 5 call sites —
exercised by 4 new regression tests, but the interaction between the new shared
`_handleLoopHardStop()` helper and the pre-existing abort/generation guards is worth a human
read-through)
**Applied fix:** All five catch blocks wrapping `_buildPrivacyBlockedOutcome()` (both branches of
`_addToGroup`, both branches of `_classifyAddError`, and the end-of-run stale-link regeneration
loop) now re-check `classifyRpcError(err).disposition` and re-throw/abort on `'hard-stop'` instead
of swallowing it into an ordinary failure. Introduced a shared `_handleLoopHardStop()` helper so
the main dispatch loop handles a hard-stop surfacing from the nested `_classifyAddError()` call
identically to one surfacing directly from `_addToGroup()`. Extended the mock client with
`exportChatInvitePeerFloodPeerIds` to allow injecting a PEER_FLOOD specifically from
`ExportChatInvite`, and added 4 tests covering all three dispatch-time sites plus the
stale-link-regeneration site.

### WR-01: retryGroup() can propagate an uncaught hard-stop error, silently swallowed by the IPC layer

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** e969c12
**Status:** fixed: requires human verification (control-flow fix — exercised by a new regression
test)
**Applied fix:** `retryGroup()` now checks `classifyRpcError(err).disposition` before calling
`_classifyAddError()`, and again around that nested call (which can itself surface a hard-stop via
its own `ExportChatInvite` call per CR-03). On hard-stop it calls a new `_hardStopRetry()` helper
that logs the dialog id and explicitly transitions state to `'hard-stopped'`, instead of letting
the error vanish into the fire-and-forget `.catch()` at the IPC boundary with zero feedback.

### WR-02: The AddChatUser fwd_limit retry fires on any non-terminal error, not just the intended fwd_limit rejection

**Files modified:** `src/main/telegram/AddExecutor.ts`, `src/main/telegram/addExecutor.test.ts`
**Commit:** bd0e6f8
**Status:** fixed: requires human verification (condition-scoping logic — exercised by a new
regression test using a FLOOD_WAIT that exceeds the governor's 3600s ceiling)
**Applied fix:** `_isKnownAddTerminalError()` now returns `true` (no retry) whenever
`classifyRpcError(err).disposition !== 'fail'` — covering `'hard-stop'` (as before), plus `'wait'`
(FLOOD_WAIT the governor could not fully absorb) and `'retry'` (NETWORK), which previously fell
through and triggered an immediate second governed call. Only a genuinely-unrecognized `'fail'`
disposition (UNKNOWN RPCError, presumed to be the undocumented fwd_limit rejection) is still
eligible for the one-shot D-03 retry.

### WR-03: renderTemplate()'s sequential global replace allows a target-controlled name to corrupt the DM text

**Files modified:** `src/main/ipc/templateChannels.ts`, `src/main/ipc/templateChannels.test.ts`
**Commit:** a7491fe
**Status:** fixed: requires human verification (string-substitution logic fix — exercised by a new
regression test)
**Applied fix:** `renderTemplate()` now does a single-pass `template.replace(/\{name\}|\{links\}/g, ...)`
with a callback that substitutes based on which alternative matched, so a target display name
containing the literal substring `{links}` (or `{name}`) can never be re-scanned by a later
replacement pass.

### WR-04: AddLogStore's security comment overstates what appendFileSync({ mode: 0o600 }) actually guarantees

**Files modified:** `src/main/storage/addLogStore.ts`, `src/main/storage/addLogStore.test.ts`
**Commit:** ffd0e02
**Status:** fixed
**Applied fix:** Implemented option (a) from the review: `appendBlock()` now defensively calls
`fs.chmodSync(path, 0o600)` once per store instance, before the first append, if the log file
already exists at that point (covering a stray pre-existing `add-log.txt`, e.g. restored from a
backup). Also corrected the module header comment to describe Node's actual
`fs.appendFileSync({ mode })` contract (mode only applies at file-creation time). Added two tests:
one confirming the defensive chmod fires exactly once when the file pre-exists, one confirming it
never fires when the file does not exist yet.

## Skipped Issues

None — all 7 in-scope findings were fixed.

---

_Fixed: 2026-10-03T22:23:37Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
