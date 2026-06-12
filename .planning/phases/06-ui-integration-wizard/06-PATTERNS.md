# Phase 6: UI Integration — Wizard, Safety Gates & Progress - Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 11 new/modified files
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/renderer/wizard/ReviewScreen.tsx` | component | request-response | `src/renderer/removal/RemovalConfirmDialog.tsx` | exact |
| `src/renderer/wizard/StepIndicator.tsx` | component | transform | `src/renderer/shell/IdentityDisplay.tsx` | role-match |
| `src/renderer/wizard/wizardCopy.ts` | utility | transform | `src/renderer/removal/removalCopy.ts` | exact |
| `src/renderer/shell/AppShell.tsx` | component | event-driven | `src/renderer/shell/AppShell.tsx` (self — modify) | self |
| `src/renderer/groups/GroupsPane.tsx` | component | event-driven | `src/renderer/groups/GroupsPane.tsx` (self — modify) | self |
| `src/renderer/removal/removalCopy.ts` | utility | transform | `src/renderer/groups/groupsCopy.ts` | exact |
| `src/renderer/removal/RemovalConfirmDialog.tsx` | component | — | — (deleted) | N/A — retiring |
| `src/renderer/target/TargetCard.tsx` | component | event-driven | `src/renderer/target/TargetCard.tsx` (self — modify) | self |
| `src/shared/removalTypes.ts` | model | — | `src/shared/removalTypes.ts` (self — modify) | self |
| `src/shared/channels.ts` | config | — | `src/shared/channels.ts` (self — modify) | self |
| `src/main/ipc/severityChannels.ts` | middleware | request-response | `src/main/ipc/searchChannels.ts` | exact |
| `src/main/index.ts` | config | — | `src/main/index.ts` (self — modify) | self |
| `src/main/telegram/RemovalExecutor.ts` | service | event-driven | `src/main/telegram/RemovalExecutor.ts` (self — modify) | self |
| `tailwind.config.ts` | config | — | `tailwind.config.ts` (self — modify) | self |

---

## Pattern Assignments

### `src/renderer/wizard/ReviewScreen.tsx` (component, request-response)

**Analog:** `src/renderer/removal/RemovalConfirmDialog.tsx`

**Imports pattern** (lines 7–20):
```typescript
import React, { useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { removalActions } from '@renderer/store/removalStore'
import { useGroupsStore } from '@renderer/store/groupsStore'
import { useTargetStore } from '@renderer/store/targetStore'
import { removalCopy } from '../removal/removalCopy'
import { wizardCopy } from './wizardCopy'
```

**Avatar color + helper functions pattern** (RemovalConfirmDialog lines 26–63 — duplicate per PATTERNS.md):
```typescript
const AVATAR_COLORS = [
  '#E17076', '#FAA774', '#A695E7', '#7BC862',
  '#6EC9CB', '#65AADD', '#EE7AAE',
]

function getAvatarColor(seed: string): string {
  if (!seed) return AVATAR_COLORS[0]
  return AVATAR_COLORS[Number(BigInt(seed) % 7n)]
}

function bytesToDataUrl(bytes: Uint8Array | null): string | null {
  if (!bytes || bytes.length === 0) return null
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return `data:image/jpeg;base64,${btoa(binary)}`
}

function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}
```

**Identity block pattern** (RemovalConfirmDialog lines 126–148):
```typescript
<div className="flex items-center gap-2">
  <Avatar className="h-9 w-9 shrink-0">
    {avatarSrc ? <AvatarImage src={avatarSrc} alt={targetName} /> : null}
    <AvatarFallback style={{ backgroundColor: avatarBg }} className="text-white text-sm font-semibold">
      {initials}
    </AvatarFallback>
  </Avatar>
  <div className="flex flex-col min-w-0">
    <span className="text-label font-semibold truncate">{targetName}</span>
    <span className="text-label text-muted-foreground text-mono truncate">
      {targetUsername ? <><span>@{targetUsername}</span><span className="mx-1">·</span></> : null}
      <span>ID {targetId}</span>
    </span>
  </div>
</div>
```

Note: Use `text-mono` (globals.css utility) not `font-mono` (Tailwind default) on the identity line — Phase 5 typography advisory. The existing RemovalConfirmDialog uses `font-mono` which is the OLD pattern; ReviewScreen is the first file to apply the corrected `.text-mono` class.

**Confirm dispatch pattern** (RemovalConfirmDialog lines 92–99):
```typescript
const [isDispatching, setIsDispatching] = useState(false)

const handleConfirm = useCallback(async () => {
  setIsDispatching(true)
  try {
    await removalActions.startRemoval(severity, [...checkedDialogIds])
    setStage('run')   // advance wizard — prop callback from AppShell
  } finally {
    setIsDispatching(false)
  }
}, [severity, checkedDialogIds, setStage])
```

**Destructive button with dispatching state** (RemovalConfirmDialog lines 166–180):
```typescript
<Button
  variant="destructive"
  onClick={handleConfirm}
  disabled={isDispatching || actionableCount === 0}
  aria-label={wizardCopy.confirmAriaLabel(severity, targetName, actionableCount)}
>
  {isDispatching ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      {removalCopy.confirmDispatching}
    </>
  ) : (
    wizardCopy.confirmLabel(severity, targetName, actionableCount)
  )}
</Button>
```

**Dry-run computePlannedActions pure function** (from RESEARCH.md Pattern 2 — no existing analog):
```typescript
// Place as a named export from ReviewScreen.tsx for unit testing (no jsdom needed)
export type PlannedGroupAction = {
  dialog: AdminDialogDTO
  mechanic: 'editBanned' | 'restrict-then-unban' | 'deleteChatUser'
  mechanicNote: string
  warning: 'rejoin-cant-be-blocked' | null
}

export function computePlannedActions(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  severity: 'kick' | 'ban'
): PlannedGroupAction[] {
  return [...checkedIds]
    .map(id => dialogs.find(d => d.id === id))
    .filter((d): d is AdminDialogDTO => d !== undefined && d.canAct)
    .map(d => {
      const isBasic = d.type === 'basic-group'
      const mechanic = isBasic
        ? 'deleteChatUser'
        : severity === 'ban' ? 'editBanned' : 'restrict-then-unban'
      const warning = isBasic && severity === 'ban' ? 'rejoin-cant-be-blocked' : null
      return { dialog: d, mechanic, mechanicNote: wizardCopy.mechanicNote(d.type, severity), warning }
    })
}
```

Note: `AdminDialogDTO.type` is `'basic-group' | 'supergroup' | 'broadcast-channel'` (groupTypes.ts line 10). The check for basic group is `d.type === 'basic-group'` — not `'basicGroup'` (RESEARCH had a typo; use the actual codebase value).

**Severity segmented control pattern** (RESEARCH.md Pattern — no existing analog in repo; uses established Button + cn):
```typescript
<div className="flex rounded-md border border-border overflow-hidden">
  <Button
    role="radio"
    aria-checked={severity === 'kick'}
    variant={severity === 'kick' ? 'default' : 'ghost'}
    size="sm"
    className="rounded-none flex-1"
    onClick={() => onSeverityChange('kick')}
  >
    {wizardCopy.severityKick}
  </Button>
  <Button
    role="radio"
    aria-checked={severity === 'ban'}
    variant={severity === 'ban' ? 'default' : 'ghost'}
    size="sm"
    className="rounded-none flex-1 border-l border-border"
    onClick={() => onSeverityChange('ban')}
  >
    {wizardCopy.severityBan}
  </Button>
</div>
```

**ScrollArea group list pattern** (GroupsPane lines 479–503 — existing ScrollArea usage):
```typescript
<ScrollArea className="max-h-[40vh] border border-border rounded-md">
  <ul aria-label={wizardCopy.groupListAria}>
    {plannedActions.map(({ dialog, mechanicNote, warning }) => (
      <li key={dialog.id}
          className="px-4 py-2 border-b border-border last:border-b-0 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-label font-semibold text-foreground truncate">{dialog.title}</span>
          <span className="text-label text-muted-foreground shrink-0">
            {dialog.memberCount != null ? wizardCopy.memberCount(dialog.memberCount) : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {warning && <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />}
          <span className="text-label text-muted-foreground">{mechanicNote}</span>
        </div>
      </li>
    ))}
  </ul>
</ScrollArea>
```

**Section accessibility pattern** (from UI-SPEC — wrap with section + tabIndex focus on stage entry):
```typescript
const headingRef = useRef<HTMLHeadingElement>(null)

useEffect(() => {
  headingRef.current?.focus()
}, [])  // fires once on mount = once per stage entry

// ...
<section aria-labelledby="review-heading" className="max-w-2xl mx-auto px-4 pt-8 flex flex-col gap-6">
  <h2 id="review-heading" ref={headingRef} tabIndex={-1} className="text-heading font-semibold">
    {wizardCopy.reviewTitle}
  </h2>
  {/* ... */}
</section>
```

---

### `src/renderer/wizard/StepIndicator.tsx` (component, transform)

**Analog:** `src/renderer/shell/AppShell.tsx` (structural approach — slim strip below header) + UI-SPEC

**Imports pattern:**
```typescript
import React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { wizardCopy } from './wizardCopy'
```

**Core pattern** (non-interactive nav strip — UI-SPEC §Step indicator strip):
```typescript
type WizardStage = 'target' | 'groups' | 'review' | 'run' | 'report'

const STAGES: WizardStage[] = ['target', 'groups', 'review', 'run', 'report']

interface StepIndicatorProps {
  currentStage: WizardStage
}

export function StepIndicator({ currentStage }: StepIndicatorProps): React.JSX.Element {
  const currentIndex = STAGES.indexOf(currentStage)

  return (
    <nav
      aria-label={wizardCopy.stepIndicatorAria}
      className="px-4 py-2 border-b border-border bg-background shrink-0"
    >
      <ol className="flex items-center gap-1">
        {STAGES.map((stage, i) => {
          const isCurrent = stage === currentStage
          const isCompleted = i < currentIndex
          return (
            <React.Fragment key={stage}>
              <li>
                <span
                  className={cn(
                    'text-label',
                    isCurrent && 'text-foreground font-semibold',
                    (isCompleted) && 'text-muted-foreground',
                    (!isCurrent && !isCompleted) && 'text-muted-foreground/60'
                  )}
                  {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
                >
                  {wizardCopy.stageLabel[stage]}
                </span>
              </li>
              {i < STAGES.length - 1 && (
                <li aria-hidden="true">
                  <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                </li>
              )}
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
```

---

### `src/renderer/wizard/wizardCopy.ts` (utility, transform)

**Analog:** `src/renderer/removal/removalCopy.ts` (lines 1–141) — exact copy module pattern

**Core pattern** (removalCopy.ts lines 27–29 for plural helper, lines 39+ for object structure):
```typescript
// All user-facing strings for Phase 6 wizard (SAF-01/02/03).
// No hardcoded strings in components — i18n hygiene per ROADMAP Phase 8.
// Pattern: removalCopy.ts

import type { GroupType } from '@shared/groupTypes'

function s(n: number): string {
  return n === 1 ? '' : 's'
}

export const wizardCopy = {
  // --- Step indicator ---
  stepIndicatorAria: "Removal steps",
  stageLabel: {
    target: "Target",
    groups: "Groups",
    review: "Review",
    run: "Run",
    report: "Report",
  },

  // --- Review screen ---
  reviewTitle: "Review removal",
  severityLabel: "Action",
  severityKick: "Kick",
  severityBan: "Ban",

  // --- Confirm button ---
  confirmLabel(severity: 'kick' | 'ban', name: string, n: number): string {
    if (severity === 'ban') return `Ban ${name} from ${n} group${s(n)}`
    return `Kick ${name} from ${n} group${s(n)}`
  },
  confirmAriaLabel(severity: 'kick' | 'ban', name: string, n: number): string {
    return wizardCopy.confirmLabel(severity, name, n)
  },

  // --- Back navigation ---
  editSelection: "Edit selection",

  // --- Run trigger (GroupsPane toolbar) ---
  runTriggerLabel(n: number): string {
    return `Review removal of ${n} group${s(n)}`
  },
  runTriggerAria(n: number): string {
    return `Review removal of ${n} group${s(n)}`
  },

  // --- Totals line ---
  totalsRemoving(n: number): string {
    return `Removing from ${n} group${s(n)}`
  },
  totalsExcluded(n: number): string {
    return `${n} excluded (no removal rights)`
  },
  totalsCantBlock(n: number): string {
    return `${n} can't block rejoin`
  },
  totalsEmpty: "No groups selected — go back and check at least one group.",

  // --- Mechanic notes (dry-run) ---
  mechanicNote(type: GroupType, severity: 'kick' | 'ban'): string {
    if (type === 'basic-group') {
      if (severity === 'ban') return "Will be removed — rejoin can't be blocked in basic groups"
      return "Will be removed — can rejoin later"
    }
    if (severity === 'ban') return "Will be banned — can't rejoin until you unban them"
    return "Will be removed — can rejoin later"
  },

  // --- Group list ---
  memberCount(n: number): string {
    return `${n} member${s(n)}`
  },
  groupListAria: "Groups the target will be removed from",

  // --- Report stage ---
  removeSomeoneElse: "Remove someone else",
} as const
```

---

### `src/renderer/shell/AppShell.tsx` (component, event-driven — MODIFY)

**Self analog.** Current file: lines 1–53.

**Current structure** (lines 19–53) to extend:

Add `wizardStage` local state and stage-conditional rendering. Key pattern from RESEARCH.md (explicit state, never derived):

```typescript
// ADD after existing imports:
import { StepIndicator } from '../wizard/StepIndicator'
import { ReviewScreen } from '../wizard/ReviewScreen'
import { useRemovalStore } from '../store/removalStore'
import { useTargetStore } from '../store/targetStore'

// ADD after line 19 (inside AppShell function body):
type WizardStage = 'target' | 'groups' | 'review' | 'run' | 'report'
const [stage, setStage] = useState<WizardStage>('target')

// Resume flow: when pendingJob exists on mount, jump to 'run' after user confirms resume
// (ResumeJobDialog's onResume callback must call setStage('run'))

// Auto-advance run→report when removal reaches terminal state:
const { state: removal, pendingJob } = useRemovalStore()
useEffect(() => {
  if (
    stage === 'run' &&
    (removal.step === 'complete' || removal.step === 'stopped' || removal.step === 'hard-stopped')
  ) {
    setStage('report')
  }
}, [removal.step, stage])
```

**Stage-conditional layout** replaces the current `<main>` block (lines 34–50):

```typescript
<main className="flex flex-1 overflow-hidden">
  {stage === 'review' ? (
    <ReviewScreen
      severity={severity}
      onSeverityChange={handleSeverityChange}
      onConfirm={() => setStage('run')}
      onBack={() => setStage('groups')}
    />
  ) : (
    // Existing two-pane layout (target / groups / run / report stages)
    <>
      <div className="flex flex-col flex-[1] min-w-0 border-r border-border overflow-y-auto p-4">
        <TargetInput />
        <div className="mt-4">
          {search.step !== 'idle' && <CandidateList />}
          <TargetCard onTargetConfirmed={() => setStage('groups')} />
        </div>
      </div>
      <div className="flex flex-col flex-[2] min-w-0 overflow-hidden">
        <GroupsPane
          onNavigateToReview={() => setStage('review')}
          onNavigateToTarget={() => setStage('target')}
          stage={stage}
        />
      </div>
    </>
  )}
</main>
```

**Severity state (persisted via IPC):**
```typescript
const [severity, setSeverity] = useState<'kick' | 'ban'>('kick')  // default; rehydrated on mount

// On mount: read from electron-store via IPC
useEffect(() => {
  severityClient.getSeverity().then(setSeverity).catch(() => {})
}, [])

const handleSeverityChange = useCallback((s: 'kick' | 'ban') => {
  setSeverity(s)
  void severityClient.setSeverity(s)
}, [])
```

---

### `src/renderer/groups/GroupsPane.tsx` (component, event-driven — MODIFY)

**Self analog.** Current file: lines 1–529.

**Run-trigger change** (lines 443–465 — replace `setConfirmOpen(true)` with `props.onNavigateToReview()`):

```typescript
// BEFORE (line 449):
onClick={() => setConfirmOpen(true)}

// AFTER:
onClick={() => props.onNavigateToReview()}

// Label change: from removalCopy.runTriggerLabel('ban', ...) to wizardCopy.runTriggerLabel(...)
// Variant change: from variant="destructive" to variant="default"
// aria-label update: wizardCopy.runTriggerAria(checkedCount)
```

**Remove from GroupsPane** (lines 66, 514–524):
- Remove `const [confirmOpen, setConfirmOpen] = useState(false)` (line 66)
- Remove `<RemovalConfirmDialog ...>` block (lines 515–524)
- Remove import of `RemovalConfirmDialog` (line 23)

**FLOOD_WAIT subline in renderProgressSlot()** (insert after line 295 — the progress label span, inside the running/stopping block):

```typescript
// ADD inside the role="status" div, below the progress bar:
{removal.floodWaitRemaining != null && removal.floodWaitRemaining > 0 && (
  <span className="text-label text-muted-foreground flex items-baseline gap-1">
    {removalCopy.floodWaitSubline}
    <FloodCountdown remaining={removal.floodWaitRemaining} />
  </span>
)}
```

**Summary band structured counts** (lines 341–369 — modify to structured spans):

```typescript
// REPLACE the single summaryLine span with structured spans per count:
{summary && (
  <span className="text-label" role="status">
    {removalCopy.summaryLineParts({ ... }).map(({ label, count }, i, arr) => (
      <React.Fragment key={label}>
        <span className="font-semibold text-foreground">{count}</span>
        {' '}
        <span className="text-muted-foreground">{label}</span>
        {i < arr.length - 1 && <span className="text-muted-foreground"> · </span>}
      </React.Fragment>
    ))}
  </span>
)}
```

**"Remove someone else" button in summary band** (add to the complete/stopped band):

```typescript
// ADD to the summary band container: right-aligned button beside counts
<Button
  variant="outline"
  size="sm"
  onClick={async () => {
    await targetActions.resetTarget()
    props.onNavigateToTarget()
  }}
>
  {wizardCopy.removeSomeoneElse}
</Button>
```

**gap-0.5 fix** (line 344): change `gap-0.5` to `gap-1`.

**Add FloodCountdown import:**
```typescript
import FloodCountdown from '../auth/FloodCountdown'
```

---

### `src/renderer/removal/removalCopy.ts` (utility, transform — MODIFY)

**Self analog.** Current file: lines 1–141.

**summaryLine → structured parts** (lines 121–128 — add new function, keep old for backwards compat or replace):

```typescript
// ADD after existing summaryLine():
summaryLineParts(counts: { removed: number; alreadyGone: number; failed: number; skipped: number }): Array<{ label: string; count: number }> {
  const parts: Array<{ label: string; count: number }> = []
  if (counts.removed > 0) parts.push({ count: counts.removed, label: 'Removed' })
  if (counts.alreadyGone > 0) parts.push({ count: counts.alreadyGone, label: 'Already gone' })
  if (counts.failed > 0) parts.push({ count: counts.failed, label: 'Failed' })
  if (counts.skipped > 0) parts.push({ count: counts.skipped, label: 'Skipped' })
  return parts
},
```

**floodWaitSubline** (line 86 — already defined, no change to value, just goes live in GroupsPane rendering).

**runTriggerLabel** (lines 65–68 — update copy to match new wizard navigation role):
```typescript
// The old label had "…" (ellipsis) and used severity. New label is wizard-navigation copy:
// Keep the existing function signature; GroupsPane now calls wizardCopy.runTriggerLabel() instead.
// The removalCopy.runTriggerLabel can be kept for legacy reference or deprecated.
```

---

### `src/renderer/target/TargetCard.tsx` (component, event-driven — MODIFY)

**Self analog.** Current file: lines 1–260.

**Wire stage advance on target confirm** (lines 246–253):

```typescript
// BEFORE:
onClick={() => void targetActions.confirmTarget()}

// AFTER: TargetCard receives an optional onTargetConfirmed prop
interface TargetCardProps {
  onTargetConfirmed?: () => void
}

// Inside confirm button onClick:
onClick={async () => {
  await targetActions.confirmTarget()
  props.onTargetConfirmed?.()
}}
```

No visual changes to TargetCard itself.

---

### `src/shared/removalTypes.ts` (model — MODIFY)

**Self analog.** Current file: lines 1–119.

**Add floodWaitRemaining to RemovalState** (after line 84 `currentGroupId?: string`):

```typescript
// ADD to RemovalState interface (line 85, after currentGroupId):
/**
 * Seconds remaining in an active FLOOD_WAIT during a removal run.
 * Null when no flood wait is active. Only meaningful when step === 'running'.
 * Scoped to removal-only flood events — NOT from the shared OP_GOVERNOR_EVENT channel.
 */
floodWaitRemaining?: number | null
```

Note: The existing `cachedSnapshot` identity check in `removalStore.ts` line 93 (`cachedSnapshot.state !== currentState`) handles this new field automatically via object reference identity — no store changes needed beyond adding the type.

---

### `src/shared/channels.ts` (config — MODIFY)

**Self analog.** Current file: lines 1–96.

**Add severity channels** (after line 57, before CHANNELS object):

```typescript
// Severity preference IPC channels (Phase 6, electron-store pref).
// Non-secret; Zod-validated (z.enum(['kick','ban'])) in severityChannels.ts.
export const SEVERITY_GET = 'severity:get' as const
export const SEVERITY_SET = 'severity:set' as const // { severity: 'kick' | 'ban' }
```

**Add to CHANNELS namespace object** (lines 60–95):
```typescript
SEVERITY_GET,
SEVERITY_SET,
```

**Add to preload/index.ts** (after line 156):
```typescript
getSeverity: (): Promise<'kick' | 'ban'> =>
  ipcRenderer.invoke(SEVERITY_GET) as Promise<'kick' | 'ban'>,
setSeverity: (severity: 'kick' | 'ban'): Promise<'kick' | 'ban'> =>
  ipcRenderer.invoke(SEVERITY_SET, { severity }) as Promise<'kick' | 'ban'>,
```

---

### `src/main/ipc/severityChannels.ts` (middleware, request-response — NEW)

**Analog:** `src/main/ipc/searchChannels.ts` (lines 1–137) — exact IPC handler pattern

**Full file pattern** (modeled on searchChannels.ts structure):

```typescript
/**
 * IPC handler registrations for severity preference (kick/ban) persistence.
 * Stores preference in electron-store (main process only).
 * Renderer accesses via SEVERITY_GET / SEVERITY_SET channels.
 *
 * Security: non-secret preference — plain JSON store (NOT safeStorage).
 * Validation: z.enum(['kick','ban']) rejects any value not in the enum.
 * ESM/CJS: uses dynamic await import('electron-store') to handle ESM-only pkg in CJS main.
 */

import { ipcMain } from 'electron'
import { z } from 'zod'
import { SEVERITY_GET, SEVERITY_SET } from '@shared/channels'

const SeveritySchema = z.object({ severity: z.enum(['kick', 'ban']) })

type SeverityStore = import('electron-store').default<{ severity: 'kick' | 'ban' }>
let _store: SeverityStore | null = null

async function getStore(): Promise<SeverityStore> {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store<{ severity: 'kick' | 'ban' }>({ defaults: { severity: 'kick' } })
  }
  return _store
}

export function registerSeverityChannels(): void {
  ipcMain.handle(SEVERITY_GET, async () => {
    const store = await getStore()
    return store.get('severity', 'kick')
  })

  ipcMain.handle(SEVERITY_SET, async (_event, payload: unknown) => {
    const { severity } = SeveritySchema.parse(payload)
    const store = await getStore()
    store.set('severity', severity)
    return severity
  })
}
```

Key patterns from searchChannels.ts:
- `ipcMain.handle()` for request/response (lines 84, 94, 99, 108)
- Zod parse with throw on invalid (lines 85, 109)
- No `win` parameter needed (no push events for severity)
- Register function exported and called from `main/index.ts`

---

### `src/main/index.ts` (config — MODIFY)

**Self analog.** Current file: lines 1–311.

**Registration pattern** (lines 192–273 — existing channel registrations to copy from):

```typescript
// ADD import at top (after existing registerRemovalChannels import):
import { registerSeverityChannels } from './ipc/severityChannels'

// ADD near end of app.whenReady() block (after line 273):
registerSeverityChannels()
```

The `registerSeverityChannels()` call requires no arguments (store is lazily initialized inside the module) — simpler than other registrations.

---

### `src/main/telegram/RemovalExecutor.ts` (service, event-driven — MODIFY)

**Self analog.** Current file: see lines 1–200+ above.

**FLOOD_WAIT plumbing — critical finding:** The governor's `run()` method does NOT accept a per-call `onEvent` callback (governor.ts line 100: `run<T>(fn: () => Promise<T>): Promise<T>`). The `onEvent` is constructor-level only (governor.ts line 88). This means flood events during removal run through the shared `OP_GOVERNOR_EVENT` path in `main/index.ts`.

**Correct approach** (scoped to removal, not shared OP_GOVERNOR_EVENT channel): Wrap the per-group governor call with a temporary `onEvent` interception by subclassing or wrapping the governor. The simplest option consistent with RESEARCH Pitfall 6 guidance is to add a per-run flag and intercept the governor's constructor-level `onEvent` during the removal run:

```typescript
// In RemovalExecutor constructor options, the governor's onEvent is already wired to
// currentWin.webContents.send(OP_GOVERNOR_EVENT, event) in main/index.ts.
// To capture flood events scoped to removal runs WITHOUT subscribing to OP_GOVERNOR_EVENT
// in the renderer, RemovalExecutor must own the emission path.
//
// Approach: Add a per-run flood-tick subscriber on the governor (requires governor API change),
// OR wire RemovalExecutor to accept a local onFloodTick callback in its options,
// OR (simplest, no governor API change) emit floodWaitRemaining in a parallel state channel.
//
// Simplest: Add onFloodTick callback to RemovalExecutorOptions, call it from execute()
// using the governor's existing flood events by subscribing the per-run callback in the
// governor via a wrapper around the existing onEvent:

// In main/index.ts, wire the governor's onEvent to also call executor._onGovernorFloodTick
// when in a running state:
const governor = new RateLimitGovernor({
  client: ...,
  onEvent: (event: GovernorEvent) => {
    // Existing: push to renderer
    if (!currentWin.isDestroyed()) {
      currentWin.webContents.send(OP_GOVERNOR_EVENT, event)
    }
    // NEW: forward flood-tick to executor when it is the active consumer
    if (event.type === 'flood-tick' || event.type === 'hard-stop') {
      executor._handleGovernorEvent(event)
    }
  },
})
```

**Add to RemovalExecutor class:**
```typescript
// New field: tracks whether a run is active for flood-tick scoping
private _runActive = false

// New public method called from main/index.ts governor.onEvent:
_handleGovernorEvent(event: GovernorEvent): void {
  if (!this._runActive) return  // ignore flood events not during a removal run
  if (event.type === 'flood-tick') {
    this._emit({ ...this._currentState, floodWaitRemaining: event.remaining })
  } else if (event.type === 'hard-stop') {
    this._emit({ ...this._currentState, floodWaitRemaining: null })
  }
}

// In execute(): set _runActive = true at start, false at end
async execute(params: ...): Promise<void> {
  this._runActive = true
  // ... existing execute logic ...
  // Before each emit in terminal states (complete/stopped/hard-stopped):
  this._runActive = false
  this._emit({ ...state, floodWaitRemaining: null })
}
```

**Reset floodWaitRemaining after each group** (in the per-group loop, after `governor.run()` resolves):
```typescript
// After each group's governor.run() call resolves (whether success or failure):
this._emit({ ...this._currentState, floodWaitRemaining: null })
```

---

### `tailwind.config.ts` (config — MODIFY)

**Self analog.** Current file: lines 1–63.

**fontFamily.mono alias fix** (line 12 — already correct value, just confirming it matches `.text-mono` stack):

```typescript
// CURRENT (line 12):
mono: ['ui-monospace', '"SF Mono"', '"Cascadia Mono"', 'Menlo', 'monospace'],

// The globals.css .text-mono utility uses the same stack. These now converge.
// No change needed to the value — the stacks already match.
// The "fix" is that font-mono and .text-mono now both apply the same fonts.
// New Phase 6 code should use className="text-mono" (globals.css utility)
// for explicit alignment with the spec intent.
```

---

## Shared Patterns

### Avatar color + byte conversion helpers
**Source:** `src/renderer/removal/RemovalConfirmDialog.tsx` lines 26–63
**Apply to:** `ReviewScreen.tsx`
**Pattern:** Duplicate (per established PATTERNS.md precedent — avoids premature abstraction). The three helpers (`AVATAR_COLORS`, `getAvatarColor`, `bytesToDataUrl`, `getInitials`) are already duplicated across TargetCard.tsx, RemovalConfirmDialog.tsx, and GroupRow.tsx. ReviewScreen copies from RemovalConfirmDialog.tsx verbatim (same 36px `h-9 w-9` avatar size).

### IPC channel handler registration (main process)
**Source:** `src/main/ipc/searchChannels.ts` lines 73–123
**Apply to:** `src/main/ipc/severityChannels.ts`
**Pattern:** `registerXChannels()` export → called in `main/index.ts` → `ipcMain.handle()` with Zod parse + gate logic + fire-or-return.

### Renderer IPC client module
**Source:** `src/renderer/ipc/removalClient.ts` lines 1–48
**Apply to:** New `src/renderer/ipc/severityClient.ts` (thin wrapper over `window.mrsproper`)
**Pattern:** Interface merging via `declare global { interface MrsProperApi { ... } }` + named export of client object.

### useSyncExternalStore store module
**Source:** `src/renderer/store/removalStore.ts` lines 1–167
**Apply to:** No new stores needed for Phase 6 — severity lives in AppShell local state. No new store module required.

### copy module structure
**Source:** `src/renderer/removal/removalCopy.ts` lines 1–141
**Apply to:** `src/renderer/wizard/wizardCopy.ts`
**Pattern:** `export const xCopy = { ... } as const` — typed methods + plain strings — `s(n)` plural helper — no hardcoded strings in components.

### Destructive confirm button with dispatching state
**Source:** `src/renderer/removal/RemovalConfirmDialog.tsx` lines 90–99, 166–180
**Apply to:** `ReviewScreen.tsx` confirm button
**Pattern:** `useState(false)` for `isDispatching` + `setIsDispatching(true)` in try + Loader2 spinner during dispatch + `disabled={isDispatching}`.

### role="status" aria-live progress region
**Source:** `src/renderer/groups/GroupsPane.tsx` line 274: `<div ... role="status" aria-live="polite">`
**Apply to:** FLOOD_WAIT subline in GroupsPane (already inside the `role="status"` region — no change to wrapper needed), Report stage summary band.

### Stage-conditional rendering without router
**Source:** `src/renderer/App.tsx` (auth vs app shell conditional)
**Apply to:** `AppShell.tsx` wizard stage branches
**Pattern:** Local `useState` for stage variable → JSX conditional (`stage === 'review' ? <ReviewScreen /> : <TwoPaneLayout />`) rather than routing or global store.

---

## No Analog Found

All files have analogs or are self-modifications. No files require research-only pattern references.

---

## Critical Caveats for Planner

### 1. Governor `run()` has no per-call onEvent
`governor.run()` signature (governor.ts line 100): `run<T>(fn: () => Promise<T>): Promise<T>` — no options param. Flood events flow through the constructor-level `this._onEvent` only. The RESEARCH.md Pattern 3 example showing a per-call `onEvent` callback is **incorrect** for the actual codebase. The correct approach is forwarding through `main/index.ts` governor `onEvent` → `executor._handleGovernorEvent()` with a `_runActive` flag to scope it. See RemovalExecutor pattern assignment above.

### 2. AdminDialogDTO.type values
`groupTypes.ts` line 10: `'basic-group' | 'supergroup' | 'broadcast-channel'` — NOT `'basicGroup'`. The RESEARCH.md example used camelCase incorrectly. `computePlannedActions` must check `d.type === 'basic-group'`.

### 3. font-mono vs text-mono
Current codebase uses `font-mono` in RemovalConfirmDialog (line 139) and TargetCard (lines 169, 177). ReviewScreen must use `text-mono` (globals.css utility). The tailwind.config.ts already has matching stack values so `font-mono` and `text-mono` render identically — but new Phase 6 code standardizes on `text-mono`.

### 4. RemovalConfirmDialog deletion is atomic with ReviewScreen addition
GroupsPane currently renders `<RemovalConfirmDialog>` (lines 515–524) and maintains `confirmOpen` state (line 66). The removal of both and the addition of `props.onNavigateToReview()` to the run-trigger must land in the same commit to prevent a double-confirm gate (RESEARCH Pitfall 3).

### 5. electron-store ESM/CJS
Use `async function getStore()` with `await import('electron-store')` pattern (RESEARCH Pitfall 1). Do not use static `import Store from 'electron-store'` or `require('electron-store')` in the main process. The lazy factory pattern in the severityChannels.ts assignment above is the correct approach.

---

## Metadata

**Analog search scope:** `src/renderer/`, `src/main/ipc/`, `src/shared/`, `src/preload/`
**Files scanned:** 28 TypeScript source files read in full
**Pattern extraction date:** 2026-06-12
