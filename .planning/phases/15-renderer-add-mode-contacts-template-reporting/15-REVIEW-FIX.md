---
phase: 15-renderer-add-mode-contacts-template-reporting
fixed_at: 2026-10-04T04:17:00Z
review_path: .planning/phases/15-renderer-add-mode-contacts-template-reporting/15-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-10-04T04:17:00Z
**Source review:** .planning/phases/15-renderer-add-mode-contacts-template-reporting/15-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-04, WR-05 — `fix_scope: critical_warning`, IN-01/IN-02 excluded)
- Fixed: 8
- Skipped: 0

All fixes verified via `npx tsc --build` (clean, no errors), `npm run build` (renderer/main/preload bundles succeed), and `npx vitest run` (44 files / 587 tests green, up from the 44/585 baseline — WR-02 and WR-03 each added one unit test). Emitted `.js`/`.d.ts` artifacts under `src/` were deleted after every `tsc --build` run (never `src/main/env.d.ts` or `src/renderer/i18n/i18next.d.ts`).

## Fixed Issues

### CR-01: Add-mode checklist rows render as non-interactive and visually unchecked despite being pre-checked in the store

**Files modified:** `src/renderer/groups/GroupRow.tsx`, `src/renderer/groups/GroupsPane.tsx`
**Commit:** 106e0a9
**Applied fix:** `GroupRowProps` gained an optional `activeMode?: GroupMode` prop (default `'remove'`). `isActionable` is now computed via the shared `isActionableForMode(dialog, membershipStatus, activeMode)` predicate instead of the hard-coded Remove-mode rule. The actionable checkbox's `aria-label` now switches to `tAdd('includeInAddAria', ...)` when `activeMode === 'add'`, wiring up the previously-dead i18n key (also closes IN-01). `GroupsPane` now passes its `activeMode` through to each `GroupRow` instantiation — required for the fix to take effect at the call site, even though the review's File: line cited only `GroupRow.tsx`. Remove/Tag behavior is byte-identical (the default parameter preserves the exact prior rule).

### CR-02: Add-mode grey-reason caption leaks onto ordinary Remove/Tag checklist rows

**Files modified:** `src/renderer/groups/GroupRow.tsx`
**Commit:** bc9be83
**Applied fix:** Gated the add-grey-reason caption (`dialog.addGreyReason`) on `activeMode === 'add'`, matching the rest of the file's Add-specific blocks. Also gated the "banned — will be lifted first" note (`rowNote.bannedWillUnban`) on `activeMode === 'add'` for the same reason (`canAdd`/`membershipStatus` are populated unconditionally by the scan, independent of the active mode) — this extends the fix per the "gate ... any other Add-only captions" guidance, since it is the same category of leak as the cited caption.

### CR-03: "Reset to default" in the DM template editor doesn't update the visible draft

**Files modified:** `src/renderer/wizard/DmTemplateEditor.tsx`, `src/renderer/wizard/ReviewScreen.tsx`
**Commit:** 838f5d7
**Applied fix:** Changed `DmTemplateEditorProps.onReset` from `() => void` to `() => string`. `ReviewScreen`'s `onReset` callback now returns the computed default template string after persisting it. `DmTemplateEditor.handleReset` seeds `draft` from that return value directly instead of the stale closed-over `value` prop, so the open editor's textarea shows the default immediately.

### WR-01: Settings-menu "Export add log" never shows its "No add log yet" message

**Files modified:** `src/renderer/shell/SettingsMenu.tsx`
**Commit:** ac1da70
**Applied fix:** `handleExportLog` no longer closes the menu before the IPC call resolves. On a `'no-log'` result it sets the message and returns early (menu stays open); on success or error it closes the menu after the result is known.

### WR-02: `ADD_EXPORT_LOG` can reject across IPC with no catch on either side

**Files modified:** `src/main/ipc/addChannels.ts`, `src/main/ipc/addChannels.test.ts`, `src/renderer/groups/GroupsPane.tsx`
**Commit:** 9510fed
**Applied fix:** Wrapped `copyFileSync` in try/catch in the main-process handler, returning `{ ok: false, reason: 'canceled' }` on failure (reusing the existing `AddExportLog` result union rather than introducing a new reason). Added a defensive try/catch at the `GroupsPane.handleExportAddLog` call site too. Added unit test 19 in `addChannels.test.ts` covering the `copyFileSync`-throws path.

### WR-03: `computeAddGroups` has no defensive `canAdd` re-filter

**Files modified:** `src/renderer/wizard/addValidation.ts`, `src/renderer/wizard/addValidation.test.ts`
**Commit:** 3d5215f
**Applied fix:** Added `&& d.canAdd` to `computeAddGroups`'s filter predicate, mirroring `computePlannedActions`'s `d.canAct` safety net on the Remove path. Added a unit test confirming a checked-but-`canAdd: false` dialog is excluded from the result.

### WR-04: Shared "stop" aria-label says "removal" for Tag and Add runs

**Files modified:** `src/renderer/i18n/locales/en/add.json`, `src/renderer/i18n/locales/cs/add.json`, `src/renderer/i18n/locales/en/tag.json`, `src/renderer/i18n/locales/cs/tag.json`, `src/renderer/groups/GroupsPane.tsx`
**Commit:** 4ea0da4
**Applied fix:** Added `stopTagAria`/`stopAddAria` keys to the `tag`/`add` namespaces (en + cs, formal vykání) and wired them into the Tag and Add stop buttons in `GroupsPane`, replacing the shared `groups:stopRemovalAria`. The Removal stop button (line ~646) is unchanged.

### WR-05: Scan-progress fallback omits the `add.step === 'idle'` guard present in the Tag/Add pattern

**Files modified:** `src/renderer/groups/GroupsPane.tsx`
**Commit:** fa851cb
**Applied fix:** Added `&& add.step === 'idle'` to the scan-progress fallback condition, matching every other removal/tag/add parallel block in the file. This is a defensive consistency fix for a condition the reviewer flagged as currently unreachable-but-latent (it depends on the run-trigger-button gate invariant holding); flagging here for visibility even though the change itself is a trivial additive boolean clause matching an established sibling pattern.

## Skipped Issues

None — all 8 in-scope findings were fixed.

---

_Fixed: 2026-10-04T04:17:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
