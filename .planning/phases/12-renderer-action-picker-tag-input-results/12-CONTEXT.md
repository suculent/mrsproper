# Phase 12: Renderer — Action Picker, Tag Input & Results - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the renderer UI for the Tag action, completing the member-tag feature end-to-end. The user
can choose "Tag" (alongside Kick/Ban) on the review screen, enter a tag string with live validation,
confirm against the target identity + selected group list, watch live per-group progress (with
FLOOD_WAIT countdown), and read a per-group outcome report — **without touching the existing
Kick/Ban flow**. Wires the renderer to the Phase 10 `tagClient`/IPC and the Phase 11 `TagExecutor`
via a new `tagStore` (subscribes to `onTagState`).

Delivers **TAG-01** (choose Tag + enter one tag string) and **TAG-06** (live progress + per-group
report reusing the removal flow UI).

Does NOT change the executor (Phase 11), the IPC/types (Phase 10), or the existing removal flow.
</domain>

<decisions>
## Implementation Decisions

### Action picker & tag input validation
- **Action picker:** extend the existing Kick/Ban segmented control in `ReviewScreen.tsx` to a
  **3-way Kick / Ban / Tag** control (reuse the same segmented-control component + a11y pattern).
- **Tag input:** a text input **conditionally revealed below the picker** when Tag is selected,
  with a **live character counter**.
- **Max-length limit:** cap at **16 characters** (Telegram's known custom-title limit — the member
  tag IS the `rank`/custom-title field) via a single shared constant. The input rejects strings
  past the cap with an inline error. This is PROVISIONAL — the real limit was never measured live
  (STATE blocker); it remains a UAT/manual-confirmation item. Use a shared constant so it can be
  retuned in one place.
- **Charset policy:** permissive — accept any non-empty trimmed string up to the cap; **reject only
  control characters / newlines** with an inline error. True server-side rejects fall through to the
  `UNKNOWN` per-group failure (Phase 11 classifier), so the UI need not over-restrict.

### Confirmation, progress, results & wiring
- **Confirmation:** extend `ReviewScreen` so that when action=Tag it shows the **tag string
  prominently**, reuses the `TargetCard` identity block (avatar + name + username + ID) and the
  exact selected-group list, and a single confirm button labeled for Tag. The user must explicitly
  confirm before any write (SAF gate parity with removal).
- **Live progress + results:** **mirror the removal run/report stages**, driven by a new
  `src/renderer/store/tagStore.ts` that subscribes to `onTagState`. Progress shows per-group state,
  `currentGroupId`, processed/total, and a **FLOOD_WAIT countdown** when the governor is waiting.
  The results report maps every outcome: `done`; `skipped` with a human label
  (`TAG_TARGET_IS_ADMIN` → "already admin", `TAG_UNSUPPORTED_BASIC_GROUP` → "basic group");
  `failed` with its error code; and distinguishes a **`hard-stopped`** run from a **`complete`** one.
- **State isolation (Kick/Ban must stay unaffected):** removal flow keeps using `removalStore`
  unchanged. Tag uses the separate `tagStore`. **Switching the action picker away from Tag clears
  the tag input value** (no stale carry-over). The wizard run/report stages route by the active
  action.
- **i18n:** add a new **`tag` i18n namespace** mirroring `removal.json` for both `en` and `cs`
  (formal Czech vykání + 3-form plurals, consistent with Phase 8).
- **Tag-job resume:** reuse the `ResumeJobDialog` pattern for an **independent** tag-job resume
  prompt (Phase 10 built independent `tag-job.json` launch detection + `getTagJob`/`discardTagJob`).

### Claude's Discretion
- Exact component decomposition (new `TagInput` component vs inline in ReviewScreen), the precise
  layout/spacing, and whether the tag run/report reuse the removal components directly or via a
  shared abstraction are at Claude's discretion — follow the closest removal analog and the UI-SPEC
  produced for this phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets / Analogs
- `src/renderer/wizard/ReviewScreen.tsx` — the Kick/Ban segmented control + identity + group list +
  single confirm; extend to 3-way + tag input + tag confirmation.
- `src/renderer/store/removalStore.ts` — store pattern (subscribe to `onRemovalState`, `startRemoval`,
  `pendingJob`); mirror as `tagStore.ts` (subscribe to `onTagState`, `startTag`, tag `pendingJob`).
- `src/renderer/ipc/tagClient.ts` — Phase 10 renderer IPC client (`startTag`, `abortTag`,
  `getTagState`, `onTagState`, `getTagJob`, `discardTagJob`).
- `src/renderer/shell/AppShell.tsx` — wizard stage machine (target→groups→review→run→report) +
  auto-advance on terminal states + ResumeJobDialog wiring; generalize run/report to the active action.
- `src/renderer/wizard/wizardStage.ts` — pure stage transition table (review→run→report); add tag
  terminal handling (or reuse the existing run→report transitions).
- `src/renderer/removal/ResumeJobDialog.tsx` — resume/discard dialog to mirror for tag jobs.
- `src/renderer/i18n/locales/{en,cs}/removal.json` — i18n namespace to mirror as `tag.json`.

### Established Patterns
- Stage is explicit in AppShell, never fully derived from store (RESEARCH Pitfall 2).
- Stores are module-level singletons exposing `use*Store()` hooks + an `actions` object.
- Renderer receives display fields only — never `targetAccessHash` (Phase 10 `TagJobFileSafe`).
- All UI strings externalized via i18next; Day/Night theme + en/cs language switcher (Phase 8).

### Integration Points
- `tagStore` ↔ `tagClient` (`onTagState`, `startTag`, `abortTag`, `getTagJob`, `discardTagJob`).
- `ReviewScreen` action picker → `tagActions.startTag(tag, dialogIds)` when action=Tag.
- AppShell run/report stages + ResumeJobDialog → tag terminal states + tag `pendingJob`.

</code_context>

<specifics>
## Specific Ideas

- A single shared `TAG_MAX_LENGTH` constant (default 16) drives both the input counter/limit and any
  renderer-side guard, so the provisional cap is retunable in one place.
- Tests mirror the existing renderer tests (`reviewScreen.test.ts`, store tests): action-picker
  switching resets tag input; length/charset validation rejects + shows inline error; results report
  renders each outcome state with the correct label; Kick/Ban path unchanged.

</specifics>

<deferred>
## Deferred Ideas

- Reading back / displaying a member's current tag — out of v1.6 scope (write-only).
- Clearing/removing a tag (set empty) as a distinct action — deferred.
- Per-group different tags — deferred.
- A live probe to measure the true tag max length/charset — not possible in autonomous mode; remains
  a UAT/manual item, the 16-char cap is provisional.

</deferred>

---

*Phase: 12-renderer-action-picker-tag-input-results*
*Context gathered: 2026-06-20 via autonomous smart-discuss*
