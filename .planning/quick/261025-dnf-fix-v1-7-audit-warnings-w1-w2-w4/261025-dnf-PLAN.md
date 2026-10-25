---
phase: quick-261025-dnf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main/index.ts
  - src/main/ipc/languageChannels.test.ts
  - src/main/index.order.test.ts
  - src/main/telegram/AddExecutor.ts
  - src/main/telegram/addExecutor.test.ts
  - src/main/sessionWipe.ts
  - src/main/sessionWipe.test.ts
  - src/renderer/shell/AppShell.tsx
  - src/renderer/shell/forceMode.ts
  - src/renderer/shell/forceMode.test.ts
autonomous: true
requirements: [ADD-16, ADD-02, ADD-08, ADD-12]
must_haves:
  truths:
    - "language:setDetected is registered before the BrowserWindow exists, so the renderer's early invoke never rejects"
    - "Forced Add (or Tag) mode synchronizes groupsStore active mode, so the next target's first-scan pre-check uses the Add rule"
    - "After logout/session wipe no add job file, add executor state, or resolved target survives"
  artifacts:
    - path: "src/main/sessionWipe.ts"
      provides: "wipeAddSessionState helper used by onSessionWipe"
    - path: "src/renderer/shell/forceMode.ts"
      provides: "forceMode helper that syncs groupsStore then sets AppShell mode"
  key_links:
    - from: "src/main/index.ts onSessionWipe"
      to: "src/main/sessionWipe.ts"
      via: "wipeAddSessionState call"
      pattern: "wipeAddSessionState"
    - from: "src/renderer/shell/AppShell.tsx"
      to: "groupsActions.recomputeCheckedForMode"
      via: "forceMode"
      pattern: "forceMode\\("
---

<objective>
Fix v1.7 audit warnings W1 (ADD-16), W2 (ADD-02), W4 (ADD-08/12). Three small, independent fixes.
Output: reordered language IPC registration, forced-mode groupsStore sync, add-state wipe on logout, each with a test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/v1.7-MILESTONE-AUDIT.md
@CLAUDE.md
Typecheck only with: npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json (never bare tsc --build).
Known env-dependent failing test: src/main/telegram/config.test.ts (ignore).
</context>

<tasks>

<task type="auto">
  <name>Task 1: W1 - register language channels before createWindow()</name>
  <files>src/main/index.ts, src/main/ipc/languageChannels.test.ts, src/main/index.order.test.ts</files>
  <read_first>
    - src/main/index.ts (app.whenReady block ~124-150, `registerLanguageChannels()` ~412, `preloadLanguageCache()` ~369)
    - src/main/ipc/languageChannels.ts (registerLanguageChannels needs only ipcMain + lazy electron-store; no dependency on window/sm)
    - src/main/ipc/languageChannels.test.ts (handler-capture pattern)
  </read_first>
  <action>
    In src/main/index.ts, move the `registerLanguageChannels()` call (currently ~line 412, in the "Phase 8" block next to registerThemeChannels) to inside app.whenReady, immediately after the theme-seeding try/catch and BEFORE `let currentWin = createWindow()`. Leave `registerThemeChannels()` where it is. Remove the old call so ipcMain.handle is not registered twice (it would throw). Leave `await preloadLanguageCache()` where it is (the setDetected handler only writes `_detectedLanguage`, no cache needed). Add a comment explaining: renderer main.tsx invokes language:setDetected on load, which can race ahead of late registration (audit W1, ADD-16).
    Tests: (a) in languageChannels.test.ts add a case: after registerLanguageChannels() with NO preloadLanguageCache() call, the LANGUAGE_SET_DETECTED handler resolves 'cs' for {language:'cs'} and getEffectiveLanguage() returns 'cs'. (b) New src/main/index.order.test.ts: read src/main/index.ts via fs, take the text of the `app.whenReady()` body, and assert the index of `registerLanguageChannels()` is > -1, occurs exactly once, and is less than the index of `createWindow()` first call (`let currentWin = createWindow()`).
  </action>
  <verify>
    <automated>npx vitest run src/main/ipc/languageChannels.test.ts src/main/index.order.test.ts</automated>
  </verify>
  <done>registerLanguageChannels() appears once, before createWindow() in whenReady; both tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: W2 - route forced mode through groupsStore sync</name>
  <files>src/renderer/shell/forceMode.ts, src/renderer/shell/forceMode.test.ts, src/renderer/shell/AppShell.tsx</files>
  <read_first>
    - src/renderer/shell/AppShell.tsx (mode state line 48; D-02 effect ~108-110; onResume handlers ~207 (tag) and ~218 (add); onModeChange={setMode} ~184)
    - src/renderer/groups/ModeSwitch.tsx (handleSelect: recomputeCheckedForMode then onChange)
    - src/renderer/store/groupsStore.ts (`_activeMode`, recomputeCheckedForMode ~192)
    - src/renderer/store/groupsStore.test.ts (mock pattern for react/groupsClient; test "first scan-complete rebuild while Add mode is already active" ~273)
  </read_first>
  <behavior>
    - forceMode('add', setMode) calls groupsActions.recomputeCheckedForMode('add') BEFORE setMode('add').
    - After forceMode('add') followed by a first scan-complete, checkedDialogIds follows the Add rule (not Remove).
  </behavior>
  <action>
    Create src/renderer/shell/forceMode.ts exporting `forceMode(mode: GroupMode, setMode: (m: GroupMode) => void): void` which calls `groupsActions.recomputeCheckedForMode(mode)` then `setMode(mode)` (same order as ModeSwitch.handleSelect, per D-03). In AppShell.tsx replace the three programmatic setMode calls (D-02 effect `setMode('add')`, tag AddResume... i.e. the tag resume `setMode('tag')` and the add resume `setMode('add')`) with `forceMode(...)`; keep `onModeChange={setMode}` (ModeSwitch already syncs). The D-02 effect already guards on `mode !== 'add'`, so it fires once per transition. Do not change any other AppShell behavior.
    Tests (forceMode.test.ts, copying the react/groupsClient mocks from groupsStore.test.ts): (1) spy on groupsActions.recomputeCheckedForMode and assert call order versus the setMode mock; (2) integration: call forceMode('add', vi.fn()), then feed groups + a first scan-complete via the store's existing scan/group handlers as done in groupsStore.test.ts ~273, and assert the pre-checked set equals the Add-rule set, differing from the Remove-rule set.
  </action>
  <verify>
    <automated>npx vitest run src/renderer/shell/forceMode.test.ts src/renderer/store/groupsStore.test.ts src/renderer/groups/ModeSwitch.test.tsx</automated>
  </verify>
  <done>No bare `setMode('add')`/`setMode('tag')` remain in AppShell outside forceMode usage and onModeChange; tests pass; web typecheck clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: W4 - wipe add state on logout/session wipe</name>
  <files>src/main/telegram/AddExecutor.ts, src/main/telegram/addExecutor.test.ts, src/main/sessionWipe.ts, src/main/sessionWipe.test.ts, src/main/index.ts</files>
  <read_first>
    - src/main/index.ts (onSessionWipe ~235; addExecutorRef ~189; resolver ~255; addAuditStore ~350; addExecutor ~381)
    - src/main/telegram/AddExecutor.ts (fields ~139-160; abortExecution ~638; _markRemainingSkippedAndStop ~1151; execute start ~281)
    - src/main/ipc/addChannels.ts (ADD_DISCARD_JOB handler: `auditStore.clearJob()`)
    - src/main/storage/addAuditStore.ts (clearJob ~253)
    - src/main/telegram/TargetResolver.ts (reset ~289)
    - src/main/telegram/SessionManager.ts (calls _onSessionWipe ~411)
  </read_first>
  <behavior>
    - AddExecutor.resetForSessionWipe(): from any state (including running) ends in idle with empty target/outcomes, and a still-in-flight run does not re-emit 'stopped' nor write checkpoints/setStatus to the audit store afterwards.
    - wipeAddSessionState calls executor reset, then auditStore.clearJob(), then resolver.reset(); a throw in one step does not skip the others.
  </behavior>
  <action>
    1. AddExecutor.ts: add a private `_wiped = false` flag and public `resetForSessionWipe(): void`: set `_wiped = true`, `_generation++`, abort and null `_abortController`, set `_runActive = false`, null `_resolvedTarget` and `_jobDialogIds`, and `_emit` the same idle state object abortExecution emits. At the top of `_markRemainingSkippedAndStop` return immediately when `_wiped` is true (so an aborted in-flight loop cannot write to the audit store or emit 'stopped' after the wipe). Reset `_wiped = false` at the start of execute() (alongside `++this._generation`) and at the start of retryGroup's gen capture only if retry needs it (verify; otherwise leave retry alone, its gen guard already drops it). Do not change abortExecution semantics.
    2. Create src/main/sessionWipe.ts exporting `wipeAddSessionState(deps: { addExecutor: { resetForSessionWipe(): void } | null; addAuditStore: { clearJob(): void } | null; resolver: { reset(): void } | null }): void`. Each step runs in its own try/catch (log with console.error, never throw, since it runs inside the logout path): executor reset FIRST, then `addAuditStore.clearJob()` (same logic as ADD_DISCARD_JOB), then `resolver.reset()`. Null deps are skipped.
    3. index.ts: add `let addAuditStoreRef: ReturnType<typeof createAddAuditStore> | null = null` and `let resolverRef: TargetResolver | null = null` next to the other forward refs (~189); assign `addAuditStoreRef = addAuditStore` after its creation and `resolverRef = resolver` after resolver construction. In onSessionWipe keep `secretsStore.wipeSession()` first, then call `wipeAddSessionState({ addExecutor: addExecutorRef, addAuditStore: addAuditStoreRef, resolver: resolverRef })`. Removal/Tag audit stores and executors are unchanged by this fix (scope is the add job and its access hash; note in SUMMARY that Remove/Tag job files still survive logout as a follow-up candidate).
    Tests: addExecutor.test.ts: resetForSessionWipe from idle/complete emits idle; during a running multi-group run, calling it mid-run then letting the loop finish leaves the last emitted state 'idle' and audit store setStatus('stopped')/checkpoint not called after the reset (use the harness used by the test at ~975). sessionWipe.test.ts: order of calls (executor, clearJob, resolver), null deps tolerated, a throwing executor reset still lets clearJob and reset run.
  </action>
  <verify>
    <automated>npx vitest run src/main/sessionWipe.test.ts src/main/telegram/addExecutor.test.ts src/main/telegram/authFlow.test.ts && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json</automated>
  </verify>
  <done>Logout aborts and idles AddExecutor, deletes add-job.json via clearJob, resets resolver; tests and both typechecks pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| account A session -> account B session | persisted add job (with target access hash) must not cross logout |
| renderer -> main IPC | language:setDetected is Zod-validated, unchanged |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | add-job.json after logout | mitigate | wipeAddSessionState clears job via addAuditStore.clearJob() in onSessionWipe |
| T-quick-02 | Tampering | in-flight add run after logout writing checkpoints | mitigate | _wiped flag short-circuits _markRemainingSkippedAndStop; generation bump drops other writes |
| T-quick-03 | Elevation of Privilege | account B offered account A's resume | mitigate | job deleted plus resolver reset on wipe |
| T-quick-04 | Tampering | earlier language IPC registration | accept | handler is unchanged and Zod-validated; no new surface |
</threat_model>

<verification>
npx vitest run (full suite; only src/main/telegram/config.test.ts may fail, env-dependent) and both tsc --noEmit commands above.
</verification>

<success_criteria>
W1, W2, W4 closed: language channel registered pre-window, forced modes sync groupsStore, add job/executor/resolver wiped on logout, each covered by a passing vitest test.
</success_criteria>

<output>
Create `.planning/quick/261025-dnf-fix-v1-7-audit-warnings-w1-w2-w4/261025-dnf-SUMMARY.md` when done
</output>
