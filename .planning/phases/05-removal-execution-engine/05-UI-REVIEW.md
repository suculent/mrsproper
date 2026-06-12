# Phase 5 — UI Review (Retroactive Audit)

**Audited:** 2026-06-12
**Baseline:** `.planning/phases/05-removal-execution-engine/05-UI-SPEC.md` (approved contract) + inherited Phase 1/4 design system
**Mode:** Code-only audit (no dev-server screenshots — retroactive review of shipped code)
**Scope:** `src/renderer/removal/` (removalCopy.ts, RemovalConfirmDialog.tsx, ResumeJobDialog.tsx), `src/renderer/groups/GroupRow.tsx`, `src/renderer/groups/GroupsPane.tsx`, `src/renderer/target/TargetCard.tsx`

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 9/10 | All contract strings verbatim; aria-label strings hardcoded in components + one plural bug |
| 2. Visual hierarchy | 7/10 | FLOOD_WAIT mid-run subline (spec §Removal Progress Indicator) not implemented at all |
| 3. Color | 8/10 | Accent/destructive/success scoping correct; summary counts line over-bolds labels and separators |
| 4. Typography | 9/10 | 4-size/2-weight contract held by Phase 5 code; `font-mono` vs `.text-mono` stack drift |
| 5. Spacing | 9/10 | Geometry contract met exactly; `gap-0.5` (2px) off the multiples-of-4 scale |
| 6. Registry safety | 10/10 | Zero new wrappers, zero new UI deps, no third-party registries — contract met exactly |

**Overall: 52/60 — PASS with advisory remediation** (Pillar 2 below 8 → remediation required below)

---

## Acknowledged Prior Fixes (verified in code, not re-flagged)

- **Severity-derived confirm aria-label** — `RemovalConfirmDialog.tsx:170` correctly switches "Confirm ban…"/"Confirm removal…" on the `severity` prop.
- **Escape does not discard the job (CR-04)** — `ResumeJobDialog.tsx:52` wires `onOpenChange` to a no-op; the job is only discarded via the explicit "Discard job" button. This is a deliberate, documented deviation from the spec's Keyboard line ("Esc dismisses to the safe outcome") — accepted: for a resumable destructive job there is no unambiguous safe dismissal, so explicit-button-only is the stricter posture.

---

## Detailed Findings

### Pillar 1: Copywriting (9/10)

**Verbatim verification — all PASS.** Every string in `removalCopy.ts` was compared character-for-character against the Copywriting Contract:

- Confirm dialog: `confirmTitle` / `confirmDestructive` / `confirmNeutral` ("Keep them") / `confirmDispatching` ("Starting…") / `severityLine` — both ban and kick variants exact (removalCopy.ts:42–61). Ellipsis discipline correct: run-trigger has `…` (line 66), confirm destructive does not (line 48).
- Row statuses: all six exact, including the CONTEXT-locked "Removed — rejoin can't be blocked in basic groups" (line 114) and "Skipped — removal stopped" (line 116).
- Progress/run states: `progressLabel`, `floodWaitSubline`, `summaryStopped`, `summaryFailed` (with correct {them/it} inflection, line 131), `summaryTimestamp` (Intl short time, line 139), `peerFloodBanner` (line 104) — all exact.
- `summaryLine` correctly omits zero-count categories (lines 121–128).
- `RMV_ERROR_COPY` (lines 14–21): all four contracted failure classes verbatim; the two extra typed codes (`RMV_USER_INVALID`, `RMV_CHANNEL_PRIVATE`) reuse contracted class copy — no raw RPC codes can reach the user. `GroupRow.tsx:226` falls back to `UNKNOWN` for unmapped codes — good defensive posture.
- **Severity-keyed variants confirmed** — Phase 6 flips a parameter, not strings (contract requirement met).

**Findings:**

- **WARNING — hardcoded aria-label strings in components.** The contract says "No hardcoded strings in components." Screen-reader strings are user-facing and live inline: `GroupsPane.tsx:285` ("Stop the removal run"), `GroupsPane.tsx:450` (run-trigger aria-label with inline plural logic), `GroupRow.tsx:234` ("Retry removal for {title}"), `RemovalConfirmDialog.tsx:170`, `ResumeJobDialog.tsx:81` ("Resume removal job"). They match the Accessibility Contract's specified strings verbatim, but the i18n sweep (ROADMAP Phase 8) will have to hunt them down across five files instead of one module.
- **WARNING — plural bug in aria-label.** `RemovalConfirmDialog.tsx:170` hardcodes "groups": with one checked group a screen reader announces "Confirm ban from 1 groups". The visible label pluralizes correctly via `s(n)`; the aria-label does not.

### Pillar 2: Visual hierarchy (7/10)

**PASS items:**

- **Row geometry untouched** — `GroupRow.tsx:256` keeps `min-h-[56px] px-4 py-3 … gap-3`; avatar `h-9 w-9` (line 264). Removal status renders inside the existing 16px checkbox slot (all icons `h-4 w-4 shrink-0`, lines 126–148) and the existing subline column — zero layout shift between scan and removal modes, exactly as contracted.
- **Slot ownership enforced** — `renderProgressSlot` (GroupsPane.tsx:262–397) gives the scan-progress slot to exactly one owner: removal progress (running/stopping) > PEER_FLOOD banner (hard-stopped) > summary band (complete/stopped) > scan progress (only when `removal.step === 'idle'`, line 375). The spec's four-way ownership rule is implemented faithfully.
- **Destructive discipline held** — red appears only on: run-trigger (GroupsPane.tsx:447), confirm primary (RemovalConfirmDialog.tsx:167), resume buttons (ResumeJobDialog.tsx:79, GroupsPane.tsx:322), failed icon + reason text (GroupRow.tsx:141, 229), PEER_FLOOD banner (GroupsPane.tsx:312). Skipped and queued are muted/neutral, never red (GroupRow.tsx:147–151, 155–159).
- **Sequential visibility** — exactly one `removing` row via `currentGroupId` (GroupsPane.tsx:190); PEER_FLOOD unprocessed rows revert to `queued`, not `skipped` (GroupsPane.tsx:194–195 returns 'queued' for hard-stopped rows without outcomes) — matches the spec's resumability semantics.
- **Run-trigger lifecycle** — visible only at scan complete + ≥1 checked + idle; disabled (not hidden) with `aria-disabled` while stopping (GroupsPane.tsx:444–465). Never executes directly — opens the confirm dialog.
- **Checklist lock** — checkbox toggles and scan-retry no-op'd during a run (GroupsPane.tsx:491–492); refresh disabled with "Removal in progress" tooltip (line 436–438); sort toggle stays enabled (visual-only, per contract).
- **Target change refusal** — `TargetCard.tsx:76, 227–241`: Change target disabled while running/stopping with the contracted "Stop the removal first" tooltip.

**Findings:**

- **BLOCKER (contract element missing) — FLOOD_WAIT mid-run subline is not implemented.** Spec §Removal Progress Indicator requires: *"a muted subline under the label — 'Telegram asked us to slow down — resuming automatically.' with the existing monospace FloodCountdown when the governor reports a wait."* The copy exists (`removalCopy.ts:86`) but is dead code: no component renders it, `FloodCountdown` is not imported anywhere in removal/groups code (verified by grep — only auth/ and TargetInput use it), and `removalStore.ts` exposes no governor-wait field for the renderer to react to. During a long FLOOD_WAIT mid-run, the progress bar silently freezes with no explanation — the exact UX the contract line exists to prevent. This is a plumbing gap (engine → store → UI), not just a render gap.
- **Note (acceptable):** run-trigger is hidden after a run reaches complete/stopped (only `idle` shows it, GroupsPane.tsx:445). The spec's "no run active" wording is ambiguous here; hiding it preserves the report state and is the safer reading. No action needed.

### Pillar 3: Color (8/10)

**PASS items:**

- **Accent uses match the enumerated reserved-for list exactly:** progress bar fill `bg-primary` on the `h-1` track (GroupsPane.tsx:297–301), "retry removal" inline link `text-primary underline-offset-2 hover:underline` (GroupRow.tsx:233) — Phase 4 retry precedent matched. No other new accent uses found.
- **Success green scoped correctly** — `text-success` appears only on the done/already-gone `Check` icons (GroupRow.tsx:134). Subline text stays muted as contracted.
- **Explicitly-NOT-accent list respected** — run-trigger/confirm/resume are destructive red; Stop removal is ghost + `text-muted-foreground hover:text-foreground` (GroupsPane.tsx:282); summary band has no accent.
- **PEER_FLOOD banner** — `variant="destructive" className="bg-destructive/10 border-destructive/30"` with `AlertTriangle h-4 w-4`, `role="alert" aria-live="assertive"` (GroupsPane.tsx:311–317) — exact contract treatment.

**Findings:**

- **WARNING — summary counts line over-bolds.** Spec: numbers `text-foreground font-semibold`, labels and `·` separators `text-muted-foreground`. Implementation (GroupsPane.tsx:351) wraps the entire line in `text-label text-foreground font-semibold` because `summaryLine` (removalCopy.ts:121) returns a single flat string. The band reads heavier than contracted and the number/label hierarchy is lost. Fix: have the copy function return structured parts (`{label, count}[]`) and compose spans in the renderer.
- **Note (out of phase):** `TargetCard.tsx:128–129` uses the literal `text-[#16A34A]` instead of the `--success` token — Phase 3 debt, not introduced by Phase 5; flagged for a future cleanup pass.

### Pillar 4: Typography (9/10)

**PASS items:**

- Dialog titles `text-heading` (RemovalConfirmDialog.tsx:121, ResumeJobDialog.tsx:59); descriptions/severity line `text-body text-muted-foreground` (RemovalConfirmDialog.tsx:150); banner body `text-body` (GroupsPane.tsx:318) — matches the role table.
- All sublines, progress label, summary band, stop button, retry link use `text-label` — Label-size discipline held throughout (GroupRow.tsx:201–248, GroupsPane.tsx:276–369).
- Mono on identity: `@username · ID {id}` in the confirm dialog uses `font-mono` at `text-label text-muted-foreground` (RemovalConfirmDialog.tsx:138) — contract met.
- No new sizes or weights introduced by Phase 5 code. Confirm-dialog avatar fallback `text-sm font-semibold` (14px/600) stays inside the 4-size/2-weight envelope.

**Findings:**

- **WARNING — two monospace mechanisms in the repo.** globals.css defines `.text-mono` with the spec's exact stack (`ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace`, globals.css:141–143), but RemovalConfirmDialog (and the Phase 3 TargetCard precedent) use Tailwind's default `font-mono`, whose stack differs (`SFMono-Regular, Menlo, Monaco, Consolas…`). Visually near-identical on macOS, divergent on Windows. Fix: alias `fontFamily.mono` in tailwind.config to the `.text-mono` stack, or use `.text-mono` consistently.
- **Note (inherited, not scored against Phase 5):** GroupRow.tsx:274 uses `font-medium` (500) on the group name — a third weight, violating the 2-weight contract. Shipped in Phase 4; Phase 5 did not touch that line.

### Pillar 5: Spacing (9/10)

**PASS items:**

- Both dialogs `sm:max-w-[400px]` (RemovalConfirmDialog.tsx:116, ResumeJobDialog.tsx:54) — LogoutDialog match.
- Identity block: avatar `h-9 w-9` (36px) + `gap-2` (8px sm) to the text stack (RemovalConfirmDialog.tsx:127–128) — exact contract.
- Footers `flex-row justify-end gap-2` (8px) in both dialogs (RemovalConfirmDialog.tsx:154, ResumeJobDialog.tsx:67).
- Progress/summary/banner slot: `px-4 py-2 shrink-0` (GroupsPane.tsx:274, 310, 344) — same slot, same padding as the Phase 4 scan progress.
- Row geometry untouched: `min-h-[56px] px-4 py-3 gap-3`, 36px avatar (GroupRow.tsx:256, 264).

**Findings:**

- **WARNING — off-scale spacing token.** Summary band uses `gap-0.5` (2px) between its lines (GroupsPane.tsx:344). The inherited scale is "multiples of 4 only"; should be `gap-1` (4px xs).
- **Note (minor):** the Stopping spinner is `h-3 w-3` (12px, GroupsPane.tsx:289) vs the `h-4 w-4` icon norm used everywhere else in this phase. The spec doesn't size this spinner, but consistency favors `h-4 w-4` inside a `size="sm"` button (the dispatch spinner in the confirm dialog uses `h-4 w-4`, RemovalConfirmDialog.tsx:174).

### Pillar 6: Registry safety (10/10)

- Contract: no new shadcn wrappers, no new npm UI dependencies, no third-party registries.
- Verified: all UI imports across the five audited files resolve to pre-existing in-repo wrappers (`dialog`, `button`, `avatar`, `alert`, `checkbox`, `badge`, `input`, `scroll-area`, `tooltip`) plus `lucide-react` icons already established project-wide. No `npx shadcn add` artifacts, no new registry entries in components.json.
- Registry audit: 0 third-party blocks, no flags.

---

## Remediation (advisory — Pillar 2 scored below 8)

1. **Wire the FLOOD_WAIT mid-run subline (Pillar 2 blocker).** Plumb the governor's reported wait through `removalChannels` → `removalStore` (e.g. `floodWaitRemaining: number | null` on the running state), then render in the removal-progress block of `GroupsPane.renderProgressSlot`: `removalCopy.floodWaitSubline` as `text-label text-muted-foreground` with the existing `FloodCountdown` (already imported pattern at `TargetInput.tsx:399`). Bar holds its width; no error styling — Phase 4.1 precedent.
2. **Restructure the summary counts line (Pillar 3).** Change `removalCopy.summaryLine` to return `Array<{label: string; count: number}>` and compose in GroupsPane: counts `font-semibold text-foreground`, labels and `·` separators `text-muted-foreground`.
3. **Small fixes batch:** (a) pluralize the confirm aria-label at `RemovalConfirmDialog.tsx:170` using the same `s(n)` helper; (b) `gap-0.5` → `gap-1` at `GroupsPane.tsx:344`; (c) move aria-label strings into `removalCopy.ts` (Phase 8 i18n sweep will otherwise miss them); (d) unify `font-mono` with the `.text-mono` stack via tailwind.config.

---

## Files Audited

- `src/renderer/removal/removalCopy.ts`
- `src/renderer/removal/RemovalConfirmDialog.tsx`
- `src/renderer/removal/ResumeJobDialog.tsx`
- `src/renderer/groups/GroupRow.tsx`
- `src/renderer/groups/GroupsPane.tsx`
- `src/renderer/target/TargetCard.tsx`
- `src/renderer/store/removalStore.ts` (flood-wait state check)
- `src/shared/removalTypes.ts` (error-code coverage check)
- `src/renderer/styles/globals.css` (token verification)

*Audited against: 05-UI-SPEC.md (approved 2026-06-12), 04-UI-SPEC.md (inherited system)*
