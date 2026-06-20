# Phase 12: Renderer — Action Picker, Tag Input & Results - Research

**Researched:** 2026-06-20
**Domain:** React/TypeScript renderer UI — extending the wizard flow with a third action (Tag), a new store, and parallel run/report routing
**Confidence:** HIGH — every finding is verified directly from the codebase; no external lookups required

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Action picker:** extend the existing Kick/Ban segmented control to a **3-way Kick / Ban / Tag** control (reuse the same segmented-control component + a11y pattern).
- **Tag input:** conditionally revealed below the picker when Tag is selected, with a live character counter.
- **Max-length limit:** 16 characters via a single shared constant (`TAG_MAX_LENGTH`). Provisional — UAT/manual-confirmation item.
- **Charset policy:** permissive — accept any non-empty trimmed string up to the cap; reject only control characters / newlines with an inline error.
- **Confirmation:** extend `ReviewScreen` so that when action=Tag it shows the tag string prominently, reuses the `TargetCard` identity block, and the exact selected-group list, with a single confirm button (non-destructive primary blue variant).
- **Live progress + results:** mirror the removal run/report stages, driven by a new `src/renderer/store/tagStore.ts` that subscribes to `onTagState`.
- **State isolation:** removal flow keeps using `removalStore` unchanged; switching the action picker away from Tag clears the tag input value.
- **i18n:** add a new `tag` i18n namespace mirroring `removal.json` for both `en` and `cs`.
- **Tag-job resume:** reuse the `ResumeJobDialog` pattern for an independent tag-job resume prompt.

### Claude's Discretion
- Exact component decomposition (new `TagInput` component vs inline in ReviewScreen), precise layout/spacing, and whether tag run/report reuse removal components directly or via a shared abstraction — follow the closest removal analog and the UI-SPEC.

### Deferred Ideas (OUT OF SCOPE)
- Reading back / displaying a member's current tag.
- Clearing/removing a tag (set empty) as a distinct action.
- Per-group different tags.
- A live probe to measure the true tag max length/charset.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAG-01 | User can choose a "Tag" action (alongside Kick/Ban) and enter one tag string that is applied identically to all selected groups. | ReviewScreen 3-way picker + TagInput block; tagStore.startTag dispatches to tagClient.startTag(dialogIds, tag); wizard routing confirmed. |
| TAG-06 | The run shows live progress and a per-group success/failure report afterward, reusing the removal flow's progress/results UI. | GroupsPane renderProgressSlot/renderSummaryBand pattern; GroupRow tagStatus prop; AppShell activeAction routing; auto-advance useEffect pattern confirmed. |
</phase_requirements>

---

## Summary

Phase 12 is a pure renderer extension. All main-process logic (TagExecutor, IPC channels, tagTypes, job file) is complete from Phases 9–11. This phase builds the UI layer that consumes those APIs: a 3-way action picker, a controlled tag input, parallel store/progress/results surfaces, i18n, and a resume dialog.

The codebase has a clear, consistent template for every piece of work in this phase. `removalStore` is the exact model for `tagStore`. `GroupsPane.renderProgressSlot()` is the exact model for tag progress and summary. `ResumeJobDialog` is the exact model for `TagResumeJobDialog`. `reviewScreen.test.ts` (pure-function tests, no jsdom) and `wizardStage.test.ts` define the test idioms to follow.

The key architectural decision confirmed from reading the code: AppShell holds explicit `stage` state (never derived from store step) and holds `severity` as a lifted prop passed to ReviewScreen. Phase 12 extends this by also lifting an `activeAction: 'kick' | 'ban' | 'tag'` state, replacing the existing `severity: 'kick' | 'ban'` OR widening it to the 3-way union. The two approaches are discussed in "Architecture Patterns" below.

**Primary recommendation:** Widen `severity`/`action` to a 3-way union `'kick' | 'ban' | 'tag'` lifted in AppShell. Treat the tag-specific tag string as ReviewScreen local state (reset on action change). Route all run/report rendering in GroupsPane by `activeAction` prop.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Action picker (3-way Kick/Ban/Tag) | Renderer (ReviewScreen) | AppShell (lifts state) | Purely presentational; AppShell owns `action` state so GroupsPane can route by it |
| Tag string input + validation | Renderer (TagInput component) | ReviewScreen (passes value) | Controlled by ReviewScreen local state; TagInput is a dumb presentational component |
| Tag dispatch (startTag IPC call) | Renderer (tagStore.actions.startTag) | tagClient (IPC bridge) | Store delegates to tagClient — same pattern as removalStore → removalClient |
| Tag state subscription | Renderer (tagStore via useSyncExternalStore) | — | Module-level singleton store; feeds GroupsPane and AppShell |
| Live tag progress UI | Renderer (GroupsPane.renderProgressSlot) | tagStore | Tag progress slot reads from tagStore when activeAction=tag |
| Tag results report UI | Renderer (GroupsPane + GroupRow with tagStatus prop) | tagStore.outcomes | GroupRow gets a `tagStatus` prop paralleling existing `removalStatus` prop |
| Tag summary band | Renderer (GroupsPane) | tagStore.summary | Summary band mirrors removal summary; no retry links (tag has no per-group retry) |
| Resume dialog for tag job | Renderer (TagResumeJobDialog) | AppShell (mounts) | Mirrors ResumeJobDialog exactly; AppShell polls tagStore.pendingJob on mount |
| i18n strings | Renderer (i18n/locales/en+cs/tag.json) | i18n/index.ts (registration) | Two static JSON files + 4-step registration in index.ts and i18next.d.ts |
| TAG_MAX_LENGTH constant | src/shared/tagConstants.ts | TagInput + validation fn | Shared so both UI guard and any future IPC guard read from one source |

---

## Standard Stack

No new packages. Every library used in Phase 12 is already installed.

### Core (all already installed)
| Library | Installed Via | Purpose in Phase 12 |
|---------|--------------|---------------------|
| React 18 | electron-vite template | All new components |
| react-i18next | existing | `useTranslation('tag')` in all new/modified components |
| lucide-react | existing | Check, Loader2, AlertCircle, Minus, Tag icons (Tag icon not yet used in codebase — verify it exists in lucide-react) |
| shadcn/ui (Radix) | existing | Button, Input, Dialog, ScrollArea, Alert, Badge, Checkbox — all already in `src/renderer/components/ui/` |

### No new installations required.

---

## Package Legitimacy Audit

No new packages are installed in this phase. Not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
AppShell (stage, activeAction, tagValue, pendingTagJob)
    │
    ├── ReviewScreen (action='kick'|'ban'|'tag', tagValue, onActionChange, onTagValueChange, onConfirm)
    │       ├── [3-way segmented control] → calls onActionChange
    │       ├── [TagInput block] (conditional on action==='tag') → calls onTagValueChange; clears on action change
    │       └── [Confirm button] → calls tagActions.startTag(tag, dialogIds) or removalActions.startRemoval(severity, dialogIds)
    │
    ├── GroupsPane (stage, activeAction)
    │       ├── renderProgressSlot()
    │       │       ├── if activeAction==='tag' AND tag.step==='running'|'stopping'  → TagProgressSlot (reads tagStore)
    │       │       ├── if activeAction==='tag' AND tag.step==='hard-stopped'       → PEER_FLOOD Alert (tag variant)
    │       │       ├── if activeAction==='tag' AND tag.step==='complete'|'stopped'  → TagSummaryBand
    │       │       └── if activeAction!=='tag' (removal steps)                      → [existing removal slots unchanged]
    │       └── GroupRow (tagStatus, tagErrorCode props when activeAction==='tag')
    │               └── renders tag status icon + subline in checkbox slot
    │
    ├── TagResumeJobDialog (open, job: TagJobFileSafe, onResume)
    │       └── calls tagActions.discardJob() or tagActions.startTag(tag, remainingDialogIds)
    │
    ╔══════════════╗    ╔══════════════════╗
    ║  tagStore.ts ║ ←→ ║  tagClient.ts    ║ ←→ window.mrsproper.* (contextBridge)
    ║  (renderer)  ║    ║  (renderer IPC)  ║
    ╚══════════════╝    ╚══════════════════╝
         │
    useTagStore() → { state: TagState, pendingJob: TagJobFileSafe | null }
    tagActions.startTag(tag, dialogIds)
    tagActions.abortTag()
    tagActions.discardJob()
    tagActions.resumeJobFromDisk()
```

### Recommended Project Structure (new files only)

```
src/
  shared/
    tagConstants.ts              NEW — export TAG_MAX_LENGTH = 16
  renderer/
    wizard/
      ReviewScreen.tsx           MODIFY — 3-way picker + TagInput block + tag confirmation
      TagInput.tsx               NEW — controlled input + counter + inline error
      wizardStage.ts             MODIFY — add TAG_COMPLETE / TAG_STOPPED events
    store/
      tagStore.ts                NEW — mirror of removalStore.ts
    removal/
      TagResumeJobDialog.tsx     NEW — mirror of ResumeJobDialog.tsx
    shell/
      AppShell.tsx               MODIFY — activeAction state, tag pendingJob, TagResumeJobDialog
    groups/
      GroupsPane.tsx             MODIFY — tag progress/results/summary routing
      GroupRow.tsx               MODIFY — tagStatus prop + tag status icon/subline
    i18n/
      index.ts                   MODIFY — import + register en/cs tag namespaces
      i18next.d.ts               MODIFY — add 'tag' to CustomTypeOptions.resources
      locales/en/tag.json        NEW
      locales/cs/tag.json        NEW
      locales/en/wizard.json     MODIFY — add actionGroupAria, tagSomeoneElse, tagGroupListAria
      locales/cs/wizard.json     MODIFY — Czech equivalents
```

### Pattern 1: tagStore — mirror of removalStore.ts

The `removalStore.ts` is the exact pattern to follow. Key structural elements:

```typescript
// src/renderer/store/tagStore.ts
import { useSyncExternalStore } from 'react'
import type { TagState, TagJobFileSafe } from '@shared/tagTypes'
import { tagClient } from '../ipc/tagClient'

type Listener = () => void

let currentState: TagState = {
  step: 'idle',
  tag: '',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}
let pendingJob: TagJobFileSafe | null = null

const listeners = new Set<Listener>()

// ... (ref-counted subscribe/stopSubscriptions identical to removalStore)
// Bootstrap: tagClient.getTagState() + tagClient.getTagJob()
// CRITICAL: use tagClient.onTagState (not onRemovalState)

export function useTagStore(): { state: TagState; pendingJob: TagJobFileSafe | null } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export const tagActions = {
  async startTag(tag: string, dialogIds: string[]): Promise<void> { ... },
  async abortTag(): Promise<void> { ... },
  async discardJob(): Promise<void> { ... },
  async resumeJobFromDisk(): Promise<void> { ... },
  // NOTE: NO retryGroup — tag has no per-group retry (tagClient has no retryTagGroup)
}
```

**Critical difference from removalStore:** `removalStore.startRemoval(severity, dialogIds)` — `tagStore.startTag(tag, dialogIds)`. The parameter order in `tagClient.startTag(dialogIds, tag)` is `dialogIds` first, `tag` second (verified from tagClient.ts line 24). The `tagActions.startTag(tag, dialogIds)` action signature can be swapped for API ergonomics — the action wraps the client call `tagClient.startTag(dialogIds, tag)` internally.

**Snapshot stability:** The `cachedSnapshot` pattern in removalStore (lines 87–97) must be replicated exactly. The `Object.is` comparison guard prevents "Maximum update depth exceeded" React errors.

**pendingJob filter:** Bootstrap checks `job !== null && job.status !== 'complete'` (removalStore line 58–60). Apply identical filter for `TagJobFileSafe` — but `TagJobFileSafe` omits `targetAccessHash`; all other fields including `status` are present (verified: `TagJobFileSafe = Omit<TagJobFile, 'targetAccessHash'>`).

### Pattern 2: ReviewScreen extension — 3-way picker

The existing `ReviewScreen` takes `severity: 'kick' | 'ban'` as a prop from AppShell. There are two valid approaches:

**Option A (narrower scope):** Keep severity prop for Kick/Ban, add `action: 'kick' | 'ban' | 'tag'` prop separately. When action is 'tag', severity is irrelevant.

**Option B (replace severity with action):** Widen `severity: 'kick' | 'ban'` → `action: 'kick' | 'ban' | 'tag'` throughout. Rename `onSeverityChange` → `onActionChange`. For removal dispatch, derive `severity: 'kick' | 'ban'` from `action` (guaranteed non-'tag' at that point).

**Recommendation: Option B.** It is cleaner — one prop, one state, one handler. The existing `severity` variable in AppShell and ReviewScreen is localized to a handful of sites. Renaming eliminates the conceptual split between "action" (3-way) and "severity" (2-way). The planner should note: `handleSeverityChange` in AppShell also calls `severityClient.setSeverity(s)` for persistence. If action is widened to 3-way, either widen `severityClient` or only persist when action is Kick/Ban. Given the CONTEXT.md does not mention persisting the Tag action, persisting only Kick/Ban is correct.

**Tag string local state — location:** `tagValue: string` and `tagError: string | null` should be local state in ReviewScreen (not AppShell, not tagStore). `tagError` is pure derivation from `tagValue` — no need to store it, only compute on render. When action switches away from 'tag', a `useEffect` with `[action]` dependency resets `tagValue` to `''`.

**Tag confirmation — same screen:** Per CONTEXT.md "Confirmation: extend `ReviewScreen` so that when action=Tag it shows the tag string prominently." There is no separate "confirmation step" — ReviewScreen IS the confirmation screen, conditional on action. The current `handleConfirm` in ReviewScreen calls `removalActions.startRemoval(severity, ...)` then `onConfirm()`. For tag: call `tagActions.startTag(tagValue, actionableDialogIds)` then `onConfirm()`.

**computePlannedActions — scope for tag:** For action=tag, the group list shown in ReviewScreen's confirmation needs actionable groups. Basic groups are skipped by TagExecutor (TAG_UNSUPPORTED_BASIC_GROUP), but they can still be shown in the list with a mechanic note "will be skipped". The UI-SPEC (S-3, §mechanicNote.basicGroup) confirms this pattern. Phase 12 may either: (a) define `computeTagGroups()` as a separate pure function (exportable for testing) that applies its own filtering/annotation logic, or (b) reuse `computePlannedActions` and add tag-specific mechanic notes. Option (a) is cleaner because tag has different mechanics (no `deleteChatUser`/`editBanned`, just skip/tag).

**Segmented control exact structure (verified from ReviewScreen.tsx lines 217–248):**
```tsx
<div role="radiogroup" aria-label={t('wizard:actionGroupAria')}
     className="flex rounded-md border border-border overflow-hidden">
  <Button role="radio" aria-checked={action === 'kick'} variant={...} size="sm"
          className="rounded-none flex-1" onClick={() => onActionChange('kick')}>
    {t('wizard:severityKick')}
  </Button>
  <Button role="radio" aria-checked={action === 'ban'} variant={...} size="sm"
          className="rounded-none flex-1 border-l border-border" onClick={() => onActionChange('ban')}>
    {t('wizard:severityBan')}
  </Button>
  {/* NEW */}
  <Button role="radio" aria-checked={action === 'tag'} variant={...} size="sm"
          className="rounded-none flex-1 border-l border-border" onClick={() => onActionChange('tag')}>
    {t('tag:actionTag')}
  </Button>
</div>
```

Note: the wizard namespace currently has `severityKick` and `severityBan` keys. The 3-way picker can reuse these for Kick/Ban labels, or use `tag:actionKick` / `tag:actionBan` as defined in the UI-SPEC copywriting contract. Using the existing `wizard:severityKick`/`wizard:severityBan` is preferred to avoid duplication.

### Pattern 3: AppShell — activeAction routing and TagResumeJobDialog

AppShell currently holds:
- `stage: WizardStage` — explicit, never derived
- `severity: 'kick' | 'ban'` — lifted, persisted via severityClient

Phase 12 changes:
1. Widen `severity` state to `action: 'kick' | 'ban' | 'tag'` (Option B above).
2. Add `const { state: tag, pendingJob: pendingTagJob } = useTagStore()`.
3. Add `const [tagResumeOpen, setTagResumeOpen] = useState(!!pendingTagJob)`.
4. Add a second `useEffect` for auto-advance on tag terminal states:
   ```typescript
   useEffect(() => {
     if (
       stage === 'run' &&
       action === 'tag' &&
       (tag.step === 'complete' || tag.step === 'stopped' || tag.step === 'hard-stopped')
     ) {
       setStage('report')
     }
   }, [tag.step, stage, action])
   ```
5. Mount `<TagResumeJobDialog>` alongside the existing `<ResumeJobDialog>`.
6. Pass `activeAction={action}` (or similar) to `GroupsPane` so it can route rendering.

**Existing auto-advance useEffect (lines 57–64 of AppShell.tsx):** Keep this unchanged — it handles the removal auto-advance. Add a parallel `useEffect` for tag. This avoids any risk of the two effects interfering.

**Stage wiring for the confirm button:** When action=tag, `onConfirm` is called after `tagActions.startTag()` succeeds. The `setStage('run')` call is in AppShell's `onConfirm` handler — same as removal. Both paths advance to 'run' on confirm; the difference is which store dispatches the job.

**GroupsPane needs `activeAction` prop:** Currently GroupsPane signature is:
```typescript
interface GroupsPaneProps {
  onNavigateToReview: () => void
  onNavigateToTarget: () => void
  stage: WizardStage
}
```
Add: `activeAction: 'kick' | 'ban' | 'tag'`. GroupsPane will also need to `useTagStore()` to read `tagState` for the tag progress/summary slots.

**isRunActive guard:** Currently: `const isRunActive = removal.step === 'running' || removal.step === 'stopping'`. Phase 12 must extend to also guard during tag runs: `const isRunActive = removal.step === 'running' || removal.step === 'stopping' || (activeAction === 'tag' && (tag.step === 'running' || tag.step === 'stopping'))`.

### Pattern 4: GroupsPane — tag progress slot, results, summary

The `renderProgressSlot()` function in GroupsPane (lines 263–422) handles all four slots:
- a. Removal progress (running/stopping)
- b. PEER_FLOOD banner (hard-stopped)
- c. Summary band (complete/stopped)
- d. Scan progress (scanning, no removal)

Phase 12 adds tag equivalents for slots a, b, c as parallel branches gated on `activeAction === 'tag'`. The insertion order inside `renderProgressSlot()`:

```
if activeAction === 'tag':
  if tag.step === 'running' || 'stopping' → tag progress slot (mirrors removal slot a)
  if tag.step === 'hard-stopped'           → tag PEER_FLOOD alert (mirrors removal slot b)
  if tag.step === 'complete' || 'stopped'  → tag summary band (mirrors removal slot c; no retryGroup links)
else (activeAction === 'kick' | 'ban'):
  [existing removal slot a, b, c unchanged]
[slot d: scan progress — unchanged, always at end]
```

**No-retry difference:** Removal summary shows `tR('summaryFailed', { count })` with "You can retry them in the list." Tag summary omits this because there is no `retryTagGroup`. The failed-row subline in tag results also omits the retry button (GroupRow tag branch: no `onRetryRemoval` wiring).

**Tag summary band "Tag someone else" button:** Uses `tW('tagSomeoneElse')` (new wizard key) and calls `targetActions.resetTarget(); props.onNavigateToTarget()` — same as the existing "Remove someone else" button.

### Pattern 5: GroupRow — tagStatus prop

Current `GroupRowProps` interface (line 66 of GroupRow.tsx):
```typescript
removalStatus?: 'queued' | 'removing' | 'done' | 'already-gone' | 'failed' | 'skipped' | null
removalNote?: 'basic-group-ban-fallback' | null
onRetryRemoval?: (dialogId: string) => void
errorCode?: RmvErrorCode | null
severity?: 'kick' | 'ban'
```

Phase 12 adds:
```typescript
tagStatus?: 'queued' | 'tagging' | 'done' | 'skipped' | 'failed' | null
tagErrorCode?: TagErrorCode | null
// Note: no tagNote, no onRetryTag — tag has no per-group retry, no 'already-gone'
```

The `renderCheckboxSlot()` and `renderRemovalSubline()` functions already branch on `removalStatus != null`. Phase 12 adds parallel `renderTagSubline()` (or branches tag inside the existing functions). The cleanest approach (minimum change, lowest risk to Kick/Ban): add tag slot rendering after the removal slot rendering, gated on `tagStatus != null`.

Tag checkbox slot icons (from UI-SPEC S-5):
- `'tagging'` → `<Loader2 className="animate-spin text-muted-foreground" />`
- `'done'` → `<Check className="text-success" />`
- `'skipped'` → `<Minus className="text-muted-foreground" />`
- `'failed'` → `<AlertCircle className="text-destructive" />`
- `'queued'` → `<Checkbox checked disabled />` (same as removal queued)

### Pattern 6: wizardStage.ts — add TAG_COMPLETE / TAG_STOPPED events

Current `WizardEvent` type (line 9–19 of wizardStage.ts):
```typescript
export type WizardEvent =
  | 'TARGET_CONFIRMED' | 'NAVIGATE_TO_REVIEW' | 'CHANGE_TARGET'
  | 'CONFIRM' | 'BACK' | 'REMOVAL_COMPLETE' | 'REMOVAL_STOPPED' | 'RESET'
```

Add: `| 'TAG_COMPLETE' | 'TAG_STOPPED'`

In `getNextStage`, the `'run'` case currently:
```typescript
case 'run':
  if (event === 'REMOVAL_COMPLETE') return 'report'
  if (event === 'REMOVAL_STOPPED') return 'report'
  return stage
```

Extend:
```typescript
case 'run':
  if (event === 'REMOVAL_COMPLETE' || event === 'TAG_COMPLETE') return 'report'
  if (event === 'REMOVAL_STOPPED' || event === 'TAG_STOPPED') return 'report'
  return stage
```

Note: AppShell calls `setStage(getNextStage(stage, event))` pattern conceptually, but the current implementation uses a `useEffect` + `setStage('report')` directly (not calling `getNextStage` imperatively). The `wizardStage.ts` pure function is documentation of valid transitions — AppShell's explicit `setStage` calls remain authoritative (confirmed from AppShell.tsx comment and from CONTEXT.md "Stage is explicit in AppShell, never fully derived from store (RESEARCH Pitfall 2)").

### Pattern 7: i18n namespace registration — exact 4-step process

The i18n system uses **static imports only** (no HTTP fetch, offline-first). Adding a new namespace requires exactly four edits:

**Step 1 — Create JSON files:** `src/renderer/i18n/locales/en/tag.json` and `cs/tag.json` (full key tables from UI-SPEC copywriting contract).

**Step 2 — Static imports in `src/renderer/i18n/index.ts`:**
```typescript
import enTag from './locales/en/tag.json'
import csTag from './locales/cs/tag.json'
```

**Step 3 — Add to `resources` object in `index.ts`:**
```typescript
export const resources = {
  en: { /* existing */ tag: enTag },
  cs: { /* existing */ tag: csTag },
} as const
```

**Step 4 — Add to `i18next.d.ts` CustomTypeOptions:**
The `resources` field type is already derived from `(typeof resources)['en']`. Adding `tag: enTag` to `resources.en` automatically includes it in the type — no explicit change to `i18next.d.ts` is needed. However, verify that `i18n.test.ts` `NAMESPACES` constant on line 16 must be extended: add `'tag'` to `['auth', 'target', 'groups', 'wizard', 'removal', 'shell']`.

**wizard namespace additions** (edit existing `en/wizard.json` and `cs/wizard.json`):
Three new keys: `actionGroupAria`, `tagSomeoneElse`, `tagGroupListAria`.

### Pattern 8: TAG_MAX_LENGTH shared constant

Create `src/shared/tagConstants.ts`:
```typescript
/** Maximum character length for a member tag (rank/custom-title field).
 * PROVISIONAL — the Telegram maximum was not live-measured in Phase 0 spike.
 * Change this constant and rebuild to retune; all validation and UI counters read from here. */
export const TAG_MAX_LENGTH = 16
```

The constant belongs in `src/shared/` (not `src/renderer/`) because it could also be used by main-process validation. Currently tagClient.ts does not guard length, but the shared location is correct for the future.

The charset validation function — `(value: string): boolean => value === value.replace(/[\x00-\x1F\x7F\r\n]+/g, '')` — can live either inline in `TagInput.tsx` or in a `src/renderer/wizard/tagValidation.ts` utility. Extracting it to a utility file makes it independently testable with pure Vitest (no jsdom needed, same as `computePlannedActions`).

### Anti-Patterns to Avoid

- **Deriving stage from store state:** AppShell.tsx comment and CONTEXT.md both emphasize that `stage` is explicit state, never derived. The tag auto-advance must use a `useEffect` that calls `setStage('report')` imperatively, not a derived value.
- **Putting tag string in tagStore or AppShell state:** `tagValue` is local to ReviewScreen. It does not need to survive stage transitions (it is entered on the review screen, consumed on the same screen). AppShell does not need to see the tag string — it passes down `onConfirm` and ReviewScreen calls `tagActions.startTag(tagValue, ids)` inside `handleConfirm` before calling `onConfirm()`.
- **Reusing removalStatus for tag:** GroupRow must use a separate `tagStatus` prop to prevent accidental cross-contamination. A single `removalStatus` prop widened to include tag states would make it impossible to show both states simultaneously (unlikely but wrong semantically).
- **omitting snapshot stability guard in tagStore:** The `cachedSnapshot`/`Object.is` guard in removalStore is not optional. Omitting it causes "Maximum update depth exceeded" render loops.
- **Passing `targetAccessHash` to renderer:** tagClient returns `TagJobFileSafe` (Omit<TagJobFile, 'targetAccessHash'>) — this is enforced by the type system. TagResumeJobDialog takes `TagJobFileSafe`, not `TagJobFile`. Do not bypass this.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FLOOD_WAIT countdown | Custom timer | `FloodCountdown` (already in `src/renderer/auth/FloodCountdown.tsx`) | Accepts `remaining` seconds, renders mm:ss in monospace, handles `aria-live` |
| Segmented control radio pattern | Custom radio input | `<Button role="radio" aria-checked>` in a `role="radiogroup" div` | Already established pattern in ReviewScreen lines 217–248; reuse exactly |
| Store subscription lifecycle | Custom EventEmitter | `useSyncExternalStore` with ref-counted subscribe/stopSubscriptions | Same pattern as removalStore, searchStore, groupsStore |
| Dialog primitive | Custom modal | shadcn `Dialog` / `DialogContent` / `DialogHeader` / `DialogFooter` / `DialogTitle` / `DialogDescription` | Already used in ResumeJobDialog; consistent dismiss semantics |
| i18n plural rules | Custom plural selector | i18next built-in (`_one`/`_few`/`_other` suffix convention) | Czech requires 3 forms; i18next handles this with `count` interpolation |
| Character counter | Custom input wrapper | Inline `{value.length} / {TAG_MAX_LENGTH}` text + `maxLength={TAG_MAX_LENGTH}` on `<Input>` | Simpler than a wrapper component; browser enforces maxLength, counter is display-only |

---

## Common Pitfalls

### Pitfall 1: tagStore pendingJob initial state out of sync with TagResumeJobDialog open state

**What goes wrong:** `useState(!!pendingTagJob)` in AppShell captures the initial `pendingTagJob` value (null, because tagStore hasn't bootstrapped yet). The dialog never opens.

**Why it happens:** tagStore bootstraps asynchronously (calls `tagClient.getTagJob()` in `startSubscriptions`). At first render, `pendingTagJob` is null. By the time the IPC call resolves, `pendingJob` is set and `notify()` fires, but `useState(!!pendingTagJob)` only runs on mount.

**How to avoid:** Derive `resumeOpen` from the store reactively. In AppShell:
```typescript
const { state: tag, pendingJob: pendingTagJob } = useTagStore()
// Derive open state from store — re-derives on every pendingTagJob change:
const tagResumeOpen = pendingTagJob !== null
// No separate useState needed; control Dialog open prop directly from store value
```
Close the dialog by calling `tagActions.discardJob()` or `tagActions.startTag(...)` — both set `pendingJob = null` and `notify()`, which drives `tagResumeOpen` to `false`. This matches how the existing `ResumeJobDialog` is wired (AppShell line 55: `const [resumeOpen, setResumeOpen] = useState(!!pendingJob)` — this IS the same issue; the current removal dialog has the same potential bug. Mitigate by deriving, not initializing from state).

**Warning signs:** TagResumeJobDialog never opens on app launch even when a `tag-job.json` exists.

### Pitfall 2: Snapshot referential equality — tagStore cachedSnapshot

**What goes wrong:** `getSnapshot()` returns a new object on every call → `useSyncExternalStore` sees it as a different snapshot every render → infinite re-render loop ("Maximum update depth exceeded").

**Why it happens:** `useSyncExternalStore` uses `Object.is` to compare snapshots. A plain `return { state: currentState, pendingJob }` creates a new object reference every time.

**How to avoid:** Mirror removalStore lines 87–97 exactly:
```typescript
let cachedSnapshot = { state: currentState, pendingJob }
function getSnapshot() {
  if (cachedSnapshot.state !== currentState || cachedSnapshot.pendingJob !== pendingJob) {
    cachedSnapshot = { state: currentState, pendingJob }
  }
  return cachedSnapshot
}
```

**Warning signs:** Component renders loop; React DevTools shows infinite re-renders on the hook.

### Pitfall 3: Auto-advance useEffect fires for the wrong action

**What goes wrong:** The tag auto-advance useEffect fires when `stage === 'run'` and `tag.step` is terminal — even if the active action is removal (not tag). This would advance to 'report' after a removal run if tag.step happens to be 'complete' from a previous session.

**Why it happens:** tagStore is a module-level singleton. If a previous tag run completed, `tag.step` is 'complete' on mount. If a removal run then reaches 'run' stage, the tag useEffect fires immediately.

**How to avoid:** Gate the tag auto-advance on `action === 'tag'`:
```typescript
useEffect(() => {
  if (stage === 'run' && action === 'tag' &&
    (tag.step === 'complete' || tag.step === 'stopped' || tag.step === 'hard-stopped')) {
    setStage('report')
  }
}, [tag.step, stage, action])
```

**Warning signs:** App auto-advances to report stage when starting a removal run.

### Pitfall 4: Group list shown in ReviewScreen for tag confirmation includes basic groups

**What goes wrong:** The tag confirmation group list shows basic groups without a "will be skipped" mechanic note, leading the user to believe they will be tagged. Basic groups result in `TAG_UNSUPPORTED_BASIC_GROUP` skip outcomes.

**Why it happens:** Naively mapping all `checkedDialogIds` to dialogs without applying tag-specific filtering/annotation.

**How to avoid:** Define `computeTagGroups(dialogs, checkedIds, t)` that maps groups to `{ dialog, mechanicNote, willBeSkipped }` where basic groups get `mechanicNote = t('tag:mechanicNote.basicGroup')` and are included in the list with a visual distinction. The "actionable count" (for the confirm button label and totals line) counts only supergroups/channels.

**Warning signs:** User confirms tagging 5 groups but TagExecutor only processes 3 (2 were basic groups).

### Pitfall 5: i18n 'tag' namespace not registered — silent key passthrough

**What goes wrong:** `t('tag:rowStatus.done')` renders the literal string `"tag:rowStatus.done"` in the UI.

**Why it happens:** The i18n system uses static imports. If `enTag` is not added to `resources.en.tag`, the namespace is not bundled. `useTranslation('tag')` falls back to key passthrough.

**How to avoid:** The 4-step registration process in Pattern 7 is complete only when all four steps are done. Add `'tag'` to the `NAMESPACES` constant in `i18n.test.ts` — this test will fail if registration is incomplete, providing immediate feedback.

**Warning signs:** All tag namespace strings show as raw key paths in the rendered UI; `i18n.hasResourceBundle('en', 'tag')` returns false.

### Pitfall 6: tagActions.startTag parameter order mismatch with tagClient.startTag

**What goes wrong:** TypeScript doesn't catch `tagClient.startTag(tag, dialogIds)` vs `tagClient.startTag(dialogIds, tag)` if both are `string` types.

**Why it happens:** `tagClient.startTag(dialogIds: string[], tag: string)` — `dialogIds` is first, `tag` is second (verified from tagClient.ts line 24). A store action named `tagActions.startTag(tag, dialogIds)` that wraps it could accidentally pass them in the wrong order.

**How to avoid:** The store action should call `tagClient.startTag(dialogIds, tag)` internally:
```typescript
async startTag(tag: string, dialogIds: string[]): Promise<void> {
  const s = await tagClient.startTag(dialogIds, tag)  // note order flip
  setState(s)
  pendingJob = null
  notify()
}
```
TypeScript will catch this IF the type of `dialogIds` is `string[]` (not `string`) and `tag` is `string` — the array/string distinction provides type-level safety here.

---

## Code Examples

Verified patterns from the codebase:

### tagStore.ts — subscribe/unsubscribe skeleton (mirrors removalStore.ts exactly)
```typescript
// Source: src/renderer/store/removalStore.ts (verified lines 35–83)
let tagStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++
  tagStateSub = tagClient.onTagState((s: TagState) => { setState(s) })
  tagClient.getTagState().then((s: TagState) => {
    if (currentState.step === 'idle') setState(s)
  }).catch(console.error)
  tagClient.getTagJob().then((job: TagJobFileSafe | null) => {
    if (job !== null && job.status !== 'complete') {
      pendingJob = job
      notify()
    }
  }).catch(console.error)
}

function stopSubscriptions(): void {
  if (refCount <= 0) return
  refCount--
  if (refCount > 0) return
  tagStateSub?.()
  tagStateSub = null
}
```

### TagResumeJobDialog.tsx — differences from ResumeJobDialog (source: verified)
```typescript
// Source: src/renderer/removal/ResumeJobDialog.tsx (verified lines 1–93)
// Differences from the removal analog:
// 1. job type: TagJobFileSafe (not RemovalJobFile)
//    — TagJobFileSafe has no .severity field; startTag uses tag from job.tag
// 2. handleResume calls: tagActions.startTag(job.tag, remainingDialogIds) not startRemoval(severity, ...)
// 3. Resume button: variant="default" not variant="destructive"
// 4. Namespace: 'tag' not 'removal'
// 5. Dialog: aria IDs should be 'tag-resume-dialog-title', 'tag-resume-dialog-desc'

const remainingDialogIds = job.dialogIds.filter(
  (id) => !job.outcomes.find((o) => o.dialogId === id)
)
const handleResume = useCallback(() => {
  void tagActions.startTag(job.tag, remainingDialogIds)
  onOpenChange(false)
  onResume?.()
}, [job.tag, remainingDialogIds, onOpenChange, onResume])
```

### GroupsPane — tag getTagStatus helper (mirrors getRemovalStatus)
```typescript
// Source: src/renderer/groups/GroupsPane.tsx lines 172–198 (verified)
function getTagStatus(
  dialogId: string
): 'queued' | 'tagging' | 'done' | 'skipped' | 'failed' | null {
  const tagActive =
    tag.step === 'running' || tag.step === 'stopping' ||
    tag.step === 'complete' || tag.step === 'stopped' || tag.step === 'hard-stopped'
  if (!tagActive) return null
  const outcome = tag.outcomes.find((o) => o.dialogId === dialogId)
  if (outcome) return outcome.status === 'done' ? 'done' : outcome.status // 'skipped'|'failed'
  if (tag.step === 'running' && dialogId === tag.currentGroupId) return 'tagging'
  return 'queued'
}
```

### ReviewScreen — tag confirm handler
```typescript
// Source: src/renderer/wizard/ReviewScreen.tsx lines 167–175 (verified pattern)
const handleConfirm = useCallback(async () => {
  setIsDispatching(true)
  try {
    if (action === 'tag') {
      await tagActions.startTag(tagValue.trim(), actionableTagDialogIds.map(d => d.id))
    } else {
      await removalActions.startRemoval(action, plannedActions.map(p => p.dialog.id))
    }
    onConfirm()
  } finally {
    setIsDispatching(false)
  }
}, [action, tagValue, actionableTagDialogIds, plannedActions, onConfirm])
```

---

## State of the Art

| Old Pattern | Current Pattern | Impact |
|-------------|-----------------|--------|
| `severity: 'kick' \| 'ban'` prop in ReviewScreen | Widen to `action: 'kick' \| 'ban' \| 'tag'` | ReviewScreen is the action-picker authority; AppShell lifts and persists |
| GroupsPane hardwired to removalStore | GroupsPane reads both removalStore and tagStore; routes by `activeAction` | Both runs coexist in stores; UI routes by which action is active |
| Single `ResumeJobDialog` for removal | Independent `TagResumeJobDialog` alongside | Two jobs can theoretically coexist on disk (one removal, one tag); dialogs are independent |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `TAG_MAX_LENGTH = 16` is the correct Telegram limit | Standard Stack / tagConstants.ts | UI rejects valid tags or allows server-rejected tags; CONTEXT.md explicitly marks this as provisional |
| A2 | `lucide-react` (already installed) includes the `Tag` icon | Standard Stack | Compilation error if icon name differs; verify `import { Tag } from 'lucide-react'` compiles |
| A3 | `severityClient.setSeverity()` should only be called for kick/ban actions, not tag | AppShell extension | No data loss, but if widened accidentally it could persist 'tag' as a severity in electron-store |

---

## Open Questions

1. **`severityClient` persistence — should it be widened to 3-way?**
   - What we know: `severityClient.getSeverity()` / `setSeverity()` persists the 2-way kick/ban selection via electron-store. Phase 12 plans do not mention persisting the Tag selection.
   - What's unclear: Should the action picker remember "Tag" across app restarts?
   - Recommendation: Do NOT persist Tag. Call `setSeverity()` only when `action === 'kick' || action === 'ban'`. On mount, `getSeverity()` returns 'kick' or 'ban'; if the user last selected Tag, it defaults to the persisted kick/ban on next launch. This is the safest default.

2. **`isRunActive` guard for refresh button — extend to tag?**
   - What we know: GroupsPane's refresh button is disabled during `removal.step === 'running' | 'stopping'`.
   - What's unclear: Should it also be disabled during a tag run?
   - Recommendation: Yes. Disable refresh during any active run (removal OR tag). Extend the `isRunActive` check.

3. **`computeTagGroups` — include or exclude basic groups from the confirmed list?**
   - What we know: TagExecutor skips basic groups with `TAG_UNSUPPORTED_BASIC_GROUP`. UI-SPEC S-3 shows `mechanicNote.basicGroup = "Basic group — will be skipped"` in the group list.
   - What's unclear: Should basic groups be shown in the confirmation list with the skip note, or hidden?
   - Recommendation: Show them with the skip mechanic note (UI-SPEC is explicit). Exclude them from `actionableCount`. This matches the removal pattern where non-actionable groups are displayed greyed with a reason.

---

## Environment Availability

Step 2.6: SKIPPED. This phase installs no external dependencies and makes no external service calls. All libraries are already installed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (no version pinned — `vitest run` via `npm test`) |
| Config file | `vitest.config.ts` (root) — `environment: 'node'`, includes `src/**/*.test.ts` |
| Quick run command | `npx vitest run src/renderer/wizard/ src/renderer/store/ src/renderer/i18n/` |
| Full suite command | `npm test` |

**Important constraint:** The Vitest config uses `environment: 'node'` — no jsdom, no DOM rendering. All renderer tests in this project are **pure-function tests** (no RTL, no component rendering). The existing `reviewScreen.test.ts` tests `computePlannedActions` (a pure exported function). The existing `wizardStage.test.ts` tests `getNextStage` (a pure exported function). Phase 12 tests follow the same pattern: **extract pure logic, test it in isolation**.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | New File? |
|--------|----------|-----------|-------------------|-----------|
| TAG-01 | Tag input validation: valid, too-long, control chars | unit (pure fn) | `npx vitest run src/renderer/wizard/tagValidation.test.ts` | Yes — Wave 0 |
| TAG-01 | computeTagGroups: correct actionable count, mechanic notes, basic-group handling | unit (pure fn) | `npx vitest run src/renderer/wizard/tagValidation.test.ts` | Yes — Wave 0 |
| TAG-01 | Switching action resets tag value (logic) | unit (pure fn) — test the reset logic if extracted | manual/RTL | — |
| TAG-01 | wizardStage TAG_COMPLETE / TAG_STOPPED transitions | unit (pure fn) | `npx vitest run src/renderer/wizard/wizardStage.test.ts` | No — extend existing |
| TAG-06 | tagStore: subscribe/bootstrap/setState/notify cycle | unit (mock tagClient) | `npx vitest run src/renderer/store/tagStore.test.ts` | Yes — Wave 0 |
| TAG-06 | tagStore: startTag clears pendingJob on success | unit (mock tagClient) | `npx vitest run src/renderer/store/tagStore.test.ts` | Yes — Wave 0 |
| TAG-06 | tagStore: discardJob clears pendingJob | unit (mock tagClient) | `npx vitest run src/renderer/store/tagStore.test.ts` | Yes — Wave 0 |
| TAG-01, TAG-06 | i18n 'tag' namespace registered (en + cs), keys non-empty, Czech plurals | unit (real i18n) | `npx vitest run src/renderer/i18n/i18n.test.ts` | No — extend existing |

### Wave 0 Gaps (test files to create before implementation)

- [ ] `src/renderer/wizard/tagValidation.test.ts` — covers:
  - `validateTagInput(value)` returns `null` for valid, `'tooLong'` for > 16 chars, `'controlChars'` for control chars
  - `computeTagGroups(dialogs, checkedIds, t)` covers: basic groups get mechanic note + excluded from actionable count; supergroups included; empty checkedIds; canAct=false dialogs excluded

- [ ] `src/renderer/store/tagStore.test.ts` — covers:
  - Module-level singleton `currentState` initializes with `step: 'idle'`
  - `tagActions.startTag` calls `tagClient.startTag(dialogIds, tag)` (not reversed)
  - `pendingJob` is cleared on successful `startTag`
  - `pendingJob` is cleared on `discardJob`
  - snapshot referential stability (same object reference when state unchanged)

- [ ] Extend `src/renderer/wizard/wizardStage.test.ts` — add:
  - `TAG_COMPLETE` from `run` → `'report'`
  - `TAG_STOPPED` from `run` → `'report'`
  - `TAG_COMPLETE` from `target` (invalid) → `'target'` (unchanged)

- [ ] Extend `src/renderer/i18n/i18n.test.ts` — add `'tag'` to `NAMESPACES` array on line 16:
  ```typescript
  const NAMESPACES = ['auth', 'target', 'groups', 'wizard', 'removal', 'shell', 'tag'] as const
  ```
  This test will go RED until i18n registration (Pattern 7) is complete, giving immediate feedback.

### Sampling Rate
- **Per task commit:** `npx vitest run src/renderer/wizard/ src/renderer/store/ src/renderer/i18n/`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (partial) | `TAG_MAX_LENGTH` cap + control-char rejection; server-side rejects fall through to `UNKNOWN` outcome |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tag string with control chars reaching the IPC | Tampering | Renderer-side validation (control-char regex) + maxLength HTML attribute; main process TagExecutor is the authoritative guard |
| targetAccessHash crossing IPC boundary | Information Disclosure | `TagJobFileSafe = Omit<TagJobFile, 'targetAccessHash'>` enforced at type level; TagResumeJobDialog receives `TagJobFileSafe` not `TagJobFile` |
| Stale tag displayed in confirm after action switch | UI state confusion | tagValue reset on action change (useEffect with [action] dep clears to '') |

---

## Sources

### Primary (HIGH confidence — verified directly from codebase)
- `src/renderer/store/removalStore.ts` — singleton store pattern, subscribe/unsubscribe, cachedSnapshot, pendingJob bootstrap, action dispatchers
- `src/renderer/ipc/tagClient.ts` — exact IPC signatures: `startTag(dialogIds, tag)`, `abortTag()`, `getTagState()`, `onTagState(cb)`, `getTagJob()`, `discardTagJob()`
- `src/renderer/wizard/ReviewScreen.tsx` — segmented control structure, `computePlannedActions` pure export, `handleConfirm` pattern, prop contract
- `src/renderer/shell/AppShell.tsx` — stage machine, severity state, useEffect auto-advance, ResumeJobDialog mount
- `src/renderer/wizard/wizardStage.ts` — WizardEvent union, getNextStage lookup table
- `src/renderer/removal/ResumeJobDialog.tsx` — dialog structure, discard/resume handlers, Dialog onOpenChange no-op
- `src/renderer/groups/GroupsPane.tsx` — renderProgressSlot() slots a/b/c/d, getRemovalStatus(), summary band, isRunActive guard
- `src/renderer/groups/GroupRow.tsx` — removalStatus prop, renderCheckboxSlot(), renderRemovalSubline(), prop interface
- `src/renderer/i18n/index.ts` — static import + resources object + initI18n
- `src/renderer/i18n/i18next.d.ts` — CustomTypeOptions derivation pattern
- `src/renderer/i18n/locales/en/removal.json` + `cs/removal.json` — exact structural template for tag.json
- `src/renderer/i18n/locales/en/wizard.json` + `cs/wizard.json` — keys to augment
- `src/shared/tagTypes.ts` — TagState, TagGroupOutcome, TagErrorCode, TagJobFileSafe shapes
- `src/renderer/wizard/reviewScreen.test.ts` — pure-function test pattern (no jsdom)
- `src/renderer/wizard/wizardStage.test.ts` — pure-function test pattern
- `src/renderer/i18n/i18n.test.ts` — NAMESPACES constant, extension pattern
- `vitest.config.ts` — `environment: 'node'`, no jsdom

### Secondary (MEDIUM confidence — spec document, verified against code)
- `docs/superpowers/specs/2026-06-20-member-tag-action-design.md` §8 — renderer/UX architecture (consistent with codebase findings)
- `.planning/phases/12-renderer-action-picker-tag-input-results/12-UI-SPEC.md` — UI design contract (consistent with codebase design patterns)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all libraries verified in existing codebase
- Architecture: HIGH — all patterns extracted directly from production code, not assumed
- Pitfalls: HIGH — pitfalls 2, 3, 5, 6 are directly observable from the codebase; pitfall 1 is known from React useSyncExternalStore semantics
- i18n registration: HIGH — 4-step process verified from index.ts + i18next.d.ts + i18n.test.ts

**Research date:** 2026-06-20
**Valid until:** Phase 12 is a single-milestone deliverable; these findings are stable until the codebase changes.

---

## RESEARCH COMPLETE
