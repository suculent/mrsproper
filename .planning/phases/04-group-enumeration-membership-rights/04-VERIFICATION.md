---
phase: 04-group-enumeration-membership-rights
verified: 2026-06-12T01:30:00Z
status: gaps_found
score: 9/12 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Membership scan re-runs on every target confirm — no result caching (D-15)"
    status: failed
    reason: "CR-01: The auto-start effect in GroupsPane.tsx (line 73) only fires when scan.step === 'idle'. After target A is confirmed and scanned, scan.step is 'complete'. When the user clicks Change Target and confirms target B, the abort effect (line 65) only fires when scan.step === 'scanning' — a completed scan is left in 'complete' state. Since 'complete' !== 'idle', the auto-start guard never fires for target B. Target A's membership results are displayed as if they belong to target B. Additionally, TARGET_RESET in targetChannels.ts only calls resolver.reset() — scanner.abortScan() is never called from main, so scan state persists at 'complete' across target changes."
    artifacts:
      - path: "src/renderer/groups/GroupsPane.tsx"
        issue: "Auto-start effect (line 73) guards on scan.step === 'idle'; completed scan step never transitions back to idle on target change, so scan never re-runs."
      - path: "src/main/ipc/targetChannels.ts"
        issue: "TARGET_RESET handler (line 78-80) only calls resolver.reset(); does not call scanner.abortScan() or any equivalent reset — scan state machine stays in 'complete' across target changes."
    missing:
      - "In targetChannels.ts TARGET_RESET handler: call scanner.abortScan() (or a dedicated scanner.reset()) so scan state transitions to 'idle', enabling the renderer auto-start effect to fire on the next confirm."
      - "In GroupsPane.tsx abort effect: extend the guard to also abort when scan.step === 'complete' on mode → browse transition (belt-and-suspenders)."
      - "In groupsStore.ts: clear checkedDialogIds when target leaves 'confirmed' state (per the UI tooltip promise)."

  - truth: "Verified-member groups show as pre-checked checkboxes; user can uncheck and recheck"
    status: failed
    reason: "CR-03: groupsStore.ts onScanState subscriber (line 53) rebuilds checkedDialogIds from scratch every time a 'complete' state arrives. MembershipScanner.retryGroup() re-emits { step: 'complete', ... } after each single-group retry. Sequence: scan completes → user deliberately unchecks groups → user clicks retry on one failed row → retryGroup emits 'complete' → subscriber rebuilds checkedDialogIds → all unchecked groups are re-checked. The user's manual deselections — the direct input to bulk removal — are silently destroyed. Phase 5's removal loop will target groups the admin explicitly excluded."
    artifacts:
      - path: "src/renderer/store/groupsStore.ts"
        issue: "onScanState callback (lines 53-65) rebuilds checkedDialogIds on every s.step === 'complete' event, not only on the initial 'complete' transition. No prior-step check distinguishes first-complete from retry-complete."
    missing:
      - "Track previous scan step and only compute the pre-check set on the first transition into 'complete' (i.e., when the prior step was 'scanning')."
      - "For retry-complete (prior step was already 'complete'), call setState({ scan: s }) without touching checkedDialogIds."

  - truth: "Failed-verify rows show the retry affordance; retrying a group produces a correct result"
    status: failed
    reason: "CR-02: MembershipScanner.retryGroup() (lines 184-215) has no _generation guard around the await. (1) The 'step !== complete' guard at line 185 runs before the await; if abortScan() is called or a new scan() starts during _checkMembership(), this._currentState no longer has a .results array — line 210 will throw TypeError: Cannot read properties of undefined (reading 'map'). (2) If the user confirmed a new target after the completed scan, retryGroup() reads the new target from getResolvedUser() but merges the result into the old target's results array, corrupting the checklist data for the wrong target."
    artifacts:
      - path: "src/main/telegram/MembershipScanner.ts"
        issue: "retryGroup() (line 184) has no generation capture before the await. Post-await access to this._currentState.results (line 210) is unsound if state changed during the await — potential TypeError crash or cross-target data merge."
    missing:
      - "Capture generation before the await: const gen = this._generation"
      - "After the await, guard: if (gen !== this._generation || this._currentState.step !== 'complete') return"
      - "Increment _generation in any scanner reset path (see CR-01 fix) so that a cross-target retry is caught by the generation check."
human_verification: []
---

# Phase 4: Group Enumeration, Membership & Rights — Verification Report

**Phase Goal:** For a resolved target, the user sees a checklist of only the groups where the target is actually a member, pre-checked for removal, with groups the user lacks ban rights in greyed-out and labeled by reason and group type.
**Verified:** 2026-06-12T01:30:00Z
**Status:** gaps_found — 3 BLOCKERs from post-execution code review confirmed still present in code
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | App lists only groups where target is actually a member (GRP-01) | VERIFIED | MembershipScanner dispatches GetParticipant (supergroups/channels) and GetFullChat (basic groups); all three non-member signals handled; per-group failure isolation present; 12 passing tests |
| 2 | Each listed group pre-checked for removal (GRP-02) | VERIFIED | groupsStore.ts onScanState builds initial checkedDialogIds filtering status=member AND canAct=true on first scan completion; GroupRow renders Checkbox with checked=checkedDialogIds.has(dialog.id) |
| 3 | User can uncheck groups to keep target in selected groups (GRP-03) | VERIFIED | groupsActions.toggleGroup() is synchronous, no IPC, mutates checkedDialogIds set locally; GroupRow passes onToggle prop |
| 4 | Groups where user lacks ban/kick rights shown greyed-out with specific reason (GRP-04) | VERIFIED | GroupRow applies opacity-50 when !dialog.canAct; GROUP_GREY_COPY maps all 5 GreyReason codes to inline subtext; reason always visible per D-03 |
| 5 | App detects group type to determine removal capability and correct grey-out reason (GRP-05) | VERIFIED | GroupEnumerator uses instanceof Api.Chat / Api.Channel + megagroup flag; OR logic for basic group canAct (OQ-2); broadcast-channel always canAct=false; type badge on greyed rows; 10 passing tests |
| 6 | Membership scan re-runs on every target confirm — no result caching (D-15) | FAILED | CR-01: completed scan ('complete' step) never resets on target change. GroupsPane auto-start guard checks scan.step === 'idle' only; TARGET_RESET does not call scanner.abortScan(); confirmed target B shows target A's results (core "right person" violation) |
| 7 | Verified-member groups show as pre-checked; user can uncheck and recheck | FAILED | CR-03: retryGroup() re-emits 'complete' → groupsStore rebuilds checkedDialogIds from scratch on every complete event, wiping user manual deselections. Phase 5's removal set would include groups admin explicitly excluded |
| 8 | Failed-verify rows show retry affordance; retrying produces correct result | FAILED | CR-02: retryGroup() has no generation guard across the await; post-await access to this._currentState.results crashes with TypeError if state changed (abortScan or new scan during await); cross-target retry merges wrong-target result into removal checklist |
| 9 | Two-pane authenticated shell layout (flex-[1]/flex-[2]) | VERIFIED | AppShell.tsx renders confirmed two-pane main layout; StubbedWorkflowRegions deleted; GroupsPane in right pane |
| 10 | Groups pane populates before any target entered — eager enumeration (D-08) | VERIFIED | main/index.ts line 172-173: enumerator.enumerateAtLogin() called on state.step === 'authorized'; GroupsPane browse mode shows loaded dialogs |
| 11 | AdminDialogDTO has no accessHash field (T-04-01 security boundary) | VERIFIED | groupTypes.ts AdminDialogDTO interface has no accessHash field; JSDoc explicitly documents the omission; grep confirms 0 accessHash lines in groupTypes.ts |
| 12 | scan:start IPC accepts no payload; target from resolver (T-04-04/T-04-07) | VERIFIED | groupChannels.ts SCAN_START handler accepts no payload; MembershipScanner.scan() reads from this._resolver.getResolvedUser(); scan:retryGroup Zod-validated + in-memory list checked (T-04-06) |

**Score:** 9/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/groupTypes.ts` | All Phase 4 shared types | VERIFIED | GroupType, GreyReason, AdminDialogDTO, MembershipStatus, MembershipResultDTO, ScanProgressDTO, GroupErrorCode, GroupsState, ScanState — all 9 exports present and well-formed |
| `src/shared/channels.ts` | 8 GROUP_*/SCAN_* constants + CHANNELS namespace | VERIFIED | All 8 constants present; CHANNELS namespace object extended |
| `src/main/telegram/GroupEnumerator.ts` | Dialog enumeration with type classification and rights detection | VERIFIED | instanceof discrimination; OQ-2 OR logic; _dialogMap main-only; governor.run wrappers; 287-line substantive file |
| `src/main/telegram/MembershipScanner.ts` | Per-target membership scan with streaming progress | VERIFIED | All 3 non-member signals; generation token in scan(); per-group failure isolation; abortScan(); retryGroup() — but retryGroup lacks post-await generation guard (CR-02) |
| `src/main/ipc/groupChannels.ts` | Zod-validated IPC handlers | VERIFIED | All 6 handlers; RetryGroupSchema; T-04-06 in-memory dialog list check; isDestroyed guards |
| `src/preload/index.ts` | Bridge entries for 8 group/scan channels | VERIFIED | All 8 methods exposed: getGroupsState, refreshGroups, onGroupsState, startScan, abortScan, retryScanGroup, getScanState, onScanState |
| `src/main/index.ts` | GroupEnumerator + MembershipScanner instantiation; eager login; window D-10 | VERIFIED | Both services instantiated with shared client+governor; registerGroupChannels called; enumerateAtLogin on authorized; width=1280 minWidth=1080 |
| `src/renderer/ipc/groupsClient.ts` | MrsProperApi augmentation + groupsClient wrapper | VERIFIED | declare global augmentation; 8 methods delegating to window.mrsproper |
| `src/renderer/store/groupsStore.ts` | useGroupsStore + groupsActions; pre-check logic; local toggle | VERIFIED | Pre-check on complete; toggleGroup synchronous no-IPC; ref-counted subscriptions — but pre-check fires on every complete re-emission (CR-03) |
| `src/renderer/components/ui/checkbox.tsx` | Shadcn-pattern Checkbox wrapper | VERIFIED | forwardRef; CheckboxPrimitive.Root; Check icon; displayName; cn() class merging |
| `src/renderer/components/ui/scroll-area.tsx` | Shadcn-pattern ScrollArea + ScrollBar | VERIFIED | forwardRef; two exports; orientation prop; displayName set |
| `src/renderer/groups/groupsCopy.ts` | All user-facing strings — GROUP_GREY_COPY, GROUP_TYPE_LABEL, formatMemberCount, SCAN_COPY, EMPTY_STATE_COPY, GROUP_ERROR_COPY | VERIFIED | All 5 GreyReason entries; all GroupType labels; formatMemberCount with Intl compact; no hardcoded strings in GroupRow or GroupsPane |
| `src/renderer/groups/GroupRow.tsx` | Single row: actionable / greyed / failed-verify states | VERIFIED | Three render states; all aria-labels; opacity-50 for greyed; type badge on greyed rows only; no hardcoded strings |
| `src/renderer/groups/GroupsPane.tsx` | Browse + checklist modes; scan progress; sorting; empty states | VERIFIED | Both modes; D-01 partitioning; progress bar; filter input; sort toggle; all empty states — but CR-01 stale-scan bug in auto-start effect |
| `src/renderer/shell/AppShell.tsx` | Two-pane authenticated layout | VERIFIED | flex-[1] + flex-[2]; TargetInput + TargetCard in left pane; GroupsPane in right pane |
| `src/renderer/auth/CountryPicker.tsx` | CZ default; shouldFilter={false} | VERIFIED | DEFAULT_COUNTRY finds 'CZ' code; Command root has shouldFilter={false} |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| GroupEnumerator.ts | @shared/groupTypes.ts | import type AdminDialogDTO | WIRED | Confirmed at line 25 |
| GroupEnumerator.ts | governor.ts | governor.run() wrapping getDialogs | WIRED | Lines 92-94 |
| MembershipScanner.ts | GroupEnumerator.ts | getDialogEntity(), getState() | WIRED | Lines 113, 195, 236 |
| MembershipScanner.ts | TargetResolver (via resolver prop) | getResolvedUser() | WIRED | Lines 100, 187 |
| groupChannels.ts | GroupEnumerator.ts | enumerator.getState(), refresh() | WIRED | Lines 76, 81-83 |
| groupChannels.ts | MembershipScanner.ts | scanner.scan(), abortScan(), retryGroup() | WIRED | Lines 88-89, 94-95, 119 |
| preload/index.ts | @shared/channels.ts | GROUPS_GET_STATE, SCAN_START, SCAN_RETRY_GROUP | WIRED | All 8 constants imported at lines 11-21 |
| main/index.ts | groupChannels.ts | registerGroupChannels, emitGroupsState, emitScanState | WIRED | Line 13, 232 |
| groupsStore.ts | groupsClient.ts | onGroupsState, onScanState subscriptions | WIRED | Lines 47, 51 |
| GroupsPane.tsx | groupsStore.ts | useGroupsStore, groupsActions | WIRED | Line 17-18, 54 |
| GroupsPane.tsx | targetStore.ts | useTargetStore for mode derivation | WIRED | Line 55, 61 |
| GroupsPane.tsx | GroupRow.tsx | renders per dialog | WIRED | Lines 276-285 |
| AppShell.tsx | GroupsPane.tsx | renders in right pane | WIRED | Lines 11, 41-43 |
| targetChannels.ts | MembershipScanner | scanner.abortScan() on TARGET_RESET | NOT WIRED | CR-01: targetChannels.ts TARGET_RESET only calls resolver.reset(); scanner is never notified — scan state persists across target changes |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| GroupsPane.tsx | groups (GroupsState) | groupsStore → groupsClient.onGroupsState → main GroupEnumerator | Real: getDialogs() via governor.run() | FLOWING |
| GroupsPane.tsx | scan (ScanState) | groupsStore → groupsClient.onScanState → main MembershipScanner | Real: GetParticipant / GetFullChat per group | FLOWING with CR-01 staleness risk |
| GroupsPane.tsx | checkedDialogIds | groupsStore computed from scan results | Pre-check from real scan results | FLOWING with CR-03 wipe risk on retry |
| GroupRow.tsx | dialog.canAct | AdminDialogDTO from GroupEnumerator._classifyDialog | Real: instanceof check on GramJS entity | FLOWING |
| GroupRow.tsx | membershipStatus | getMembershipStatus(dialog.id) from scan.results | Real: per-group membership check | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable standalone entry points. The app requires Electron runtime and live Telegram auth for any behavioral verification. The human checkpoint (plan 04-10) was completed and APPROVED by the developer after two defect-fix rounds (commits 0ae6f4b, deacaab, 34d62f1, 728e3c9, 3b83d93).

### Probe Execution

No probe scripts defined or discovered for Phase 4. Phase 4 is a UI + service layer phase with no standalone CLI/script entry points.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| GRP-01 | 04-01, 04-04 | App lists only groups where target is actually a member | SATISFIED | MembershipScanner: GetParticipant + GetFullChat; all non-member signals tested; 12 passing membershipScanner.test.ts cases |
| GRP-02 | 04-01, 04-06, 04-08 | Each listed group pre-checked for removal | SATISFIED | groupsStore pre-check on scan complete; GroupRow Checkbox receives isChecked prop |
| GRP-03 | 04-01, 04-06 | User can uncheck groups | SATISFIED | groupsActions.toggleGroup synchronous local set mutation; no IPC |
| GRP-04 | 04-01, 04-03, 04-07 | Groups lacking ban rights greyed-out with specific reason | SATISFIED | GroupEnumerator sets canAct+greyReason; GroupRow opacity-50 + GROUP_GREY_COPY[greyReason] |
| GRP-05 | 04-01, 04-03, 04-07 | App detects group type (basic/supergroup/channel) | SATISFIED | instanceof Api.Chat / Api.Channel + megagroup; type badge per GROUP_TYPE_LABEL |

All 5 Phase 4 requirements are covered. No orphaned requirements found. REQUIREMENTS.md Traceability table marks GRP-01 through GRP-05 as Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/renderer/groups/groupsCopy.ts | 33 | FLOOD_WAIT copy says "will load automatically" but no auto-retry exists | WARNING | WR-05: misleading copy; user waits indefinitely for a reload that never happens. Recovery path (Refresh button) not mentioned. |
| src/renderer/groups/GroupsPane.tsx | 65-69 | Abort effect fires only when scan.step === 'scanning' | BLOCKER | CR-01: completed scan not aborted on target change — stale results shown for next target |
| src/renderer/store/groupsStore.ts | 53-65 | checkedDialogIds rebuilt from scratch on every 'complete' emission | BLOCKER | CR-03: user manual deselections wiped on retryGroup() — removal set silently re-includes excluded groups |
| src/main/telegram/MembershipScanner.ts | 184-214 | retryGroup() lacks generation guard across await | BLOCKER | CR-02: TypeError crash if state changes during retry; cross-target result merge if target changed between scan and retry |
| src/main/ipc/targetChannels.ts | 78-81 | TARGET_RESET does not reset scanner state | BLOCKER | CR-01 root cause in main: scan.step stays 'complete' permanently across target changes |
| src/main/telegram/membershipScanner.test.ts | 65, 278, 351, 411, 451 | new RateLimitGovernor(mockClient as never) wrong argument shape | WARNING | WR-06: five tests exercise a misconfigured governor; break when constructor dereferences options.client |
| src/main/telegram/GroupEnumerator.ts | 167 | basic-group grey reason always 'not-creator' even for admins lacking banUsers | WARNING | WR-07: non-creator admin with no banUsers right sees wrong copy ("Only group creators can remove members here" is false when admin rights exist but banUsers is absent) |

No `TBD`, `FIXME`, or `XXX` debt markers found in any Phase 4 modified file.

### Human Verification Required

No human verification items — the plan 04-10 human checkpoint was completed and APPROVED. The three code review findings (CR-01, CR-02, CR-03) are verifiable programmatically; they are confirmed FAILED by code inspection above.

### Gaps Summary

Three BLOCKERs prevent the phase goal from being fully achieved. They all cluster around the same root concern: **scan lifecycle coordination across target changes and retries**. The code correctly implements the goal for a single target / single run but fails to maintain correctness when targets change or retries occur.

**BLOCKER group: scan-lifecycle coordination (CR-01, CR-02, CR-03)**

These three defects share a single root cause: the scan state machine was not wired to reset on target change, and the renderer store does not distinguish first-complete from retry-complete.

- **CR-01** (stale scan / D-15 violation): Completing a scan for target A and then confirming target B does not re-run the scan. Target A's membership results, including the pre-checked removal set, are displayed for target B. The core product guarantee — "remove the right person from every relevant community" — is violated.

- **CR-02** (retryGroup crash / cross-target merge): retryGroup() can crash with a TypeError if the scan is aborted or a new scan starts during the awaited _checkMembership() call. Worse, if the user confirmed a new target while retryGroup() was in flight, the retry checks the new target's membership but merges that result into the old target's checklist — a silent data-integrity corruption of the removal set.

- **CR-03** (user deselection wipe): Every time retryGroup() completes, it re-emits 'complete' and the store rebuilds checkedDialogIds from scratch. User manual deselections are silently destroyed. The confirmed removal set passed to Phase 5 will include groups the admin explicitly unchecked.

**Fix guidance (from 04-REVIEW.md CR-01/CR-02/CR-03):**
1. In `targetChannels.ts` TARGET_RESET handler: call `scanner.abortScan()` to transition scan state to 'idle', enabling the renderer auto-start effect.
2. In `MembershipScanner.retryGroup()`: capture `const gen = this._generation` before the await and guard with `if (gen !== this._generation || this._currentState.step !== 'complete') return` after the await.
3. In `groupsStore.ts` onScanState: track previous step; only compute the pre-check set on the first transition into 'complete' (wasComplete = false → true); on retry-complete (wasComplete = true), call `setState({ scan: s })` without touching checkedDialogIds.

---

_Verified: 2026-06-12T01:30:00Z_
_Verifier: Claude (gsd-verifier)_
