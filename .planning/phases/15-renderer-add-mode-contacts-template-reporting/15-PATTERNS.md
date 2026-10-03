# Phase 15: Renderer — Add Mode, Contacts, Template & Reporting - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 27 (12 new, 15 modified)
**Analogs found:** 25 / 27

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/renderer/store/addStore.ts` (new) | store | event-driven (IPC push + request-response) | `src/renderer/store/tagStore.ts` + `removalStore.ts` (`retryGroup`) | exact |
| `src/renderer/store/addStore.test.ts` (new) | test | — | `src/renderer/store/tagStore.test.ts` | exact |
| `src/renderer/ipc/addClient.ts` (new) | utility (IPC bridge wrapper) | request-response | `src/renderer/ipc/tagClient.ts` | exact |
| `src/renderer/groups/modeRules.ts` (new) | utility (pure predicate) | transform | none (net-new cross-cutting rule) — modeled on D-03/D-05 spec | partial (spec-derived, no direct analog) |
| `src/renderer/groups/modeRules.test.ts` (new) | test | — | `src/renderer/wizard/tagValidation.test.ts` (pure-fn test idiom) | role-match |
| `src/renderer/groups/ModeSwitch.tsx` (new) | component | request-response (local UI state) | `ReviewScreen.tsx`'s 3-way `role="radiogroup"` action picker (lines 272-310) | role-match |
| `src/renderer/removal/AddResumeJobDialog.tsx` (new) | component (dialog) | request-response | `src/renderer/removal/TagResumeJobDialog.tsx` | exact |
| `src/renderer/wizard/addValidation.ts` (new) | utility (pure validator + derivation) | transform | `src/renderer/wizard/tagValidation.ts` | exact |
| `src/renderer/wizard/addValidation.test.ts` (new) | test | — | `src/renderer/wizard/tagValidation.test.ts` | exact |
| `src/renderer/wizard/DmTemplateEditor.tsx` (new) | component | request-response | `src/renderer/wizard/TagInput.tsx` (inline-validated input chrome) + `ReviewScreen.tsx`'s DM section placement | role-match |
| `src/shared/dmTemplate.ts` (new) | utility (shared pure module) | transform | `src/main/ipc/templateChannels.ts` (`renderTemplate`/defaults, lines 40-55) — relocated verbatim | exact |
| `src/shared/dmTemplate.test.ts` (new) | test | — | `src/main/ipc/templateChannels.test.ts` | exact |
| `src/main/ipc/clipboardChannels.ts` (new) | middleware/route (IPC handler) | request-response | `src/main/ipc/severityChannels.ts` (one-handler-per-file, Zod-gated) | role-match |
| `src/main/ipc/clipboardChannels.test.ts` (new) | test | — | `src/main/ipc/severityChannels.ts`'s untested-but-simple shape; closer runtime analog is `addChannels.test.ts`'s mocked-handler idiom | partial |
| `src/renderer/i18n/locales/{en,cs}/add.json` (new) | config (i18n namespace) | — | `src/renderer/i18n/locales/{en,cs}/tag.json` | exact |
| **Modified files** | | | | |
| `src/renderer/shell/AppShell.tsx` | component (stage/mode orchestrator) | event-driven | self (current `action` state, lines 43-53, 72-92, 159-167) | exact (self-modify) |
| `src/renderer/groups/GroupsPane.tsx` | component | event-driven | self (tag branches, lines 136-159, 291-416, 636-666) | exact (self-modify) |
| `src/renderer/groups/GroupRow.tsx` | component | request-response (props-driven) | self (tag status branches, lines 174-214, 309-346) | exact (self-modify) |
| `src/renderer/wizard/ReviewScreen.tsx` | component | request-response | self (`computeTagGroups`/tag block, lines 105-113, 185-188, 262-330, 365-407) | exact (self-modify) |
| `src/renderer/wizard/wizardStage.ts` | utility (stage machine) | event-driven | self + `src/renderer/store/tagStore.ts`'s event-naming convention | exact (self-modify) |
| `src/renderer/store/groupsStore.ts` | store | event-driven | self (`onScanState` pre-check rebuild, lines 58-89, 166-172) | exact (self-modify) |
| `src/renderer/store/targetStore.ts` | store | event-driven | self + `src/main/ipc/addChannels.ts`'s `TARGET_ADD_CONTACT` handler (consumer side) | exact (self-modify) |
| `src/renderer/target/TargetCard.tsx` | component | request-response | self (confirm-gate footer, lines 246-285) | exact (self-modify) |
| `src/renderer/shell/SettingsMenu.tsx` | component | request-response | self (menu-item pattern, lines 93-192) | exact (self-modify) |
| `src/renderer/i18n/index.ts` | config | — | self (resources registration, lines 1-43) | exact (self-modify) |
| `src/renderer/i18n/i18n.test.ts` | test | — | self (`NAMESPACES` array, line 16) | exact (self-modify) |
| `src/main/ipc/templateChannels.ts` | middleware/route | request-response | self (`renderTemplate`/defaults to be extracted, lines 34-55) | exact (self-modify) |
| `src/main/ipc/addChannels.ts` | middleware/route | request-response + file-I/O | self + `src/main/ipc/removalChannels.ts` (no removal save-dialog precedent — new territory) | exact (self-modify), new capability partial |
| `src/main/storage/addLogStore.ts` | model/storage | file-I/O | self (`logPath()` private closure, lines 132-138) | exact (self-modify) |
| `src/main/index.ts` | config (wiring) | — | self (registration block, lines 380-402) | exact (self-modify) |
| `src/preload/index.ts` | middleware (bridge) | request-response | self (Add bridge block, lines 224-263) | exact (self-modify) |
| `src/shared/channels.ts` | config | — | self (ADD_*/TEMPLATE_* blocks, lines 67-82) | exact (self-modify) |

## Pattern Assignments

### `src/renderer/store/addStore.ts` (store, event-driven)

**Analog:** `src/renderer/store/tagStore.ts` (full file) + `src/renderer/store/removalStore.ts`'s `retryGroup` (lines 131-137)

**Imports pattern** (tagStore.ts lines 8-10):
```typescript
import { useSyncExternalStore } from 'react'
import type { TagState, TagJobFileSafe } from '@shared/tagTypes'
import { tagClient } from '../ipc/tagClient'
```
For addStore: `import type { AddState, AddJobFileSafe } from '@shared/addTypes'` + `import { addClient } from '../ipc/addClient'`.

**Core pattern — module state + ref-counted subscription** (tagStore.ts lines 14-65):
```typescript
let currentState: TagState = { step: 'idle', tag: '', targetId: '', targetName: '',
  progress: { processed: 0, total: 0 }, outcomes: [] }
let pendingJob: TagJobFileSafe | null = null
const listeners = new Set<Listener>()
function notify(): void { for (const l of listeners) l() }
function setState(next: TagState): void { currentState = next; notify() }

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
    if (job !== null && job.status !== 'complete') { pendingJob = job; notify() }
  }).catch(console.error)
}
```
For addStore: `currentState: AddState` initial shape must match `AddState`'s idle default (no `severity`/`tag` field — Add has none); `AddJobFileSafe` replaces `TagJobFileSafe`. `addClient.onAddState`/`getAddState`/`getAddJob` replace the Tag equivalents.

**cachedSnapshot guard — MANDATORY** (tagStore.ts lines 86-100):
```typescript
let cachedSnapshot: { state: TagState; pendingJob: TagJobFileSafe | null } = { state: currentState, pendingJob }
function getSnapshot(): { state: TagState; pendingJob: TagJobFileSafe | null } {
  if (cachedSnapshot.state !== currentState || cachedSnapshot.pendingJob !== pendingJob) {
    cachedSnapshot = { state: currentState, pendingJob }
  }
  return cachedSnapshot
}
```
Omitting this guard causes "Maximum update depth exceeded" (documented Pitfall 2 in both tagStore.ts's header comment and 15-RESEARCH.md). Copy verbatim with `Add` types substituted.

**retryGroup — borrow from removalStore.ts** (removalStore.ts lines 131-137):
```typescript
async retryGroup(dialogId: string): Promise<void> {
  try {
    await removalClient.retryRemovalGroup(dialogId)
  } catch (err) {
    console.error('[removalStore] retryGroup:', err)
  }
},
```
For addStore: `await addClient.retryAddGroup(dialogId)`, log tag `[addStore] retryGroup:`.

**resumeJobFromDisk pattern** (tagStore.ts lines 148-165, nearly identical in removalStore.ts lines 149-166):
```typescript
async resumeJobFromDisk(): Promise<void> {
  try {
    const freshJob = await tagClient.getTagJob()
    if (!freshJob || freshJob.status === 'complete') return
    const remaining = freshJob.dialogIds.filter(
      (id) => !freshJob.outcomes.find((o) => o.dialogId === id)
    )
    if (remaining.length === 0) return
    await tagActions.startTag(freshJob.tag, remaining)
  } catch (err) {
    console.error('[tagStore] resumeJobFromDisk:', err)
  }
},
```
For addStore: `addClient.getAddJob()` → `addActions.startAdd(remaining)` (Add's `startAdd` takes only `dialogIds`, no second argument — see D-15/`addClient` below).

**Error handling pattern:** every dispatcher wraps the client call in try/catch, logs via `console.error('[storeName] actionName:', err)`, and never throws to the caller — consistent across tagStore.ts and removalStore.ts, copy exactly.

**Divergence note:** addStore has NO `severity` concept (unlike removalStore) and carries `dmStatus` (from `AddState`) which neither Tag nor Removal has — no action dispatcher needed for `dmStatus`, it just flows through `setState` from the pushed `AddState`.

---

### `src/renderer/ipc/addClient.ts` (utility — IPC bridge wrapper, request-response)

**Analog:** `src/renderer/ipc/tagClient.ts` (full file, 48 lines)

**Full pattern to clone:**
```typescript
import type { TagState, TagJobFileSafe } from '@shared/tagTypes'

declare global {
  interface MrsProperApi {
    startTag(dialogIds: string[], tag: string): Promise<TagState>
    abortTag(): Promise<TagState>
    getTagState(): Promise<TagState>
    onTagState(cb: (s: TagState) => void): () => void
    getTagJob(): Promise<TagJobFileSafe | null>
    discardTagJob(): Promise<null>
  }
}

export const tagClient = {
  startTag(dialogIds: string[], tag: string): Promise<TagState> {
    return window.mrsproper.startTag(dialogIds, tag)
  },
  // ...
}
```
For `addClient.ts`: the bridge methods already exist on `window.mrsproper` (shipped Phase 14 preload, verified at `src/preload/index.ts` lines 229-249: `startAdd`, `abortAdd`, `retryAddGroup`, `getAddState`, `onAddState`, `getAddJob`, `discardAddJob`). **Do NOT re-declare the `MrsProperApi` interface fields** — they are already declared somewhere for the preload's own typing; only add the `declare global` augmentation if no prior declaration file covers Add (check for an existing `*.d.ts` or inline declare block before duplicating — avoid a duplicate-interface-member TS error). The exported `addClient` object mirrors `tagClient`'s plain wrapper shape:
```typescript
export const addClient = {
  startAdd(dialogIds: string[]): Promise<AddState> { return window.mrsproper.startAdd(dialogIds) },
  abortAdd(): Promise<AddState> { return window.mrsproper.abortAdd() },
  retryAddGroup(dialogId: string): Promise<void> { return window.mrsproper.retryAddGroup(dialogId) },
  getAddState(): Promise<AddState> { return window.mrsproper.getAddState() },
  onAddState(cb: (s: AddState) => void): () => void { return window.mrsproper.onAddState(cb) },
  getAddJob(): Promise<AddJobFileSafe | null> { return window.mrsproper.getAddJob() },
  discardAddJob(): Promise<null> { return window.mrsproper.discardAddJob() },
}
```
Note D-15: `startAdd(dialogIds)` — single argument, no severity/tag second parameter (unlike tagClient's `startTag(dialogIds, tag)` flip-order pitfall). No argument-order gotcha here.

---

### `src/renderer/groups/modeRules.ts` (utility, pure predicate — transform)

**No direct file analog** — this is the one genuinely new piece of logic Phase 15 introduces. Pattern it on `tagValidation.ts`'s pure-export-for-testing shape and RESEARCH.md's Pattern 2 (lines 279-328 of 15-RESEARCH.md), which was derived directly from reading `groupsStore.ts`'s `onScanState` handler and `GroupsPane.tsx`'s partition loop (the two existing hard-coded call sites this file must unify):

**Existing Remove-mode predicate to generalize** (`GroupsPane.tsx` lines 146-152):
```typescript
if (dialog.canAct && (status === 'member' || status === null)) {
  actionable.push(dialog)
} else {
  nonActionable.push(dialog)
}
```

**Existing pre-check predicate to generalize** (`groupsStore.ts` lines 67-72):
```typescript
const checkedDialogIds = new Set(
  s.results
    .filter((r) => r.status === 'member')
    .map((r) => r.dialogId)
    .filter((id) => groups.dialogs.find((d) => d.id === id)?.canAct)
)
```

**Target shape (from RESEARCH.md Pattern 2):**
```typescript
export function isActionableForMode(
  dialog: AdminDialogDTO,
  status: MembershipStatus | null,
  mode: 'remove' | 'tag' | 'add'
): boolean {
  if (mode === 'add') {
    return dialog.canAdd && (status === 'not-member' || status === 'banned')
  }
  return dialog.canAct && (status === 'member' || status === null)
}
```
Both `groupsStore.ts`'s pre-check rebuild and `GroupsPane.tsx`'s partition MUST import and call this single function — do not duplicate the Add branch inline in either file (see RESEARCH.md Pitfall 2/Anti-pattern in Pattern 2).

**Test idiom analog:** `src/renderer/wizard/tagValidation.test.ts` lines 1-26 — plain `describe`/`it`, a `makeDialog(overrides)` factory using `AdminDialogDTO` with `canAdd`/`addGreyReason` already in the default shape (lines 12-25), no jsdom.

---

### `src/renderer/groups/ModeSwitch.tsx` (component, request-response)

**Analog:** `ReviewScreen.tsx`'s 3-way `role="radiogroup"` action picker (lines 272-310):
```tsx
<div role="radiogroup" aria-label={t('actionGroupAria')} className="flex rounded-md border border-border overflow-hidden">
  <Button role="radio" aria-checked={action === 'kick'} variant={action === 'kick' ? 'default' : 'ghost'}
    size="sm" className="rounded-none flex-1" onClick={() => onActionChange('kick')}>
    {t('severityKick')}
  </Button>
  <Button role="radio" aria-checked={action === 'ban'} variant={action === 'ban' ? 'default' : 'ghost'}
    size="sm" className="rounded-none flex-1 border-l border-border" onClick={() => onActionChange('ban')}>
    {t('severityBan')}
  </Button>
  <Button role="radio" aria-checked={action === 'tag'} variant={action === 'tag' ? 'default' : 'ghost'}
    size="sm" className="rounded-none flex-1 border-l border-border" onClick={() => onActionChange('tag')}>
    {tT('actionTag')}
  </Button>
</div>
```
Per RESEARCH.md's "Alternatives Considered" table, this exact `role="radio"` button-row markup is the recommended reusable shape for `ModeSwitch` (no `toggle-group.tsx` primitive exists). D-01 places this control in the groups-pane header, visible in both browse and checklist mode — so it is a new standalone component (not inline in `ReviewScreen.tsx`), but the internal markup is a direct copy with Remove/Tag/Add labels and `onModeChange` instead of `onActionChange`. Must call `groupsActions.recomputeCheckedForMode(newMode)` synchronously inside the `onClick` handler (D-03, RESEARCH.md Pitfall 3) — this is the ONE call this component makes beyond the visual radio toggle. Disabled state (D-01: disabled while scan resolving a mode switch, during a run, in run/report stages) mirrors the existing `disabled={isRunActive}` prop pattern already used on `GroupsPane.tsx`'s "Change target" button (line 606).

---

### `src/renderer/removal/AddResumeJobDialog.tsx` (component, request-response)

**Analog:** `src/renderer/removal/TagResumeJobDialog.tsx` (full file, 94 lines) — clone exactly, per D-21.

**Full pattern:**
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { useTranslation } from 'react-i18next'
import type { TagJobFileSafe } from '@shared/tagTypes'
import { tagActions } from '@renderer/store/tagStore'

export function TagResumeJobDialog({ open, onOpenChange, job, onResume }: TagResumeJobDialogProps) {
  const { t } = useTranslation('tag')
  const processedCount = job.outcomes.length
  const totalCount = job.dialogIds.length
  const remainingDialogIds = job.dialogIds.filter((id) => !job.outcomes.find((o) => o.dialogId === id))

  const handleDiscard = useCallback(() => {
    void tagActions.discardJob()
    onOpenChange(false)
  }, [onOpenChange])

  const handleResume = useCallback(() => {
    void tagActions.startTag(job.tag, remainingDialogIds)
    onOpenChange(false)
    onResume?.()
  }, [job.tag, remainingDialogIds, onOpenChange, onResume])

  return (
    // CR-04: onOpenChange wired to no-op — Escape/backdrop must NOT silently discard the job.
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[400px]" aria-labelledby="tag-resume-dialog-title" aria-describedby="tag-resume-dialog-desc">
        <DialogHeader>
          <DialogTitle id="tag-resume-dialog-title" className="text-heading">
            {t('resumeTitle', { name: job.targetName })}
          </DialogTitle>
          <DialogDescription id="tag-resume-dialog-desc" className="text-body">
            {t('resumeBody', { x: processedCount, n: totalCount })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleDiscard} autoFocus>{t('resumeNeutral')}</Button>
          <Button variant="default" onClick={handleResume} aria-label={t('resumeDestructiveAria')}>
            {t('resumeDestructive')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```
For `AddResumeJobDialog`: `useTranslation('add')`, `job: AddJobFileSafe`, `addActions.discardJob()`/`addActions.startAdd(remainingDialogIds)` — note D-15/D-21: `startAdd` takes ONLY `dialogIds` (no second `tag`-like argument, unlike `startTag(job.tag, remainingDialogIds)`). Per D-21, `onResume` callback must additionally set mode to Add (`() => { setMode('add'); setStage('run') }` wired at the `AppShell.tsx` mount site, mirroring the existing `onResume={() => { setAction('tag'); setStage('run') }}` at `AppShell.tsx` line 165). Both `variant="default"`/non-destructive buttons are correct per D-21 ("Resume adding" is default-variant, non-destructive — same as Tag, unlike removal's destructive-variant resume).

---

### `src/renderer/wizard/addValidation.ts` (utility, transform)

**Analog:** `src/renderer/wizard/tagValidation.ts` (full file, 67 lines)

**`computeTagGroups` → `computeAddGroups` pattern** (tagValidation.ts lines 50-67):
```typescript
export function computeTagGroups(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  t: TranslateFn = (key) => key
): TagGroupAction[] {
  return dialogs
    .filter((d) => checkedIds.has(d.id))
    .map((d) => {
      const isBasicGroup = d.type === 'basic-group'
      return {
        dialog: d,
        mechanicNote: isBasicGroup ? t('tag:mechanicNote.basicGroup') : t('tag:mechanicNote.supergroup'),
        willBeSkipped: isBasicGroup,
      }
    })
}
```
Per RESEARCH.md Pattern 4 (lines 361-395), `computeAddGroups` is the first of the three review-screen helpers needing `MembershipStatus` as an input (for the "ban will be lifted first" note, D-06/D-14):
```typescript
export type AddGroupAction = {
  dialog: AdminDialogDTO
  mechanicNote: string
  banNoteAppended: boolean
}

export function computeAddGroups(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  membershipByDialogId: Map<string, MembershipStatus>,
  t: TranslateFn = (key) => key
): AddGroupAction[] {
  return dialogs
    .filter((d) => checkedIds.has(d.id))
    .map((d) => {
      const isBasic = d.type === 'basic-group'
      const isBanned = membershipByDialogId.get(d.id) === 'banned'
      const base = isBasic ? t('add:mechanicNote.add') : t('add:mechanicNote.invite')
      return {
        dialog: d,
        mechanicNote: isBanned ? `${base} — ${t('add:mechanicNote.banLiftedFirst')}` : base,
        banNoteAppended: isBanned,
      }
    })
}
```
Thread `scan.results` (from `useGroupsStore()`, already available in `ReviewScreen.tsx`) into `membershipByDialogId`.

**`validateTagInput` → `validateDmTemplate` pattern** (tagValidation.ts lines 19-24):
```typescript
export function validateTagInput(value: string): TagInputError {
  if (value.length > TAG_MAX_LENGTH) return 'tooLong'
  if (value !== value.replace(/[\x00-\x1F\x7F\r\n]+/g, '')) return 'controlChars'
  return null
}
```
For `validateDmTemplate` (D-12): three failure modes — `{links}` missing, empty text, >4000 chars:
```typescript
export type DmTemplateError = 'missingLinks' | 'empty' | 'tooLong' | null

export function validateDmTemplate(text: string): DmTemplateError {
  if (text.trim() === '') return 'empty'
  if (text.length > 4000) return 'tooLong'
  if (!text.includes('{links}')) return 'missingLinks'
  return null
}
```
Mirrors the same "derived, not stored" consumption pattern already used in `ReviewScreen.tsx` line 146: `const tagError = validateTagInput(tagValue)`.

---

### `src/renderer/wizard/DmTemplateEditor.tsx` (component, request-response)

**Analog:** `src/renderer/wizard/TagInput.tsx` (inline-validated input chrome — read for the disabled-with-message pattern) and `ReviewScreen.tsx`'s tag-input conditional mount (lines 312-321):
```tsx
{action === 'tag' && (
  <TagInput value={tagValue} onChange={setTagValue} error={tagError} disabled={isDispatching} inputRef={tagInputRef} />
)}
```
`DmTemplateEditor` follows the same controlled-component shape: `value`, `onChange`, `error` (from `validateDmTemplate`), plus D-11's toggle-reveal behavior (new — no direct toggle analog exists; use local `useState<boolean>` for `isEditing`, same idiom as `SettingsMenu.tsx`'s `menuOpen` toggle, lines 20/67). Save button disabled logic mirrors `ReviewScreen.tsx`'s `isConfirmDisabled` derivation style (line 219-223: boolean computed from validation result, not stored).

---

### `src/shared/dmTemplate.ts` (shared pure module, transform)

**Analog:** `src/main/ipc/templateChannels.ts` lines 34-55 (relocate verbatim, per D-13 and RESEARCH.md Pattern 5):
```typescript
export function renderTemplate(template: string, vars: { name: string; links: string }): string {
  // WR-03: single pass over BOTH placeholders — a name containing the literal substring
  // "{links}" must not be re-matched by a second .replace() call.
  return template.replace(/\{name\}|\{links\}/g, (m) => (m === '{name}' ? vars.name : vars.links))
}

export const DEFAULT_TEMPLATE_EN =
  "Hi {name}! I'd like to add you to a few groups, but your privacy settings are blocking a direct invite. Here are single-use invite links instead (each one expires in 5 days):\n\n{links}"

export const DEFAULT_TEMPLATE_CS =
  'Dobrý den, {name}, rádi bychom Vás přidali do několika skupin, ale Vaše nastavení soukromí brání přímému pozvání. Zde jsou jednorázové pozvánkové odkazy (každý platí 5 dní):\n\n{links}'
```
`templateChannels.ts` then re-exports these three symbols from `@shared/dmTemplate` so `main/index.ts`'s existing import (`registerAddChannels`'s `getDmText` closure, `main/index.ts` around the `AddExecutor` construction block) needs zero call-site changes. `ReviewScreen.tsx`'s DM preview imports the same `renderTemplate` directly from `@shared/dmTemplate` (never from `templateChannels.ts`, which imports `ipcMain` at module scope and cannot be pulled into the renderer bundle).

---

### `src/main/ipc/clipboardChannels.ts` (middleware/route, request-response)

**Analog:** `src/main/ipc/severityChannels.ts` (one-handler-per-file convention, full file structure) — this new file is much simpler (no electron-store, no async factory):

**Pattern to follow (handler registration shape, severityChannels.ts lines 61-77):**
```typescript
export function registerSeverityChannels(): void {
  ipcMain.handle(SEVERITY_GET, async () => { ... })
  ipcMain.handle(SEVERITY_SET, async (_event, payload: unknown) => {
    const { severity } = SeveritySchema.parse(payload)
    ...
  })
}
```

**Actual handler body — from 15-RESEARCH.md's Code Examples section (verified against electronjs.org/docs/latest/api/clipboard):**
```typescript
import { ipcMain, clipboard } from 'electron'
import { z } from 'zod'
import { CLIPBOARD_WRITE_TEXT } from '@shared/channels'

export function registerClipboardChannels(): void {
  ipcMain.handle(CLIPBOARD_WRITE_TEXT, async (_event, payload: unknown) => {
    const { text } = z.object({ text: z.string().max(2000) }).parse(payload)
    clipboard.writeText(text)
    return { ok: true as const }
  })
}
```
Security note (V4 Access Control, per RESEARCH.md Security Domain): gate behind the same auth check every other handler in `addChannels.ts` uses (`if (getAuthState().step !== 'authorized') return { ok: false }`), passed in as a `getAuthState` callback parameter exactly like `registerAddChannels`'s last argument (`addChannels.ts` line 119, call site `main/index.ts` line 392: `() => sm.getState()`).

---

### `src/main/ipc/addChannels.ts` additions — `ADD_EXPORT_LOG` handler (request-response + file-I/O)

**Analog:** no prior `dialog.showSaveDialog` usage exists in this codebase (first use) — pattern from 15-RESEARCH.md's Code Examples (lines 472-497), modeled on this file's own `ipcMain.handle` + try/implicit-catch registration style (e.g. `ADD_GET_JOB` handler, lines 220-228):
```typescript
import { dialog, BrowserWindow } from 'electron'
import { copyFileSync, existsSync } from 'node:fs'
import { ADD_EXPORT_LOG } from '@shared/channels'

ipcMain.handle(ADD_EXPORT_LOG, async (_event) => {
  const logPath = addLogStore.getLogPath() // new additive method — see addLogStore.ts below
  if (!existsSync(logPath)) {
    return { ok: false, reason: 'no-log' as const }
  }
  const win = BrowserWindow.getFocusedWindow() ?? currentWin
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: 'mrproper-add-log.txt',
    filters: [{ name: 'Text', extensions: ['txt'] }],
  })
  if (canceled || !filePath) {
    return { ok: false, reason: 'canceled' as const }
  }
  copyFileSync(logPath, filePath)
  return { ok: true as const }
})
```
Wire this new handler inside the existing `registerAddChannels()` function (same file, same export), following the existing handler-block ordering (after `TARGET_ADD_CONTACT`, lines 236-250) — do NOT create a separate file, since `ADD_EXPORT_LOG` is Add-specific (unlike the general-purpose clipboard handler).

---

### `src/main/storage/addLogStore.ts` additive change — `getLogPath()`

**Analog:** the existing private `logPath()` closure (lines 132-138):
```typescript
function logPath(): string {
  const { join } = require('node:path') as typeof import('node:path')
  const userData = resolveApp().getPath('userData')
  return join(userData, logFileName)
}
```
Add one new method to the public `AddLogStore` interface (line 52-58) and the returned object (line 144):
```typescript
export interface AddLogStore {
  appendBlock(entry: AddLogBlockEntry): void
  getLogPath(): string  // NEW — exposes the already-computed path for the export handler
}
// ...
return {
  appendBlock(entry) { ... },
  getLogPath(): string { return logPath() },
}
```
Purely additive — zero behavior change to `appendBlock`.

---

### `src/renderer/shell/AppShell.tsx` — `action` → `mode` + `severity` split (D-02)

**Current conflated state** (AppShell.tsx lines 43-53):
```typescript
const [action, setAction] = useState<'kick' | 'ban' | 'tag'>('ban')
useEffect(() => {
  severityClient.getSeverity().then(setAction).catch(() => {})
}, [])
const handleActionChange = useCallback((a: 'kick' | 'ban' | 'tag') => {
  setAction(a)
  if (a === 'kick' || a === 'ban') void severityClient.setSeverity(a)
}, [])
```
**Target split** (from 15-RESEARCH.md Pattern 1, lines 263-276):
```typescript
const [mode, setMode] = useState<'remove' | 'tag' | 'add'>('remove')  // session-only, never persisted (D-02)

const [severity, setSeverity] = useState<'kick' | 'ban'>('ban')  // unchanged, persisted
useEffect(() => {
  severityClient.getSeverity().then(setSeverity).catch(() => {})
}, [])
const handleSeverityChange = useCallback((s: 'kick' | 'ban') => {
  setSeverity(s)
  void severityClient.setSeverity(s)
}, [])
```
**Tag auto-advance gate to mirror for Add** (AppShell.tsx lines 76-92 — the EXACT pattern to clone a third time):
```typescript
const { state: tag, pendingJob: pendingTagJob } = useTagStore()
useEffect(() => {
  if (stage === 'run' && action === 'tag' &&
      (tag.step === 'complete' || tag.step === 'stopped' || tag.step === 'hard-stopped')) {
    setStage('report')
  }
}, [tag.step, stage, action])
const tagResumeOpen = pendingTagJob !== null
```
New Add effect: `{ state: add, pendingJob: pendingAddJob } = useAddStore()`; gate on `mode === 'add'` instead of `action === 'tag'`; `const addResumeOpen = pendingAddJob !== null`.

**Resume dialog mount pattern** (AppShell.tsx lines 159-167):
```tsx
{pendingTagJob && (
  <TagResumeJobDialog
    open={tagResumeOpen}
    onOpenChange={() => {}}
    job={pendingTagJob}
    onResume={() => { setAction('tag'); setStage('run') }}
  />
)}
```
For Add: `{pendingAddJob && <AddResumeJobDialog open={addResumeOpen} onOpenChange={() => {}} job={pendingAddJob} onResume={() => { setMode('add'); setStage('run') }} />}`.

---

### `src/renderer/groups/GroupsPane.tsx` — add-mode partition, progress slot, run-trigger

**Partition — generalize via `isActionableForMode`** (current hard-coded logic, lines 136-159, shown in modeRules.ts section above). Replace the inline `if (dialog.canAct && (status === 'member' || status === null))` with a call to the shared predicate parameterized by `mode`.

**Tag progress-slot branch to clone for Add** (lines 291-416 — the ENTIRE `if (activeAction === 'tag') { ... }` block is the template): running/stopping progress bar (lines 294-337), PEER_FLOOD banner (340-366), summary band (369-413) — copy this three-part structure wholesale for `mode === 'add'`, swapping `tT`/`tag`/`tagActions` for `tA`/`add`/`addActions`, and note D-18/D-19's additional report-line requirements (DM status line, Copy-link button, Premium hint) that have no Tag precedent — those are net-new additions layered onto the cloned summary-band shape.

**Run-trigger button text branch** (lines 636-666) — the ternary `activeAction === 'tag' ? tT(...) : tW(...)` pattern extends to a 3-way check for `mode === 'add' ? tA('runTriggerLabelAdd', ...) : ...`.

---

### `src/renderer/groups/GroupRow.tsx` — add-status subline + Copy button

**Tag-status branch to clone** (lines 174-214 for checkbox slot, 309-346 for subline) — same parallel-prop structure (`addStatus`/`addErrorCode` props alongside existing `tagStatus`/`tagErrorCode`, never overlapping). D-18's Copy-button-on-privacy-blocked-row has no Tag precedent — net-new UI inside the add subline render function, using the new `clipboard:writeText` IPC (not `navigator.clipboard` directly, per Pitfall 1).

**Grey-reason rendering to generalize** (lines 378-382):
```tsx
{!isRemovalActive && !dialog.canAct && dialog.greyReason && dialog.greyReason !== 'verify-failed' && !isFailed && (
  <span className="text-label text-muted-foreground">{tG(`greyReason.${dialog.greyReason}`)}</span>
)}
```
Add-mode needs a parallel branch reading `dialog.addGreyReason` (already-shipped field, `AdminDialogDTO.addGreyReason: AddGreyReason | null`) — the `greyReason.*` i18n keys for `already-member`/`no-invite-right`/`channel-full`/`banned-no-unban-right` already exist in `groups.json` (verified: `src/renderer/i18n/locales/en/groups.json` lines 2-12 already contains all four Add grey-reason strings, shipped in Phase 13).

---

### `src/renderer/wizard/ReviewScreen.tsx` — mode-gated action block + DM section

**Props signature to generalize** (lines 119-124):
```typescript
interface ReviewScreenProps {
  action: 'kick' | 'ban' | 'tag'
  onActionChange(a: 'kick' | 'ban' | 'tag'): void
  onConfirm(): void
  onBack(): void
}
```
Becomes: `mode: 'remove' | 'tag' | 'add'` (read-only, no change handler — D-01 moves the picker to GroupsPane) + `severity`/`onSeverityChange` (only rendered when `mode === 'remove'`).

**handleConfirm dispatch branch to extend** (lines 204-216):
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
Add branch: `else if (mode === 'add') { await addActions.startAdd(actionableAddDialogIds.map(d => d.id)) }` — per D-15, `startAdd(dialogIds)` ONLY, no identity/resume fields. Also fire the at-most-once contact-add dispatch here if it hasn't fired yet (Pattern 3, D-09's run-confirm trigger point).

**Group-list rendering branch to extend** (lines 365-407, the `action === 'tag' ? <tag list> : <removal list>` ternary) becomes a 3-way switch adding the Add group list (per-row mechanic note + ban-lifted-first suffix, D-14).

---

### `src/renderer/target/TargetCard.tsx` — add-to-contacts checkbox + failure notice

**Insertion point — confirm-gate footer** (lines 246-285):
```tsx
<div className="mt-2 flex flex-row justify-between items-center">
  <Tooltip>...Change target button...</Tooltip>
  {!isConfirmed && (
    <Button type="button" onClick={async () => { await targetActions.confirmTarget(); props.onTargetConfirmed?.() }}>
      {tTr('confirmPerson')}
    </Button>
  )}
</div>
```
D-08 checkbox renders alongside this footer (both resolved and confirmed states, so it sits ABOVE or beside the footer row, not nested inside the `!isConfirmed` conditional). Use the existing `Checkbox` component (`src/renderer/components/ui/checkbox.tsx`) exactly as `GroupRow.tsx` uses it (lines 224-229):
```tsx
<Checkbox checked={isChecked} onCheckedChange={() => onToggle(dialog.id)} aria-label={...} />
```
D-10's quiet inline notice follows the existing `Alert`/`AlertDescription` pattern already used for the no-photo notice (lines 234-244):
```tsx
<Alert variant="default">
  <ImageOff className="h-4 w-4" aria-hidden="true" />
  <AlertDescription>
    <span className="text-label font-semibold block mb-1">{tTr('noPhotoTitle')}</span>
    <span className="text-body">{tTr('noPhotoBody')}</span>
  </AlertDescription>
</Alert>
```

---

### `src/renderer/store/targetStore.ts` — contact-add dispatch state

**Analog:** self (existing `setState`/`targetActions` shape, lines 28-31, 96-124) + RESEARCH.md Pattern 3 (lines 330-359):
```typescript
interface TargetStoreState {
  target: TargetState
  governorFloodRemaining: number
  addToContactsChecked: boolean   // NEW — D-08, session-only, defaults true
  contactAddAttempted: boolean    // NEW — D-09, enforces at-most-once
  contactAddFailed: boolean       // NEW — D-10, drives inline notice
}
```
Dispatch call pattern (new, no direct prior analog — uses the existing `window.mrsproper.addTargetToContacts()` bridge already shipped):
```typescript
async confirmTarget(mode: 'remove' | 'tag' | 'add'): Promise<void> {
  const s = await targetClient.confirmTarget()
  setState({ target: s })
  if (mode === 'add' && currentState.addToContactsChecked && !currentState.contactAddAttempted) {
    setState({ contactAddAttempted: true })
    const result = await window.mrsproper.addTargetToContacts().catch(() => ({ ok: false }))
    if (!result.ok) setState({ contactAddFailed: true })
  }
},
```
Existing `resolveTarget`/`confirmTarget`/`resetTarget` dispatchers (lines 97-124) all follow the identical try/catch + `console.error('[targetStore] actionName error:', err)` shape — new dispatchers must match.

---

### `src/renderer/shell/SettingsMenu.tsx` — Export add log entry

**Analog:** self — the existing menu-item button pattern (Log out item, lines 184-191):
```tsx
<button
  type="button"
  role="menuitem"
  onClick={handleLogoutClick}
  className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
>
  {t('logOut')}
</button>
```
New "Export add log…" item follows the same `role="menuitem"` button shape (non-destructive styling, so drop the `text-destructive`/`hover:bg-destructive/10` classes — use the plain hover style from the language/theme radio items instead, lines 102-115) and calls the new `window.mrsproper.exportAddLog()` bridge method, handling the `{ ok: false, reason: 'no-log' }` case per D-20 with an inline toast/label swap (no existing toast component — reuse `Alert` inline or a transient label state, Claude's discretion per CONTEXT.md).

---

### `src/renderer/i18n/index.ts` + `i18n.test.ts` — new `add` namespace registration

**Analog:** self, the existing `tag` namespace addition (the most recent prior namespace, visible in the diff shape of lines 21-22, 32, 41):
```typescript
import enTag from './locales/en/tag.json'
import csTag from './locales/cs/tag.json'
// ...
export const resources = {
  en: { ..., tag: enTag },
  cs: { ..., tag: csTag },
} as const
```
Add: `import enAdd from './locales/en/add.json'` / `import csAdd from './locales/cs/add.json'`, then `add: enAdd` / `add: csAdd` in both language blocks.

**i18n.test.ts NAMESPACES array** (line 16) — **MUST** add `'add'`:
```typescript
const NAMESPACES = ['auth', 'target', 'groups', 'wizard', 'removal', 'shell', 'tag', 'add'] as const
```
This is flagged as Pitfall 5 in RESEARCH.md — a required edit, not optional; the completeness test silently passes if skipped.

---

### `src/renderer/i18n/locales/{en,cs}/add.json` — new namespace content

**Analog:** `src/renderer/i18n/locales/en/tag.json` (full file, 65 lines) for key-naming convention: `_one`/`_other` (English) plural suffixes, nested objects for `rowStatus`/`rowError`/`summaryPart`/`mechanicNote`, flat keys for labels/titles. Representative keys to mirror 1:1 by purpose:
```json
{
  "progressLabel": "Adding {{name}} to group {{x}} of {{n}}…",
  "stopLabel": "Stop adding",
  "stoppingLabel": "Stopping…",
  "floodWaitSubline": "Telegram asked us to slow down — resuming automatically.",
  "peerFloodBanner": "Telegram has flagged this account for too many actions. ...",
  "peerFloodResumeLabel": "Resume adding",
  "rowStatus": { "adding": "Adding…", "done": "Added", "alreadyMember": "Already a member", ... },
  "rowError": { "ADD_NO_RIGHTS": "...", "ADD_TARGET_INVALID": "...", "UNKNOWN": "Telegram refused this add." },
  "summaryPart": { "added": "Added", "alreadyMember": "Already a member", "privacyBlocked": "Privacy-blocked", "failed": "Failed", "skipped": "Skipped" },
  "resumeTitle": "Finish adding {{name}}?",
  "resumeBody": "{{x}} of {{n}} groups were processed before the run stopped. ...",
  "resumeDestructive": "Resume adding",
  "resumeNeutral": "Discard job",
  "mechanicNote": { "invite": "Invite", "add": "Add", "banLiftedFirst": "ban will be lifted first" }
}
```
Czech (`cs/add.json`) mirrors `cs/tag.json`'s formal-vykání register and `_one`/`_few`/`_other` three-form plural pattern — read `src/renderer/i18n/locales/cs/tag.json` directly when drafting (not excerpted here; same file, Czech content, structurally identical keys).

---

## Shared Patterns

### useSyncExternalStore store shape (ref-counted subscription + cachedSnapshot)
**Source:** `src/renderer/store/tagStore.ts` (full file), `src/renderer/store/removalStore.ts` (full file)
**Apply to:** `addStore.ts`
```typescript
let cachedSnapshot: { state: X; pendingJob: Y | null } = { state: currentState, pendingJob }
function getSnapshot() {
  if (cachedSnapshot.state !== currentState || cachedSnapshot.pendingJob !== pendingJob) {
    cachedSnapshot = { state: currentState, pendingJob }
  }
  return cachedSnapshot
}
```
This exact guard is mandatory — omitting it causes a React "Maximum update depth exceeded" crash (documented in both `tagStore.ts`'s file header and RESEARCH.md).

### Dispatcher error handling
**Source:** every `*Actions` object in `tagStore.ts`/`removalStore.ts`/`targetStore.ts`/`groupsStore.ts`
**Apply to:** all new store action dispatchers (`addStore.ts`, `targetStore.ts` additions)
```typescript
async actionName(...args): Promise<void> {
  try {
    const s = await client.method(...args)
    setState(s)
  } catch (err) {
    console.error('[storeName] actionName:', err)
  }
},
```

### IPC payload validation (main-process Zod gate)
**Source:** `src/main/ipc/severityChannels.ts` lines 30, 71-76; `src/main/ipc/templateChannels.ts` lines 61, 124-132
**Apply to:** `clipboardChannels.ts`, any `ADD_EXPORT_LOG` payload (none needed — no payload)
```typescript
const Schema = z.object({ field: z.enum([...]) }) // or z.string().min(1).max(N)
ipcMain.handle(CHANNEL, async (_event, payload: unknown) => {
  const { field } = Schema.parse(payload)
  // ...
})
```

### i18n namespace registration (3-file ritual)
**Source:** `src/renderer/i18n/index.ts` (import + resources object), `src/renderer/i18n/i18n.test.ts` (NAMESPACES array)
**Apply to:** `add.json` for both `en`/`cs`
Three required edits per new namespace: (1) static import in `index.ts`, (2) key in both `resources.en`/`resources.cs` objects, (3) add the namespace string to `i18n.test.ts`'s `NAMESPACES` const — all three are required; skipping (3) causes the Czech-completeness test to silently stop covering the new namespace (Pitfall 5).

### Pure-function exported helpers for unit testing (no jsdom)
**Source:** `src/renderer/wizard/tagValidation.ts`, `src/renderer/wizard/ReviewScreen.tsx`'s `computePlannedActions`/`computeActionableTagCount`
**Apply to:** `modeRules.ts` (`isActionableForMode`), `addValidation.ts` (`computeAddGroups`, `validateDmTemplate`), `src/shared/dmTemplate.ts` (`renderTemplate`)
All take a `TranslateFn = (key, options?) => string` with an identity-fallback default, require zero React/DOM, and are exported explicitly for `*.test.ts` files that run under `environment: 'node'` (no jsdom — confirmed in `vitest.config.ts`).

### Resume/Discard dialog shape
**Source:** `src/renderer/removal/TagResumeJobDialog.tsx` (full file)
**Apply to:** `AddResumeJobDialog.tsx`
`onOpenChange={() => {}}` no-op (CR-04: Escape/backdrop must not silently discard), `autoFocus` on Discard (safe default), non-destructive `variant="default"` on Resume (both Tag and Add are non-destructive, unlike Removal's destructive-variant resume).

### Avatar/initials/bytesToDataUrl helpers (intentional duplication)
**Source:** duplicated identically across `ReviewScreen.tsx` (lines 27-55), `GroupRow.tsx` (lines 26-63), `TargetCard.tsx` (lines 31-69)
**Apply to:** any new component rendering an avatar (none planned this phase, but note the convention if `DmTemplateEditor`/`ModeSwitch` ever needs one)
The codebase's own comments state this is intentional ("avoids premature abstraction per PATTERNS.md") — do not extract a shared util; copy the ~15-line block per new component that needs it.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/renderer/groups/modeRules.ts` | utility | transform | No existing file unifies a mode-parameterized actionability rule — this is the one net-new cross-cutting predicate Phase 15 introduces (two existing hard-coded call sites in `groupsStore.ts`/`GroupsPane.tsx` are being unified, not cloned) |
| `src/main/ipc/addChannels.ts`'s `ADD_EXPORT_LOG` handler | route | file-I/O | First use of `dialog.showSaveDialog` anywhere in this codebase — pattern sourced from 15-RESEARCH.md's Electron-docs-verified Code Examples, not a codebase analog |
| `clipboard:writeText` handler | route | request-response | First clipboard interaction anywhere in this codebase — pattern sourced from 15-RESEARCH.md's Electron-docs-verified Code Examples |

## Metadata

**Analog search scope:** `src/renderer/{store,ipc,groups,wizard,target,shell,removal,i18n}`, `src/main/{ipc,storage}`, `src/preload`, `src/shared`
**Files scanned:** 27 target files + ~20 analog source files read in full or by targeted section
**Pattern extraction date:** 2026-10-04
