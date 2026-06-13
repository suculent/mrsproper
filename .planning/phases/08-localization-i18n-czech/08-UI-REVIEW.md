# Phase 8 — UI Review

**Audited:** 2026-06-13
**Baseline:** 08-UI-SPEC.md (approved design contract, audited against post-fix-cycle code state 069b682..0401d2e)
**Screenshots:** not captured (no dev server on ports 3000/5173/8080 — code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Czech plurals/vykání solid, but Telegram codes are NOT verbatim in rendered error copy (spec rule 2 violated) |
| 2. Visuals | 3/4 | SettingsMenu matches the component contract element-for-element; Day-theme rendering unverifiable without screenshots |
| 3. Color | 3/4 | Menu colors fully spec-compliant; hardcoded `#16A34A` "Signed in" indicator fails AA contrast on the newly activated Day theme |
| 4. Typography | 3/4 | Phase-8 surfaces compliant (text-sm/400+600); app-wide 7 off-contract weight usages persist against the "exactly 2 weights" contract |
| 5. Spacing | 4/4 | All spec values implemented exactly (min-w-[200px], px-3 py-2 rows, my-1 separators); no new arbitrary values introduced |
| 6. Experience Design | 3/4 | Pre-mount init eliminates FOUI/theme flash with triple-fallback bootstrap; stale theme checkmark possible when OS theme flips in system mode |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **Telegram error codes omitted from rendered error copy** — Spec Copywriting Contract rule 2 requires codes "always parenthesized verbatim" inside translated sentences (example: "Telegram asked us to wait (FLOOD_WAIT)."). Users cannot quote the code when seeking support. — Append the parenthesized code to `floodWaitSubline`, `floodWaitSubtext`, `floodSubline` (FLOOD_WAIT) and `peerFloodBanner` (PEER_FLOOD) in all four affected en/cs JSON files (`removal.json`, `target.json`).
2. **Hardcoded `#16A34A` fails AA contrast on Day theme** — `src/renderer/shell/IdentityDisplay.tsx:70,73` renders the 14px "Signed in" label in green-600 on white (~3.3:1, below the 4.5:1 AA threshold for small text). Phase 8 activated the light theme without auditing pre-existing hardcoded colors. — Introduce a theme-resolved success token (e.g. `--success: green-700` in `:root`, `green-500` in `.dark`) and replace both `text-[#16A34A]` usages.
3. **Stale theme checkmark in SettingsMenu** — `activeTheme` state (`SettingsMenu.tsx:21-23`) is initialized once from `classList` at mount. In system mode (no stored pref), the main-process `nativeTheme.on('updated')` push (`src/main/index.ts:63`) toggles the `dark` class without updating React state, so the menu can show the checkmark on the wrong theme row. — Derive the active theme from `document.documentElement.classList.contains('dark')` at menu-open time (e.g. recompute when `menuOpen` becomes true) instead of caching at mount.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Passes:**
- Czech 3-form plurals (`_one/_few/_other`) implemented throughout: cs/wizard.json (11 plural groups), cs/removal.json (9), cs/target.json (3), cs/groups.json (1). Forms are grammatically correct, including case agreement ("1 skupina / 2 skupiny / 5 skupin"; genitive "z {{count}} skupiny / skupin").
- Destructive CTAs name action + target + scope per spec: `confirmLabelBan_*` = "Zabanovat {{name}} — {{count}} skupina/skupiny/skupin" — exact match to the Copywriting Contract table. No bare "OK/Potvrdit" anywhere.
- Empty state matches spec verbatim in EN (`en/wizard.json:35`); CS is equivalent with a minor addition ("vraťte se zpět").
- Zero exclamation marks across all six cs JSON files — calm-tone rule honored.
- Language labels self-named ("English"/"Česky" hardcoded in `SettingsMenu.tsx:109,125`, identical in both locales) — per spec.
- Menu copy matches contract exactly: Jazyk / Motiv / Denní / Noční / Odhlásit se / Nastavení (cs/shell.json).

**WARNING — codes not verbatim (spec rule 2):**
- `en/removal.json:32` / cs equivalent: "Telegram asked us to slow down — resuming automatically." — no "(FLOOD_WAIT)". Spec example explicitly includes it.
- `en/target.json:23,39` (`floodWaitSubtext`, `floodSubline`): same omission.
- `en/removal.json:38` (`peerFloodBanner`): no "(PEER_FLOOD)".
- The `errorCode.FLOOD_WAIT` entries (auth/target/groups) use the code as a lookup key only — `PhoneStep.tsx:37`, `CandidateList.tsx:145`, `TargetInput.tsx:138` render the translated sentence without displaying the code itself.

**Minor:**
- Register inconsistency: `cs/wizard.json` `totalsCantBlock_few/_other` use colloquial "nemůžou"; formal vykání register requires "nemohou".
- Gender treatment inconsistent in `cs/removal.json`: `severityLineBan_*` uses "Bude zabanován/a" (slashed) while `severityLineKick_*` uses neuter "Bude odebráno" for the same subject (the target person).
- `src/renderer/components/ui/dialog.tsx:43`: sr-only "Close" is hardcoded English — the only LOC-02 gap found; Czech screen-reader users hear English on every dialog close button.
- Dead keys: `shell.json` `language.en`/`language.cs` exist in both locales but are never referenced (grep: 0 usages) — labels are hardcoded per spec; remove the keys to prevent drift.

### Pillar 2: Visuals (3/4)

- SettingsMenu structure matches the Component Contract element-for-element (`SettingsMenu.tsx:88-192`): section headers `role="presentation"` at `px-3 pt-2 pb-1 text-sm font-semibold text-muted-foreground`; option rows `role="menuitemradio"` with `aria-checked`; `Check h-4 w-4 text-foreground` right-aligned with `w-4` placeholder span on inactive rows (no label shift); `Sun`/`Moon` `h-4 w-4 text-muted-foreground mr-2 aria-hidden`; separators `border-t border-border my-1` with `role="separator"` (exceeds spec); container `role="menu"` with translated `aria-label`.
- Gear button keeps the 44px hit target (`h-11 w-11`, line 69) with translated tooltip + aria-label.
- Finding (minor): language rows have no left icon column while theme rows do, so "English/Česky" sit 24px left of "Day/Night" labels within the same menu — spec-sanctioned, but a slight ragged-left rhythm.
- Limitation: Day-theme visual hierarchy across all seven screens could not be verified without screenshots; score capped at 3 pending visual confirmation (the hardcoded-green defect found via code suggests other Day-theme surprises are plausible).

### Pillar 3: Color (3/4)

- No new color values introduced — Day = pre-existing `:root` tokens (`globals.css:14,30`), Night = `.dark` tokens (`globals.css:63,79`). Verified both palettes match the spec hex values.
- Active-option checkmark uses `text-foreground`, NOT accent (`SettingsMenu.tsx:111,127,156,175`) — protects the 10% accent budget exactly as the spec mandates.
- Hover states per spec: non-destructive rows `hover:bg-secondary`; Log out row retains `text-destructive hover:bg-destructive/10` (line 188).
- Accent (`*-primary`) usage: 14 occurrences app-wide — within the reserved-elements budget.
- No root-level CSS transition in globals.css — the "no 200ms full-tree tween" rule on theme swap is honored.
- **WARNING:** `IdentityDisplay.tsx:70,73` — `text-[#16A34A]` hardcoded twice. Not theme-resolved; on the Day background (#FFFFFF) this 14px label is ~3.3:1 contrast (AA requires 4.5:1). Pre-existing hex, but Phase 8 made the light theme reachable, converting it into a live defect.
- Avatar palette hexes (`CandidateRow.tsx:18-24`, `TargetCard.tsx:32`) are Telegram-standard decorative colors — acceptable in both themes.

### Pillar 4: Typography (3/4)

- Phase-8 surface (SettingsMenu) is fully contract-compliant: headers 14px/600/muted, option rows 14px/400 — identical to the existing Log out row as specified.
- Size distribution app-wide: text-sm (24), text-xs (5), text-base (1), text-lg (1) plus the custom text-body/label/heading roles — text-xs (12px) is outside the declared 4-size scale but pre-dates this phase.
- Weight contract ("exactly 2 weights, 400+600") violated app-wide by 7 usages: `font-medium` x5 (`GroupRow.tsx:273`, `ui/alert.tsx:40`, `ui/command.tsx:27,84`, `ui/input.tsx:12`), `font-bold` x1 (`CodeStep.tsx:139`), `font-normal` x1 (`CountryPicker.tsx:113`). All pre-existing (mostly shadcn primitives), none introduced by Phase 8 — noted as contract debt, not a phase regression.
- Czech text-expansion rule verified: the Review confirm CTA (`ReviewScreen.tsx:305-319`) and GroupsPane run trigger (`GroupsPane.tsx:488-503`) are content-sized buttons in flex containers — no fixed widths, no truncation on translated copy. The only `truncate` usages are on dynamic Telegram data (group titles, usernames) — the permitted exception.

### Pillar 5: Spacing (4/4)

- Menu widened from `min-w-[160px]` to `min-w-[200px]` (`SettingsMenu.tsx:91`) — the exact spec value, the only arbitrary value introduced this phase.
- Row rhythm `px-3 py-2`, headers `px-3 pt-2 pb-1`, separators `my-1`, container `py-1` — all exact spec matches.
- 44px gear hit target retained (sanctioned D-16 exception).
- Pre-existing arbitrary values (max-w-[560px], sm:max-w-[400px], min-h-[56px], ReviewScreen min-h-[2.5rem]) are unchanged from prior approved phases — no Phase 8 spacing regressions found.

### Pillar 6: Experience Design (3/4)

**Passes:**
- Pre-mount init (`main.tsx:10-34`): language + theme fetched via IPC before `createRoot`, i18n awaited, theme class applied before first paint — zero FOUI/theme flash, exactly per Interaction Contract.
- IPC failure resilience: both pref reads `.catch(() => null)` with OS-detection fallback — app never blocks on a pref read (spec state-coverage rule). WR-03 adds a triple-fallback bootstrap including a bilingual plain-text last resort (`main.tsx:38-55`).
- Menu closes on selection (both handlers call `setMenuOpen(false)` first); language switch is optimistic (`i18n.changeLanguage` before IPC); theme toggles classList before IPC — instant feedback per spec.
- Persistence failures caught and logged, never unhandled (WR-02, `SettingsMenu.tsx:35-39,48-52`).
- Explicit theme choice survives OS changes: THEME_SET sets `nativeTheme.themeSource` (`themeChannels.ts:100`) and CR-02 seeds the stored pref before `createWindow` (`main/index.ts:121`) — the `nativeTheme.on('updated')` push can no longer clobber a user choice.
- Confirm CTA retains dispatching spinner + disabled state; destructive confirmation gate (SAF-02) intact and translated.

**WARNINGS:**
- Stale checkmark: `activeTheme` (`SettingsMenu.tsx:21-23`) caches the classList at mount. With no stored pref (system mode), an OS theme flip triggers `syncRendererTheme` which toggles the class but not the React state — the menu then checkmarks the wrong theme row until the user picks one. Recompute from classList when the menu opens.
- Off-contract: spec says selecting the already-active option is "No-op (no persist round-trip needed), menu closes." Both handlers unconditionally run `changeLanguage` + IPC persist even when the option is already active. Harmless, but a deviation — guard with `if (i18n.language === lang) { setMenuOpen(false); return }` and the theme equivalent.

---

## Registry Safety

Registry audit: 0 third-party blocks checked, no flags. `components.json` present (new-york/slate, hand-maintained per Phase 1), UI-SPEC Registry Safety table declares no new shadcn blocks and no third-party registries this phase. `i18next@26.3.1` / `react-i18next@17.0.8` are npm dependencies outside the shadcn vetting gate (pre-audited per RESEARCH.md).

---

## Files Audited

- src/renderer/shell/SettingsMenu.tsx
- src/renderer/shell/IdentityDisplay.tsx
- src/renderer/main.tsx
- src/renderer/i18n/index.ts
- src/renderer/i18n/locales/en/{auth,target,groups,wizard,removal,shell}.json
- src/renderer/i18n/locales/cs/{auth,target,groups,wizard,removal,shell}.json
- src/renderer/wizard/ReviewScreen.tsx
- src/renderer/groups/GroupsPane.tsx, GroupRow.tsx
- src/renderer/target/TargetInput.tsx, CandidateList.tsx, CandidateRow.tsx, TargetCard.tsx
- src/renderer/auth/PhoneStep.tsx, CodeStep.tsx, PasswordStep.tsx, CountryPicker.tsx
- src/renderer/components/ui/dialog.tsx (plus grep sweep of all ui/ primitives)
- src/renderer/styles/globals.css
- src/main/index.ts, src/main/ipc/themeChannels.ts
- Planning: 08-UI-SPEC.md, 08-CONTEXT.md, 08-04-PLAN.md, 08-01…08-09 SUMMARY.md, fix-cycle commits 069b682..0401d2e
