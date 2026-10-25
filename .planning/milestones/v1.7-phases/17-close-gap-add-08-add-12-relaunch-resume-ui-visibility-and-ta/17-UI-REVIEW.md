# Phase 17 — UI Review

**Audited:** 2026-10-25
**Baseline:** 17-UI-SPEC.md (approved 2026-10-24), plus the 15-UI-SPEC.md contract it inherits
**Screenshots:** Not captured. A Vite renderer answered on :5173, but the Playwright CLI is not installed, and the relaunch-resume states need the Electron main process and preload bridge anyway. This is a code-only audit. The user's human UAT passed 3/3, so this review is advisory.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All contract strings are present in en and cs, but the "sending" retry-DM state was dropped, and the lookup-locked hint points at a button that isn't on screen during a running job |
| 2. Visuals | 3/4 | The job card matches the spec block for block. Queued rows in the job view have no status indicator at all, and the lock tooltips can never appear |
| 3. Color | 3/4 | Accent is used only where the spec allows. The reused avatar palette puts white initials on pastel hues with about 2:1 contrast |
| 4. Typography | 3/4 | No new sizes. Status lines in the same stack switch between 600 and 400 weight (new lines use `font-normal`, older siblings don't) |
| 5. Spacing | 3/4 | Every new class is on the 4px scale. Job-view rows jump 28px sideways when they go from queued to adding, because the queued slot renders nothing |
| 6. Experience Design | 3/4 | Good coverage of the in-flight, failed and exit states. In-flight disabling is inconsistent between the two Resume surfaces, a filter with no matches in the job view leaves a blank list, and the disabled-reason tooltips are invisible |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **Disabled-reason tooltips never show (WARNING)**: the mode switch's `modeSwitchLockedAddJobTooltip` and the stopped-band Resume's `resumeLoadingGroups` are set as `title` on a disabled shadcn `Button`. The button base class includes `disabled:pointer-events-none` (`src/renderer/components/ui/button.tsx:7`), so hover never reaches the element. Users get no explanation for the locked switch or the greyed-out Resume. Two of the spec's copy items are effectively dead. **Fix:** wrap each disabled button in a `<span title=… tabIndex={0}>` or the installed shadcn `Tooltip` (`TooltipTrigger asChild` on a wrapping span). For the mode switch, one wrapper on the `role="radiogroup"` div is enough (`ModeSwitch.tsx:31-44`, `GroupsPane.tsx:718-737`).
2. **The two Resume surfaces disable different things while a Resume is in flight (WARNING)**: on the PEER_FLOOD banner, "Add someone else" is disabled during the request (`GroupsPane.tsx:617`). On the stopped band, "Export add log…" and "Add someone else" stay live (`GroupsPane.tsx:738-751`). Clicking "Add someone else" there starts `resetTarget()` while `resumeJobFromDisk()` is still pending, which can leave the UI on the target screen while main starts the job. **Fix:** add `disabled={resumeState === 'inflight'}` to "Add someone else" on the stopped band, and preferably to Export too. Also apply the `groups.step !== 'loaded'` gate to the PEER_FLOOD Resume, as the stopped band does at `:665`.
3. **Queued rows in the job view have no indicator and shift the layout (WARNING)**: `renderCheckboxSlot()` returns `null` for job-view rows that are queued or have no status (`GroupRow.tsx:194`), and the queued subline is also `null` (`:536`). After a Stop on the relaunch view, unprocessed rows look the same as rows outside the run, so the admin can't tell what "Resume adding" will process. When a row goes from queued to adding, the title moves right by 16px (icon) plus 12px (`gap-3`). The spec (§1) says queued rows keep the "disabled checked indicator" and look "identical to an in-session run row". **Fix:** render a fixed-width `h-4 w-4` placeholder for queued job rows, either an empty `<span className="h-4 w-4 shrink-0" />` or a muted `Circle`/`Clock` icon with `aria-label={queued}`. That keeps alignment stable and still meets D-03 ("no checkboxes").

Additional recommendations (WARNING unless noted):

4. **No "sending" feedback for the retry DM**: the spec §6 contract has three states. `retryDmSending` was removed in review fix IN-02. While the DM is in flight, the row shows only the link line, with no spinner or text. **Fix:** keep the transient state renderer-only, for example a `Set<dialogId>` filled when `retryGroup` resolves to privacy-blocked and cleared when `retryDmStatus` arrives, so it never touches the Zod-persisted field.
5. **The lookup-locked hint names a button that isn't there yet**: `target.lookupLockedAddJob` says "Choose 'Add someone else' when you're done", but while the job is running or stopping the band shows only Stop (`GroupsPane.tsx:529-572`). **Fix:** "…locked while this add job is open. Stop or finish the run, then choose 'Add someone else'." Make the same change in cs.
6. **A filter with no matches in the job view gives a blank list**: in the job view, `mode === 'browse'` renders the filter input (`:930`). But `renderEmptyState()` returns `null` for `isJob` (`:308`), so a filter that matches nothing shows an empty scroll area with no "No matches" message. **Fix:** in the `isJob` branch, return the existing `emptyState.noMatches` block when `filter !== '' && displayedDialogs.length === 0`.
7. **The Resume button's accessible name hides both its visible label and its in-flight state**: `aria-label={resumeStoppedAria}` ("Resume the stopped add job") overrides the visible "Resume adding" (this fails WCAG 2.5.3 Label in Name) and the "Starting…" in-flight text (`GroupsPane.tsx:722`). **Fix:** drop the `aria-label` and keep the visible text, or use `aria-label={resumeState === 'inflight' ? confirmDispatching : resumeStoppedAria}` with a name that starts with "Resume adding".
8. **Status lines in one stack use mixed weights**: see Pillar 4.
9. **Avatar initials contrast** (inherited): see Pillar 3.
10. **Minor copy and code nits:** English strings use straight `"Add someone else"` quotes (`en/add.json` resumeFailedBand, `en/target.json` lookupLockedAddJob), while `en/tag.json` uses curly “ ”. A stale `{/* Phone disclosure hint (D-10) */}` comment now sits above the lookup-locked hint (`TargetInput.tsx:~347`).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

Contract strings checked against `src/renderer/i18n/locales/{en,cs}`:

| Key | en | cs | Contract |
|-----|----|----|----------|
| `add.jobCard.kicker` / `note` / `aria` | present | present | match |
| `add.resumeStoppedAria` | present | present | match |
| `add.resumeFailedBand` | present | present (vykání, „…“) | match (checker revision) |
| `add.rowStatus.retryDmSent` / `retryDmRefused` | present | present („osobě {{name}}“) | match |
| `add.rowStatus.retryDmSending` | **absent** | **absent** | **deviation**: removed in review fix IN-02 |
| `groups.modeSwitchLockedAddJobTooltip` | present | present | match, but never visible (Pillar 6) |
| `target.lookupLockedAddJob` | present | present | match, but references an exit that isn't shown during a running job |
| `add.startFailed` (review fix CR-01, not in spec) | present | present | clear: names the problem and two next steps |

- Reused keys are wired as specified: `peerFloodResumeLabel` for both Resume buttons (`GroupsPane.tsx:608,734`), `confirmDispatching` while in flight, `addSomeoneElse` as the exit on hard-stopped, stopped and complete.
- D-01 label source: `addTargetName = add.targetName` (`GroupsPane.tsx:94`) feeds `progressLabel` (`:539`), `dmStatusSent/Refused` (`:700,705`) and the GroupRow retry-DM lines. The confirmed-target `targetName` is no longer read by any Add band string. PASS.
- WARNING: the lookup-locked hint tells the user to choose an exit that the band hides while `running`/`stopping`.
- WARNING: there is no copy for the retry-DM "sending" interval (spec §6 row 1).
- Minor: the English quoted button names use straight quotes. The Czech strings correctly use „…“.
- Minor: a blank `add.targetName` produces the aria-label "Add job for " (`JobTargetCard.tsx:30`). The `User` icon fallback covers this visually, but not for screen readers.

### Pillar 2: Visuals (3/4)

- `JobTargetCard.tsx` matches the spec §3 structure exactly: `section` + aria-label, `max-w-[560px] rounded-lg border bg-card p-6 flex flex-col gap-4`, a 64px avatar with no ring, the kicker / heading / mono ID / note stack, the `User` icon fallback for blank names, and no AvatarImage, badges or footer buttons. PASS.
- Render rule: `showJobCard = addJobActive && target.step !== 'confirmed'` (`AppShell.tsx:113`). It never renders together with `TargetCard`, and `CandidateList` is hidden while the add job is non-idle (`:164`). PASS.
- Focal order on the stopped band: Resume (default, accent), then Export (outline), then Add someone else (outline) (`GroupsPane.tsx:718-751`). PASS.
- The hard-stopped band now has an outline "Add someone else" next to Resume (CR-02). This fixes a dead end in the relaunch view. PASS.
- WARNING: queued job-view rows render no slot content and no subline (`GroupRow.tsx:194,536`). Unprocessed rows after a Stop carry no visual cue (Fix 3).
- WARNING: the locked mode switch and the groups-not-loaded Resume explain themselves only through `title` attributes, which cannot appear on `pointer-events-none` buttons (Fix 1). The only visible explanation of the lock is the lookup hint in the left pane.

### Pillar 3: Color (3/4)

- Accent additions are limited to what the spec declares: the stopped-band Resume (`variant="default"`, `:719`) and the locked active mode segment (`variant="default"` + disabled → `opacity-50`, `ModeSwitch.tsx:66-75`). The job card uses no `ring-primary` and no green kicker. PASS.
- Destructive is text-only: `resumeFailedBand` in `text-destructive` (`:712`) and inheriting the alert color on the PEER_FLOOD banner (`:624`). No new destructive buttons. `retryDmRefused` uses `text-foreground`, not destructive, as the spec requires (`GroupRow.tsx:504`). PASS.
- No new hex values in the phase files. `AVATAR_COLORS` was moved unchanged into `avatarFallback.ts`.
- WARNING (inherited, but now on a new surface): white 16px/600 initials on `#FAA774`, `#7BC862` and `#6EC9CB` have roughly 2.0–2.3:1 contrast, below WCAG AA (4.5:1, or 3:1 for large text). On the job card the initials are the only stand-in for a photo. The initials are `aria-hidden` and the name is repeated as the heading, so the impact is limited. Consider darker variants of these three hues for the fallback, or `text-black/80` on the light hues.
- Light/dark: everything uses CSS-variable classes (`bg-card`, `border`, `text-muted-foreground`). No `dark:` overrides were needed or added. PASS.

### Pillar 4: Typography (3/4)

- Sizes in the new code: `.text-heading` (20/600), `.text-body` (16/400), `.text-label` (14/600 base), plus `text-base font-semibold` for the initials. Weights are only 400 and 600. No arbitrary `text-[…]` in the phase files. PASS against the 4-role / 2-weight contract.
- The job card matches the spec: kicker `text-label` (600), name `text-heading font-semibold truncate`, ID `text-label font-normal font-mono`, note `text-body` (`JobTargetCard.tsx:47-51`).
- WARNING: weights alternate within one stack. In a privacy-blocked row, `linkCreated` is `text-label` (600), the new `retryDmSent/Refused` lines below it are `text-label font-normal` (400), and `premiumHint` below that is back to 600 (`GroupRow.tsx:485-512`). On the stopped band, `summaryStopped`, `dmStatusSent` and `finishedAt` render at 600, and the new `resumeFailedBand` renders at 400 (`GroupsPane.tsx:670-715`). The spec asked for the `font-normal` override on the new lines but not on their siblings, so the result is a visible weight stripe. **Fix:** in one pass, add `font-normal` to the older informational sublines in those two stacks so every secondary line is 400. Keep 600 for counts and headings.

### Pillar 5: Spacing (3/4)

New spacing classes, all on the declared scale:

| Location | Classes | Token |
|----------|---------|-------|
| JobTargetCard | `p-6`, `gap-6`, `gap-4`, `gap-1` | lg, lg, md, xs |
| AppShell slot | `mt-4` | md |
| Hard-stopped band button row | `mt-2 flex gap-2 flex-wrap` | sm |
| Resume-failed line (PEER_FLOOD) | `mt-2` | sm |
| Stopped band group | `flex items-center gap-2` | sm |
| No-groups empty state | `px-4 py-8 gap-1` | md / xl / xs |

- Arbitrary values: only `max-w-[560px]`, copied from `TargetCard` as the spec permits. PASS.
- WARNING: job-view rows have no reserved width for the status slot when queued (`GroupRow.tsx:194`). With the row's `gap-3`, the avatar and title move 28px when a row goes from queued to adding/done. During a running job this makes the list jitter row by row. A fixed `h-4 w-4 shrink-0` placeholder fixes it (Fix 3).
- Minor (pre-existing pattern, repeated here): `Loader2 mr-1` inside a `Button` that already has `gap-2` gives 12px between spinner and text (`GroupsPane.tsx:604,730`). Drop `mr-1` in the new usages.

### Pillar 6: Experience Design (3/4)

State coverage for the new surfaces:

| State | Covered | Evidence |
|-------|---------|----------|
| Relaunch job view: band reachable with no confirmed target | yes | `getPaneView` (`addPaneState.ts`), `renderProgressSlot` gate `mode !== 'checklist' && !isJob` (`GroupsPane.tsx:396`), forced `activeMode` (`:92`) |
| Scan effects suppressed in the job view | yes | effects key on `view === 'browse'` / `'checklist'` only (`:123-136`) |
| Job-only rows in job order | yes | `getJobRows` (`:168`); sort toggle hidden (`:966`) |
| Resume in flight | yes | disabled + `Loader2` + "Starting…" on both surfaces |
| Resume rejected | yes | `resumeFailedBand` with `aria-describedby`; cleared on step/target change (`:109-111`) |
| Resume gated on loaded groups | partial | stopped band yes (`:665`); PEER_FLOOD banner no |
| Finished job never offers Resume | yes | `isJobFinished` on both surfaces (`:579-581`, `:661-664`) |
| Exit from every terminal state | yes | hard-stopped (CR-02), stopped, complete |
| Mode switch / lookup locked | yes | `ModeSwitch disabled … add.step !== 'idle'` (`:961`); `TargetInput locked` disables input, country chip and Find, and guards Enter and paste (`TargetInput.tsx:152,182,221`) |
| Refresh blocked during the job | yes | `disabled={isRunActive \|\| add.step !== 'idle'}` (`:983`) |
| Zero-dialogs Add checklist | yes | `renderNoGroups()` (`:311-313`), `getAddEmptyState → 'no-groups'` |
| Retry-DM sending | **no** | key removed; no transient state |
| Filter with no matches in the job view | **no** | `renderEmptyState` returns null for `isJob` (`:308`) |
| Disabled-reason feedback | **no (effectively)** | `title` on a `pointer-events-none` button |
| Row retry blocked during a Resume | yes | `onRetryAdd` guard (`:1066-1071`) |

- WARNING: in-flight disabling differs between the PEER_FLOOD banner and the stopped band (Fix 2).
- WARNING: job dialog ids missing from the loaded group list are silently dropped (spec-sanctioned). The progress label's "group x of n" can then count past the visible rows with no explanation. Consider a one-line muted note such as "N groups from this job are no longer in your list" when `getJobRows(...).length < add.dialogIds.length`.
- Informational: the main-side `TARGET_RESOLVE`/`CONFIRM` guard stays silent in the renderer as the spec requires. No misleading "Something went wrong" copy was found.

Registry audit: `components.json` is present. UI-SPEC declares no third-party registries, and no new primitive was added. 0 third-party blocks checked, no flags.

---

## Files Audited

- `src/renderer/target/JobTargetCard.tsx`
- `src/renderer/target/avatarFallback.ts`
- `src/renderer/target/TargetInput.tsx`
- `src/renderer/target/TargetCard.tsx` (gating only)
- `src/renderer/groups/ModeSwitch.tsx`
- `src/renderer/groups/GroupsPane.tsx`
- `src/renderer/groups/GroupRow.tsx`
- `src/renderer/groups/addPaneState.ts`
- `src/renderer/shell/AppShell.tsx`
- `src/renderer/store/runActivity.ts`
- `src/renderer/components/ui/button.tsx`, `src/renderer/components/ui/input.tsx`
- `src/renderer/styles/globals.css` (typography utilities)
- `src/renderer/i18n/locales/{en,cs}/{add,groups,target}.json`
- Phase docs: 17-UI-SPEC.md, 17-CONTEXT.md, 17-0[1-8]-SUMMARY.md, 17-REVIEW-FIX.md (+ iter2/iter3), 17-HUMAN-UAT.md
