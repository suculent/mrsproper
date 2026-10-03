# Phase 15: Renderer — Add Mode, Contacts, Template & Reporting - Research

**Researched:** 2026-10-04
**Domain:** Electron/React renderer wiring on top of a shipped main-process execution engine (Phase 14); mode-switch state architecture, checklist re-partitioning, DM template editing, clipboard copy, and a plain-text log export via a native save dialog.
**Confidence:** HIGH (code-contract and pattern claims — all read directly from the shipped codebase) / MEDIUM (clipboard permission behavior, Electron dialog API shape) / LOW (none — no claim in this document rests on unverified training knowledge alone)

## Summary

Phase 14 shipped the entire main-process Add engine and its full IPC bridge — `startAdd`, `abortAdd`, `retryAddGroup`, `getAddState`/`onAddState`, `getAddJob`/`discardAddJob`, `addTargetToContacts`, `getDmTemplate`/`setDmTemplate` are all already exposed on `window.mrsproper` and fully security-audited (14-SECURITY.md, 21/21 threats closed). Phase 15 is a pure consumption exercise for 8 of those 9 bridge methods, plus one new tiny main-process addition: an `ADD_EXPORT_LOG` IPC handler that opens `dialog.showSaveDialog` and copies `add-log.txt`.

The single highest-leverage finding is that **today's renderer state architecture is not mode-aware** in two places that must become mode-aware for this phase to work correctly:

1. **`groupsStore.ts`'s pre-check rebuild** (the `onScanState` callback that builds `checkedDialogIds` when a scan reaches `complete`) is hard-coded to `status === 'member' && dialog.canAct` — the Remove/Tag rule. There is no hook today for Add's inverted rule (`canAdd && (status === 'not-member' || status === 'banned')`), and no hook at all for re-running this computation when the *mode* changes without a new scan (D-03 requires exactly that).
2. **`GroupsPane.tsx`'s checklist partition** (actionable-first/greyed-below) and **`GroupRow.tsx`'s actionability/grey-reason rendering** are both hard-coded to `dialog.canAct`/`dialog.greyReason`. Both need a parallel Add-mode branch reading `dialog.canAdd`/`dialog.addGreyReason` and the inverted status rule.

The second major finding is an **architectural split that doesn't exist yet**: `AppShell.tsx` currently has a single `action: 'kick'|'ban'|'tag'` state variable that conflates two orthogonal concerns — the *severity* (kick vs ban, persisted) and the *mode* (which action the review screen offers, not persisted per D-02). This phase must split `action` into `mode: 'remove'|'tag'|'add'` (session-only state, lives in AppShell per discretion) and keep `severity: 'kick'|'ban'` (persisted exactly as today), threading `mode` to `GroupsPane`, `ReviewScreen`, `TargetCard`, and the two resume dialogs, while `severity` continues to flow only to the Kick/Ban toggle and `RemovalExecutor`.

The third finding, verified via web search against current Electron/Chromium behavior, is that **`navigator.clipboard.writeText()` is not guaranteed to work silently** in this app: Electron gates the async Clipboard API behind `session.setPermissionRequestHandler`/`setPermissionCheckHandler`, and this codebase registers neither (`grep` confirmed). An unhandled permission check denies by default in Chromium, and the call rejects with no visible renderer-side error unless the planner adds a `.catch()`. The safe, low-risk path is a **tiny new `clipboard:writeText` IPC call wrapping Electron's synchronous `clipboard` module** (main-process, no Promise/permission layer involved) rather than relying on the web Clipboard API or widening the session's permission grants.

No new npm packages are required anywhere in this phase (see Package Legitimacy Audit) — every new UI need (textarea, segmented control, copy button) is buildable from existing shadcn primitives and native Tailwind/Electron APIs already vetted in the codebase.

**Primary recommendation:** Split `AppShell`'s `action` state into `mode` (new, session-only, drives GroupsPane/ReviewScreen/TargetCard/resume-dialogs) and `severity` (unchanged, persisted); make the Add-mode partition/pre-check/grey-reason rules first-class, mode-aware siblings of the existing Remove rule rather than new branches bolted onto `action === 'tag'`-style conditionals; add one `clipboard:writeText` IPC call instead of trusting `navigator.clipboard` directly; and clone `addStore.ts` from `tagStore.ts` + `removalStore.ts`'s `retryGroup`, exactly as D-17 specifies.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mode switch (ADD-01)**
- D-01: A three-way segmented control Remove / Tag / Add lives in the groups pane header, visible in both browse and checklist mode. Disabled while a scan is resolving a mode switch, during a run, and in run/report stages.
- D-02: Mode is the single source of truth for which action the review screen offers. Review screen's existing 3-way Kick/Ban/Tag picker is replaced: Remove shows Kick/Ban toggle (persisted as today), Tag shows tag input, Add shows the add block. Mode itself is NOT persisted; defaults to Remove on every launch.
- D-03: Switching mode clears the checklist selection and re-partitions already-scanned rows without a new scan. Mode survives a target change within the session; a target change still resets the pane to browse mode as today.
- D-04: `WizardStage` is unchanged; gains `ADD_COMPLETE`/`ADD_STOPPED` events mirroring tag. Run→report auto-advance gated on `mode === 'add'` exactly like the tag gate.

**Add-mode checklist (ADD-02/ADD-03 presentation)**
- D-05: A row is actionable and pre-checked when `canAdd` is true and scan status is `not-member` or `banned`. Rows that are `member`, or carry an `addGreyReason`, are greyed and sorted below actionable rows using the existing `greyReason.*` line from the groups namespace. Rows still pending during the scan render as queued/unchecked and become pre-checked when their status resolves.
- D-06: Banned-but-actionable rows show "Currently banned — the ban will be lifted first" under the title. Remove mode presentation is untouched.
- D-07: Run-trigger button reads "Review adding to N groups" (plural forms), routes to Add review screen. Selection count rules mirror Remove mode (≥1 checked row required).

**"Add to contacts" checkbox (ADD-05)**
- D-08: Checkbox appears on target card only while mode is Add, in resolved and confirmed states, pre-checked by default. State lives in renderer target store for the session (not persisted).
- D-09: Dispatch rule: if Add mode active and box checked when user clicks "Yes, this is the person", `target:addContact` invoked right then. If Add mode entered after target already confirmed, dispatch happens when the run is confirmed on the review screen. Non-blocking, at most once per target; unchecking after success does not remove the contact.
- D-10: Failed contact add shows quiet inline notice on target card ("Couldn't add to contacts — invite links will be used where needed"); never blocks the flow. Mode switched away from Add hides checkbox and notice.

**DM template editor and preview (ADD-16, ADD-12)**
- D-11: Editor lives on the Add review screen in a "Message to {name}" section: rendered preview always visible, "Edit template" toggle reveals a textarea, placeholder legend (`{name}`, `{links}`), "Save" and "Reset to default". Save calls `setDmTemplate`; Reset clears to built-in default for current language. No Settings-menu entry in this phase.
- D-12: Validation: template must contain `{links}`; `{name}` optional. Save disabled with inline message while `{links}` missing, text empty, or exceeds 4000 characters (main-process Zod bound).
- D-13: Preview renders current template with target's display name substituted and `{links}` replaced by one italic placeholder line, "— invite links will be listed here, one per line —". Caption states message is sent once, at run end, only if some groups required invite links. Rendering helper moves to a shared module so main and renderer render identically.

**Add review screen (ADD-12)**
- D-14: Consequence line: "{name} will be added to N groups" with plural forms. Group list mirrors removal list with per-row mechanic note: "Invite" for supergroups/channels, "Add" for basic groups, "Ban will be lifted first" appended for banned rows. Totals block shows count and any excluded rows.
- D-15: One explicit confirmation button, "Add {name} to N groups", no secondary dialog. Confirm call is `startAdd(dialogIds)` only; renderer never passes identity, access hashes or a resume flag (14-SECURITY T-14-16/T-14-20).
- D-16: If resolved target is a deleted account or bot (flags exposed through existing target DTO), confirm button disabled with explanation, in addition to the executor's own guard (Phase 14 D-05).

**Run progress and report (ADD-13)**
- D-17: Reuse groups-pane run/report pattern through a new `addStore` modelled on `tagStore` plus `removalStore`'s `retryGroup`. Row statuses: queued, adding, done, already-member, privacy-blocked, failed (with ADD_* code line), skipped. Progress label "Adding {name} to group x of n…", Stop/Stopping, FLOOD_WAIT subline and PEER_FLOOD banner with "Resume adding", all mirroring tag copy.
- D-18: Privacy-blocked rows show "Invite link created" with a Copy button for the link and, when `premiumWouldAllow` is true, hint "Telegram Premium would allow a direct add". Failed rows show error line and retry link (`retryAddGroup`).
- D-19: Report summary adds a DM status line: sent → "Invite links sent to {name} in one message"; refused → "{name}'s privacy settings refused the message — copy the links above and pass them along"; not-needed → no line. Links stay visible regardless of DM status.

**Add log export (ADD-14)**
- D-20: "Export add log…" button in report stage after an add run and as a Settings-menu entry. Both call new `ADD_EXPORT_LOG` IPC opening `dialog.showSaveDialog` in main (default name `mrproper-add-log.txt`, filter `.txt`) and copying `add-log.txt` to the chosen path. When no log exists, handler returns a "no log" result and UI shows "No add log yet".

**Resume prompt (ADD-08 UI)**
- D-21: `AddResumeJobDialog` mirrors `TagResumeJobDialog`: mounts independently when `getAddJob()` returns an incomplete job, title "Finish adding {name}?", body with x of n processed, "Resume adding" (default variant, non-destructive) and "Discard job". Resume sets mode to Add, stage to run, calls `startAdd` with remaining dialog ids (IPC layer computes continuation; job id preserved per Phase 14 D-20). Discard calls `discardAddJob`.

**Localization (ADD-15)**
- D-22: All new strings go into a new `add` namespace (`en/add.json`, `cs/add.json`) mirroring `tag.json`'s key style; mode-switch labels live in the groups namespace; DM-preview caption and editor strings live in `add`. Czech uses formal vykání and `_one`/`_few`/`_other` forms wherever a count appears. Claude drafts both languages; user reviews at UAT.

### Claude's Discretion
- Component and file names (`ModeSwitch`, `AddResumeJobDialog`, `DmTemplateEditor`, `addStore.ts`, `addClient.ts`, the shared `dmTemplate.ts` module), exact Tailwind layout, and whether the mode switch is a shadcn toggle group or a styled button row.
- How the mode value is threaded (AppShell state vs. a small `modeStore`), as long as D-02's single-source rule holds.
- The exact wording of mechanic notes, the banned note, the DM caption, and the Premium hint.
- Whether the report shows links inline or behind a "Show link" toggle, as long as Copy is one click.
- Test strategy details: pure helpers (partitioning, consequence derivation, template validation) get Vitest unit tests like `reviewScreen.test.ts` and `tagValidation.test.ts`; component behaviour is covered at UAT.

### Deferred Ideas (OUT OF SCOPE)
- Persisting the chosen mode across launches — rejected for now; Remove stays the launch default.
- Editing the DM template from the Settings menu or keeping multiple templates — later, if asked.
- Regenerating an expired link from the report UI — not in scope; links are regenerated only by a completed resumed run.
- A richer Premium upsell beyond the one-line hint — out of scope.
- Exporting `add-job.json` or the report itself (only the plain-text add log is exported).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADD-01 | Mode switch Remove/Tag/Add on groups pane; determines review-screen action; resets selection on switch | See "AppShell action→mode split" and "GroupsPane mode-aware partition" in Architecture Patterns; D-01..D-04 code sites identified in Code Context below |
| ADD-05 (renderer half) | Add-to-contacts checkbox + dispatch at confirm/run-confirm, non-blocking failure notice | `TargetCard.tsx` confirm-gate identified as the insertion point; `addTargetToContacts()` bridge already shipped (Phase 14); dispatch-timing logic documented in Pattern 3 |
| ADD-12 | Review screen: consequence line, exact group list, exact rendered DM text, one explicit confirm; identity from main only | `ReviewScreen.tsx`'s `computePlannedActions`/`computeTagGroups` pattern extended with `computeAddGroups`; `startAdd(dialogIds)`-only confirm call matches T-14-16/T-14-20 |
| ADD-13 | Live per-group progress + per-group report + retry per failed group | `addStore.ts` cloned from `tagStore.ts` + `removalStore.ts.retryGroup`; `GroupsPane.renderProgressSlot()` add-branch; `GroupRow` add-status subline |
| ADD-14 | Export add log to plain text via save dialog | New `ADD_EXPORT_LOG` channel + handler using `dialog.showSaveDialog`; `addLogStore.ts` has no exported path getter today — needs one small additive export |
| ADD-15 | All new strings in English and Czech, 3-form plurals | New `add` namespace; `i18n/index.ts` resources registration; `i18n.test.ts`'s hardcoded `NAMESPACES` array must be updated or the completeness test will not cover `add` |
| ADD-16 (renderer half) | Template editor + preview on review screen | `renderTemplate`/`DEFAULT_TEMPLATE_EN`/`DEFAULT_TEMPLATE_CS` need to move from `templateChannels.ts` to a new `src/shared/dmTemplate.ts` so renderer can import without an Electron/ipcMain dependency |
| ADD-02/03 (checklist semantics, for context) | Already shipped as data layer in Phase 13 (`canAdd`, `addGreyReason` on `AdminDialogDTO`) | Consumed, not re-implemented, by this phase's partition/grey-reason logic |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mode state (Remove/Tag/Add) | Frontend (React, AppShell) | — | Session-only UI state (D-02); never touches main process or disk |
| Severity state (Kick/Ban) | Frontend (React, AppShell) | Main (electron-store via severityChannels) | Unchanged from today — persisted preference, read/written through existing IPC |
| Checklist partition/pre-check rule | Frontend (groupsStore, GroupsPane, GroupRow) | — | Pure derivation over already-fetched `AdminDialogDTO[]` + `ScanState`; no new main-process data needed (Phase 13 already computed `canAdd`/`addGreyReason`) |
| Add-to-contacts dispatch | Frontend (TargetCard, targetStore) → Main (existing `target:addContact` handler) | — | Renderer owns *when* to call; main already owns the Telegram write (Phase 14 D-08) |
| DM template render (preview) | Shared (`src/shared/dmTemplate.ts`, new) | Frontend (ReviewScreen) + Main (AddExecutor via `getDmText`) | Must render byte-identical text in both processes (D-13) — the only way to guarantee that is one shared pure function, not two copies |
| DM template persistence | Main (electron-store via `templateChannels.ts`, shipped) | Frontend (editor UI) | Store + IPC already shipped Phase 14; renderer only adds the editor chrome |
| Add run dispatch/progress/report | Main (AddExecutor, shipped) | Frontend (`addStore`, `GroupsPane`, `GroupRow`) | Execution engine fully shipped; renderer is a pure state mirror + display layer, identical to Tag's shipped pattern |
| Clipboard copy (invite links) | Main (new tiny `clipboard:writeText` IPC) | Frontend (Copy button) | See Pitfall "Clipboard API permission gate" — reliability requires a main-process call, not `navigator.clipboard` directly |
| Add log export | Main (new `ADD_EXPORT_LOG` handler + `dialog.showSaveDialog`) | Frontend (export buttons in report stage + Settings menu) | File I/O and native save dialog are main-process-only capabilities in Electron |
| i18n strings | Frontend (`add` namespace, both languages) | — | Renderer-only concern per established pattern (main never produces user-facing English/Czech strings) |

## Standard Stack

### Core
No new runtime dependencies. This phase is built entirely from the already-installed stack:

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | per package.json (already installed) | Renderer UI | Existing stack, unchanged |
| react-i18next / i18next | per package.json (already installed) | Localization | Existing stack, unchanged |
| Zod | per package.json (already installed) | Main-process IPC payload validation (new `ADD_EXPORT_LOG` handler) | Matches every existing IPC handler's validation pattern |
| Electron `dialog` module | bundled with Electron 37.10.3 (confirmed in `package.json`) | `dialog.showSaveDialog(win, options)` for the export flow | Native, no package needed; first use of `dialog` in this codebase — verified via `grep` that no prior usage exists |
| Electron `clipboard` module | bundled with Electron 37.10.3 | Reliable copy-to-clipboard for invite links, via a new tiny IPC call | Avoids the web Clipboard API's permission-handler gate (see Pitfalls) |

**Installation:** None required — `npm install` is a no-op for this phase.

**Version verification:** `package.json` confirms `"electron": "37.10.3"` [VERIFIED: package.json] — both `dialog.showSaveDialog` and `clipboard.writeText` are stable, unchanged APIs across recent Electron majors [CITED: electronjs.org/docs/latest/api/dialog, electronjs.org/docs/latest/api/clipboard].

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn `Checkbox` (existing, `src/renderer/components/ui/checkbox.tsx`) | existing | Add-to-contacts checkbox on TargetCard | Already used identically for group-row checkboxes |
| shadcn `Dialog` (existing, `src/renderer/components/ui/dialog.tsx`) | existing | `AddResumeJobDialog` | Direct clone of `TagResumeJobDialog`'s usage |
| Plain `<textarea>` (Tailwind-styled, no shadcn wrapper exists today) | n/a | DM template editor body | `ls src/renderer/components/ui/` confirms no `textarea.tsx` exists; either hand-style a `<textarea>` with the same Tailwind input classes as `input.tsx`, or add a minimal `textarea.tsx` sibling — Claude's discretion, no new dependency either way |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-styled `<textarea>` or new `textarea.tsx` | A rich-text/markdown editor library | Rejected — the template is plain text with two placeholders; a rich editor adds a dependency and risks placeholder-breaking formatting characters |
| New `clipboard:writeText` IPC (main `clipboard` module) | `navigator.clipboard.writeText()` directly | Rejected as the primary path — silently fails without a permission handler grant (see Pitfalls); acceptable only as a documented fallback behind a `.catch()` |
| New `clipboard:writeText` IPC | `session.setPermissionRequestHandler` granting `clipboard-sanitized-write` app-wide | Rejected — widens the session's permission surface for a single feature; the main-process `clipboard` module achieves the same UX with a smaller security footprint and no Promise/permission layer at all |
| Styled `Button` row for the mode switch (matches ReviewScreen's existing 3-way action picker markup) | A shadcn `ToggleGroup` primitive | No `toggle-group.tsx` exists in `components/ui/`; adding one is unnecessary — the existing `role="radio"` button-row pattern already used in `ReviewScreen.tsx`'s action picker is directly reusable and requires zero new code |

## Package Legitimacy Audit

**No external packages are installed, added, or upgraded in this phase.** Every new capability (segmented control, textarea, clipboard copy, save dialog) is implemented using packages already present in `package.json` or native Electron/Node APIs bundled with the already-installed Electron 37.10.3. The Package Legitimacy Gate protocol is not applicable; no `slopcheck`/registry verification table is produced.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── Renderer process ───────────────────────────────┐
│                                                                              │
│  AppShell.tsx                                                               │
│  ┌─────────────┐   mode (new, session-only)        severity (unchanged,     │
│  │ mode state  │──────────┬─────────────────┐       persisted via          │
│  │ 'remove'|   │          │                 │       severityClient)        │
│  │ 'tag'|'add' │          ▼                 ▼                              │
│  └─────────────┘   ┌─────────────┐   ┌─────────────────┐                   │
│                     │ GroupsPane  │   │  ReviewScreen    │                  │
│                     │ (mode switch,│  │ (mode-gated:     │                  │
│                     │  partition, │   │  Kick/Ban | Tag  │                  │
│                     │  run-trigger)│  │  input | Add     │                  │
│                     └──────┬──────┘   │  block + DM      │                  │
│                            │          │  editor/preview) │                  │
│                            ▼          └────────┬─────────┘                  │
│                     ┌─────────────┐            │                            │
│                     │  GroupRow   │            │ startAdd(dialogIds)        │
│                     │ (add-status │            │ (+ addTargetToContacts     │
│                     │  subline,   │            │  at confirm or run-confirm)│
│                     │  Copy link) │            ▼                            │
│                     └─────────────┘   ┌──────────────────┐                  │
│                                        │    addStore.ts    │                 │
│                                        │ (clone of tagStore │                 │
│                                        │  + retryGroup)     │                 │
│                                        └─────────┬──────────┘                │
│                                                  │ addClient.ts (thin IPC)   │
└──────────────────────────────────────────────────┼────────────────────────┘
                                                     │ contextBridge (preload — already shipped)
┌────────────────────────────────────────────────────┼──────────────────────┐
│                      Main process                   ▼                     │
│  addChannels.ts (shipped Phase 14) ── ADD_START/ADD_ABORT/ADD_RETRY_GROUP/ │
│  ADD_GET_STATE/ADD_GET_JOB/ADD_DISCARD_JOB/TARGET_ADD_CONTACT              │
│       │                                                                    │
│       ▼                                                                    │
│  AddExecutor (shipped) ── governor.run() ── Telegram (channels.Invite...) │
│       │                                                                    │
│       ▼                                                                    │
│  addAuditStore (add-job.json) / addLogStore (add-log.txt)                 │
│                                                                             │
│  NEW this phase:                                                           │
│  ┌─────────────────────┐        ┌─────────────────────────┐              │
│  │ ADD_EXPORT_LOG       │───────▶│ dialog.showSaveDialog()  │              │
│  │ handler (new)        │        │ + fs.copyFile(add-log.txt)│             │
│  └─────────────────────┘        └─────────────────────────┘              │
│  ┌─────────────────────┐                                                  │
│  │ clipboard:writeText  │───────▶ electron.clipboard.writeText()          │
│  │ handler (new)        │                                                 │
│  └─────────────────────┘                                                  │
│                                                                             │
│  templateChannels.ts (shipped) ── TEMPLATE_GET/TEMPLATE_SET ──             │
│  renderTemplate() MOVES to src/shared/dmTemplate.ts (new) so both         │
│  main (AddExecutor's getDmText) and renderer (ReviewScreen preview)       │
│  import the identical pure function — not two copies.                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── shared/
│   └── dmTemplate.ts          # NEW — renderTemplate() + DEFAULT_TEMPLATE_EN/CS moved out of
│                               #   templateChannels.ts; both main and renderer import this
├── main/ipc/
│   ├── templateChannels.ts    # MODIFIED — re-exports/imports from shared/dmTemplate.ts instead
│   │                           #   of defining renderTemplate()/defaults locally
│   └── addChannels.ts         # MODIFIED (small, additive) — new ADD_EXPORT_LOG handler;
│                               #   optionally new clipboard:writeText handler (or its own
│                               #   clipboardChannels.ts, Claude's discretion)
├── renderer/
│   ├── shell/
│   │   └── AppShell.tsx       # MODIFIED — action split into mode + severity
│   ├── groups/
│   │   ├── GroupsPane.tsx     # MODIFIED — mode switch control, add-mode partition,
│   │   │                       #   add-mode progress/report slot
│   │   └── GroupRow.tsx       # MODIFIED — add-mode actionability + addStatus subline
│   ├── wizard/
│   │   └── ReviewScreen.tsx   # MODIFIED — computeAddGroups, DM editor/preview section,
│   │                           #   add confirm path
│   ├── target/
│   │   └── TargetCard.tsx     # MODIFIED — add-to-contacts checkbox + failure notice
│   ├── store/
│   │   ├── addStore.ts        # NEW — clone of tagStore.ts + removalStore.ts's retryGroup
│   │   └── targetStore.ts     # MODIFIED — session-only "addToContacts checked" + "contact
│   │                           #   add attempted" flags
│   ├── ipc/
│   │   └── addClient.ts       # NEW — thin wrapper mirroring tagClient.ts/removalClient.ts
│   ├── removal/
│   │   └── AddResumeJobDialog.tsx  # NEW — clone of TagResumeJobDialog.tsx
│   └── i18n/locales/{en,cs}/
│       └── add.json           # NEW namespace per D-22
```

### Pattern 1: AppShell `action` → `mode` + `severity` split (ADD-01, D-02)

**What:** `AppShell.tsx` currently owns one piece of state, `action: 'kick'|'ban'|'tag'`, that is simultaneously (a) the persisted severity preference and (b) the thing that gates which run/report UI is shown. Phase 12 already blurred this — `handleActionChange` only persists when `a === 'kick' || a === 'ban'`, silently treating `'tag'` as a non-persisted mode value. Phase 15 must make this split explicit rather than extending the same overloaded variable a third way.

**When to use:** Any time `action` is read today, decide whether the call site cares about *severity* (Kick vs Ban — e.g. `removalActions.startRemoval(severity, ...)`, `GroupRow`'s `severity` prop) or *mode* (which stage UI to show — e.g. `GroupsPane`'s `activeAction` prop, the run→report auto-advance gates, `ReviewScreen`'s branching).

**Example — today's conflated state (AppShell.tsx:43-53):**
```typescript
// Source: src/renderer/shell/AppShell.tsx (current)
const [action, setAction] = useState<'kick' | 'ban' | 'tag'>('ban')
useEffect(() => {
  severityClient.getSeverity().then(setAction).catch(() => {})
}, [])
const handleActionChange = useCallback((a: 'kick' | 'ban' | 'tag') => {
  setAction(a)
  if (a === 'kick' || a === 'ban') void severityClient.setSeverity(a)
}, [])
```

**Recommended split:**
```typescript
// mode: session-only, defaults 'remove', never persisted (D-02)
const [mode, setMode] = useState<'remove' | 'tag' | 'add'>('remove')

// severity: unchanged from today, persisted, independent of mode
const [severity, setSeverity] = useState<'kick' | 'ban'>('ban')
useEffect(() => {
  severityClient.getSeverity().then(setSeverity).catch(() => {})
}, [])
const handleSeverityChange = useCallback((s: 'kick' | 'ban') => {
  setSeverity(s)
  void severityClient.setSeverity(s)
}, [])
```
`GroupsPane`'s `activeAction` prop becomes `mode`; its internal `activeAction === 'tag'` branches become `mode === 'tag'` (and a new `mode === 'add'` branch); `ReviewScreen`'s `action`/`onActionChange` props become `mode` (read-only, no change handler — the picker lives in GroupsPane now per D-01) plus `severity`/`onSeverityChange` (only meaningful/rendered when `mode === 'remove'`). The run→report auto-advance effects (today gated on `action === 'tag'`) need a third effect gated on `mode === 'add'`, watching `add.step`.

### Pattern 2: Mode-aware checklist partition and pre-check (D-03, D-05)

**What:** Two independent pieces of logic need a mode parameter that doesn't exist today:

1. `groupsStore.ts`'s `onScanState` 'complete' handler (lines ~58-85) rebuilds `checkedDialogIds` using a hard-coded predicate: `status === 'member' && dialog.canAct`. This rebuild only fires on the scan's first `'complete'` transition — never again. D-03 requires the checked-set to be recomputed **on every mode switch**, without a new scan.
2. `GroupsPane.tsx`'s checklist-mode dialog partition (lines ~135-159) sorts dialogs into `actionable`/`nonActionable` using the same hard-coded `dialog.canAct && (status === 'member' || status === null)` rule.

**When to use:** Both need a shared, exported, pure predicate function parameterized by mode, so the two call sites (pre-check rebuild, partition) can never drift from each other.

**Recommended approach — a pure, exported predicate + a new store action:**
```typescript
// New pure helper (e.g. src/renderer/groups/modeRules.ts or inline in groupsStore.ts) —
// exported for unit testing like computeTagGroups.
export function isActionableForMode(
  dialog: AdminDialogDTO,
  status: MembershipStatus | null,
  mode: 'remove' | 'tag' | 'add'
): boolean {
  if (mode === 'add') {
    return dialog.canAdd && (status === 'not-member' || status === 'banned')
  }
  // remove and tag share the existing rule — tag targets members exactly like removal
  return dialog.canAct && (status === 'member' || status === null)
}
```
```typescript
// groupsStore.ts — new action, called by AppShell/GroupsPane whenever mode changes,
// AND reused inside the existing onScanState 'complete' handler so there is one rule.
export const groupsActions = {
  // ...existing actions...
  recomputeCheckedForMode(mode: 'remove' | 'tag' | 'add'): void {
    const groups = currentState.groups
    const scan = currentState.scan
    if (groups.step !== 'loaded' || (scan.step !== 'scanning' && scan.step !== 'complete')) return
    const checkedDialogIds = new Set(
      groups.dialogs
        .filter((d) => {
          const result = scan.results.find((r) => r.dialogId === d.id)
          const status = result ? result.status : null
          return isActionableForMode(d, status, mode)
        })
        .map((d) => d.id)
    )
    setState({ checkedDialogIds })
  },
}
```
Note the pending-row nuance from D-05: a `status === null` (pending) row should NOT be pre-checked in Add mode (only resolved `not-member`/`banned` rows should), but in Remove/Tag mode pending rows historically ARE treated as actionable-while-scanning (existing behavior, `status === null` included in the Remove rule above). Keep that asymmetry explicit in `isActionableForMode` exactly as written above — do not try to unify it further; it is an intentional per-mode difference already implied by D-05's "become pre-checked when their status resolves" wording.

**Anti-pattern to avoid:** Adding a fourth `if (mode === 'add') { ... } else if (mode === 'tag') { ...duplicate the remove logic... }` branch inline in both `groupsStore.ts` and `GroupsPane.tsx` independently. The existing Tag-mode code already duplicates some Remove-mode logic this way (see `GroupsPane`'s `getTagStatus`/`getRemovalStatus` as parallel-but-separate functions) — acceptable for *run-status* derivation (genuinely different per-action data), but NOT acceptable for the *partition/pre-check rule*, which must be a single shared predicate or Remove and Add will silently diverge the next time either rule changes.

### Pattern 3: Add-to-contacts dispatch timing (D-08/D-09/D-10)

**What:** The checkbox's dispatch has two possible trigger points per D-09: at `targetActions.confirmTarget()` time (if mode is already Add) OR at Add-run-confirm time (if mode was switched to Add after the target was already confirmed). Both call the same already-shipped `window.mrsproper.addTargetToContacts()` bridge method with no payload.

**When to use:** Track two pieces of session-only state in `targetStore.ts` (or a sibling): `addToContactsChecked: boolean` (defaults `true` per D-08) and `contactAddAttempted: boolean` (set `true` the first time the call fires, to enforce "at most once per target" even if the user toggles mode back and forth).

**Example:**
```typescript
// targetStore.ts additions (illustrative — exact shape is Claude's discretion)
interface TargetStoreState {
  // ...existing fields...
  addToContactsChecked: boolean      // D-08: pre-checked by default, session-only
  contactAddAttempted: boolean       // D-09: enforce at-most-once
  contactAddFailed: boolean          // D-10: drives the inline notice
}

export const targetActions = {
  // ...existing actions...
  async confirmTarget(mode: 'remove' | 'tag' | 'add'): Promise<void> {
    const s = await targetClient.confirmTarget()
    setState({ target: s })
    if (mode === 'add' && currentState.addToContactsChecked && !currentState.contactAddAttempted) {
      setState({ contactAddAttempted: true })
      const result = await window.mrsproper.addTargetToContacts().catch(() => ({ ok: false }))
      if (!result.ok) setState({ contactAddFailed: true })
    }
  },
}
```
The symmetric call at Add-run-confirm time (ReviewScreen's `handleConfirm`, when `mode === 'add'`) must check the SAME `contactAddAttempted` flag before firing, so a target confirmed under Remove mode and then switched to Add only fires the contact-add once, at run-confirm time.

### Pattern 4: `computeAddGroups` — mirrors `computeTagGroups` (ADD-12, D-14)

**What:** `ReviewScreen.tsx` already has the exact precedent to extend: `computePlannedActions` (Remove) and `computeTagGroups` (Tag) are pure, exported, unit-tested functions mapping checked dialogs → per-row action descriptors with a `mechanicNote`. `computeAddGroups` is a third sibling.

**Example (pattern to follow, from the existing `computeTagGroups` in `tagValidation.ts`):**
```typescript
// New: src/renderer/wizard/addValidation.ts (or inline in ReviewScreen.tsx like
// computePlannedActions is) — exported for unit testing, no jsdom needed.
export type AddGroupAction = {
  dialog: AdminDialogDTO
  mechanicNote: string           // "Invite" | "Add" | with "— ban will be lifted first" appended
  banNoteAppended: boolean       // drives the D-06/D-14 "ban will be lifted first" suffix
}

export function computeAddGroups(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  membershipByDialogId: Map<string, MembershipStatus>,
  t: TranslateFn = (key) => key
): AddGroupAction[] {
  return dialogs
    .filter((d) => checkedIds.has(d.id))
    .map((d) => {
      const isBasic = d.type === 'basic-group'
      const isBanned = membershipByDialogId.get(d.id) === 'banned'
      const base = isBasic ? t('add:mechanicNote.add') : t('add:mechanicNote.invite')
      return {
        dialog: d,
        mechanicNote: isBanned ? `${base} — ${t('add:mechanicNote.banLiftedFirst')}` : base,
        banNoteAppended: isBanned,
      }
    })
}
```
Unlike `computeTagGroups` (which needs no membership status — tag only ever targets members) and `computePlannedActions` (which needs none either — removal only targets members too), `computeAddGroups` is the FIRST of the three review-screen helpers that needs `MembershipStatus` as an input, because the "ban will be lifted first" note depends on it. Thread `scan.results` (already available via `useGroupsStore()` in `ReviewScreen`) in as the `membershipByDialogId` map.

### Pattern 5: Shared `renderTemplate` module (D-13)

**What:** `renderTemplate()`, `DEFAULT_TEMPLATE_EN`, and `DEFAULT_TEMPLATE_CS` currently live in `src/main/ipc/templateChannels.ts`, which imports `electron` (`ipcMain`) at module scope. The renderer CANNOT import this file directly — it would pull Electron's main-process module into a renderer bundle. D-13 requires main and renderer to render byte-identical preview text, which is only guaranteed by sharing the exact same function.

**Recommended approach:** Extract the pure parts (no `ipcMain`, no `zod`, no electron-store) into `src/shared/dmTemplate.ts`:
```typescript
// src/shared/dmTemplate.ts — NEW, pure, no Electron import, importable by both processes
export function renderTemplate(template: string, vars: { name: string; links: string }): string {
  return template.replace(/\{name\}|\{links\}/g, (m) => (m === '{name}' ? vars.name : vars.links))
}
export const DEFAULT_TEMPLATE_EN = "Hi {name}! ..." // moved verbatim from templateChannels.ts
export const DEFAULT_TEMPLATE_CS = 'Dobrý den, {name}, ...' // moved verbatim
```
`templateChannels.ts` then does `import { renderTemplate, DEFAULT_TEMPLATE_EN, DEFAULT_TEMPLATE_CS } from '@shared/dmTemplate'` and re-exports them (so `main/index.ts`'s existing `import { renderTemplate, DEFAULT_TEMPLATE_EN, DEFAULT_TEMPLATE_CS } from './ipc/templateChannels'` continues to work with zero call-site changes) — OR `main/index.ts` is updated to import directly from `@shared/dmTemplate`. Either is fine; the re-export keeps the diff smaller. `ReviewScreen.tsx`'s DM preview then does the SAME `renderTemplate(currentTemplate, { name: targetName, links: PLACEHOLDER_LINKS_LINE })` call — per D-13, the links placeholder is a literal italic string, not real links (links only exist after the run), so the preview's `links` var is a constant, not data from any store.

**Preview vs. persisted template state:** The renderer needs: (1) the persisted template, fetched via the already-shipped `window.mrsproper.getDmTemplate()` (returns `string | null`) on review-screen mount, falling back to `DEFAULT_TEMPLATE_EN`/`DEFAULT_TEMPLATE_CS` by current `i18n.language` exactly as main does (see `main/index.ts`'s `dmLanguage` pattern); (2) local editor draft state while "Edit template" is open; (3) calls `setDmTemplate(draft)` on Save.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Copying a string to the OS clipboard | A custom `document.execCommand('copy')` fallback chain, or trusting `navigator.clipboard.writeText()` bare | A new tiny `clipboard:writeText` main-process IPC call wrapping Electron's `clipboard.writeText()` | `navigator.clipboard.writeText()` is gated by `session.setPermissionRequestHandler`, which this app does not register — the call silently rejects. Electron's own `clipboard` module is synchronous, main-process-only, and has no permission layer at all [CITED: electronjs.org/docs/latest/api/clipboard; community-verified via web search, see Sources] |
| Opening a native "Save As" dialog | A custom renderer-side `<a download>` blob-URL trick (doesn't exist/work reliably in a `contextIsolation`+no-nodeIntegration Electron renderer for arbitrary filesystem paths) | `dialog.showSaveDialog(win, options)` in main, called from the new `ADD_EXPORT_LOG` IPC handler | This is literally what the API is for; it is the only reliable, OS-native way to let the user pick a save location from an Electron app |
| Rendering the DM preview text | A second, renderer-local copy of the `{name}`/`{links}` substitution logic | Import the shared `renderTemplate()` from the new `src/shared/dmTemplate.ts` (Pattern 5) | D-13 explicitly requires byte-identical rendering between main (actual send) and renderer (preview) — any divergence is a correctness bug users would notice as "the preview lied" |
| Deciding whether a row is actionable in Add mode | A copy-pasted partition block inside `GroupsPane.tsx` that duplicates the Remove-mode predicate with `canAct`→`canAdd` and `member`→`not-member/banned` swapped inline | The shared `isActionableForMode()` pure predicate (Pattern 2), called from both `groupsStore.ts`'s pre-check rebuild and `GroupsPane.tsx`'s partition | Two independent copies of "what counts as actionable per mode" WILL drift — this is exactly the kind of silent inconsistency Phase 13's `canAdd`/`addGreyReason` data layer was built to prevent in the first place |
| Validating the DM template before Save | Ad-hoc string `.includes('{links}')` checks scattered in the editor component | A small exported pure validator (e.g. `validateDmTemplate(text): 'missingLinks' | 'empty' | 'tooLong' | null`), mirroring `tagValidation.ts`'s `validateTagInput` pattern exactly | D-12's three failure modes (`{links}` missing / empty / >4000 chars) need the same inline-disable-with-message UX as the tag input already has — reuse the proven pattern, don't invent a new validation idiom |

**Key insight:** Every "don't hand-roll" item above has a working precedent already shipped in this exact codebase (tag input validation, removal/tag resume dialogs, removal/tag run-status rendering). The risk in this phase is not missing library knowledge — it's accidentally writing a FOURTH slightly-different copy of a pattern that already exists three times (Remove, Tag, and now Add) instead of factoring the one new piece of real logic (the inverted actionability rule, the DM render function) into something Remove/Tag/Add can all share correctly.

## Common Pitfalls

### Pitfall 1: `navigator.clipboard.writeText()` silently fails
**What goes wrong:** The Copy button on a privacy-blocked row's invite link appears to do nothing — no error, no visual feedback, link not actually on the clipboard.
**Why it happens:** Chromium's async Clipboard API requires the hosting `session` to grant `clipboard-sanitized-write` via `setPermissionRequestHandler`/`setPermissionCheckHandler`. This app registers neither handler (confirmed via `grep -rn "setPermissionRequestHandler" src/main/`), so Chromium's default-deny applies, and the returned Promise rejects with `NotAllowedError` — which is invisible unless the caller explicitly `.catch()`s and surfaces it.
**How to avoid:** Add a small `clipboard:writeText` IPC handler in main using Electron's synchronous `clipboard.writeText(text)` module (not gated by any permission check), exposed through preload, called from the Copy button instead of `navigator.clipboard` directly.
**Warning signs:** Manual click-testing the Copy button is the only way this surfaces — there is no TypeScript or build-time signal. Flag this explicitly for UAT if the `clipboard:writeText` IPC is not implemented.

### Pitfall 2: Two independent "actionable" predicates drifting apart
**What goes wrong:** A row shows as checkable in the list (partition says actionable) but is pre-checked incorrectly, or vice versa — e.g. a `banned` row appears in the actionable section but was never added to `checkedDialogIds` because the pre-check rebuild in `groupsStore.ts` wasn't updated to match the partition rule in `GroupsPane.tsx`.
**Why it happens:** These two pieces of logic live in different files today (`groupsStore.ts`'s `onScanState` handler vs. `GroupsPane.tsx`'s inline partition loop) and have no shared helper — it is easy to update one and forget the other, especially since neither currently takes a `mode` parameter at all.
**How to avoid:** Implement `isActionableForMode()` once (Pattern 2) and import it at both call sites. Unit-test it directly (no jsdom needed) the same way `reviewScreen.test.ts` tests `computePlannedActions`.
**Warning signs:** A manual test where a banned, invite-right-holding row appears in the top (actionable) section of the Add checklist but its checkbox is unchecked and disabled-looking on first scan completion.

### Pitfall 3: Forgetting the mode-switch-clears-selection requirement (D-03) is NOT automatic
**What goes wrong:** Switching from Remove to Add mode leaves stale `checkedDialogIds` from the Remove partition checked against Add-mode rows, or leaves rows checked that are now greyed under the new mode.
**Why it happens:** `checkedDialogIds` lives in `groupsStore.ts`, a singleton external store — it does NOT automatically react to a `mode` prop changing in a React component, because `mode` lives in `AppShell`'s component state, not in the store. Without an explicit effect or handler wired to the mode-switch control's `onClick`, the store has no way to know the mode changed.
**How to avoid:** The mode-switch control's change handler (wherever it's mounted — the discretion is file/component naming, but the wiring must exist) must call `groupsActions.recomputeCheckedForMode(newMode)` (or equivalent) synchronously on every mode change, not rely on a `useEffect` keyed only on `scan.step`.
**Warning signs:** Unit/manual test: scan completes in Remove mode with 3 members pre-checked; switch to Add mode; if the 3 Remove-mode dialog ids are still in `checkedDialogIds` (even though they're now greyed/non-actionable because they're `member`-status rows, not `not-member`/`banned`), the bug is present.

### Pitfall 4: Conflating `mode` and `severity` persistence (regression risk)
**What goes wrong:** After the `action`→`mode`+`severity` split (Pattern 1), a careless refactor accidentally persists `mode` (e.g. by routing it through `severityClient.setSeverity()`) or stops persisting `severity` (e.g. by only updating session state).
**Why it happens:** The existing `handleActionChange` already has an easy-to-miss conditional (`if (a === 'kick' || a === 'ban')`) guarding persistence — splitting the function is a good opportunity to simplify, but also a good opportunity to drop the persistence call entirely by accident.
**How to avoid:** `severity`'s setter must ALWAYS call `severityClient.setSeverity()` (it's always kick or ban, no third option once split) — verify this with the existing `severity.test.ts`-style coverage if one exists, or add a regression check that switching mode to Tag/Add and back to Remove preserves the previously-selected severity exactly as it does today.
**Warning signs:** Manual test: set Ban, switch to Add mode, relaunch app (persisted severity survives relaunch, mode resets to Remove per D-02) — if severity reverts to the default (`ban`) instead of surviving, persistence broke.

### Pitfall 5: `i18n.test.ts`'s hardcoded `NAMESPACES` array misses the new `add` namespace
**What goes wrong:** The completeness test (`it('all namespaces load: ... — both en and cs')`) in `src/renderer/i18n/i18n.test.ts` iterates a literal array `['auth', 'target', 'groups', 'wizard', 'removal', 'shell', 'tag']`. Adding `add.json` to `i18n/index.ts`'s `resources` object WITHOUT updating this array means the test suite will not notice if the Czech `add.json` is missing keys, incomplete, or entirely absent — it will keep passing green.
**Why it happens:** The array is a manually-maintained literal, not derived from `Object.keys(resources.en)`.
**How to avoid:** Add `'add'` to the `NAMESPACES` const in `i18n.test.ts` as part of this phase's i18n wiring task — this is a required edit, not optional cleanup.
**Warning signs:** None visible without manually re-reading the test file — this is a silent gap, flag it explicitly in the plan's task list.

### Pitfall 6: No `jsdom`/RTL in this project — component-level tests are not runnable here
**What goes wrong:** Writing a Vitest test that renders `<ReviewScreen>` or `<GroupRow>` with React Testing Library and expects it to pass.
**Why it happens:** `vitest.config.ts` sets `environment: 'node'` project-wide (confirmed by direct read) specifically because "tests target plain Node/TS main-process logic with mocks — they MUST NOT launch Electron." There is no `jsdom` dependency installed and no per-file environment override anywhere in the existing test suite (every `*.test.ts` file tests pure functions or store modules with `vi.mock`, never a rendered component).
**How to avoid:** Confirm with the planner/discuss-phase that component behavior (the mode switch control's visual states, the DM editor's toggle, the Copy button's click) is UAT-only, per CONTEXT.md's own discretion note ("component behaviour is covered at UAT"). Only pure helpers (`computeAddGroups`, `isActionableForMode`, `validateDmTemplate`, `addStore.ts`'s action dispatchers with mocked `addClient`) get Vitest coverage, exactly like `tagStore.test.ts`'s existing pattern (mocks the IPC client module, never renders anything).
**Warning signs:** A `tsc --build` or `vitest run` failure mentioning `document is not defined` or `window is not defined` — this means a test file accidentally assumed a DOM environment that isn't configured.

### Pitfall 7: `addLogStore.ts` has no exported path accessor for the export handler
**What goes wrong:** The new `ADD_EXPORT_LOG` handler needs the absolute path to `add-log.txt` to copy it, but `addLogStore.ts`'s `logPath()` function is a private closure inside `createAddLogStore()` — it is not part of the `AddLogStore` interface and not exported.
**Why it happens:** Phase 14 only needed `appendBlock()` on the public interface; reading/copying the file wasn't in scope then.
**How to avoid:** Add a small, additive method to the `AddLogStore` interface — e.g. `getLogPath(): string` — returning the same `logPath()` computation already implemented, OR independently reconstruct `path.join(app.getPath('userData'), 'add-log.txt')` directly in the new export handler (duplicates one line of logic, acceptable given it's a literal filename constant already named in two other places in that file's own comments). Prefer the interface-method approach for single-source-of-truth, but either satisfies the requirement — this is a small, additive change to an already-reviewed file, not a redesign.
**Warning signs:** None at compile time if the duplicate-path approach is chosen (it'll just work) — only a maintenance smell if the log filename ever changes and one of the two locations isn't updated.

## Code Examples

### Export add log via save dialog (new main-process handler — D-20)
```typescript
// Source: pattern verified against electronjs.org/docs/latest/api/dialog (showSaveDialog signature)
// and the existing addChannels.ts handler-registration style (ipcMain.handle + try/catch).
import { dialog, BrowserWindow } from 'electron'
import { copyFileSync, existsSync } from 'node:fs'
import { ADD_EXPORT_LOG } from '@shared/channels'

ipcMain.handle(ADD_EXPORT_LOG, async (_event) => {
  const logPath = addLogStore.getLogPath() // see Pitfall 7
  if (!existsSync(logPath)) {
    return { ok: false, reason: 'no-log' as const }
  }
  const win = BrowserWindow.getFocusedWindow() ?? currentWin
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: 'mrproper-add-log.txt',
    filters: [{ name: 'Text', extensions: ['txt'] }],
  })
  if (canceled || !filePath) {
    return { ok: false, reason: 'canceled' as const }
  }
  copyFileSync(logPath, filePath)
  return { ok: true as const }
})
```
`dialog.showSaveDialog(window, options)` resolves to `{ canceled: boolean; filePath?: string }` — this exact return shape is documented and stable across Electron majors [CITED: electronjs.org/docs/latest/api/dialog#dialogshowsavedialogwindow-options].

### Reliable clipboard copy (new main-process handler — D-18)
```typescript
// Source: electronjs.org/docs/latest/api/clipboard — clipboard.writeText is synchronous,
// main-process-only, and has no permission-check gate (unlike navigator.clipboard).
import { clipboard } from 'electron'
import { CLIPBOARD_WRITE_TEXT } from '@shared/channels' // new channel constant

ipcMain.handle(CLIPBOARD_WRITE_TEXT, async (_event, payload: unknown) => {
  const { text } = z.object({ text: z.string().max(2000) }).parse(payload)
  clipboard.writeText(text)
  return { ok: true as const }
})
```

### Shared template render — the exact substitution already shipped, now shared (D-13)
```typescript
// Source: src/main/ipc/templateChannels.ts (existing, to be moved verbatim to
// src/shared/dmTemplate.ts per Pattern 5 — zero behavior change, only relocation).
export function renderTemplate(template: string, vars: { name: string; links: string }): string {
  return template.replace(/\{name\}|\{links\}/g, (m) => (m === '{name}' ? vars.name : vars.links))
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `action: 'kick'|'ban'|'tag'` single variable in AppShell | `mode: 'remove'|'tag'|'add'` + `severity: 'kick'|'ban'` as two independent variables | This phase (ADD-01, D-02) | Required because Phase 15 adds a third action (Add) that has no severity concept at all — the two-concern overload becomes untenable with three modes |
| `templateChannels.ts` owning `renderTemplate`/defaults exclusively | `src/shared/dmTemplate.ts` as the single source, re-exported by `templateChannels.ts` | This phase (D-13) | First shared (main+renderer) pure-logic module introduced specifically for Add mode's preview-must-match-send requirement |
| No clipboard writes anywhere in the app | New main-process `clipboard:writeText` IPC | This phase (D-18) | First clipboard interaction in the codebase; sets the precedent (main-process `clipboard` module, not `navigator.clipboard`) for any future copy-to-clipboard feature |
| No native save dialogs anywhere in the app | New main-process `ADD_EXPORT_LOG` handler using `dialog.showSaveDialog` | This phase (D-20) | First use of Electron's `dialog` module in this codebase; sets the precedent for any future export/save feature |

**Deprecated/outdated:** Nothing in this phase deprecates prior code outright — `action` as a name is retired from AppShell's state (replaced by `mode`+`severity`), but `severity: 'kick'|'ban'` as a concept and its persistence mechanism (`severityClient`, `severityChannels.ts`) are unchanged and continue exactly as shipped.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `navigator.clipboard.writeText()` will silently fail in this app's current Electron configuration because no `setPermissionRequestHandler`/`setPermissionCheckHandler` is registered | Pitfalls §1, Don't Hand-Roll | If Electron 37's default behavior actually auto-grants clipboard-write for `file://`-loaded content without a handler (some Electron versions have had looser defaults for non-remote content), the extra `clipboard:writeText` IPC would be unnecessary complexity rather than a necessity. Low-cost mitigation either way: the IPC handler is a ~5-line addition; recommend implementing it regardless, but flag for a quick manual verification (click Copy, check clipboard) early in execution rather than discovering it at UAT. |
| A2 | `dialog.showSaveDialog(window, options)` resolves to exactly `{ canceled, filePath }` on both macOS and Windows with no further platform-specific quirks relevant to this feature | Code Examples, Standard Stack | If Windows surfaces a different default-extension-handling quirk (e.g. not auto-appending `.txt` when the filter is set a certain way), the exported file might lack the expected extension on that platform. Low risk — this is a very commonly used, stable Electron API; recommend a manual Windows-host check during UAT per the project's existing "Windows launch pending on a Windows host" deferred item. |
| A3 | Electron's `clipboard.writeText()` (synchronous, main-process) has no permission/entitlement gate on either macOS or Windows in this app's packaging configuration | Pitfalls §1 | If macOS's sandboxing/notarization entitlements (mentioned in this project's electron-builder stack notes) restrict clipboard access for a notarized, sandboxed app, the main-process path would ALSO need an entitlement declared in the macOS build config. This is a packaging-layer concern outside this phase's renderer scope — flag as an open question for whoever owns electron-builder config if UAT reveals clipboard copy failing specifically in a packaged (not dev) build on macOS. |

## Open Questions

1. **Where exactly does the mode-switch state live — AppShell or a dedicated `modeStore`?**
   - What we know: CONTEXT.md's discretion note explicitly defers this ("AppShell state vs. a small `modeStore`, as long as D-02's single-source rule holds").
   - What's unclear: AppShell already holds `severity` as local `useState`; a dedicated `modeStore` (useSyncExternalStore singleton, matching every OTHER piece of cross-component state in this app — `groupsStore`, `tagStore`, `removalStore`, `targetStore`) would be more consistent with the codebase's established pattern than a plain `useState`, since `mode` needs to reach `GroupsPane`, `ReviewScreen`, `TargetCard`, AND the resume dialogs — four consumers, which is exactly the shape every other `*Store.ts` singleton in this app serves.
   - Recommendation: Prefer a plain `useState` in AppShell ONLY if prop-threading to four consumers stays manageable (it already does today for `severity`/`action` via explicit props); if the planner finds prop-drilling awkward, a `modeStore.ts` singleton mirroring `targetStore.ts`'s shape (no IPC subscription needed, purely local) is the more idiomatic fit for this codebase's conventions. Either satisfies D-02.

2. **Does the DM template editor need a dedicated shadcn `Textarea` component, or is a hand-styled `<textarea>` sufficient?**
   - What we know: No `textarea.tsx` exists in `src/renderer/components/ui/` today; `input.tsx` exists and could donate its Tailwind classes to a hand-styled `<textarea>`.
   - What's unclear: Whether future phases will need more textareas (making a reusable component worth the small upfront cost) — out of scope to predict here.
   - Recommendation: Add a minimal `textarea.tsx` sibling to `input.tsx` (same Tailwind classes, `<textarea>` element) rather than inlining raw markup in `ReviewScreen.tsx` — consistent with how every other form control in this codebase is a `components/ui/*.tsx` wrapper, and it's a ~15-line file with zero new dependencies.

3. **Exact wiring location for `clipboard:writeText` — new `clipboardChannels.ts` or inline in `addChannels.ts`?**
   - What we know: It's a tiny, single-purpose handler with no Add-specific logic (it just writes whatever string it's given) — it could be useful beyond Add mode in the future (e.g. copying a target's username).
   - What's unclear: Whether the project prefers one-handler-per-file (the established pattern — `templateChannels.ts`, `languageChannels.ts`, `themeChannels.ts` are all single-purpose) or bundling small handlers into the feature that first needed them.
   - Recommendation: New `src/main/ipc/clipboardChannels.ts` with a single `registerClipboardChannels()` export, matching the one-handler-per-file convention already established by every other `*Channels.ts` file in `src/main/ipc/`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Electron `dialog` module | ADD-14 export flow | ✓ (bundled with Electron) | 37.10.3 | — |
| Electron `clipboard` module | ADD-13 Copy button (D-18) | ✓ (bundled with Electron) | 37.10.3 | `navigator.clipboard.writeText()` with a `.catch()`-surfaced error, if the team decides against the extra IPC (not recommended — see Pitfall 1) |
| `node:fs` (`copyFileSync`/`existsSync`) | ADD-14 export flow | ✓ (Node builtin, already used throughout `src/main/storage/*.ts`) | bundled with Electron's Node runtime | — |
| Vitest `environment: 'node'` (no jsdom) | Test strategy for this phase | ✓ (confirmed in `vitest.config.ts`) | — | Component-level behavior tested manually at UAT, per CONTEXT.md's own discretion note |

**Missing dependencies with no fallback:** None — every capability this phase needs is already bundled with the installed Electron version or is a Node builtin already in use elsewhere in the codebase.

**Missing dependencies with fallback:** Clipboard API reliability (see row above) — fallback exists but is explicitly not recommended.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 (per `package.json`) |
| Config file | `vitest.config.ts` — `environment: 'node'`, `include: ['src/**/*.test.ts']`, path aliases `@shared`/`@main`/`@renderer` |
| Quick run command | `npx vitest run src/renderer/<changed-file>.test.ts` |
| Full suite command | `npx tsc --build && npx vitest run` (per CLAUDE.md/project convention — `tsc --build` first, then delete any emitted `.js`/`.d.ts` beside `.ts` sources before `vitest run`, or tests silently execute stale compiled output) |

**Critical environment note:** `environment: 'node'` means there is NO DOM. No test in this phase can render a React component with React Testing Library — every new test must target a pure function (`isActionableForMode`, `computeAddGroups`, `validateDmTemplate`, `renderTemplate` relocation) or a store module with its IPC client mocked via `vi.mock()` (exactly like `tagStore.test.ts`'s existing pattern). This is a hard constraint, not a choice — do not plan component-level automated tests for this phase.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADD-01 | `mode` state drives GroupsPane partition / ReviewScreen branch (no component render needed — test the pure predicate) | unit | `npx vitest run src/renderer/groups/modeRules.test.ts` | ❌ Wave 0 |
| ADD-01 | Mode switch clears `checkedDialogIds` on change | unit | `npx vitest run src/renderer/store/groupsStore.test.ts` | ❌ Wave 0 (no `groupsStore.test.ts` exists today — only `tagStore.test.ts`/removal equivalents exist for other stores) |
| ADD-05 | Contact-add dispatches at most once per target, at the correct trigger point | unit | `npx vitest run src/renderer/store/targetStore.test.ts` | ❌ Wave 0 |
| ADD-12 | `computeAddGroups` mechanic notes (Invite/Add/ban-lifted-first) | unit | `npx vitest run src/renderer/wizard/reviewScreen.test.ts` (extend existing file, same pattern as `computePlannedActions`/`computeTagGroups` tests already there) | ✅ (existing file, extend) |
| ADD-12 | Confirm button calls `startAdd(dialogIds)` only — no identity/resume fields | manual-only | — | UAT — this is an IPC-call-shape assertion best verified by reading the handler call site in code review, not a jsdom-dependent click test |
| ADD-13 | `addStore.ts` action dispatchers (`startAdd`, `abortAdd`, `retryGroup`, `discardJob`, `resumeJobFromDisk`) mirror `tagStore.test.ts`'s mocked-client pattern | unit | `npx vitest run src/renderer/store/addStore.test.ts` | ❌ Wave 0 |
| ADD-14 | `ADD_EXPORT_LOG` handler: no-log case, save-dialog-canceled case, success-copy case | unit (main-process, mocked `dialog`/`fs`) | `npx vitest run src/main/ipc/addChannels.test.ts` (extend existing file — already 608 lines covering ADD_START etc., same mocking idiom applies) | ✅ (existing file, extend) |
| ADD-15 | `i18n.test.ts`'s namespace-completeness check covers `add.json` in both languages | unit | `npx vitest run src/renderer/i18n/i18n.test.ts` | ✅ (existing file — MUST add `'add'` to the `NAMESPACES` const, see Pitfall 5) |
| ADD-16 | `renderTemplate`/defaults relocation to `src/shared/dmTemplate.ts` preserves existing behavior | unit | `npx vitest run src/shared/dmTemplate.test.ts` (new file, or extend wherever `templateChannels.ts`'s existing render tests live today — confirm exact file during planning) | ❌ Wave 0 (new shared module) |
| ADD-16 | `validateDmTemplate` ({links} required, length bound) | unit | `npx vitest run src/renderer/wizard/addValidation.test.ts` (or wherever the validator lands) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsc --build && npx vitest run <touched test files>`
- **Per wave merge:** `npx tsc --build && npx vitest run` (full suite) — remember to delete emitted `.js`/`.d.ts` beside `.ts` sources before running if `tsc --build` was invoked without `--noEmit` (per CLAUDE.md's documented `tsc-noop-pitfall` memory note: root `tsc --noEmit` checks nothing useful for this project; always use `tsc --build`, then clean emitted artifacts).
- **Phase gate:** Full suite green before `/gsd:verify-work`. Two credential-dependent tests elsewhere in the suite need `set -a; . ./.env; set +a` per project convention — not expected to be touched by this phase's renderer-only changes, but do not break them.

### Wave 0 Gaps
- [ ] `src/renderer/groups/modeRules.test.ts` (or wherever `isActionableForMode` lands) — new pure-predicate tests
- [ ] `src/renderer/store/groupsStore.test.ts` — does not exist today; needed to cover `recomputeCheckedForMode`
- [ ] `src/renderer/store/targetStore.test.ts` — does not exist today; needed to cover contact-add dispatch timing
- [ ] `src/renderer/store/addStore.test.ts` — new, mirrors `tagStore.test.ts`'s mocked-client idiom exactly
- [ ] `src/shared/dmTemplate.test.ts` — new shared-module test (or locate/extend wherever `renderTemplate` is tested today — verify during planning whether `templateChannels.test.ts` exists and already covers it, in which case only the import path changes)
- [ ] `src/renderer/wizard/addValidation.test.ts` — new DM-template validator tests
- Framework install: none — Vitest is already installed and configured project-wide.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unchanged — this phase adds no new auth surface; existing auth-gate pattern (`getAuthState().step !== 'authorized'`) already covers the new `ADD_EXPORT_LOG`/`clipboard:writeText` handlers if gated the same way as every other handler in `addChannels.ts` |
| V3 Session Management | no | Unchanged |
| V4 Access Control | yes | `ADD_EXPORT_LOG` and `clipboard:writeText` should follow the SAME auth-gate pattern already used by every handler in `addChannels.ts` (`if (getAuthState().step !== 'authorized') return ...`) — neither handler needs it for correctness (they touch no Telegram data), but consistency with the existing IPC surface's threat model (T-14-18's pattern) argues for gating them anyway so an unauthenticated renderer state can't trigger arbitrary file-save dialogs or clipboard writes |
| V5 Input Validation | yes | `z.object({ text: z.string().max(2000) })` for `clipboard:writeText`'s payload (mirrors `TemplateSetSchema`'s bound pattern); `ADD_EXPORT_LOG` takes no payload (no validation surface) |
| V6 Cryptography | no | Not applicable — no new secrets or crypto in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer-supplied arbitrary save path | Tampering | NOT applicable here — `dialog.showSaveDialog` returns a path chosen by the OS-native dialog under the OS's own file-system permission model; the renderer never supplies or can influence the path directly. This differs from a hypothetical "renderer sends a path string" design, which this phase correctly avoids. |
| Renderer-supplied arbitrary clipboard content (XSS-adjacent) | Tampering | The only caller of `clipboard:writeText` is the Copy button next to a server-issued invite link (`AddGroupOutcome.link`, main-sourced per T-14-01's boundary) — bound the Zod schema to a reasonable max length (2000 chars is generous for a Telegram invite link) so even a compromised renderer can't use this as a large-payload clipboard-stuffing vector |
| `add-job.json`/`add-log.txt` path disclosure via export flow | Information Disclosure | The export handler reads `add-log.txt` (already 0o600, already audited T-14-05) and writes a COPY to a user-chosen location outside `userData` — this is an intentional, user-initiated data flow (the whole point of ADD-14), not a leak; the user explicitly chose both the action and the destination via the native save dialog |
| Mode-switch state used to bypass the deleted/bot confirm-disable guard (D-16) | Elevation of Privilege | The confirm-button disable in `ReviewScreen` (checking `target.deleted`/`target.bot`) is a UI-layer convenience only — Phase 14 D-05's executor-side guard (`ADD_TARGET_INVALID` for every group, zero API traffic) is the actual security boundary and cannot be bypassed by any renderer-side state manipulation, since `AddExecutor` reads identity from `resolver.getResolvedUser()` exclusively, never from IPC payload. Confirm in code review that this phase's ReviewScreen guard is UX-only and does not become the primary defense. |

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `.planning/phases/15-renderer-add-mode-contacts-template-reporting/15-CONTEXT.md` — all D-01..D-22 decisions
- `.planning/phases/14-addexecutor-dispatch-privacy-fallback-audit/14-CONTEXT.md` + `14-SECURITY.md` — shipped engine contract, threat register (T-14-01..T-14-20, all closed)
- `src/shared/addTypes.ts`, `src/shared/groupTypes.ts` — exact type shapes for `AddState`, `AddGroupOutcome`, `AddJobFile(Safe)`, `AdminDialogDTO.canAdd`/`addGreyReason`
- `src/preload/index.ts` — full shipped Add bridge surface (`startAdd`..`setDmTemplate`)
- `src/main/ipc/addChannels.ts`, `src/main/ipc/templateChannels.ts` — shipped handler patterns, security gate chains, `renderTemplate`/defaults current location
- `src/main/storage/addLogStore.ts` — confirmed no exported path accessor exists (Pitfall 7)
- `src/main/index.ts` — exact wiring location for `registerAddChannels`/`registerTemplateChannels`, confirmed `app.getPath`/`BrowserWindow` availability
- `src/renderer/shell/AppShell.tsx`, `src/renderer/groups/GroupsPane.tsx`, `src/renderer/groups/GroupRow.tsx`, `src/renderer/wizard/ReviewScreen.tsx`, `src/renderer/wizard/StepIndicator.tsx`, `src/renderer/wizard/wizardStage.ts`, `src/renderer/wizard/tagValidation.ts`, `src/renderer/store/{tagStore,removalStore,targetStore,groupsStore}.ts`, `src/renderer/removal/{TagResumeJobDialog,ResumeJobDialog}.tsx`, `src/renderer/target/TargetCard.tsx`, `src/renderer/shell/SettingsMenu.tsx`, `src/renderer/ipc/{tagClient,removalClient}.ts` — every pattern cited in Architecture Patterns/Pitfalls read directly, line numbers approximate but verified against current file content
- `src/renderer/i18n/index.ts`, `src/renderer/i18n/i18next.d.ts`, `src/renderer/i18n/i18n.test.ts`, `src/renderer/i18n/locales/{en,cs}/{tag,groups,wizard}.json` — namespace registration pattern, hardcoded `NAMESPACES` array (Pitfall 5), existing Add-grey-reason Czech strings already shipped
- `src/renderer/wizard/reviewScreen.test.ts`, `src/renderer/store/tagStore.test.ts`, `src/renderer/wizard/wizardStage.test.ts` — exact test idioms (no-jsdom pure-function tests, `vi.mock` client-mocking pattern)
- `vitest.config.ts` — confirmed `environment: 'node'`, no jsdom
- `package.json` — confirmed Electron 37.10.3, no new dependencies needed, `test`/`typecheck` script shapes
- `ls src/renderer/components/ui/` — confirmed no `textarea.tsx`, no `toggle-group.tsx` exist
- `grep -rn "setPermissionRequestHandler\|clipboard"` across `src/main/` — confirmed no permission handler and no prior clipboard usage exist

### Secondary (MEDIUM confidence — web-verified against current Electron/Chromium documentation)
- [Electron `dialog` module docs](https://www.electronjs.org/docs/latest/api/dialog) — `showSaveDialog(window, options)` return shape `{ canceled, filePath }`
- [Electron `clipboard` module docs](https://www.electronjs.org/docs/latest/api/clipboard) — synchronous main-process API, no permission gate
- [Electron Security tutorial](https://www.electronjs.org/docs/latest/tutorial/security) — context isolation defaults since Electron 12
- WebSearch synthesis on `navigator.clipboard.writeText()` + Electron `contextIsolation` — confirms the async Clipboard API is gated by `setPermissionRequestHandler`/`setPermissionCheckHandler`, denies silently when unhandled (cross-referenced against a real-world Electron app bug report, [kirodotdev/KiroCrew#11787](https://github.com/kirodotdev/KiroCrew/issues/11787), and the corresponding fix PR [kirodotdev/KiroCrew#12057](https://github.com/kirodotdev/KiroCrew/pull/12057))

### Tertiary (LOW confidence)
- None — every claim in this document traces to either a direct codebase read or a cited official-docs/cross-referenced source above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every API cited is either already in use in this codebase or confirmed via official Electron docs for the exact installed version (37.10.3)
- Architecture: HIGH — every pattern/pitfall in this document was derived from reading the actual current implementation of the files it modifies, not from general React/Electron knowledge
- Pitfalls: MEDIUM-HIGH — the clipboard permission-gate finding (Pitfall 1) is cross-referenced against official docs and a real-world bug report but not empirically reproduced in THIS app's exact packaged build; flagged as Assumption A1/A3 accordingly

**Research date:** 2026-10-04
**Valid until:** Stable for the lifetime of this phase's planning/execution window — the codebase facts cited (file contents, store shapes, test config) do not go stale on a calendar basis, but WILL go stale the moment any of the cited files are modified by a concurrent change. Re-verify file contents if planning is delayed more than a few days past this research date.
