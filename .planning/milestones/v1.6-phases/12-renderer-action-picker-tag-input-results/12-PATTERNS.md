# Phase 12: Renderer — Action Picker, Tag Input & Results - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 16 new/modified files
**Analogs found:** 16 / 16

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/shared/tagConstants.ts` | config | — | `src/shared/tagTypes.ts` (export convention) | role-match |
| `src/renderer/store/tagStore.ts` | store | event-driven | `src/renderer/store/removalStore.ts` | exact |
| `src/renderer/store/tagStore.test.ts` | test | — | `src/renderer/wizard/reviewScreen.test.ts` | exact (pure-fn mock pattern) |
| `src/renderer/wizard/TagInput.tsx` | component | request-response | `src/renderer/target/TargetInput.tsx` + `Input` ui primitive | role-match |
| `src/renderer/wizard/tagValidation.ts` | utility | transform | `src/renderer/auth/errorCopy.test.ts` (pure fn export) | role-match |
| `src/renderer/wizard/tagValidation.test.ts` | test | — | `src/renderer/wizard/reviewScreen.test.ts` | exact |
| `src/renderer/removal/TagResumeJobDialog.tsx` | component | request-response | `src/renderer/removal/ResumeJobDialog.tsx` | exact |
| `src/renderer/i18n/locales/en/tag.json` | config | — | `src/renderer/i18n/locales/en/removal.json` | exact |
| `src/renderer/i18n/locales/cs/tag.json` | config | — | `src/renderer/i18n/locales/cs/removal.json` | exact |
| `src/renderer/wizard/ReviewScreen.tsx` | component | request-response | self (extend) | exact |
| `src/renderer/wizard/wizardStage.ts` | utility | transform | self (extend) | exact |
| `src/renderer/shell/AppShell.tsx` | component | event-driven | self (extend) | exact |
| `src/renderer/groups/GroupsPane.tsx` | component | event-driven | self (extend) | exact |
| `src/renderer/groups/GroupRow.tsx` | component | request-response | self (extend) | exact |
| `src/renderer/i18n/index.ts` | config | — | self (extend) | exact |
| `src/renderer/i18n/i18n.test.ts` | test | — | self (extend) | exact |

---

## Pattern Assignments

### `src/shared/tagConstants.ts` (config)

**Analog:** `src/shared/tagTypes.ts` (export convention — pure-export shared module)

**Core pattern** — entire file:
```typescript
// src/shared/tagTypes.ts lines 1–3 (module comment convention)
// Pure type module — no runtime logic. Imported by both main and renderer processes.

/** Maximum character length for a member tag (rank/custom-title field).
 * PROVISIONAL — the Telegram maximum was not live-measured.
 * Change this constant and rebuild to retune; all validation and UI counters read from here. */
export const TAG_MAX_LENGTH = 16
```

---

### `src/renderer/store/tagStore.ts` (store, event-driven)

**Analog:** `src/renderer/store/removalStore.ts`

**Full file read:** `/Users/igraczech/Repositories/MrProper/src/renderer/store/removalStore.ts` (lines 1–167)

**Imports pattern** (lines 1–9):
```typescript
import { useSyncExternalStore } from 'react'
import type { RemovalState, RemovalJobFile } from '@shared/removalTypes'
import { removalClient } from '../ipc/removalClient'
```
Tag equivalent:
```typescript
import { useSyncExternalStore } from 'react'
import type { TagState, TagJobFileSafe } from '@shared/tagTypes'
import { tagClient } from '../ipc/tagClient'
```

**Module-level state pattern** (lines 12–22):
```typescript
let currentState: RemovalState = {
  step: 'idle',
  severity: 'ban',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}
let pendingJob: RemovalJobFile | null = null

const listeners = new Set<Listener>()
```
Tag equivalent — omit `severity`, add `tag: ''`:
```typescript
let currentState: TagState = {
  step: 'idle',
  tag: '',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}
let pendingJob: TagJobFileSafe | null = null
```

**notify/setState helpers** (lines 24–31):
```typescript
function notify(): void {
  for (const l of listeners) l()
}

function setState(next: RemovalState): void {
  currentState = next
  notify()
}
```

**Ref-counted subscribe/stopSubscriptions pattern** (lines 35–71):
```typescript
let removalStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  removalStateSub = removalClient.onRemovalState((s: RemovalState) => {
    setState(s)
  })

  removalClient.getRemovalState().then((s: RemovalState) => {
    if (currentState.step === 'idle') {
      setState(s)
    }
  }).catch(console.error)

  removalClient.getRemovalJob().then((job: RemovalJobFile | null) => {
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
  removalStateSub?.()
  removalStateSub = null
}

function subscribe(listener: Listener): () => void {
  if (listeners.size === 0) startSubscriptions()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopSubscriptions()
  }
}
```
Tag substitutions: `removalStateSub` → `tagStateSub`; `removalClient.onRemovalState` → `tagClient.onTagState`; `removalClient.getRemovalState()` → `tagClient.getTagState()`; `removalClient.getRemovalJob()` → `tagClient.getTagJob()`; `RemovalJobFile` → `TagJobFileSafe`.

**cachedSnapshot stability guard — CRITICAL** (lines 87–101):
```typescript
let cachedSnapshot: { state: RemovalState; pendingJob: RemovalJobFile | null } = {
  state: currentState,
  pendingJob,
}

function getSnapshot(): { state: RemovalState; pendingJob: RemovalJobFile | null } {
  if (cachedSnapshot.state !== currentState || cachedSnapshot.pendingJob !== pendingJob) {
    cachedSnapshot = { state: currentState, pendingJob }
  }
  return cachedSnapshot
}

function getServerSnapshot(): { state: RemovalState; pendingJob: RemovalJobFile | null } {
  return getSnapshot()
}

export function useRemovalStore(): { state: RemovalState; pendingJob: RemovalJobFile | null } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
```
This guard is MANDATORY. Omitting it causes "Maximum update depth exceeded" in React.

**Actions pattern** (lines 109–167):
```typescript
export const removalActions = {
  async startRemoval(severity: 'kick' | 'ban', dialogIds: string[]): Promise<void> {
    try {
      const s = await removalClient.startRemoval(severity, dialogIds)
      setState(s)
      pendingJob = null   // CR-05: clear on successful dispatch
      notify()
    } catch (err) {
      console.error('[removalStore] startRemoval:', err)
    }
  },
  async abortRemoval(): Promise<void> { ... },
  async retryGroup(dialogId: string): Promise<void> { ... },  // OMIT for tagStore — no retryTagGroup
  async discardJob(): Promise<void> {
    try {
      await removalClient.discardRemovalJob()
      pendingJob = null
      notify()
    } catch (err) {
      console.error('[removalStore] discardJob:', err)
    }
  },
  async resumeJobFromDisk(): Promise<void> {
    try {
      const freshJob = await removalClient.getRemovalJob()
      if (!freshJob || freshJob.status === 'complete') return
      const remaining = freshJob.dialogIds.filter(
        (id) => !freshJob.outcomes.find((o) => o.dialogId === id)
      )
      if (remaining.length === 0) return
      await removalActions.startRemoval(freshJob.severity, remaining)
    } catch (err) {
      console.error('[removalStore] resumeJobFromDisk:', err)
    }
  },
}
```
Tag differences:
- `startTag(tag: string, dialogIds: string[])` calls `tagClient.startTag(dialogIds, tag)` — **note argument order flip**: `tagClient.startTag` takes `(dialogIds, tag)` (verified from `tagClient.ts` line 24).
- `abortTag()` calls `tagClient.abortTag()`.
- `discardJob()` calls `tagClient.discardTagJob()`.
- `resumeJobFromDisk()` calls `tagActions.startTag(freshJob.tag, remaining)` (not `startRemoval`).
- No `retryGroup` — `tagClient` has no `retryTagGroup`.

---

### `src/renderer/store/tagStore.test.ts` (test)

**Analog:** `src/renderer/wizard/reviewScreen.test.ts` (pure-function test, no jsdom, mock pattern)

**Test structure pattern** (reviewScreen.test.ts lines 1–13):
```typescript
import { describe, it, expect } from 'vitest'
import { computePlannedActions } from './ReviewScreen'
import type { AdminDialogDTO } from '@shared/groupTypes'

// Mock factory helpers
function makeDialog(overrides: Partial<AdminDialogDTO>): AdminDialogDTO {
  return { id: '100', title: 'Test Group', avatar: null, memberCount: 10,
           type: 'supergroup', canAct: true, greyReason: null, ...overrides }
}
```
For tagStore test: mock `tagClient` module with `vi.mock('../ipc/tagClient', ...)`, then import `tagActions` and `useTagStore` to assert side-effects on module-level state.

**Key behaviors to cover** (from RESEARCH.md §Wave 0 gaps):
1. `currentState` initializes with `step: 'idle'`
2. `tagActions.startTag(tag, dialogIds)` calls `tagClient.startTag(dialogIds, tag)` (flipped order)
3. `pendingJob` cleared on successful `startTag`
4. `pendingJob` cleared on `discardJob`
5. Snapshot referential stability: same object reference when state unchanged

---

### `src/renderer/wizard/TagInput.tsx` (component, request-response)

**Analog:** `src/renderer/target/TargetInput.tsx` (controlled input) + shadcn `Input` primitive

**Imports pattern** (from GroupRow.tsx lines 1–19 for shadcn/lucide imports):
```typescript
import React, { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import { TAG_MAX_LENGTH } from '@shared/tagConstants'
```

**Props interface:**
```typescript
interface TagInputProps {
  value: string
  onChange: (value: string) => void
  error: string | null   // null = valid; 'tooLong' | 'controlChars' = invalid
  disabled?: boolean
  inputRef?: React.RefObject<HTMLInputElement>
}
```

**Core pattern** — controlled input with counter + inline error (UI-SPEC S-2):
```tsx
<div className="flex flex-col gap-2">
  <span className="text-label font-semibold">{t('tag:tagInputLabel')}</span>
  <Input
    ref={inputRef}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    maxLength={TAG_MAX_LENGTH}
    placeholder={t('tag:tagInputPlaceholder')}
    disabled={disabled}
    className={error ? 'border-destructive ring-destructive' : ''}
    aria-invalid={error != null}
  />
  <div className="flex items-baseline justify-between">
    {/* Left: inline validation error */}
    {error && (
      <p role="alert" className="text-label text-destructive">
        {t(error === 'tooLong' ? 'tag:tagErrorTooLong' : 'tag:tagErrorControlChars',
           { max: TAG_MAX_LENGTH })}
      </p>
    )}
    {!error && <span />}
    {/* Right: character counter */}
    <span className="text-label text-muted-foreground" aria-live="polite">
      {value.length} / {TAG_MAX_LENGTH}
    </span>
  </div>
</div>
```

---

### `src/renderer/wizard/tagValidation.ts` + `tagValidation.test.ts` (utility + test)

**Analog:** `src/renderer/auth/errorCopy.test.ts` (pure-function test pattern)

**Core validation functions:**
```typescript
import { TAG_MAX_LENGTH } from '@shared/tagConstants'
import type { AdminDialogDTO } from '@shared/groupTypes'

export type TagInputError = 'tooLong' | 'controlChars' | null

export function validateTagInput(value: string): TagInputError {
  if (value.length > TAG_MAX_LENGTH) return 'tooLong'
  if (value !== value.replace(/[\x00-\x1F\x7F\r\n]+/g, '')) return 'controlChars'
  return null
}

export type TagGroupAction = {
  dialog: AdminDialogDTO
  mechanicNote: string
  willBeSkipped: boolean
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string

export function computeTagGroups(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  t: TranslateFn = (key) => key
): TagGroupAction[] { ... }
```

**Test pattern** (mirrors reviewScreen.test.ts exactly — no jsdom):
```typescript
import { describe, it, expect } from 'vitest'
import { validateTagInput, computeTagGroups } from './tagValidation'
```

---

### `src/renderer/removal/TagResumeJobDialog.tsx` (component, request-response)

**Analog:** `src/renderer/removal/ResumeJobDialog.tsx` — **read in full at lines 1–93**

**Imports pattern** (lines 1–19):
```typescript
import React, { useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { useTranslation } from 'react-i18next'
import type { RemovalJobFile } from '@shared/removalTypes'
import { removalActions } from '@renderer/store/removalStore'
```
Tag equivalent — swap types and actions:
```typescript
import type { TagJobFileSafe } from '@shared/tagTypes'
import { tagActions } from '@renderer/store/tagStore'
```

**Props interface** (lines 20–25):
```typescript
interface ResumeJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: RemovalJobFile
  onResume?: () => void
}
```
Tag: `job: TagJobFileSafe` (note: `TagJobFileSafe` has no `.severity` field; use `job.tag`).

**Core dialog pattern** (lines 56–92):
```tsx
// CR-04: onOpenChange wired to no-op — Escape/backdrop must NOT silently discard the job.
<Dialog open={open} onOpenChange={() => {}}>
  <DialogContent
    className="sm:max-w-[400px]"
    aria-labelledby="resume-dialog-title"
    aria-describedby="resume-dialog-desc"
  >
    <DialogHeader>
      <DialogTitle id="resume-dialog-title" className="text-heading">
        {t('resumeTitle', { name: job.targetName })}
      </DialogTitle>
      <DialogDescription id="resume-dialog-desc" className="text-body">
        {t('resumeBody', { x: processedCount, n: totalCount })}
      </DialogDescription>
    </DialogHeader>
    <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
      <Button variant="outline" onClick={handleDiscard} autoFocus>
        {t('resumeNeutral')}
      </Button>
      <Button variant="destructive" onClick={handleResume} aria-label={t('resumeDestructiveAria')}>
        {t('resumeDestructive')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```
Tag differences:
- `aria-labelledby="tag-resume-dialog-title"`, `aria-describedby="tag-resume-dialog-desc"` (distinct IDs)
- Resume button: `variant="default"` NOT `variant="destructive"` (tag is non-destructive per UI-SPEC S-6)
- Namespace: `useTranslation('tag')` not `useTranslation('removal')`
- `handleResume` calls `tagActions.startTag(job.tag, remainingDialogIds)` not `startRemoval(job.severity, ...)`

**handleResume pattern** (lines 47–51):
```typescript
const handleResume = useCallback(() => {
  void removalActions.startRemoval(job.severity, remainingDialogIds)
  onOpenChange(false)
  onResume?.()
}, [job.severity, remainingDialogIds, onOpenChange, onResume])
```
Tag equivalent:
```typescript
const handleResume = useCallback(() => {
  void tagActions.startTag(job.tag, remainingDialogIds)
  onOpenChange(false)
  onResume?.()
}, [job.tag, remainingDialogIds, onOpenChange, onResume])
```

---

### `src/renderer/wizard/ReviewScreen.tsx` MODIFY (component, request-response)

**Analog:** self — current file at `/Users/igraczech/Repositories/MrProper/src/renderer/wizard/ReviewScreen.tsx`

**Props interface to widen** (lines 104–109):
```typescript
interface ReviewScreenProps {
  severity: 'kick' | 'ban'           // REPLACE with:
  // action: 'kick' | 'ban' | 'tag'
  onSeverityChange(s: 'kick' | 'ban'): void  // REPLACE with:
  // onActionChange(a: 'kick' | 'ban' | 'tag'): void
  onConfirm(): void
  onBack(): void
}
```

**Existing segmented control structure to extend** (lines 214–248):
```tsx
<div className="flex flex-col gap-2">
  <span className="text-label font-semibold">{t('severityLabel')}</span>
  <div
    role="radiogroup"
    aria-label={t('severityGroupAria')}          // CHANGE to: t('wizard:actionGroupAria')
    className="flex rounded-md border border-border overflow-hidden"
  >
    <Button
      role="radio"
      aria-checked={severity === 'kick'}         // CHANGE: action === 'kick'
      variant={severity === 'kick' ? 'default' : 'ghost'}
      size="sm"
      className="rounded-none flex-1"
      onClick={() => onSeverityChange('kick')}   // CHANGE: onActionChange('kick')
    >
      {t('severityKick')}
    </Button>
    <Button
      role="radio"
      aria-checked={severity === 'ban'}
      variant={severity === 'ban' ? 'default' : 'ghost'}
      size="sm"
      className="rounded-none flex-1 border-l border-border"
      onClick={() => onSeverityChange('ban')}
    >
      {t('severityBan')}
    </Button>
    {/* ADD third button: */}
    <Button
      role="radio"
      aria-checked={action === 'tag'}
      variant={action === 'tag' ? 'default' : 'ghost'}
      size="sm"
      className="rounded-none flex-1 border-l border-border"
      onClick={() => onActionChange('tag')}
    >
      {t('tag:actionTag')}
    </Button>
  </div>
  {/* conditional TagInput block when action === 'tag' */}
  {action === 'tag' && (
    <TagInput value={tagValue} onChange={setTagValue} error={tagError} disabled={isDispatching}
              inputRef={tagInputRef} />
  )}
  {/* consequence line (existing p tag) */}
  <p className="text-body text-muted-foreground min-h-[2.5rem]">
    {action !== 'tag'
      ? tR(`severityLine${action === 'ban' ? 'Ban' : 'Kick'}`, { count: actionableCount })
      : t('tag:tagConsequenceLine', { tag: tagValue, count: actionableTagCount })}
  </p>
</div>
```

**Local state additions:**
```typescript
const [tagValue, setTagValue] = useState('')
const tagError = validateTagInput(tagValue)  // derived, not stored
const tagInputRef = useRef<HTMLInputElement>(null)

// Reset tag value when switching away from Tag
useEffect(() => {
  if (action !== 'tag') setTagValue('')
}, [action])

// Focus tag input when Tag is selected
useEffect(() => {
  if (action === 'tag') tagInputRef.current?.focus()
}, [action])
```

**handleConfirm modification** (lines 167–175):
```typescript
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

**Confirm button — variant change for Tag** (lines 305–319):
```tsx
<Button
  variant={action === 'tag' ? 'default' : 'destructive'}   // tag = primary, not destructive
  onClick={handleConfirm}
  disabled={isDispatching || actionableCount === 0 ||
            (action === 'tag' && (tagValue.trim() === '' || tagError !== null))}
>
```

**Tag string display block in confirmation** (new, per UI-SPEC S-3):
```tsx
{action === 'tag' && tagValue && (
  <div className="flex flex-col gap-1">
    <span className="text-label font-semibold">{t('tag:tagLabel')}</span>
    <span className="bg-secondary rounded-full px-2 py-0.5 text-mono text-label text-foreground w-fit">
      {tagValue}
    </span>
  </div>
)}
```

---

### `src/renderer/wizard/wizardStage.ts` MODIFY (utility, transform)

**Analog:** self — current file at `/Users/igraczech/Repositories/MrProper/src/renderer/wizard/wizardStage.ts`

**WizardEvent union** (lines 10–19) — add two events:
```typescript
export type WizardEvent =
  | 'TARGET_CONFIRMED' | 'NAVIGATE_TO_REVIEW' | 'CHANGE_TARGET'
  | 'CONFIRM' | 'BACK' | 'REMOVAL_COMPLETE' | 'REMOVAL_STOPPED' | 'RESET'
  // ADD:
  | 'TAG_COMPLETE' | 'TAG_STOPPED'
```

**getNextStage 'run' case** (lines 43–46) — extend:
```typescript
case 'run':
  if (event === 'REMOVAL_COMPLETE') return 'report'
  if (event === 'REMOVAL_STOPPED') return 'report'
  // ADD:
  if (event === 'TAG_COMPLETE') return 'report'
  if (event === 'TAG_STOPPED') return 'report'
  return stage
```

**Note:** AppShell uses `setStage('report')` directly in `useEffect`, not by calling `getNextStage`. The wizardStage.ts pure function is documentation of valid transitions; add events there for completeness and to unblock the test extension.

---

### `src/renderer/shell/AppShell.tsx` MODIFY (component, event-driven)

**Analog:** self — current file at `/Users/igraczech/Repositories/MrProper/src/renderer/shell/AppShell.tsx`

**Imports to add** (after line 19):
```typescript
import { useTagStore, tagActions } from '../store/tagStore'
import { TagResumeJobDialog } from '../removal/TagResumeJobDialog'
```

**Severity state widening** (lines 39–47):
```typescript
// CURRENT:
const [severity, setSeverity] = useState<'kick' | 'ban'>('ban')
// CHANGE to:
const [action, setAction] = useState<'kick' | 'ban' | 'tag'>('ban')

// Rehydrate kick/ban from electron-store on mount (unchanged):
useEffect(() => {
  severityClient.getSeverity().then(s => setAction(s)).catch(() => {})
}, [])

// CURRENT:
const handleSeverityChange = useCallback((s: 'kick' | 'ban') => {
  setSeverity(s)
  void severityClient.setSeverity(s)
}, [])
// CHANGE to (only persist kick/ban, not tag):
const handleActionChange = useCallback((a: 'kick' | 'ban' | 'tag') => {
  setAction(a)
  if (a === 'kick' || a === 'ban') void severityClient.setSeverity(a)
}, [])
```

**useTagStore hook + tag auto-advance** (after line 54):
```typescript
const { state: removal, pendingJob } = useRemovalStore()
// ADD:
const { state: tag, pendingJob: pendingTagJob } = useTagStore()

// Existing removal auto-advance (lines 57–64) — UNCHANGED:
useEffect(() => {
  if (
    stage === 'run' &&
    (removal.step === 'complete' || removal.step === 'stopped' || removal.step === 'hard-stopped')
  ) {
    setStage('report')
  }
}, [removal.step, stage])

// ADD tag auto-advance — gated on action === 'tag' to avoid cross-contamination (RESEARCH Pitfall 3):
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

**ResumeJobDialog wiring** (lines 55 and 120–128):
```typescript
// CURRENT (line 55) — has the initial-state bug; mitigate by deriving from store reactively:
const [resumeOpen, setResumeOpen] = useState(!!pendingJob)
// ADD for tag (derive reactively to avoid Pitfall 1):
const tagResumeOpen = pendingTagJob !== null
```

**GroupsPane call** (line 110–114) — add `activeAction` prop:
```tsx
<GroupsPane
  onNavigateToReview={() => setStage('review')}
  onNavigateToTarget={() => setStage('target')}
  stage={stage}
  activeAction={action}   // ADD
/>
```

**ReviewScreen call** (lines 85–90) — swap severity for action:
```tsx
<ReviewScreen
  action={action}                    // was: severity={severity}
  onActionChange={handleActionChange}  // was: onSeverityChange={handleSeverityChange}
  onConfirm={() => setStage('run')}
  onBack={() => setStage('groups')}
/>
```

**Tag ResumeJobDialog mount** (after line 128):
```tsx
{/* Tag ResumeJobDialog — independent from removal dialog */}
{pendingTagJob && (
  <TagResumeJobDialog
    open={tagResumeOpen}
    onOpenChange={() => {}}   // no-op — same CR-04 pattern as ResumeJobDialog
    job={pendingTagJob}
    onResume={() => setStage('run')}
  />
)}
```

---

### `src/renderer/groups/GroupsPane.tsx` MODIFY (component, event-driven)

**Analog:** self — current file at `/Users/igraczech/Repositories/MrProper/src/renderer/groups/GroupsPane.tsx`

**Props interface addition** (lines 35–39):
```typescript
interface GroupsPaneProps {
  onNavigateToReview: () => void
  onNavigateToTarget: () => void
  stage: WizardStage
  activeAction: 'kick' | 'ban' | 'tag'   // ADD
}
```

**useTagStore import and hook** (after line 22):
```typescript
import { useTagStore, tagActions } from '../store/tagStore'
// In component:
const { state: tag } = useTagStore()
```

**isRunActive extension** (lines 169–170):
```typescript
// CURRENT:
const isRunActive = removal.step === 'running' || removal.step === 'stopping'
// CHANGE to:
const isRunActive =
  removal.step === 'running' || removal.step === 'stopping' ||
  (activeAction === 'tag' && (tag.step === 'running' || tag.step === 'stopping'))
```

**getTagStatus helper** (new, mirrors getRemovalStatus at lines 173–198):
```typescript
function getTagStatus(
  dialogId: string
): 'queued' | 'tagging' | 'done' | 'skipped' | 'failed' | null {
  const tagActive =
    tag.step === 'running' || tag.step === 'stopping' ||
    tag.step === 'complete' || tag.step === 'stopped' || tag.step === 'hard-stopped'
  if (!tagActive) return null
  const outcome = tag.outcomes.find((o) => o.dialogId === dialogId)
  if (outcome) return outcome.status as 'done' | 'skipped' | 'failed'
  if (tag.step === 'running' && dialogId === tag.currentGroupId) return 'tagging'
  return 'queued'
}
```

**renderProgressSlot additions** (lines 263–422) — insert tag branches before existing removal branches:
```typescript
function renderProgressSlot(): React.JSX.Element | null {
  if (mode !== 'checklist') return null

  // TAG BRANCHES (new — gated on activeAction === 'tag')
  if (activeAction === 'tag') {
    // a-tag. Tag progress (running or stopping) — mirrors removal slot a (lines 268–311)
    if (tag.step === 'running' || tag.step === 'stopping') {
      const processed = tag.progress.processed
      const total = tag.progress.total
      const pct = total > 0 ? Math.round((processed / total) * 100) : 0
      const isStopping = tag.step === 'stopping'
      return (
        <div className="px-4 py-2 shrink-0" role="status" aria-live="polite">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label text-muted-foreground">
              {tT('progressLabel', { name: targetName, x: processed + 1, n: total })}
            </span>
            <Button variant="ghost" size="sm" ... onClick={() => void tagActions.abortTag()}
                    disabled={isStopping}>
              {isStopping ? <>{...} {tT('stoppingLabel')}</> : tT('stopLabel')}
            </Button>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-[width] duration-200"
                 style={{ width: `${pct}%` }} />
          </div>
          {tag.floodWaitRemaining != null && tag.floodWaitRemaining > 0 && (
            <span className="text-label text-muted-foreground flex items-baseline gap-1">
              {tT('floodWaitSubline')}
              <FloodCountdown remaining={tag.floodWaitRemaining} />
            </span>
          )}
        </div>
      )
    }

    // b-tag. PEER_FLOOD banner — mirrors removal slot b (lines 315–345)
    if (tag.step === 'hard-stopped') {
      return (
        <div className="px-4 py-2 shrink-0">
          <Alert variant="destructive" className="bg-destructive/10 border-destructive/30"
                 role="alert" aria-live="assertive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="text-body">
              {tT('peerFloodBanner')}
              <div className="mt-2">
                <Button variant="destructive" size="sm"
                        onClick={() => void tagActions.resumeJobFromDisk()}>
                  {tT('peerFloodResumeLabel')}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )
    }

    // c-tag. Summary band (complete or stopped) — mirrors removal slot c (lines 348–397)
    // NOTE: no retry links (tag has no retryGroup); "Tag someone else" replaces "Remove someone else"
    if (tag.step === 'complete' || tag.step === 'stopped') {
      const summary = tag.summary
      const summaryParts: Array<{ label: string; count: number }> = []
      if (summary) {
        if (summary.tagged > 0)  summaryParts.push({ count: summary.tagged,  label: tT('summaryPart.tagged') })
        if (summary.skipped > 0) summaryParts.push({ count: summary.skipped, label: tT('summaryPart.skipped') })
        if (summary.failed > 0)  summaryParts.push({ count: summary.failed,  label: tT('summaryPart.failed') })
      }
      return (
        <div className="px-4 py-2 shrink-0 border-t border-border flex items-center justify-between gap-2 flex-wrap" role="status">
          <div className="flex flex-col gap-1">
            {tag.step === 'stopped' && (
              <span className="text-label text-muted-foreground">
                {tT('summaryStopped', { x: tag.progress.processed, n: tag.progress.total })}
              </span>
            )}
            {summaryParts.length > 0 && (
              <span className="text-label">
                {summaryParts.map((part, i) => (
                  <React.Fragment key={part.label}>
                    {i > 0 && <span className="text-muted-foreground"> · </span>}
                    <span className="font-semibold text-foreground">{part.count}</span>
                    {' '}
                    <span className="text-muted-foreground">{part.label}</span>
                  </React.Fragment>
                ))}
              </span>
            )}
            {summary && summary.completedAt && (
              <span className="text-label text-muted-foreground">
                {tT('finishedAt', { time: formatTime(summary.completedAt) })}
              </span>
            )}
            {/* NOTE: no summaryFailed retry copy — tag has no per-group retry */}
          </div>
          <Button variant="outline" size="sm"
                  onClick={async () => { await targetActions.resetTarget(); props.onNavigateToTarget() }}>
            {tW('tagSomeoneElse')}   {/* new wizard key */}
          </Button>
        </div>
      )
    }

    return null   // tag is idle — fall through to slot d
  }

  // EXISTING REMOVAL BRANCHES (unchanged) — slots a, b, c
  if (removal.step === 'running' || removal.step === 'stopping') { ... }
  if (removal.step === 'hard-stopped') { ... }
  if (removal.step === 'complete' || removal.step === 'stopped') { ... }

  // d. Scan progress (unchanged — always at end)
  if (scan.step === 'scanning' && removal.step === 'idle') { ... }

  return null
}
```
Note: `tT` = `useTranslation('tag')` — add `const { t: tT } = useTranslation('tag')` alongside existing translation hooks at lines 62–64.

**GroupRow call in scroll list** (lines 522–539) — add tag props:
```tsx
<GroupRow
  ...
  removalStatus={activeAction !== 'tag' ? rowRemovalStatus : null}
  removalNote={activeAction !== 'tag' ? (outcome?.note ?? null) : null}
  errorCode={activeAction !== 'tag' ? (outcome?.errorCode ?? null) : null}
  severity={removal.severity ?? 'ban'}
  onRetryRemoval={(id) => void removalActions.retryGroup(id)}
  // ADD:
  tagStatus={activeAction === 'tag' ? getTagStatus(dialog.id) : null}
  tagErrorCode={activeAction === 'tag' ? (tagOutcome?.errorCode ?? null) : null}
/>
```
Where `const tagOutcome = tag.outcomes.find((o) => o.dialogId === dialog.id)`.

---

### `src/renderer/groups/GroupRow.tsx` MODIFY (component, request-response)

**Analog:** self — current file at `/Users/igraczech/Repositories/MrProper/src/renderer/groups/GroupRow.tsx`

**Imports addition** (line 11 — `Tag` icon if used; already has `Check, Loader2, AlertCircle, Minus`):
```typescript
import type { TagErrorCode } from '@shared/tagTypes'
```

**GroupRowProps additions** (after line 82):
```typescript
export interface GroupRowProps {
  // ... existing props unchanged ...
  /** Tag status for this group. null/undefined = not in a tag run. */
  tagStatus?: 'queued' | 'tagging' | 'done' | 'skipped' | 'failed' | null
  /** Typed tag failure/skip code — present when tagStatus === 'failed' or 'skipped'. */
  tagErrorCode?: TagErrorCode | null
  // NOTE: no onRetryTag, no tagNote — tag has no per-group retry, no basic-group-fallback note
}
```

**renderCheckboxSlot extension** (after line 160 — after existing `removalStatus` branch, before `isPending`):
```typescript
function renderCheckboxSlot(): React.JSX.Element {
  // 1. removalStatus branch (unchanged)
  if (removalStatus != null) { ... }

  // 1b. ADD tagStatus branch — parallel to removalStatus, never overlap
  if (tagStatus != null) {
    switch (tagStatus) {
      case 'tagging':
        return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
      case 'done':
        return <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      case 'skipped':
        return <Minus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      case 'queued':
        return (
          <Checkbox checked={true} disabled={true}
                    aria-label={tG('includeInRemovalAria', { title: dialog.title })} />
        )
    }
  }

  // 2. Existing isPending branch (unchanged)
  // 3. Existing isActionable branch (unchanged)
  // 4. Existing grey-disabled fallback (unchanged)
}
```

**renderTagSubline (new helper, parallels renderRemovalSubline):**
```typescript
function renderTagSubline(): React.JSX.Element | null {
  if (tagStatus == null) return null

  switch (tagStatus) {
    case 'tagging':
      return <span className="text-label text-muted-foreground">{tT('rowStatus.tagging')}</span>
    case 'done':
      return <span className="text-label text-muted-foreground">{tT('rowStatus.done')}</span>
    case 'skipped': {
      const key =
        tagErrorCode === 'TAG_TARGET_IS_ADMIN'       ? 'rowStatus.skippedAdmin' :
        tagErrorCode === 'TAG_UNSUPPORTED_BASIC_GROUP' ? 'rowStatus.skippedBasicGroup' :
                                                          'rowStatus.skipped'
      return <span className="text-label text-muted-foreground">{tT(key)}</span>
    }
    case 'failed': {
      const errorKey = tagErrorCode ? `rowError.${tagErrorCode}` : 'rowError.UNKNOWN'
      // NOTE: no retry button — tag has no per-group retry
      return (
        <span className="text-label text-destructive">{tT(errorKey)}</span>
      )
    }
    case 'queued':
      return null
  }
}
```
Add `const { t: tT } = useTranslation('tag')` alongside existing `tG` / `tR` (lines 100–101).

**isRemovalActive guard — extend to cover tag** (line 112):
```typescript
// CURRENT:
const isRemovalActive = removalStatus != null
// CHANGE to:
const isRemovalActive = removalStatus != null || tagStatus != null
```

**renderTagSubline placement in JSX** (after `{renderRemovalSubline()}` at line 275):
```tsx
{renderRemovalSubline()}
{renderTagSubline()}   {/* ADD — renders only when tagStatus != null */}
```

---

### `src/renderer/i18n/index.ts` MODIFY (config)

**Analog:** self — current file at `/Users/igraczech/Repositories/MrProper/src/renderer/i18n/index.ts`

**Step 2 — static imports** (after line 20):
```typescript
import enTag from './locales/en/tag.json'
import csTag from './locales/cs/tag.json'
```

**Step 3 — resources object** (lines 22–39):
```typescript
export const resources = {
  en: {
    auth: enAuth, target: enTarget, groups: enGroups,
    wizard: enWizard, removal: enRemoval, shell: enShell,
    tag: enTag,   // ADD
  },
  cs: {
    auth: csAuth, target: csTarget, groups: csGroups,
    wizard: csWizard, removal: csRemoval, shell: csShell,
    tag: csTag,   // ADD
  },
} as const
```

**Step 4 — i18next.d.ts** (`src/renderer/i18n/i18next.d.ts` lines 1–12): No explicit change needed. `CustomTypeOptions.resources` is derived from `(typeof resources)['en']`. Adding `tag: enTag` to `resources.en` automatically includes it in the TypeScript types.

---

### `src/renderer/i18n/i18n.test.ts` MODIFY (test)

**Analog:** self — current file at `/Users/igraczech/Repositories/MrProper/src/renderer/i18n/i18n.test.ts`

**NAMESPACES constant** (line 16) — add `'tag'`:
```typescript
// CURRENT:
const NAMESPACES = ['auth', 'target', 'groups', 'wizard', 'removal', 'shell'] as const
// CHANGE to:
const NAMESPACES = ['auth', 'target', 'groups', 'wizard', 'removal', 'shell', 'tag'] as const
```
This test goes RED until all 4 i18n registration steps are complete, providing immediate feedback (RESEARCH.md Pitfall 5).

---

### `src/renderer/i18n/locales/en/tag.json` + `cs/tag.json` (config)

**Analog:** `src/renderer/i18n/locales/en/removal.json` (lines 1–58) — full key structure

**Structure pattern** (from removal.json):
```json
{
  "rowError": { "CODE": "..." },
  "rowStatus": { "state": "..." },
  "summaryPart": { "outcome": "..." },
  "pluralKey_one": "...",
  "pluralKey_other": "..."
}
```
Full key table is defined in `12-UI-SPEC.md` Copywriting Contract. Czech file follows `cs/removal.json` pattern: 3-form plurals (`_one` / `_few` / `_other`), formal vykání.

---

### `src/renderer/wizard/wizardStage.test.ts` MODIFY (extend — test)

**Analog:** self — current file, `wizardStage.test.ts`

**Extension pattern** (mirrors existing test at lines 21–29):
```typescript
describe('getNextStage — auto-advance on terminal tag step', () => {
  it('run stage: auto-advances to report when tag.step is complete', () => {
    expect(getNextStage('run', 'TAG_COMPLETE')).toBe('report')
  })
  it('run stage: auto-advances to report when tag.step is stopped', () => {
    expect(getNextStage('run', 'TAG_STOPPED')).toBe('report')
  })
  it('TAG_COMPLETE from target stage → unchanged (invalid transition guard)', () => {
    expect(getNextStage('target', 'TAG_COMPLETE')).toBe('target')
  })
})
```

---

## Shared Patterns

### Store singleton + useSyncExternalStore
**Source:** `src/renderer/store/removalStore.ts` (entire file, lines 1–167)
**Apply to:** `tagStore.ts`
```typescript
// Pattern: module-level mutable state + Set<Listener> + ref-counted subscribe/stopSubscriptions
// + cachedSnapshot guard + useSyncExternalStore + actions object
// The cachedSnapshot guard at lines 87–97 is MANDATORY — prevents infinite re-render loops.
```

### Dialog (no-op onOpenChange) pattern
**Source:** `src/renderer/removal/ResumeJobDialog.tsx` line 56
**Apply to:** `TagResumeJobDialog.tsx`
```typescript
// CR-04: onOpenChange wired to no-op — Escape/backdrop must NOT silently discard the job.
<Dialog open={open} onOpenChange={() => {}}>
```

### Segmented-control radio group
**Source:** `src/renderer/wizard/ReviewScreen.tsx` lines 217–248
**Apply to:** ReviewScreen.tsx (3-way extension)
```tsx
<div role="radiogroup" aria-label={t('wizard:actionGroupAria')}
     className="flex rounded-md border border-border overflow-hidden">
  <Button role="radio" aria-checked={action === 'kick'} variant={action === 'kick' ? 'default' : 'ghost'}
          size="sm" className="rounded-none flex-1" onClick={() => onActionChange('kick')}>
    {t('severityKick')}
  </Button>
  {/* border-l pattern for middle and right buttons */}
</div>
```

### i18n static import + resources registration
**Source:** `src/renderer/i18n/index.ts` lines 9–39
**Apply to:** index.ts (add tag namespace)
```typescript
// 4-step process: (1) create JSON files, (2) static import, (3) add to resources object,
// (4) add to NAMESPACES in i18n.test.ts. TypeScript types auto-derive from resources['en'].
```

### Progress slot pattern (progress bar + FloodCountdown)
**Source:** `src/renderer/groups/GroupsPane.tsx` lines 267–311
**Apply to:** GroupsPane.tsx tag progress slot (slot a-tag)
```tsx
<div className="px-4 py-2 shrink-0" role="status" aria-live="polite">
  <div className="flex items-center justify-between mb-1">
    <span className="text-label text-muted-foreground">{/* progress label */}</span>
    <Button variant="ghost" size="sm" ...>{/* stop/stopping label */}</Button>
  </div>
  <div className="h-1 bg-muted rounded-full overflow-hidden">
    <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
  </div>
  {floodWaitRemaining != null && floodWaitRemaining > 0 && (
    <span className="text-label text-muted-foreground flex items-baseline gap-1">
      {/* floodWaitSubline */}
      <FloodCountdown remaining={floodWaitRemaining} />
    </span>
  )}
</div>
```

### PEER_FLOOD alert pattern
**Source:** `src/renderer/groups/GroupsPane.tsx` lines 315–345
**Apply to:** GroupsPane.tsx tag PEER_FLOOD slot (slot b-tag)
```tsx
<Alert variant="destructive" className="bg-destructive/10 border-destructive/30"
       role="alert" aria-live="assertive">
  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
  <AlertDescription className="text-body">
    {/* peerFloodBanner */}
    <div className="mt-2">
      <Button variant="destructive" size="sm">{/* peerFloodResumeLabel */}</Button>
    </div>
  </AlertDescription>
</Alert>
```

### Summary band pattern (dot-join parts)
**Source:** `src/renderer/groups/GroupsPane.tsx` lines 348–397
**Apply to:** GroupsPane.tsx tag summary slot (slot c-tag)
```tsx
<div className="px-4 py-2 shrink-0 border-t border-border flex items-center justify-between gap-2 flex-wrap" role="status">
  <div className="flex flex-col gap-1">
    {summaryParts.map((part, i) => (
      <React.Fragment key={part.label}>
        {i > 0 && <span className="text-muted-foreground"> · </span>}
        <span className="font-semibold text-foreground">{part.count}</span>
        {' '}
        <span className="text-muted-foreground">{part.label}</span>
      </React.Fragment>
    ))}
  </div>
  <Button variant="outline" size="sm" onClick={...}>{tW('tagSomeoneElse')}</Button>
</div>
```
**Tag difference:** no `summaryFailed` retry copy line (tag has no per-group retry).

### Auto-advance useEffect pattern
**Source:** `src/renderer/shell/AppShell.tsx` lines 57–64
**Apply to:** AppShell.tsx (tag auto-advance useEffect)
```typescript
useEffect(() => {
  if (
    stage === 'run' &&
    action === 'tag' &&   // CRITICAL: gate on action to prevent cross-contamination (Pitfall 3)
    (tag.step === 'complete' || tag.step === 'stopped' || tag.step === 'hard-stopped')
  ) {
    setStage('report')
  }
}, [tag.step, stage, action])
```

### Pure-function test pattern (no jsdom)
**Source:** `src/renderer/wizard/reviewScreen.test.ts` (entire file)
**Apply to:** `tagValidation.test.ts`, `tagStore.test.ts`
```typescript
// vitest.config.ts: environment: 'node' — no DOM APIs available.
// All renderer tests are pure-function tests: export the function, test it directly.
// No React Testing Library, no component rendering.
import { describe, it, expect } from 'vitest'
```

---

## No Analog Found

All files in Phase 12 have clear analogs in the codebase. No files require falling back to RESEARCH.md patterns for the primary structure.

---

## Key Critical Constraints (from code reading)

1. **tagClient.startTag argument order** (`tagClient.ts` line 24): `startTag(dialogIds: string[], tag: string)` — `dialogIds` first, `tag` second. The store action `tagActions.startTag(tag, dialogIds)` must internally call `tagClient.startTag(dialogIds, tag)` — note the flip.

2. **cachedSnapshot guard** (`removalStore.ts` lines 87–97): The `Object.is`-based guard for snapshot referential stability is mandatory for `tagStore.ts`. Without it, React sees a new object on every `getSnapshot()` call and enters an infinite re-render loop.

3. **Stage is explicit, never derived** (`AppShell.tsx` comment + `CONTEXT.md`): AppShell calls `setStage('report')` directly in `useEffect`. `wizardStage.ts` is a documentation artifact.

4. **TagJobFileSafe, not TagJobFile** (`tagTypes.ts` line 145): `TagJobFileSafe = Omit<TagJobFile, 'targetAccessHash'>`. `TagResumeJobDialog` takes `TagJobFileSafe`. Never pass `TagJobFile` to the renderer.

5. **Only persist kick/ban, not tag** (`severityClient.ts`): `severityClient.setSeverity()` only accepts `'kick' | 'ban'`. Call it only when `action !== 'tag'`.

6. **Tag summary has no retry** (`CONTEXT.md`): `tagClient` has no `retryTagGroup`. Omit retry links from summary band and failed-row subline.

---

## Metadata

**Analog search scope:** `src/renderer/store/`, `src/renderer/removal/`, `src/renderer/shell/`, `src/renderer/groups/`, `src/renderer/wizard/`, `src/renderer/i18n/`, `src/renderer/ipc/`, `src/shared/`
**Files scanned:** 16 source files read directly
**Pattern extraction date:** 2026-06-20
