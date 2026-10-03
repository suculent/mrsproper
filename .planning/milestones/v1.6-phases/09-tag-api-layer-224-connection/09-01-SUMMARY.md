---
phase: 09-tag-api-layer-224-connection
plan: 01
subsystem: api
tags: [telegram, gramjs, tl-serialization, mtproto, vitest, typescript]

# Dependency graph
requires: []
provides:
  - "src/main/telegram/tagApi.ts: vendored messages.editChatParticipantRank request factory + TL-string encoder"
  - "Golden-byte test fixture asserting correct wire bytes for channel/user/rank combination"
affects:
  - 09-02-tag-client (imports makeEditChatParticipantRankRequest to invoke via tagClient)
  - 10-tag-executor (TagExecutor uses tagApi factory in its state machine)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vendored TL request pattern: hand-serialize methods absent from GramJS layer 198 using getBytes() concatenation"
    - "TL-string encoding: 1-byte header for len<=253, 4-byte extended (0xfe prefix) for len>=254, pad to 4-byte boundary"
    - "Request object shape: className/classType/CONSTRUCTOR_ID/SUBCLASS_OF_ID/resolve/getBytes/readResult"

key-files:
  created:
    - src/main/telegram/tagApi.ts
    - src/main/telegram/tagApi.test.ts
  modified: []

key-decisions:
  - "Pure serialization module only: no client, no AllTLObjects mutation, no side effects — fully unit-testable offline"
  - "resolve() returns Promise.resolve(this) explicitly (not async) to maintain correct return type"
  - "TL string 'abc' (3 bytes): header(1)+data(3)=4 already aligned, 0 padding — test expectation corrected"

patterns-established:
  - "tagApi pattern: vendored TL methods live in src/main/telegram/tagApi.ts, exported as factory functions"
  - "Golden-byte assertion: fixture hex in test file proves serialization is wire-compatible before any network code"

requirements-completed:
  - TAG-02

# Metrics
duration: 2min
completed: 2026-06-20
---

# Phase 9 Plan 01: tagApi Vendored Request Factory Summary

**Pure TL serializer for messages.editChatParticipantRank#a00f32b0 — GramJS-absent method hand-serialized and golden-byte verified against Phase 0 spike output**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-20T13:09:00Z
- **Completed:** 2026-06-20T13:11:18Z
- **Tasks:** 1 (TDD: RED commit + GREEN commit)
- **Files modified:** 2

## Accomplishments
- Vendored `messages.editChatParticipantRank` request factory that GramJS 2.26.22 (layer 198) does not ship
- `serializeTLString` handles all TL-string forms: empty, short, 4-aligned, and extended-header (254+ byte) strings
- Golden-byte assertion passes: fixture `channel=3906767609/user=8471834904/rank="testtag"` produces exactly `b0320fa0fcbbbc27f98adce800000000419544a790ed40554ca5e8dd18f1f5f801000000a221129ab94297930774657374746167`
- Zero production dependencies added; TypeScript strict mode passes with `tsc --build`

## Task Commits

Each task committed atomically (TDD: RED then GREEN):

1. **Task 1 RED: failing tests** - `84afcdd` (test)
2. **Task 1 GREEN: implementation + test fix** - `8b2a86d` (feat)

## Files Created/Modified
- `src/main/telegram/tagApi.ts` - Vendored request factory and TL-string encoder (pure, no side effects)
- `src/main/telegram/tagApi.test.ts` - 7 tests: golden-byte, empty/short/aligned/extended-header string forms, object shape, readResult delegation

## Decisions Made
- Module exports only `makeEditChatParticipantRankRequest` and `serializeTLString` — no registration with AllTLObjects, no connection logic
- `resolve()` uses `Promise.resolve(this)` not `async` keyword to preserve `Promise<EditChatParticipantRankRequest>` return type
- No `big-integer` import in tagApi.ts — callers construct and pass InputPeer objects; this module only calls `.getBytes()` on them

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected test expectation for 'abc' TL-string serialization**
- **Found during:** Task 1 (tagApi.ts — GREEN phase, first test run)
- **Issue:** Test expected 8 bytes `[0x03, 0x61, 0x62, 0x63, 0x00, 0x00, 0x00, 0x00]` for 'abc', but TL spec: header(1) + data(3) = 4 bytes, which is already 4-byte aligned (4%4=0), so 0 padding bytes are added. Correct output is 4 bytes.
- **Fix:** Updated test expectation to `[0x03, 0x61, 0x62, 0x63]` (4 bytes) and clarified test name
- **Files modified:** src/main/telegram/tagApi.test.ts
- **Verification:** All 7 tests pass after correction; golden-byte fixture (which uses the same encoder) independently validates the encoder is correct
- **Committed in:** `8b2a86d` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - wrong test expectation)
**Impact on plan:** Zero scope change. The implementation was correct; the test expectation was miscalculated. Golden-byte test independently confirms serialization correctness.

## Issues Encountered
None beyond the test expectation fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `tagApi.ts` is complete and correct; Phase 9 Plan 02 (`tagClient.ts` — layer-224 patch-connect-restore) can import `makeEditChatParticipantRankRequest` and `EditChatParticipantRankRequest` immediately
- TAG-02 requirement fulfilled
- Blocker remains for Phase 9 Plan 02: main client auto-reconnect during the layer-224 patch window must be guarded (mutex or idle assertion)

## Self-Check: PASSED

- [x] `src/main/telegram/tagApi.ts` exists
- [x] `src/main/telegram/tagApi.test.ts` exists
- [x] Commit `84afcdd` exists (RED)
- [x] Commit `8b2a86d` exists (GREEN)
- [x] All 7 Vitest tests pass
- [x] `tsc --build` exits 0

---
*Phase: 09-tag-api-layer-224-connection*
*Completed: 2026-06-20*
