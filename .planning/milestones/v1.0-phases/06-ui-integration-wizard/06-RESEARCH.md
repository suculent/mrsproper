# Phase 6: UI Integration — Wizard, Safety Gates & Progress — Research

**Researched:** 2026-06-12
**Domain:** Electron renderer — React wizard flow, state-machine stage navigation, severity selector, FLOOD_WAIT plumbing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wizard Structure & Navigation**
- Formalize the existing two-pane flow into named stages (Target → Groups → Review → Run → Report) with a slim step indicator — NOT a modal-stepper rewrite; Phase 6 adds gates over the working UI.
- The kick/ban severity selector (deferred from Phase 5) lives on the Review screen as a segmented control — "the chosen action" per ROADMAP. Default **Kick** (per ROADMAP success criterion 1); last choice remembered via electron-store (non-secret pref).
- Back navigation: every stage can go back (Change target / Edit selection) until execution starts; locked during the run.
- The Review screen REPLACES Phase 5's minimal RemovalConfirmDialog — one explicit confirmation lives on the Review screen (no double-confirm). Remove/retire the dialog path for the start-run flow (ResumeJobDialog stays).

**Dry-Run / Preview Semantics**
- Dry-run is a pure local simulation — ZERO Telegram calls: per-group planned mechanic (ban via editBanned / kick via restrict-then-unban / deleteChatUser with ban-fallback note for basic groups), rights from enumeration, predicted outcome.
- The Review screen IS the dry-run report — one surface listing exactly what will happen per group, with warnings.
- The preview is mandatory: the Review screen always renders before the confirm button is reachable (SAF gating).
- Per-group warnings: "rejoin can't be blocked" (basic-group ban fallback), greyed no-rights groups excluded from the run, plus total counts up front.

**Review Screen Content & Confirmation**
- Identity block: avatar + full name + @username + numeric ID (ROADMAP-required) in monospace.
- Confirmation: single explicit destructive button ("Ban/Kick {name} from {N} groups"). No type-to-confirm.
- Affected groups: scrollable list with title + member count + per-group mechanic note.
- After-run: Report stage with "Remove someone else" (TARGET_RESET → Target stage); job archived in the audit file.

**Run/Report Integration & Polish**
- Run progress reuses the Phase 5 progress slot/summary band; the wizard's Run stage frames it.
- FLOOD_WAIT subline (Phase 5 UI-audit gap) is IN SCOPE: plumb governor wait state into removalStore and render the subline + FloodCountdown ("Telegram asked us to slow down — resuming automatically." / removalCopy.floodWaitSubline exists, currently dead code).
- "Remove someone else" → TARGET_RESET → Target stage with removal state cleanly idle (abortExecution idle-reset fix from af0b779 already supports this).
- Resume flow: ResumeJobDialog stays; resuming jumps directly to the Run stage.

### Claude's Discretion
- Step indicator visual form, stage state machine shape, file layout — follow established patterns.
- How severity preference persistence is wired (electron-store usage pattern — first use in repo; add dependency only if not present).

### Deferred Ideas (OUT OF SCOPE)
- Type-the-name-to-confirm hard gate — possible v2 hardening.
- Job history browser (multiple archived reports) — v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAF-01 | Before execution, app shows a final review screen with target identity (including numeric ID) and the exact list of affected groups | Review screen is new renderer component; identity block reuses TargetCard's avatar/name/ID mono pattern; group list is a slim render of checkedDialogIds mapped from groupsStore/scanStore |
| SAF-02 | Execution requires one explicit confirmation on the review screen | RemovalConfirmDialog is retired from the run flow; the Review screen's destructive button calls removalActions.startRemoval() directly; no double-gate |
| SAF-03 | User can run a dry-run/preview that reports what would happen without performing any removal | Review screen = dry-run: pure local computation from existing enumerator/scan state, zero Telegram calls; per-group mechanic derived from dialog.type + dialog.canAct + severity selector |
</phase_requirements>

---

## Summary

Phase 6 is primarily an **integration and gating phase** — almost all the machinery exists (RemovalExecutor, removalStore, removalCopy, GroupRow status rendering, summary band, ResumeJobDialog). The new construction is:

1. A **stage state machine** (Target → Groups → Review → Run → Report) implemented as a local React state variable driving conditional rendering within AppShell — no routing library needed.
2. A **Review screen** component that replaces RemovalConfirmDialog as the primary safety gate — rendering the dry-run preview (local computation) plus the identity block and confirmation button.
3. A **severity selector** (kick/ban segmented control) on the Review screen, with electron-store persistence for the last choice.
4. **FLOOD_WAIT subline wiring**: adding `floodWaitRemaining: number | null` to `RemovalState` (shared type) + the emission path in `RemovalExecutor` + rendering the dead-code `removalCopy.floodWaitSubline` with `FloodCountdown`.

The most complex work is the stage machine state and the RemovalConfirmDialog retirement — the Review screen must absorb the confirm action that currently lives in a Dialog, and the run-trigger in GroupsPane must transition to the Review stage rather than opening a Dialog.

**Primary recommendation:** Implement the stage machine as a local `wizardStage` state in AppShell (or a new `WizardShell` wrapper), derive stage from existing store states (targetStore + groupsStore + removalStore) wherever possible, and minimize new IPC surface — electron-store for severity persistence is the only new main-process concern.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Wizard stage navigation (Target → Groups → Review → Run → Report) | Frontend (renderer) | — | Pure UI state; derives from existing store states; no Telegram calls |
| Dry-run preview (per-group mechanic prediction) | Frontend (renderer) | — | Zero Telegram calls; computed locally from enumerator/scan data already in stores |
| Review screen identity block | Frontend (renderer) | — | Data already available in targetStore.target (confirmed step) |
| Severity selector (kick/ban) | Frontend (renderer) | — | UI preference; value passed to removalActions.startRemoval() |
| Severity preference persistence | Main process (electron-store) | — | electron-store writes to userData; must run in main process or renderer via a new IPC channel |
| FLOOD_WAIT plumbing to removalStore | Main process (RemovalExecutor) | Renderer (removalStore) | Governor events fire in main; RemovalExecutor must capture and emit via onStateChange |
| Step indicator UI | Frontend (renderer) | — | Visual-only; derives from wizardStage local state |
| "Remove someone else" reset flow | Frontend (renderer) + Main | — | TARGET_RESET IPC already exists; renderer transitions stage to Target after reset |

---

## Standard Stack

### Core (already installed — no new installs for most work)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | `^19.0.0` | Renderer UI — wizard stage state, Review screen, step indicator | Already in project |
| Tailwind CSS 3 | `^3.4.19` | Styling — inherits full existing design system | Already in project |
| shadcn components | in-repo | Button, Avatar, ScrollArea, Dialog (ResumeJobDialog stays), Badge, Alert | All already in `src/renderer/components/ui/` — no new `npx shadcn add` |
| lucide-react | `^1.17.0` | Icons for step indicator and Review screen | Already in project |

### New Dependency

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **electron-store** | `^11.0.2` | Persist kick/ban severity preference across launches | CONTEXT.md locked decision; first use in repo; Sindre Sorhus, created 2017, 8+ years old, sindresorhus/electron-store on GitHub |

**Package legitimacy:** `electron-store@11.0.2` — slopcheck [OK], npm version confirmed 11.0.2, created 2017-03-22 (8+ years), author Sindre Sorhus (established ecosystem author). Do NOT use electron-store's built-in "encryption" for secrets (CLAUDE.md constraint) — severity preference is non-secret, so plain store is fine. [VERIFIED: npm registry + slopcheck OK]

**Installation (new only):**
```bash
npm install electron-store
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-store for severity pref | Flat JSON file in userData | electron-store handles atomic writes and schema migration; Sindre Sorhus maintenance; CONTEXT.md references it explicitly |
| Local renderer state for severity | electron-store | Local state doesn't survive app restart; CONTEXT.md says "last choice remembered" |

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| electron-store | npm | 8+ yrs (2017) | High | github.com/sindresorhus/electron-store | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
AppShell / WizardShell
  │
  ├── [wizardStage: 'target']      ← TargetInput + TargetCard (existing)
  │     └── on confirm → 'groups'
  │
  ├── [wizardStage: 'groups']      ← GroupsPane in checklist mode (existing)
  │     ├── scan auto-starts (existing)
  │     └── run-trigger → 'review' (CHANGE: was dialog open)
  │
  ├── [wizardStage: 'review']      ← ReviewScreen (NEW)
  │     ├── dry-run: local computation from groupsStore + scanStore
  │     │     (AdminDialogDTO.type + canAct + severity → predicted mechanic)
  │     ├── severity selector → writes to electron-store via IPC
  │     └── confirm button → removalActions.startRemoval() → stage 'run'
  │
  ├── [wizardStage: 'run']         ← GroupsPane (existing progress slot + summary band)
  │     ├── FLOOD_WAIT subline (NEW: governor event → RemovalState → removalStore → render)
  │     └── on removal.step===complete/stopped → stage 'report'
  │
  └── [wizardStage: 'report']      ← Summary band + "Remove someone else" button (NEW)
        └── "Remove someone else" → TARGET_RESET IPC → stage 'target'
```

**Key data flows:**
- `severity` pref read from electron-store on app launch (IPC get); written on selector change (IPC set)
- FLOOD_WAIT: `RemovalExecutor._governor.onEvent` → `onStateChange({ ...state, floodWaitRemaining: N })` → `emitRemovalState()` → `removalStore.setState()` → `GroupsPane.renderProgressSlot()` renders `FloodCountdown`
- Dry-run computation: `useGroupsStore().groups` (AdminDialogDTO list with .type/.canAct) + `useGroupsStore().checkedDialogIds` + `severity` → rendered in ReviewScreen with zero IPC calls

### Recommended Project Structure

```
src/renderer/
├── wizard/
│   ├── ReviewScreen.tsx       # New — SAF-01/02/03: dry-run preview + identity + confirm
│   ├── StepIndicator.tsx      # New — slim named-stage indicator (Claude's discretion)
│   └── wizardCopy.ts          # New — copy strings for Review screen + step indicator
├── removal/
│   ├── removalCopy.ts         # Existing — floodWaitSubline is already defined (dead code → live)
│   └── ...
src/shared/
├── removalTypes.ts            # Modify — add floodWaitRemaining?: number | null to RemovalState
├── channels.ts                # Modify — add SEVERITY_GET / SEVERITY_SET channels
src/main/
├── telegram/RemovalExecutor.ts # Modify — capture flood-tick events, emit via onStateChange
├── ipc/severityChannels.ts    # New — IPC handlers for severity pref via electron-store
└── index.ts                   # Modify — register severityChannels
```

### Pattern 1: Wizard Stage State Machine (local React state)

**What:** `wizardStage` is a local `useState` in `AppShell` (or a thin `WizardShell` wrapper). Stage transitions are explicit function calls, not derived solely from store state — this prevents the stage from snapping back if a store resets.

**When to use:** Single-direction wizard flows where back-navigation is explicit (button click), not implicit (store state rollback).

**Example:**
```typescript
// Source: established AppShell pattern + CONTEXT.md locked decisions
type WizardStage = 'target' | 'groups' | 'review' | 'run' | 'report'

const [stage, setStage] = useState<WizardStage>('target')

// Transition rules:
// target → groups: when targetStore.target.step === 'confirmed'
// groups → review: when user clicks run-trigger in GroupsPane
// review → run:    when user clicks confirm in ReviewScreen
// run → report:    when removalStore.state.step === 'complete' | 'stopped' | 'hard-stopped'
// report → target: when user clicks "Remove someone else" → TARGET_RESET
```

**Stage derivation vs explicit state:** Prefer explicit `setStage()` calls at action points over fully-derived stage (which would require mapping from all possible store state combinations). The scan and removal state machines already enforce correctness — the wizard stage is an independent presentation layer.

### Pattern 2: Dry-Run Preview (pure local computation)

**What:** ReviewScreen computes per-group planned actions from existing store data — no IPC calls.

**When to use:** SAF-03 dry-run requirement; whenever the Review screen renders.

**Example:**
```typescript
// Source: CONTEXT.md locked decisions + existing AdminDialogDTO shape
function computePlannedActions(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  severity: 'kick' | 'ban'
): PlannedGroupAction[] {
  return [...checkedIds]
    .map(id => dialogs.find(d => d.id === id))
    .filter(Boolean)
    .filter(d => d!.canAct)  // greyed/no-rights groups excluded from run
    .map(d => ({
      dialog: d!,
      mechanic: deriveMechanic(d!.type, severity),
      warning: d!.type === 'basicGroup' && severity === 'ban'
        ? 'rejoin-cant-be-blocked'
        : null,
    }))
}

// mechanic derivation (matches RemovalExecutor behavior):
// basicGroup + ban → 'deleteChatUser' (ban fallback — rejoin can't be blocked)
// basicGroup + kick → 'deleteChatUser'
// supergroup/channel + ban → 'editBanned'
// supergroup/channel + kick → 'restrict-then-unban'
```

### Pattern 3: FLOOD_WAIT Plumbing (main → removalStore)

**What:** Governor flood-tick events during a removal run must reach the renderer's progress slot.

**Current gap (from Phase 5 UI-REVIEW):** `floodWaitSubline` copy exists in removalCopy.ts (line 86) but is dead code. `RemovalExecutor` does not propagate governor flood events into `RemovalState`. `removalStore` has no `floodWaitRemaining` field.

**Fix approach — three-part change:**

1. **`src/shared/removalTypes.ts`:** Add `floodWaitRemaining?: number | null` to `RemovalState` (only meaningful during `step === 'running'`).

2. **`src/main/telegram/RemovalExecutor.ts`:** During the per-group `governor.run()` call, capture `flood-tick` events and re-emit state with `floodWaitRemaining`. Reset to `null` when the tick ends.

3. **`src/renderer/groups/GroupsPane.tsx`:** In `renderProgressSlot()`, when `removal.step === 'running'` and `removal.floodWaitRemaining > 0`, render `removalCopy.floodWaitSubline` + `<FloodCountdown remaining={removal.floodWaitRemaining} />`.

**Example (RemovalExecutor change):**
```typescript
// Source: targetStore.ts flood-tick pattern (governorFloodRemaining)
// Inside RemovalExecutor.execute() per-group call:
const result = await this._governor.run(async () => {
  // ...removal call...
}, {
  onEvent: (event) => {
    if (event.type === 'flood-tick') {
      this._emit({ ...this._state, floodWaitRemaining: event.remaining })
    } else if (event.type === 'flood-tick' && event.remaining === 0) {
      this._emit({ ...this._state, floodWaitRemaining: null })
    }
  }
})
// After call completes: reset floodWaitRemaining
this._emit({ ...this._state, floodWaitRemaining: null })
```

**Note:** Check RemovalExecutor's governor.run() call signature — `onEvent` may need to be passed per-call rather than per-instance. The existing `targetStore.ts` uses `onGovernorEvent` via the shared `OP_GOVERNOR_EVENT` channel. For removal, the executor should own the flood-tick capture since the shared governor event channel is used by target/search flows — separate the removal flood state from the target resolution flood state.

### Pattern 4: Severity Persistence (electron-store via IPC)

**What:** electron-store in the main process stores `{ severity: 'kick' | 'ban' }`. IPC channels expose get/set to the renderer.

**When to use:** Non-secret user preferences that must survive app restart.

**Example:**
```typescript
// Source: CONTEXT.md + established IPC pattern (searchChannels.ts analog)
// src/main/ipc/severityChannels.ts
import Store from 'electron-store'
const store = new Store<{ severity: 'kick' | 'ban' }>({ defaults: { severity: 'kick' } })
// default 'kick' matches CONTEXT.md locked decision

ipcMain.handle(SEVERITY_GET, () => store.get('severity'))
ipcMain.handle(SEVERITY_SET, (_e, payload: unknown) => {
  const parsed = SeveritySchema.parse(payload)  // z.enum(['kick','ban'])
  store.set('severity', parsed.severity)
  return parsed.severity
})
```

**IMPORTANT:** electron-store in main process requires `import Store from 'electron-store'` — ESM default import. Version 10+ is ESM-only; package.json has `"type": "module"` in electron-store itself, but this project's main process is CommonJS (electron-vite default). **Verify compatibility**: electron-store 10+ is ESM-only and may require dynamic `import()` in the main process. See Anti-Patterns below.

### Pattern 5: RemovalConfirmDialog Retirement

**What:** The current run-trigger in GroupsPane sets `confirmOpen = true`, which opens RemovalConfirmDialog. Phase 6 changes this so the run-trigger calls `setStage('review')` instead. RemovalConfirmDialog.tsx is retired from the start-run flow.

**What stays:** ResumeJobDialog stays as-is. The Review screen's confirm button calls `removalActions.startRemoval()` directly.

**Migration steps:**
1. Remove `confirmOpen` state and `<RemovalConfirmDialog>` from GroupsPane
2. Change run-trigger `onClick` to `() => props.onNavigateToReview()` (prop callback) or via a shared stage setter
3. Add Review stage rendering in WizardShell/AppShell
4. ReviewScreen's confirm button calls `removalActions.startRemoval(severity, [...checkedDialogIds])`

### Anti-Patterns to Avoid

- **Deriving wizard stage entirely from store state:** Store states can produce ambiguous combinations (e.g. removal.step === 'idle' AND scan.step === 'complete' could mean stage 'groups' or 'report' depending on history). Keep `wizardStage` as explicit state.
- **Opening RemovalConfirmDialog AND showing the Review screen:** After retirement, there must be exactly ONE confirmation gate. The Review screen IS the confirmation. Do not add a second dialog.
- **Computing dry-run from scan.results alone:** Use `dialogs.find(d => d.id === id)?.type` for mechanic prediction — `scan.results` only has membership status, not group type. Group type is on `AdminDialogDTO` from `groupsStore`.
- **electron-store as a renderer direct import:** electron-store must run in main process. Renderer accesses it via IPC only (security boundary).
- **electron-store ESM/CJS mismatch:** electron-store 10+ is ESM-only. In an electron-vite project where main is compiled as CJS, a static `require('electron-store')` will fail. Use dynamic `await import('electron-store')` in the main process handler, or verify that electron-vite's main build handles ESM deps correctly. See Environment Availability section.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Severity preference persistence | Custom JSON file writer | electron-store | Atomic writes, schema validation, defaults, migration — already CONTEXT-approved |
| FLOOD_WAIT countdown display | New timer component | Existing `FloodCountdown` in `src/renderer/auth/FloodCountdown.tsx` | Already ships the exact behavior: accepts `remaining: number`, renders `mm:ss` monospace, `aria-live="polite"` |
| Avatar rendering in Review screen | New avatar implementation | Duplicate the `bytesToDataUrl` + `getAvatarColor` + `getInitials` pattern from TargetCard/RemovalConfirmDialog | Established codebase pattern (PATTERNS.md: "duplicated per PATTERNS.md to avoid premature abstraction"); OR extract to a shared `avatarUtils.ts` if 4+ files share it |
| Dry-run mechanic prediction | Telegram API call | Local computation from `AdminDialogDTO.type + severity` | CONTEXT.md locked decision: zero Telegram calls in dry-run |

**Key insight:** Phase 6 is largely about wiring existing components into a coherent flow. The biggest risk is over-building — adding new state or new Telegram calls when everything needed is already present.

---

## Runtime State Inventory

> This is an integration phase, not a rename/refactor/migration phase. SKIPPED — no runtime state migration needed.

---

## Common Pitfalls

### Pitfall 1: electron-store ESM-only in CJS main process

**What goes wrong:** `import Store from 'electron-store'` or `const Store = require('electron-store')` throws at runtime in the main process because electron-store 10+ ships as ESM-only.

**Why it happens:** electron-store 11.x has `"type": "module"` in its package.json. electron-vite compiles the main process to CommonJS by default. Static `require()` of an ESM-only package throws `ERR_REQUIRE_ESM`.

**How to avoid:** Use dynamic `await import('electron-store')` inside an async handler, or configure electron-vite to compile main as ESM. Check electron-vite's `build.commonjsOptions.transformMixedEsModules` setting. Alternatively, wrap in a factory function that uses `import()`:

```typescript
// Safe pattern for ESM-only package in CJS main:
let _store: import('electron-store').default<{severity: 'kick' | 'ban'}> | null = null
async function getStore() {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store({ defaults: { severity: 'kick' } })
  }
  return _store
}
```

**Warning signs:** `Error [ERR_REQUIRE_ESM]: require() of ES Module` in main process logs.

### Pitfall 2: Wizard stage snapping back on store state changes

**What goes wrong:** If wizardStage is derived (computed) from store state rather than being explicit state, a background store update (e.g., removalStore resetting to idle after TARGET_RESET) can snap the stage back unexpectedly.

**Why it happens:** Derived state responds to all store changes, not just intentional user navigation.

**How to avoid:** Keep `wizardStage` as an explicit `useState` variable. Drive transitions via explicit setter calls at known action points (confirm click, run-trigger click, "Remove someone else" click, TARGET_RESET completion).

**Warning signs:** Wizard stage jumps without user action; stage reverts to 'target' after a scan update.

### Pitfall 3: Double-confirm gate (Review + RemovalConfirmDialog both active)

**What goes wrong:** If GroupsPane still renders RemovalConfirmDialog alongside the new Review screen, the user hits two confirmation gates for the same action.

**Why it happens:** Incomplete retirement of RemovalConfirmDialog from the run-trigger path.

**How to avoid:** In the same PR/wave that adds ReviewScreen, remove `confirmOpen` state and `<RemovalConfirmDialog>` from GroupsPane. The retirement and the Review screen addition must be atomic.

**Warning signs:** Two different dialogs/screens asking for confirmation before the run starts.

### Pitfall 4: Dry-run using scan.results instead of dialogs for group type

**What goes wrong:** Per-group mechanic predictions are wrong (e.g., all groups show "editBanned" instead of correct type-specific mechanic).

**Why it happens:** `scan.results` contains `{ dialogId, status }` — no group type. The group type is on `AdminDialogDTO.type` in `groupsStore.groups`.

**How to avoid:** Join `checkedDialogIds` → `groupsStore.groups.dialogs.find(d => d.id === id)` to get `AdminDialogDTO` with `.type`. Do not use scan results for mechanic derivation.

**Warning signs:** Review screen shows wrong mechanic for basic groups (no ban-fallback warning).

### Pitfall 5: Stable snapshot reference in stores when adding new fields

**What goes wrong:** Adding `floodWaitRemaining` to `RemovalState` causes `useSyncExternalStore` to re-render on every flood-tick even when the component tree is stable, or (worse) the cached snapshot is not invalidated on the new field.

**Why it happens:** `removalStore.ts` already has a manually-managed `cachedSnapshot` (fix from Phase 5 — commit 8929d79). Any new fields in `RemovalState` are automatically handled by the existing `cachedSnapshot.state !== currentState` identity check — no change needed in the snapshot logic.

**How to avoid:** No extra action needed; the existing cache invalidation (line ~93 of removalStore.ts: `if (cachedSnapshot.state !== currentState || cachedSnapshot.pendingJob !== pendingJob)`) catches any state object change including new fields.

**Warning signs:** "Maximum update depth exceeded" React error — indicates the snapshot is returning a new object reference on every call.

### Pitfall 6: Governor flood-tick events during removal overlapping with target-resolution flood events

**What goes wrong:** `removalStore` starts showing a FLOOD_WAIT subline when the governor is actually waiting on a target-resolution call (not a removal call).

**Why it happens:** The shared `OP_GOVERNOR_EVENT` channel pushes all governor events to the renderer. If `removalStore` subscribes to `OP_GOVERNOR_EVENT`, it will see flood events from any governor.run() call, not just removal calls.

**How to avoid:** Do NOT subscribe removalStore to `OP_GOVERNOR_EVENT`. Instead, route flood events through `RemovalState` itself: inside RemovalExecutor's per-group execution, capture the flood-tick events from the per-call `onEvent` callback and emit them as `floodWaitRemaining` on the `RemovalState`. This scopes the UI feedback to removal-only flood events.

---

## Code Examples

### Review Screen identity block (established pattern)

```typescript
// Source: src/renderer/removal/RemovalConfirmDialog.tsx + TargetCard.tsx
// Identity block re-uses the same avatar/identity rendering as RemovalConfirmDialog
// (bytesToDataUrl, getAvatarColor, getInitials — duplicate per PATTERNS.md)
const avatarSrc = bytesToDataUrl(targetAvatar)
const avatarBg = getAvatarColor(targetId)   // AVATAR_COLORS[Number(BigInt(id) % 7n)]
const initials = getInitials(targetName)

// Numeric ID is ALWAYS shown in monospace (TGT-03, SAF-01)
<span className="font-mono text-label text-muted-foreground">
  {username ? <>@{username} · </> : null}ID {targetId}
</span>
```

### Severity selector (segmented control via existing Button components)

```typescript
// Source: established Button + cn pattern; no new shadcn component needed
// Two adjacent Buttons styled as a toggle group (no @radix-ui/react-toggle-group needed)
<div className="flex rounded-md border border-border overflow-hidden">
  <Button
    variant={severity === 'kick' ? 'default' : 'ghost'}
    size="sm"
    className="rounded-none flex-1"
    onClick={() => setSeverity('kick')}
  >
    Kick
  </Button>
  <Button
    variant={severity === 'ban' ? 'default' : 'ghost'}
    size="sm"
    className="rounded-none flex-1 border-l border-border"
    onClick={() => setSeverity('ban')}
  >
    Ban
  </Button>
</div>
```

### FLOOD_WAIT subline rendering (established FloodCountdown pattern)

```typescript
// Source: src/renderer/target/TargetInput.tsx line 399 + removalCopy.floodWaitSubline
// Only rendered when removal.step === 'running' AND removal.floodWaitRemaining > 0
{removal.floodWaitRemaining != null && removal.floodWaitRemaining > 0 && (
  <span className="text-label text-muted-foreground flex items-baseline gap-1">
    {removalCopy.floodWaitSubline}
    <FloodCountdown remaining={removal.floodWaitRemaining} />
  </span>
)}
```

### electron-store severity persistence (IPC handler)

```typescript
// Source: established removalChannels.ts + searchChannels.ts IPC pattern
// src/main/ipc/severityChannels.ts
import { ipcMain } from 'electron'
import { z } from 'zod'  // zod already in project
import { SEVERITY_GET, SEVERITY_SET } from '@shared/channels'

const SeveritySchema = z.object({ severity: z.enum(['kick', 'ban']) })

export function registerSeverityChannels(store: ElectronStore): void {
  ipcMain.handle(SEVERITY_GET, () => store.get('severity', 'kick'))
  ipcMain.handle(SEVERITY_SET, (_e, payload: unknown) => {
    const { severity } = SeveritySchema.parse(payload)
    store.set('severity', severity)
    return severity
  })
}
```

### "Remove someone else" flow (TARGET_RESET pattern)

```typescript
// Source: src/renderer/target/TargetCard.tsx lines 225-241 (existing TARGET_RESET)
// After a run completes, the Report stage shows:
<Button
  variant="ghost"
  size="sm"
  onClick={async () => {
    await targetActions.resetTarget()  // fires TARGET_RESET IPC → clears all downstream state
    setStage('target')                 // advance wizard to Target stage
  }}
>
  Remove someone else
</Button>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RemovalConfirmDialog as safety gate | Review screen as safety gate (SAF-01/02/03) | Phase 6 | More information visible before confirmation; SAF-03 dry-run satisfied without an API call |
| Severity hardcoded to 'ban' | Kick/ban selector with persisted preference, default 'kick' | Phase 6 | RMV-01 requirement fully met; first use of electron-store in the repo |
| FLOOD_WAIT subline dead code | FLOOD_WAIT subline live, plumbed from RemovalExecutor | Phase 6 | Pillar 2 blocker from Phase 5 UI-REVIEW resolved |

**Deprecated/outdated:**
- `RemovalConfirmDialog` run-trigger path: retired from the start-run flow in Phase 6; the component file itself may remain as a reference or be deleted — planner's discretion.

---

## Open Questions

1. **electron-store ESM/CJS compatibility with electron-vite@5**
   - What we know: electron-store 11.x is ESM-only; electron-vite 5.x builds main process as CJS by default.
   - What's unclear: Does electron-vite 5's Vite bundler automatically handle ESM-only deps in the main process bundle (Vite's CommonJS interop), or does the dynamic `import()` pattern need to be used explicitly?
   - Recommendation: The planner should include a Wave 0 task to verify electron-store import works in a minimal main-process test. Use dynamic `await import('electron-store')` as the default safe pattern. If it works with static import in the electron-vite build, the factory pattern can be simplified.

2. **RemovalConfirmDialog.tsx disposal**
   - What we know: The dialog is retired from the start-run flow. ResumeJobDialog stays.
   - What's unclear: Should RemovalConfirmDialog.tsx be deleted or kept as dead code?
   - Recommendation: Delete it to avoid confusion (the file is small; no other consumer). The planner should add a task to remove it and clean up imports in GroupsPane.

3. **ReviewScreen placement in the layout**
   - What we know: AppShell renders two panes (left: target, right: groups). ReviewScreen needs to show both target identity and the affected group list.
   - What's unclear: Does ReviewScreen overlay both panes (full-width), or replace just the right pane?
   - Recommendation: Full-width overlay within the main content area (below the header) — this gives the Review screen enough horizontal space for the scrollable group list while keeping the header (identity + settings) visible. The step indicator sits in the header or immediately below it.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | electron-store, main process | ✓ | Bundled with Electron 42 | — |
| electron-store | Severity pref persistence | Not yet installed | 11.0.2 (latest) | — |
| Electron safeStorage | Session encryption (existing) | ✓ | Bundled | — |

**Missing dependencies with no fallback:**
- `electron-store` must be installed before Wave 0 work begins.

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.x |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run --reporter=verbose 2>&1 | tail -20` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAF-01 | Review screen renders target identity (id, name, avatar) and affected group list | Unit (computePlannedActions) | `npx vitest run src/renderer/wizard/reviewScreen.test.ts -x` | ❌ Wave 0 |
| SAF-02 | Execution does not start until explicit confirm (no double-gate) | Unit (stage machine transitions) | `npx vitest run src/renderer/wizard/wizardStage.test.ts -x` | ❌ Wave 0 |
| SAF-03 | Dry-run computation produces correct per-group mechanic predictions | Unit (computePlannedActions) | `npx vitest run src/renderer/wizard/reviewScreen.test.ts -x` | ❌ Wave 0 |
| FLOOD_WAIT | floodWaitRemaining propagates from executor to store | Unit (RemovalExecutor + mock governor) | `npx vitest run src/main/telegram/removalExecutor.test.ts -x` | ✅ exists |

**Note:** vitest config covers `src/**/*.test.ts` — renderer test files are included. The vitest environment is `node`, not jsdom, which means React component rendering tests are not supported. Test the dry-run computation function (pure TypeScript) and stage machine logic directly, not React rendering.

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose 2>&1 | tail -20`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + `npx tsc --build --force` passes before `/gsd:verify-work`

**Critical:** Use `tsc --build --force` (NOT `tsc --noEmit`) — the project's root tsconfig has `files: []` and uses project references; `tsc --noEmit` is a known no-op (Phase 5 finding, committed to decisions).

### Wave 0 Gaps
- [ ] `src/renderer/wizard/reviewScreen.test.ts` — covers SAF-01 dry-run computation (pure function, no React)
- [ ] `src/renderer/wizard/wizardStage.test.ts` — covers SAF-02 stage transition logic (if extracted to a pure function)

*(If the stage machine and dry-run computation are implemented as pure functions that can be unit-tested without jsdom, Wave 0 just needs test file stubs. The existing `removalExecutor.test.ts` already covers the executor path for FLOOD_WAIT testing.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | Yes | Existing IPC auth gates (REMOVAL_START requires `step === 'authorized'`); severity IPC channels must apply the same gate |
| V5 Input Validation | Yes | SEVERITY_SET payload: z.enum(['kick', 'ban']) — rejects invalid values before reaching electron-store |
| V6 Cryptography | No | Severity is non-secret; electron-store plain JSON only |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer injecting arbitrary severity value | Tampering | Zod validation on SEVERITY_SET in main process before store write |
| Review screen bypassed (renderer calls REMOVAL_START directly) | Elevation of Privilege | Not possible — renderer calls `removalActions.startRemoval()` which goes through the existing REMOVAL_START IPC handler with all existing security gates (Zod + auth + dialog-map) intact; the Review screen is a UI gate, not a security gate (T-05-05 gates remain) |
| Double-start from a stale run-trigger click after stage advance | Tampering / Repudiation | Existing REMOVAL_START double-start guard in removalChannels.ts (lines 103-107): if step === 'running' or 'stopping', returns current state without dispatching |

---

## Project Constraints (from CLAUDE.md)

1. **No Bot API** — all Telegram operations use MTProto User API via GramJS; N/A for Phase 6 (no new Telegram calls).
2. **Rate limiting** — all Telegram calls throttled with FLOOD_WAIT handling; Phase 6's dry-run makes zero Telegram calls; FLOOD_WAIT plumbing is display-only.
3. **Security** — session credentials stored encrypted (safeStorage); severity pref is non-secret (plain electron-store).
4. **Safety gate** — destructive actions require explicit final confirmation against reviewed identity + group list; SAF-01/02 are the explicit requirements; Review screen replaces RemovalConfirmDialog as the gate.
5. **tsc --build (not --noEmit)** — root `tsc --noEmit` is a known no-op; all verify blocks must use `tsc --build --force`.
6. **Copy modules** — no hardcoded strings in components; all new user-facing strings go in `wizardCopy.ts` (new) or extend `removalCopy.ts` (existing).
7. **electron-store** — NEVER use electron-store's built-in "encryption" for the session; fine for severity (non-secret).
8. **GSD workflow** — use GSD entry points for file changes; no direct repo edits outside a GSD workflow.
9. **Monospace IDs** — `ID {id}` always rendered in mono `font-mono` / `.text-mono` stack; Review screen identity block must follow this.
10. **Two monospace mechanisms in repo** — `globals.css` defines `.text-mono` with the specified stack; `font-mono` uses a different Tailwind default. Phase 5 UI-REVIEW flagged this as a warning. New Review screen code should use `.text-mono` (via `className="text-mono"`) rather than `font-mono` to be consistent with the spec's intent, pending a global fixup.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | electron-vite 5.x can resolve electron-store 11.x (ESM-only) in the main process build via Vite's bundler | Standard Stack / Pitfall 1 | If wrong: severity persistence fails at runtime; fix by using dynamic `await import()` pattern |
| A2 | RemovalExecutor's `governor.run()` accepts a per-call `onEvent` callback (not just a constructor-level one) | Pattern 3 FLOOD_WAIT | If wrong: flood events must be captured at a different hook point in RemovalExecutor; pattern adjusts but the feature still works |
| A3 | The `AdminDialogDTO.type` field distinguishes `'basicGroup'` vs `'supergroup'` vs `'channel'` for dry-run mechanic derivation | Pattern 2 dry-run | If wrong: mechanic prediction is wrong; check groupTypes.ts AdminDialogDTO shape before implementing |

**If this table is empty:** All claims in this research were verified or cited — not applicable; three assumed claims present.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `src/renderer/removal/RemovalConfirmDialog.tsx` — identity block pattern, existing confirm flow
- Codebase: `src/renderer/groups/GroupsPane.tsx` — progress slot, run-trigger, existing stage rendering
- Codebase: `src/renderer/store/removalStore.ts` — store shape, actions, snapshot caching
- Codebase: `src/shared/removalTypes.ts` — RemovalState shape, extension point for floodWaitRemaining
- Codebase: `src/renderer/auth/FloodCountdown.tsx` — FloodCountdown component interface
- Codebase: `src/renderer/store/targetStore.ts` — governor flood-tick subscription pattern
- Codebase: `src/shared/opTypes.ts` — GovernorEvent discriminated union
- Codebase: `.planning/phases/05-removal-execution-engine/05-UI-REVIEW.md` — Phase 5 UI audit findings (Pillar 2 FLOOD_WAIT blocker)
- Codebase: `.planning/phases/05-removal-execution-engine/05-07-SUMMARY.md` — Phase 5 decisions (tsc --build, severity hardcoded, GramJS ignoreMigrated)
- `./CLAUDE.md` — project constraints (stack, security, copy modules)
- `.planning/phases/06-ui-integration-wizard/06-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- npm registry: `electron-store@11.0.2`, created 2017-03-22, author Sindre Sorhus — verified via `npm view`
- slopcheck: `electron-store` rated [OK]

### Tertiary (LOW confidence)
- A1: electron-vite + electron-store ESM/CJS compatibility — not explicitly verified in this session; planner should add Wave 0 verification task

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all libraries already in repo except electron-store; electron-store verified on npm by slopcheck
- Architecture: HIGH — all patterns derived directly from existing codebase code
- Pitfalls: HIGH — most derived from Phase 5 real bugs and UI-REVIEW audit findings
- electron-store ESM/CJS: LOW — one open question not resolved in this session

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (stable stack, 30 days)
