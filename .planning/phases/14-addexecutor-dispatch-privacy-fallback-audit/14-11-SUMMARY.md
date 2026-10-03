---
phase: 14-addexecutor-dispatch-privacy-fallback-audit
plan: 11
subsystem: infra
tags: [electron, ipc, contextBridge, electron-store, wiring]

# Dependency graph
requires:
  - phase: 14-addexecutor-dispatch-privacy-fallback-audit
    provides: "14-03: addAuditStore.ts; 14-04: addLogStore.ts; 14-05: contactService.ts; 14-06: templateChannels.ts (renderTemplate/DEFAULT_TEMPLATE_EN/CS); 14-08/14-09: AddExecutor.ts (full ADD-06..ADD-11 behavior); 14-10: addChannels.ts (registerAddChannels/emitAddState)"
provides:
  - "src/main/index.ts: addAuditStore, addLogStore, contactService, addExecutor/addExecutorRef, registerAddChannels/registerTemplateChannels wiring, on-launch add-job detection, governor flood-tick forwarding to AddExecutor"
  - "src/preload/index.ts: contextBridge entries for every ADD_*/TARGET_ADD_CONTACT/TEMPLATE_* channel"
  - "src/main/ipc/templateChannels.ts: preloadTemplateCache()/getCachedTemplate() synchronous template cache for the DmTextProvider closure"
  - "src/main/ipc/languageChannels.ts: getStoredLanguage() launch-time read for the DM default-template language decision"
  - "src/main/ipc/targetChannels.ts: registerTargetChannels's 7th optional addExecutor param; TARGET_RESET aborts any active add run before the target is cleared (T-14-19)"
affects: [15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Synchronous preference cache fed by an async warm-up call at startup (preloadTemplateCache/getCachedTemplate), bridging electron-store's async API to AddExecutor's synchronous DmTextProvider contract"
    - "main/index.ts wiring extension: AddExecutor constructed with { client, governor, enumerator, scanner, resolver, auditStore, addLogStore, getDmText, onStateChange } sharing the same client/governor/enumerator/resolver as RemovalExecutor/TagExecutor, mirroring the existing wiring block exactly"

key-files:
  created: []
  modified:
    - src/main/index.ts
    - src/preload/index.ts
    - src/main/ipc/targetChannels.ts
    - src/main/ipc/templateChannels.ts
    - src/main/ipc/languageChannels.ts

key-decisions:
  - "getDmText closure reads getCachedTemplate() first, falling back to DEFAULT_TEMPLATE_CS/EN by the language stored at launch (D-15) — a mid-session template edit is reflected via the cache; a mid-session language change is NOT retroactive, matching D-15's own wording"
  - "Used Parameters<typeof createContactService>[0]['client'] (not ConstructorParameters) for the client cast, since createContactService is a factory function, not a class — ConstructorParameters only applies to class/constructor types and tsc rejected it (TS2344)"
  - "TARGET_RESET's abort order is executor -> tagExecutor -> addExecutor -> searcher -> scanner -> resolver.reset(), appending addExecutor immediately after tagExecutor to preserve the existing removal-first-then-tag-then-add precedent documented in the handler's own comment block"

patterns-established: []

requirements-completed: [ADD-06, ADD-08, ADD-05, ADD-14, ADD-16]

# Metrics
duration: 25min
completed: 2026-10-03
---

# Phase 14 Plan 11: Wire AddExecutor, addChannels, templateChannels into main/index.ts and preload/index.ts Summary

**Every Phase 14 main-process module (AddExecutor, addAuditStore, addLogStore, contactService, addChannels, templateChannels) is now constructed and registered in main/index.ts sharing the same client/governor/enumerator/resolver as RemovalExecutor/TagExecutor, and every ADD_*/TARGET_ADD_CONTACT/TEMPLATE_* channel is exposed on the preload contextBridge — closing Phase 14 end-to-end even though no renderer UI calls it yet (Phase 15's job).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-03T23:45:00+02:00 (approx)
- **Completed:** 2026-10-04T00:10:00+02:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `templateChannels.ts` gained a synchronous template cache (`preloadTemplateCache()`/`getCachedTemplate()`) bridging electron-store's async API to `AddExecutor`'s synchronous `DmTextProvider` contract; `TEMPLATE_SET` keeps the cache live so a mid-session edit applies without a restart.
- `languageChannels.ts` gained `getStoredLanguage()`, mirroring `themeChannels.ts`'s `getStoredTheme()` exactly, for the launch-time EN/CS default-template decision (D-15).
- `main/index.ts` now constructs `addAuditStore`, `addLogStore`, `contactService`, and `AddExecutor` — sharing the same `client`/`governor`/`enumerator`/`scanner`/`resolver` as `RemovalExecutor`/`TagExecutor` — registers `registerAddChannels`/`registerTemplateChannels`, forwards governor flood-tick events to `addExecutorRef`, and detects an incomplete `add-job.json` on launch exactly like the existing removal-job/tag-job checks.
- `targetChannels.ts`'s `registerTargetChannels` gained a 7th optional `addExecutor` parameter; `TARGET_RESET` now calls `addExecutor?.abortExecution()` immediately after the existing `tagExecutor?.abortExecution()` line (T-14-19), so a cleared target can never be acted on by a stale add run.
- `preload/index.ts`'s `contextBridge` now exposes `startAdd`/`abortAdd`/`retryAddGroup`/`getAddState`/`onAddState`/`getAddJob`/`discardAddJob`/`addTargetToContacts`/`getDmTemplate`/`setDmTemplate`, mirroring the `tag:*` block's exact shape — no bridge method accepts or forwards identity fields.
- `npx tsc --build` exits 0; `npm run build` (electron-vite) succeeds across main/preload/renderer; full suite (`.env` loaded) is 37 files / 489 tests, all green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add synchronous template/language cache helpers** - `d8765d7` (feat)
2. **Task 2: Wire AddExecutor + addChannels + targetChannels reset in main/index.ts and preload/index.ts** - `c35a00d` (feat)

**Plan metadata:** (this commit, created after this summary)

## Files Created/Modified

- `src/main/ipc/templateChannels.ts` - Added `_cachedTemplate` module state, `preloadTemplateCache()`, `getCachedTemplate()`; `TEMPLATE_SET` handler now also updates the cache.
- `src/main/ipc/languageChannels.ts` - Added `getStoredLanguage()`, a read-only async helper mirroring `themeChannels.ts`'s `getStoredTheme()`.
- `src/main/index.ts` - New imports (`AddExecutor`, `createAddAuditStore`, `createAddLogStore`, `createContactService`, `registerAddChannels`/`emitAddState`, `registerTemplateChannels`/`renderTemplate`/`DEFAULT_TEMPLATE_EN`/`DEFAULT_TEMPLATE_CS`/`preloadTemplateCache`/`getCachedTemplate`, `getStoredLanguage`); `addExecutorRef` declaration + governor.onEvent forwarding; full Add wiring block (addAuditStore, addLogStore, contactService, template cache preload + language read, `getDmText` closure, `AddExecutor` construction, `registerAddChannels`/`registerTemplateChannels`); on-launch add-job detection block; `registerTargetChannels` call extended with `addExecutor` as the 7th argument.
- `src/main/ipc/targetChannels.ts` - `registerTargetChannels`'s signature extended with an optional 7th `addExecutor` parameter; `TARGET_RESET` handler now aborts it before `searcher.abortSearch()`.
- `src/preload/index.ts` - New `ADD_*`/`TARGET_ADD_CONTACT`/`TEMPLATE_*` channel imports and `AddState`/`AddJobFileSafe` type imports; new `contextBridge` block exposing the full Add-mode + DM-template renderer surface.

## Decisions Made

- `getDmText` reads `getCachedTemplate()` first, falling back to `DEFAULT_TEMPLATE_CS`/`DEFAULT_TEMPLATE_EN` by the language read once at startup (`dmLanguage`) — matches D-15's instruction that a stored custom template is live-cached but the BUILT-IN default choice is decided once, at the time it would have applied.
- Cast `client` for `createContactService` using `Parameters<typeof createContactService>[0]['client']` instead of the plan's literal `ConstructorParameters<typeof createContactService>[0]['client']` text — `createContactService` is a factory function, not a class, so `ConstructorParameters` doesn't apply to it (`tsc` raised TS2344, "does not satisfy the constraint 'abstract new (...args: any) => any'"). `Parameters` extracts the same argument-tuple shape for a plain function and compiled cleanly; `AddExecutor`'s own cast kept the plan's literal `ConstructorParameters` form unchanged since `AddExecutor` is a class.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `ConstructorParameters` misuse on the `createContactService` factory function cast**
- **Found during:** Task 2 (`npx tsc --build` verification step)
- **Issue:** The plan's Task 2 action text specified `client: client as unknown as ConstructorParameters<typeof createContactService>[0]['client']`, but `createContactService` is a plain factory function (`(deps: ContactServiceDeps) => ContactService`), not a class/constructor. `ConstructorParameters<T>` requires `T` to satisfy `abstract new (...args: any) => any`, so `tsc --build` failed with TS2344.
- **Fix:** Used `Parameters<typeof createContactService>[0]['client']` instead — `Parameters<T>` extracts the argument tuple from any callable type, giving the identical `ContactServiceDeps['client']` shape without the constructor-type constraint.
- **Files modified:** `src/main/index.ts`
- **Verification:** `npx tsc --build` exits 0 with no errors.
- **Committed in:** `c35a00d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug, confined to the file this plan owns)
**Impact on plan:** TypeScript-correctness fix only — the resulting cast has the identical runtime behavior and type shape the plan intended; no scope creep.

## Issues Encountered

- `npx tsc --build` emitted stray `.js`/`.d.ts` files beside every modified source (`templateChannels.ts`/`languageChannels.ts` after Task 1; `main/index.ts`/`targetChannels.ts`/`preload/index.ts` after Task 2), per the project's documented `tsc --build` behavior. Deleted before each `vitest run` pass, confirmed via `find src -name "*.js" -o -name "*.d.ts"` returning only the two pre-existing hand-written declaration files (`src/main/env.d.ts`, `src/renderer/i18n/i18next.d.ts`) afterward.
- No other issues — both tasks matched the plan's exact action spec once the `ConstructorParameters`/`Parameters` fix above was applied.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14 is complete: every main-process piece of Add mode (dispatch, unban-first, privacy fallback + links, continuation resume, end-of-run DM, add-log, contact-add, DM template) is implemented, tested, wired into the app's startup sequence, and reachable from the renderer via the preload bridge.
- Phase 15 can build the Add-mode renderer UI directly against `window.mrsproper.startAdd`/`abortAdd`/`retryAddGroup`/`getAddState`/`onAddState`/`getAddJob`/`discardAddJob`/`addTargetToContacts`/`getDmTemplate`/`setDmTemplate` with no further main-process scaffolding.
- No blockers for Phase 15. The pre-existing STATE.md open item (exact RPC error strings for `channels.InviteToChannel`/`messages.AddChatUser` needing live verification) remains outstanding but is unrelated to this plan's wiring scope.

## Self-Check: PASSED

- FOUND: src/main/index.ts
- FOUND: src/preload/index.ts
- FOUND: src/main/ipc/targetChannels.ts
- FOUND: src/main/ipc/templateChannels.ts
- FOUND: src/main/ipc/languageChannels.ts
- FOUND: d8765d7 (Task 1 commit)
- FOUND: c35a00d (Task 2 commit)

---
*Phase: 14-addexecutor-dispatch-privacy-fallback-audit*
*Completed: 2026-10-03*
