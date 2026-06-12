---
phase: 06-ui-integration-wizard
plan: "05"
subsystem: ui
tags: [electron, react, gramjs, wizard, safety-gates, verification]

# Dependency graph
requires:
  - phase: 06-04
    provides: AppShell wizard stage machine, StepIndicator, ReviewScreen, FLOOD_WAIT subline, structured summary band
provides:
  - Human-verified end-to-end wizard flow — all 9 test points confirmed approved
  - SAF-01 identity block (numeric ID + groups) visually confirmed on Review screen
  - SAF-02 single explicit confirm gate confirmed — no second dialog after clicking confirm
  - SAF-03 dry-run/review preview before execution confirmed
  - CastError noise eliminated via big-integer externalization (GramJS module singleton)
  - Change-target flow reliably resets wizard stage machine
  - Stable review content width across kick/ban severity toggle
affects:
  - 07-packaging-signing-release

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Externalize big-integer in Vite config so GramJS shares one module instance (avoids instanceof CastErrors when main and renderer bundle separate copies)"
    - "Stage machine reset via CHANGE_TARGET event in AppShell xstate machine rather than direct prop override"
    - "Width stability: pin layout widths at container level, not at individual content pane level"

key-files:
  created: []
  modified:
    - src/renderer/shell/AppShell.tsx
    - src/renderer/wizard/ReviewScreen.tsx
    - src/renderer/groups/GroupsPane.tsx
    - electron.vite.config.ts
    - src/main/ipc/removalChannels.ts

key-decisions:
  - "Default severity changed to Ban (not Kick) based on human review of expected admin intent"
  - "big-integer externalized via Vite optimizeDeps.exclude + resolve.alias to fix GramJS CastError noise from duplicate module instances"
  - "Change-target wired through CHANGE_TARGET stage event (not direct re-render) to ensure clean state machine reset"

patterns-established:
  - "Vite externalize pattern: any lib that GramJS uses for instanceof checks must be a singleton — add to optimizeDeps.exclude + resolve.alias"

requirements-completed:
  - SAF-01
  - SAF-02
  - SAF-03

# Metrics
duration: multi-session (includes 3-round verification loop)
completed: 2026-06-12
---

# Phase 6 Plan 05: Human Visual Verification Summary

**Full five-stage wizard end-to-end verified by human: SAF-01/02/03 confirmed, change-target, severity persistence, and layout stability fixed across a three-round fix loop**

## Performance

- **Duration:** Multi-session (3 verification rounds + fix iterations)
- **Started:** 2026-06-12
- **Completed:** 2026-06-12
- **Tasks:** 2 (automated gate + human checkpoint)
- **Files modified:** 5

## Accomplishments

- Automated gate passed: full vitest suite green, `tsc --build --force` clean after fixing pre-existing tsc errors
- Human visual verification: all 9 test points reviewed and ultimately approved across a 3-round fix loop
- SAF-01 confirmed: Review screen shows avatar/initials fallback, full name, @username, numeric ID in monospace, affected group list with mechanic notes
- SAF-02 confirmed: exactly one confirm gate (the "Kick/Ban from N groups" button on Review screen); no second dialog appears
- SAF-03 confirmed: dry-run preview of what will happen is shown on Review screen before any action
- FLOOD_WAIT subline verified by code review (untestable live without a real flood event — subline renders via governor event wiring confirmed in 06-04)
- "Remove someone else" button confirmed: resets wizard to Target stage with all state cleared

## Task Commits

1. **Task 1: Automated gate** - `0003fa5` (chore — fix pre-existing tsc errors; clean build gate green)

**Checkpoint fix loop (Task 2 — human verification rounds):**

Round 1 — two issues found on first verification pass:
- Default severity was Kick (expected Ban for admin use case)
- Review screen width shifted on kick/ban toggle

Round 2 fixes:
- `e68ec4a` — default severity changed to Ban
- `0ecee4f` — stable review screen content width attempt
- `0118197` — reset wizard stage to Target on Change target event

Round 3 — three issues persisted after Round 2:
- Layout shift persisted despite Round 2 fix
- Change-target button was still broken (wrong button wired)
- GramJS CastError console spam

Round 3 fixes:
- `ac49fb1` — preserve 64-bit Telegram IDs/hashes as strings across IPC (CastError regression tests)
- `91a444e` — wire all change-target affordances through stage machine (GroupsPane toolbar)
- `f323356` — width pinned at AppShell main container level; min-h consequence adjusted
- `1375c81` — externalize big-integer so main process shares one GramJS module instance (root cause of CastErrors: duplicate inlined module instance failing GramJS instanceof checks)

Final verification: **APPROVED** — layout stable, change-target resets stage, no CastErrors.

## Files Created/Modified

- `src/renderer/shell/AppShell.tsx` — CHANGE_TARGET stage machine event, width pinned at container level
- `src/renderer/wizard/ReviewScreen.tsx` — default severity Ban; stable width layout
- `src/renderer/groups/GroupsPane.tsx` — change-target button wired through stage machine CHANGE_TARGET event
- `electron.vite.config.ts` — big-integer externalized (optimizeDeps.exclude + resolve.alias)
- `src/main/ipc/removalChannels.ts` — IPC string/BigInt precision preservation for 64-bit IDs

## Decisions Made

- Default severity changed to Ban: human review determined that admins removing serial bad actors typically want to block rejoin, not just kick.
- big-integer externalized in Vite config: GramJS uses `instanceof` checks on BigInt objects that fail when the `big-integer` package is bundled separately in main vs renderer. Externalizing ensures a single module instance is shared, eliminating CastError noise in the console.
- Change-target wired through CHANGE_TARGET stage event: direct prop override left stale stage machine state; the event pattern ensures clean reset of the full wizard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Default severity was Kick instead of Ban**
- **Found during:** Task 2, Round 1 (human verification)
- **Issue:** Review screen defaulted to "Kick" severity; human reviewer expected "Ban" as the safer default for the admin use case (serial bad actor removal)
- **Fix:** Changed default severity to Ban in ReviewScreen initial state
- **Files modified:** `src/renderer/wizard/ReviewScreen.tsx`
- **Commit:** `e68ec4a`

**2. [Rule 1 - Bug] Review screen content width shifted on kick/ban toggle**
- **Found during:** Task 2, Round 1 (human verification)
- **Issue:** The consequence line text change on severity toggle caused layout reflow, shifting the review panel width
- **Fix:** Width pinned at AppShell main container level rather than per-content-pane (two-pass fix: initial attempt in `0ecee4f`, root fix in `f323356`)
- **Files modified:** `src/renderer/shell/AppShell.tsx`, `src/renderer/wizard/ReviewScreen.tsx`
- **Commits:** `0ecee4f`, `f323356`

**3. [Rule 1 - Bug] Change-target button not resetting wizard stage**
- **Found during:** Task 2, Round 1 and Round 3 (human verification)
- **Issue:** The change-target affordance in GroupsPane toolbar was wired to a callback that did not advance the stage machine back to Target — the stage displayed Groups but underlying state was inconsistent
- **Fix:** Wired change-target through CHANGE_TARGET stage machine event in AppShell; initial wire attempt in `0118197` was incomplete; final fix in `91a444e` correctly routed the GroupsPane toolbar button
- **Files modified:** `src/renderer/shell/AppShell.tsx`, `src/renderer/groups/GroupsPane.tsx`
- **Commits:** `0118197`, `91a444e`

**4. [Rule 1 - Bug] GramJS CastError console spam from duplicate big-integer module**
- **Found during:** Task 2, Round 3 (human verification)
- **Issue:** GramJS uses `instanceof` on BigInt objects internally. When Vite bundled `big-integer` separately for main vs renderer, two distinct module instances existed. GramJS's instanceof checks against its own BigInt class failed against the other bundle's instances, producing CastError noise on every Telegram call.
- **Root cause:** Duplicate inlined `big-integer` module instance violates the singleton requirement for instanceof-based type checks
- **Fix:** Externalized `big-integer` in `electron.vite.config.ts` via `optimizeDeps.exclude` and `resolve.alias`, forcing both main and renderer to share the same module instance. Added IPC string/BigInt preservation fix for 64-bit Telegram IDs in `removalChannels.ts` with regression tests.
- **Files modified:** `electron.vite.config.ts`, `src/main/ipc/removalChannels.ts`
- **Commits:** `ac49fb1`, `1375c81`

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bugs found during human visual verification)
**Impact on plan:** All fixes required for correct operation. No scope creep. The three-round verification loop is normal for a human-checkpoint plan; the fix-verify pattern worked as intended.

## Known Stubs

None — all wizard stages are fully wired to real services.

## Threat Flags

No new security-relevant surface introduced in this plan. All changes are UI layout fixes and a Vite build config externalization. The SAF-01/02/03 security verifications (identity block, single confirm gate, dry-run preview) were confirmed by human reviewer:

- T-06-05-01 (SAF-02 single gate): VERIFIED — human confirmed exactly one confirm gate, no second dialog
- T-06-05-02 (SAF-01 identity): VERIFIED — human confirmed numeric ID visible in monospace, avatar matches resolved target

## FLOOD_WAIT Subline (Test 6)

Verified by code review only — a live flood event cannot be reliably triggered in a manual test session without risking account restrictions. The subline rendering path was confirmed in Phase 6 Plan 04 (RemovalExecutor governor event plumbing + GroupsPane FloodWait UI slot). No code changes were needed in this plan for this feature.

## Issues Encountered

Three-round verification loop required more fix iterations than expected for a human-checkpoint plan. Root causes:

1. Initial width fix (`0ecee4f`) targeted the wrong level — required a second pass (`f323356`) at the container level.
2. Change-target wiring had two layers: the stage event (`0118197`) and the button binding (`91a444e`) — the first fix was incomplete.
3. GramJS CastError was a non-obvious Vite bundling issue requiring investigation into module singleton semantics.

All four issues are now resolved and the app is fully approved.

## Next Phase Readiness

Phase 6 is complete. All five plans executed and approved:
- 06-01: Shared contracts, severity channels, Wave 0 test stubs
- 06-02: electron-store, severityChannels, RemovalExecutor flood plumbing
- 06-03: wizardCopy, StepIndicator, ReviewScreen (SAF-01/02/03)
- 06-04: AppShell wizard stage machine, retire RemovalConfirmDialog, FLOOD_WAIT subline, summary band
- 06-05: Human visual verification — APPROVED

Ready for Phase 7: Packaging, Signing & Release.

---
*Phase: 06-ui-integration-wizard*
*Completed: 2026-06-12*
