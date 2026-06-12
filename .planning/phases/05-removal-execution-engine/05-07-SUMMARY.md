---
phase: 05-removal-execution-engine
plan: "07"
subsystem: ui
tags: [react, electron, gramjs, removal, progress-ui, dialogs, zustand]

# Dependency graph
requires:
  - phase: 05-removal-execution-engine
    provides: removalStore, removalCopy, RemovalConfirmDialog, ResumeJobDialog, removalChannels, RemovalExecutor, AuditStore
  - phase: 04-group-enumeration-membership-rights
    provides: GroupRow.tsx, GroupsPane.tsx, groupsStore, AdminDialogDTO, checkedDialogIds

provides:
  - GroupRow with 6 removal status states (queued/removing/done/already-gone/failed/skipped) and inline retry link
  - GroupsPane run-trigger button, progress indicator, summary band, PEER_FLOOD banner
  - RemovalConfirmDialog wired to run-trigger; ResumeJobDialog wired on mount for crash-resume
  - TargetCard/Change-target disabled during active removal run
  - Live end-to-end removal verified: target banned from real Telegram test group, confirmed cannot rejoin

affects: [06-ui-integration-wizard-safety-gates-progress]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GroupRow checkbox slot ternary: removalStatus branch prepended before existing isPending/isActionable/disabled branches"
    - "GroupsPane multi-state progress slot: one slot renders scan progress OR removal progress OR PEER_FLOOD banner OR summary band depending on step"
    - "removalStore getSnapshot must return stable cached reference — React external store contract requires referential equality to avoid infinite update loops"
    - "tsc --noEmit is a no-op for this project (files:[] + project references) — use tsc --build for real type-checking"
    - "GramJS ignoreMigrated is inverted in 2.26.x — always fetch all dialogs and filter husks in application code"

key-files:
  created: []
  modified:
    - src/renderer/groups/GroupRow.tsx
    - src/renderer/groups/GroupsPane.tsx
    - src/renderer/target/TargetCard.tsx
    - src/renderer/store/removalStore.ts
    - src/main/telegram/GroupEnumerator.ts
    - src/main/index.ts
    - src/main/telegram/RemovalExecutor.ts
    - src/main/telegram/__mocks__/telegramClient.ts
    - src/main/telegram/groupEnumerator.test.ts

key-decisions:
  - "tsc --noEmit is a NO-OP for this project (files:[] + project references) — real type-check gate is tsc --build"
  - "GramJS telegram@2.26.x: getDialogs({ignoreMigrated:true}) drops ALL supergroups/channels due to inverted filter — correct pattern is fetch all + filter migratedTo/deactivated husks in _classifyDialog()"
  - "Hardcoded severity='ban' for Phase 5 test default; Phase 6 will expose the kick/ban toggle per UI-SPEC"
  - "TargetCard imports useRemovalStore directly — avoids prop drilling through AppShell for a local guard"

patterns-established:
  - "External store snapshot caching: cache getSnapshot() return value, only replace on state change — never return new object per call"
  - "GroupRow status rendering: removalStatus prop drives both checkbox slot icon and subline copy; when non-null, toggle interactions are suppressed"
  - "Multi-state progress slot: one DOM slot, conditional rendering switches between scan/removal/flood/summary contexts"

requirements-completed: [RMV-01, RMV-02, EXE-04, EXE-05]

# Metrics
duration: ~3h (including 4 live-verification fix iterations)
completed: 2026-06-12
---

# Phase 5 Plan 07: GroupRow/GroupsPane Removal UI Surface Summary

**Per-row removal status rendering (6 states), run-trigger, throttled progress indicator, summary band, and crash-resume dialog wired end-to-end; live human verification approved 2026-06-12 after 4 fix iterations including a critical GramJS ignoreMigrated inversion bug and a tsc --noEmit no-op discovery.**

## Performance

- **Duration:** ~3h (2 auto tasks + human-verify checkpoint with 4 fix iterations)
- **Started:** 2026-06-12
- **Completed:** 2026-06-12 (human verification approved)
- **Tasks:** 3 (Task 1, Task 2 auto; Task 3 human-verify — APPROVED)
- **Files modified:** 9

## Accomplishments

- GroupRow.tsx extended with 6 removal status states: queued (checked+disabled), removing (spinner), done/already-gone (green check), failed (red icon + inline retry link), skipped (minus icon) — all per UI-SPEC
- GroupsPane.tsx wired with run-trigger button, multi-state progress slot (scan/removal/flood/summary), RemovalConfirmDialog and ResumeJobDialog, checklist lock during active run, TargetCard disabled while running
- Four blocking bugs discovered and fixed during live verification — all documented as deviations
- Live verification passed 2026-06-12: name search found target in 3 supergroups, scan verified membership, ban run executed with live per-row progress, summary band showed correct counts, target confirmed banned and unable to rejoin in Telegram

## Task Commits

1. **Task 1: Extend GroupRow with removal status props and status rendering** - `2066e6a` (feat)
2. **Task 2: Wire GroupsPane run-trigger, progress slot, summary band, dialogs; lock TargetCard** - `65dc8a0` (feat)
3. **Task 3: Checkpoint metadata (pre-verification)** - `fe6b371` (docs)
4. **Fix 1: removalStore stable getSnapshot reference** - `8929d79` (fix)
5. **Fix 2: GramJS ignoreMigrated inversion + regression test** - `a53d520` (fix)
6. **Fix 3: removal:start auth gate sm.getAuthState() does not exist** - `f809cb9` (fix)
7. **Fix 4: abortExecution on idle emits phantom stopped summary** - `af0b779` (fix)

## Files Created/Modified

- `src/renderer/groups/GroupRow.tsx` — extended GroupRowProps with removalStatus, removalNote, errorCode, severity, onRetryRemoval; checkbox slot and subline updated with all 6 status branches
- `src/renderer/groups/GroupsPane.tsx` — run-trigger, multi-state progress slot, summary band, PEER_FLOOD banner, RemovalConfirmDialog and ResumeJobDialog wired, checklist lock
- `src/renderer/target/TargetCard.tsx` — imports useRemovalStore; Change target button disabled during running/stopping with "Stop the removal first" tooltip
- `src/renderer/store/removalStore.ts` — getSnapshot cached to stable reference to satisfy React useSyncExternalStore contract (Fix 1)
- `src/main/telegram/GroupEnumerator.ts` — fetch all dialogs without ignoreMigrated flag; filter migratedTo/deactivated husks in _classifyDialog(); removed TEMP-DIAG logging (Fixes 2, 4)
- `src/main/index.ts` — getAuthState() corrected to getState() in removal:start handler (Fix 3)
- `src/main/telegram/RemovalExecutor.ts` — abortExecution() on idle returns early without emitting state event (Fix 4)
- `src/main/telegram/__mocks__/telegramClient.ts` — extended with migratedTo scenario for regression test (Fix 2)
- `src/main/telegram/groupEnumerator.test.ts` — added ignoreMigrated regression test (Fix 2)

## Decisions Made

- **tsc --noEmit is a NO-OP** for this project's tsconfig (files: [] + project references). PLAN.md verify blocks using it silently pass invalid code. Real gate is `tsc --build`. Future plans must use `tsc --build` in verify blocks.
- **Hardcoded severity='ban'** for Phase 5 test default per user decision. Phase 6 will expose the kick/ban toggle.
- **TargetCard imports useRemovalStore directly** — avoids prop drilling through AppShell for a simple local guard; consistent with the existing pattern where each component reads its own store.
- **GramJS ignoreMigrated quirk** documented as permanent library gotcha — affects all future dialog enumeration work.

## Deviations from Plan

### Auto-fixed Issues — Live Verification Iteration

All 4 fixes were discovered and applied during the Task 3 human-verify checkpoint on 2026-06-12. The checkpoint was approved after all 4 fixes landed.

---

**1. [Rule 1 - Bug] removalStore getSnapshot returned fresh object per call — React "Maximum update depth" crash unmounting login tree**
- **Found during:** Task 3 human-verify (first launch attempt after Tasks 1-2 committed)
- **Issue:** `removalStore.getSnapshot()` returned a newly constructed object on every call. React's `useSyncExternalStore` uses referential equality to detect changes — a new object every time triggered infinite re-renders and crashed the component tree with "Maximum update depth exceeded" immediately after the LoginScreen unmounted post-login.
- **Fix:** Introduced a module-level `_snapshot` cache variable. `getSnapshot()` returns the cached reference and only replaces it when the underlying state actually changes. `subscribe()` invalidates the cache on each state update.
- **Files modified:** `src/renderer/store/removalStore.ts`
- **Verification:** App launched, login completed, component tree stable.
- **Committed in:** `8929d79`

---

**2. [Rule 1 - Bug] GramJS telegram@2.26.x ignoreMigrated inverted — all supergroups/channels silently dropped from dialog enumeration**
- **Found during:** Task 3 human-verify (name search returned 0 groups for a target present in 3 supergroups)
- **Issue:** `getDialogs({ ignoreMigrated: true })` in GramJS 2.26.x has an inverted filter: the internal `migratedTo` check retains only `Api.Chat` objects with a `migratedTo` field (i.e., dead basic-group husks), dropping every supergroup and channel. Dialog enumeration, membership scanning, and name search all operated on an empty set.
- **Fix:** Changed `GroupEnumerator` to call `getDialogs()` without the `ignoreMigrated` flag, then filter husks explicitly in `_classifyDialog()`: skip any `Api.Chat` with `migratedTo` set or `deactivated === true`. Added a regression test with a mock client that returns a migrated `Api.Chat` entity alongside live supergroups.
- **Files modified:** `src/main/telegram/GroupEnumerator.ts`, `src/main/telegram/__mocks__/telegramClient.ts`, `src/main/telegram/groupEnumerator.test.ts`
- **Verification:** Name search found target in all 3 supergroups; membership scan and checklist populated correctly.
- **Committed in:** `a53d520`

---

**3. [Rule 1 - Bug] removal:start IPC handler called non-existent sm.getAuthState() — every removal run died silently before reaching the executor**
- **Found during:** Task 3 human-verify (clicking "Ban from N groups…" and confirming produced no visible action)
- **Issue:** The `removal:start` IPC handler in `main/index.ts` called `sm.getAuthState()` for the auth gate. `SessionManager` only exposes `sm.getState()`. The TypeError was swallowed by the IPC error boundary so the executor never received the start signal. The bug slipped through automated verify because `tsc --noEmit` is a no-op for this project's tsconfig — it reported zero errors despite the invalid call.
- **Fix:** Changed `sm.getAuthState()` to `sm.getState()` in the `removal:start` handler.
- **Files modified:** `src/main/index.ts`
- **Verification:** Clicking confirm triggered the run; progress indicator appeared and bar advanced.
- **Committed in:** `f809cb9`

---

**4. [Rule 1 - Bug] abortExecution() on idle executor emitted phantom 'stopped 0/0' summary on every target change**
- **Found during:** Task 3 human-verify (after a completed run, changing the target showed a spurious "Stopped (0/0 groups)" summary band)
- **Issue:** `RemovalExecutor.abortExecution()` emitted a `stopped` state event regardless of whether a run was active. The TARGET_RESET path calls `executor.abortExecution()` to cancel any in-progress run — when idle, this produced a phantom stopped event, which removalStore rendered as a summary band on every subsequent target change.
- **Fix:** Added an early-return guard in `abortExecution()` when `this._state.step === 'idle'` — no event emitted, no state transition. Also removed TEMP-DIAG `console.log` statements from `GroupEnumerator.ts` and `ParticipantSearcher.ts`.
- **Files modified:** `src/main/telegram/RemovalExecutor.ts`, `src/main/telegram/GroupEnumerator.ts`, `src/main/telegram/ParticipantSearcher.ts`
- **Verification:** Changing target after a completed run showed clean idle state with no phantom summary band.
- **Committed in:** `af0b779`

---

**Total deviations:** 4 auto-fixed (all Rule 1 bugs)
**Impact on plan:** All fixes were blocking correctness issues discovered during live verification. No scope creep. The GramJS ignoreMigrated inversion (Fix 2) is a permanent library gotcha documented in STATE.md decisions and CLAUDE.md.

## Issues Encountered

- **tsc --noEmit no-op:** This project's root `tsconfig.json` has `files: []` and uses project references. `tsc --noEmit` at the root silently succeeds even when source files contain type errors. Future PLAN.md verify blocks must use `tsc --build`.
- **GramJS ignoreMigrated API quirk:** Documented in decisions. The correct pattern going forward is always fetch all dialogs and classify/filter husks in application code.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 5 Removal Execution Engine is fully complete and live-verified on a real Telegram account.
- The app can: resolve a target by name, scan group membership, present a confirmation dialog, execute a ban run with live per-row progress, display a summary band with counts and timestamp, and persist the job file for crash-resume.
- Phase 6 (UI Integration — Wizard, Safety Gates & Progress) can begin. Key inputs from Phase 5:
  - `useRemovalStore()` + `removalActions` are the renderer-side interface for all removal operations
  - `RemovalConfirmDialog` and `ResumeJobDialog` are already wired — Phase 6 should extend, not replace them
  - Severity is hardcoded to 'ban' — Phase 6 should expose the kick/ban toggle per the original UI-SPEC
- Known gap: `tsc --build` should replace `tsc --noEmit` in all plan verify blocks going forward.

## Threat Surface Scan

No new network endpoints or auth paths introduced. Verified threat mitigations:

| Threat | File | Mitigation Confirmed |
|--------|------|----------------------|
| T-05-07-A: Run-trigger bypasses confirm | GroupsPane.tsx | onClick sets confirmOpen=true only; startRemoval never called directly from button |
| T-05-07-B: Change target during run | TargetCard.tsx | Button disabled + aria-disabled during running/stopping; tooltip "Stop the removal first" |
| T-05-07-C: Repudiation | RemovalConfirmDialog.tsx + engine | Dialog shows exact group count; per-group report + summary band from Plans 03-06 |

## Self-Check: PASSED

Files verified:
- `src/renderer/groups/GroupRow.tsx` — EXISTS (removalStatus props + rendering)
- `src/renderer/groups/GroupsPane.tsx` — EXISTS (run-trigger + progress slot + dialogs)
- `src/renderer/target/TargetCard.tsx` — EXISTS (removal lock)
- `src/renderer/store/removalStore.ts` — EXISTS (stable snapshot)
- `src/main/telegram/GroupEnumerator.ts` — EXISTS (ignoreMigrated fix)
- `src/main/index.ts` — EXISTS (getState() fix)
- `src/main/telegram/RemovalExecutor.ts` — EXISTS (idle abort guard)

Commits verified:
- `2066e6a` feat(05-07): extend GroupRow with removal status props and per-row status rendering
- `65dc8a0` feat(05-07): wire GroupsPane run-trigger, progress slot, summary band, dialogs; lock TargetCard during run
- `fe6b371` docs(05-07): complete GroupRow/GroupsPane removal UI plan — checkpoint pending human verify
- `8929d79` fix(05): stable getSnapshot reference in removalStore
- `a53d520` fix(05): GramJS ignoreMigrated drops all supergroups
- `f809cb9` fix(05): removal:start auth gate crashed — sm.getAuthState() does not exist
- `af0b779` fix(05): abortExecution on idle executor resets to clean idle

Human verification: APPROVED 2026-06-12

---
*Phase: 05-removal-execution-engine*
*Completed: 2026-06-12*
