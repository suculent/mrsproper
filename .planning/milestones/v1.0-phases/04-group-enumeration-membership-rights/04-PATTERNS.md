# Phase 4: Group Enumeration, Membership & Rights - Pattern Map

**Mapped:** 2026-06-11
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/main/telegram/GroupEnumerator.ts` | service | request-response + event-driven | `src/main/telegram/TargetResolver.ts` | exact |
| `src/main/telegram/MembershipScanner.ts` | service | streaming + event-driven | `src/main/telegram/TargetResolver.ts` | exact |
| `src/main/ipc/groupChannels.ts` | middleware | request-response + event push | `src/main/ipc/targetChannels.ts` | exact |
| `src/shared/groupTypes.ts` | model | — | `src/shared/targetTypes.ts` | exact |
| `src/shared/channels.ts` | config | — | `src/shared/channels.ts` (augment) | exact |
| `src/renderer/ipc/groupsClient.ts` | utility | request-response | `src/renderer/ipc/targetClient.ts` | exact |
| `src/renderer/store/groupsStore.ts` | store | event-driven | `src/renderer/store/targetStore.ts` | exact |
| `src/renderer/components/ui/checkbox.tsx` | component | — | `src/renderer/components/ui/badge.tsx` | role-match |
| `src/renderer/components/ui/scroll-area.tsx` | component | — | `src/renderer/components/ui/avatar.tsx` | role-match |
| `src/renderer/groups/GroupsPane.tsx` | component | event-driven | `src/renderer/target/TargetCard.tsx` | role-match |
| `src/renderer/groups/GroupRow.tsx` | component | — | `src/renderer/target/TargetCard.tsx` | role-match |
| `src/renderer/groups/groupsCopy.ts` | utility | — | `src/renderer/target/resolveCopy.ts` | exact |
| `src/renderer/shell/AppShell.tsx` | component | — | `src/renderer/shell/AppShell.tsx` (modify) | exact |
| `src/main/index.ts` | config | — | `src/main/index.ts` (modify) | exact |
| `src/main/telegram/__mocks__/telegramClient.ts` | test | — | `src/main/telegram/__mocks__/telegramClient.ts` (augment) | exact |
| `src/main/telegram/groupEnumerator.test.ts` | test | — | `src/main/telegram/targetResolver.test.ts` | exact |
| `src/main/telegram/membershipScanner.test.ts` | test | — | `src/main/telegram/targetResolver.test.ts` | exact |
| `src/main/ipc/groupChannels.test.ts` | test | — | `src/main/ipc/targetChannels.test.ts` | exact |
| `src/renderer/auth/CountryPicker.tsx` | component | — | `src/renderer/auth/CountryPicker.tsx` (modify) | exact |

---

## Pattern Assignments

### `src/main/telegram/GroupEnumerator.ts` (service, request-response + event-driven)

**Analog:** `src/main/telegram/TargetResolver.ts`

**Imports pattern** (lines 28-33):
```typescript
import { Api } from 'telegram'
import type { BigInteger } from 'big-integer'
import type { GroupsState, AdminDialogDTO, GroupErrorCode } from '@shared/groupTypes'
import { RateLimitGovernor } from './governor'
import { classifyRpcError } from './operationErrors'
```

**Constructor options and DI pattern** (lines 49-100):
```typescript
export interface GroupEnumeratorClient {
  invoke(request: unknown): Promise<unknown>
  getDialogs(params?: unknown): Promise<unknown[]>
  downloadProfilePhoto(entity: unknown): Promise<Buffer | Uint8Array | null>
}

export interface GroupEnumeratorOptions {
  client: GroupEnumeratorClient
  onStateChange: (state: GroupsState) => void
  governor: RateLimitGovernor   // REQUIRED — must be the shared account-wide instance
}

export class GroupEnumerator {
  private readonly _client: GroupEnumeratorClient
  private readonly _governor: RateLimitGovernor
  private readonly _emit: (state: GroupsState) => void
  private _currentState: GroupsState = { step: 'idle' }
  // Internal map: dialogId (string) → dialog entity (for membership scanner)
  // accessHash of channel peers stored here, NEVER in DTO (mirrors T-03-01)
  private _dialogMap: Map<string, unknown> = new Map()

  constructor(options: GroupEnumeratorOptions) {
    this._client = options.client
    this._governor = options.governor
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
  }
```

**Core enumeration pattern** — mirrors `resolve()` in TargetResolver.ts (lines 119-146):
```typescript
async enumerateAtLogin(): Promise<void> {
  this._emit({ step: 'loading' })
  try {
    // See RESEARCH Pitfall 2: getDialogs() in a single governor slot is acceptable
    // at login (before any other operation). Document the trade-off explicitly.
    const dialogs = await this._governor.run(() =>
      this._client.getDialogs({ ignoreMigrated: true })
    ) as Array<{ entity?: unknown; inputEntity?: unknown }>

    const adminDialogs: AdminDialogDTO[] = []
    for (const dialog of dialogs) {
      const classified = this._classifyDialog(dialog)
      if (!classified) continue   // DM, unknown type — skip
      adminDialogs.push(classified)
    }

    this._emit({ step: 'loaded', dialogs: adminDialogs })
  } catch (err) {
    const classified = classifyRpcError(err)
    this._emit({ step: 'error', code: classified.code as GroupErrorCode })
  }
}
```

**Type classification pattern** — from RESEARCH Pattern 1:
```typescript
private _classifyDialog(dialog: unknown): AdminDialogDTO | null {
  const entity = (dialog as { entity?: unknown }).entity
  if (!entity) return null

  // RESEARCH Pattern 1: instanceof is the reliable discriminator
  // dialog.isGroup is true for BOTH basic groups AND supergroups — do NOT use it alone
  if (entity instanceof Api.Chat) {
    const canAct = entity.creator === true || entity.adminRights?.banUsers === true
    // RESEARCH OQ-2: OR logic — creator OR promoted admin with banUsers
    return this._buildDTO(dialog, entity, 'basic-group', canAct,
      canAct ? null : 'not-creator')
  }
  if (entity instanceof Api.Channel) {
    if (!entity.megagroup) {
      // Broadcast channel — members can never be removed (RESEARCH anti-pattern)
      return this._buildDTO(dialog, entity, 'broadcast-channel', false, 'broadcast-channel')
    }
    const canAct = entity.adminRights?.banUsers === true
    return this._buildDTO(dialog, entity, 'supergroup', canAct,
      canAct ? null : 'no-ban-right')
  }
  return null
}
```

**Avatar fetch pattern** — matches `_fetchAvatar` in TargetResolver.ts (lines 331-343):
```typescript
private async _fetchAvatar(entity: unknown): Promise<Uint8Array | null> {
  try {
    const photoBuffer = await this._governor.run(() =>
      this._client.downloadProfilePhoto(entity)
    )
    if (photoBuffer && (photoBuffer as Buffer | Uint8Array).length > 0) {
      return new Uint8Array(photoBuffer as Buffer | Uint8Array)
    }
    return null
  } catch {
    return null  // RESEARCH Pitfall 5: graceful degradation — show initials instead
  }
}
```

**State getter and refresh pattern** — mirrors `getState()` in TargetResolver.ts:
```typescript
getState(): GroupsState {
  return this._currentState
}

// D-14: manual refresh — re-run enumeration, replace cached state
async refresh(): Promise<void> {
  this._dialogMap.clear()
  await this.enumerateAtLogin()
}

// For MembershipScanner: return the dialog entity by id (main-only, never IPC)
getDialogEntity(dialogId: string): unknown | null {
  return this._dialogMap.get(dialogId) ?? null
}
```

---

### `src/main/telegram/MembershipScanner.ts` (service, streaming + event-driven)

**Analog:** `src/main/telegram/TargetResolver.ts`

**Imports pattern**:
```typescript
import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { ScanState, ScanProgressDTO, MembershipResultDTO, GroupErrorCode } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import { classifyRpcError } from './operationErrors'
import type { GroupEnumerator } from './GroupEnumerator'
import type { TargetResolver } from './TargetResolver'
```

**Constructor + generation token** — mirrors TargetResolver.ts (lines 83-100):
```typescript
export class MembershipScanner {
  private readonly _governor: RateLimitGovernor
  private readonly _emit: (state: ScanState) => void
  private readonly _enumerator: GroupEnumerator
  private readonly _resolver: TargetResolver
  private _currentState: ScanState = { step: 'idle' }
  // WR-03 generation token: incremented by every scan() call so abortScan()
  // and newer scan() calls invalidate in-flight work from older scans (D-15)
  private _generation = 0
  private _abortController: AbortController | null = null

  constructor(options: MembershipScannerOptions) {
    this._governor = options.governor
    this._enumerator = options.enumerator
    this._resolver = options.resolver
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
  }
```

**Core scan loop** — governor-wrapped, streaming results, mirrors TargetResolver resolve():
```typescript
async scan(): Promise<void> {
  // D-15: always re-run on every target confirm — no caching
  const gen = ++this._generation
  this._abortController = new AbortController()

  const resolved = this._resolver.getResolvedUser()
  if (!resolved) {
    this._emit({ step: 'error', code: 'UNKNOWN' })
    return
  }

  // RESEARCH Pattern 4: InputPeerUser from TargetResolver.getResolvedUser()
  // accessHash MUST come from main-side resolver — NEVER from renderer payload
  const inputUser = new Api.InputPeerUser({
    userId: bigInt(resolved.id.toString()),
    accessHash: bigInt(resolved.accessHash.toString()),
  })

  const groupsState = this._enumerator.getState()
  if (groupsState.step !== 'loaded') {
    this._emit({ step: 'error', code: 'UNKNOWN' })
    return
  }

  const dialogs = groupsState.dialogs
  const results: MembershipResultDTO[] = []
  let checked = 0

  this._emit({ step: 'scanning', progress: { checked: 0, total: dialogs.length }, results: [] })

  for (const dialog of dialogs) {
    if (gen !== this._generation) return  // WR-03: aborted or superseded
    if (this._abortController.signal.aborted) return

    try {
      const isMember = await this._checkMembership(dialog, inputUser)
      results.push({ dialogId: dialog.id, status: isMember ? 'member' : 'not-member' })
    } catch (err) {
      results.push({ dialogId: dialog.id, status: 'failed' })
    }

    checked++
    this._emit({
      step: 'scanning',
      progress: { checked, total: dialogs.length },
      results: [...results],
    })
  }

  if (gen !== this._generation) return
  this._emit({ step: 'complete', results })
}
```

**Per-group membership check** — RESEARCH Pattern 2 + 3:
```typescript
private async _checkMembership(
  dialog: AdminDialogDTO,
  inputUser: Api.InputPeerUser
): Promise<boolean> {
  const entity = this._enumerator.getDialogEntity(dialog.id)

  if (entity instanceof Api.Chat) {
    // RESEARCH Pattern 3: basic groups — full participant list
    const full = await this._governor.run(() =>
      this._client.invoke(new Api.messages.GetFullChat({ chatId: bigInt(dialog.id) }))
    ) as { fullChat: Api.TypeChatFull }
    if (full.fullChat instanceof Api.ChatFull) {
      const ps = full.fullChat.participants
      if (ps instanceof Api.ChatParticipants) {
        return ps.participants.some(
          (p) => (p as { userId?: { toString(): string } }).userId?.toString() === dialog.id
        )
      }
    }
    return false
  }

  if (entity instanceof Api.Channel) {
    // RESEARCH Pattern 2: supergroups/channels — single targeted RPC (O(1) calls)
    const inputChannel = (entity as unknown as { inputEntity: unknown }).inputEntity
    try {
      const result = await this._governor.run(() =>
        this._client.invoke(new Api.channels.GetParticipant({
          channel: inputChannel,
          participant: inputUser,
        }))
      ) as { participant: Api.TypeChannelParticipant }
      const p = result.participant
      // RESEARCH Pitfall 1: Left/Banned without error → not an active member
      if (p instanceof Api.ChannelParticipantLeft) return false
      if (p instanceof Api.ChannelParticipantBanned) return false
      return true
    } catch (err) {
      const classified = classifyRpcError(err)
      if (classified.code === 'USER_NOT_PARTICIPANT') return false
      throw err
    }
  }
  return false
}
```

**Abort and retry** — mirrors reset() in TargetResolver.ts:
```typescript
abortScan(): void {
  this._generation++
  this._abortController?.abort()
  this._emit({ step: 'idle' })
}

async retryGroup(dialogId: string): Promise<void> {
  // Re-check a single failed group; emit updated results
  // (implementation follows same governor.run + _checkMembership pattern)
}

getState(): ScanState {
  return this._currentState
}
```

---

### `src/main/ipc/groupChannels.ts` (middleware, request-response + push)

**Analog:** `src/main/ipc/targetChannels.ts` — copy structure verbatim, change service references.

**File header + imports** (lines 1-30 of targetChannels.ts):
```typescript
/**
 * IPC handler registrations for group enumeration and membership scan.
 *
 * Security:
 *   - Every inbound IPC payload is Zod-validated BEFORE delegating to services.
 *   - dialogId in scan:retryGroup validated against known dialog list (T-04).
 *   - No accessHash in any DTO (GroupEnumerator internal map only).
 *   - scan:start carries NO target data — MembershipScanner reads from TargetResolver in main.
 */
import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { GroupEnumerator } from '../telegram/GroupEnumerator'
import type { MembershipScanner } from '../telegram/MembershipScanner'
import {
  GROUPS_GET_STATE, GROUPS_STATE, GROUPS_REFRESH,
  SCAN_START, SCAN_ABORT, SCAN_RETRY_GROUP, SCAN_STATE, SCAN_GET_STATE,
} from '@shared/channels'
import type { GroupsState, ScanState } from '@shared/groupTypes'
```

**Zod schema pattern** — matches targetChannels.ts lines 39-41:
```typescript
// Validate dialogId for retry — must be a non-empty string matching known dialog list
const RetryGroupSchema = z.object({
  dialogId: z.string().min(1).max(32),  // Telegram IDs fit comfortably in 32 chars
})
```

**Handler registration pattern** — copy exactly from targetChannels.ts lines 60-87:
```typescript
export function registerGroupChannels(
  win: BrowserWindow,
  enumerator: GroupEnumerator,
  scanner: MembershipScanner
): void {
  void win  // used via emitGroupsState / emitScanState

  ipcMain.handle(GROUPS_GET_STATE, () => enumerator.getState())

  ipcMain.handle(GROUPS_REFRESH, async () => {
    await enumerator.refresh()
    return enumerator.getState()
  })

  ipcMain.handle(SCAN_START, async () => {
    await scanner.scan()
    return scanner.getState()
  })

  ipcMain.handle(SCAN_ABORT, () => {
    scanner.abortScan()
    return scanner.getState()
  })

  ipcMain.handle(SCAN_GET_STATE, () => scanner.getState())

  ipcMain.handle(SCAN_RETRY_GROUP, async (_event, payload: unknown) => {
    const parsed = RetryGroupSchema.parse(payload)
    // Security: validate dialogId is in known list before any API call
    const state = enumerator.getState()
    if (state.step !== 'loaded') throw new Error('Groups not loaded')
    const known = state.dialogs.find((d) => d.id === parsed.dialogId)
    if (!known) throw new Error('Unknown dialogId')
    await scanner.retryGroup(parsed.dialogId)
  })
}
```

**Push emitter pattern** — copy exactly from targetChannels.ts lines 96-100:
```typescript
export function emitGroupsState(win: BrowserWindow, state: GroupsState): void {
  if (!win.isDestroyed()) {   // RESEARCH Pitfall 6: always gate on isDestroyed()
    win.webContents.send(GROUPS_STATE, state)
  }
}

export function emitScanState(win: BrowserWindow, state: ScanState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(SCAN_STATE, state)
  }
}
```

---

### `src/shared/groupTypes.ts` (model)

**Analog:** `src/shared/targetTypes.ts`

**File structure** — copy header comment and union pattern (lines 1-4):
```typescript
// Shared types imported by both main and renderer.
// Single source of truth for group enumeration state, IPC DTOs, and error codes.
// Phase 4 plans implement against these exact shapes.
// Modeled exactly on src/shared/targetTypes.ts.
```

**DTO and state union pattern** — copy from RESEARCH Pattern 6 verbatim; the shapes are already finalised in RESEARCH.md §Pattern 6. Key alignment with targetTypes.ts:
- `GroupErrorCode` mirrors `TargetErrorCode` — typed union of string literals
- `GroupsState` and `ScanState` are discriminated unions like `TargetState`
- `AdminDialogDTO` mirrors `ResolvedTargetDTO` — `id: string` (bigint.toString()), `avatar: Uint8Array | null`
- `accessHash` is intentionally absent from `AdminDialogDTO` (T-03-01 equivalent for channels)

---

### `src/shared/channels.ts` (config — augmentation)

**Analog:** `src/shared/channels.ts` (existing file to extend)

**Augmentation pattern** — append after TARGET_STATE block (lines 24-28), following the same `as const` style:
```typescript
// Group enumeration and membership scan IPC channels (Phase 4).
// Pattern mirrors the TARGET_* block directly above.
export const GROUPS_GET_STATE = 'groups:getState' as const
export const GROUPS_STATE = 'groups:state' as const      // push: main → renderer
export const GROUPS_REFRESH = 'groups:refresh' as const

export const SCAN_START = 'scan:start' as const
export const SCAN_ABORT = 'scan:abort' as const
export const SCAN_RETRY_GROUP = 'scan:retryGroup' as const
export const SCAN_STATE = 'scan:state' as const          // push: main → renderer
export const SCAN_GET_STATE = 'scan:getState' as const
```

Also add all new constants to the `CHANNELS` namespace object at lines 30-45.

---

### `src/renderer/ipc/groupsClient.ts` (utility, request-response)

**Analog:** `src/renderer/ipc/targetClient.ts` — copy verbatim, swap types.

**Interface augmentation pattern** (lines 10-18 of targetClient.ts):
```typescript
// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface (standard interface merging across authClient / targetClient).
declare global {
  interface MrsProperApi {
    getGroupsState(): Promise<GroupsState>
    refreshGroups(): Promise<GroupsState>
    onGroupsState(cb: (s: GroupsState) => void): () => void
    startScan(): Promise<ScanState>
    abortScan(): Promise<void>
    retryScanGroup(dialogId: string): Promise<void>
    getScanState(): Promise<ScanState>
    onScanState(cb: (s: ScanState) => void): () => void
  }
}
```

**Client object pattern** (lines 21-45 of targetClient.ts):
```typescript
export const groupsClient = {
  getGroupsState(): Promise<GroupsState> {
    return window.mrsproper.getGroupsState()
  },
  refreshGroups(): Promise<GroupsState> {
    return window.mrsproper.refreshGroups()
  },
  onGroupsState(cb: (s: GroupsState) => void): () => void {
    return window.mrsproper.onGroupsState(cb)
  },
  startScan(): Promise<ScanState> {
    return window.mrsproper.startScan()
  },
  // ... mirror pattern for each method
}
```

---

### `src/renderer/store/groupsStore.ts` (store, event-driven)

**Analog:** `src/renderer/store/targetStore.ts` — copy structure verbatim.

**Module-level state pattern** (lines 17-22 of targetStore.ts):
```typescript
interface GroupsStoreState {
  groups: GroupsState
  scan: ScanState
  // Checked-set for removal: Set of dialogIds the user wants to remove from
  // Initialized to all actionable member groups when scan completes (pre-checked)
  checkedDialogIds: Set<string>
}

let currentState: GroupsStoreState = {
  groups: { step: 'idle' },
  scan: { step: 'idle' },
  checkedDialogIds: new Set(),
}
```

**Subscription lifecycle pattern** (lines 34-80 of targetStore.ts):
```typescript
let groupsStateSub: (() => void) | null = null
let scanStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  groupsStateSub = groupsClient.onGroupsState((s: GroupsState) => {
    setState({ groups: s })
  })

  scanStateSub = groupsClient.onScanState((s: ScanState) => {
    // When scan completes, pre-check all verified-member actionable groups (D-02, D-06)
    if (s.step === 'complete') {
      const groups = currentState.groups
      if (groups.step === 'loaded') {
        const checked = new Set(
          s.results
            .filter(r => r.status === 'member')
            .map(r => r.dialogId)
            .filter(id => groups.dialogs.find(d => d.id === id)?.canAct)
        )
        setState({ scan: s, checkedDialogIds: checked })
        return
      }
    }
    setState({ scan: s })
  })

  void groupsClient.getGroupsState().then((s: GroupsState) => {
    setState({ groups: s })
  })
}
```

**useSyncExternalStore hook export** (lines 92-93 of targetStore.ts):
```typescript
export function useGroupsStore(): GroupsStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
```

**Actions pattern** (lines 96-124 of targetStore.ts):
```typescript
export const groupsActions = {
  async startScan(): Promise<void> {
    try {
      const s = await groupsClient.startScan()
      setState({ scan: s })
    } catch (err) {
      console.error('[groupsStore] startScan error:', err)
    }
  },

  toggleGroup(dialogId: string): void {
    // D-03: local toggle — no IPC call; purely renderer-side checked-set mutation
    const next = new Set(currentState.checkedDialogIds)
    if (next.has(dialogId)) next.delete(dialogId)
    else next.add(dialogId)
    setState({ checkedDialogIds: next })
  },

  async refreshGroups(): Promise<void> {
    try {
      const s = await groupsClient.refreshGroups()
      setState({ groups: s })
    } catch (err) {
      console.error('[groupsStore] refreshGroups error:', err)
    }
  },
}
```

---

### `src/renderer/components/ui/checkbox.tsx` (component)

**Analog:** `src/renderer/components/ui/badge.tsx` — shadcn/ui new-york cva pattern.

**Component wrapper pattern** (lines 1-35 of badge.tsx):
```typescript
import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

// shadcn/ui Checkbox — wraps @radix-ui/react-checkbox.
// Pattern: React.forwardRef + displayName + className merge via cn().
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
      'disabled:cursor-not-allowed disabled:opacity-50 ' +
      'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
```

---

### `src/renderer/components/ui/scroll-area.tsx` (component)

**Analog:** `src/renderer/components/ui/avatar.tsx` — forwardRef + displayName pattern.

**Component wrapper pattern** (lines 1-47 of avatar.tsx):
```typescript
import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { cn } from '@renderer/lib/utils'

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<...>(...)
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
```

---

### `src/renderer/groups/GroupsPane.tsx` (component, event-driven)

**Analog:** `src/renderer/target/TargetCard.tsx`

**Store consumption pattern** (lines 70-82 of TargetCard.tsx):
```typescript
export function GroupsPane(): React.JSX.Element {
  const { groups, scan, checkedDialogIds } = useGroupsStore()
  const targetState = useTargetStore()

  // D-12: browse mode pre-target; checklist mode post-confirm (D-13)
  const mode = targetState.target.step === 'confirmed' ? 'checklist' : 'browse'
  // ...
}
```

**Avatar/initials fallback pattern** — copy `bytesToDataUrl` and `getInitials` helpers from TargetCard.tsx lines 45-64 for group avatar display (same pattern, use group title initial as fallback).

**Conditional render pattern** (lines 77-87 of TargetCard.tsx):
```typescript
// Only show browse search field in browse mode; checklist header + progress in checklist mode
// D-05: progress indicator "checked 12/47" — NOT a bare spinner
{mode === 'checklist' && scan.step === 'scanning' && (
  <p className="text-label text-muted-foreground">
    Checked {scan.progress.checked} / {scan.progress.total}
  </p>
)}
```

**Badge usage for grey-row type** — copy from TargetCard.tsx lines 138-152 (`<Badge variant="secondary">`):
```typescript
// D-04: group-type badges ONLY on greyed rows
{!row.canAct && (
  <Badge variant="secondary">{GROUP_TYPE_LABEL[row.type]}</Badge>
)}
```

---

### `src/renderer/groups/GroupRow.tsx` (component)

**Analog:** `src/renderer/target/TargetCard.tsx`

**Avatar + fallback pattern** — copy `bytesToDataUrl`, `getInitials`, `AVATAR_COLORS` from TargetCard.tsx lines 26-64. For groups, use `getAvatarColor(dialog.id)` with `dialog.title.charAt(0).toUpperCase()` as the fallback initial.

**Checkbox integration** (using the new `checkbox.tsx` component):
```typescript
import { Checkbox } from '@renderer/components/ui/checkbox'

// D-02: row shows avatar, name, member count, checkbox
// D-03: grey-out reason is always-visible muted subtext (no hover required)
// D-04: type badge only on greyed rows
<div className={cn('flex items-center gap-3 py-2', !dialog.canAct && 'opacity-60')}>
  <Checkbox
    checked={isChecked}
    onCheckedChange={() => groupsActions.toggleGroup(dialog.id)}
    disabled={!dialog.canAct || scan.step !== 'complete'}
    aria-label={`Remove from ${dialog.title}`}
  />
  <Avatar className="h-8 w-8 shrink-0">
    {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
    <AvatarFallback style={{ backgroundColor: avatarBg }}>
      {initial}
    </AvatarFallback>
  </Avatar>
  <div className="flex flex-col min-w-0 flex-1">
    <span className="text-label font-medium truncate">{dialog.title}</span>
    {/* D-03: reason always visible, not hover-only */}
    {!dialog.canAct && dialog.greyReason && (
      <span className="text-[11px] text-muted-foreground">
        {GROUP_GREY_COPY[dialog.greyReason]}
      </span>
    )}
  </div>
  {/* D-02: member count */}
  {dialog.memberCount != null && (
    <span className="text-label text-muted-foreground tabular-nums shrink-0">
      {formatMemberCount(dialog.memberCount)}
    </span>
  )}
  {/* D-04: type badge only on greyed rows */}
  {!dialog.canAct && (
    <Badge variant="secondary">{GROUP_TYPE_LABEL[dialog.type]}</Badge>
  )}
</div>
```

---

### `src/renderer/groups/groupsCopy.ts` (utility)

**Analog:** `src/renderer/target/resolveCopy.ts` — exact same pattern.

**Copy module pattern** (lines 1-9 of resolveCopy.ts):
```typescript
// Maps typed GreyReason values + scan error codes to human-readable UI copy.
// NO Telegram jargon ever reaches the user.
// i18n hygiene: ALL user-facing strings in Phase 4 go here only.
// Pattern: resolveCopy.ts — Record<TypedCode, string> + helper getter function.

import type { GreyReason, GroupErrorCode } from '@shared/groupTypes'

// D-03 / CONTEXT specifics: cause-specific grey-out reasons (not generic)
export const GROUP_GREY_COPY: Record<GreyReason, string> = {
  'not-creator':        "You're not the creator of this group — only the creator can remove members.",
  'no-ban-right':       "You don't have the ban right in this group.",
  'broadcast-channel':  "Channel — members can't be removed via this tool.",
  'not-admin':          "You don't have admin rights here.",
  'verify-failed':      "Couldn't verify — retry",
}
```

**Getter function pattern** (lines 27-30 of resolveCopy.ts):
```typescript
export function getGreyCopy(reason: GreyReason): string {
  return GROUP_GREY_COPY[reason] ?? GROUP_GREY_COPY['verify-failed']
}
```

---

### `src/renderer/shell/AppShell.tsx` (component — modification)

**Analog:** `src/renderer/shell/AppShell.tsx` (existing file to restructure)

**Current structure** (lines 15-33 — the entire file): Replace the `<main>` single-column layout with the two-pane flex layout from RESEARCH Pattern 8:

```typescript
// D-09: two-pane layout applies immediately after login, always
// D-10: flex-[1] (left, 33%) : flex-[2] (right, 66%); min 1080px wide
// Remove StubbedWorkflowRegions import; add TargetInput, TargetCard, GroupsPane
export default function AppShell({ identity }: AppShellProps): React.JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header band — unchanged from current AppShell */}
      <header className="bg-secondary border-b border-border px-4 py-2 flex items-center justify-between shrink-0">
        <IdentityDisplay identity={identity} />
        <SettingsMenu />
      </header>

      {/* Two-pane content area (D-10) */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left pane: 1/3 — target input + card (D-11) */}
        <div className="flex flex-col flex-[1] min-w-0 border-r border-border overflow-y-auto p-4">
          <TargetInput />
          <div className="mt-4">
            <TargetCard />
          </div>
        </div>
        {/* Right pane: 2/3 — groups (D-12) */}
        <div className="flex flex-col flex-[2] min-w-0 overflow-hidden">
          <GroupsPane />
        </div>
      </main>
    </div>
  )
}
```

---

### `src/main/index.ts` (config — modification)

**Analog:** `src/main/index.ts` (existing file, two targeted changes)

**Window size change** — lines 24-29 (change these values only):
```typescript
// D-10: widen for two-pane authenticated layout
const mainWindow = new BrowserWindow({
  width: 1280,      // was 480
  height: 800,      // was 720
  minWidth: 1080,   // was 400
  minHeight: 680,   // was 600
  // ... all other options unchanged
})
```

**Service wiring pattern** — mirrors the resolver wiring at lines 189-196; add after `registerTargetChannels`:
```typescript
// ── Wire GroupEnumerator + MembershipScanner (Phase 4) ───────────────────
// Same shared client + governor as SessionManager and TargetResolver (WR-01).
const enumerator = new GroupEnumerator({
  client: client as unknown as ...,
  governor,
  onStateChange: (state) => {
    emitGroupsState(currentWin, state)
  },
})
const scanner = new MembershipScanner({
  client: client as unknown as ...,
  governor,
  enumerator,
  resolver,
  onStateChange: (state) => {
    emitScanState(currentWin, state)
  },
})
registerGroupChannels(currentWin, enumerator, scanner)

// D-08: enumerate groups eagerly right after login
// Wire into SessionManager.onStateChange: when state becomes 'loggedIn', call enumerator.enumerateAtLogin()
```

---

### `src/preload/index.ts` (modification)

**Analog:** `src/preload/index.ts` (existing file — augment `contextBridge.exposeInMainWorld`)

**New bridge entries pattern** — copy the target bridge entries (lines 39-61) and translate to groups/scan:
```typescript
// ── Group enumeration + scan bridge (Phase 4) ──────────────────────────────
getGroupsState: (): Promise<GroupsState> =>
  ipcRenderer.invoke(GROUPS_GET_STATE) as Promise<GroupsState>,
refreshGroups: (): Promise<GroupsState> =>
  ipcRenderer.invoke(GROUPS_REFRESH) as Promise<GroupsState>,
onGroupsState: (cb: (s: GroupsState) => void): (() => void) => {
  const h = (_: unknown, s: GroupsState): void => cb(s)
  ipcRenderer.on(GROUPS_STATE, h)
  return () => ipcRenderer.removeListener(GROUPS_STATE, h)
},
startScan: (): Promise<ScanState> =>
  ipcRenderer.invoke(SCAN_START) as Promise<ScanState>,
abortScan: (): Promise<void> =>
  ipcRenderer.invoke(SCAN_ABORT) as Promise<void>,
retryScanGroup: (dialogId: string): Promise<void> =>
  ipcRenderer.invoke(SCAN_RETRY_GROUP, { dialogId }) as Promise<void>,
getScanState: (): Promise<ScanState> =>
  ipcRenderer.invoke(SCAN_GET_STATE) as Promise<ScanState>,
onScanState: (cb: (s: ScanState) => void): (() => void) => {
  const h = (_: unknown, s: ScanState): void => cb(s)
  ipcRenderer.on(SCAN_STATE, h)
  return () => ipcRenderer.removeListener(SCAN_STATE, h)
},
```

---

### `src/main/telegram/__mocks__/telegramClient.ts` (test — augmentation)

**Analog:** `src/main/telegram/__mocks__/telegramClient.ts` (existing file to extend)

**New mock config fields** — add to `MockClientConfig` interface (after Phase 3 block at line 85):
```typescript
// ── Phase 4: group enumeration + membership mock controls ──────────────
/** If set, getDialogs returns these dialog-like objects. */
getDialogsResult?: Array<{
  entity: 'Chat' | 'Channel' | 'ChannelBroadcast'
  id: string
  title: string
  megagroup?: boolean
  creator?: boolean
  adminRights?: { banUsers?: boolean }
}>
/** If set, GetParticipant throws USER_NOT_PARTICIPANT for these dialogIds. */
notMemberDialogIds?: string[]
/** If set, GetFullChat returns participant list for these chatIds. */
basicGroupParticipants?: Record<string, string[]>  // chatId → userId[]
/** If set, getDialogs throws this error. */
getDialogsError?: MockRPCErrorCode
```

**New invoke dispatch block** — add inside `invoke: async (request) => {...}` (after GetFullUser block at line 273):
```typescript
// channels.GetParticipant — membership check (GRP-01)
if (ctorName === 'GetParticipant' || (request as { className?: string })?.className === 'channels.GetParticipant') {
  const channelInput = (request as { channel?: { channelId?: { toString(): string } } }).channel
  const channelId = channelInput?.channelId?.toString() ?? ''
  if (config.notMemberDialogIds?.includes(channelId)) {
    const err = Object.assign(new Error('USER_NOT_PARTICIPANT'), { errorMessage: 'USER_NOT_PARTICIPANT' })
    throw err
  }
  // Return a ChannelParticipant (member)
  return { participant: { className: 'ChannelParticipant', userId: bigInt('12345') } }
}

// messages.GetFullChat — basic group membership (GRP-01)
if (ctorName === 'GetFullChat' || (request as { className?: string })?.className === 'messages.GetFullChat') {
  const chatId = (request as { chatId?: { toString(): string } }).chatId?.toString() ?? ''
  const participants = config.basicGroupParticipants?.[chatId] ?? []
  return {
    fullChat: {
      className: 'ChatFull',
      participants: {
        className: 'ChatParticipants',
        participants: participants.map(userId => ({ userId: bigInt(userId) })),
      },
    },
  }
}
```

**New `getDialogs` method** — add after the `invoke` method:
```typescript
getDialogs: async (_params?: unknown): Promise<unknown[]> => {
  if (config.getDialogsError) throw makeRPCError(config.getDialogsError)
  return (config.getDialogsResult ?? []).map((d) => ({
    entity: d.entity === 'Chat'
      ? Object.assign(new Api.Chat({}), { id: bigInt(d.id), creator: d.creator, adminRights: d.adminRights })
      : Object.assign(new Api.Channel({}), { id: bigInt(d.id), megagroup: d.megagroup, adminRights: d.adminRights }),
    inputEntity: { channelId: bigInt(d.id), accessHash: bigInt.zero },
    title: d.title,
    id: bigInt(d.id),
  }))
},
```

---

### Test files: `groupEnumerator.test.ts`, `membershipScanner.test.ts`, `groupChannels.test.ts`

**Analog:** `src/main/telegram/targetResolver.test.ts` and `src/main/ipc/targetChannels.test.ts`

**Test structure pattern** — copy from targetResolver.test.ts lines 28-38:
```typescript
function makeEnumerator(config: Parameters<typeof createMockTelegramClient>[0] = {}) {
  const client = createMockTelegramClient(config)
  const states: GroupsState[] = []
  const enumerator = new GroupEnumerator({
    client,
    governor: new RateLimitGovernor({ client, onEvent: vi.fn() }),
    onStateChange: (s: GroupsState) => states.push(s),
  })
  return { enumerator, states, client }
}
```

**Electron mock pattern** — copy from targetChannels.test.ts lines 23-34:
```typescript
const capturedHandlers: Record<string, IpcHandler> = {}
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => {
      capturedHandlers[channel] = handler
    },
  },
  BrowserWindow: vi.fn(),
}))
```

**Window destroyed guard test pattern** — copy exactly from targetChannels.test.ts lines 222-238:
```typescript
describe('emitGroupsState — skips destroyed window', () => {
  it('does NOT call win.webContents.send when isDestroyed() returns true', () => {
    const win = makeMockWin(true)
    emitGroupsState(win as never, { step: 'idle' })
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})
```

---

## Shared Patterns

### Governor wrapping
**Source:** `src/main/telegram/TargetResolver.ts` lines 201-205, 258-262
**Apply to:** All GramJS API calls in `GroupEnumerator.ts` and `MembershipScanner.ts`
```typescript
// ALL Telegram API calls go through governor.run() — no exceptions
const result = await this._governor.run(() =>
  this._client.invoke(new Api.SomeMethod({ ... }))
)
```

### isDestroyed window guard
**Source:** `src/main/ipc/targetChannels.ts` lines 96-100
**Apply to:** All `win.webContents.send()` calls in `groupChannels.ts`
```typescript
if (!win.isDestroyed()) {
  win.webContents.send(CHANNEL_NAME, payload)
}
```

### bigint serialization (CR-02)
**Source:** `src/main/telegram/TargetResolver.ts` lines 241-243 and `__mocks__/telegramClient.ts` line 25
**Apply to:** All GramJS entity ID handling in `GroupEnumerator.ts` and `MembershipScanner.ts`
```typescript
// GramJS `long` fields are big-integer library objects (typeof === 'object'), NOT native bigint
// NEVER compare with === or typeof === 'bigint'
// ALWAYS compare via .toString() equality
entity.id.toString() === targetIdStr  // correct
bigInt(stored.toString())             // correct reconstruction for GramJS calls
```

### Graceful avatar degradation
**Source:** `src/main/telegram/TargetResolver.ts` lines 331-343
**Apply to:** `GroupEnumerator._fetchAvatar()` for group photos
```typescript
try {
  const photoBuffer = await this._governor.run(() =>
    this._client.downloadProfilePhoto(entity)
  )
  if (photoBuffer && (photoBuffer as Buffer | Uint8Array).length > 0) {
    return new Uint8Array(photoBuffer as Buffer | Uint8Array)
  }
  return null
} catch {
  return null  // show initials fallback, never block enumeration
}
```

### Error classification
**Source:** `src/main/telegram/TargetResolver.ts` lines 137-145
**Apply to:** All catch blocks in `GroupEnumerator.ts` and `MembershipScanner.ts`
```typescript
} catch (err) {
  const classified = classifyRpcError(err)
  this._emit({ step: 'error', code: classified.code as GroupErrorCode })
}
```

### Copy module structure
**Source:** `src/renderer/target/resolveCopy.ts` lines 1-29
**Apply to:** `src/renderer/groups/groupsCopy.ts`
```typescript
// Record<TypedErrorCode, string> for all user-facing strings
// + getter function with fallback to UNKNOWN/verify-failed copy
// NO jargon, NO Telegram API strings visible to user
```

### IPC handler Zod validation
**Source:** `src/main/ipc/targetChannels.ts` lines 39-41, 65-66
**Apply to:** All IPC handlers in `groupChannels.ts` that accept payloads
```typescript
const SomeSchema = z.object({ field: z.string().min(1).max(N) })
// ...inside handler:
const parsed = SomeSchema.parse(payload)  // throws ZodError on malformed input — never reaches service
```

---

## No Analog Found

All Phase 4 files have strong analogs in the existing codebase. No files require falling back to RESEARCH.md patterns as the primary pattern source (though RESEARCH.md §Code Examples provides the GramJS-specific API patterns that the analogs cannot).

---

## Metadata

**Analog search scope:** `src/main/`, `src/renderer/`, `src/shared/`, `src/preload/`
**Files scanned:** 57
**Key patterns identified:**
- All main-process services follow TargetResolver.ts exactly: DI constructor, private state, `_emit` helper, governor wrapping, classifyRpcError in catch
- All IPC handlers follow targetChannels.ts exactly: Zod schema per payload, `registerXChannels(win, service)`, `emitXState(win, state)` with `isDestroyed()` guard
- All renderer stores follow targetStore.ts exactly: module-level state, `useSyncExternalStore`, ref-counted subscriptions, bootstrap `getX()` on first subscribe
- All renderer IPC clients follow targetClient.ts exactly: `declare global { interface MrsProperApi {...} }` augmentation + thin wrapper object
- All UI components follow shadcn/ui pattern: `React.forwardRef` + `displayName` + `cn()` class merging
- All copy modules follow resolveCopy.ts: `Record<TypedCode, string>` + getter with fallback
**Pattern extraction date:** 2026-06-11
