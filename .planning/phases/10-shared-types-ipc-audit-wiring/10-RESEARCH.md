# Phase 10: Shared Types, IPC & Audit Wiring — Research

**Researched:** 2026-06-20
**Domain:** Electron IPC, TypeScript shared types, Zod validation, durable job-file persistence
**Confidence:** HIGH — all findings verified directly against shipped codebase source

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Types & Job-File Schema**
- `TagErrorCode` taxonomy: `TAG_TARGET_IS_ADMIN`, `TAG_UNSUPPORTED_BASIC_GROUP`, `TAG_NO_RIGHTS`, `TAG_USER_INVALID`, `TAG_CHANNEL_INVALID`, `NETWORK`, `UNKNOWN` — mirrors `RmvErrorCode` plus provisional set in design spec §4.2. PEER_FLOOD is a run-level hard-stop, NOT a per-group code.
- `TagState` mirrors `RemovalState` exactly, with `tag: string` in place of `severity`. Carries `targetId` + `targetName`; never `targetAccessHash` (same security boundary as removal).
- `TagGroupOutcome` mirrors `RemovalGroupOutcome`: `dialogId`, `status` (`done | skipped | failed` — no `already-gone` analog), optional `errorCode`, `timestamp`. Skip annotations distinguish `TAG_TARGET_IS_ADMIN` vs `TAG_UNSUPPORTED_BASIC_GROUP`.
- Job file is a separate `tag-job.json` (NOT an extension of `removal-job.json`). Written `0o600`.
- `TagJobFile.schemaVersion` starts at `1`; ISO-timestamp `jobId` nonce, `targetAccessHash` persisted on disk only for resume, `dialogIds` full ordered list, per-group `outcomes`, `status` of `running | complete | stopped | hard-stopped`.

**IPC & Resume Wiring**
- Parallel modules: `src/main/ipc/tagChannels.ts` + `src/renderer/ipc/tagClient.ts`, with `TAG_*` channel constants. Do NOT fold into removal modules.
- Zod-validated handler payload is `{ dialogIds: string[], tag: string }` only. Target identity read exclusively from `resolver.getResolvedUser()` in main (T-05-04-B). Validation rejects malformed payloads.
- Resume detection: `tag-job.json` detected independently from `removal-job.json` on launch with its own resume/discard prompt. Both can be incomplete simultaneously.
- Tag validation at IPC boundary: reject empty, enforce a conservative max-length cap. Exact Telegram max length is a STATE blocker — use conservative cap now, tighten in Phase 12.

### Claude's Discretion

- Exact `TAG_*` channel constant names, Zod schema layout, and where the job-file read/write helper lives (new module vs. extending an audit store) are at Claude's discretion, following the closest removal analog.

### Deferred Ideas (OUT OF SCOPE)

- `TagExecutor` write state machine (Phase 11)
- Renderer action picker, tag input, confirmation, live progress, results report (Phase 12)
- Measuring real Telegram tag max length + charset (feeds Phase 12)
- Reading tags back / clearing tags / per-group tags / basic-group support (out of v1.6 scope)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAG-03 | Tag writes are throttled through the shared rate-limit governor (FLOOD_WAIT honored, PEER_FLOOD hard-stops) and the run is resumable via a `tag-job` audit file. | `tag-job.json` persistence (write, checkpoint, launch detection) mirrors `auditStore.ts` — identical injectable-deps pattern enables full test coverage without Electron. |
| TAG-05 | An explicit confirmation gate shows the tag string, target identity, and the exact affected-group list before any write; target identity is sourced from the main process only (never the renderer). | IPC payload carries only `{ dialogIds, tag }` — identity read from `resolver.getResolvedUser()` in `tagChannels.ts`, same T-05-04-B pattern enforced in `removalChannels.ts`. |
</phase_requirements>

---

## Summary

Phase 10 is a pure infrastructure phase: it builds the typed contract and durable-state substrate the tag feature's executor (Phase 11) and renderer (Phase 12) will depend on. Nothing new is designed here — everything is a deliberate mirror of the shipped removal pipeline.

The codebase already contains the exact patterns to replicate, all of which have been read directly in this session. `src/shared/removalTypes.ts` is the structural template for `tagTypes.ts`. `src/main/ipc/removalChannels.ts` + `removalChannels.test.ts` are the templates for `tagChannels.ts` + `tagChannels.test.ts`. `src/main/storage/auditStore.ts` + `auditStore.test.ts` are the templates for `createTagAuditStore()` (either a new `tagAuditStore.ts` or a renamed-filename re-instantiation of `createAuditStore` with `jobFileName: 'tag-job.json'`). `src/renderer/ipc/removalClient.ts` is the template for `tagClient.ts`.

The three integration seams to wire in `src/main/index.ts` are: (1) import and call `registerTagChannels`; (2) add tag-job launch detection (peer of the existing removal-job detection block); (3) extend the preload `contextBridge.exposeInMainWorld` with the new `TAG_*` channel entries.

**Primary recommendation:** Mirror removal infrastructure exactly — naming, structure, Zod conventions, injectable-deps test pattern, atomic-write mechanics — and add only what is tag-specific (the `tag` field replacing `severity`, the updated `TagErrorCode` set, and the independent `tag-job.json` file name).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TagJobFile schema + types | Shared (`src/shared/tagTypes.ts`) | — | Single source imported by both main and renderer processes; no runtime logic |
| IPC channel constants | Shared (`src/shared/channels.ts`) | — | Both preload and handler files must import from one location |
| IPC handler registration + Zod validation | API / Backend (Main process, `tagChannels.ts`) | — | Zod gates run in main before reaching any executor; renderer never executes validation |
| `tag-job.json` persistence (0o600 write, checkpoint, read) | API / Backend (Main process, `tagAuditStore.ts` or equivalent) | — | File I/O belongs in main; node:fs is not available in sandbox renderer |
| Identity boundary enforcement (T-05-04-B) | API / Backend (Main process, `tagChannels.ts`) | — | `resolver.getResolvedUser()` is main-process-only state; renderer cannot access it |
| Launch-time incomplete-job detection | API / Backend (Main process, `index.ts`) | — | Runs on app.whenReady before sm.initialize(); drives renderer resume prompt via getJob |
| Renderer IPC client wrapper | Browser / Client (Renderer, `tagClient.ts`) | — | Thin typed wrapper over `window.mrsproper.*`; no logic, no Telegram access |
| Preload contextBridge extension | Frontend Server (Preload, `preload/index.ts`) | — | Trust boundary — exposes only whitelisted tag functions to renderer |

---

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | bundled (used throughout) | Runtime payload validation at IPC boundary | Every existing channel handler uses Zod — established project pattern |
| `electron` (ipcMain, BrowserWindow) | 38.x/39.x bundled | IPC handler registration, push channel emit | Main IPC layer — `VERIFIED: used in removalChannels.ts` |
| TypeScript | 5.x bundled | Types for `TagState`, `TagGroupOutcome`, `TagJobFile`, `TagErrorCode` | Project language [CITED: src/shared/removalTypes.ts pattern] |
| `node:fs` (stdlib) | bundled Node.js | `writeFileSync`, `renameSync`, `readFileSync`, `existsSync`, `unlinkSync` | Atomic write + 0o600 mode — identical to `auditStore.ts` [CITED: src/main/storage/auditStore.ts] |
| `node:path` (stdlib) | bundled Node.js | `join(userData, 'tag-job.json')` | Path resolution — lazy-required in store as per existing pattern |

### No New Packages

Phase 10 installs zero new npm packages. All required capabilities (Zod, Electron IPC, node:fs) are already in the project. [VERIFIED: package.json analysis — all dependencies pre-exist]

---

## Package Legitimacy Audit

> SKIPPED — Phase 10 installs no external packages. All tooling is already present in the project.

---

## Architecture Patterns

### System Architecture Diagram

```
Renderer (sandboxed)                  Preload (contextBridge)           Main Process
─────────────────────────             ──────────────────────────        ─────────────────────────────────
tagClient.ts                          preload/index.ts                  tagChannels.ts
  startTag(dialogIds, tag)  ─────▶    mrsproper.startTag(...)  ────▶   TAG_START handler
                                                                          │
                                                                          ├─ Zod.parse({ dialogIds, tag })
                                                                          ├─ authState.step === 'authorized'?
                                                                          ├─ double-start guard (running/stopping?)
                                                                          ├─ enumerator dialog-map gate
                                                                          ├─ resolver.getResolvedUser()  ← T-05-04-B
                                                                          └─ TagExecutor.execute() [Phase 11]
                                                                               │
                                                                               ▼
                                                                        tagAuditStore
                                                                          initJob()
                                                                          checkpoint(dialogId, outcome)
                                                                          setStatus('complete')
                                                                          ▼ userData/tag-job.json (0o600)

  onTagState(cb)  ◀──────────────     mrsproper.onTagState(...)  ◀────  emitTagState(win, state)
                                                                         ← TagExecutor.onStateChange callback

Launch-time detection (index.ts):
  tagAuditStore.readJob() → status === 'running' → log incomplete job
  Renderer calls getTagJob() → shows resume/discard prompt (Phase 12)
```

### Recommended Project Structure (Phase 10 deliverables)

```
src/
├── shared/
│   ├── channels.ts          # ADD: TAG_START, TAG_ABORT, TAG_GET_STATE, TAG_STATE, TAG_GET_JOB, TAG_DISCARD_JOB constants
│   └── tagTypes.ts          # NEW: TagState, TagGroupOutcome, TagJobFile, TagErrorCode, TagRunStep
├── main/
│   ├── ipc/
│   │   ├── tagChannels.ts   # NEW: registerTagChannels(), emitTagState()
│   │   └── tagChannels.test.ts  # NEW: mirrors removalChannels.test.ts exactly
│   ├── storage/
│   │   └── tagAuditStore.ts # NEW: createTagAuditStore() — mirrors createAuditStore() with 'tag-job.json'
│   │       (alternative: reuse createAuditStore with jobFileName: 'tag-job.json' option — discretion)
│   └── index.ts             # MODIFY: import tagChannels, registerTagChannels(), tag-job launch detection
├── preload/
│   └── index.ts             # MODIFY: extend contextBridge with TAG_* channel entries
└── renderer/
    └── ipc/
        └── tagClient.ts     # NEW: mirrors removalClient.ts
```

### Pattern 1: Shared Types Module (`src/shared/tagTypes.ts`)

**What:** Pure TypeScript type declarations — no runtime logic. Importable in both main and renderer without side effects.

**Structure mirrored from `removalTypes.ts`:**

```typescript
// Source: src/shared/removalTypes.ts (verified in-session)

export type TagErrorCode =
  | 'TAG_TARGET_IS_ADMIN'
  | 'TAG_UNSUPPORTED_BASIC_GROUP'
  | 'TAG_NO_RIGHTS'
  | 'TAG_USER_INVALID'
  | 'TAG_CHANNEL_INVALID'
  | 'NETWORK'
  | 'UNKNOWN'

export type TagRunStep =
  | 'idle'
  | 'confirming'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'complete'
  | 'hard-stopped'

export interface TagGroupOutcome {
  dialogId: string
  // Note: NO 'already-gone' analog. 'skipped' covers TAG_TARGET_IS_ADMIN
  // and TAG_UNSUPPORTED_BASIC_GROUP (errorCode distinguishes them).
  status: 'done' | 'skipped' | 'failed'
  errorCode?: TagErrorCode
  timestamp: string
}

export interface TagSummary {
  tagged: number
  skipped: number
  failed: number
  completedAt: string
}

/**
 * Security boundary: targetAccessHash intentionally omitted.
 * Lives in TagJobFile on disk (0o600) and main memory only.
 * Renderer receives targetId/targetName for display only.
 */
export interface TagState {
  step: TagRunStep
  tag: string               // replaces 'severity' from RemovalState
  targetId: string
  targetName: string
  progress: { processed: number; total: number }
  outcomes: TagGroupOutcome[]
  summary?: TagSummary
  currentGroupId?: string
  floodWaitRemaining?: number | null
}

export interface TagJobFile {
  schemaVersion: 1
  jobId: string             // ISO timestamp nonce
  tag: string
  targetId: string
  targetName: string
  targetAccessHash: string  // stored for resume — 0o600 protection
  dialogIds: string[]
  outcomes: TagGroupOutcome[]
  startedAt: string
  completedAt?: string
  status: 'running' | 'complete' | 'stopped' | 'hard-stopped'
}
```

### Pattern 2: IPC Channel Constants (`src/shared/channels.ts` additions)

**What:** Add `TAG_*` string constants to the existing `channels.ts` — same block structure as the `REMOVAL_*` block.

```typescript
// Source: src/shared/channels.ts (verified in-session)

// Tag execution IPC channels (Phase 10, TAG-03/TAG-05).
// Pattern mirrors the REMOVAL_* block exactly above.
export const TAG_START       = 'tag:start' as const        // { dialogIds, tag }
export const TAG_ABORT       = 'tag:abort' as const
export const TAG_GET_STATE   = 'tag:getState' as const
export const TAG_STATE       = 'tag:state' as const        // push: main → renderer
export const TAG_GET_JOB     = 'tag:getJob' as const
export const TAG_DISCARD_JOB = 'tag:discardJob' as const
```

Add these to the `CHANNELS` namespace object at the bottom of `channels.ts`.

### Pattern 3: IPC Handler Registration (`src/main/ipc/tagChannels.ts`)

**What:** `registerTagChannels()` function — mirrors `registerRemovalChannels()` exactly except:
- No `severity` field in the Zod schema; `tag: string` replaces it
- Tag validation: `z.string().min(1).max(255)` (conservative cap — 255 is a safe upper bound; exact Telegram limit is a STATE blocker)
- No `TAG_RETRY_GROUP` (Phase 10 scope; add in Phase 11 if executor needs it)
- No `enumerator` dependency for Phase 10 (tagChannels registers handlers that will call a not-yet-wired executor placeholder — Phase 11 will complete the execute dispatch)

**Zod schema for `tag:start`:**
```typescript
// Source pattern: src/main/ipc/removalChannels.ts (verified in-session)

const TagStartSchema = z.object({
  dialogIds: z.array(z.string().min(1).max(30)).min(1).max(500),
  tag: z.string().min(1).max(255),  // conservative cap — tighten in Phase 12
})
```

**Security layers (mirrors removal pattern):**
1. Zod parse — throws ZodError on malformed input
2. Auth gate — `getAuthState().step !== 'authorized'` → return idle state
3. Double-start guard — `step === 'running' || step === 'stopping'` → return current state
4. Enumerator dialog-map gate — each dialogId must be in `enumerator.getState().dialogs` (same T-05-05-A gate as removal)
5. Identity from resolver — `resolver.getResolvedUser()` called in main; never from renderer payload (T-05-04-B)

**Push helper:**
```typescript
// Source pattern: src/main/ipc/removalChannels.ts (verified in-session)

export function emitTagState(win: BrowserWindow, state: TagState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(TAG_STATE, state)
  }
}
```

### Pattern 4: Tag Audit Store (`src/main/storage/tagAuditStore.ts`)

**What:** The existing `createAuditStore()` factory already accepts a `jobFileName` override in its `AuditStoreDeps`. The cleanest approach is to create a new `tagAuditStore.ts` that re-exports a tag-typed version — OR just instantiate `createAuditStore({ jobFileName: 'tag-job.json' })` in `main/index.ts` with a separate variable.

However, the `TagJobFile` type is different from `RemovalJobFile` (different fields — `tag` not `severity`, different `outcomes` shape, no `note` field). A fully correct store requires its own Zod schema and its own `AuditStore`-equivalent interface typed to `TagJobFile`/`TagGroupOutcome`. The planner should create a dedicated `tagAuditStore.ts` that mirrors `auditStore.ts` structurally but uses `TagJobFile` types throughout.

**Atomic-write mechanics (LOCKED — from auditStore.ts):**
```typescript
// Source: src/main/storage/auditStore.ts (verified in-session)

// Write to .tmp then rename to final — crash-safe.
fs.writeFileSync(tmpPath, JSON.stringify(job, null, 2), { mode: 0o600 })
fs.renameSync(tmpPath, finalPath)
// → userData/tag-job.json (mode 0o600 — same as session.bin)
```

**Injectable deps pattern (LOCKED — enables testability without Electron):**
```typescript
// Source: src/main/storage/auditStore.ts (verified in-session)

export interface TagAuditStoreFsDeps {
  writeFileSync(path: string, data: string | Buffer, opts?: unknown): void
  renameSync(from: string, to: string): void
  readFileSync(path: string): Buffer
  existsSync(path: string): boolean
  unlinkSync(path: string): void
}

export interface TagAuditStoreAppDeps {
  getPath(name: 'userData'): string
}

// In tests: inject fakeFs + fakeApp → zero disk I/O, zero Electron
// createTagAuditStore({ fs: fakeFs, app: fakeApp })
```

**Zod validation on readJob (LOCKED — T-05-03-A pattern):**
```typescript
// Source: src/main/storage/auditStore.ts (verified in-session)

const result = TagJobFileSchema.safeParse(parsed)
if (!result.success) return null  // corrupted/injected content → silently return null
```

**Status values:** `'running' | 'complete' | 'stopped' | 'hard-stopped'` — exactly mirrors `RemovalJobFile.status`.

### Pattern 5: Launch-Time Job Detection (`src/main/index.ts`)

**What:** Mirror the existing removal-job detection block. Placed after `createTagAuditStore()` and before `sm.initialize()`. The renderer detects this via `tag:getJob` and shows a resume/discard prompt (Phase 12 consumes this — Phase 10 just makes it detectable).

```typescript
// Source: src/main/index.ts lines 318–329 (verified in-session)

// ── Wire TagAuditStore ────────────────────────────────────────────────────────
const tagAuditStore = createTagAuditStore()

// ── Register Tag IPC handlers ─────────────────────────────────────────────────
registerTagChannels(currentWin, enumerator, tagAuditStore, () => sm.getState())
// Note: TagExecutor (Phase 11) will be wired here alongside registerTagChannels.

// ── On-launch tag-job detection (Resume/Discard) ──────────────────────────────
const _pendingTagJob = tagAuditStore.readJob()
if (_pendingTagJob && _pendingTagJob.status !== 'complete') {
  console.log('[main] Incomplete tag job detected on launch — resumable via renderer')
}
```

### Pattern 6: Renderer IPC Client (`src/renderer/ipc/tagClient.ts`)

**What:** Thin typed wrapper over `window.mrsproper.*` — same interface-merging pattern as `removalClient.ts`.

```typescript
// Source: src/renderer/ipc/removalClient.ts (verified in-session)

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
  // ... mirrors removalClient pattern exactly
}
```

### Pattern 7: Preload Extension (`src/preload/index.ts`)

**What:** Add `TAG_*` imports and contextBridge entries. The sandbox restriction means the renderer can only call through these whitelisted functions.

```typescript
// Source: src/preload/index.ts (verified in-session) — add this block

import type { TagState, TagJobFile } from '../shared/tagTypes'
import {
  TAG_START, TAG_ABORT, TAG_GET_STATE, TAG_STATE, TAG_GET_JOB, TAG_DISCARD_JOB,
} from '../shared/channels'

// In contextBridge.exposeInMainWorld('mrsproper', { ... }):
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

### Anti-Patterns to Avoid

- **Folding tag into removal modules:** `removalChannels.ts` handles removal only. Tag gets its own module pair. Mixing would break the "untouched v1.0 removal path" invariant.
- **Accepting identity from renderer:** The `tag:start` payload carries only `{ dialogIds, tag }`. Never accept `targetId`, `targetName`, or `targetAccessHash` from the renderer — these come from `resolver.getResolvedUser()` in main.
- **Calling `createAuditStore()` with `jobFileName: 'tag-job.json'` and RemovalJobFile types:** The `RemovalJobFile` type has `severity: 'kick' | 'ban'`, which `TagJobFile` replaces with `tag: string`. Mixing types causes silent runtime mismatches at `readJob()` Zod validation.
- **Skipping Zod on `readJob()`:** The Zod-validate-on-read pattern (T-05-03-A) prevents corrupted or injected job files from crashing the executor. Never return raw `JSON.parse()` output from `readJob()` without schema validation.
- **Eager node:fs/Electron imports at module parse time:** The existing `auditStore.ts` uses `require('node:fs')` and `require('electron')` inside method bodies (lazy requires). Mirror this — test environments do not have Electron; eager imports break the test runner.
- **LAYER global mutation outside TagClient:** Phase 9's `TagClient.connect()` is the only place `AllTLObjects.LAYER` is mutated. `tagChannels.ts` and `tagAuditStore.ts` must not touch it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic crash-safe file write | Custom temp-file logic | Mirror `writeAtomic()` from `auditStore.ts` (write-to-tmp, renameSync to final) | Existing tested pattern; a crash between write and rename leaves the previous checkpoint intact |
| Schema validation on job-file read | Manual field checks | Zod `safeParse` (T-05-03-A pattern from `auditStore.ts`) | Prevents injected/corrupted content silently; returns null on any parse error |
| OS-appropriate file encryption | Custom AES/XOR | `0o600` permissions on `tag-job.json` (same as session.bin) | Established project decision; `accessHash` is not a session credential; 0o600 is the agreed protection level |
| IPC type bridge | Custom IPC manager | Electron `ipcMain.handle` + contextBridge pattern (established in every `*Channels.ts`) | Already proven; adding a new abstraction layer adds no value here |

---

## Common Pitfalls

### Pitfall 1: Forgetting `TagJobFile` Has No `severity` Field

**What goes wrong:** Copy-pasting `RemovalJobFile` to `TagJobFile` and keeping the `severity: 'kick' | 'ban'` field. Phase 11's `TagExecutor` then tries to read `job.tag` and gets `undefined`.

**Why it happens:** The Zod schema on `readJob()` would accept any schema-compliant object. If the schema mistakenly includes `severity` and not `tag`, a written job file would fail `readJob()` Zod validation on restart (returning null instead of the incomplete job), breaking resume.

**How to avoid:** Define `TagJobFileSchema` with `tag: z.string()` not `severity: z.enum(...)`. Run the `readJob() → status === 'running'` test to confirm round-trip.

### Pitfall 2: `TagGroupOutcome` Has No `already-gone` Status

**What goes wrong:** Copying `RemovalGroupOutcome` verbatim imports `status: 'done' | 'already-gone' | 'failed' | 'skipped'`. The tag flow has no "already-gone" concept — that was removal-specific (user already not in group). The analog for "target is admin, skipped" is `status: 'skipped'` with `errorCode: 'TAG_TARGET_IS_ADMIN'`.

**Why it happens:** Pattern copy without understanding the semantic differences.

**How to avoid:** `TagGroupOutcome.status` is `'done' | 'skipped' | 'failed'` only. Skipped rows use `errorCode` to distinguish `TAG_TARGET_IS_ADMIN` from `TAG_UNSUPPORTED_BASIC_GROUP`. The Zod schema for the audit store must enforce this three-way enum.

### Pitfall 3: Eager `require('electron')` or `require('node:fs')` in Module Scope

**What goes wrong:** `import { app } from 'electron'` at the top of `tagAuditStore.ts` causes the Vitest test runner to fail at module load time (Electron is not available in the Node test environment).

**Why it happens:** Vitest runs in plain Node. Electron's `app` object only exists inside the Electron main process.

**How to avoid:** All Electron and node:fs requires go inside method bodies (lazy require). Exactly as in `auditStore.ts` lines 137–148. The injectable `deps.fs` / `deps.app` pattern is the clean alternative for test injection.

### Pitfall 4: Missing `void win` Suppression in `registerTagChannels`

**What goes wrong:** TypeScript complains about unused `win` parameter in `registerTagChannels` body (since `emitTagState` is wired via `onStateChange` callback in `index.ts`, not inside the handler body).

**Why it happens:** `win` is required in the function signature so the main/index.ts wiring pattern is consistent with other channels, but handlers themselves do not emit push events (the executor's `onStateChange` callback does).

**How to avoid:** Add `void win` at the top of `registerTagChannels`, exactly as in `removalChannels.ts` line 87.

### Pitfall 5: `channels.ts` CHANNELS Object Not Updated

**What goes wrong:** New `TAG_*` constants are exported but not added to the `CHANNELS` namespace object at the bottom of `channels.ts`. Any consumer that destructures `CHANNELS` will miss the new entries.

**Why it happens:** Forgetting the namespace object update is easy when only scanning the const export block.

**How to avoid:** The `CHANNELS` object at lines 77–118 of `channels.ts` must include all seven new `TAG_*` entries.

### Pitfall 6: Resume Detection — Both Jobs Can Be Pending Simultaneously

**What goes wrong:** Treating the resume flow as "if removal job OR tag job exists" and only surfacing one prompt. Both can be incomplete after a crash during a tag run that followed a previous removal run that was itself incomplete (edge case, but structurally possible).

**Why it happens:** The two job files are independent on disk (`removal-job.json` and `tag-job.json`). The launcher and renderer must handle both independently.

**How to avoid:** The index.ts launch detection block checks both `auditStore.readJob()` and `tagAuditStore.readJob()` independently. Phase 12 shows resume/discard prompts for each independently. Phase 10 only needs to ensure the tag-job detection block exists alongside the removal-job block — the UX is Phase 12's problem.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (configured in `vitest.config.ts`) |
| Config file | `vitest.config.ts` at project root |
| Quick run command | `npx vitest run src/main/ipc/tagChannels.test.ts src/main/storage/tagAuditStore.test.ts src/renderer/ipc/tagClient.test.ts` |
| Full suite command | `npx vitest run` |
| Test environment | `node` (no Electron; all Electron deps are mocked or injected) |
| Path aliases | `@shared`, `@main`, `@renderer` (from `vitest.config.ts`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Status |
|--------|----------|-----------|-------------------|-------------|
| TAG-03 | `tag-job.json` written atomically (temp-then-rename) on `initJob()` | unit | `npx vitest run src/main/storage/tagAuditStore.test.ts` | Wave 0 (new file) |
| TAG-03 | `checkpoint()` appends outcome, re-writes atomically per group | unit | same | Wave 0 |
| TAG-03 | `readJob()` returns null when no file | unit | same | Wave 0 |
| TAG-03 | `readJob()` returns null on invalid JSON | unit | same | Wave 0 |
| TAG-03 | `readJob()` Zod-validates schema; rejects malformed shape | unit | same | Wave 0 |
| TAG-03 | Incomplete job detection: `readJob()` returns job with `status: 'running'` | unit | same | Wave 0 |
| TAG-03 | `getRemaining()` = `dialogIds` minus completed `outcomes.dialogId`s | unit | same | Wave 0 |
| TAG-03 | `tag-job.json` written with mode `0o600` | unit | same (inspect `opts` arg) | Wave 0 |
| TAG-05 | `tag:start` Zod-rejects payload missing `tag` field | unit | `npx vitest run src/main/ipc/tagChannels.test.ts` | Wave 0 |
| TAG-05 | `tag:start` Zod-rejects `tag: ''` (empty string — min(1)) | unit | same | Wave 0 |
| TAG-05 | `tag:start` Zod-rejects `dialogIds: []` (empty array) | unit | same | Wave 0 |
| TAG-05 | `tag:start` auth gate: returns idle state when `step !== 'authorized'` | unit | same | Wave 0 |
| TAG-05 | `tag:start` double-start guard: returns running state without re-dispatching | unit | same | Wave 0 |
| TAG-05 | `tag:start` dialog-map gate: rejects dialogId not in enumerator | unit | same | Wave 0 |
| TAG-05 | `tag:start` dispatches `execute()` with only `{ dialogIds, tag }` (not identity) | unit | same | Wave 0 |
| TAG-05 | `emitTagState` skips destroyed window (`isDestroyed() === true`) | unit | same | Wave 0 |
| TAG-05 | `emitTagState` emits to live window (`isDestroyed() === false`) | unit | same | Wave 0 |

### Mocking Conventions (from `removalChannels.test.ts` — LOCKED)

All mocks follow the patterns established in `removalChannels.test.ts` and `auditStore.test.ts`:

**Electron mock (module-level `vi.mock`):**
```typescript
// Source: src/main/ipc/removalChannels.test.ts lines 22–32 (verified in-session)

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

**Mock executor** (minimal surface — `execute`, `abortExecution`, `getState`):
```typescript
// Source: src/main/ipc/removalChannels.test.ts lines 58–66 (verified in-session)

function makeMockExecutor(initialState: TagState = IDLE_STATE) {
  const state = { current: initialState }
  return {
    execute: vi.fn(async () => {}),
    abortExecution: vi.fn(() => {}),
    getState: vi.fn(() => state.current),
  }
}
```

**Mock enumerator** (returns loaded state with controllable dialog list):
```typescript
// Source: src/main/ipc/removalChannels.test.ts lines 69–76 (verified in-session)

function makeMockEnumerator(dialogIds: string[] = ['111', '222', '333']) {
  return {
    getState: vi.fn(() => ({
      step: 'loaded' as const,
      dialogs: dialogIds.map((id) => ({ id, title: `Group ${id}`, type: 'supergroup' as const })),
    })),
  }
}
```

**Mock audit store** (injectable — no disk I/O):
```typescript
// Source: src/main/ipc/removalChannels.test.ts lines 79–103 (verified in-session)
// Mirrors the pattern for TagAuditStore mock:

function makeMockTagAuditStore(jobDialogIds: string[] | null = null) {
  return {
    readJob: vi.fn(() => jobDialogIds !== null ? {
      schemaVersion: 1 as const,
      jobId: '2026-06-20T00:00:00.000Z',
      tag: 'TestTag',
      targetId: '999',
      targetName: 'Test User',
      targetAccessHash: '12345',
      dialogIds: jobDialogIds,
      outcomes: [],
      startedAt: '2026-06-20T00:00:00.000Z',
      status: 'running' as const,
    } : null),
    clearJob: vi.fn(() => {}),
    initJob: vi.fn(() => {}),
    checkpoint: vi.fn(() => {}),
    setStatus: vi.fn(() => {}),
    getRemaining: vi.fn(() => jobDialogIds ?? []),
  }
}
```

**Fake fs** (in-memory, verified against `auditStore.test.ts` lines 25–56):
```typescript
// Source: src/main/storage/auditStore.test.ts lines 25–56 (verified in-session)

function createFakeFs() {
  const files: Record<string, string> = {}
  const renames: Array<{ from: string; to: string }> = []
  return {
    writeFileSync(path: string, data: string | Buffer, _opts?: unknown): void { ... },
    renameSync(from: string, to: string): void { ... },
    readFileSync(path: string): Buffer { ... },
    existsSync(path: string): boolean { ... },
    unlinkSync(path: string): void { ... },
    _files: files,
    _renames: renames,
  }
}
```

**Verifying `0o600` mode:** The fake `writeFileSync` captures `_opts` as a second param. The test asserts it was called with `{ mode: 0o600 }`. This requires the fake to store the opts:
```typescript
// Capture opts to verify 0o600 mode
let lastWriteOpts: unknown
writeFileSync(path, data, opts?) { files[path] = ...; lastWriteOpts = opts }
// Then: expect(lastWriteOpts).toMatchObject({ mode: 0o600 })
```

### Sampling Rate

- **Per task commit:** `npx vitest run src/main/ipc/tagChannels.test.ts src/main/storage/tagAuditStore.test.ts`
- **Per wave merge:** `npx vitest run` (full suite — 292 + new tests)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps (files needed before implementation)

- `src/main/ipc/tagChannels.test.ts` — covers TAG-05 IPC security gates (RED first)
- `src/main/storage/tagAuditStore.test.ts` — covers TAG-03 job-file persistence (RED first)
- `src/renderer/ipc/tagClient.test.ts` — type-level smoke test for interface shape (minimal)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (gate on auth state) | `getAuthState().step === 'authorized'` in `tagChannels.ts` — mirrors removal |
| V3 Session Management | no | Tag writes use the session managed by SessionManager; Phase 10 does not touch auth |
| V4 Access Control | yes (identity boundary) | T-05-04-B: identity from `resolver.getResolvedUser()` in main only; renderer cannot inject identity |
| V5 Input Validation | yes | Zod schema on `tag:start` payload; Zod schema in `readJob()` for on-disk job file |
| V6 Cryptography | no | `0o600` mode on `tag-job.json` — same as removal job; `accessHash` is not a session credential |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer injects arbitrary `targetId`/`accessHash` in `tag:start` | Elevation of privilege | T-05-04-B: identity never accepted from renderer; payload carries only `{ dialogIds, tag }` |
| Renderer injects dialogIds not in current enumeration | Tampering | Enumerator dialog-map gate in `registerTagChannels` — mirrors T-05-05-A |
| Corrupted or attacker-modified `tag-job.json` | Tampering | Zod-validate on `readJob()` — return null on any parse/validation error (T-05-03-A) |
| Double-start race (two `tag:start` calls) | Denial of service | Double-start guard: check `step === 'running' || step === 'stopping'` before dispatching |
| Unauthenticated `tag:start` | Authentication bypass | Auth gate: check `getAuthState().step === 'authorized'` before any dispatch |

---

## Environment Availability

> Phase 10 adds no external tools, services, or CLI utilities. All dependencies (Electron, Node.js, Zod, Vitest) are already installed and confirmed working (test suite ran in 2.99s on 2026-06-20).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `tagAuditStore.ts` (node:fs, node:path) | Yes | bundled with Electron | — |
| Zod | Payload + job-file validation | Yes | project dependency | — |
| Vitest | Test runner | Yes | project devDependency | — |
| Electron | ipcMain, BrowserWindow, app | Yes | 38.x/39.x | — |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct `fs.writeFileSync` | Atomic write-to-tmp then rename | Phase 5 (auditStore.ts) | Crash during write leaves previous checkpoint intact |
| `keytar` for secrets | Electron `safeStorage` | Phase 1 | keytar unmaintained; safeStorage is OS-backed |
| Accepting identity from renderer | Identity from `resolver.getResolvedUser()` in main | Phase 3 (T-05-04-B) | Renderer cannot forge or inject target identity |

---

## Open Questions

1. **Exact Telegram tag max length**
   - What we know: Design spec §3 says "not yet measured." Conservative cap of 255 is specified in CONTEXT.md for Phase 10.
   - What's unclear: Real limit (possibly 32 or 64 characters based on admin title limits in earlier TL schema).
   - Recommendation: Use `z.string().min(1).max(255)` in `tagChannels.ts` now. Phase 12 tightens after measurement.

2. **`TagExecutor` constructor signature for `registerTagChannels` stub**
   - What we know: Phase 11 builds `TagExecutor`. Phase 10's `registerTagChannels` needs an executor parameter now but the executor doesn't exist yet.
   - What's unclear: Whether to use a typed interface stub in Phase 10 or just type it as `unknown` and defer.
   - Recommendation: Define a minimal `TagExecutorLike` interface in `tagChannels.ts` with just `getState(): TagState` and `abortExecution(): void`. Phase 11 replaces with the real `TagExecutor` class. This keeps tagChannels.ts compilable while keeping Phase 11 scope clean.

3. **`createTagAuditStore` vs re-using `createAuditStore` with `jobFileName` override**
   - What we know: `createAuditStore` accepts `jobFileName` override already. But it is typed to `RemovalJobFile` / `RemovalGroupOutcome` throughout.
   - What's unclear: Whether generifying `createAuditStore` is cleaner than duplicating.
   - Recommendation: Create `tagAuditStore.ts` as a structural mirror with `TagJobFile`-typed interface. Sharing `createAuditStore` would require a generic refactor of the removal module — destabilizes shipped v1.0.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tag max length cap of 255 is conservative-enough to not be rejected by Telegram before Phase 12 measures the real limit | Architecture Patterns §3 (Zod schema) | A tighter server limit (e.g. 32) means valid Phase 10 test payloads pass Zod but would be rejected by the server in Phase 11; Phase 12 would fix it — no data loss |
| A2 | `TAG_CHANNEL_INVALID` is a correct error code name (not `TAG_CHANNEL_PRIVATE` as in `RmvErrorCode`) | Design spec §4.2, User Constraints | Naming mismatch with Phase 11's live error mapping; refine in Phase 11 with real RPC error strings |

---

## Sources

### Primary (HIGH confidence — all read directly in this session)

- `src/shared/removalTypes.ts` — structural template for `tagTypes.ts` (RemovalState, RemovalGroupOutcome, RemovalJobFile, RmvErrorCode, security-boundary comments)
- `src/main/ipc/removalChannels.ts` — IPC handler registration, Zod schemas, security layers, `emitRemovalState` pattern
- `src/main/ipc/removalChannels.test.ts` — mock factories, capturedHandlers pattern, Zod rejection tests, security gate tests
- `src/main/storage/auditStore.ts` — atomic write, injectable deps, Zod `readJob()` validation, `createAuditStore` factory
- `src/main/storage/auditStore.test.ts` — fake fs, fake app, `0o600` mode verification, checkpoint tests
- `src/renderer/ipc/removalClient.ts` — renderer IPC wrapper pattern, interface merging
- `src/preload/index.ts` — contextBridge entries pattern, existing REMOVAL_* block
- `src/shared/channels.ts` — channel naming convention (namespace:verb) and CHANNELS object pattern
- `src/main/index.ts` (lines 145–340) — wiring order, launch-time job detection block, `executorRef` forward-reference pattern
- `src/main/telegram/tagClient.ts` — Phase 9 deliverable (TagClient, LayerPatch, injectable inner)
- `src/main/telegram/tagApi.ts` — Phase 9 deliverable (EditChatParticipantRankRequest, serializeTLString)
- `docs/superpowers/specs/2026-06-20-member-tag-action-design.md` — §4 architecture, §4.2 error codes, §4.3 layer-224 connection
- `.planning/phases/10-shared-types-ipc-audit-wiring/10-CONTEXT.md` — locked decisions, discretion areas
- `vitest.config.ts` — test environment, path aliases, include pattern

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — TAG-03, TAG-05 requirement text
- `.planning/STATE.md` — accumulated decisions and spike findings

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified in-project; no new packages
- Architecture patterns: HIGH — all patterns read directly from shipped, tested source files
- Pitfalls: HIGH — derived from concrete anti-patterns in the existing codebase (lazy requires, type mismatches, naming gaps)
- Test map: HIGH — mirrors exactly the two test files read in full

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable — no external dependencies; validity bounded by Phase 10 execution timeline)

---

## RESEARCH COMPLETE
