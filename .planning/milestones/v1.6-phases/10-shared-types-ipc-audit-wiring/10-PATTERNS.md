# Phase 10: Shared Types, IPC & Audit Wiring - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/shared/tagTypes.ts` | model (shared types) | n/a (pure types) | `src/shared/removalTypes.ts` | exact |
| `src/shared/channels.ts` | config (constants) | n/a | `src/shared/channels.ts` (REMOVAL_* block) | exact (extend in place) |
| `src/main/ipc/tagChannels.ts` | middleware/controller | request-response | `src/main/ipc/removalChannels.ts` | exact |
| `src/main/ipc/tagChannels.test.ts` | test | request-response | `src/main/ipc/removalChannels.test.ts` | exact |
| `src/main/storage/tagAuditStore.ts` | service | file-I/O | `src/main/storage/auditStore.ts` | exact |
| `src/main/storage/tagAuditStore.test.ts` | test | file-I/O | `src/main/storage/auditStore.test.ts` | exact |
| `src/renderer/ipc/tagClient.ts` | utility (renderer IPC wrapper) | request-response | `src/renderer/ipc/removalClient.ts` | exact |
| `src/preload/index.ts` | middleware (contextBridge) | request-response | `src/preload/index.ts` (REMOVAL_* block) | exact (extend in place) |
| `src/main/index.ts` | config (wiring) | n/a | `src/main/index.ts` lines 287–334 | exact (extend in place) |

---

## Pattern Assignments

### `src/shared/tagTypes.ts` (model, pure types)

**Analog:** `src/shared/removalTypes.ts`

**Full file structure to mirror** (lines 1–124 of analog):

```typescript
// src/shared/removalTypes.ts — complete structural template

// Imports pattern (lines 1–4):
// Pure type module — no imports. Comment block explains cross-process usage.

// Error code union (lines 10–16):
export type RmvErrorCode =
  | 'RMV_TARGET_IS_ADMIN'
  | 'RMV_NO_RIGHTS'
  | 'RMV_USER_INVALID'
  | 'RMV_CHANNEL_PRIVATE'
  | 'NETWORK'
  | 'UNKNOWN'

// Run step union (lines 25–32):
export type RemovalRunStep =
  | 'idle'
  | 'confirming'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'complete'
  | 'hard-stopped'

// Per-group outcome (lines 38–49):
export interface RemovalGroupOutcome {
  dialogId: string
  status: 'done' | 'already-gone' | 'failed' | 'skipped'
  errorCode?: RmvErrorCode
  note?: 'basic-group-ban-fallback' | null
  timestamp: string
}

// Summary (lines 54–61):
export interface RemovalSummary {
  removed: number
  alreadyGone: number
  failed: number
  skipped: number
  completedAt: string
}

// Live state — security boundary comment (lines 64–91):
export interface RemovalState {
  step: RemovalRunStep
  severity: 'kick' | 'ban'          // ← TagState replaces with: tag: string
  targetId: string
  targetName: string
  progress: { processed: number; total: number }
  outcomes: RemovalGroupOutcome[]
  summary?: RemovalSummary
  currentGroupId?: string
  floodWaitRemaining?: number | null
}

// Job file — schemaVersion + accessHash comment (lines 103–124):
export interface RemovalJobFile {
  schemaVersion: 1
  jobId: string
  severity: 'kick' | 'ban'          // ← TagJobFile replaces with: tag: string
  targetId: string
  targetName: string
  targetAccessHash: string
  dialogIds: string[]
  outcomes: RemovalGroupOutcome[]
  startedAt: string
  completedAt?: string
  status: 'running' | 'complete' | 'stopped' | 'hard-stopped'
}
```

**Tag-specific deltas from analog:**

| Analog field/type | Tag replacement | Reason |
|-------------------|----------------|---------|
| `RmvErrorCode` | `TagErrorCode` — add `TAG_TARGET_IS_ADMIN`, `TAG_UNSUPPORTED_BASIC_GROUP`, `TAG_NO_RIGHTS`, `TAG_USER_INVALID`, `TAG_CHANNEL_INVALID`, `NETWORK`, `UNKNOWN` | Tag error set includes admin/basic-group skips not present in removal |
| `RemovalRunStep` | `TagRunStep` — same 7 values verbatim | Identical step set |
| `status: 'done' \| 'already-gone' \| 'failed' \| 'skipped'` | `status: 'done' \| 'skipped' \| 'failed'` — NO `already-gone` | Tag has no "already-gone" concept; `skipped` + `errorCode` distinguishes admin vs basic-group |
| `note?: 'basic-group-ban-fallback' \| null` | Remove `note` entirely | No ban/kick distinction in tag flow |
| `severity: 'kick' \| 'ban'` in RemovalState | `tag: string` | The action parameter is a tag string, not a severity enum |
| `severity: 'kick' \| 'ban'` in RemovalJobFile | `tag: string` | Same |
| `RemovalSummary.removed` / `.alreadyGone` | `TagSummary.tagged` / no alreadyGone | Counts reflect tag outcomes |

---

### `src/shared/channels.ts` (config, extend in place)

**Analog:** `src/shared/channels.ts` lines 49–57 (REMOVAL_* block) and lines 77–118 (CHANNELS object)

**Block to add after line 57 (after REMOVAL_DISCARD_JOB)**:

```typescript
// src/shared/channels.ts lines 49–57 — REMOVAL_* block (reference pattern):
export const REMOVAL_START        = 'removal:start' as const        // { severity, dialogIds }
export const REMOVAL_ABORT        = 'removal:abort' as const
export const REMOVAL_RETRY_GROUP  = 'removal:retryGroup' as const   // { dialogId }
export const REMOVAL_GET_STATE    = 'removal:getState' as const
export const REMOVAL_STATE        = 'removal:state' as const        // push: main → renderer
export const REMOVAL_GET_JOB      = 'removal:getJob' as const
export const REMOVAL_DISCARD_JOB  = 'removal:discardJob' as const

// ← TAG_* block goes here, following identical comment + naming convention:
// Tag execution IPC channels (Phase 10, TAG-03/TAG-05).
// Pattern mirrors the REMOVAL_* block exactly above.
export const TAG_START       = 'tag:start' as const        // { dialogIds, tag }
export const TAG_ABORT       = 'tag:abort' as const
export const TAG_GET_STATE   = 'tag:getState' as const
export const TAG_STATE       = 'tag:state' as const        // push: main → renderer
export const TAG_GET_JOB     = 'tag:getJob' as const
export const TAG_DISCARD_JOB = 'tag:discardJob' as const
```

**CHANNELS object extension** (after `REMOVAL_DISCARD_JOB` entry at line ~111, before `SEVERITY_GET`):

```typescript
// src/shared/channels.ts lines 106–112 — pattern:
  REMOVAL_GET_JOB,
  REMOVAL_DISCARD_JOB,
  // ← add:
  TAG_START,
  TAG_ABORT,
  TAG_GET_STATE,
  TAG_STATE,
  TAG_GET_JOB,
  TAG_DISCARD_JOB,
  SEVERITY_GET,
```

**Note:** No `TAG_RETRY_GROUP` — tag executor does not support per-group retry in Phase 10/11 scope.

---

### `src/main/ipc/tagChannels.ts` (middleware/controller, request-response)

**Analog:** `src/main/ipc/removalChannels.ts` (complete file, lines 1–192)

**Imports pattern** (lines 21–35 of analog):

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { GroupEnumerator } from '../telegram/GroupEnumerator'
import {
  TAG_START,
  TAG_ABORT,
  TAG_GET_STATE,
  TAG_STATE,
  TAG_GET_JOB,
  TAG_DISCARD_JOB,
} from '@shared/channels'
import type { TagState } from '@shared/tagTypes'
```

**Zod schema pattern** (lines 43–53 of analog — RemovalStartSchema):

```typescript
// src/main/ipc/removalChannels.ts lines 43–46:
const RemovalStartSchema = z.object({
  severity: z.enum(['kick', 'ban']),
  dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500),
})

// Tag replacement — no severity field; tag replaces it:
const TagStartSchema = z.object({
  dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500),
  tag: z.string().min(1).max(255),  // conservative cap — tighten in Phase 12
})
```

**Function signature pattern** (lines 79–85 of analog):

```typescript
// src/main/ipc/removalChannels.ts lines 79–85:
export function registerRemovalChannels(
  win: BrowserWindow,
  executor: RemovalExecutor,
  enumerator: GroupEnumerator,
  auditStore: AuditStore,
  getAuthState: () => { step: string }
): void {

// Tag version — TagExecutorLike stub (Phase 11 replaces with real TagExecutor):
export interface TagExecutorLike {
  getState(): TagState
  abortExecution(): void
  // TAG_START handler calls executor.execute(), so the interface MUST include it even in
  // Phase 10 (the stub passes `execute: async () => {}`). Phase 11 swaps in the real impl.
  execute(args: { dialogIds: string[]; tag: string }): Promise<void>
}

export function registerTagChannels(
  win: BrowserWindow,
  executor: TagExecutorLike,
  enumerator: GroupEnumerator,
  auditStore: TagAuditStore,
  getAuthState: () => { step: string }
): void {
```

**void win suppression pattern** (line 87 of analog):

```typescript
// src/main/ipc/removalChannels.ts line 87:
void win
// Copy exactly — win is used by emitTagState wired in main/index.ts, not inline.
```

**Security gate chain pattern** (lines 92–128 of analog):

```typescript
// src/main/ipc/removalChannels.ts lines 92–128:
ipcMain.handle(REMOVAL_START, async (_event, payload: unknown) => {
  // Layer 1: Zod validation
  const parsed = RemovalStartSchema.parse(payload)

  // Layer 2: Auth gate
  if (getAuthState().step !== 'authorized') {
    return executor.getState()
  }

  // Layer 3: Double-start guard
  const currentStep = executor.getState().step
  if (currentStep === 'running' || currentStep === 'stopping') {
    return executor.getState()
  }

  // Layer 4: Dialog security gate
  const groupsState = enumerator.getState()
  if (groupsState.step === 'loaded') {
    const knownIds = new Set(groupsState.dialogs.map((d) => d.id))
    const unknownIds = parsed.dialogIds.filter((id) => !knownIds.has(id))
    if (unknownIds.length > 0) {
      throw new Error(
        `Payload contains unknown dialogId(s) — not in current enumeration: ${unknownIds.join(', ')}`
      )
    }
  }

  // Fire-and-forget
  executor.execute({ dialogIds: parsed.dialogIds, tag: parsed.tag }).catch(() => {})
  return executor.getState()
})
```

**Push helper pattern** (lines 187–191 of analog):

```typescript
// src/main/ipc/removalChannels.ts lines 187–191:
export function emitRemovalState(win: BrowserWindow, state: RemovalState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(REMOVAL_STATE, state)
  }
}

// Tag version:
export function emitTagState(win: BrowserWindow, state: TagState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(TAG_STATE, state)
  }
}
```

**Note on retryGroup:** Do NOT include `TAG_RETRY_GROUP` handler — removal analog has it but tag scope excludes it in Phase 10/11.

---

### `src/main/ipc/tagChannels.test.ts` (test)

**Analog:** `src/main/ipc/removalChannels.test.ts` (complete file, lines 1–335)

**Electron mock pattern** (lines 21–32 of analog):

```typescript
// src/main/ipc/removalChannels.test.ts lines 21–32:
type IpcHandler = (_event: unknown, payload: unknown) => Promise<unknown>
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

**Mock window factory** (lines 39–45 of analog):

```typescript
// src/main/ipc/removalChannels.test.ts lines 39–45:
function makeMockWin(destroyed = false) {
  return {
    webContents: { send: vi.fn() },
    isDestroyed: () => destroyed,
  }
}
```

**IDLE_STATE fixture pattern** (lines 48–55 of analog — adapt for TagState):

```typescript
// src/main/ipc/removalChannels.test.ts lines 48–55:
const IDLE_STATE: RemovalState = {
  step: 'idle',
  severity: 'ban',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}

// Tag version:
const IDLE_TAG_STATE: TagState = {
  step: 'idle',
  tag: '',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}
```

**Mock executor factory** (lines 57–66 of analog — adapt for TagExecutorLike):

```typescript
// src/main/ipc/removalChannels.test.ts lines 57–66:
function makeMockExecutor(initialState: RemovalState = IDLE_STATE) {
  const state = { current: initialState }
  return {
    execute: vi.fn(async () => {}),
    abortExecution: vi.fn(() => {}),
    retryGroup: vi.fn(async () => {}),
    getState: vi.fn(() => state.current),
  }
}

// Tag version (no retryGroup):
function makeMockExecutor(initialState: TagState = IDLE_TAG_STATE) {
  const state = { current: initialState }
  return {
    execute: vi.fn(async () => {}),
    abortExecution: vi.fn(() => {}),
    getState: vi.fn(() => state.current),
  }
}
```

**Mock enumerator factory** (lines 69–76 of analog):

```typescript
// src/main/ipc/removalChannels.test.ts lines 69–76 — copy verbatim:
function makeMockEnumerator(dialogIds: string[] = ['111', '222', '333']) {
  return {
    getState: vi.fn(() => ({
      step: 'loaded' as const,
      dialogs: dialogIds.map((id) => ({ id, title: `Group ${id}`, type: 'supergroup' as const })),
    })),
  }
}
```

**Mock audit store factory** (lines 79–103 of analog — adapt for TagJobFile):

```typescript
// src/main/ipc/removalChannels.test.ts lines 79–103:
function makeMockAuditStore(jobDialogIds: string[] | null = null) {
  return {
    readJob: vi.fn(() => jobDialogIds !== null ? {
      schemaVersion: 1 as const,
      jobId: '2026-06-12T00:00:00.000Z',
      severity: 'ban' as const,
      targetId: '999', targetName: 'Test User',
      targetAccessHash: '12345',
      dialogIds: jobDialogIds,
      outcomes: [], startedAt: '2026-06-12T00:00:00.000Z',
      status: 'running' as const,
    } : null),
    clearJob: vi.fn(() => {}), initJob: vi.fn(() => {}),
    checkpoint: vi.fn(() => {}), setStatus: vi.fn(() => {}),
    getRemaining: vi.fn(() => jobDialogIds ?? []),
  }
}

// Tag version — swap severity for tag:
function makeMockTagAuditStore(jobDialogIds: string[] | null = null) {
  return {
    readJob: vi.fn(() => jobDialogIds !== null ? {
      schemaVersion: 1 as const,
      jobId: '2026-06-20T00:00:00.000Z',
      tag: 'TestTag',
      targetId: '999', targetName: 'Test User',
      targetAccessHash: '12345',
      dialogIds: jobDialogIds,
      outcomes: [], startedAt: '2026-06-20T00:00:00.000Z',
      status: 'running' as const,
    } : null),
    clearJob: vi.fn(() => {}), initJob: vi.fn(() => {}),
    checkpoint: vi.fn(() => {}), setStatus: vi.fn(() => {}),
    getRemaining: vi.fn(() => jobDialogIds ?? []),
  }
}
```

**beforeEach cleanup pattern** (lines 115–117 of analog):

```typescript
// src/main/ipc/removalChannels.test.ts lines 115–117:
beforeEach(() => {
  Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
})
```

**Test case structure** (lines 119–335 of analog — adapt channel name and schema):

Copy the test case structure substituting:
- `'removal:start'` → `'tag:start'`
- `{ severity: 'ban', dialogIds: [...] }` → `{ dialogIds: [...], tag: 'TestTag' }`
- `RemovalState` → `TagState`
- Remove all `retryGroup` / `removal:retryGroup` test cases
- Add: `tag:start rejects tag: ''` (empty string fails `z.string().min(1)`)
- Add: `tag:start dispatches execute() with { dialogIds, tag } — identity never from payload`

---

### `src/main/storage/tagAuditStore.ts` (service, file-I/O)

**Analog:** `src/main/storage/auditStore.ts` (complete file, lines 1–248)

**Injectable deps interface pattern** (lines 29–48 of analog):

```typescript
// src/main/storage/auditStore.ts lines 29–48:
export interface AuditStoreFsDeps {
  writeFileSync(path: string, data: string | Buffer, opts?: unknown): void
  renameSync(from: string, to: string): void
  readFileSync(path: string): Buffer
  existsSync(path: string): boolean
  unlinkSync(path: string): void
}

export interface AuditStoreAppDeps {
  getPath(name: 'userData'): string
}

export interface AuditStoreDeps {
  fs?: AuditStoreFsDeps
  app?: AuditStoreAppDeps
  jobFileName?: string
}
```

**TagAuditStore interface** (mirrors AuditStore lines 52–93 but typed to TagJobFile):

```typescript
// src/main/storage/auditStore.ts lines 52–93 — copy structure, replace types:
export interface TagAuditStore {
  initJob(job: TagJobFile): void
  checkpoint(dialogId: string, outcome: TagGroupOutcome): void
  setStatus(status: TagJobFile['status'], completedAt?: string): void
  readJob(): TagJobFile | null
  clearJob(): void
  getRemaining(): string[]
}
```

**Zod schema pattern** (lines 97–117 of analog — adapt for TagJobFile):

```typescript
// src/main/storage/auditStore.ts lines 97–117:
const RemovalGroupOutcomeSchema = z.object({
  dialogId: z.string(),
  status: z.enum(['done', 'already-gone', 'failed', 'skipped']),
  errorCode: z.string().optional(),
  note: z.union([z.literal('basic-group-ban-fallback'), z.null()]).optional(),
  timestamp: z.string(),
})

const RemovalJobFileSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string(),
  severity: z.enum(['kick', 'ban']),
  targetId: z.string(), targetName: z.string(), targetAccessHash: z.string(),
  dialogIds: z.array(z.string()),
  outcomes: z.array(RemovalGroupOutcomeSchema),
  startedAt: z.string(), completedAt: z.string().optional(),
  status: z.enum(['running', 'complete', 'stopped', 'hard-stopped']),
})

// Tag version — key differences:
const TagGroupOutcomeSchema = z.object({
  dialogId: z.string(),
  status: z.enum(['done', 'skipped', 'failed']),  // NO 'already-gone'
  errorCode: z.string().optional(),               // NO note field
  timestamp: z.string(),
})

const TagJobFileSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string(),
  tag: z.string(),                                // replaces severity
  targetId: z.string(), targetName: z.string(), targetAccessHash: z.string(),
  dialogIds: z.array(z.string()),
  outcomes: z.array(TagGroupOutcomeSchema),
  startedAt: z.string(), completedAt: z.string().optional(),
  status: z.enum(['running', 'complete', 'stopped', 'hard-stopped']),
})
```

**Factory function pattern** (lines 130–248 of analog):

```typescript
// src/main/storage/auditStore.ts lines 130–248:
export function createAuditStore(deps: AuditStoreDeps = {}): AuditStore {
  const jobFileName = deps.jobFileName ?? 'removal-job.json'
  const tmpFileName = `${jobFileName}.tmp`

  function resolveFs(): AuditStoreFsDeps { ... }   // lazy require
  function resolveApp(): AuditStoreAppDeps { ... }  // lazy require

  function jobPath(): string { ... }  // join(userData, jobFileName)
  function tmpPath(): string { ... }  // join(userData, tmpFileName)

  function writeAtomic(job: RemovalJobFile): void {
    const fs = resolveFs()
    fs.writeFileSync(tmpPath(), JSON.stringify(job, null, 2), { mode: 0o600 })
    fs.renameSync(tmpPath(), jobPath())
  }

  let _currentJob: RemovalJobFile | null = null

  return {
    initJob(job): void { _currentJob = { ...job, outcomes: [...job.outcomes] }; writeAtomic(_currentJob) },
    checkpoint(dialogId, outcome): void { /* read-modify-write + writeAtomic */ },
    setStatus(status, completedAt?): void { /* read-modify-write + writeAtomic */ },
    readJob(): RemovalJobFile | null {
      if (!fs.existsSync(path)) return null
      try {
        const result = RemovalJobFileSchema.safeParse(JSON.parse(raw))
        if (!result.success) return null
        return result.data as RemovalJobFile
      } catch { return null }
    },
    clearJob(): void { _currentJob = null; if (fs.existsSync(path)) fs.unlinkSync(path) },
    getRemaining(): string[] { ... },
  }
}
```

**Tag version factory name and hardcoded filename:**

```typescript
export function createTagAuditStore(deps: TagAuditStoreDeps = {}): TagAuditStore {
  const jobFileName = deps.jobFileName ?? 'tag-job.json'  // hardcoded different default
  // ... all internal logic mirrors createAuditStore exactly
  // ... with TagJobFile / TagGroupOutcome types throughout
}
```

**Critical lazy-require pattern** (lines 135–148 of analog — MUST copy verbatim):

```typescript
// src/main/storage/auditStore.ts lines 135–148:
function resolveFs(): AuditStoreFsDeps {
  if (deps.fs) return deps.fs
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node:fs') as AuditStoreFsDeps
}

function resolveApp(): AuditStoreAppDeps {
  if (deps.app) return deps.app
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as { app: AuditStoreAppDeps }
  return app
}
```

---

### `src/main/storage/tagAuditStore.test.ts` (test, file-I/O)

**Analog:** `src/main/storage/auditStore.test.ts` (complete file, lines 1–198)

**Fake fs factory** (lines 25–56 of analog — copy verbatim, add opts capture):

```typescript
// src/main/storage/auditStore.test.ts lines 25–56:
function createFakeFs() {
  const files: Record<string, string> = {}
  const renames: Array<{ from: string; to: string }> = []

  const fakeFs = {
    writeFileSync(path: string, data: string | Buffer, _opts?: unknown): void {
      files[path] = typeof data === 'string' ? data : data.toString('utf-8')
    },
    renameSync(from: string, to: string): void {
      if (files[from] === undefined) throw new Error(`ENOENT: no such file: ${from}`)
      files[to] = files[from]!
      delete files[from]
      renames.push({ from, to })
    },
    readFileSync(path: string): Buffer { ... },
    existsSync(path: string): boolean { return path in files },
    unlinkSync(path: string): void { delete files[path] },
    _files: files,
    _renames: renames,
  }
  return fakeFs
}
```

**0o600 mode verification** (extend fake fs to capture opts — not present in analog but required by research):

```typescript
// Extend writeFileSync to capture opts for mode assertion:
let _lastWriteOpts: unknown
writeFileSync(path: string, data: string | Buffer, opts?: unknown): void {
  files[path] = typeof data === 'string' ? data : data.toString('utf-8')
  _lastWriteOpts = opts
},
// Expose: _lastWriteOpts

// In test:
store.initJob(job)
expect(fakeFs._lastWriteOpts).toMatchObject({ mode: 0o600 })
```

**Fake app factory** (lines 58–64 of analog — copy verbatim):

```typescript
// src/main/storage/auditStore.test.ts lines 58–64:
function createFakeApp(userDataPath = '/fake/userData') {
  return {
    getPath(_name: 'userData') { return userDataPath },
  }
}
```

**Job fixture factory** (lines 68–82 of analog — adapt for TagJobFile):

```typescript
// src/main/storage/auditStore.test.ts lines 68–82:
function makeJob(overrides: Partial<RemovalJobFile> = {}): RemovalJobFile {
  return {
    schemaVersion: 1,
    jobId: '2026-06-12T14:32:00.000Z',
    severity: 'ban',
    targetId: '123456789', targetName: 'Anna Nováková',
    targetAccessHash: '9876543210',
    dialogIds: ['111', '222', '333'],
    outcomes: [], startedAt: '2026-06-12T14:32:00.000Z',
    status: 'running',
    ...overrides,
  }
}

// Tag version:
function makeTagJob(overrides: Partial<TagJobFile> = {}): TagJobFile {
  return {
    schemaVersion: 1,
    jobId: '2026-06-20T14:32:00.000Z',
    tag: 'TestTag',
    targetId: '123456789', targetName: 'Anna Nováková',
    targetAccessHash: '9876543210',
    dialogIds: ['111', '222', '333'],
    outcomes: [], startedAt: '2026-06-20T14:32:00.000Z',
    status: 'running',
    ...overrides,
  }
}
```

**Path constants** (lines 98–100 of analog — adapt for tag-job.json):

```typescript
// src/main/storage/auditStore.test.ts lines 98–100:
const USER_DATA = '/fake/userData'
const FINAL_PATH = `${USER_DATA}/removal-job.json`
const TMP_PATH   = `${USER_DATA}/removal-job.json.tmp`

// Tag version:
const FINAL_PATH = `${USER_DATA}/tag-job.json`
const TMP_PATH   = `${USER_DATA}/tag-job.json.tmp`
```

**Test structure to replicate** (lines 106–198 of analog):
- `writeJob: atomic write (temp file renamed to final path)` — verify `_renames` + `_files[FINAL_PATH]`
- `checkpoint: appends outcome to job file outcomes array` — two checkpoints, assert length 1 then 2
- `readJob: returns null when no job file present`
- `readJob: returns null when file contains invalid JSON`
- `readJob: validates schema with Zod; rejects unknown shape` — use missing `tag` field (not missing `severity`)
- `incomplete job detection: readJob returns job with status=running`
- `resume: remaining dialogIds = full list minus completed outcomes dialogIds`
- `0o600 mode: initJob writes with mode 0o600` (new — not in removal analog)

---

### `src/renderer/ipc/tagClient.ts` (utility, renderer IPC wrapper)

**Analog:** `src/renderer/ipc/removalClient.ts` (complete file, lines 1–48)

**Full structure to copy** (lines 1–48 of analog):

```typescript
// src/renderer/ipc/removalClient.ts lines 1–48:

// Import pattern (lines 4):
import type { RemovalState, RemovalJobFile } from '@shared/removalTypes'

// Interface augmentation pattern (lines 8–18):
declare global {
  interface MrsProperApi {
    startRemoval(severity: 'kick' | 'ban', dialogIds: string[]): Promise<RemovalState>
    abortRemoval(): Promise<RemovalState>
    retryRemovalGroup(dialogId: string): Promise<void>
    getRemovalState(): Promise<RemovalState>
    onRemovalState(cb: (s: RemovalState) => void): () => void
    getRemovalJob(): Promise<RemovalJobFile | null>
    discardRemovalJob(): Promise<null>
  }
}

// Client object pattern (lines 20–48):
export const removalClient = {
  startRemoval(severity, dialogIds) { return window.mrsproper.startRemoval(severity, dialogIds) },
  abortRemoval() { return window.mrsproper.abortRemoval() },
  retryRemovalGroup(dialogId) { return window.mrsproper.retryRemovalGroup(dialogId) },
  getRemovalState() { return window.mrsproper.getRemovalState() },
  onRemovalState(cb) { return window.mrsproper.onRemovalState(cb) },
  getRemovalJob() { return window.mrsproper.getRemovalJob() },
  discardRemovalJob() { return window.mrsproper.discardRemovalJob() },
}
```

**Tag version:**

```typescript
import type { TagState, TagJobFile } from '@shared/tagTypes'

declare global {
  interface MrsProperApi {
    startTag(dialogIds: string[], tag: string): Promise<TagState>
    abortTag(): Promise<TagState>
    getTagState(): Promise<TagState>
    onTagState(cb: (s: TagState) => void): () => void
    getTagJob(): Promise<TagJobFile | null>
    discardTagJob(): Promise<null>
  }
}

export const tagClient = {
  startTag(dialogIds: string[], tag: string): Promise<TagState> {
    return window.mrsproper.startTag(dialogIds, tag)
  },
  abortTag(): Promise<TagState> { return window.mrsproper.abortTag() },
  getTagState(): Promise<TagState> { return window.mrsproper.getTagState() },
  onTagState(cb: (s: TagState) => void): () => void { return window.mrsproper.onTagState(cb) },
  getTagJob(): Promise<TagJobFile | null> { return window.mrsproper.getTagJob() },
  discardTagJob(): Promise<null> { return window.mrsproper.discardTagJob() },
}
```

**Note:** No `retryTag` / `retryTagGroup` — tag scope excludes per-group retry.

---

### `src/preload/index.ts` (extend in place — contextBridge entries)

**Analog:** `src/preload/index.ts` lines 28–41 (REMOVAL_* imports) and lines 140–162 (removal bridge block)

**Imports to add** (after line 6, alongside existing type imports):

```typescript
// src/preload/index.ts lines 5–6:
import type { RemovalState, RemovalJobFile } from '../shared/removalTypes'
// ← add:
import type { TagState, TagJobFile } from '../shared/tagTypes'
```

**Channel imports to add** (after line 38, REMOVAL_DISCARD_JOB import):

```typescript
// src/preload/index.ts lines 28–41:
import {
  ...
  REMOVAL_DISCARD_JOB,
  // ← add:
  TAG_START,
  TAG_ABORT,
  TAG_GET_STATE,
  TAG_STATE,
  TAG_GET_JOB,
  TAG_DISCARD_JOB,
  SEVERITY_GET,
  ...
```

**contextBridge entries to add** (after line 162, discardRemovalJob entry, before getSeverity):

```typescript
// src/preload/index.ts lines 158–162 (pattern):
  getRemovalJob: (): Promise<RemovalJobFile | null> =>
    ipcRenderer.invoke(REMOVAL_GET_JOB) as Promise<RemovalJobFile | null>,
  discardRemovalJob: (): Promise<null> =>
    ipcRenderer.invoke(REMOVAL_DISCARD_JOB) as Promise<null>,

  // ← add tag block here:
  // ── Tag execution bridge (Phase 10, TAG-03/TAG-05) ───────────────────────
  // tag:start carries { dialogIds, tag }; Zod-validated + auth-gated + dialog-map-gated
  // in tagChannels.ts. Target identity is read from main process only (T-05-04-B).
  startTag: (dialogIds: string[], tag: string): Promise<TagState> =>
    ipcRenderer.invoke(TAG_START, { dialogIds, tag }) as Promise<TagState>,
  abortTag: (): Promise<TagState> =>
    ipcRenderer.invoke(TAG_ABORT) as Promise<TagState>,
  getTagState: (): Promise<TagState> =>
    ipcRenderer.invoke(TAG_GET_STATE) as Promise<TagState>,
  onTagState: (cb: (s: TagState) => void): (() => void) => {
    const h = (_: unknown, s: TagState): void => cb(s)
    ipcRenderer.on(TAG_STATE, h)
    return () => ipcRenderer.removeListener(TAG_STATE, h)
  },
  getTagJob: (): Promise<TagJobFile | null> =>
    ipcRenderer.invoke(TAG_GET_JOB) as Promise<TagJobFile | null>,
  discardTagJob: (): Promise<null> =>
    ipcRenderer.invoke(TAG_DISCARD_JOB) as Promise<null>,
```

**onTagState listener pattern** — copy from existing onRemovalState (lines 152–156 of analog):

```typescript
// src/preload/index.ts lines 152–156:
  onRemovalState: (cb: (s: RemovalState) => void): (() => void) => {
    const h = (_: unknown, s: RemovalState): void => cb(s)
    ipcRenderer.on(REMOVAL_STATE, h)
    return () => ipcRenderer.removeListener(REMOVAL_STATE, h)
  },
```

---

### `src/main/index.ts` (extend in place — wiring)

**Analog:** `src/main/index.ts` lines 287–334 (AuditStore + RemovalExecutor + job detection block)

**Import additions** (after line 17, alongside existing imports):

```typescript
// src/main/index.ts lines 17–18:
import { registerRemovalChannels, emitRemovalState } from './ipc/removalChannels'
// ← add:
import { registerTagChannels, emitTagState } from './ipc/tagChannels'
import { createTagAuditStore } from './storage/tagAuditStore'
```

**Wire tagAuditStore pattern** (mirrors lines 287–289 of analog):

```typescript
// src/main/index.ts lines 287–289:
const auditStore = createAuditStore()
// ← add after registerRemovalChannels call (around line 306):
const tagAuditStore = createTagAuditStore()
```

**Register tag channels pattern** (mirrors line 306 of analog):

```typescript
// src/main/index.ts line 306:
registerRemovalChannels(currentWin, executor, enumerator, auditStore, () => sm.getState())
// ← add after:
registerTagChannels(currentWin, /* TagExecutor stub */ { getState: () => IDLE_TAG_STATE, abortExecution: () => {} }, enumerator, tagAuditStore, () => sm.getState())
// Note: Phase 11 replaces the stub with real TagExecutor and wires onStateChange → emitTagState
```

**Launch-time job detection pattern** (mirrors lines 318–329 of analog):

```typescript
// src/main/index.ts lines 318–329:
const _pendingJob = auditStore.readJob()
if (_pendingJob && _pendingJob.status !== 'complete') {
  console.log('[main] Incomplete removal job detected on launch — resumable via renderer')
}
// ← add immediately after:
const _pendingTagJob = tagAuditStore.readJob()
if (_pendingTagJob && _pendingTagJob.status !== 'complete') {
  console.log('[main] Incomplete tag job detected on launch — resumable via renderer')
}
```

---

## Shared Patterns

### Injectable Deps (No Electron at Module Parse Time)

**Source:** `src/main/storage/auditStore.ts` lines 135–148
**Apply to:** `src/main/storage/tagAuditStore.ts`

All `require('electron')` and `require('node:fs')` calls go inside method bodies, never at module scope. The `deps.fs` / `deps.app` injection path is the clean test alternative. Violating this breaks the Vitest test runner.

```typescript
function resolveFs(): AuditStoreFsDeps {
  if (deps.fs) return deps.fs
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('node:fs') as AuditStoreFsDeps
}
function resolveApp(): AuditStoreAppDeps {
  if (deps.app) return deps.app
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as { app: AuditStoreAppDeps }
  return app
}
```

### Atomic Write (Crash Safety)

**Source:** `src/main/storage/auditStore.ts` lines 170–176
**Apply to:** `src/main/storage/tagAuditStore.ts` `writeAtomic()` function

```typescript
function writeAtomic(job: TagJobFile): void {
  const fs = resolveFs()
  fs.writeFileSync(tmpPath(), JSON.stringify(job, null, 2), { mode: 0o600 })
  fs.renameSync(tmpPath(), jobPath())
}
```

### Zod safeParse on Disk Read (T-05-03-A)

**Source:** `src/main/storage/auditStore.ts` lines 217–229
**Apply to:** `src/main/storage/tagAuditStore.ts` `readJob()` method

```typescript
readJob(): TagJobFile | null {
  const fs = resolveFs()
  const path = jobPath()
  if (!fs.existsSync(path)) return null
  try {
    const raw = fs.readFileSync(path).toString('utf-8')
    const parsed: unknown = JSON.parse(raw)
    const result = TagJobFileSchema.safeParse(parsed)
    if (!result.success) return null
    return result.data as TagJobFile
  } catch {
    return null
  }
},
```

### Security Gate Chain (4 layers)

**Source:** `src/main/ipc/removalChannels.ts` lines 92–128
**Apply to:** `src/main/ipc/tagChannels.ts` `TAG_START` handler

Order: Zod parse → auth gate → double-start guard → enumerator dialog-map gate → fire-and-forget execute.

### Identity Boundary (T-05-04-B)

**Source:** `src/main/ipc/removalChannels.ts` — `execute()` receives only parsed payload fields
**Apply to:** `src/main/ipc/tagChannels.ts`

The `tag:start` payload carries `{ dialogIds, tag }` only. Identity (`targetId`, `targetName`, `targetAccessHash`) is NEVER accepted from the renderer. It is read from `resolver.getResolvedUser()` inside `TagExecutor.execute()` (Phase 11), not in `tagChannels.ts`.

### Push Guard

**Source:** `src/main/ipc/removalChannels.ts` lines 187–191
**Apply to:** `src/main/ipc/tagChannels.ts` `emitTagState()`

```typescript
export function emitTagState(win: BrowserWindow, state: TagState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(TAG_STATE, state)
  }
}
```

### Interface Augmentation (Renderer IPC Client)

**Source:** `src/renderer/ipc/removalClient.ts` lines 8–18
**Apply to:** `src/renderer/ipc/tagClient.ts`

Use `declare global { interface MrsProperApi { ... } }` — same module augmentation pattern that composes with `authClient`, `groupsClient`, `searchClient`, and `removalClient` without conflicts.

---

## No Analog Found

All files in scope have exact analogs. No new patterns need to be sourced from RESEARCH.md examples.

---

## Metadata

**Analog search scope:** `src/shared/`, `src/main/ipc/`, `src/main/storage/`, `src/renderer/ipc/`, `src/preload/`
**Files scanned:** 9 source files + 2 test files read in full
**Pattern extraction date:** 2026-06-20
