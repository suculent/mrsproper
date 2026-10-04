---
phase: 15-renderer-add-mode-contacts-template-reporting
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 44
files_reviewed_list:
  - src/main/index.ts
  - src/main/ipc/addChannels.ts
  - src/main/ipc/addChannels.test.ts
  - src/main/ipc/clipboardChannels.ts
  - src/main/ipc/clipboardChannels.test.ts
  - src/main/ipc/templateChannels.ts
  - src/main/storage/addLogStore.ts
  - src/main/storage/addLogStore.test.ts
  - src/preload/index.ts
  - src/renderer/components/ui/textarea.tsx
  - src/renderer/groups/GroupRow.tsx
  - src/renderer/groups/GroupsPane.tsx
  - src/renderer/groups/ModeSwitch.tsx
  - src/renderer/groups/modeRules.ts
  - src/renderer/groups/modeRules.test.ts
  - src/renderer/i18n/i18n.test.ts
  - src/renderer/i18n/index.ts
  - src/renderer/i18n/locales/cs/add.json
  - src/renderer/i18n/locales/cs/groups.json
  - src/renderer/i18n/locales/en/add.json
  - src/renderer/i18n/locales/en/groups.json
  - src/renderer/ipc/addClient.ts
  - src/renderer/ipc/clipboardClient.ts
  - src/renderer/ipc/targetClient.ts
  - src/renderer/ipc/templateClient.ts
  - src/renderer/removal/AddResumeJobDialog.tsx
  - src/renderer/shell/AppShell.tsx
  - src/renderer/shell/SettingsMenu.tsx
  - src/renderer/store/addStore.ts
  - src/renderer/store/addStore.test.ts
  - src/renderer/store/groupsStore.ts
  - src/renderer/store/groupsStore.test.ts
  - src/renderer/store/targetStore.ts
  - src/renderer/store/targetStore.test.ts
  - src/renderer/target/TargetCard.tsx
  - src/renderer/wizard/DmTemplateEditor.tsx
  - src/renderer/wizard/ReviewScreen.tsx
  - src/renderer/wizard/addValidation.ts
  - src/renderer/wizard/addValidation.test.ts
  - src/renderer/wizard/wizardStage.ts
  - src/renderer/wizard/wizardStage.test.ts
  - src/shared/channels.ts
  - src/shared/dmTemplate.ts
  - src/shared/dmTemplate.test.ts
findings:
  critical: 3
  warning: 5
  info: 2
  total: 10
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-10-04
**Depth:** standard
**Files Reviewed:** 44
**Status:** issues_found

## Summary

The IPC boundary, stores, and validation helpers are in good shape: `ADD_START`/`ADD_RETRY_GROUP`/`TARGET_ADD_CONTACT`/`ADD_EXPORT_LOG`/`CLIPBOARD_WRITE_TEXT` all respect the no-identity/no-access-hash/no-resume-flag contract, `addStore`/`targetStore`/`groupsStore` have solid `useSyncExternalStore` snapshot stability and idempotent contact-add dispatch, `validateDmTemplate` and the Zod bound agree on 4000, `renderTemplate`'s single-pass regex correctly avoids re-substitution, and the pure predicate `isActionableForMode` plus its unit tests are correct and well covered.

However, the component that actually renders the Add-mode checklist row — `GroupRow.tsx` — was never updated to be mode-aware. Its checkbox-interactivity and grey-reason logic still hard-code the Remove-mode rule (`dialog.canAct && membershipStatus === 'member'`), which breaks the Add checklist's core interaction (BLOCKER #1) and leaks an Add-specific "already a member" caption onto ordinary Remove-mode rows (BLOCKER #2). A third BLOCKER is a stale-closure bug in `DmTemplateEditor`'s Reset handler that leaves the open editor showing the pre-reset text instead of the default. Several lower-severity gaps (a Settings-menu message that can never render, a missing `canAdd` safety filter, an Electron-IPC error path that isn't caught, and a mislabeled aria string) round out the Warnings.

## Critical Issues

### CR-01: Add-mode checklist rows render as non-interactive and visually unchecked despite being pre-checked in the store

**File:** `src/renderer/groups/GroupRow.tsx:135, 293-301`
**Issue:** `GroupRowProps` carries no notion of the active Remove/Tag/Add mode. The only predicate deciding whether a row gets an *interactive* `Checkbox` is:
```ts
const isActionable = dialog.canAct && membershipStatus === 'member'
```
This is the Remove-mode rule. In Add mode, `groupsStore.recomputeCheckedForMode('add')` correctly pre-checks rows where `dialog.canAdd && (status === 'not-member' || status === 'banned')` (per `isActionableForMode`), but `GroupRow`'s `isActionable` is never true for those rows (their `membershipStatus` is `'not-member'`/`'banned'`, never `'member'`). Since `removalStatus`/`tagStatus`/`addStatus` are all `null` before a run starts, `renderCheckboxSlot()` falls through `isPending` (false) and `isActionable` (false) straight to the final grey, `cursor-not-allowed`, `aria-checked="false"` fallback box — which also **ignores `isChecked` entirely**. The result: every actionable Add row is shown as a disabled, visually-unchecked box, with no way to toggle it, even though `checkedDialogIds` already contains it. The unused i18n key `includeInAddAria` (present in both `en/add.json` and `cs/add.json` but referenced nowhere) is further evidence this wiring was left incomplete — every interactive checkbox in the file (lines 195 and 298) hard-codes `tG('includeInRemovalAria', …)` regardless of mode.

Conversely, a "member" row with `canAct: true` (the common case for a target already in a group) **does** satisfy `isActionable` and renders an interactive, toggleable checkbox — even while `activeMode === 'add'`, where that row is explicitly non-actionable per D-05 ("false when status is member, regardless of canAdd"). So the bug runs in both directions: real Add-actionable rows can't be checked, and non-Add-actionable rows can be checked.

**Fix:** Thread the active mode (or a pre-computed `isActionable` boolean) into `GroupRow`, e.g.:
```ts
interface GroupRowProps {
  activeMode: GroupMode
  // ...
}
// inside the component:
const isActionable =
  activeMode === 'add'
    ? dialog.canAdd && (membershipStatus === 'not-member' || membershipStatus === 'banned')
    : dialog.canAct && membershipStatus === 'member'
```
and use the already-unused `tAdd('includeInAddAria', …)` string for the Add-mode aria-label.

### CR-02: Add-mode grey-reason caption leaks onto ordinary Remove/Tag checklist rows

**File:** `src/renderer/groups/GroupRow.tsx:536-540`
**Issue:**
```tsx
{addStatus == null && dialog.addGreyReason != null && dialog.greyReason == null && (
  <span className="text-label text-muted-foreground">
    {tG(`greyReason.${dialog.addGreyReason}`)}
  </span>
)}
```
This block has no `activeMode === 'add'` guard. `addGreyReason`/`canAdd` are populated by the scan unconditionally (not mode-gated), so for the *normal* Remove-mode scenario — the target is a current member of the group being reviewed for removal — `canAct` is `true` (`greyReason === null`) while `canAdd` is `false` with `addGreyReason === 'already-member'`. The condition above is therefore true for essentially every actionable Remove-mode row, and the UI renders a spurious "Already a member of this group" (or whichever add-grey-reason text) caption underneath the group title while the admin is reviewing a *removal*, not an add. The same leak applies while in Tag mode.
**Fix:** Gate this block on the active mode, matching the rest of the file's Add-specific blocks:
```tsx
{activeMode === 'add' && addStatus == null && dialog.addGreyReason != null && dialog.greyReason == null && (
  ...
)}
```

### CR-03: "Reset to default" in the DM template editor doesn't update the visible draft

**File:** `src/renderer/wizard/DmTemplateEditor.tsx:46-49`
**Issue:**
```ts
const handleReset = useCallback(() => {
  onReset()
  setDraft(value)
}, [onReset, value])
```
`onReset()` triggers the parent (`ReviewScreen`) to asynchronously update `currentTemplate` to the language default and persist it. `setDraft(value)` runs in the same tick, using the **stale closed-over `value`** from the render that created this callback — i.e. the pre-reset template, not the new default the parent is about to pass down. Because `draft` is local `useState` and there is no effect re-seeding it from `value` on prop change (only `handleToggle` reseeds on open), the open editor's `<Textarea>` keeps displaying the old template text after "Reset to default" is clicked, defeating D-11's explicit requirement ("Reset clears to the built-in default"). The bug is invisible only if the user hasn't edited the draft and then closes/reopens the editor (which re-seeds from the now-updated `value`).
**Fix:** Either close the editor on reset (`setIsEditing(false)`) so the next open re-seeds correctly, or synchronize `draft` to the actual default rather than the stale prop, e.g. by having `onReset` return the new template string and using that:
```ts
const handleReset = useCallback(() => {
  const next = onReset() // have onReset return the new default string
  setDraft(next)
}, [onReset])
```

## Warnings

### WR-01: Settings-menu "Export add log" never shows its "No add log yet" message

**File:** `src/renderer/shell/SettingsMenu.tsx:35-47, 215-219`
**Issue:** `handleExportLog` calls `setMenuOpen(false)` *before* awaiting `addClient.exportAddLog()`. The `{exportMessage === 'no-log' && ...}` JSX lives inside the `{menuOpen && (...)}` dropdown block, so by the time the IPC call resolves and `setExportMessage('no-log')` runs, the dropdown has already unmounted and the message is never visible. D-20 requires this entry point to show "No add log yet" when no log exists; currently clicking it with no log present produces no feedback at all.
**Fix:** Don't close the menu until the result is known (or render the message outside the menu, e.g. as a toast):
```ts
const handleExportLog = async (): Promise<void> => {
  try {
    const result = await addClient.exportAddLog()
    if (!result.ok && result.reason === 'no-log') {
      setExportMessage('no-log')
      return // keep menu open to show the message
    }
  } catch (err) { console.error(...) }
  setMenuOpen(false)
}
```

### WR-02: `ADD_EXPORT_LOG` can reject across IPC with no catch on either side

**File:** `src/main/ipc/addChannels.ts:267-285`, `src/renderer/groups/GroupsPane.tsx:543-549`
**Issue:** The handler's own doc comment and every sibling handler in this file guarantee "never throws across IPC" (e.g. `TARGET_ADD_CONTACT` wraps its call in try/catch). `ADD_EXPORT_LOG` does not: `copyFileSync(logPath, filePath)` is uncaught, so a permission error, a full disk, or a benign race (the log file is deleted between the initial `existsSync` check and the user finishing the native save dialog) rejects the `ipcMain.handle` promise. `GroupsPane.handleExportAddLog` awaits `addClient.exportAddLog()` with no try/catch, so the rejection becomes an unhandled promise rejection in the renderer.
**Fix:** Wrap the copy in try/catch and return a typed failure, and/or catch at the call site:
```ts
try {
  copyFileSync(logPath, filePath)
  return { ok: true as const }
} catch {
  return { ok: false as const, reason: 'canceled' as const }
}
```

### WR-03: `computeAddGroups` has no defensive `canAdd` re-filter

**File:** `src/renderer/wizard/addValidation.ts:29-47`
**Issue:** `computePlannedActions` (Remove path, `ReviewScreen.tsx:91`) re-filters checked dialogs with `.filter(d => d.canAct)` as a safety net against a stale/incorrect checked-set. `computeAddGroups` has no equivalent `d.canAdd` filter — it maps every dialog in `checkedIds` unconditionally. Combined with CR-01 (a non-addable "member" row can end up in `checkedDialogIds` while in Add mode), a dialog the target cannot actually be invited to can be included in the dispatched `startAdd(dialogIds)` call.
**Fix:**
```ts
return dialogs
  .filter((d) => checkedIds.has(d.id) && d.canAdd)
  .map((d) => { ... })
```

### WR-04: Shared "stop" aria-label says "removal" for Tag and Add runs

**File:** `src/renderer/groups/GroupsPane.tsx:347, 475` (cf. `640`)
**Issue:** The Tag and Add progress-slot "Stop" buttons both use `aria-label={tG('stopRemovalAria')}` ("Stop the removal run") — the same string used by the actual Removal stop button. A screen-reader user stopping an Add or Tag run hears an aria-label describing a different, removal-specific action.
**Fix:** Add `stopAddAria`/`stopTagAria` keys to the `add`/`tag` namespaces (mirroring the existing mode-specific visible labels `stopLabel`) and use those instead of the shared `groups:stopRemovalAria`.

### WR-05: Scan-progress fallback omits the `add.step === 'idle'` guard present in the Tag/Add pattern

**File:** `src/renderer/groups/GroupsPane.tsx:754`
**Issue:**
```ts
if (scan.step === 'scanning' && removal.step === 'idle' && tag.step === 'idle') { ... }
```
This branch was written before Add mode existed and was never extended with `&& add.step === 'idle'`, unlike every other removal/tag/add parallel block in this file. It's currently unreachable in a broken state only because the run-trigger button is gated on `scan.step === 'complete'` (so no run can be active while `scan.step === 'scanning'`), but it's an inconsistency that will silently become a real bug if that invariant ever changes.
**Fix:** `if (scan.step === 'scanning' && removal.step === 'idle' && tag.step === 'idle' && add.step === 'idle') { ... }`

## Info

### IN-01: Dead i18n key `includeInAddAria`

**File:** `src/renderer/i18n/locales/en/add.json:5`, `src/renderer/i18n/locales/cs/add.json:5`
**Issue:** Both locales define `includeInAddAria` ("… — include in adding" / "… — zahrnout do přidávání") but no code references it — `GroupRow.tsx` hard-codes `groups:includeInRemovalAria` everywhere (see CR-01). This key was clearly intended for the Add-mode checkbox's aria-label.
**Fix:** Wire it up as part of the CR-01 fix.

### IN-02: `exportLogMessage` timeout not cleared on unmount

**File:** `src/renderer/groups/GroupsPane.tsx:543-549`
**Issue:** `setTimeout(() => setExportLogMessage(null), 4000)` has no corresponding `clearTimeout` on unmount. Navigating away from the report stage within the 4-second window triggers a harmless "set state on an unmounted component" warning in development.
**Fix:** Track the timeout id in a ref and clear it in a cleanup effect, or guard the callback with a mounted-ref check.

---

_Reviewed: 2026-10-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
