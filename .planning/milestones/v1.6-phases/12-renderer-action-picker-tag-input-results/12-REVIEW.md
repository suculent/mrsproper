---
phase: 12-renderer-action-picker-tag-input-results
reviewed: 2026-06-20T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/shared/tagConstants.ts
  - src/renderer/wizard/tagValidation.ts
  - src/renderer/wizard/TagInput.tsx
  - src/renderer/wizard/ReviewScreen.tsx
  - src/renderer/store/tagStore.ts
  - src/renderer/removal/TagResumeJobDialog.tsx
  - src/renderer/groups/GroupRow.tsx
  - src/renderer/groups/GroupsPane.tsx
  - src/renderer/shell/AppShell.tsx
  - src/renderer/wizard/wizardStage.ts
  - src/renderer/i18n/index.ts
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-06-20
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 12 adds a 3-way action picker (Kick / Ban / Tag), TagInput with validation, tag review
confirmation, and live tag progress — mirroring the existing removal flow. The tag branch is
correctly isolated as a parallel path; removalStore, removal rendering, and the Kick/Ban paths
are untouched. The cachedSnapshot identity guard in tagStore is present and correct. The
startTag(tag, dialogIds) → tagClient.startTag(dialogIds, tag) argument-order flip is
correctly documented and implemented. tagStore has no retryGroup. i18n registration is correct;
both `en/tag.json` and `cs/tag.json` are statically imported and registered. TagInput
validation enforces TAG_MAX_LENGTH=16, control-char/newline rejection, and role=alert.
The radiogroup aria-label uses `actionGroupAria` from wizard namespace (present in both
locales). wizardStage.ts includes TAG_COMPLETE / TAG_STOPPED events.

One blocker was found: after an app restart with a pending tag job, the TagResumeJobDialog's
onResume callback never sets `action` to `'tag'`, so the tag auto-advance effect (which is
gated on `action === 'tag'`) never fires and the wizard is stuck on the `run` stage. Three
additional warnings cover a missing scan progress indicator in tag mode, the "Review" toolbar
button remaining active during a live tag run, and a variant inconsistency on the PEER_FLOOD
resume button.

---

## Critical Issues

### CR-01: Tag resume never advances wizard past "run" stage

**File:** `src/renderer/shell/AppShell.tsx:165`

**Issue:** When the app restarts with a pending incomplete tag job, `TagResumeJobDialog`
fires `onResume={() => setStage('run')}`. The tag auto-advance `useEffect` (lines 80–88) is
correctly gated on `action === 'tag'` to avoid cross-contamination with removal. However,
`action` is rehydrated from `severityClient.getSeverity()` which returns `'kick' | 'ban'`
only — `'tag'` is explicitly never persisted (AppShell line 52: `if (a === 'kick' || a === 'ban')`).
After restart, `action` is `'ban'` or `'kick'`. When `onResume` fires:

- `setStage('run')` → wizard enters run stage
- The tag auto-advance condition: `stage === 'run' && action === 'tag' && ...` — fails on
  `action !== 'tag'`
- The tag job completes in the background but the wizard never advances to `'report'`
- The user is stuck on the `run` stage with no progress feedback and no way to proceed

**Fix:**

```tsx
// AppShell.tsx line 165 — set action to 'tag' before advancing stage
{pendingTagJob && (
  <TagResumeJobDialog
    open={tagResumeOpen}
    onOpenChange={() => {}}
    job={pendingTagJob}
    onResume={() => {
      setAction('tag')   // ← add this
      setStage('run')
    }}
  />
)}
```

---

## Warnings

### WR-01: Scan progress bar is never shown when `activeAction === 'tag'`

**File:** `src/renderer/groups/GroupsPane.tsx:415-416`

**Issue:** `renderProgressSlot()` has a comment at line 415 reading `// Tag is idle — fall
through to scan progress slot (d)` followed immediately by `return null`. The scan progress
slot (`// d.`) at line 554 is only reachable when `activeAction !== 'tag'`, because the
entire tag block exits early. When `activeAction === 'tag'` and `scan.step === 'scanning'`
(the membership scan running before tag review), no progress bar is rendered. The user sees
no feedback that a scan is in progress.

**Fix:** In the tag-idle branch, fall through to the shared scan progress logic instead of
returning null:

```tsx
// GroupsPane.tsx — at the end of the tag block (after c-tag summary branch)
// Tag is idle — render scan progress if scan is active, same as removal branch
if (scan.step === 'scanning') {
  // (copy the existing scan progress JSX from slot 'd' or extract to a helper)
  return renderScanProgress()  // or inline the slot 'd' JSX here
}
return null
```

Alternatively, extract slot `d` into a shared helper and call it from both branches.

### WR-02: "Review removal" button remains visible during an active tag run

**File:** `src/renderer/groups/GroupsPane.tsx:638-659`

**Issue:** The run-trigger button (lines 638–659) is shown when
`removal.step === 'idle'` — but this condition is satisfied even while `tag.step === 'running'`
or `tag.step === 'stopping'`. When the user is in an active tag run (`activeAction === 'tag'`,
`tag.step === 'running'`), the "Review removal of N groups" button appears in the toolbar.
Clicking it navigates to `ReviewScreen` mid-run, and `handleConfirm` could dispatch a second
tag/removal job concurrently. The label "Review removal" is also misleading for the `tag`
action.

**Fix:** Gate the run-trigger button on tag inactivity as well:

```tsx
// Replace the outer condition
{mode === 'checklist' && scan.step === 'complete' && checkedCount > 0 &&
 !isRunActive &&  // ← use isRunActive which already accounts for tag
 (
   removal.step === 'idle' ? (
     <Button ...>{tW('runTriggerLabel', { count: checkedCount })}</Button>
   ) : null
 )
}
```

Additionally, the button label should reflect the current action:
```tsx
{activeAction === 'tag'
  ? tT('runTriggerLabelTag', { count: checkedCount })
  : tW('runTriggerLabel', { count: checkedCount })}
```

### WR-03: PEER_FLOOD resume button in tag branch is `variant="destructive"`

**File:** `src/renderer/groups/GroupsPane.tsx:355`

**Issue:** The "Resume tagging" button inside the hard-stopped PEER_FLOOD banner uses
`variant="destructive"`. The rest of the tag UI explicitly uses `variant="default"` for
the resume action (per UI-SPEC S-6 "tag is non-destructive"):
- `TagResumeJobDialog.tsx:83` — `variant="default"` with inline comment citing the spec
- `ReviewScreen.tsx:416` — `variant={action === 'tag' ? 'default' : 'destructive'}`

The PEER_FLOOD banner's outer `<Alert variant="destructive">` is appropriate (the banner
itself is an error state), but the action button within it should be `"default"`, consistent
with all other tag resume entry points.

**Fix:**

```tsx
// GroupsPane.tsx line 355 — change variant
<Button
  variant="default"     // ← was "destructive"
  size="sm"
  onClick={() => void tagActions.resumeJobFromDisk()}
>
  {tT('peerFloodResumeLabel')}
</Button>
```

---

## Info

### IN-01: `GroupRow.getAvatarColor` crashes on empty `dialog.id`

**File:** `src/renderer/groups/GroupRow.tsx:37`

**Issue:** `getAvatarColor(seed)` calls `BigInt(seed)` without guarding against an empty
string. `BigInt('')` throws a `SyntaxError` in V8. `ReviewScreen.tsx` added an explicit guard
for this at line 39 (`if (!seed) return AVATAR_COLORS[0]`), but `GroupRow.tsx` did not.
`dialog.id` should be non-empty per `AdminDialogDTO`, but the defensive pattern was applied
inconsistently.

**Fix:**
```ts
function getAvatarColor(seed: string): string {
  if (!seed) return AVATAR_COLORS[0]
  return AVATAR_COLORS[Number(BigInt(seed) % 7n)]
}
```

### IN-02: `getTagStatus` returns `'queued'` for groups not in the tag run

**File:** `src/renderer/groups/GroupsPane.tsx:221`

**Issue:** `getTagStatus(dialogId)` returns `'queued'` as its final fallthrough when
`tagActive === true` and no outcome exists for the group. `TagState` (unlike `TagJobFileSafe`)
carries no `dialogIds` field, so the function cannot distinguish between groups that were
submitted to the tag run versus groups that were never selected. Groups the user did not
check (and thus were never included in `tagActions.startTag(...)`) will display a
checked-and-disabled Checkbox during and after the tag run. This incorrectly implies they
are/were part of the tag job.

Note: `getRemovalStatus` has the same structural pattern (also pre-existing). The tag
version is new in Phase 12.

**Fix:** Either propagate `dialogIds` into `TagState` on the main-process side, or expose the
active job's `dialogIds` from `tagStore` (the store already fetches `TagJobFileSafe` which
has `dialogIds`). Then gate `getTagStatus`:
```ts
if (!tag.dialogIds?.includes(dialogId)) return null
return 'queued'
```

### IN-03: `tooLong` validation error is unreachable via normal keyboard input

**File:** `src/renderer/wizard/TagInput.tsx:49`, `src/renderer/wizard/tagValidation.ts:20`

**Issue:** `<Input maxLength={TAG_MAX_LENGTH}>` (TagInput.tsx line 49) enforces the 16-char
limit at the DOM level, so `value.length > TAG_MAX_LENGTH` in `validateTagInput` can only be
true if `value` is set programmatically (not via user typing or pasting — browsers clamp paste
to maxLength too). The `error === 'tooLong'` branch in `TagInput.tsx` and the corresponding
i18n key `tagErrorTooLong` are unreachable in normal usage. The validation is still correct
as defense-in-depth, but the displayed error will never be seen.

**Fix (optional):** If the `tooLong` path is kept as a safety net, document why. Alternatively,
remove `maxLength` from the `<Input>` so both over-length and control-char validation errors
are reachable, relying on `validateTagInput` as the sole enforcer.

### IN-04: Queued-tag Checkbox uses `includeInRemovalAria` label (misleading for tag runs)

**File:** `src/renderer/groups/GroupRow.tsx:208`

**Issue:** When `tagStatus === 'queued'`, `renderCheckboxSlot()` renders a disabled Checkbox
with `aria-label={tG('includeInRemovalAria', { title: dialog.title })}` (line 208). The
en/groups locale value for this key reads "Include [group] in removal" — correct for the
removal path but misleading during a tag run where the group is queued for tagging.
Screen-reader users will hear "Include X in removal" for groups awaiting tagging.

**Fix:** Add a parallel `includeInTagAria` key to `groups.json` and select it conditionally:
```tsx
// renderCheckboxSlot() — tagStatus queued branch
<Checkbox
  checked={true}
  disabled={true}
  aria-label={tG('includeInTagAria', { title: dialog.title })}
/>
```

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
