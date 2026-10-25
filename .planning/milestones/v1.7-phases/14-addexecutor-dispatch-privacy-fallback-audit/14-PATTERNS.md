# Phase 14: AddExecutor — Dispatch, Privacy Fallback & Audit - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 13 (new/modified)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|----------------|
| `src/shared/addTypes.ts` | model (shared types) | CRUD (state/job shapes) | `src/shared/tagTypes.ts` (+ `src/shared/removalTypes.ts` for job-file/outcome shape) | exact |
| `src/main/telegram/AddExecutor.ts` | controller (execution engine) | event-driven / request-response | `src/main/telegram/RemovalExecutor.ts` (clone shape) + `src/main/telegram/TagExecutor.ts` (single-client, generation-guard refinement) | exact |
| `src/main/telegram/addExecutor.test.ts` | test | event-driven | `removalExecutor.test.ts` / `tagExecutor.test.ts` (not read directly — fixtures confirmed via RESEARCH.md `makeDialog` convention) | role-match |
| `src/main/storage/addAuditStore.ts` | service (storage/job persistence) | file-I/O (atomic write-then-rename) | `src/main/storage/tagAuditStore.ts` (+ `auditStore.ts` for cross-check) | exact (plus net-new continuation contract) |
| `src/main/storage/addAuditStore.test.ts` | test | file-I/O | (no direct analog test read — follow `tagAuditStore.ts`'s injectable-fs/app deps shape) | role-match |
| `src/main/storage/addLogStore.ts` | service (storage/append log) | file-I/O (append-only, plain text) | `src/main/storage/tagAuditStore.ts` (atomic-write mechanics only; log is append not overwrite — net-new) | partial (no append-only analog exists) |
| `src/main/storage/addLogStore.test.ts` | test | file-I/O | same partial analog as above | partial |
| `src/main/ipc/addChannels.ts` | route/controller (IPC) | request-response | `src/main/ipc/tagChannels.ts` (+ `removalChannels.ts` for `RETRY_GROUP`/job-dialogId gate) | exact |
| `src/main/ipc/addChannels.test.ts` | test | request-response | same as above | role-match |
| contact service (`src/main/contacts/contactService.ts` or `src/main/telegram/contactService.ts`) | service | request-response (single RPC, non-blocking) | No direct analog — closest shape is `severityChannels.ts`'s single-purpose wrapped call + `RemovalExecutor._removeFromGroup`'s `governor.run()` invoke pattern | partial |
| template store + IPC (`src/main/ipc/templateChannels.ts` or folded into `addChannels.ts`) | provider (electron-store preference) | CRUD (get/set) | `src/main/ipc/severityChannels.ts` | exact |
| `src/main/telegram/__mocks__/telegramClient.ts` (extension) | test fixture / mock | event-driven (call-recording dispatch) | itself — extend existing `invoke()` dispatch-by-constructor-name branches | exact |
| `src/main/telegram/TargetResolver.ts` (extension) | service (identity resolution) | request-response | itself — additive private-field extension | exact |
| `src/shared/channels.ts` (extension) | config (IPC constants) | — | itself — append `ADD_*` / `TEMPLATE_*` / `TARGET_ADD_CONTACT` block | exact |
| `src/main/index.ts` (wiring extension) | config (DI wiring) | — | itself — mirror the `RemovalExecutor`/`TagExecutor` wiring block (lines ~292–359) | exact |

## Pattern Assignments

### `src/shared/addTypes.ts` (model, CRUD)

**Analog:** `src/shared/tagTypes.ts` (structure) + `src/shared/removalTypes.ts` (job-file/outcome field precedent)

**Full-module structure to mirror** (`src/shared/tagTypes.ts` lines 1–145, `src/shared/removalTypes.ts` lines 1–125):
```typescript
// Mirrors tagTypes.ts shape exactly — swap the per-domain fields.
export type AddErrorCode =
  | 'ADD_NO_RIGHTS'
  | 'ADD_NOT_MUTUAL_CONTACT'   // defined for shape-completeness only — D-07 routes this
                                // RPC string to 'privacy-blocked', never to this code (Pitfall 4)
  | 'ADD_USER_CHANNELS_TOO_MUCH'
  | 'ADD_USER_KICKED'
  | 'ADD_TARGET_INVALID'
  | 'ADD_CHANNEL_FULL'
  | 'NETWORK'
  | 'UNKNOWN'

export type AddRunStep =
  | 'idle' | 'confirming' | 'running' | 'stopping' | 'stopped' | 'complete' | 'hard-stopped'

// D-19: exactly these five statuses.
export interface AddGroupOutcome {
  dialogId: string
  status: 'done' | 'already-member' | 'privacy-blocked' | 'failed' | 'skipped'
  errorCode?: AddErrorCode
  reason?: 'privacy' | 'channel-full'       // only when status === 'privacy-blocked'
  link?: string                             // only when status === 'privacy-blocked'
  premiumWouldAllow?: boolean               // D-09
  timestamp: string
}

export interface AddSummary {
  added: number
  alreadyMember: number
  privacyBlocked: number
  failed: number
  skipped: number
  completedAt: string
}

export interface AddState {
  step: AddRunStep
  targetId: string
  targetName: string
  progress: { processed: number; total: number }
  outcomes: AddGroupOutcome[]
  summary?: AddSummary
  currentGroupId?: string
  floodWaitRemaining?: number | null
  dmStatus?: 'pending' | 'sent' | 'refused' | 'not-needed'   // D-16
}

// D-16: schemaVersion 1, mode 0o600, continuation-aware (see AddExecutor pattern below —
// NOT a fresh jobId on every execute() call, unlike RemovalJobFile/TagJobFile).
export interface AddJobFile {
  schemaVersion: 1
  jobId: string
  targetId: string
  targetName: string
  targetAccessHash: string
  dialogIds: string[]
  outcomes: AddGroupOutcome[]
  dmStatus: 'pending' | 'sent' | 'refused' | 'not-needed'
  startedAt: string
  completedAt?: string
  status: 'running' | 'complete' | 'stopped' | 'hard-stopped'
}

export type AddJobFileSafe = Omit<AddJobFile, 'targetAccessHash'>
```

**Divergence from the Tag/Removal precedent (flag explicitly in the plan):** `AddJobFile`/`AddState` add `dmStatus` — no existing job-file type has this field. `AddGroupOutcome` adds `reason`, `link`, `premiumWouldAllow` — no existing outcome type carries these. These are net-new, not copy-paste.

---

### `src/main/telegram/AddExecutor.ts` (controller, event-driven)

**Analog:** `src/main/telegram/RemovalExecutor.ts` (clone starting point) + `src/main/telegram/TagExecutor.ts` (refined guard-ordering helpers to prefer)

**Imports pattern** (`RemovalExecutor.ts` lines 33–41):
```typescript
import bigInt from 'big-integer'
import { Api } from 'telegram'
import type { AddState, AddGroupOutcome, AddJobFile } from '@shared/addTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { RateLimitGovernor } from './governor'
import type { GroupEnumerator } from './GroupEnumerator'
import type { AddAuditStore } from '../storage/addAuditStore'
import { classifyRpcError } from './operationErrors'
import type { GovernorEvent } from '@shared/opTypes'
```

**Constructor options pattern** (`RemovalExecutor.ts` lines 51–64, extend `resolver` return shape per Pitfall 1):
```typescript
export interface AddExecutorOptions {
  client: AddExecutorClient
  governor: RateLimitGovernor
  enumerator: GroupEnumerator
  /** TargetResolver — extended per Pitfall 1 to also expose deleted/bot/contact flags. */
  resolver: {
    getResolvedUser(): {
      id: bigint; accessHash: bigint; name?: string
      deleted?: boolean; bot?: boolean; contact?: boolean
    } | null
  }
  auditStore: AddAuditStore
  onStateChange: (state: AddState) => void
}
```

**Generation-guard + abort-first ordering — prefer TagExecutor's explicit split** (`TagExecutor.ts` lines 183–187, 210–214, 223–227, 236–241, 244–249):
```typescript
// Order matters: abortExecution() both aborts the signal AND bumps _generation, so
// check the signal first — abort owns the "mark remaining skipped + emit stopped" path.
// A bare generation mismatch means a NEWER execute() superseded this run — exit silently.
if (signal.aborted) {
  this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
  return
}
if (gen !== this._generation) return
```
This is the WR-01 ordering CONTEXT.md D-01 requires; `TagExecutor.ts` is the file that already fixed it (see Phase 13 REVIEW-FIX), so prefer it over `RemovalExecutor.ts`'s older combined `gen !== this._generation || signal.aborted` check at lines 207, 277, 313.

**Per-group dispatch skeleton — basic-group vs supergroup/channel branch** (`RemovalExecutor.ts` lines 487–604, `_removeFromGroup`):
```typescript
private async _addToGroup(
  dialog: AdminDialogDTO,
  resolved: { id: bigint; accessHash: bigint },
): Promise<AddGroupOutcome> {
  const timestamp = new Date().toISOString()
  const inputUser = new Api.InputPeerUser({
    userId: bigInt(resolved.id.toString()),
    accessHash: bigInt(resolved.accessHash.toString()),
  })

  if (dialog.type === 'basic-group') {
    const entity = this._enumerator.getDialogEntity(dialog.id) as { id?: { toString(): string } } | null
    const chatId = entity?.id ? bigInt(entity.id.toString()) : bigInt(dialog.id)
    // D-03: fwdLimit 1000 → retry once with 100 on explicit rejection (see RESEARCH Pattern 2)
    const result = await this._governor.run(() =>
      this._client.invoke(new Api.messages.AddChatUser({ chatId, userId: inputUser, fwdLimit: 1000 }))
    ) as { missingInvitees: Array<{ userId: unknown }> }
    // D-07: missing_invitees → privacy-blocked (see Pattern 2 below for the shared builder)
    ...
  }

  // supergroup | broadcast-channel — mirrors RemovalExecutor's channelEntity extraction
  // (lines 531-544) for InputChannel construction, then:
  //   D-02: if scan status is 'banned', channels.EditBanned (empty rights) FIRST,
  //   as its own governor.run() — reuse the exact unban call at RemovalExecutor.ts
  //   lines 579-591 verbatim (see "Unban-before-invite" excerpt below).
  // Then channels.InviteToChannel(InputChannel, [InputUser]).
}
```

**Unban-before-invite — reuse verbatim** (`RemovalExecutor.ts` lines 579–591):
```typescript
// Call 2: unban (empty rights — all flags omitted/false, untilDate=0)
await this._governor.run(() =>
  this._client.invoke(
    new Api.channels.EditBanned({
      channel: inputChannel,
      participant: inputUser,
      bannedRights: new Api.ChatBannedRights({
        untilDate: 0,
        // All ban flags omitted → all default to false (unban)
      }),
    })
  )
)
```
D-04: this is its own independent `governor.run()` call — never combine with the invite call in one `run()` (same anti-pattern guard `RemovalExecutor.ts` documents at its file header, lines 25–30).

**Error classification skeleton — branch order is load-bearing** (`TagExecutor.ts` lines 436–467, `_classifyTagError`):
```typescript
private _classifyAddError(err: unknown, dialogId: string): AddGroupOutcome {
  const timestamp = new Date().toISOString()

  // (1) HARD-STOP FIRST — PEER_FLOOD must re-throw before any string matching (Pitfall 1 in both executors).
  const classified = classifyRpcError(err)
  if (classified.disposition === 'hard-stop') throw err

  const msg: string = (err as { errorMessage?: string })?.errorMessage ?? ''

  // D-07: privacy-blocked from legacy error strings (NOT 'failed' — Pitfall 4 / A-05 in RESEARCH)
  if (msg === 'USER_PRIVACY_RESTRICTED' || msg === 'USER_NOT_MUTUAL_CONTACT') {
    // build privacy-blocked outcome + inline ExportChatInvite (D-10) — see Pattern 4 below
  }
  if (msg === 'CHAT_ADMIN_REQUIRED') return { dialogId, status: 'failed', errorCode: 'ADD_NO_RIGHTS', timestamp }
  if (msg === 'USER_ALREADY_PARTICIPANT') return { dialogId, status: 'already-member', timestamp } // D-06
  if (msg === 'INPUT_USER_DEACTIVATED') return { dialogId, status: 'failed', errorCode: 'ADD_TARGET_INVALID', timestamp }
  if (msg === 'USER_CHANNELS_TOO_MUCH') return { dialogId, status: 'failed', errorCode: 'ADD_USER_CHANNELS_TOO_MUCH', timestamp }
  if (msg === 'USER_KICKED') return { dialogId, status: 'failed', errorCode: 'ADD_USER_KICKED', timestamp }
  // USERS_TOO_MUCH: branch by dialog.type per RESEARCH Pitfall 3 — channel → privacy-blocked
  // reason:'channel-full' (+link); basic-group → failed(ADD_CHANNEL_FULL), no link.

  if (classified.disposition === 'retry' || classified.code === 'NETWORK') {
    return { dialogId, status: 'failed', errorCode: 'NETWORK', timestamp }
  }
  return { dialogId, status: 'failed', errorCode: 'UNKNOWN', timestamp }
}
```

**D-05 pre-flight guard (zero API traffic for deleted/bot target)** — net-new, no existing executor has this exact shape; closest precedent is `TagExecutor._tagGroup`'s `GetParticipant` pre-check pattern (lines 340–361) which also short-circuits before the write call:
```typescript
// Before the per-group loop starts (once per run, not per group):
if (resolved.deleted || resolved.bot) {
  const now = new Date().toISOString()
  const allFailed = selectedDialogs.map(d => ({
    dialogId: d.id, status: 'failed' as const, errorCode: 'ADD_TARGET_INVALID' as const, timestamp: now,
  }))
  // checkpoint each, emit complete — zero governor.run() calls issued
}
```

**Continuation-based resume — the one NEW pattern with no direct analog (RESEARCH Pattern 1, critical finding):**
Neither `RemovalExecutor.execute()` (`RemovalExecutor.ts` lines 176–190) nor `TagExecutor.execute()` (`TagExecutor.ts` lines 148–162) ever reuse a `jobId` — both call `initJob()` unconditionally every call. AddExecutor **must deviate**: D-13/D-18 require the final DM and the add-log follow-up block to reference the *same* `jobId` across a stop→resume cycle. Do not copy the `initJob()`-always line; branch on `auditStore.readJob()` first (see RESEARCH.md Pattern 1 code block, lines 215–239, for the exact recommended shape). This is the single highest-risk deviation from the analog — call it out explicitly in the plan rather than silently cloning.

**Summary builder** (`TagExecutor.ts` lines 472–479 shape, `RemovalExecutor.ts` lines 654–665 shape):
```typescript
private _buildSummary(outcomes: AddGroupOutcome[], completedAt: string) {
  return {
    added: outcomes.filter(o => o.status === 'done').length,
    alreadyMember: outcomes.filter(o => o.status === 'already-member').length,
    privacyBlocked: outcomes.filter(o => o.status === 'privacy-blocked').length,
    failed: outcomes.filter(o => o.status === 'failed').length,
    skipped: outcomes.filter(o => o.status === 'skipped').length,
    completedAt,
  }
}
```

---

### `src/main/storage/addAuditStore.ts` (service, file-I/O)

**Analog:** `src/main/storage/tagAuditStore.ts` (verified near-identical to `auditStore.ts`)

**Full dependency/factory pattern to clone** (`tagAuditStore.ts` lines 1–248 — copy wholesale, rename `Tag`→`Add`, `tag-job.json`→`add-job.json`):
```typescript
export interface AddAuditStoreFsDeps {
  writeFileSync(path: string, data: string | Buffer, opts?: unknown): void
  renameSync(from: string, to: string): void
  readFileSync(path: string): Buffer
  existsSync(path: string): boolean
  unlinkSync(path: string): void
}
export interface AddAuditStoreAppDeps { getPath(name: 'userData'): string }
export interface AddAuditStoreDeps {
  fs?: AddAuditStoreFsDeps
  app?: AddAuditStoreAppDeps
  jobFileName?: string   // default: 'add-job.json'
}
```

**Zod schema pattern** (`tagAuditStore.ts` lines 96–115 — extend with Add-specific fields):
```typescript
const AddGroupOutcomeSchema = z.object({
  dialogId: z.string(),
  status: z.enum(['done', 'already-member', 'privacy-blocked', 'failed', 'skipped']),
  errorCode: z.string().optional(),
  reason: z.enum(['privacy', 'channel-full']).optional(),
  link: z.string().optional(),
  premiumWouldAllow: z.boolean().optional(),
  timestamp: z.string(),
})
const AddJobFileSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string(),
  targetId: z.string(),
  targetName: z.string(),
  targetAccessHash: z.string(),
  dialogIds: z.array(z.string()),
  outcomes: z.array(AddGroupOutcomeSchema),
  dmStatus: z.enum(['pending', 'sent', 'refused', 'not-needed']),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['running', 'complete', 'stopped', 'hard-stopped']),
})
```

**Atomic write pattern — copy exactly** (`tagAuditStore.ts` lines 165–176):
```typescript
function writeAtomic(job: AddJobFile): void {
  const fs = resolveFs()
  const tmp = tmpPath()
  const final = jobPath()
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, final)
}
```

**Net-new contract (no analog):** `initJob()`/`checkpoint()`/`setStatus()`/`readJob()`/`clearJob()`/`getRemaining()` all carry over unchanged in signature, but the **caller-side contract changes**: `AddExecutor.execute()` must call `readJob()` BEFORE deciding whether to call `initJob()` (continuation check — see AddExecutor pattern above). `addAuditStore.ts` itself needs no new method for this if the planner picks RESEARCH Open Question 1's Option (b); if Option (a) is chosen, add an explicit method (e.g. `hasActiveJobFor(targetId, dialogIds): boolean`) — flag this choice for planning.

---

### `src/main/storage/addLogStore.ts` (service, file-I/O, append-only)

**No existing append-only analog in the codebase.** Closest mechanical precedent is `tagAuditStore.ts`'s atomic-write primitive (`writeAtomic`, lines 165–176) and its injectable-fs/app dependency shape (lines 28–47) — reuse the DI pattern, but the write mode is append (`fs.appendFileSync` or read-whole-then-write-whole with `{ mode: 0o600 }`), not overwrite-via-rename, since D-17 requires "kept forever, never rewritten in place."

```typescript
// Recommended shape (net-new — no file to copy from):
export interface AddLogStoreDeps {
  fs?: { appendFileSync(path: string, data: string, opts?: unknown): void; existsSync(path: string): boolean }
  app?: { getPath(name: 'userData'): string }
  logFileName?: string   // default: 'add-log.txt'
}
export interface AddLogStore {
  /** D-18: one block per run at terminal state; resumed runs append a follow-up block
   *  referencing the original jobId instead of rewriting the first block. */
  appendBlock(entry: {
    jobId: string; isFollowUp: boolean; targetId: string; targetName: string
    addedDialogs: Array<{ dialogId: string }>
    linkedDialogs: Array<{ dialogId: string; link: string }>
    dmStatus: 'sent' | 'refused' | 'not-needed'
    timestamp: string
  }): void
}
```
Mode `0o600` on every write — mirror `writeAtomic`'s `{ mode: 0o600 }` option (`tagAuditStore.ts` line 174). Since this is a brand-new file type in the project, write the test file (`addLogStore.test.ts`) using the same injectable-fs-deps test harness style `tagAuditStore.ts` uses (constructor-injected fake fs/app — no real disk I/O in tests).

---

### `src/main/ipc/addChannels.ts` (route/controller, request-response)

**Analog:** `src/main/ipc/tagChannels.ts` (primary) + `src/main/ipc/removalChannels.ts` (for `RETRY_GROUP` + job-dialogId gate, which `tagChannels.ts` omits)

**Zod schema pattern** (`tagChannels.ts` lines 53–56, `removalChannels.ts` lines 43–53):
```typescript
const AddStartSchema = z.object({
  dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500),
  // No severity/tag-equivalent field — AddExecutor reads target from resolver only.
})
const AddRetryGroupSchema = z.object({ dialogId: z.string().min(1).max(30) })
```

**Four-layer security gate chain — copy structure exactly** (`tagChannels.ts` lines 93–136):
```typescript
ipcMain.handle(ADD_START, async (_event, payload: unknown) => {
  const parsed = AddStartSchema.parse(payload)                         // Layer 1: Zod
  if (getAuthState().step !== 'authorized') return executor.getState() // Layer 2: auth gate
  const currentStep = executor.getState().step
  if (currentStep === 'running' || currentStep === 'stopping') return executor.getState() // Layer 3: double-start guard
  const groupsState = enumerator.getState()                            // Layer 4: dialog-map gate
  if (groupsState.step !== 'loaded') return executor.getState()
  const knownIds = new Set(groupsState.dialogs.map((d) => d.id))
  const unknownIds = parsed.dialogIds.filter((id) => !knownIds.has(id))
  if (unknownIds.length > 0) {
    throw new Error(`Payload contains unknown dialogId(s): ${unknownIds.join(', ')}`)
  }
  executor.execute({ dialogIds: parsed.dialogIds }).catch(() => {})
  return executor.getState()
})
```

**RETRY_GROUP job-dialogId gate — borrow from removalChannels.ts** (`removalChannels.ts` lines 136–160, since `tagChannels.ts` has no retryGroup handler):
```typescript
ipcMain.handle(ADD_RETRY_GROUP, async (_event, payload: unknown) => {
  const parsed = AddRetryGroupSchema.parse(payload)
  if (getAuthState().step !== 'authorized') return executor.getState()
  const job = auditStore.readJob()
  if (!job || !job.dialogIds.includes(parsed.dialogId)) {
    throw new Error('Unknown dialogId — not in current job')
  }
  executor.retryGroup(parsed.dialogId).catch(() => {})
  return executor.getState()
})
```

**GET_JOB accessHash-stripping pattern** (`tagChannels.ts` lines 154–162 — `AddJobFile` needs the same strip, `RemovalJobFile`'s GET_JOB at `removalChannels.ts` lines 169–171 does NOT strip, which is a known inconsistency; follow the stricter `tagChannels.ts` version):
```typescript
ipcMain.handle(ADD_GET_JOB, async (): Promise<AddJobFileSafe | null> => {
  const job = auditStore.readJob()
  if (!job) return null
  const { targetAccessHash: _stripped, ...safe } = job
  return safe
})
```

**State push helper** (`tagChannels.ts` lines 178–182):
```typescript
export function emitAddState(win: BrowserWindow, state: AddState): void {
  if (!win.isDestroyed()) win.webContents.send(ADD_STATE, state)
}
```

**Contact-add + template IPC — fold into addChannels.ts or separate files per Claude's Discretion.** `target:add-contact` handler shape (non-blocking, `{ ok, code? }` return, no Zod payload needed beyond confirmation per D-08):
```typescript
ipcMain.handle(TARGET_ADD_CONTACT, async () => {
  if (getAuthState().step !== 'authorized') return { ok: false }
  try {
    const result = await contactService.addIfMissing()
    return result  // { ok: boolean, code?: string }
  } catch {
    return { ok: false }  // D-08: non-blocking — never throws across IPC
  }
})
```

---

### Template store + IPC (`addTemplateStore.ts` / `templateChannels.ts`)

**Analog:** `src/main/ipc/severityChannels.ts` (exact — ESM-safe lazy electron-store factory)

**Full pattern to clone** (`severityChannels.ts` lines 1–77):
```typescript
type TemplateStore = import('electron-store').default<{ template: string | null }>
let _store: TemplateStore | null = null

async function getStore(): Promise<TemplateStore> {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store<{ template: string | null }>({ defaults: { template: null } })
  }
  return _store
}

const TemplateSetSchema = z.object({ template: z.string().min(1).max(4000) })

export function registerTemplateChannels(): void {
  ipcMain.handle(TEMPLATE_GET, async () => {
    const store = await getStore()
    return store.get('template', null)   // null → renderer/render-fn uses built-in default by app language
  })
  ipcMain.handle(TEMPLATE_SET, async (_event, payload: unknown) => {
    const { template } = TemplateSetSchema.parse(payload)
    const store = await getStore()
    store.set('template', template)
    return template
  })
}
```
D-15: placeholders are literal `{name}`/`{links}` — render function is a two-line `String.replace`, no templating library (per RESEARCH "Don't Hand-Roll" table). No analog exists for the render function itself; write it as a pure function in the same module:
```typescript
export function renderTemplate(template: string, vars: { name: string; links: string }): string {
  return template.replace(/\{name\}/g, vars.name).replace(/\{links\}/g, vars.links)
}
```

---

### Contact service (`contactService.ts`)

**No direct analog exists** — this is the first non-blocking, single-RPC "service" module in the codebase (everything else is either an executor loop or an IPC-store pair). Closest structural precedent: the single governed `client.invoke()` call pattern every executor uses, wrapped in a try/catch that never throws outward (mirrors D-08's "failure never prevents the run from starting").

```typescript
// Recommended shape — no file to copy, assemble from governor.run() + Api.contacts.AddContact (RESEARCH Pattern 5):
export interface ContactServiceDeps {
  client: { invoke(request: unknown): Promise<unknown> }
  governor: RateLimitGovernor
  resolver: { getResolvedUser(): { id: bigint; accessHash: bigint; name?: string; contact?: boolean } | null }
}
export function createContactService(deps: ContactServiceDeps) {
  return {
    async addIfMissing(): Promise<{ ok: boolean; code?: string }> {
      const resolved = deps.resolver.getResolvedUser()
      if (!resolved) return { ok: false }
      if (resolved.contact) return { ok: true }  // already a contact — skip per D-08
      const inputUser = new Api.InputPeerUser({
        userId: bigInt(resolved.id.toString()),
        accessHash: bigInt(resolved.accessHash.toString()),
      })
      try {
        await deps.governor.run(() =>
          deps.client.invoke(new Api.contacts.AddContact({
            id: inputUser,
            firstName: resolved.name || 'Contact',
            lastName: '',
            phone: '',
          }))
        )
        return { ok: true }
      } catch (err) {
        const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
        return { ok: false, code: msg || 'UNKNOWN' }
      }
    },
  }
}
```

---

### `src/main/telegram/__mocks__/telegramClient.ts` (extension)

**Analog:** itself — extend the existing dispatch-by-constructor-name `invoke()` branches

**Existing branch pattern to replicate for each new RPC** (`telegramClient.ts` lines 420–469, the `EditBanned` / `DeleteChatUser` / `EditChatParticipantRank` branches are the direct template):
```typescript
// Add alongside the existing EditBanned branch (EditBanned itself needs NO change —
// AddExecutor reuses it verbatim per Pattern 3).

// channels.InviteToChannel
if (ctorName === 'InviteToChannel' || (request as { className?: string })?.className === 'channels.InviteToChannel') {
  const channelId = (request as { channel?: { channelId?: { toString(): string } } }).channel?.channelId?.toString() ?? ''
  _inviteToChannelCalls.push({ channelId })
  if (config.inviteErrorDialogIds?.[channelId]) {
    const msg = config.inviteErrorDialogIds[channelId]!
    throw Object.assign(new Error(msg), { errorMessage: msg })
  }
  if (config.missingInviteeDialogIds?.includes(channelId)) {
    return { updates: {}, missingInvitees: [{ userId: bigInt('0'), premiumWouldAllowInvite: config.premiumWouldAllowInvite ?? false }] }
  }
  return { updates: {}, missingInvitees: [] }
}

// messages.AddChatUser — same shape, chatId instead of channelId
// messages.ExportChatInvite — return { link: config.exportedLink ?? 'https://t.me/+mocklink', expireDate: ... }
// messages.SendMessage — record randomId/message; throw via config.sendMessageError
// contacts.AddContact — record firstName/lastName/phone; throw via config.addContactError
```
Follow the existing `*Calls` array convention exactly: initialize each new recording array at the top of `createMockTelegramClient()` (mirrors lines 219–225), expose it on the returned `client` object (mirrors lines 558–560), and add the corresponding config fields to `MockClientConfig` (mirrors the `// ── Phase 5: removal mock controls ──` / `// ── Phase 13: TagExecutor …` comment-blocked sections, lines 160–203) under a new `// ── Phase 14: AddExecutor mock controls ──` block.

---

### `src/main/telegram/TargetResolver.ts` (extension)

**Analog:** itself — additive private-field extension (Pitfall 1)

**Exact insertion points** (mirror the existing `_resolvedUserId`/`_resolvedAccessHash`/`_resolvedName` triad at every call site):
```typescript
// Declaration block (TargetResolver.ts lines 76-78) — add alongside:
private _resolvedDeleted: boolean | null = null
private _resolvedBot: boolean | null = null
private _resolvedContact: boolean | null = null

// At every call site that currently sets _resolvedUserId/_resolvedAccessHash/_resolvedName
// (lines 225-231 in resolveByCandidate, and the equivalent blocks in _resolveByUsername
// lines ~355-359 and _resolveByPhone lines ~405-409), add:
this._resolvedDeleted = targetUser.deleted ?? false
this._resolvedBot = targetUser.bot ?? false
this._resolvedContact = (targetUser as { contact?: boolean }).contact ?? false

// reset() (lines 276-284) — add alongside the existing three nulls:
this._resolvedDeleted = null
this._resolvedBot = null
this._resolvedContact = null

// getResolvedUser() (lines 299-304) — extend the return shape (purely additive, A7):
getResolvedUser(): {
  id: bigint; accessHash: bigint; name: string
  deleted: boolean; bot: boolean; contact: boolean
} | null {
  if (this._resolvedUserId === null || this._resolvedAccessHash === null) return null
  return {
    id: this._resolvedUserId, accessHash: this._resolvedAccessHash, name: this._resolvedName ?? '',
    deleted: this._resolvedDeleted ?? false, bot: this._resolvedBot ?? false, contact: this._resolvedContact ?? false,
  }
}
```
`ApiUserShape` (lines 514–524) already declares `deleted?: boolean; bot?: boolean` — add `contact?: boolean` to this interface too, since GramJS's `Api.User` carries it but the shape interface currently omits it.

Existing consumers (`RemovalExecutor`/`TagExecutor`'s `resolver: { getResolvedUser(): {...} | null }` option types) destructure only `{ id, accessHash, name }` — unaffected by the additive fields (A7 confirmed, low risk).

---

### `src/shared/channels.ts` (extension)

**Analog:** itself — append a new block mirroring the existing `TAG_*` block exactly (lines 59–65)

```typescript
// Add execution IPC channels (Phase 14, ADD-06..ADD-11). Pattern mirrors the TAG_*/REMOVAL_* blocks above.
export const ADD_START        = 'add:start' as const        // { dialogIds }
export const ADD_ABORT        = 'add:abort' as const
export const ADD_RETRY_GROUP  = 'add:retryGroup' as const    // { dialogId }
export const ADD_GET_STATE    = 'add:getState' as const
export const ADD_STATE        = 'add:state' as const         // push: main → renderer
export const ADD_GET_JOB      = 'add:getJob' as const
export const ADD_DISCARD_JOB  = 'add:discardJob' as const

// Contact-add IPC (Phase 14, ADD-05 main half). Non-blocking; { ok, code? } response.
export const TARGET_ADD_CONTACT = 'target:addContact' as const

// DM template preference IPC (Phase 14, ADD-16 main half). Mirrors SEVERITY_*/THEME_* pattern.
export const TEMPLATE_GET = 'template:get' as const
export const TEMPLATE_SET = 'template:set' as const
```
Add all nine new constants to the `CHANNELS` namespace object too (mirrors the existing pattern at lines 120–131).

---

### `src/main/index.ts` (wiring extension)

**Analog:** itself — mirror the `RemovalExecutor`/`TagExecutor`/`severityChannels` wiring block verbatim (lines 292–359)

```typescript
// ── Wire AddAuditStore ────────────────────────────────────────────────────
const addAuditStore = createAddAuditStore()

// ── Wire AddLogStore ──────────────────────────────────────────────────────
const addLogStore = createAddLogStore()

// ── Wire contact service ──────────────────────────────────────────────────
const contactService = createContactService({ client: client as unknown as ..., governor, resolver })

// ── Wire AddExecutor ──────────────────────────────────────────────────────
// Shares the same client, governor, enumerator, resolver as Removal/Tag.
const addExecutor = new AddExecutor({
  client: client as unknown as ConstructorParameters<typeof AddExecutor>[0]['client'],
  governor,
  enumerator,
  resolver,
  auditStore: addAuditStore,
  addLogStore,
  templateStore,  // or a render-template function reference
  onStateChange: (state) => emitAddState(currentWin, state),
})
registerAddChannels(currentWin, addExecutor, enumerator, addAuditStore, () => sm.getState())
registerTemplateChannels()

// ── On-launch add-job detection (Resume/Discard) ──────────────────────────
// Independent of removal-job/tag-job detection (mirrors lines 342-359 exactly).
const _pendingAddJob = addAuditStore.readJob()
if (_pendingAddJob && _pendingAddJob.status !== 'complete') {
  console.log('[main] Incomplete add job detected on launch — resumable via renderer')
}
```
Note: unlike `RemovalExecutor`/`TagExecutor`, `AddExecutor`'s constructor options need `addLogStore` and a template accessor too — these are additive beyond the Removal/Tag options shape (no analog has this).

## Shared Patterns

### Generation-token guard + abort-first ordering
**Source:** `src/main/telegram/TagExecutor.ts` lines 183–187, 210–214, 223–227, 236–241, 244–249 (the corrected version; `RemovalExecutor.ts` has the same intent but an older combined check)
**Apply to:** `AddExecutor.execute()` — every loop checkpoint, both in-loop and post-pacing-sleep.
```typescript
if (signal.aborted) {
  this._markRemainingSkippedAndStop(selectedDialogs, outcomes, ctx)
  return
}
if (gen !== this._generation) return
```

### PEER_FLOOD hard-stop re-throw BEFORE string matching
**Source:** `src/main/telegram/operationErrors.ts` lines 79–85 (`classifyRpcError`) + `TagExecutor.ts` lines 439–443 (`_classifyTagError`'s branch order)
**Apply to:** `AddExecutor._classifyAddError()` — must call `classifyRpcError(err)` and re-throw on `disposition === 'hard-stop'` as the FIRST branch, before any `ADD_*` string matching.

### Atomic job-file write (write-to-temp + rename, mode 0o600)
**Source:** `src/main/storage/tagAuditStore.ts` lines 165–176 (`writeAtomic`)
**Apply to:** `addAuditStore.ts`'s `initJob`/`checkpoint`/`setStatus`. `addLogStore.ts` needs the append variant instead (no rename — append-only per D-17).

### Four-layer IPC security gate (Zod → auth → double-start → dialog-map)
**Source:** `src/main/ipc/tagChannels.ts` lines 93–136
**Apply to:** `addChannels.ts`'s `ADD_START` handler. `ADD_RETRY_GROUP` additionally needs the job-dialogId gate from `src/main/ipc/removalChannels.ts` lines 147–152.

### ESM-safe lazy electron-store singleton
**Source:** `src/main/ipc/severityChannels.ts` lines 32–45
**Apply to:** the DM template preference store (`templateChannels.ts` / `addTemplateStore.ts`).

### Mock client dispatch-by-constructor-name
**Source:** `src/main/telegram/__mocks__/telegramClient.ts` lines 420–469 (`EditBanned`/`DeleteChatUser`/`EditChatParticipantRank` branches)
**Apply to:** every new RPC branch (`InviteToChannel`, `AddChatUser`, `ExportChatInvite`, `SendMessage`, `AddContact`) added to the same `invoke()` switch.

### Identity never crosses IPC; resolver is the sole source in main
**Source:** `src/main/telegram/RemovalExecutor.ts` lines 123–128, 139–150 (T-05-04-B) + `src/main/ipc/tagChannels.ts` file header (lines 6–8)
**Apply to:** `AddExecutor.execute()` (reads `resolved` from `this._resolver.getResolvedUser()`, never from `params`) and `addChannels.ts`'s `ADD_START` schema (admits only `{ dialogIds }`, no identity fields).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/main/storage/addLogStore.ts` | service | file-I/O (append-only) | No append-only log file exists in the codebase; every existing store (`auditStore.ts`, `tagAuditStore.ts`) is overwrite-via-atomic-rename, not append. Use RESEARCH.md's Architecture Patterns / "Don't Hand-Roll" table (atomic-write primitive reused, append semantics net-new). |
| contact service (`contactService.ts`) | service | request-response (non-blocking single RPC) | No existing module wraps a single non-blocking Telegram call with a `{ ok, code? }` contract; closest is the governed-invoke pattern inside every executor, but none of them swallow failures into a return value. See RESEARCH.md Code Examples Pattern 5. |
| Continuation-based resume logic inside `AddExecutor.execute()` | controller (sub-pattern) | event-driven | Neither `RemovalExecutor` nor `TagExecutor` ever reuse a `jobId` across calls — both mint a fresh job every `execute()`. This is a net-new control-flow branch; see RESEARCH.md Pattern 1 and Open Question 1 for the two candidate shapes (decide in planning, not here). |

## Metadata

**Analog search scope:** `src/main/telegram/`, `src/main/storage/`, `src/main/ipc/`, `src/shared/`, `src/main/telegram/__mocks__/`, `src/main/index.ts`
**Files scanned:** 13 (RemovalExecutor.ts, TagExecutor.ts, auditStore.ts, tagAuditStore.ts, removalChannels.ts, tagChannels.ts, severityChannels.ts, removalTypes.ts, tagTypes.ts, telegramClient.ts mock, TargetResolver.ts, channels.ts, main/index.ts)
**Pattern extraction date:** 2026-10-03
