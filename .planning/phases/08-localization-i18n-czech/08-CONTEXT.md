# Phase 8: Localization — i18n & Czech Translation (v1.5) - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can switch the app language via a `Language` settings row with `English` and `Česky` options, with every UI string externalized through an i18n framework and fully translated to Czech. Ships as v1.5. Scope: renderer-only i18n (main process emits typed error codes only), migration of all six existing `*Copy.ts` modules into the i18n layer, complete Czech translation, persisted language preference, plus the Day/Night theme toggle (pending todo explicitly tied to Phase 8) added to the same SettingsMenu rework.

Out of scope: translating native/OS-level surfaces (window `<title>`, OS dialogs, Gatekeeper prompts), translating dynamic Telegram data (group names, usernames, raw error strings), main-process i18n.

</domain>

<decisions>
## Implementation Decisions

### i18n Framework & Migration Architecture
- Framework: **i18next + react-i18next** — React standard, Czech plural support (1 / 2–4 / 5+ via Intl.PluralRules), live language switching, fully offline (no CDN — Phase 1 offline constraint)
- Resources: **JSON files per locale, namespaced per feature** (`en/wizard.json`, `cs/wizard.json`, …) mirroring the existing copy-module split: auth, target, groups, wizard, removal, shell
- Pluralization: **i18next plural forms** (`_one`/`_few`/`_other`) — Czech needs 3 forms ("1 skupina / 2 skupiny / 5 skupin"); replaces the English-only `s()` helper in wizardCopy.ts
- Migration: **Replace `*Copy.ts` modules with `t()` keys and delete the modules after migration** — keys mirror existing structure (e.g. `wizard.reviewTitle`), components call `useTranslation()`

### Language Switcher UX (Settings)
- Placement: **`Language` row in the existing SettingsMenu dropdown** with `English` / `Česky` options inline below it (menu currently has only "Log out")
- Behavior: **Instant switch, no restart** — react-i18next re-renders the tree live (satisfies success criterion 1)
- First-launch default: **Detect OS locale — `cs` → Czech, otherwise English**; explicit user choice always overrides detection afterward
- Indicator: **Checkmark next to the active language option**

### Persistence & Process Boundaries
- Storage: **electron-store in main via IPC** (`LANGUAGE_GET`/`LANGUAGE_SET`), Zod `z.enum(['en','cs'])` validated — exact clone of the proven `severityChannels.ts` pattern (non-secret pref, plain JSON in userData, not safeStorage)
- Main process: **No i18n in main** — main emits typed error codes only (existing classifier pattern); verified no native menus/dialogs exist in main
- Load timing: **Fetch stored language via IPC before React mounts**, init i18next with it — no flash of wrong language (same pre-mount pattern as severity)
- Native bits: **Untouched** — window `<title>` ("Mrs. Proper" is a product name), OS dialogs stay as-is; only in-app UI translates

### Czech Translation Scope & Quality
- Register: **Formal vykání** ("Potvrďte odebrání…") — standard for admin/desktop tooling in Czech
- Dynamic Telegram data: **Never translated** — group names, usernames, target identity, raw Telegram error strings (e.g. `FLOOD_WAIT`) stay verbatim; only surrounding UI copy translates
- Terminology: **Natural Czech action verbs** — Kick → „Vyhodit", Ban → „Zabanovat", Log out → „Odhlásit se"; technical codes like FLOOD_WAIT kept verbatim with translated explanation
- Theme toggle: **Day/Night theme toggle included in this phase** — pending todo (2026-06-12) explicitly says "resolves with Phase 8"; add a theme row to the same SettingsMenu being reworked, with a new Day (light) theme

### Claude's Discretion
- Exact i18next configuration details (namespace lazy-loading vs eager bundle, interpolation escaping with React)
- Key naming conventions within namespaces (mirror existing copy-module property names where practical)
- Theme toggle implementation details (CSS variable strategy, persistence — follow the same electron-store IPC pattern as language/severity)
- Whether the two CountryPicker pending todos (clickable rows, default Czechia) fold in — they are separate UI todos, include only if trivially adjacent

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Six copy modules to migrate: `src/renderer/auth/errorCopy.ts`, `src/renderer/target/resolveCopy.ts`, `src/renderer/target/searchCopy.ts`, `src/renderer/groups/groupsCopy.ts`, `src/renderer/wizard/wizardCopy.ts`, `src/renderer/removal/removalCopy.ts` — each exports a typed object of strings and string-producing functions
- `src/renderer/shell/SettingsMenu.tsx` — gear-icon dropdown (custom, not shadcn DropdownMenu) with backdrop-close; currently houses only "Log out"; Language and Theme rows go here
- `src/main/ipc/severityChannels.ts` — the persistence template: electron-store 11.x (ESM-only, dynamic `await import()` lazy singleton), Zod-validated SET payload, GET/SET ipcMain handlers, channels declared in `@shared/channels`
- shadcn-style UI components in `src/renderer/components/ui/` (new-york/slate, manually created)

### Established Patterns
- All user-facing strings already live in copy modules (i18n hygiene maintained since Phase 4 per ROADMAP note) — extraction is mechanical
- Copy consumed as direct property access (`wizardCopy.reviewTitle`) and parameterized functions (`wizardCopy.mechanicNote(d.type, severity)`) — functions become interpolated/plural keys
- electron-store reserved for non-secret prefs; safeStorage reserved for the session credential only (CLAUDE.md)
- Offline constraint: no CDN assets — i18n resources must be bundled
- Type-check gate is `tsc --build` (NOT `tsc --noEmit`, which is a no-op for this project's tsconfig — Phase 5 lesson)
- Tests: vitest with `@renderer` alias for node-env testing of renderer pure functions

### Integration Points
- `src/renderer/main.tsx` — pre-mount async init point (fetch language via IPC, init i18next before ReactDOM render)
- `src/shared/channels.ts` — add LANGUAGE_GET/LANGUAGE_SET (and THEME_*) channel constants
- `src/preload/` — expose language/theme IPC to renderer
- `src/main/index.ts` — register new channel handlers alongside severity registration
- Every component currently importing a `*Copy` module switches to `useTranslation()`

</code_context>

<specifics>
## Specific Ideas

- Success criteria from ROADMAP are the contract: Language row with English/Česky, no hardcoded strings in components, full Czech usability, persistence across launches
- Czech plural example to honor: "1 skupina / 2 skupiny / 5 skupin"
- Day theme is *new* (app is currently dark-only) — the todo asks for a Day/Night toggle with a new Day theme

</specifics>

<deferred>
## Deferred Ideas

- CountryPicker improvements (clickable rows, default Czechia +420) — pending todos, separate from i18n; fold in only if trivially adjacent during SettingsMenu work, otherwise remain quick tasks
- Big Sur 11.7.10 smoke test — explicitly deferred to after Phase 8 (tracked in 07-HUMAN-UAT.md)

</deferred>
