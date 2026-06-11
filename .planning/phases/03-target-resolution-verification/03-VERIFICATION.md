---
phase: 03-target-resolution-verification
verified: 2026-06-11T19:30:00Z
status: gaps_found
score: 2/4 must-haves verified
overrides_applied: 0
gaps:
  - truth: "User can enter a username OR a phone number and the app resolves it to a stable numeric user ID + access_hash exactly once, early, and references that ID from then on"
    status: failed
    reason: "CR-02: TargetResolver.ts duck-types real GramJS peer IDs as native bigint (typeof check, === comparison), but GramJS telegram@2.26.22 uses big-integer library objects (typeof === 'object'). In production, every ResolveUsername and ResolvePhone response has peer.userId of type 'object', not 'bigint', so the typeof guard at lines 179/215 fires for ALL valid users — resolution throws TARGET_NO_PUBLIC_PROFILE for every lookup. Additionally, even if that guard were removed, the find() call at lines 186-188/222-224 compares BigInteger objects by reference (===), which is always false for distinct instances, so the user would be not found and USERNAME_NOT_OCCUPIED would be thrown. The mock returns native BigInt() values so all 18 tests pass, hiding total production failure."
    artifacts:
      - path: "src/main/telegram/TargetResolver.ts"
        issue: "Line 179: typeof peer.userId !== 'bigint' — always true against real GramJS responses (GramJS uses big-integer objects). Lines 186-187: u.id === peer.userId — reference equality on BigInteger objects, always false."
      - path: "src/main/telegram/__mocks__/telegramClient.ts"
        issue: "Lines 184, 186 return BigInt(r.userId) (native bigint) diverging from GramJS's BigInteger instances — tests pass, production is broken."
    missing:
      - "Replace typeof peer.userId !== 'bigint' with a null/undefined check (peerUserId?.toString())"
      - "Replace u.id === peer.userId with u.id.toString() === peerUserId.toString()"
      - "Update mock to return big-integer instances (bigInt('111111111') from 'big-integer') to match real GramJS shape"
      - "Add a test that explicitly verifies resolution succeeds when IDs are big-integer objects (not native bigint)"

  - truth: "When resolution fails, user gets a distinct, accurate message per cause: username not found, phone not in contacts, or no public profile"
    status: failed
    reason: "CR-03: TARGET_NO_PUBLIC_PROFILE is unreachable and misclassified as NETWORK. Two compounding defects: (1) classifyRpcError in operationErrors.ts has no branch for 'TARGET_NO_PUBLIC_PROFILE' — it falls through to the UNKNOWN branch (branch 5, returns code: 'UNKNOWN'). (2) The throw at TargetResolver.ts:183/219 assigns only the classified fields (code, disposition) to the error — it does NOT attach an errorMessage property. When the outer catch in resolve() sees this, it has errorMessage: undefined, which matches the !errorMessage branch (branch 4) and returns code: 'NETWORK'. Net: whenever a channel/group username is looked up, the user sees 'Couldn't reach Telegram. Check your connection and try again.' — actively misleading copy that blocks the correct distinct message ('This person can't be looked up publicly...'). Because CR-02 currently sends EVERY real resolution through this path, this is the error every real user would see for every lookup attempt."
    artifacts:
      - path: "src/main/telegram/operationErrors.ts"
        issue: "No branch for errorMessage === 'TARGET_NO_PUBLIC_PROFILE' — falls to UNKNOWN, then the outer resolve() catch re-classifies as NETWORK."
      - path: "src/main/telegram/TargetResolver.ts"
        issue: "Lines 181-183, 217-219: throw Object.assign(new Error('TARGET_NO_PUBLIC_PROFILE'), classified) — classified has code/disposition but NOT errorMessage, causing the outer catch to misidentify it as a network error."
    missing:
      - "Add branch in operationErrors.ts: if (errorMessage === 'TARGET_NO_PUBLIC_PROFILE') return { code: 'TARGET_NO_PUBLIC_PROFILE', disposition: 'fail' }"
      - "Change the throw in TargetResolver.ts to include errorMessage: throw Object.assign(new Error('TARGET_NO_PUBLIC_PROFILE'), { errorMessage: 'TARGET_NO_PUBLIC_PROFILE' })"
      - "Add classifier test: TARGET_NO_PUBLIC_PROFILE input → code TARGET_NO_PUBLIC_PROFILE, disposition fail"
      - "Add resolver test: when resolved.peer is a channel peer (no userId), error state code is TARGET_NO_PUBLIC_PROFILE, not NETWORK"

  - truth: "User sees the target's avatar plus text identity (name, @username, numeric ID, bio) for confirmation — AND the UI does not crash on first successful resolution"
    status: failed
    reason: "CR-01: TargetCard.tsx violates React's Rules of Hooks. useMemo is called on lines 80 and 82 AFTER a conditional early return on line 74 ('if (target.step !== resolved and !== confirmed) return null'). React requires hooks to be called in the same order on every render. TargetCard is mounted unconditionally in StubbedWorkflowRegions.tsx. On initial render (step: 'idle'), React executes 1 hook (useTargetStore) and returns. On first successful resolution (step: 'resolved'), the component renders 3 hooks. React throws 'Rendered more hooks than during the previous render', which tears down the component tree — the UI crashes the first time a target is resolved. Two eslint-disable comments on those lines confirm the lint guard fired and was suppressed instead of fixed. There is no React error boundary in AppShell.tsx to contain this crash."
    artifacts:
      - path: "src/renderer/target/TargetCard.tsx"
        issue: "Lines 74, 79-82: useMemo calls at lines 80 and 82 appear after conditional early return at line 74. eslint-disable react-hooks/rules-of-hooks comments at lines 79 and 81 confirm the violation was known and suppressed."
    missing:
      - "Move all hooks above the early return: compute avatarUrl and initials unconditionally using optional chaining (t?.avatar, t?.name) where t = target.step === 'resolved' || 'confirmed' ? target.target : null"
      - "Remove both eslint-disable react-hooks/rules-of-hooks comments"
      - "Guard the card body on the extracted 't' variable (if !t return null), placed after all hooks"
human_verification:
  - test: "Type '@username' in the Find input, observe mode chip; type digits, observe CountryPicker + Phone chip; paste 'https://t.me/durov', observe normalization to 'durov' + Username chip"
    expected: "Mode chip updates live; CountryPicker appears left of field for bare digits; paste strips URL prefix and shows Username chip"
    why_human: "Visual behavior and live keystroke interaction cannot be verified with grep"
  - test: "After CR-01 is fixed: resolve a real Telegram username, verify the identity card renders without crashing; observe avatar (or initials fallback), name, @username, numeric ID, bio, last-seen"
    expected: "Card appears, all identity fields visible, no React error boundary or white screen"
    why_human: "Requires live Telegram API call and visual inspection of rendered output"
  - test: "After CR-02 is fixed: resolve a real username and a real phone number, verify correct resolved state; resolve a non-existent username, verify distinct 'No one has that username' error appears"
    expected: "Successful resolution shows identity card; non-existent username shows cause-specific copy, not 'network error'"
    why_human: "Requires live Telegram credentials and visual copy verification"
  - test: "After all fixes: resolve a target with no avatar; verify no-photo Alert appears with 'No profile photo' heading; confirm the 'Yes, this is the person' button still works"
    expected: "No-photo notice appears; 'Yes, this is the person' button is enabled; clicking it transitions to confirmed state (ring on avatar, 'Target confirmed' indicator)"
    why_human: "Requires a real account with no avatar and visual inspection of the no-photo fallback flow"
  - test: "In confirmed state: click 'Change target'; verify state resets to idle, input field returns, TargetCard disappears"
    expected: "Full reset to idle; input editable again; no stale target data visible"
    why_human: "State transition and UI collapse behavior requires running app"
---

# Phase 3: Target Resolution & Verification — Verification Report

**Phase Goal:** A user can specify a target by username or phone, have it resolved once to a stable numeric user ID acted on thereafter, and visually confirm it is the right person via avatar and identity details — with honest handling when resolution fails or no avatar exists.
**Verified:** 2026-06-11T19:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The phase has strong structural foundations: the IPC stack, state machine, shared types, preload bridge, and renderer wiring are all substantively implemented and connected end-to-end. However, three independent production-breaking defects established in the code review (03-REVIEW.md) are verified to exist in the current codebase. Two of them (CR-01, CR-02) make the phase goal observably false for a real user: the app UI would crash on first successful resolution, and all real Telegram API lookups would fail with a misleading error message.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can enter username or phone and app resolves it to a stable numeric user ID + access_hash exactly once | ✗ FAILED | CR-02: `typeof peer.userId !== 'bigint'` at TargetResolver.ts:179/215 always fires against real GramJS responses (big-integer objects, not native bigint). All real lookups produce TARGET_NO_PUBLIC_PROFILE. Mock returns native `BigInt()` so tests pass. |
| 2 | User sees target's avatar plus text identity (name, @username, numeric ID, bio) for confirmation | ✗ FAILED | CR-01: TargetCard.tsx calls `useMemo` (lines 80, 82) after conditional early return (line 74). React throws "Rendered more hooks than during the previous render" on first transition from idle→resolved, crashing the UI. Two `eslint-disable react-hooks/rules-of-hooks` comments confirm the violation was known. |
| 3 | When no avatar available, user sees clear no-photo fallback with available identity details and can still choose to proceed | ✓ VERIFIED | TargetCard.tsx lines 192-203: `!hasAvatar` guard renders `Alert` with "No profile photo" heading + body. Footer confirm/change buttons rendered outside that guard. Implementation correct — but only reachable once CR-01 is fixed. |
| 4 | When resolution fails, user gets a distinct, accurate message per cause (username not found, phone not in contacts, no public profile) | ✗ FAILED | CR-03: `classifyRpcError` has no branch for `'TARGET_NO_PUBLIC_PROFILE'`; the throw at TargetResolver.ts:183/219 does not attach `errorMessage`, so the outer catch re-classifies it as NETWORK. User sees "Couldn't reach Telegram" for any non-user peer (channel/group username). With CR-02 also present, EVERY real lookup reaches this path, giving every user a network error for every lookup. USERNAME_NOT_OCCUPIED and PHONE_NOT_OCCUPIED paths are correctly classified (verified in test suite and operationErrors.ts lines 119-126). |

**Score:** 1/4 truths observably true for a real user (Truth 3 — no-photo fallback logic is correct in the code, but is blocked from reaching a user by CR-01)

Adjusted scoring treating Truth 3 as contingent: **0/4 independently reachable** by a real user without fixes.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/targetTypes.ts` | TargetState, ResolvedTargetDTO, TargetErrorCode | ✓ VERIFIED | All exports present; no accessHash in DTO; 5-variant TargetState; TargetErrorCode with 6 members |
| `src/shared/channels.ts` | TARGET_RESOLVE, TARGET_CONFIRM, TARGET_RESET, TARGET_GET_STATE, TARGET_STATE | ✓ VERIFIED | All 5 constants present and in CHANNELS object |
| `src/shared/opTypes.ts` | OperationErrorCode extended with TARGET_* codes | ✓ VERIFIED | Lines 31-33: TARGET_USERNAME_NOT_FOUND, TARGET_PHONE_NOT_FOUND, TARGET_NO_PUBLIC_PROFILE present |
| `src/main/telegram/TargetResolver.ts` | Username + phone resolution service | ✗ STUB/BROKEN | File exists and is substantive, but CR-02 makes the production code path fail for all real GramJS responses. Structure is correct; duck-typing is wrong. |
| `src/main/ipc/targetChannels.ts` | IPC handlers for target:resolve, target:confirm, target:reset, target:getState | ✓ VERIFIED | All 4 handlers registered; Zod validation on TARGET_RESOLVE; emitTargetState with isDestroyed guard |
| `src/renderer/ipc/targetClient.ts` | Typed wrapper over window.mrproper target methods | ✓ VERIFIED | 6 methods exported; Window.mrproper interface augmented additively |
| `src/renderer/store/targetStore.ts` | useTargetStore() + targetActions | ✓ VERIFIED | useSyncExternalStore pattern; subscribes to onTargetState and onGovernorEvent; targetActions (resolve/confirm/reset) exported |
| `src/preload/index.ts` | contextBridge exposes resolveTarget, confirmTarget, resetTarget, getTargetState, onTargetState, onGovernorEvent | ✓ VERIFIED | All 6 entries present inside single exposeInMainWorld call |
| `src/main/index.ts` | TargetResolver instantiated and wired with emitTargetState + registerTargetChannels | ✓ VERIFIED | Lines 178-190: resolver instantiated, onStateChange → emitTargetState, registerTargetChannels called |
| `src/renderer/target/TargetInput.tsx` | Smart input with mode detection, flood countdown, client-side validation | ✓ VERIFIED | Mode detection, CountryPicker, explicit submit, D-04 normalization, inline errors, FloodCountdown wired |
| `src/renderer/target/TargetCard.tsx` | Identity card with avatar, badges, no-photo notice, confirm gate | ✗ BROKEN | File exists and is substantive; CR-01 hooks violation (lines 80, 82 call useMemo after early return at line 74) causes React crash on first resolved render |
| `src/renderer/target/resolveCopy.ts` | All UI strings — RESOLVE_ERROR_COPY, getResolveCopy, constants | ✓ VERIFIED | All 6 error codes mapped; all required constants exported; no raw Telegram strings |
| `src/renderer/shell/StubbedWorkflowRegions.tsx` | Target stub replaced with TargetInput + TargetCard | ✓ VERIFIED | Imports and renders TargetInput + TargetCard; group-list stub unchanged |
| `src/renderer/components/ui/badge.tsx` | Badge component for identity badges | ✓ VERIFIED | Exists; exports Badge and badgeVariants |
| `src/main/telegram/operationErrors.ts` | classifyRpcError with TARGET_USERNAME_NOT_FOUND, TARGET_PHONE_NOT_FOUND branches | ✗ PARTIAL | Lines 119-126: USERNAME_NOT_OCCUPIED and PHONE_NOT_OCCUPIED branches present and correct. TARGET_NO_PUBLIC_PROFILE branch is absent — CR-03. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `TargetInput.tsx` | `targetStore.ts` | `useTargetStore()`, `targetActions.resolveTarget()` | ✓ WIRED | Lines 19-20, 120, 191 |
| `TargetCard.tsx` | `targetStore.ts` | `useTargetStore()`, `targetActions.confirmTarget()`, `targetActions.resetTarget()` | ✓ WIRED | Lines 19-20, 71, 214, 229 |
| `StubbedWorkflowRegions.tsx` | `TargetInput.tsx`, `TargetCard.tsx` | import + render | ✓ WIRED | Lines 6-7, 13-17 |
| `preload/index.ts` | `targetChannels.ts` (via ipcMain) | `ipcRenderer.invoke('target:resolve', ...)` | ✓ WIRED | Preload lines 42-54; targetChannels registers matching handlers |
| `main/index.ts` | `TargetResolver.ts` | `new TargetResolver(...)` | ✓ WIRED | main/index.ts lines 178-189 |
| `TargetResolver.ts` | `governor.ts` | `this._governor.run(...)` | ✓ WIRED | All Telegram calls routed through governor; no direct _client.invoke() outside governor |
| `TargetResolver.ts` | `targetTypes.ts` | TargetState discriminated union | ✓ WIRED | Import at line 29; used throughout |
| `TargetResolver.ts` → peer check | Real GramJS response | `typeof peer.userId !== 'bigint'` | ✗ NOT_WIRED | CR-02: GramJS returns big-integer objects (typeof === 'object'); the guard rejects all valid responses |
| `classifyRpcError` | TARGET_NO_PUBLIC_PROFILE classification | `errorMessage === 'TARGET_NO_PUBLIC_PROFILE'` branch | ✗ NOT_WIRED | CR-03: No such branch in operationErrors.ts; code falls to UNKNOWN then gets re-classified as NETWORK |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `TargetCard.tsx` | `target` (from `useTargetStore()`) | `targetStore.ts` → IPC `TARGET_STATE` → `TargetResolver.ts` → `contacts.ResolveUsername/ResolvePhone` | No — CR-02 means resolver never produces a valid resolved state in production; all real calls result in error state | ✗ HOLLOW — wired structure correct, but data source blocked by CR-02 |
| `TargetInput.tsx` | `target`, `governorFloodRemaining` | `targetStore.ts` → IPC subscriptions | Error display path works (error state does flow); resolving/resolved states are unreachable in production | ✗ HOLLOW for resolved path |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All targetResolver.test.ts pass | `npm test -- src/main/telegram/targetResolver.test.ts` | 18/18 PASS | ✓ PASS (but misleading — mock diverges from real GramJS shape) |
| All operationErrors.test.ts pass | `npm test -- src/main/telegram/operationErrors.test.ts` | 14/14 PASS | ✓ PASS |
| TypeScript compiles clean | `npx tsc --noEmit` | Exit 0 | ✓ PASS |
| Full test suite | `npm test` | 103/105 pass (2 pre-existing config.test.ts failures unrelated to Phase 3) | ✓ PASS |
| Real GramJS bigint type | `node -e "const bigInt = require('big-integer'); const x = bigInt('123'); console.log(typeof x)"` | `object` | ✗ CONFIRMS CR-02 — real peer IDs are objects, not native bigint; typeof check in TargetResolver always rejects valid users |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TGT-01 | 03-01, 03-02, 03-03 | User can specify target by username | ✗ BLOCKED | Username entry and IPC plumbing complete; blocked by CR-02 (typeof check rejects real peer IDs) |
| TGT-02 | 03-01, 03-02, 03-03 | User can specify target by phone number | ✗ BLOCKED | Phone entry and IPC plumbing complete; blocked by CR-02 (same typeof check at TargetResolver.ts:215) |
| TGT-03 | 03-01, 03-03 | App resolves to stable numeric user ID early; acts by that ID | ✗ BLOCKED | user.id.toString() is used correctly if resolution reaches that point; blocked by CR-02 before that point |
| TGT-04 | 03-01, 03-03, 03-05 | Graceful handling with distinct messages per cause | ✗ PARTIAL | USERNAME_NOT_OCCUPIED → TARGET_USERNAME_NOT_FOUND and PHONE_NOT_OCCUPIED → TARGET_PHONE_NOT_FOUND are correct. TARGET_NO_PUBLIC_PROFILE classification is broken (CR-03) — produces NETWORK error instead. |
| VRF-01 | 03-02, 03-03, 03-05 | App displays target's avatar for visual confirmation | ✗ BLOCKED | Avatar bytes flow correctly through DTO; blocked by CR-01 (TargetCard crashes before rendering) and CR-02 (no resolved state ever produced in production) |
| VRF-02 | 03-02, 03-03, 03-05 | App shows text identity (name, username, numeric ID, bio) | ✗ BLOCKED | All fields present in TargetCard; blocked by CR-01 crash |
| VRF-03 | 03-02, 03-03, 03-04, 03-05 | No-avatar fallback shown; user can proceed | ✓ LOGIC VERIFIED | No-photo Alert renders when hasAvatar is false; confirm gate not blocked by avatar absence. Only reachable after CR-01 and CR-02 are fixed. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/renderer/target/TargetCard.tsx` | 79 | `// eslint-disable-next-line react-hooks/rules-of-hooks` | 🛑 Blocker | Known hooks violation suppressed instead of fixed; causes React crash on first resolved render (CR-01) |
| `src/renderer/target/TargetCard.tsx` | 81 | `// eslint-disable-next-line react-hooks/rules-of-hooks` | 🛑 Blocker | Same as above — second suppressed hooks violation |
| `src/main/telegram/TargetResolver.ts` | 179 | `typeof peer.userId !== 'bigint'` | 🛑 Blocker | Assumes native bigint; GramJS returns big-integer objects; rejects all valid real users (CR-02) |
| `src/main/telegram/TargetResolver.ts` | 186-188 | `u.id === peer.userId` (reference equality on BigInteger objects) | 🛑 Blocker | Object reference equality never matches distinct BigInteger instances; user always not found even if typeof check were removed (CR-02) |
| `src/main/telegram/TargetResolver.ts` | 183, 219 | `throw Object.assign(new Error('TARGET_NO_PUBLIC_PROFILE'), classified)` | 🛑 Blocker | classified has code/disposition but no errorMessage; outer catch misclassifies as NETWORK (CR-03) |
| `src/main/telegram/__mocks__/telegramClient.ts` | 184, 186 | `BigInt(r.userId)` / `BigInt(r.userId)` | ⚠️ Warning | Mock returns native bigint; real GramJS returns big-integer objects; masking CR-02 from test suite |
| `src/renderer/target/TargetInput.tsx` | 154 | `value.trim().match(/^@/)` in isLink condition | ⚠️ Warning | Strips '@' on every keystroke; user can't type '@' (WR-05 from review). Functional workaround exists (username path normalizes anyway), but UX defect — mode chip flickers. |
| `src/renderer/store/targetStore.ts` | 37 | `let refCount = 0` alongside `listeners.size` gating | ℹ️ Info | Redundant counter (IN-02); both refCount and listeners.size track the same transition |
| `src/main/ipc/targetChannels.ts` | 56-57 | `void win` (parameter received but discarded) | ℹ️ Info | Dead parameter creates false impression of window-affinity (IN-01 from review) |

### Human Verification Required

All items below are contingent on the three blockers being fixed first.

### 1. Input Mode Chip Visual Behavior

**Test:** Type `@username`, observe chip; type digits, observe CountryPicker left + Phone chip right; paste `https://t.me/durov`, observe normalization.
**Expected:** Mode chip updates live; CountryPicker appears at left for bare digits; paste clears URL prefix and shows username chip.
**Why human:** Keystroke visual behavior and live DOM state cannot be verified with static analysis.

### 2. End-to-End Resolution with Real Telegram API (requires CR-02 fix)

**Test:** With app running and logged in, resolve a real Telegram username. Observe: spinner while resolving, then identity card with avatar (or initials fallback), name, @username, numeric ID, bio, last-seen.
**Expected:** Identity card renders without crash; all available identity fields are visible; numeric ID shown in monospace with tooltip.
**Why human:** Requires live Telegram credentials and visual inspection.

### 3. Cause-Specific Error Copy (requires CR-02 and CR-03 fixes)

**Test:** Submit a username that doesn't exist. Submit a phone number not on Telegram.
**Expected:** Non-existent username shows "No one has that username. Check the spelling..."; phone not on Telegram shows the phone-specific copy. Neither shows "Couldn't reach Telegram."
**Why human:** Requires live API calls and reading the exact error text rendered.

### 4. No-Avatar Fallback Flow (requires CR-01 and CR-02 fixes)

**Test:** Resolve a user with no profile photo. Observe the identity card.
**Expected:** Colored-initials avatar displayed; "No profile photo" Alert visible; "Yes, this is the person" button enabled and functional.
**Why human:** Requires a Telegram account with no avatar and visual inspection of the fallback.

### 5. Confirm Gate and Change Target (requires CR-01 and CR-02 fixes)

**Test:** Resolve a target, click "Yes, this is the person". Observe confirmed state. Then click "Change target".
**Expected:** After confirm: avatar gains ring, "Target confirmed" indicator shown, confirm button hidden. After change: state returns to idle, input field returns, TargetCard disappears.
**Why human:** State machine transitions and UI animation require running app inspection.

### Gaps Summary

Three independent production-breaking defects are confirmed in the codebase. All three were identified in 03-REVIEW.md (CR-01, CR-02, CR-03) and are verified to exist in the live source files.

**Root cause cluster — CR-02 + CR-03:** The central problem is that `TargetResolver.ts` was written against an incorrect assumption about GramJS's bigint representation. GramJS `telegram@2.26.22` declares all `long` fields as `BigInteger` from the `big-integer` npm library (plain objects, `typeof === 'object'`), not native `bigint`. The mock client returns native `BigInt()` values, which happen to work with both the `typeof` guard and `===` equality, masking the divergence from the entire test suite. In production, every valid username and phone resolution would fail the `typeof peer.userId !== 'bigint'` guard at lines 179 and 215, throwing a synthetic `TARGET_NO_PUBLIC_PROFILE` error. That error in turn is misclassified as `NETWORK` (CR-03) because the classifier lacks a `TARGET_NO_PUBLIC_PROFILE` branch and the throw does not carry `errorMessage`. The user sees "Couldn't reach Telegram" for every lookup attempt.

**Root cause — CR-01:** `TargetCard.tsx` calls `useMemo` hooks after a conditional early return, which is a fundamental React rules-of-hooks violation. The two `eslint-disable react-hooks/rules-of-hooks` comments on lines 79 and 81 document that the linter caught this and it was suppressed rather than fixed. This causes React to crash the component tree the first time a target transitions from `idle` to `resolved`. There is no error boundary in `AppShell.tsx` to contain the crash.

**What is correct and complete:** All shared types, IPC channel constants, error classification (for the two implemented cases), preload bridge, renderer IPC client, target store, main process wiring, TargetInput component, resolveCopy.ts, and StubbedWorkflowRegions.tsx are substantively implemented, correctly wired, and TypeScript-clean. The structural foundation is solid; the three defects are localized and fixable without architectural changes.

---

_Verified: 2026-06-11T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
