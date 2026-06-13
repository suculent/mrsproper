# Phase 5: Removal Execution Engine — Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/main/telegram/RemovalExecutor.ts` | service | sequential CRUD | `src/main/telegram/MembershipScanner.ts` | exact |
| `src/main/storage/auditStore.ts` | service | file-I/O | `src/main/storage/secrets.ts` | exact |
| `src/main/ipc/removalChannels.ts` | middleware | request-response | `src/main/ipc/searchChannels.ts` | exact |
| `src/shared/removalTypes.ts` | model | — | `src/shared/searchTypes.ts` | exact |
| `src/shared/channels.ts` (modify) | config | — | `src/shared/channels.ts` | self |
| `src/shared/opTypes.ts` (modify) | model | — | `src/shared/opTypes.ts` | self |
| `src/renderer/ipc/removalClient.ts` | utility | request-response | `src/renderer/ipc/searchClient.ts` | exact |
| `src/renderer/store/removalStore.ts` | store | event-driven | `src/renderer/store/searchStore.ts` | exact |
| `src/renderer/removal/RemovalConfirmDialog.tsx` | component | request-response | `src/renderer/shell/LogoutDialog.tsx` | exact |
| `src/renderer/removal/ResumeJobDialog.tsx` | component | request-response | `src/renderer/shell/LogoutDialog.tsx` | exact |
| `src/renderer/removal/removalCopy.ts` | utility | — | `src/renderer/groups/groupsCopy.ts` | exact |
| `src/renderer/groups/GroupRow.tsx` (modify) | component | event-driven | `src/renderer/groups/GroupRow.tsx` | self |
| `src/renderer/groups/GroupsPane.tsx` (modify) | component | event-driven | `src/renderer/groups/GroupsPane.tsx` | self |
| `src/preload/index.ts` (modify) | config | — | `src/preload/index.ts` | self |

---

## Pattern Assignments

### `src/main/telegram/RemovalExecutor.ts` (service, sequential CRUD)

**Analog:** `src/main/telegram/MembershipScanner.ts`

**Imports pattern** (lines 28-53):
```typescript
import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { ScanState, ScanProgressDTO, MembershipResultDTO, AdminDialogDTO } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import type { GroupEnumerator } from './GroupEnumerator'

export interface MembershipScannerClient {
  invoke(request: unknown): Promise<unknown>
}

export interface MembershipScannerOptions {
  client: MembershipScannerClient
  governor: RateLimitGovernor
  enumerator: GroupEnumerator
  resolver: { getResolvedUser(): { id: bigint; accessHash: bigint } | null }
  onStateChange: (state: ScanState) => void
}
```
Copy verbatim; replace `ScanState`/`MembershipResultDTO` with `RemovalState`/`RemovalGroupOutcome`; add `auditStore` injection to options.

**Constructor and private field pattern** (lines 57-78):
```typescript
export class MembershipScanner {
  private readonly _client: MembershipScannerClient
  private readonly _governor: RateLimitGovernor
  private readonly _enumerator: GroupEnumerator
  private readonly _resolver: { getResolvedUser(): { id: bigint; accessHash: bigint } | null }
  private readonly _emit: (state: ScanState) => void

  private _currentState: ScanState = { step: 'idle' }
  private _generation = 0
  private _abortController: AbortController | null = null

  constructor(options: MembershipScannerOptions) {
    this._client = options.client
    this._governor = options.governor
    this._enumerator = options.enumerator
    this._resolver = options.resolver
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
  }
```

**Generation-guard execute loop pattern** (lines 91-162):
```typescript
async scan(): Promise<void> {
  const gen = ++this._generation
  this._abortController = new AbortController()
  const signal = this._abortController.signal

  const resolved = this._resolver.getResolvedUser()
  if (resolved === null) {
    this._emit({ step: 'error', code: 'UNKNOWN' })
    return
  }

  const groupsState = this._enumerator.getState()
  if (groupsState.step !== 'loaded') {
    this._emit({ step: 'error', code: 'UNKNOWN' })
    return
  }

  const dialogs = groupsState.dialogs
  const total = dialogs.length

  for (const dialog of dialogs) {
    // D-15: check if superseded or aborted
    if (gen !== this._generation || signal.aborted) {
      return
    }

    let outcome: RemovalGroupOutcome
    try {
      outcome = await this._removeFromGroup(dialog, resolved, params.severity)
    } catch (err) {
      outcome = this._classifyRemovalError(err)
    }

    // Checkpoint BEFORE re-checking generation (crash safety)
    // Only checkpoint if generation is still valid (Pitfall 7)
    if (gen !== this._generation || signal.aborted) {
      return
    }
    this._auditStore.checkpoint(dialog.id, outcome)

    // Proactive pacing: 2s base + up to 1s jitter
    await new Promise<void>(r => setTimeout(r, 2000 + Math.random() * 1000))

    if (gen !== this._generation || signal.aborted) {
      return
    }

    this._emit({ step: 'running', ... })
  }
  this._emit({ step: 'complete', ... })
}
```

**Abort pattern** (lines 164-173):
```typescript
abortScan(): void {
  this._generation++
  if (this._abortController) {
    this._abortController.abort()
    this._abortController = null
  }
  this._emit({ step: 'idle' })
}
```
For `abortExecution()` in RemovalExecutor, emit `{ step: 'stopped' }` instead of `idle` (job is resumable per CONTEXT), and checkpoint remaining-as-skipped before emitting.

**Per-group retry pattern** (lines 184-225):
```typescript
async retryGroup(dialogId: string): Promise<void> {
  if (this._currentState.step !== 'complete') return

  // CR-02: capture generation before the async gap
  const gen = this._generation

  const resolved = this._resolver.getResolvedUser()
  if (resolved === null) return

  // ... do the work ...

  // CR-02: generation guard after await
  if (gen !== this._generation || this._currentState.step !== 'complete') return

  // Merge updated result into existing outcomes array
  const updatedOutcomes = this._currentState.outcomes.map(o =>
    o.dialogId === dialogId ? { ...o, ...newOutcome } : o
  )
  this._emit({ step: 'complete', outcomes: updatedOutcomes, ... })
}
```

**Entity accessHash extraction pattern** (lines 257-261 of MembershipScanner._checkMembership):
```typescript
const channelEntity = entity as { id?: { toString(): string; value?: unknown }; accessHash?: { toString(): string; value?: unknown } } | null
const channelId = bigInt(channelEntity?.id?.toString() ?? dialog.id)
const accessHash = channelEntity?.accessHash
  ? bigInt(channelEntity.accessHash.toString())
  : bigInt.zero
```
Copy verbatim to RemovalExecutor._removeFromGroup for InputChannel construction.

**Governor.run() invocation pattern** (lines 263-275):
```typescript
const result = await this._governor.run(() =>
  this._client.invoke(
    new Api.channels.GetParticipant({
      channel: new Api.InputChannel({ channelId, accessHash }),
      participant: inputUser,
    })
  )
)
```

---

### `src/main/storage/auditStore.ts` (service, file-I/O)

**Analog:** `src/main/storage/secrets.ts`

**Lazy-import pattern for Electron + node:fs** (lines 54-63):
```typescript
function createProductionStore(storage: SafeStorageLike): SecretsStore {
  // Lazy imports to avoid loading electron/fs at module parse time in test env
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeFs = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as { app: { getPath(name: string): string } }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { join } = require('node:path') as typeof import('node:path')

  const sessionFile = () => join(app.getPath('userData'), 'session.bin')
```
For auditStore: replace `session.bin` with `removal-job.json` / `removal-job.json.tmp`; same lazy-require pattern.

**Atomic write pattern** (lines 66-72):
```typescript
persistSession(stringSession: string): void {
  if (!storage.isEncryptionAvailable()) {
    throw new Error('ENCRYPTION_UNAVAILABLE')
  }
  const cipher: Buffer = storage.encryptString(stringSession)
  nodeFs.writeFileSync(sessionFile(), cipher, { mode: 0o600 })
}
```
For auditStore atomic job file write:
```typescript
function writeJobFile(job: RemovalJobFile): void {
  const dir = app.getPath('userData')
  const tmpPath = join(dir, 'removal-job.json.tmp')
  const finalPath = join(dir, 'removal-job.json')
  nodeFs.writeFileSync(tmpPath, JSON.stringify(job, null, 2), { mode: 0o600 })
  nodeFs.renameSync(tmpPath, finalPath)  // atomic on POSIX; near-atomic on Windows
}
```

**File existence guard pattern** (lines 74-83):
```typescript
restoreSession(): string | null {
  const filePath = sessionFile()
  if (!nodeFs.existsSync(filePath)) return null
  // ...
  try {
    return storage.decryptString(nodeFs.readFileSync(filePath))
  } catch {
    return null
  }
}
```

**Injectable-deps factory pattern** (lines 143-163):
```typescript
export function createSecretsStore(deps: SecretsStoreDeps = {}): SecretsStore {
  if (deps.storage) {
    return createInMemoryStore(deps.storage)
  }
  try {
    const { safeStorage } = require('electron') as { safeStorage: SafeStorageLike }
    return createProductionStore(safeStorage)
  } catch {
    throw new Error('...')
  }
}
```
AuditStore follows the same injectable-deps factory so tests inject an in-memory store with no disk I/O.

---

### `src/main/ipc/removalChannels.ts` (middleware, request-response)

**Analog:** `src/main/ipc/searchChannels.ts`

**File header + imports pattern** (lines 1-35):
```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { ParticipantSearcher } from '../telegram/ParticipantSearcher'
import type { TargetResolver } from '../telegram/TargetResolver'
import {
  SEARCH_START,
  SEARCH_ABORT,
  SEARCH_GET_STATE,
  SEARCH_STATE,
  TARGET_RESOLVE_CANDIDATE,
} from '@shared/channels'
import type { SearchState } from '@shared/searchTypes'
```
For removalChannels: import `RemovalExecutor`, `AuditStore`, `REMOVAL_*` constants, `RemovalState`.

**Zod payload validation pattern** (lines 41-51):
```typescript
const SearchStartSchema = z.object({
  query: z.string().trim().min(2).max(100),
})

const ResolveCandidateSchema = z.object({
  userId: z.string().min(1).max(20),
})
```
For removalChannels:
```typescript
const RemovalStartSchema = z.object({
  severity: z.enum(['kick', 'ban']),
  dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500),
})

const RemovalRetryGroupSchema = z.object({
  dialogId: z.string().min(1).max(30),
})
```

**Register function + security gate pattern** (lines 73-122):
```typescript
export function registerSearchChannels(
  win: BrowserWindow,
  searcher: ParticipantSearcher,
  resolver: TargetResolver
): void {
  void win  // used by emitSearchState

  ipcMain.handle(SEARCH_START, async (_event, payload: unknown) => {
    const parsed = SearchStartSchema.parse(payload) // throws ZodError
    searcher.search(parsed.query).catch(() => {})
    return searcher.getState()
  })

  ipcMain.handle(SEARCH_ABORT, async () => {
    searcher.abortSearch()
    return searcher.getState()
  })

  ipcMain.handle(SEARCH_GET_STATE, async () => {
    return searcher.getState()
  })

  // Two-layer security gate: Zod first, then in-memory candidate map
  ipcMain.handle(TARGET_RESOLVE_CANDIDATE, async (_event, payload: unknown) => {
    const parsed = ResolveCandidateSchema.parse(payload)
    const accessHash = searcher.getCandidateAccessHash(parsed.userId)
    if (accessHash === null) {
      throw new Error('Unknown userId — not in current candidate set')
    }
    await resolver.resolveByCandidate(BigInt(parsed.userId), accessHash)
    return resolver.getState()
  })
}
```
Security gate for `removal:start`: validate `dialogIds` against `enumerator.getState().dialogs` before dispatching. `removal:retryGroup`: validate `dialogId` is in the current job's `dialogIds`.

**State-push helper pattern** (lines 125-138):
```typescript
export function emitSearchState(win: BrowserWindow, state: SearchState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(SEARCH_STATE, state)
  }
}
```
Copy verbatim as `emitRemovalState(win, state: RemovalState)`.

---

### `src/shared/removalTypes.ts` (model)

**Analog:** `src/shared/searchTypes.ts`

**Discriminated union state pattern** (lines 43-57):
```typescript
export type SearchState =
  | { step: 'idle' }
  | { step: 'searching'; progress: SearchProgressDTO; candidates: CandidateDTO[]; errorCount: number }
  | { step: 'complete'; candidates: CandidateDTO[]; total: number; errorCount: number }
  | { step: 'stopped'; candidates: CandidateDTO[]; errorCount: number }
  | { step: 'error'; code: SearchErrorCode }
```
For RemovalState use the step union from RESEARCH.md `RemovalRunStep`:
```typescript
export type RemovalRunStep =
  | 'idle' | 'confirming' | 'running' | 'stopping' | 'stopped' | 'complete' | 'hard-stopped'
```

**DTO interface pattern** (lines 13-26):
```typescript
export interface CandidateDTO {
  id: string
  name: string
  username: string | null
  deleted: boolean
  foundIn: string[]
  avatar: Uint8Array | null
}
```
Model `RemovalGroupOutcome`, `RemovalState`, `RemovalJobFile` as interfaces in the same file, following the same comment style ("Shared types for…", "Imported by both main…and renderer…").

---

### `src/shared/channels.ts` (modify — add REMOVAL_* constants)

**Analog:** `src/shared/channels.ts` (self, existing SEARCH_* block lines 41-47)

**Channel constant block pattern** (lines 41-47):
```typescript
// Name search IPC channels (Phase 4.1, TGT-05).
// Pattern mirrors the SCAN_* block directly above.
export const SEARCH_START = 'search:start' as const       // { query: string }
export const SEARCH_ABORT = 'search:abort' as const
export const SEARCH_GET_STATE = 'search:getState' as const
export const SEARCH_STATE = 'search:state' as const       // push: main → renderer
export const TARGET_RESOLVE_CANDIDATE = 'target:resolveCandidate' as const  // { userId: string }
```
Add after the SEARCH block:
```typescript
// Removal execution IPC channels (Phase 5, RMV-01/RMV-02).
// Pattern mirrors the SCAN_* / SEARCH_* blocks above.
export const REMOVAL_START        = 'removal:start' as const        // { severity, dialogIds }
export const REMOVAL_ABORT        = 'removal:abort' as const
export const REMOVAL_RETRY_GROUP  = 'removal:retryGroup' as const   // { dialogId }
export const REMOVAL_GET_STATE    = 'removal:getState' as const
export const REMOVAL_STATE        = 'removal:state' as const        // push: main → renderer
export const REMOVAL_GET_JOB      = 'removal:getJob' as const
export const REMOVAL_DISCARD_JOB  = 'removal:discardJob' as const
```
Also add all new constants to the `CHANNELS` namespace object.

---

### `src/shared/opTypes.ts` (modify — add RMV_* error codes)

**Analog:** `src/shared/opTypes.ts` (self, existing `OperationErrorCode` union lines 23-37)

**Error code union extension pattern** (lines 29-37):
```typescript
export type OperationErrorCode =
  | 'FLOOD_WAIT'
  | 'PEER_FLOOD'
  | 'SESSION_INVALID'
  | 'NETWORK'
  | 'UNKNOWN'
  // Phase 3 additions
  | 'TARGET_USERNAME_NOT_FOUND'
  | 'TARGET_PHONE_NOT_FOUND'
  | 'TARGET_NO_PUBLIC_PROFILE'
  // Phase 4.1 additions
  | 'GROUPS_NOT_LOADED'
  | 'SEARCH_QUERY_TOO_SHORT'
// Phase 6 extends this with: USER_PRIVACY_RESTRICTED, CHAT_ADMIN_REQUIRED, etc.
```
Add Phase 5 block at the bottom of the union, before the Phase 6 comment:
```typescript
  // Phase 5 additions — per-group removal failure codes (all disposition 'fail', T-03-02)
  | 'RMV_TARGET_IS_ADMIN'    // USER_ADMIN_INVALID
  | 'RMV_NO_RIGHTS'          // CHAT_ADMIN_REQUIRED
  | 'RMV_USER_INVALID'       // USER_ID_INVALID
  | 'RMV_CHANNEL_PRIVATE'    // CHANNEL_PRIVATE
```

---

### `src/renderer/ipc/removalClient.ts` (utility, request-response)

**Analog:** `src/renderer/ipc/searchClient.ts`

**Interface augmentation + client object pattern** (full file, 39 lines):
```typescript
// MrsProperApi augmentation for name-based target search (Phase 4.1, TGT-05).
// Mirrors src/renderer/ipc/groupsClient.ts — standard interface merging pattern.

import type { SearchState } from '@shared/searchTypes'
import type { TargetState } from '@shared/targetTypes'

declare global {
  interface MrsProperApi {
    startSearch(query: string): Promise<SearchState>
    abortSearch(): Promise<SearchState>
    getSearchState(): Promise<SearchState>
    onSearchState(cb: (s: SearchState) => void): () => void
    selectCandidate(userId: string): Promise<TargetState>
  }
}

export const searchClient = {
  startSearch(query: string): Promise<SearchState> {
    return window.mrsproper.startSearch(query)
  },
  // ...
}
```
For removalClient: augment `MrsProperApi` with `startRemoval`, `abortRemoval`, `retryRemovalGroup`, `getRemovalState`, `onRemovalState`, `getRemovalJob`, `discardRemovalJob`. Return types use `RemovalState` and `RemovalJobFile` from `@shared/removalTypes`.

---

### `src/renderer/store/removalStore.ts` (store, event-driven)

**Analog:** `src/renderer/store/searchStore.ts`

**Module-level state + listener set pattern** (lines 12-26):
```typescript
type Listener = () => void

let currentState: SearchState = { step: 'idle' }
let lastQuery = ''

const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

function setState(next: SearchState): void {
  currentState = next
  notify()
}
```

**Ref-counted subscription lifecycle pattern** (lines 28-56):
```typescript
let searchStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  searchStateSub = searchClient.onSearchState((s: SearchState) => {
    setState(s)
  })

  // Bootstrap: only apply if no push-state has arrived since registering the listener
  searchClient.getSearchState().then((s: SearchState) => {
    if (currentState.step === 'idle') {
      setState(s)
    }
  }).catch(console.error)
}

function stopSubscriptions(): void {
  if (refCount <= 0) return  // guard against underflow
  refCount--
  if (refCount > 0) return
  searchStateSub?.()
  searchStateSub = null
}
```
For removalStore: same shape but also bootstrap `getRemovalJob()` on first subscription to detect incomplete jobs and expose `pendingJob: RemovalJobFile | null` alongside `currentState`.

**useSyncExternalStore hook pattern** (lines 58-79):
```typescript
function subscribe(listener: Listener): () => void {
  if (listeners.size === 0) startSubscriptions()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopSubscriptions()
  }
}

function getSnapshot(): SearchState {
  return currentState
}

function getServerSnapshot(): SearchState {
  return currentState
}

export function useSearchStore(): SearchState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
```

**Intent dispatchers pattern** (lines 87-118):
```typescript
export const searchActions = {
  async startSearch(query: string): Promise<void> {
    lastQuery = query
    try {
      const s = await searchClient.startSearch(query)
      setState(s)
    } catch (err) {
      console.error('[searchStore] startSearch:', err)
      setState({ step: 'error', code: 'UNKNOWN' })
    }
  },

  async abortSearch(): Promise<void> {
    try {
      const s = await searchClient.abortSearch()
      setState(s)
    } catch (err) {
      console.error('[searchStore] abortSearch:', err)
    }
  },
}
```

---

### `src/renderer/removal/RemovalConfirmDialog.tsx` (component, request-response)

**Analog:** `src/renderer/shell/LogoutDialog.tsx`

**Dialog structure pattern** (lines 61-124):
```tsx
<Dialog open={open} onOpenChange={handleClose}>
  <DialogContent
    className="sm:max-w-[400px]"
    aria-labelledby="logout-dialog-title"
    aria-describedby="logout-dialog-description"
  >
    <DialogHeader>
      <DialogTitle id="logout-dialog-title" className="text-heading">
        Log out?
      </DialogTitle>
      <DialogDescription id="logout-dialog-description" className="text-body">
        You'll need to sign in again with a code.
      </DialogDescription>
    </DialogHeader>

    {/* Conditional warning banner (D-17) */}
    {condition && (
      <Alert
        variant="destructive"
        className="bg-destructive/10 border-destructive/30"
        role="alert"
        aria-live="assertive"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription className="text-body">...</AlertDescription>
      </Alert>
    )}

    <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
      {/* Neutral — autofocus (D-15) */}
      <Button variant="outline" onClick={handleClose} disabled={isLoggingOut} autoFocus>
        Cancel
      </Button>

      {/* Destructive */}
      <Button
        variant="destructive"
        onClick={handleConfirm}
        disabled={isDispatching}
        aria-label="Confirm ban from N groups"
      >
        {isDispatching ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Starting…
          </>
        ) : (
          'Ban from N groups'
        )}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**useState + useCallback handler pattern** (lines 26-59):
```tsx
const [isLoggingOut, setIsLoggingOut] = useState(false)
const [serverRevoked, setServerRevoked] = useState<boolean | null>(null)

const handleLogout = useCallback(async () => {
  setIsLoggingOut(true)
  try {
    const result = await authActions.logout()
    setServerRevoked(result.serverRevoked)
    if (result.serverRevoked) {
      onOpenChange(false)
      setServerRevoked(null)
    }
    // ...
  } finally {
    setIsLoggingOut(false)
  }
}, [onOpenChange])

const handleClose = useCallback(() => {
  if (!isLoggingOut) {
    onOpenChange(false)
    setServerRevoked(null)
  }
}, [isLoggingOut, onOpenChange])
```

**Identity block pattern for target display** — copy from `src/renderer/groups/GroupRow.tsx` (lines 25-60):
```tsx
const AVATAR_COLORS = [
  '#E17076', '#FAA774', '#A695E7', '#7BC862',
  '#6EC9CB', '#65AADD', '#EE7AAE',
]

function getAvatarColor(seed: string): string {
  return AVATAR_COLORS[Number(BigInt(seed) % 7n)]
}

function bytesToDataUrl(bytes: Uint8Array | null): string | null { /* ... */ }

function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}
```
Per PATTERNS.md note in GroupRow.tsx line 25: these helpers are intentionally duplicated across files (no premature abstraction).

---

### `src/renderer/removal/ResumeJobDialog.tsx` (component, request-response)

**Analog:** `src/renderer/shell/LogoutDialog.tsx`

Same Dialog structure as `RemovalConfirmDialog.tsx`. Key differences:
- Title: `"Finish removing {name}?"` (text-heading)
- Description: `"{X} of {N} groups were processed…"` (text-body)
- Footer: `<Button variant="outline" autoFocus>` "Discard job" (safe default) + `<Button variant="destructive">` "Resume removal"
- No identity block (uses target name string only from job file)
- No loading spinner on the Discard button (it's a fast local delete)

The Discard path calls `removalActions.discardJob()` then `onOpenChange(false)`. The Resume path calls `removalActions.resume(remainingDialogIds)` (fire-and-forget, same pattern as scan start) then closes the dialog.

---

### `src/renderer/removal/removalCopy.ts` (utility)

**Analog:** `src/renderer/groups/groupsCopy.ts`

**Record<TypedCode, string> copy map pattern** (lines 12-18):
```typescript
export const GROUP_GREY_COPY: Record<GreyReason, string> = {
  'not-creator': "Only group creators can remove members here",
  'no-ban-right': "You don't have the ban right in this group",
  'broadcast-channel': "Channel — subscribers can't be removed",
  'not-admin': "You're not an admin here",
  'verify-failed': "Couldn't verify —",
}
```
For removalCopy, use `RmvErrorCode` keyed records, severity-keyed functions, and step-keyed strings:
```typescript
export const RMV_ERROR_COPY: Record<RmvErrorCode, string> = {
  'RMV_TARGET_IS_ADMIN': "They're an admin here — make them a regular member in Telegram first, then",
  'RMV_NO_RIGHTS': "You no longer have removal rights in this group —",
  'RMV_USER_INVALID': "Connection dropped — check your network, then",
  'RMV_CHANNEL_PRIVATE': "Telegram refused this removal —",
  'NETWORK': "Connection dropped — check your network, then",
  'UNKNOWN': "Telegram refused this removal —",
}
```

**Plural helper function pattern** (lines 41-43):
```typescript
export const SCAN_COPY = {
  failedN: (n: number) =>
    `${n} group${n === 1 ? '' : 's'} couldn't be verified. You can retry them above.`,
} as const
```
Same pattern for `pluralGroups(n)`, `pluralRemovals(n)`, `pluralThem(n)` helpers.

---

### `src/renderer/groups/GroupRow.tsx` (modify — add removal status props)

**Analog:** `src/renderer/groups/GroupRow.tsx` (self)

**Additive props extension pattern** (lines 66-72):
```typescript
export interface GroupRowProps {
  dialog: AdminDialogDTO
  membershipStatus: MembershipStatus | null
  isChecked: boolean
  onToggle: (dialogId: string) => void
  onRetry: (dialogId: string) => void
}
```
Add three optional props:
```typescript
export interface GroupRowProps {
  // ... existing props unchanged ...
  /** Removal status for this group. null = not in a removal run. */
  removalStatus?: RemovalGroupStatus | null
  /** 'basic-group-ban-fallback' annotation or null */
  removalNote?: 'basic-group-ban-fallback' | null
  /** Called when user clicks the retry removal link for a failed row */
  onRetryRemoval?: (dialogId: string) => void
}
```

**Checkbox slot ternary pattern** (lines 101-119):
```tsx
{isPending ? (
  <div className="h-4 w-4 shrink-0 rounded animate-pulse bg-muted" />
) : isActionable ? (
  <Checkbox
    checked={isChecked}
    onCheckedChange={() => onToggle(dialog.id)}
    aria-label={`${dialog.title} — include in removal`}
  />
) : (
  <div
    className="h-4 w-4 shrink-0 rounded-sm border border-primary/30 cursor-not-allowed"
    role="checkbox"
    aria-checked="false"
    aria-disabled="true"
  />
)}
```
Extend this ternary with a `removalStatus` branch FIRST (before the isPending check when a run is active). Status icons: `Check` (text-success) for done/already-gone, `Loader2 animate-spin text-muted-foreground` for removing, `AlertCircle text-destructive` for failed, `Minus text-muted-foreground` for skipped, `Checkbox disabled` for queued.

**Inline retry button pattern** (lines 142-153):
```tsx
{isFailed && (
  <span className="text-label text-destructive inline-flex items-baseline gap-1">
    {GROUP_GREY_COPY['verify-failed']}
    <button
      onClick={() => onRetry(dialog.id)}
      className="text-label text-primary underline-offset-2 hover:underline"
      aria-label={`Retry membership check for ${dialog.title}`}
    >
      retry
    </button>
  </span>
)}
```
Copy this pattern for the removal retry link: `text-label text-destructive` for the reason text + `text-label text-primary underline-offset-2 hover:underline` for "retry removal" link. Button `aria-label="Retry removal for {dialog.title}"`.

---

### `src/renderer/groups/GroupsPane.tsx` (modify — add run-trigger, progress, summary band)

**Analog:** `src/renderer/groups/GroupsPane.tsx` (self)

**Progress indicator slot pattern** (lines 249-266):
```tsx
{mode === 'checklist' && scan.step === 'scanning' && (
  <div className="px-4 py-2 shrink-0" role="status" aria-live="polite">
    <div className="flex items-center justify-between mb-1">
      <span className="text-label text-muted-foreground">{SCAN_COPY.scanning}</span>
      <span className="text-label font-semibold text-foreground">
        checked {scan.progress.checked} / {scan.progress.total}
      </span>
    </div>
    <div className="h-1 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-[width] duration-200"
        style={{
          width: `${scan.progress.total > 0
            ? Math.round((scan.progress.checked / scan.progress.total) * 100)
            : 0}%`,
        }}
      />
    </div>
  </div>
)}
```
This slot (same `px-4 py-2 shrink-0` `role="status"`) is reused for the removal progress indicator, the summary band, and the PEER_FLOOD banner. The slot is owned by exactly one state at a time.

**Toolbar button pattern** (lines 225-245):
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setSort((s) => (s === 'az' ? 'size' : 'az'))}
  aria-pressed={sort === 'size'}
>
  {sort === 'az' ? 'A–Z' : 'By size'}
</Button>

<Button
  variant="ghost"
  size="icon"
  onClick={() => void groupsActions.refreshGroups()}
  aria-label="Refresh group list"
  title="Re-fetch your group list from Telegram"
>
  <RefreshCw className="h-4 w-4" />
</Button>
```
The run-trigger button is added right-aligned in the checklist-mode toolbar row. Use `variant="destructive" size="sm"` (not ghost). Visible only when scan complete AND ≥1 checked AND no run active:
```tsx
{mode === 'checklist' && scan.step === 'complete' && checkedCount > 0 && removal.step === 'idle' && (
  <Button
    variant="destructive"
    size="sm"
    onClick={() => setConfirmOpen(true)}
    aria-label={`Ban ${targetName} from ${checkedCount} group${checkedCount === 1 ? '' : 's'}`}
  >
    {removalCopy.runTriggerLabel('ban', checkedCount)}
  </Button>
)}
```

---

### `src/preload/index.ts` (modify — add removal bridge)

**Analog:** `src/preload/index.ts` (self, existing SEARCH bridge lines 108-124)

**contextBridge method pattern** (lines 111-124):
```typescript
startSearch: (query: string): Promise<SearchState> =>
  ipcRenderer.invoke(SEARCH_START, { query }) as Promise<SearchState>,
abortSearch: (): Promise<SearchState> =>
  ipcRenderer.invoke(SEARCH_ABORT) as Promise<SearchState>,
getSearchState: (): Promise<SearchState> =>
  ipcRenderer.invoke(SEARCH_GET_STATE) as Promise<SearchState>,
onSearchState: (cb: (s: SearchState) => void): (() => void) => {
  const h = (_: unknown, s: SearchState): void => cb(s)
  ipcRenderer.on(SEARCH_STATE, h)
  return () => ipcRenderer.removeListener(SEARCH_STATE, h)
},
selectCandidate: (userId: string): Promise<TargetState> =>
  ipcRenderer.invoke(TARGET_RESOLVE_CANDIDATE, { userId }) as Promise<TargetState>,
```
Add after the search bridge block, following the same `{method: payload → invoke}` + `on{Event}: (cb) → listener` pattern using `REMOVAL_*` constants and `RemovalState` / `RemovalJobFile` types.

---

## Shared Patterns

### Generation Guard (D-15 / CR-02)
**Source:** `src/main/telegram/MembershipScanner.ts` lines 93, 128, 144, 157, 189, 217
**Apply to:** `RemovalExecutor.ts` — every `governor.run()` await must be followed by a generation check before the checkpoint write (Pitfall 7). The `retryRemovalGroup()` method must capture `gen = this._generation` BEFORE the async gap and guard AFTER (CR-02).
```typescript
const gen = ++this._generation
// ... before await:
if (gen !== this._generation || signal.aborted) return
// ... after await AND before checkpoint:
if (gen !== this._generation || signal.aborted) return
this._auditStore.checkpoint(dialog.id, outcome)
```

### Governor.run() Routing
**Source:** `src/main/telegram/MembershipScanner.ts` lines 263-275, `src/main/telegram/ParticipantSearcher.ts` lines 271-282
**Apply to:** All Telegram API calls in `RemovalExecutor.ts`
```typescript
await this._governor.run(() =>
  this._client.invoke(new Api.channels.EditBanned({ ... }))
)
```
Never use `client.kickParticipant()` — always `client.invoke()` directly (RESEARCH anti-pattern).

### PEER_FLOOD Hard-Stop Detection
**Source:** `src/main/telegram/operationErrors.ts` lines 83-85, `src/shared/opTypes.ts` lines 59-64
**Apply to:** `RemovalExecutor.ts` outer catch block
```typescript
import { classifyRpcError } from './operationErrors'
// In executor outer catch:
const classified = classifyRpcError(err)
if (classified.disposition === 'hard-stop') {
  // Checkpoint current state, mark remaining as NOT skipped (resumable)
  this._auditStore.setStatus('hard-stopped')
  this._emit({ step: 'hard-stopped', ... })
  return  // do NOT continue loop
}
// Per-group failure isolation: continue loop for all other dispositions
```

### Error Handling (classifyRpcError extension)
**Source:** `src/main/telegram/operationErrors.ts` lines 74-146
**Apply to:** `RemovalExecutor._classifyRemovalError()` — handle `USER_NOT_PARTICIPANT` BEFORE calling `classifyRpcError`:
```typescript
private _classifyRemovalError(err: unknown): RemovalGroupOutcome {
  const msg: string = (err as { errorMessage?: string })?.errorMessage ?? ''
  if (msg === 'USER_NOT_PARTICIPANT') return { status: 'already-gone', dialogId: '', timestamp: '' }
  // ... RMV_* specific codes ...
  // Fall through to classifyRpcError for PEER_FLOOD / FLOOD_WAIT / NETWORK
  const classified = classifyRpcError(err)
  if (classified.disposition === 'hard-stop') throw err  // re-throw for outer handler
  return { status: 'failed', errorCode: 'UNKNOWN', dialogId: '', timestamp: '' }
}
```

### Lazy Electron/fs Imports (no module-parse side effects)
**Source:** `src/main/storage/secrets.ts` lines 54-62
**Apply to:** `src/main/storage/auditStore.ts` — wrap all `require('electron')` and `require('node:fs')` calls inside functions so the module can be imported in test environments without Electron.

### win.isDestroyed() Push Guard
**Source:** `src/main/ipc/searchChannels.ts` lines 133-136
**Apply to:** `emitRemovalState()` in `removalChannels.ts`
```typescript
export function emitRemovalState(win: BrowserWindow, state: RemovalState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(REMOVAL_STATE, state)
  }
}
```

### Mock Client Extension Pattern
**Source:** `src/main/telegram/__mocks__/telegramClient.ts` lines 57-152 (MockClientConfig) and 205-374 (invoke dispatch)
**Apply to:** Extend `MockClientConfig` with `removeSuccessDialogIds`, `removeAlreadyGoneDialogIds`, `removeErrorDialogIds` per RESEARCH.md Mock Client Extensions section. Add `EditBanned` and `DeleteChatUser` dispatch branches to the `invoke()` switch, following the same `ctorName === 'X' || className === 'X.Y'` pattern.

### wiring in `src/main/index.ts`
**Source:** `src/main/index.ts` lines 222-254 (scanner + searcher wiring)
**Apply to:** Construct `RemovalExecutor` after the existing `searcher` construction, before `registerTargetChannels`. Wire `onStateChange` with `emitRemovalState(currentWin, state)` lambda (same WR-03 `currentWin` binding). Read job file for incomplete jobs BEFORE `sm.initialize()` (per RESEARCH resume flow). Pass `executor` to an updated `registerTargetChannels` so TARGET_RESET calls `executor.abortExecution()` first (CR-01 ordering).

---

## No Analog Found

All Phase 5 files have close analogs in the existing codebase. No files require falling back to RESEARCH.md patterns exclusively.

| File | Role | Data Flow | Note |
|---|---|---|---|
| none | — | — | All files have exact or role-match analogs |

---

## Metadata

**Analog search scope:** `src/main/telegram/`, `src/main/storage/`, `src/main/ipc/`, `src/renderer/store/`, `src/renderer/ipc/`, `src/renderer/groups/`, `src/renderer/shell/`, `src/shared/`, `src/preload/`
**Files scanned:** 14 existing source files read in full
**Pattern extraction date:** 2026-06-12
