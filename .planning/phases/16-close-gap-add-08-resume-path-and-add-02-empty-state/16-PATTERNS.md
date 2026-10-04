# Phase 16: Close gap ADD-08 resume path and ADD-02 empty state - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 19 modified (0 new source files; 1 optional new test file)
**Analogs found:** 19 / 19 (all are in-place edits; analog = the file itself or its sibling test)

All paths are relative to `/Users/igraczech/Repositories/MrProper/src` unless stated. Test hygiene: run `npx tsc --build`, then delete emitted `.js`/`.d.ts` under `src/` before Vitest.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `renderer/removal/AddResumeJobDialog.tsx` | component | request-response | itself; `renderer/removal/TagResumeJobDialog.tsx` | exact |
| `renderer/store/addStore.ts` (`resumeJobFromDisk`, `startAdd`) | store | request-response | itself | exact |
| `renderer/store/addStore.test.ts` (~L256-300) | test | request-response | itself | exact |
| `main/telegram/AddExecutor.ts` (`execute`, log plumbing) | service | event-driven/batch | itself | exact |
| `main/telegram/addExecutor.test.ts` | test | batch | itself (describe at L1053, L1428) | exact |
| new cross-process resume test (Claude's discretion; e.g. `main/telegram/addResume.integration.test.ts`) | test | request-response | `addExecutor.test.ts` helpers + `addStore.test.ts` mocking | role-match |
| `main/telegram/GroupEnumerator.ts` (`canUnban`) | service | transform | itself (`canAct` L179/208, `_buildDTO` L295) | exact |
| `main/telegram/groupEnumerator.test.ts` | test | transform | itself | exact |
| `shared/groupTypes.ts` (`AdminDialogDTO`) | model/type | - | itself (L40-59) | exact |
| `renderer/groups/modeRules.ts` | utility | transform | itself | exact |
| `renderer/groups/modeRules.test.ts` | test | transform | itself (L32-50) | exact |
| `renderer/wizard/addValidation.ts` (`computeAddGroups`) | utility | transform | itself (L30-52) | exact |
| `renderer/wizard/addValidation.test.ts` | test | transform | itself | exact |
| `renderer/store/groupsStore.ts` | store | event-driven | itself (L83, L203 already use predicate) | exact |
| `renderer/groups/GroupsPane.tsx` | component | request-response | itself | exact |
| `renderer/groups/GroupRow.tsx` (+ `GroupRow.test.tsx`) | component | request-response | itself; static-render test | exact |
| `renderer/target/TargetCard.tsx` | component | request-response | `GroupsPane.isRunActive` L190 | role-match |
| `renderer/i18n/locales/{en,cs}/{groups,add}.json` | config | - | existing `emptyState`, `greyReason` keys | exact |
| `main/index.ts` (`getDmText`) + `main/ipc/languageChannels.ts` | config/wiring | request-response | itself | exact |
| `shared/addTypes.ts` | model | - | read-only reference (`AddJobFile` L131-154) | exact |

## Pattern Assignments

### `renderer/removal/AddResumeJobDialog.tsx` (D-01, D-02, D-04)

Current (L31-51) to change:
```tsx
const processedCount = job.outcomes.length
const totalCount = job.dialogIds.length
// Remaining dialog IDs = those not yet in outcomes (unprocessed groups)
const remainingDialogIds = job.dialogIds.filter(
  (id) => !job.outcomes.find((o) => o.dialogId === id)
)
...
const handleResume = useCallback(() => {
  void addActions.startAdd(remainingDialogIds)
  onOpenChange(false)
  onResume?.()
}, [remainingDialogIds, onOpenChange, onResume])
```
Change to: `processedCount = job.outcomes.filter(o => o.status !== 'skipped').length`; `handleResume` calls `addActions.startAdd(job.dialogIds)` (full set). Drop `remainingDialogIds`. Also update the header comment (L5-6 says "takes ONLY the remaining dialog ids"). Do not call `onOpenChange(false)`/`onResume()` blindly: per D-04 `startAdd` must leave `pendingJob` set if state is still `idle`; make `handleResume` async and only call `onResume` after a run actually started (or let AppShell derive it from store state).

D-04 loading hint: `AppShell.tsx` L100 / L196-203 mounts the dialog (`pendingAddJob && <AddResumeJobDialog ... onResume={() => { setMode('add'); setStage('run') }} />`). Pass a `groupsLoaded` prop from `useGroupsStore().groups.step === 'loaded'` (groupsStore exposes `groups` state, see `groupsStore.ts` L67-74 `groups.step === 'loaded'`) or subscribe inside the dialog. Disable the Resume `Button` (L83-90) when not loaded and show an `add` namespace key (new, e.g. `resumeLoadingGroups`: "Loading your groups…"; cs vykání). Dialog buttons pattern to keep: `<Button variant="default" onClick={handleResume} aria-label={t('resumeDestructiveAria')}>`; `<Dialog open={open} onOpenChange={() => {}}>` (CR-04) stays.

### `renderer/store/addStore.ts` (D-01, D-02, D-04)

`resumeJobFromDisk` (L168-180), current:
```ts
const freshJob = await addClient.getAddJob()
if (!freshJob || freshJob.status === 'complete') return
const remaining = freshJob.dialogIds.filter(
  (id) => !freshJob.outcomes.find((o) => o.dialogId === id)
)
if (remaining.length === 0) return
await addActions.startAdd(remaining)
```
Change: compute `finished = new Set(outcomes.filter(o => o.status !== 'skipped').map(o => o.dialogId))`; if `freshJob.dialogIds.every(id => finished.has(id))` return (nothing left); else `await addActions.startAdd(freshJob.dialogIds)`.

`startAdd` (L120-131), current:
```ts
const s = await addClient.startAdd(dialogIds)
setState(s)
// CR-05 analog: clear pendingJob on successful dispatch so AddResumeJobDialog unmounts
pendingJob = null
notify()
```
Change: only `pendingJob = null` when `s.step !== 'idle'`; otherwise keep `pendingJob` (still `setState(s)`). Module-level `pendingJob`/`notify()`/`setState` are the existing mutation idiom. Bootstrap of `pendingJob` is at L62-70 (`job.status !== 'complete'`); consider applying the same "all non-skipped outcomes cover every dialog => finished" guard there (D-02) so no Resume prompt shows for such a job.

### `renderer/store/addStore.test.ts` (update L256-300)

Pattern: `loadFreshStore()` (L48-60) resets modules; mocks `addClient` at L24-34; tests build jobs with `makeSafeJob({...})` and `makeCompletedAddState()`.
```ts
it('no-ops when remaining (dialogIds minus outcome ids) is empty', async () => {
  const { addActions, mockClient } = await loadFreshStore()
  mockClient.getAddState.mockReturnValue(new Promise(() => {}))
  mockClient.getAddJob.mockResolvedValue(makeSafeJob({ dialogIds: ['1','2'], outcomes: [ {dialogId:'1',status:'done',...}, {dialogId:'2',status:'failed',...} ] }))
  await addActions.resumeJobFromDisk()
  expect(mockClient.startAdd).not.toHaveBeenCalled()
})
it('calls startAdd with the remaining dialogIds (not present in outcomes)', ...)  // L~290: must now assert startAdd called with the FULL ['1','2','3']
```
Update: the "remaining" test now expects `toHaveBeenCalledWith(['1','2','3'])`. Add cases: (a) one `'skipped'` outcome plus all others finished => startAdd IS called with full set; (b) all non-skipped => no-op; (c) `startAdd` returns `idle` state => `pendingJob` retained (use `useAddStore().pendingJob`; `useSyncExternalStore` is mocked synchronous so snapshots are readable directly).

### `main/telegram/AddExecutor.ts` (D-03, D-05, D-14)

Null-resolver gate (L202-208), current:
```ts
const resolved = this._resolver.getResolvedUser()
if (resolved === null) {
  this._runActive = false
  this._emit({ ...this._currentState, step: 'idle', floodWaitRemaining: null })
  return
}
```
Change: when `params.resume === true && resolved === null`, read `const existing = this._auditStore.readJob()`; if non-null and `status !== 'complete'` and `sameDialogIdSet(existing.dialogIds, params.dialogIds)`, build a resolved-shaped object from `existing.targetId` (BigInt), `existing.targetAccessHash` (BigInt), `existing.targetName`, `deleted:false, bot:false, contact:false`. Otherwise keep today's idle return. Shape to match: `ResolvedAddUser` (L90-ish; stub in test is `{ id: BigInt('99'), accessHash: BigInt('12345'), name, deleted:false, bot:false, contact:false }`). Downstream uses of the resolver: L549 `this._resolver.getResolvedUser()` inside a second method (retry path) - check it also needs the fallback or leave per scope. Identity must never come from `params` (T-05-04-B); main-only.

Continuation gate (L264-290) stays untouched (D-01):
```ts
const existing = this._auditStore.readJob()
const isContinuation =
  params.resume === true && existing !== null && existing.status !== 'complete' &&
  existing.targetId === targetId && sameDialogIdSet(existing.dialogIds, params.dialogIds)
...
outcomes = existing!.outcomes.filter((o) => o.status !== 'skipped')
```
Note the `existing` variable is already declared at L269; hoist a single `readJob()` call above the resolver gate rather than declaring twice.

Title plumbing (L498-502), current:
```ts
addedDialogs: outcomes.filter((o) => o.status === 'done').map((o) => ({ dialogId: o.dialogId })),
linkedDialogs: linkedOutcomes.map((o) => ({ dialogId: o.dialogId, link: o.link! })),
```
Change: build `const titleOf = (id: string) => groupsState.dialogs.find(d => d.id === id)?.title` (or via `selectedDialogs`) and emit `{ dialogId, title: titleOf(o.dialogId) }` / `{ dialogId, link, title }`. Check the `AddLogBlockEntry` type in `main/storage/addLogStore.ts` already has optional `title` (writer prints `title ?? d.dialogId` at L87 and L96 as `${d.title ?? d.dialogId}`; L96 is `${d.title ?? d.dialogId}: ${d.link}`).

### `main/telegram/addExecutor.test.ts`

Helpers to reuse: `makeDialog(id, type)` (L41-56), `makeAddAuditStore(dialogIds, existing?)` (L66-130, `existing` seeds job; supports `readJob/checkpoint/setStatus/initJob`), `makeAddLogStore()` (L137), `makeExecutor({dialogs, resolved?, auditStore, addLogStore, getDmText, mockConfig, scanResults})` (L173-228). `makeExecutor` currently hardwires `stubResolver.getResolvedUser` to return a user; for D-03 add a config option (e.g. `resolverNull?: boolean`) that returns `null`. Pattern for continuation tests (L1053-1135):
```ts
const auditStore = makeAddAuditStore(dialogIds, { jobId: 'OLD-JOB-ID', targetId: '99', dialogIds, outcomes: [existingOutcome], dmStatus: 'pending', status: 'stopped' })
const { executor, states } = makeExecutor({ dialogs, auditStore })
const p = executor.execute({ dialogIds, resume: true })
await vi.runAllTimersAsync()
await p
expect(auditStore.initJobCalls).toHaveLength(0)
expect(auditStore._job?.jobId).toBe('OLD-JOB-ID')
```
Use `vi.useFakeTimers()` in `beforeEach` / `vi.useRealTimers()` in `afterEach`. New tests: null resolver + resume:true + matching job => runs, reuses jobId, `targetAccessHash` from seeded job; null resolver + resume:false => idle return, no initJob; null resolver + mismatched dialog set => idle. Title test mirrors L1428-1460 (`appendBlockCalls[0].addedDialogs` has `title: 'Group 17001'`; `makeDialog` titles are `'Group ' + id`).

### Cross-process resume test (D-05, new file, Claude's discretion)

Combine: the `addStore.test.ts` renderer-mock idiom (`vi.mock('react', ...)`, `vi.mock('../ipc/addClient', ...)`) is node-env-mockable but cannot be imported from `main/`. Recommended shape: a main-side test using `makeExecutor` helpers (copy or export them) that seeds a `'stopped'` job with outcomes `done`, `privacy-blocked` (with `link`), and `skipped`, then calls `executor.execute({ dialogIds: job.dialogIds, resume: true })` where `dialogIds` is the FULL set exactly as the new renderer logic computes it, asserting: same jobId, `initJobCalls` length 0, prior outcomes retained, skipped group reprocessed, one DM carrying links of both segments (`getDmText` captured), one `appendBlock` with `isFollowUp: true` referencing the original jobId. Optionally add a pure helper in the store (e.g. `computeResumeDialogIds(job)`) and import it in both tests to genuinely tie the renderer call to the executor input.

### `main/telegram/GroupEnumerator.ts` + `shared/groupTypes.ts` (D-10)

`AdminDialogDTO` (groupTypes L40-59): add after `addGreyReason`:
```ts
/** True if the admin can lift a ban here (creator || banUsers). Computed in GroupEnumerator only (D-10). */
canUnban: boolean
```
Existing computation pattern (L179, L208) to copy:
```ts
const canAct = entity.creator === true || (entity.adminRights as { banUsers?: boolean } | null | undefined)?.banUsers === true
```
- Basic group (L179-195): `canUnban: false` (D-03: no ban visibility).
- Supergroup (L208-226): `canUnban = canAct` expression (same value).
- Broadcast channel (L232-255): compute the same expression independently (do NOT use `canAct: false`); `canAct: false` is hard-coded there.
- `_buildDTO` params (L295-317) and its return object: add `canUnban`.
Every `AdminDialogDTO` literal in tests/fixtures needs the new field: `modeRules.test.ts` `makeDialog` (L14-25), `addExecutor.test.ts` `makeDialog` (L41-56), `groupEnumerator.test.ts`, `GroupRow.test.tsx`, `addValidation.test.ts`, `groupsStore.test.ts`. Find with `grep -rn "addGreyReason:" src`.

### `renderer/groups/modeRules.ts` (D-09, D-10, D-12)

Current add branch (L28-30):
```ts
if (mode === 'add') {
  return dialog.canAdd && (status === 'not-member' || status === 'banned')
}
```
Change to `dialog.canAdd && (status === 'not-member' || (status === 'banned' && dialog.canUnban))`. Update the docblock (L20-22 claims banned already implies the unban right). Remove/Tag branch unchanged.

### `renderer/groups/modeRules.test.ts`

Pattern (L32-50): `makeDialog({canAdd:true})` + `expect(isActionableForMode(d,'banned','add')).toBe(...)`. Existing test "true when canAdd is true and status is banned" (L38) must now set `canUnban: true` (and the factory default should be `canUnban: true`). Add: banned + `canUnban:false` => false; not-member + `canUnban:false` => true; banned + canAdd:false + canUnban:true => false; remove/tag unaffected by `canUnban` (L99 `banned` stays false for remove).

### `renderer/wizard/addValidation.ts` (D-12)

Current filter (L38-40): `.filter((d) => checkedIds.has(d.id) && d.canAdd)` - a defensive re-filter. Add banned guard consistent with the predicate, e.g. use `isActionableForMode(d, membershipByDialogId.get(d.id) ?? null, 'add')` (import from `../groups/modeRules`) or add `&& !(membershipByDialogId.get(d.id) === 'banned' && !d.canUnban)`. Test in `addValidation.test.ts` follows the same fixture style: add a case where a checked banned dialog with `canUnban:false` is excluded.

### `renderer/store/groupsStore.ts` (D-12)

Already calls `isActionableForMode(d, status, _activeMode)` at L83 and L203; no code change expected beyond fixtures in `groupsStore.test.ts` (new field). Verify only.

### `renderer/groups/GroupsPane.tsx` (D-06, D-07, D-08, D-15, D-16)

Partition (L150-170) already uses `isActionableForMode`; reuse the resulting `actionable` list for empty-state detection. `renderEmptyState` checklist branch (L297-312), current:
```tsx
if (mode === 'checklist' && scan.step === 'complete') {
  const memberRows = scan.results.filter((r) => r.status === 'member')
  if (memberRows.length === 0) {
    return (<div className="px-4 py-8 flex flex-col gap-1">
      <span className="text-label font-semibold">{tG('emptyState.notInAnyHeading', { name: targetName })}</span>
      <span className="text-body text-muted-foreground">{tG('emptyState.notInAnyBody', { name: targetName })}</span>
    </div>)
  }
}
```
Change: gate the existing branch to `activeMode !== 'add'`; for Tag use a new body key (e.g. `emptyState.notInAnyBodyTag`) with the shared heading; for `activeMode === 'add'` and `scan.step === 'complete'`, if no `allDialogs` row satisfies `isActionableForMode(d, status, 'add')`, render heading `emptyState.nothingToAddHeading`; body picks `emptyState.allAlreadyMember` when every scanned result is `'member'`, else `emptyState.cannotAddBody` (both `{ name: targetName }`). Reuse the exact JSX container classes above. Note `renderEmptyState` is defined at L263 before `partition` may not be in scope (partition is computed in a different block, L150-170); compute the "any actionable" boolean with a small loop or hoist it.

Run helpers: `isRunActive` (L190-193):
```ts
const isRunActive =
  removal.step === 'running' || removal.step === 'stopping' ||
  tag.step === 'running' || tag.step === 'stopping' ||
  add.step === 'running' || add.step === 'stopping'
```
`getAddStatus` (L242-258): returns `'queued'` for any row without an outcome. D-16: return `null` unless the dialog id is in the job's dialogIds. The `AddState` for running/complete states carries `outcomes` and `progress` but verify whether it exposes the job's dialog list; if not, add a main-computed `dialogIds` to the add state or derive from the confirmed selection (`checkedDialogIds` captured at confirm). Check `shared/addTypes.ts` `AddState` before choosing. Use of the result: L926 `addStatus={activeMode === 'add' ? getAddStatus(dialog.id) : null}`. Empty-state render at L903 `{emptyState ?? (...list...)}`.

### `renderer/groups/GroupRow.tsx` (D-09, D-11)

`addGreyReasonKey` (L157-162):
```ts
const addGreyReasonKey: AddGreyReason | 'already-member' | null =
  activeMode === 'add' && addStatus == null && !isPending && !isFailed
    ? membershipStatus === 'member' ? 'already-member' : dialog.addGreyReason
    : null
```
Change: add a branch so `membershipStatus === 'banned' && !dialog.canUnban` (and `dialog.canAdd`) gives `'banned-no-unban-right'` (the `AddGreyReason` union already includes it, groupTypes L31; i18n key exists in en/cs `greyReason.banned-no-unban-right`). The banned note at L554 `activeMode === 'add' && addStatus == null && membershipStatus === 'banned' && dialog.canAdd` must additionally require `dialog.canUnban` (D-11). Test with the static-render idiom in `GroupRow.test.tsx` (L19-39): `renderToStaticMarkup(<GroupRow dialog=... membershipStatus='banned' isChecked={false} activeMode='add' .../>)`, assert on raw key strings such as `greyReason.banned-no-unban-right` and absence of `rowNote.bannedWillUnban`. `isGreyedVisual` (L151) uses `isActionable`, so it must come from the shared predicate; verify it (grep `isActionable` in GroupRow.tsx).

### `renderer/target/TargetCard.tsx` (D-15)

Current (L111-112): `const isRemovalRunning = removal.step === 'running' || removal.step === 'stopping'`; used at L282, 288-289, 295 (button `disabled`, `aria-disabled`, tooltip `tTr('stopRemovalFirst')`). Change: subscribe to tag and add stores (`useTagStore`, `useAddStore`, imported as in `AppShell.tsx` L21-23) and extend with the same `isRunActive` rule as `GroupsPane` L190-193. Optionally extract a shared pure helper to avoid drift. The tooltip key `stopRemovalFirst` mentions removal; consider a neutral key (en/cs `target.json`).

### `renderer/i18n/locales/{en,cs}/groups.json` and `add.json` (D-07, D-08, D-04)

Existing shape to extend (en `groups.json` L36-46):
```json
"emptyState": {
  "noGroups": { "heading": "No groups found", "body": "..." },
  "noMatches": { "heading": "No matches", "body": "..." },
  "notInAnyHeading": "Not in any of your groups",
  "notInAnyBody": "{{name}} isn't a member of any group you can remove them from. ..."
}
```
cs equivalent at `cs/groups.json` L46-47 (formal vykání, e.g. "Není v žádné z vašich skupin"). Add keys: `nothingToAddHeading` ("Nothing to add"), `allAlreadyMember` ("{{name}} is already in every group you can invite them to"), `cannotAddBody` ("{{name}} can't be added to the remaining groups — you lack the invite right or the group is full"), `notInAnyBodyTag`. `add.json` resume keys at en L90-94 (`resumeBody`, `resumeDestructive`, ...); add `resumeLoadingGroups`. Keep en and cs key sets identical (check for an existing i18n parity test with `grep -rn "locales" src --include=*.test.ts`). The `greyReason.banned-no-unban-right` key already exists (L18 en, L18 cs).

### `main/index.ts` + `main/ipc/languageChannels.ts` (D-13)

Current (L369-375):
```ts
const storedLanguage = await getStoredLanguage()
const dmLanguage: 'en' | 'cs' = storedLanguage ?? 'en'
const getDmText = (vars: { name: string; links: string }): string =>
  renderTemplate(
    getCachedTemplate() ?? (dmLanguage === 'cs' ? DEFAULT_TEMPLATE_CS : DEFAULT_TEMPLATE_EN),
    vars
  )
```
`getDmText` is synchronous (the `DmTextProvider` contract; AddExecutor calls it sync), while `getStoredLanguage()` (languageChannels.ts L58-61) is async and has no cache. Pattern to copy: the template's sync cache (`preloadTemplateCache()` / `getCachedTemplate()` in `templateChannels.ts`). Add a sync `getCachedLanguage()` in `languageChannels.ts` that is warmed at launch and updated inside the `LANGUAGE_SET` handler (registered below L70), then `getDmText` calls it at render time. Update the docblock at L48-57 which says language changes are not retroactive. Also check the renderer's DM-preview default-language logic so both stay byte-identical (D-13: no renderer change expected).

## Shared Patterns

### Single actionability predicate
**Source:** `renderer/groups/modeRules.ts` `isActionableForMode`. **Apply to:** `groupsStore` (L83, L203), `GroupsPane` partition (L164), `addValidation.computeAddGroups`, new empty-state detection, `GroupRow` grey reason. Never inline a second rule (Pitfall 2).

### Main-computed booleans only (ADD-04, T-14-01)
`canAct`/`canAdd`/`canUnban` are derived in `GroupEnumerator` from `creator || adminRights.banUsers`; the renderer only combines them. Identity (`targetAccessHash`) read only inside main from the job file; renderer sends `dialogIds` only (Zod `min(1)` in `addChannels.ts` ADD_START; `resume` computed in main).

### Test idioms
- Pure fn tests: `modeRules.test.ts` style (node env, `makeDialog(overrides)` factory; add `canUnban` to every factory).
- Store tests: `vi.mock('react', ...)` + `vi.mock('../ipc/addClient', ...)` + `loadFreshStore()` with `vi.resetModules()`.
- Executor tests: fake timers + `await vi.runAllTimersAsync(); await p`, `makeAddAuditStore` / `makeAddLogStore` / `makeExecutor` helpers.
- Components: `renderToStaticMarkup`, no i18n init, assert on raw key strings (`GroupRow.test.tsx`).
- Baseline: 616/618 full suite with `.env` sourced (2 known `config.test.ts` env failures).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| Sync language cache (`getCachedLanguage`) | utility | closest analog is `getCachedTemplate()` in `main/ipc/templateChannels.ts` (not read in detail; planner should read it) |
| Loading-groups gate in `AddResumeJobDialog` | component | no existing dialog consumes groups state; wire via `useGroupsStore` per `AppShell` pattern |
| Docs-only items (D-17: `14-VALIDATION.md` status, `13-02-SUMMARY.md` polarity sentence) | docs | no code analog; edit markdown under `.planning/phases/` |

## Metadata

**Analog search scope:** `src/renderer/{removal,store,groups,wizard,target,shell,i18n}`, `src/main/{telegram,ipc,storage,index.ts}`, `src/shared`
**Pattern extraction date:** 2026-10-04
**Unread (planner should open):** `main/ipc/templateChannels.ts`, `main/ipc/addChannels.ts` (ADD_START gates), `shared/addTypes.ts` `AddState`/`AddLogBlockEntry`, `renderer/groups/GroupRow.tsx` `isActionable` definition.
