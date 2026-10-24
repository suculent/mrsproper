# Phase 17: Close gap ADD-08/ADD-12 - Pattern Map

**Mapped:** 2026-10-24
**Files analyzed:** 27 (modified or created, source and test)
**Analogs found:** 27 / 27. Most files are modifications of their own seam, so the "analog" is the file itself plus a neighbour for the new shape.

Line numbers are from the current tree (they match RESEARCH.md; CONTEXT.md line numbers drift by 1-2).

## File Classification

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `src/main/ipc/targetChannels.ts` (guard RESOLVE/CONFIRM) | controller (IPC) | request-response | itself, TARGET_RESET structural `addExecutor?` (:70-110) | exact |
| `src/main/ipc/searchChannels.ts` (guard RESOLVE_CANDIDATE) | controller (IPC) | request-response | `targetChannels.ts` guard (above) | role-match |
| `src/main/ipc/addChannels.ts` (resume/identity) | controller (IPC) | request-response | itself, ADD_START :136-180 | exact |
| `src/main/telegram/AddExecutor.ts` (execute reject, retryGroup, banned flag, retry DM+log, `_sendDm`) | service | event-driven / batch | itself: end-of-run DM block :474-500, `retryGroup` :581-650, `_hardStopRetry` :664 | exact |
| `src/main/storage/addAuditStore.ts` (Zod fields) | model/store | file-I/O | itself, `AddJobFileSchema` :105-139 | exact |
| `src/shared/addTypes.ts` | model (types) | transform | itself (`AddJobFile`, `AddGroupOutcome`, `AddJobFileSafe`) | exact |
| `src/main/ipc/languageChannels.ts` + `src/shared/channels.ts` + preload + `languageClient` + `src/renderer/main.tsx` (`language:setDetected`) | controller (IPC) | request-response | `LANGUAGE_SET` handler :96-107 | exact |
| `src/main/index.ts` (wiring: addExecutor into searchChannels, `getEffectiveLanguage`) | config | wiring | `registerTargetChannels(...)` call (~:448) | role-match |
| `src/main/telegram/MembershipScanner.ts:233` | comment only | n/a | n/a | n/a |
| `src/renderer/groups/addPaneState.ts` (+`getPaneView`, `'no-groups'`, job-rows helper) | utility (pure) | transform | itself | exact |
| `src/renderer/groups/GroupsPane.tsx` | component | request-response (props/store) | itself (:95 mode, :349-351 slot gate, :508-660 add bands) | exact |
| `src/renderer/groups/GroupRow.tsx` (retry-DM line, `addDmRefused`/status props) | component | request-response | itself (`linkCreated` + Copy subline) | exact |
| `src/renderer/groups/ModeSwitch.tsx` | component | request-response | itself (`disabledProps` :31-33) | exact |
| `src/renderer/shell/AppShell.tsx` | component | request-response | itself (:122-139 add auto-advance, :146-160 left pane) | exact |
| `src/renderer/target/JobTargetCard.tsx` (new) | component | request-response | `src/renderer/target/TargetCard.tsx` | role-match |
| `src/renderer/target/avatarFallback.ts` (new, extracted) | utility | transform | `TargetCard.tsx` :36-47, :67-72 | exact (move) |
| `src/renderer/target/TargetInput.tsx` (disable + hint) | component | request-response | itself (`isResolving` disabled :268-281, :375-377) | exact |
| `src/renderer/store/addStore.ts` (stopped Resume, in-flight/failed state) | store | event-driven | itself (`resumeJobFromDisk` :170-186, `startAdd` :133-147) | exact |
| `src/renderer/i18n/locales/{en,cs}/{add,groups,target}.json` | config | n/a | existing keys in same files | exact |
| Tests: `targetChannels.test.ts`, `searchChannels.test.ts`, `addChannels.test.ts`, `addExecutor.test.ts`, `addAuditStore.test.ts`, `languageChannels.test.ts`, `addPaneState.test.ts`, `ModeSwitch.test.tsx`, `addStore.test.ts` (extend) | test | n/a | themselves | exact |
| `src/main/telegram/addResume.ipc.integration.test.ts` (new) | test | integration | `src/main/telegram/addResume.integration.test.ts` + `addChannels.test.ts` | exact |
| `src/renderer/groups/GroupsPane.job.test.tsx` (new), `src/renderer/target/JobTargetCard.test.tsx` (new) | test | static render | `ModeSwitch.test.tsx`, `TargetCard.test.tsx` | role-match |
| `16-VERIFICATION.md`, `16-VALIDATION.md` frontmatter | docs | n/a | n/a | n/a |

## Pattern Assignments

### `src/main/ipc/targetChannels.ts` (IPC controller, D-05)

Current handlers (:83-93) and signature (:70-78) to extend:
```typescript
export function registerTargetChannels(
  win, resolver, scanner: { abortScan(): void }, searcher: { abortSearch(): void },
  executor?: { abortExecution(): void },
  tagExecutor?: { abortExecution(): void },
  addExecutor?: { abortExecution(): void }          // -> add getState(): { step: string }
): void {
  ipcMain.handle(TARGET_RESOLVE, async (_event, payload: unknown) => {
    const parsed = ResolveTargetSchema.parse(payload) // validate first (V5)
    await resolver.resolve(parsed.input)
    return resolver.getState()
  })
  ipcMain.handle(TARGET_CONFIRM, () => {
    resolver.confirm()
    return resolver.getState()
  })
```
Copy shape: Zod parse first, then `if (addExecutor && addExecutor.getState().step !== 'idle') return resolver.getState()`, then the existing body. TARGET_RESET stays unchanged (`addExecutor?.abortExecution()` at :110). Existing tests pass `addExecutor` mocks with only `abortExecution`, so use `addExecutor?.getState?.().step` or update the mocks.

**Test analog** (`targetChannels.test.ts:21-37`): captured-handler pattern.
```typescript
const capturedHandlers: Record<string, IpcHandler> = {}
vi.mock('electron', () => ({ ipcMain: { handle: (channel, handler) => { capturedHandlers[channel] = handler } }, BrowserWindow: vi.fn() }))
```

### `src/main/ipc/searchChannels.ts` (D-05 / D-07 candidate guard)

Hole to close, `TARGET_RESOLVE_CANDIDATE` (:104-122):
```typescript
const parsed = ResolveCandidateSchema.parse(payload)
const accessHash = searcher.getCandidateAccessHash(parsed.userId)
if (accessHash === null) { throw new Error('Unknown userId — not in current candidate set') }
await resolver.resolveByCandidate(BigInt(parsed.userId), accessHash)
return resolver.getState()
```
Insert the same non-idle guard after the Zod parse and before the access-hash gate, returning `resolver.getState()`. Add an optional 4th param (structural `{ getState(): { step: string } }` or a lazy getter). Wiring gotcha: `registerSearchChannels` is called at `main/index.ts:~306`, before `addExecutor` exists (~:381). Either move the call or pass `() => addExecutorRef?.getState().step`.

### `src/main/ipc/addChannels.ts` (ADD_START, D-07)

Resume computation to modify (:166-180):
```typescript
const existingJob = auditStore.readJob()
const resume = existingJob !== null && existingJob.status !== 'complete'
executor.execute({ dialogIds: parsed.dialogIds, resume }).catch(() => {})
return executor.getState()
```
Pattern: reject by `return executor.getState()` without calling `execute` (same shape as the Layer 2/3/4 rejection returns at :150-160). The handler has no resolver, so call a narrow executor method (for example `executor.checkResumeIdentity(existingJob)`), added to `AddExecutorLike` and to the mock in `addChannels.test.ts`. Narrow-reject scope per CONTEXT D-07: reject only a mismatch against a live in-memory job or a Resume of job A. An idle executor plus a reviewed different target B starts a fresh job, as today. The store already treats an idle return as "not started" (`addStore.ts:137`, keeps `pendingJob`, dialog shows `resumeFailed`).

### `src/main/telegram/AddExecutor.ts`

**execute() relaunch rebuild** (:205-235), where the mismatch check is added. Resolver id vs `existing.targetId` must be checked before `initJob`:
```typescript
const existing = this._auditStore.readJob()
let resolved: ResolvedAddUser | null = this._resolver.getResolvedUser()
if (resolved === null && params.resume === true && existing !== null && existing.status !== 'complete'
    && sameDialogIdSet(existing.dialogIds, params.dialogIds)) {
  const isIntString = (v: unknown): v is string => typeof v === 'string' && /^-?\d+$/.test(v)
  if (isIntString(existing.targetId) && isIntString(existing.targetAccessHash)) {
    resolved = { id: BigInt(existing.targetId), accessHash: BigInt(existing.targetAccessHash),
                 name: typeof existing.targetName === 'string' ? existing.targetName : '', deleted: false, bot: false }
  }
}
if (resolved === null) { this._emitEarlyIdle(); return }
```
The F2 fresh-job hole is `isContinuation` (:307-313) false -> `initJob` branch (:322-338). `initJob` job literal (add `bannedDialogIds` here, from `scanResults.filter(r => r.status === 'banned' && params.dialogIds.includes(r.dialogId))`; preserve from `existing` on continuation):
```typescript
const job: AddJobFile = { schemaVersion: 1, jobId, targetId, targetName,
  targetAccessHash: resolved.accessHash.toString(), dialogIds: params.dialogIds,
  outcomes: [], dmStatus: 'pending', startedAt: jobId, status: 'running' }
this._auditStore.initJob(job)
```
Pitfall 3: `_emitEarlyIdle()` (:991) clears `_resolvedTarget` and `_jobDialogIds`. Do not reach it while a stopped/hard-stopped band is live. Reject in `addChannels` first.

**scanStatusFor** (:357) and the call at :382-387 use the live scan only. F3 rule: `liveScan ?? (job.bannedDialogIds?.includes(id) ? 'banned' : undefined)`. A live result wins.

**retryGroup** (:581-650), the D-06 target. Line 592 is the line to replace:
```typescript
const resolved = this._resolver.getResolvedUser() ?? this._resolvedTarget   // :592  -> this._resolvedTarget only
if (resolved === null) return
// add per RESEARCH:
const live = this._resolver.getResolvedUser()
if (live !== null && live.id !== resolved.id) return
if (this._auditStore.readJob()?.targetId !== resolved.id.toString()) return
```
Scan status at retry (:600-602) currently reads `scanner.getState().results`. Apply the same `?? persisted banned` fallback.

**Retry tail** (:628-650) is where the F5 DM and log go. Existing order is checkpoint, then emit. Keep the gen guard before any state write and put the new steps in this order (Pitfall 2): checkpoint outcome, appendBlock (log), then `_sendDm`, then re-checkpoint/emit with the DM result field. Generation guard as already written:
```typescript
if (gen !== this._generation) return
if (this._currentState.step !== 'complete' && ... !== 'stopped' && ... !== 'hard-stopped') return
this._auditStore.checkpoint(dialogId, newOutcome)
```
Hard-stop handling copies WR-01/CR-03:
```typescript
if (classifyRpcError(err).disposition === 'hard-stop') { this._hardStopRetry(dialogId); return }
```

**DM send block to extract into `_sendDm()`** (:481-500 and the continuation to the hard-stop branch). Refusal classification must stay byte-identical:
```typescript
const text = this._getDmText({ name: targetName, links })
const inputPeerUser = new Api.InputPeerUser({ userId: bigInt(resolved.id.toString()), accessHash: bigInt(resolved.accessHash.toString()) })
const randomId = bigInt(randomBytes(8).toString('hex'), 16)
try {
  await this._governor.run(() => this._client.invoke(new Api.messages.SendMessage({ peer: inputPeerUser, message: text, randomId })))
  dmStatus = 'sent'
} catch (err) {
  const msg = (err as { errorMessage?: string })?.errorMessage ?? ''
  if (['USER_PRIVACY_RESTRICTED','USER_IS_BLOCKED','YOU_BLOCKED_USER','PRIVACY_PREMIUM_REQUIRED'].includes(msg)) dmStatus = 'refused'
  else if (classifyRpcError(err).disposition === 'hard-stop') { /* existing hard-stop handling */ }
```
Read :500-535 when extracting. I did not excerpt the hard-stop branch body.

**Log entry** (:537-): `this._addLogStore.appendBlock({...isFollowUp: isContinuation...})`. For the retry use `isFollowUp: true`, `addedDialogs: []`, `linkedDialogs: [{dialogId, title, link}]`, and `dmStatus` of `'sent' | 'refused'` only.

**Test analog** (`addExecutor.test.ts`, `addResume.integration.test.ts:1-90`): `makeAuditStore(seed)` fake with `initJobCalls`, `createMockTelegramClient`, `RateLimitGovernor`, `build(resolverNull, mockConfig, seed)`. Seed has `jobId: 'ORIGINAL-JOB-ID'`, `targetId: '99'`, `targetAccessHash: '12345'`. For D-14 copy `makeAuditStore`/`build`, then wire the real `registerAddChannels` plus `registerTargetChannels` with `capturedHandlers`, and assert `initJobCalls.length === 0` on mismatch.

### `src/main/storage/addAuditStore.ts` and `src/shared/addTypes.ts` (D-10, D-12)

Zod schemas are non-passthrough (:107-139), so a new field not listed here is silently stripped on `readJob()`:
```typescript
const AddGroupOutcomeSchema = z.object({
  dialogId: z.string(),
  status: z.enum(['done','already-member','privacy-blocked','failed','skipped']),
  errorCode: z.string().optional(),
  reason: z.enum(['privacy','channel-full']).optional(),
  link: z.string().optional(),
  premiumWouldAllow: z.boolean().optional(),
  timestamp: z.string(),
  // + retryDmStatus: z.enum(['sending'?,'sent','refused']).optional()   (planner's shape; 'sent'|'refused' persisted)
})
const AddJobFileSchema = z.object({ ..., status: z.enum([...]),
  // + bannedDialogIds: z.array(z.string()).optional()
})
```
Mirror in `AddJobFile` / `AddGroupOutcome` in `addTypes.ts`. If stripped in `ADD_GET_JOB`: `AddJobFileSafe = Omit<AddJobFile, 'targetAccessHash' | 'bannedDialogIds'>`. Required test: real `createAddAuditStore({ fs: fakeFs, app: fakeApp })` round trip (see `addAuditStore.test.ts`) asserting the field survives `readJob()` and that an old file without it parses.

### `src/main/ipc/languageChannels.ts` + channel plumbing (D-13)

Analog `LANGUAGE_SET` handler (:96-107) and cache (:60-78):
```typescript
const LanguageSchema = z.object({ language: z.enum(['en', 'cs']) })
let _cachedLanguage: 'en' | 'cs' | null = null
export function getCachedLanguage(): 'en' | 'cs' | null { return _cachedLanguage }
ipcMain.handle(LANGUAGE_SET, async (_event, payload: unknown) => {
  const { language } = LanguageSchema.parse(payload)
  const store = await getStore()
  store.set('language', language)
  _cachedLanguage = language
  return language
})
```
New `LANGUAGE_SET_DETECTED` handler: same Zod schema, but it only sets `_detectedLanguage` (no `store.set`, so the "unset means follow OS" contract is preserved). Add `getEffectiveLanguage() = _cachedLanguage ?? _detectedLanguage ?? 'en'`. Replace the `getCachedLanguage() ?? 'en'` consumer at `main/index.ts:~373`. Whitelist the new channel in `src/shared/channels.ts` (~:150-170 array), preload, and the renderer language client. The renderer calls it after `initI18n` in `main.tsx:~19`, where `navigator.language.startsWith('cs')` is chosen. Extend `languageChannels.test.ts` (existing captured-handler test).

### `src/renderer/groups/addPaneState.ts` (pure helpers, D-04, D-03, D-14)

Analog is the file itself. Add `'no-groups'` to the union and the first check:
```typescript
export type AddEmptyState = 'none' | 'all-member' | 'cannot-add'   // + 'no-groups'
export function getAddEmptyState(dialogs, statusOf, failedCount): AddEmptyState {
  if (dialogs.length === 0) return 'none'        // -> 'no-groups', ahead of the failedCount check
  if (failedCount > 0) return 'none'
  ...
```
Add pure helpers in the same style (no React). Test them in `addPaneState.test.ts` (:20-24 currently asserts `'none'` for `[]` and must flip to `'no-groups'`):
```typescript
export type PaneView = 'browse' | 'checklist' | 'job'
export function getPaneView(addStep: string, targetStep: string): PaneView {
  if (addStep !== 'idle' && targetStep !== 'confirmed') return 'job'
  return targetStep === 'confirmed' ? 'checklist' : 'browse'
}
// job rows: allDialogs filtered to add.dialogIds, ordered by index in add.dialogIds (UI-SPEC section 1)
```
`isAddStatusInJob` (:30-32) stays unchanged.

### `src/renderer/groups/GroupsPane.tsx` (D-01..D-04, D-11, D-12, D-14)

Mode derivation and scan effects to change (:94-115). A third `'job'` value fires neither effect because they key on `'browse'` and `'checklist'`:
```typescript
const mode = targetState.target.step === 'confirmed' ? 'checklist' : 'browse'      // :95 -> getPaneView(add.step, targetState.target.step)
useEffect(() => { if (mode === 'browse' && (scan.step === 'scanning' || scan.step === 'complete')) void groupsActions.abortScan() }, [mode])
useEffect(() => { if (mode === 'checklist' && scan.step === 'idle') void groupsActions.startScan() }, [mode])
```
Danger: the `'browse'` abort effect must not fire when entering `'job'`.

Progress slot gate to relax (:349-351). Add branches render when `add.step !== 'idle'`, before the `mode !== 'checklist'` check:
```typescript
function renderProgressSlot() {
  if (mode !== 'checklist') return null         // :351 -> allow add.step !== 'idle' first (view === 'browse' returns null)
  if (activeMode === 'tag') { ... }
```
Also use `const effectiveMode = add.step !== 'idle' ? 'add' : activeMode` so the first render shows the band before the AppShell effect runs.

Label source (D-01): replace `targetName` (confirmed target, :122) with `add.targetName` at :494 (`progressLabel`), :617 (`dmStatusSent`), :622 (`dmStatusRefused`):
```typescript
{tAdd('dmStatusSent', { name: targetName })}   // -> add.targetName
```

Job-only list (:140-175 `displayedDialogs` branches on `mode === 'browse'`): add a `'job'` branch using the pure helper. No scan partition, no checkbox props.

Stopped-band Resume (c-add band, :541-640). The existing PEER_FLOOD Resume button is the copy source (:530-541):
```tsx
<Button variant="default" size="sm" onClick={() => void addActions.resumeJobFromDisk()}>
  {tAdd('peerFloodResumeLabel')}
</Button>
```
Place it first in the band's right-hand button group (`<div className="flex items-center gap-2">` at ~:620, before Export and "Add someone else") when `add.step === 'stopped'` and `getResumeDialogIds(job)` is non-empty. Add in-flight (`Loader2` + `add.confirmDispatching`), disabled-when-groups-not-loaded (`add.resumeLoadingGroups`), and the `resumeFailedBand` line (`text-label font-normal text-destructive`). `resumeJobFromDisk()` currently returns void, so the store needs a boolean or an error-state return.

ModeSwitch call (:848-853) disabled expression:
```tsx
disabled={scan.step === 'scanning' || isRunActive || props.stage === 'run' || props.stage === 'report'}   // + || add.step !== 'idle'
```
Zero-dialogs: `renderEmptyState()` (:267-343), checklist branch around :319 uses `getAddEmptyState`. Add a `'no-groups'` branch that renders the existing `emptyState.noGroups.heading/body` markup from the browse branch (UI-SPEC section 7). Do not render `renderEmptyState()` content for the `'job'` view.

### `src/renderer/groups/ModeSwitch.tsx` (D-02)

Pattern at :31-33; the tooltip is the only new branching:
```typescript
const disabledProps = disabled ? { disabled: true, title: tG('modeSwitchDisabledTooltip') } : {}
```
Pass a second prop (for example `lockedByAddJob?: boolean`) and select `tG('modeSwitchLockedAddJobTooltip')` when set. Test via `ModeSwitch.test.tsx` helpers (`getButtons`, `hasDisabledAttribute`, `getAttr`, :20-47).

### `src/renderer/shell/AppShell.tsx` (D-02, D-05, D-01)

Add auto-advance effect is the pattern for the new force-add effect (:122-131):
```typescript
const { state: add, pendingJob: pendingAddJob } = useAddStore()
useEffect(() => {
  if (stage === 'run' && mode === 'add' && (add.step === 'complete' || ...)) setStage('report')
}, [add.step, stage, mode])
```
New effect: `useEffect(() => { if (add.step !== 'idle' && mode !== 'add') setMode('add') }, [add.step, mode])`. Left pane (:146-160) renders `<TargetInput />` always, then `<CandidateList />` when `search.step !== 'idle'` and `<TargetCard ... />`. Changes: pass a `locked` prop to `TargetInput` while `add.step !== 'idle'`. Hide `CandidateList` while `add.step !== 'idle'`. Render `<JobTargetCard />` instead of `<TargetCard>` when `add.step !== 'idle'` and there is no confirmed target. `onResume={() => { setMode('add'); setStage('run') }}` (:197) already forces add mode.

### `src/renderer/target/JobTargetCard.tsx` (new) and `avatarFallback.ts` (new)

Analog: `TargetCard.tsx`. Move these verbatim into `avatarFallback.ts` and import them back (no behavior change):
```typescript
const AVATAR_COLORS = [ ...7 hues... ]                                  // TargetCard.tsx:36-44
function getAvatarColor(numericId: string): string { return AVATAR_COLORS[Number(BigInt(numericId) % 7n)] }   // :46-48
function getInitials(name: string): string {                            // :70-74
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
```
Export all three. `getAvatarColor` calls `BigInt(numericId)`, so guard against an empty `add.targetId` in the job card. Structure and classes come from UI-SPEC section 3 (`max-w-[560px] rounded-lg border bg-card p-6 flex flex-col gap-4`, `h-16 w-16` Avatar, no ring, no `AvatarImage`). Reuse TargetCard's `AvatarFallback` usage (`text-white font-semibold text-base`, :129-135). Test via the `TargetCard.test.tsx` `renderToStaticMarkup` pattern. i18n is uninitialised, so assertions use raw keys.

### `src/renderer/target/TargetInput.tsx` (D-05)

Existing disable pattern (:268-281, :375-377):
```tsx
disabled={isResolving}          // Input and country chip
disabled={isFindDisabled}       // Find person Button
```
OR in the lock: `disabled={isResolving || locked}`, and fold `locked` into `isFindDisabled`. Guard Enter/paste handlers (`if (locked) return`). Replace the hint area with `<p id=... className="text-label font-normal text-muted-foreground">{t('lookupLockedAddJob')}</p>` and link it via `aria-describedby` on the `<Input>`. Show nothing for a guarded main no-op (UI-SPEC section 4).

### `src/renderer/store/addStore.ts` (D-11)

Analog: itself. `resumeJobFromDisk` (:170-186) already re-reads the job via `addClient.getAddJob()`, so the F4 button only has to call it. `pendingJob` is read once at :67-72 and is only for the launch dialog. Change the return so the band can show `resumeFailedBand`:
```typescript
async resumeJobFromDisk(): Promise<void> {            // -> Promise<boolean>
  try {
    const freshJob = await addClient.getAddJob()
    if (!freshJob || freshJob.status === 'complete') return
    if (isJobFinished(freshJob)) return
    await addActions.startAdd(getResumeDialogIds(freshJob))   // returns false on idle => surface failure
  } catch (err) { console.error('[addStore] resumeJobFromDisk:', err) }
}
```
`getSnapshot` needs the `cachedSnapshot` identity guard (:107-118) if new fields are added to the snapshot. Do not break it (Pitfall 2, infinite render loop).

### `src/renderer/groups/GroupRow.tsx` (D-12)

Add `addDmStatus`/`addDmName` props beside the existing Add status props. Render under the `rowStatus.linkCreated` + Copy-link line and above the Premium hint. Styles are in UI-SPEC section 6. Analog: the existing `linkCreated` subline in the same file. The queued branch keeps its disabled checked checkbox (Pitfall 8). In the job view pass no `isChecked` or `onToggle`.

### i18n JSON (`en`/`cs` `add.json`, `groups.json`, `target.json`)

Add the exact keys and strings from UI-SPEC "New strings", with namespaces nested like existing keys (`jobCard.*`, `rowStatus.retryDm*`). The quoted button name inside `lookupLockedAddJob` must equal `add.addSomeoneElse` in each language. The en/cs parity test (`i18n.test.ts`) catches a missing key. Czech uses formal vykání.

## Shared Patterns

### Identity never crosses the bridge; main is authority (T-05-04-B, T-14-16)
**Source:** `addChannels.ts` ADD_START Layer 1 comment and the `resume` computation (:136-180).
**Apply to:** every new guard (targetChannels, searchChannels, addChannels, retryGroup, `language:setDetected`). Renderer gating is UX only. Validate payloads with Zod before any logic. No new payload carries identity or `resume`.

### Structural-type injection (avoid import cycles)
**Source:** `registerTargetChannels` params (:70-78). Pass `{ abortExecution(): void; getState(): { step: string } }`-style structural types. Keep new members optional-tolerant for existing tests.

### Generation-guarded async
**Source:** `retryGroup` (`const gen = this._generation` before await, `if (gen !== this._generation) return` after). Apply to the new `_sendDm` await in the retry tail. Never touch `_runActive` or `_resolvedTarget` from the retry tail.

### Job-file persistence needs the Zod schema
**Source:** `addAuditStore.ts:107-139`. Every new persisted field gets `.optional()` in the schema, the shared type, and a real-store round-trip test.

### Pure view-model helper plus static-render tests (no jsdom, no RTL)
**Source:** `addPaneState.ts` plus `addPaneState.test.ts`, `ModeSwitch.test.tsx`. Put derivations in pure functions and assert component markup with `renderToStaticMarkup` using raw i18n keys.

### Captured-handler IPC tests
**Source:** `targetChannels.test.ts:21-37` (`vi.mock('electron', ...)` capturing `ipcMain.handle`). Apply to the guard tests and the new relaunch integration test.

### Typecheck and tests (project memory)
Use `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`. Never `tsc --build`, which emits stale `.js`/`.d.ts` into `src/` and Vitest then runs them. Check `git status` for stray artifacts.

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `GroupsPane.job.test.tsx` (full-pane static render with mocked store hooks) | test | `GroupsPane` has no test today. Closest are `ModeSwitch.test.tsx`/`GroupRow.test.tsx`. If heavy, fall back to the `getPaneView` unit test plus an extracted add-band component test (RESEARCH Wave 0). |
| Transient in-flight/failed Resume UI state | store/component | No existing local "resume failed" state on the stopped band. Closest is the dialog's `resumeFailed` handling in `AddResumeJobDialog.tsx` (not read here). Planner should read it for the in-flight/failed pattern. |
| Retry DM `'sending'` status | state | There is no transient per-row state in `AddGroupOutcome` today. Persist only `sent`/`refused`. Show "sending" from a renderer-local flag or skip it. |

## Open Items for the Planner

- RESEARCH.md OQ-1 is resolved by CONTEXT D-07 (narrow reject). The identity check lives in a narrow `AddExecutor` method that `addChannels` calls.
- `AddExecutor.ts` hard-stop branch of the end-of-run DM (:500-535) was not excerpted. Read it when extracting `_sendDm`.
- Retry-`done` logging (A3) is optional. Job-level `dmStatus` when the previous value was `'not-needed'`: RESEARCH F5 recommends updating it.

## Metadata

**Analog search scope:** `src/main/ipc`, `src/main/telegram`, `src/main/storage`, `src/shared`, `src/renderer/{groups,shell,target,store}`
**Files scanned:** about 20 (targeted reads and greps)
**Pattern extraction date:** 2026-10-24
