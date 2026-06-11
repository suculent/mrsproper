---
phase: 03-target-resolution-verification
plan: "04"
subsystem: ui
tags: [electron, ipc, contextBridge, preload, react, useSyncExternalStore, targetResolver, gramjs]

requires:
  - phase: 03-03
    provides: TargetResolver service, registerTargetChannels, emitTargetState — the main-process resolving backend this plan wires to the renderer

provides:
  - targetClient.ts: typed contextBridge wrapper with resolveTarget, confirmTarget, resetTarget, getTargetState, onTargetState, onGovernorEvent
  - targetStore.ts: useSyncExternalStore external store exposing useTargetStore() hook and targetActions; maintains governorFloodRemaining for Find button countdown (D-17)
  - preload/index.ts extended with 6 target methods in the single contextBridge.exposeInMainWorld call
  - main/index.ts wired with TargetResolver instance + registerTargetChannels call

affects:
  - 03-05 (UI components consume useTargetStore and targetActions directly)
  - Phase 4 (group enumeration uses resolver.getResolvedUser() from main — already accessible)

tech-stack:
  added: []
  patterns:
    - "useSyncExternalStore external store pattern (same as authStore.ts) — startSubscriptions/stopSubscriptions ref-counting for renderer IPC subscriptions"
    - "Window.mrproper interface augmentation pattern: additive & intersection type — does not redeclare, extends the existing declaration from authClient.ts"
    - "onGovernorEvent preload bridge — OP_GOVERNOR_EVENT channel delivers typed GovernorEvent to renderer; targetStore subscribes to flood-tick to power Find button countdown"

key-files:
  created:
    - src/renderer/ipc/targetClient.ts
    - src/renderer/store/targetStore.ts
  modified:
    - src/preload/index.ts
    - src/main/index.ts

key-decisions:
  - "Window.mrproper augmentation uses intersection type (Window['mrproper'] & { ... }) to additively extend authClient.ts declaration without redeclaring or breaking it"
  - "onGovernorEvent exposed in preload bridge so targetStore can subscribe to flood-tick events for the Find button countdown (D-17); safe per T-03-10 — GovernorEvent carries only typed codes and numbers, no raw Telegram payload"
  - "TargetResolver shares the TelegramClient instance from SessionManager — no reconnect, no re-auth; emitTargetState and onGovernorEvent close over currentWin lambda so macOS re-activation works without re-registration"

patterns-established:
  - "targetClient mirrors authClient: global interface augmentation + named-export client object; renderer never touches ipcRenderer directly"
  - "targetStore mirrors authStore: ref-counted subscriptions, useSyncExternalStore, intent dispatchers in targetActions"

requirements-completed:
  - TGT-01
  - TGT-02
  - TGT-03
  - TGT-04
  - VRF-03

duration: 8min
completed: 2026-06-11
---

# Phase 03 Plan 04: IPC Bridge + Renderer Store for Target Resolution Summary

**Full IPC stack wired: contextBridge exposes 6 target methods, targetClient.ts and targetStore.ts (useTargetStore + targetActions) give Plan 05 UI components direct subscription-based access to TargetState and governor flood countdown**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-11T18:49:00Z
- **Completed:** 2026-06-11T18:57:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `targetClient.ts` — typed thin wrapper over `window.mrproper` with 6 methods; augments `Window.mrproper` interface without breaking `authClient.ts` declarations
- Created `targetStore.ts` — ref-counted `useSyncExternalStore` store; subscribes to `onTargetState` and `onGovernorEvent` (flood-tick); exports `useTargetStore()` hook and `targetActions` (resolveTarget, confirmTarget, resetTarget)
- Extended `preload/index.ts` — added 6 entries to the existing `contextBridge.exposeInMainWorld` call with proper Zod-validated channel routing and `onGovernorEvent` subscription (T-03-09, T-03-10, D-17)
- Extended `main/index.ts` — `TargetResolver` instantiated with shared `TelegramClient`, `emitTargetState` lambda, and `OP_GOVERNOR_EVENT` forward; `registerTargetChannels` called

## Task Commits

1. **Task 1: Create targetClient.ts + targetStore.ts** — `7f4c13f` (feat)
2. **Task 2: Extend preload/index.ts + wire TargetResolver in main/index.ts** — `adda45f` (feat)

**Plan metadata:** (committed below)

## Files Created/Modified
- `src/renderer/ipc/targetClient.ts` — typed wrapper over window.mrproper target methods; additive Window.mrproper augmentation; exports `targetClient`
- `src/renderer/store/targetStore.ts` — useSyncExternalStore store with ref-counted subscriptions; exports `useTargetStore()` and `targetActions`; D-17 governor flood countdown
- `src/preload/index.ts` — extended with resolveTarget, confirmTarget, resetTarget, getTargetState, onTargetState, onGovernorEvent entries in existing `exposeInMainWorld` call
- `src/main/index.ts` — imports TargetResolver + registerTargetChannels + emitTargetState; instantiates resolver with shared client; calls registerTargetChannels

## Decisions Made
- `Window.mrproper` augmentation uses `Window['mrproper'] & { ... }` intersection type so the additive declaration compiles cleanly alongside `authClient.ts`'s existing declaration — no redeclaration, no conflict.
- `onGovernorEvent` added to preload bridge so `targetStore` can subscribe to `flood-tick` events directly via `OP_GOVERNOR_EVENT`; per T-03-10 this is safe (typed codes + numbers only, no raw Telegram payload).
- `TargetResolver.onGovernorEvent` in `main/index.ts` closes over `currentWin` via lambda — consistent with `SessionManager.onGovernorEvent` wiring; macOS window re-activation does not need resolver re-registration.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled cleanly (`tsc --noEmit` exits 0) after both tasks. Test suite unchanged: 103 passed, 2 pre-existing failures in `config.test.ts` (env vars `MRPROPER_API_ID`/`MRPROPER_API_HASH` unset — documented in prior wave context, not this plan's concern).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- `useTargetStore()` and `targetActions` are ready for Plan 05 UI components to consume
- `window.mrproper.resolveTarget(input)` routes through Zod-validated `targetChannels.ts` to `TargetResolver.resolve()` — full IPC path is live
- Phase 4 group enumeration can call `resolver.getResolvedUser()` from main process — `TargetResolver` is already instantiated

---
*Phase: 03-target-resolution-verification*
*Completed: 2026-06-11*
