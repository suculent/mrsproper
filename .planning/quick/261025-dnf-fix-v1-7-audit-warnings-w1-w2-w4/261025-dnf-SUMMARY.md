---
status: complete
---

# Quick 261025-dnf: Fix v1.7 audit warnings W1, W2, W4

Language IPC registered before the window, forced modes sync groupsStore, and logout wipes the add job, executor and resolver.

## Commits
- 16b1477 fix: register language channels before createWindow (W1)
- 34730e6 fix: route forced modes through groupsStore sync (W2)
- (third) fix: wipe add job, executor and resolver state on logout (W4)

## Changes
- W1: `registerLanguageChannels()` moved into `app.whenReady` before `createWindow()`. Tests added in `languageChannels.test.ts` and `index.order.test.ts`.
- W2: new `src/renderer/shell/forceMode.ts` calls `recomputeCheckedForMode` and then `setMode`. All three programmatic `setMode` calls in `AppShell.tsx` now use it. `forceMode.test.ts` covers call order and the Add-rule pre-check.
- W4: `AddExecutor.resetForSessionWipe()` plus a `_wiped` guard in `_markRemainingSkippedAndStop`. New `src/main/sessionWipe.ts` (`wipeAddSessionState`) runs the executor reset, then `clearJob()`, then `resolver.reset()`. Each step is isolated and logs no PII. It is wired into `onSessionWipe` in `index.ts` through `addAuditStoreRef` and `resolverRef`.

## Deviations
None. One small test adjustment: the W1 test asserts only that the handler resolves and the store is untouched, because earlier tests in that file leave a stored language in the cache.

## Verification
- Both tsc commands are clean.
- Full vitest: 764 passed, 2 failed. Both failures are in `src/main/telegram/config.test.ts` (the known env-dependent failure).
- No stray emitted `.js`/`.d.ts` under `src/`. `env.d.ts` and `i18next.d.ts` are tracked source files.

## Follow-up candidate
Remove and Tag job files, executors and audit stores still survive logout. This fix covers only the add job and its target access hash.
