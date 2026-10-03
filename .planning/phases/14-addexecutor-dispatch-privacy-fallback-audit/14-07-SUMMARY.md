---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
plan: 07
subsystem: testing
tags: [typescript, vitest, gramjs-mock, tdd-red, continuation-resume]

# Dependency graph
requires:
  - phase: 14-addexecutor-dispatch-privacy-fallback-audit
    provides: "14-01: src/shared/addTypes.ts contract; 14-02: mock client RPC branches + TargetResolver deleted/bot/contact flags; 14-03: addAuditStore.ts + sameDialogIdSet()"
provides:
  - "src/main/telegram/addExecutor.test.ts: 54 failing it() cases across 12 describe blocks — the complete behavioral contract for AddExecutor (dispatch, unban-first, D-05 guard, already-member dual signal, privacy-blocked+link, channel-full branching, error classification, PEER_FLOOD/abort/generation guard, D-20 continuation-based resume, end-of-run DM, add-log append, retryGroup)"
affects: [14-08, 14-09, 14-10, 14-11, AddExecutor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test-factory convention extended for a 4th injected dependency (scanner) beyond TagExecutor/RemovalExecutor's client/governor/enumerator/resolver/auditStore set — makeScanner() mirrors MembershipScanner's getState() shape"
    - "InstrumentedAddAuditStore type alias (ReturnType<typeof makeAddAuditStore>) used for the makeExecutor config/return types to prevent TypeScript from widening a nullable-coalesced fake store back down to the bare AddAuditStore interface, which would silently drop checkpointCalls/initJobCalls/setStatusCalls/_job from the inferred type"
    - "vi.spyOn(mockClient, 'invoke') used (only where call-order matters, e.g. unban-before-invite) instead of wrapping invoke in vi.fn() globally, since createMockTelegramClient's invoke is a plain async function, not a pre-wrapped mock"
    - "Two-executor-instance segment simulation for the cross-segment DM resume test: a second makeExecutor() call sharing the SAME auditStore instance as the first models a stop -> relaunch -> resume cycle realistically (a fresh AddExecutor object per process launch, not the same instance resuming itself)"

key-files:
  created: [src/main/telegram/addExecutor.test.ts]
  modified: []

key-decisions:
  - "Split two of the plan's single-bullet behaviors into two it() cases each (DM-dispatch's 'stopped OR hard-stopped mid-run' bullet, and add-log's 'stops or hard-stops' bullet) so both sub-cases get independent, unambiguous assertions rather than one test asserting an OR condition — net 54 it() cases against the plan's ~50 listed bullets, all listed behaviors covered with no gaps"
  - "USERS_TOO_MUCH on AddChatUser (basic-group) test additionally asserts addChatUserCalls.length === 1, confirming the recognized-terminal-error path does NOT trigger the D-03 fwd_limit retry — strengthens the plan's literal requirement without contradicting it"
  - "The cross-segment DM resume test (two segments, one link each) instantiates a SECOND AddExecutor via makeExecutor() sharing the first segment's auditStore, modeling a real stop -> app-relaunch -> resume flow rather than resuming the same in-memory executor object"
  - "ExportChatInvite title/expireDate test uses a 61-character display name specifically so the 32-char truncation and the 'Admin • ' prefix are both exercised simultaneously"

patterns-established:
  - "Pattern: when a test needs call-ORDER assertions (not just call-count) against the shared createMockTelegramClient mock, wrap mockClient.invoke with vi.spyOn() locally in that one test rather than restructuring the shared mock factory"

requirements-completed: [ADD-06, ADD-07, ADD-08, ADD-09, ADD-10, ADD-11]

# Metrics
duration: 35min
completed: 2026-10-03
---

# Phase 14 Plan 07: AddExecutor Test Suite (RED) Summary

**Wrote all 54 failing `addExecutor.test.ts` tests across 12 describe blocks — the complete D-01..D-20 behavioral contract for `AddExecutor`, including the D-20 continuation-based resume rule that has no analog in `RemovalExecutor`/`TagExecutor` — with every test failing solely on the expected `Cannot find module './AddExecutor'` import error.**

## Performance

- **Duration:** ~35 min (context gathering + authoring + verification)
- **Started:** 2026-10-03T23:00:00+02:00 (approx)
- **Completed:** 2026-10-03T23:35:00+02:00 (approx)
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments
- `src/main/telegram/addExecutor.test.ts` created: 1456 lines, 12 `describe()` blocks, 54 `it()` cases, covering every behavior bullet in the plan's `<behavior>` block (dispatch mechanics for both RPCs, unban-before-invite sequencing, D-05 deleted/bot zero-traffic guard, D-06 dual-signal already-member, D-07/D-09/D-10 privacy-block + inline link export, D-12 channel-full branching for both RPCs, D-19 error classification table, PEER_FLOOD hard-stop/abort/generation-guard ordering mirroring TagExecutor exactly, D-20 continuation-based resume with all 5 required resume scenarios, D-13/D-14 end-of-run DM dispatch including the two-segment cross-resume link-aggregation case, D-17/D-18 add-log append semantics, and `retryGroup()`).
- Confirmed RED for the correct reason: `npx vitest run src/main/telegram/addExecutor.test.ts` exits non-zero with `Error: Cannot find module './AddExecutor'` — not a missing-fixture or typo error.
- Confirmed `npx tsc --build` reports exactly one error (the same missing-module error) after fixing a TypeScript inference issue (see Deviations) — the rest of the project typechecks cleanly.
- Confirmed the full suite is otherwise unaffected: `npx vitest run` (with `.env` loaded) reports 35/36 test files passing with 417 tests passing; only the new file fails, and only on import.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write all failing addExecutor.test.ts tests (RED)** - `30bba36` (test)

**Plan metadata:** (this commit, created after this summary)

## Files Created/Modified
- `src/main/telegram/addExecutor.test.ts` - New test file: `makeDialog`/`makeAddAuditStore`/`makeAddLogStore`/`makeScanner`/`makeExecutor` factory helpers (mirroring `TagExecutor.test.ts`'s conventions, extended for AddExecutor's extra `scanner`/`addLogStore`/`getDmText` dependencies and the D-20 continuation-resume contract), 12 `describe()` blocks, 54 `it()` cases, zero implementation code.

## Decisions Made
- Followed 14-PATTERNS.md's exact `makeDialog`/`makeAddAuditStore`/`makeExecutor` fixture shapes and 14-RESEARCH.md's confirmed mock config field names (`inviteToChannelErrorDialogIds`, `addChatUserMissingInviteeDialogIds`, `exportChatInviteErrorPeerIds`, etc.) verbatim — no invented mock fields.
- Added an `InstrumentedAddAuditStore` type alias (see Deviations) to keep the test file's own typing internally consistent; this is a test-file-only addition with zero effect on the AddExecutor contract itself.
- Split 2 of the plan's compound-bullet behaviors (DM "stopped OR hard-stopped", add-log "stops or hard-stops") into 2 `it()` cases each for unambiguous per-case assertions — additive thoroughness, not a deviation from what's required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a TypeScript inference issue in the test file's own fixture typing**
- **Found during:** Task 1 (`npx tsc --build` verification step)
- **Issue:** `makeExecutor`'s `config.auditStore ?? makeAddAuditStore(...)` expression was typed by TypeScript as the bare `AddAuditStore` interface (the narrower of the two union members), silently dropping `checkpointCalls`/`initJobCalls`/`setStatusCalls`/`_job` from the inferred type of the destructured `auditStore` returned to every test — 21 call sites then failed with `TS2551: Property 'checkpointCalls' does not exist on type 'AddAuditStore'`.
- **Fix:** Introduced `type InstrumentedAddAuditStore = ReturnType<typeof makeAddAuditStore>` and used it for both the `makeExecutor` config parameter's `auditStore?:` field and the implicit return type, so the full instrumented shape is retained through the `??` expression.
- **Files modified:** `src/main/telegram/addExecutor.test.ts` (test file this same plan owns — no scope creep).
- **Verification:** `npx tsc --build` now reports exactly one error (the expected `Cannot find module './AddExecutor'`), down from 22.
- **Committed in:** `30bba36` (Task 1 commit — the fix was applied before the single commit for this plan).

---

**Total deviations:** 1 auto-fixed (1 bug, test-file-only)
**Impact on plan:** Fixes a type-inference bug in the test file's own fixture helper; does not change any test's runtime behavior or assertions. No scope creep — confined to `addExecutor.test.ts`, the only file this plan touches.

## Issues Encountered

- `npx tsc --build` emitted stray `addExecutor.test.js`/`addExecutor.test.d.ts` beside the source file (per the project's documented `tsc --build` behavior). Deleted both before the final `npx vitest run` pass; confirmed via `find src -name "*.js" -o -name "*.d.ts"` returning only the two pre-existing hand-written declaration files (`src/main/env.d.ts`, `src/renderer/i18n/i18next.d.ts`) afterward.
- `createMockTelegramClient`'s `invoke` method is a plain async function, not a pre-wrapped `vi.fn()` (unlike `TagExecutor.test.ts`'s own bespoke mock, which does wrap `invoke` in `vi.fn()`). The one test needing call-order assertions (EditBanned before InviteToChannel) uses a local `vi.spyOn(mockClient, 'invoke')` instead — documented as an established pattern above for 14-08/14-09 to reuse if needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/main/telegram/addExecutor.test.ts` fully specifies the behavioral contract Plans 14-08/14-09 (AddExecutor GREEN implementation) must satisfy — every `it()` case, mock config field, and fixture shape referenced here already exists (Plans 14-01, 14-02, 14-03) except `AddExecutor.ts` itself, which those plans create.
- The D-20 continuation-based resume contract (the phase's single highest-risk design gap per 14-RESEARCH.md) is now expressed as 5 concrete, independently-assertable test cases plus a dedicated 2-segment cross-resume DM test — the GREEN implementation has an unambiguous target.
- `AddExecutor`'s constructor shape is implicitly pinned by this test file: `{ client, governor, enumerator, scanner, resolver, auditStore, addLogStore, getDmText, onStateChange }` — Plans 14-08/14-09 should treat this as the contract unless a Rule 4 architectural deviation is explicitly raised.
- No blockers for downstream plans.

## Self-Check: PASSED

- FOUND: src/main/telegram/addExecutor.test.ts
- FOUND: 30bba36 (Task 1 commit)

---
*Phase: 14-addexecutor-dispatch-privacy-fallback-audit*
*Completed: 2026-10-03*
