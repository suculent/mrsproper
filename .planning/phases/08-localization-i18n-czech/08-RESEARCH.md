# Phase 8: Localization — i18n & Czech Translation — Research

**Researched:** 2026-06-13
**Domain:** i18next + react-i18next, Electron nativeTheme, Tailwind dark-class theme toggling, Czech plural forms
**Confidence:** HIGH (framework APIs verified via official docs + Node.js runtime; package metadata verified via npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Framework: **i18next + react-i18next** — React standard, Czech plural support, live language switching, fully offline (no CDN)
- Resources: **JSON files per locale, namespaced per feature** (`en/wizard.json`, `cs/wizard.json`, …) — namespaces: auth, target, groups, wizard, removal, shell
- Pluralization: **i18next plural forms** (`_one`/`_few`/`_other`) for Czech; English uses `_one`/`_other`; replaces the `s()` helper
- Migration: **Replace `*Copy.ts` modules with `t()` keys and delete the modules after migration**
- Language switcher: **`Language` row in the existing SettingsMenu dropdown** with `English` / `Česky`
- Behavior: **Instant switch, no restart** — react-i18next re-renders the tree live
- First-launch default: **Detect OS locale — `cs` → Czech, otherwise English**; explicit choice always overrides
- Active indicator: **Checkmark next to the active language option**
- Storage: **electron-store in main via IPC** (`LANGUAGE_GET`/`LANGUAGE_SET`), Zod `z.enum(['en','cs'])` validated — exact clone of `severityChannels.ts`
- Load timing: **Fetch stored language via IPC before React mounts**, init i18next with it — no flash of wrong language
- Main process: **No i18n in main** — main emits typed error codes only
- Czech register: **Formal vykání** ("Potvrďte odebrání…")
- Dynamic Telegram data: **Never translated** — group names, usernames, target identity, raw Telegram error codes stay verbatim
- Theme toggle: **Day/Night theme toggle included in this phase** — add a theme row to the same SettingsMenu rework with a new Day (light) theme
- Day theme = **existing `:root` light tokens in globals.css** (already defined, currently unreachable)

### Claude's Discretion

- Exact i18next configuration details (namespace lazy-loading vs eager bundle, interpolation escaping with React)
- Key naming conventions within namespaces (mirror existing copy-module property names where practical)
- Theme toggle implementation details (CSS variable strategy, persistence — follow the same electron-store IPC pattern as language/severity)
- Whether the two CountryPicker pending todos fold in

### Deferred Ideas (OUT OF SCOPE)

- CountryPicker improvements (clickable rows, default Czechia +420) — fold in only if trivially adjacent
- Big Sur 11.7.10 smoke test — deferred to after Phase 8
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOC-01 | Settings has a `Language` row with `English` and `Česky` options; preference persists across launches | electron-store IPC pattern (severityChannels.ts clone), SettingsMenu.tsx rework, pre-mount language fetch |
| LOC-02 | All user-facing strings are externalized through an i18n layer (no hardcoded strings in components) | Six copy modules + direct component strings inventoried below; all route through `t()` after migration |
| LOC-03 | Complete Czech translation of the app | Czech plural forms verified via `Intl.PluralRules('cs')`; copy module inventory produces the key catalog |
</phase_requirements>

---

## Summary

Phase 8 is a migration + translation phase, not a greenfield build. The work has three interlocking streams: (1) wire i18next/react-i18next as an offline-bundled renderer-only layer initialized before React mounts, (2) migrate six existing `*Copy.ts` modules and all component-level hardcoded strings into JSON translation files, and (3) write the complete Czech (`cs`) translations.

The theme toggle is a fourth parallel stream: Day/Night uses the already-defined `:root` light tokens in `globals.css` (the existing design system has them). The main process currently owns theme via `nativeTheme` and `executeJavaScript`. The locked design requires the user's explicit choice to permanently override `nativeTheme`, which means the existing `nativeTheme.on('updated', syncRendererTheme)` listener must become conditional on whether a user pref exists.

The highest-risk item is the i18next pre-mount init pattern: `src/renderer/main.tsx` currently mounts React synchronously. Phase 8 requires it to await two IPC calls (language + theme) and an `i18n.init()` before calling `ReactDOM.createRoot`. This is a well-documented pattern but must avoid a 100ms-visible flash of wrong language/theme.

**Primary recommendation:** Use `i18next` with static `resources` object (all JSON bundled via Vite static import — no `i18next-http-backend`), `initReactI18next` plugin, `useSuspense: false`, and `await i18n.init()` before `ReactDOM.createRoot`. Six namespaces, eager-loaded. Theme toggle uses `nativeTheme.themeSource` on the main side plus `classList.toggle('dark')` on the renderer side, persisted via an electron-store IPC pair cloning the severity pattern.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 8 |
|-----------|-------------------|
| Offline constraint — no CDN assets | i18n resources MUST be bundled statically; `i18next-http-backend` is forbidden; use inline `resources` object |
| `tsc --build` is the type-check gate | All new code must pass `tsc --build` (not `tsc --noEmit`); i18next typed keys via `i18next.d.ts` optional but beneficial |
| `electron-store` for non-secret prefs, `safeStorage` for session only | Language + theme prefs → electron-store IPC (not safeStorage) |
| `safeStorage` for session credential only | Language/theme are plain JSON in userData, not encrypted |
| Zod validation on IPC SET payloads | `LANGUAGE_SET` payload must be `z.enum(['en','cs'])`; `THEME_SET` payload must be `z.enum(['light','dark','system'])` or similar |
| `tsc --noEmit` is a no-op for this project | Never use `tsc --noEmit` in verify blocks |
| Electron 37.10.3 pinned (Big Sur constraint) | No Electron API used in Phase 8 is newer than 37.x |
| GSD Workflow Enforcement | Changes go through GSD execute-phase, not direct edits |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| i18n initialization (language resource load) | Renderer (pre-mount) | — | i18n is renderer-only; main emits typed codes, never translated strings |
| Language preference persistence | Main (electron-store via IPC) | Renderer reads/writes via IPC | electron-store only available in main; renderer cannot directly access it |
| Theme preference persistence | Main (electron-store via IPC) | Renderer reads/writes via IPC | Same as language — main owns electron-store |
| nativeTheme follow/override logic | Main | — | `nativeTheme` object is main-process-only; Electron API |
| `dark` class toggle on `<html>` | Renderer | Main pushes initial via executeJavaScript | CSS class manipulation is a renderer DOM operation |
| Translation key resolution (`t()`) | Renderer (every component) | — | react-i18next is a renderer library; main never calls `t()` |
| Language switcher UI (SettingsMenu) | Renderer | — | UI is renderer-only |
| JSON translation files (bundled) | Build (Vite static import) | — | Offline constraint — bundled at build time, not fetched at runtime |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `i18next` | 26.3.1 (verified) | i18n engine — resource management, plural rules, interpolation | Project's explicit locked choice; React ecosystem standard; created 2012-01-03 (12+ years); MIT |
| `react-i18next` | 17.0.8 (verified) | React bindings — `useTranslation`, `I18nextProvider`, `initReactI18next` | react-i18next requires `i18next >= 26.2.0`; 17.x requires React >= 16.8; MIT; peer dep matches React 19 |

[VERIFIED: npm registry] — both packages confirmed via `npm view` with official GitHub repos at github.com/i18next/i18next and github.com/i18next/react-i18next.

### Supporting

No additional packages needed. All other requirements are covered by existing project dependencies:
- `electron-store` 11.x — already installed, handles language/theme persistence
- `zod` — already installed, validates IPC payloads
- `lucide-react` — already installed, provides `Check`, `Sun`, `Moon` icons (confirmed in UI-SPEC)

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static `resources` object | `i18next-http-backend` | `i18next-http-backend` performs `fetch()` at runtime — forbidden by offline constraint and CSP `connect-src: none` in production |
| Static `resources` object | `i18next-resources-to-backend` | Adds lazy-loading (unnecessary for 6 small namespaces); more complexity for no benefit |
| `useSuspense: false` + `await init` | `useSuspense: true` + `<Suspense>` | Suspense requires additional boundary in App.tsx; `await init` before mount is simpler and eliminates the FOUI (flash of untranslated interface) for this app's pre-mount pattern |
| `nativeTheme.themeSource` | CSS-only `@media prefers-color-scheme` | `nativeTheme` is already the theme authority in main/index.ts; `themeSource` is the correct Electron API for programmatic override |

**Installation:**
```bash
npm install i18next react-i18next
```

**Version verification:**
```bash
npm view i18next version     # → 26.3.1
npm view react-i18next version  # → 17.0.8
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Source Repo | Disposition |
|---------|----------|-----|-------------|-------------|
| `i18next` | npm | 12+ years (created 2012-01-03) | github.com/i18next/i18next | Approved |
| `react-i18next` | npm | 10+ years (created 2015-12-12) | github.com/i18next/react-i18next | Approved |

**slopcheck status:** slopcheck was available on this machine but auto-mode blocked its execution. Both packages are verified via npm registry metadata (age, source repo, license), official GitHub organizations, and official documentation at i18next.com and react.i18next.com. These are among the most-downloaded i18n libraries in the npm ecosystem. No postinstall scripts found on either package.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Pre-mount init (src/renderer/main.tsx)                  │
│                                                         │
│  IPC: LANGUAGE_GET ──► main: languageChannels.ts        │
│  IPC: THEME_GET    ──► main: themeChannels.ts           │
│       ↓ (await both)                                    │
│  i18n.init({ lng, resources })  ← JSON bundled by Vite  │
│       ↓ (await)                                         │
│  applyTheme(storedTheme)  ← classList.toggle('dark')    │
│       ↓                                                 │
│  ReactDOM.createRoot(...).render(<App />)               │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────▼───────────────────────────────┐
         │ React tree (renderer)                     │
         │                                           │
         │  SettingsMenu ──► i18n.changeLanguage()   │
         │                ──► IPC: LANGUAGE_SET       │
         │                                           │
         │  SettingsMenu ──► classList.toggle('dark') │
         │                ──► IPC: THEME_SET          │
         │                                           │
         │  Every component: useTranslation(ns)       │
         │    t('key') / t('key', { count })          │
         └───────────────────────────────────────────┘
                     │
         ┌───────────▼───────────────────────────────┐
         │ Main process                              │
         │                                           │
         │  languageChannels.ts (new)                │
         │    LANGUAGE_GET → electron-store.get()    │
         │    LANGUAGE_SET → Zod validate → store    │
         │                                           │
         │  themeChannels.ts (new)                   │
         │    THEME_GET → electron-store.get()       │
         │    THEME_SET → Zod validate → store       │
         │               → nativeTheme.themeSource   │
         └───────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── renderer/
│   ├── i18n/
│   │   ├── index.ts              # i18n instance, init(), resources assembled here
│   │   ├── locales/
│   │   │   ├── en/
│   │   │   │   ├── auth.json
│   │   │   │   ├── target.json
│   │   │   │   ├── groups.json
│   │   │   │   ├── wizard.json
│   │   │   │   ├── removal.json
│   │   │   │   └── shell.json
│   │   │   └── cs/
│   │   │       ├── auth.json     (Czech translations)
│   │   │       ├── target.json
│   │   │       ├── groups.json
│   │   │       ├── wizard.json
│   │   │       ├── removal.json
│   │   │       └── shell.json
│   ├── main.tsx                  # Modified: await language+theme IPC, await i18n.init()
│   ├── shell/
│   │   └── SettingsMenu.tsx     # Extended: Language + Theme rows
│   └── ipc/
│       ├── languageClient.ts    # New: LANGUAGE_GET/SET renderer-side client
│       └── themeClient.ts       # New: THEME_GET/SET renderer-side client
├── main/
│   └── ipc/
│       ├── languageChannels.ts  # New: clone of severityChannels.ts pattern
│       └── themeChannels.ts     # New: clone of severityChannels.ts pattern
└── shared/
    └── channels.ts              # Augmented: LANGUAGE_GET/SET, THEME_GET/SET constants
```

### Pattern 1: i18n Instance Initialization (Offline, Pre-mount)

[CITED: react.i18next.com/guides/quick-start]

```typescript
// src/renderer/i18n/index.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Static imports — bundled by Vite, no HTTP backend
import enAuth from './locales/en/auth.json'
import enTarget from './locales/en/target.json'
import enGroups from './locales/en/groups.json'
import enWizard from './locales/en/wizard.json'
import enRemoval from './locales/en/removal.json'
import enShell from './locales/en/shell.json'
import csAuth from './locales/cs/auth.json'
import csTarget from './locales/cs/target.json'
import csGroups from './locales/cs/groups.json'
import csWizard from './locales/cs/wizard.json'
import csRemoval from './locales/cs/removal.json'
import csShell from './locales/cs/shell.json'

export const resources = {
  en: { auth: enAuth, target: enTarget, groups: enGroups, wizard: enWizard, removal: enRemoval, shell: enShell },
  cs: { auth: csAuth, target: csTarget, groups: csGroups, wizard: csWizard, removal: csRemoval, shell: csShell },
} as const

export async function initI18n(lng: 'en' | 'cs'): Promise<void> {
  await i18n
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: 'en',
      resources,
      defaultNS: 'shell',
      interpolation: {
        escapeValue: false, // React already escapes — react-i18next standard setting
      },
      react: {
        useSuspense: false, // Pre-mount await handles loading; no Suspense boundaries needed
      },
    })
}

export default i18n
```

### Pattern 2: Pre-mount Init in main.tsx

[ASSUMED] — based on the severityClient.ts existing pattern and i18next documentation

```typescript
// src/renderer/main.tsx (modified)
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import './styles/globals.css'
import App from './App'
import { initI18n } from './i18n'

async function main(): Promise<void> {
  // Fetch persisted prefs BEFORE React mounts — eliminates flash of wrong language/theme
  const [storedLang, storedTheme] = await Promise.all([
    window.mrsproper.getLanguage().catch(() => null),
    window.mrsproper.getTheme().catch(() => null),
  ])

  // Resolve language: stored pref → OS locale detection → 'en' fallback
  const lng = storedLang ?? (navigator.language.startsWith('cs') ? 'cs' : 'en')
  await initI18n(lng as 'en' | 'cs')

  // Apply theme before paint
  const theme = storedTheme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.classList.toggle('dark', theme === 'dark')

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void main()
```

**Critical:** The current `main.tsx` has synchronous top-level theme logic and a synchronous `createRoot`. Converting to `async main()` wrapping the IPC calls and `await initI18n()` is the correct pattern. The `void main()` call fires the async function without blocking the module.

### Pattern 3: Czech Plural Keys in JSON

[VERIFIED: Node.js Intl.PluralRules('cs') confirmed via runtime check in this session]

Czech uses exactly 3 plural forms:
- `_one`: count === 1 → "1 skupina"
- `_few`: count === 2, 3, or 4 → "2 skupiny"
- `_other`: count === 0, 5, 6, … → "5 skupin"

```json
// cs/wizard.json — plural key example
{
  "groupCount_one": "{{count}} skupina",
  "groupCount_few": "{{count}} skupiny",
  "groupCount_other": "{{count}} skupin"
}
```

```json
// en/wizard.json — English (2 forms only)
{
  "groupCount_one": "{{count}} group",
  "groupCount_other": "{{count}} groups"
}
```

Usage in component:
```typescript
const { t } = useTranslation('wizard')
t('groupCount', { count: n })  // count is the REQUIRED variable name for plural resolution
```

**The `s()` helper function** (`function s(n: number) { return n === 1 ? '' : 's' }`) in `wizardCopy.ts` and `removalCopy.ts` is **replaced entirely** by plural keys. No string-concatenation pluralization survives migration.

### Pattern 4: Parameterized Copy Functions → Interpolation

Current `wizardCopy.confirmLabel(severity, name, n)` → i18next keys with interpolation + plural:

```json
// en/wizard.json
{
  "confirmLabelBan_one": "Ban {{name}} from {{count}} group",
  "confirmLabelBan_other": "Ban {{name}} from {{count}} groups",
  "confirmLabelKick_one": "Kick {{name}} from {{count}} group",
  "confirmLabelKick_other": "Kick {{name}} from {{count}} groups"
}
```

```json
// cs/wizard.json
{
  "confirmLabelBan_one": "Zabanovat {{name}} — {{count}} skupina",
  "confirmLabelBan_few": "Zabanovat {{name}} — {{count}} skupiny",
  "confirmLabelBan_other": "Zabanovat {{name}} — {{count}} skupin",
  "confirmLabelKick_one": "Vyhodit {{name}} — {{count}} skupina",
  "confirmLabelKick_few": "Vyhodit {{name}} — {{count}} skupiny",
  "confirmLabelKick_other": "Vyhodit {{name}} — {{count}} skupin"
}
```

Usage:
```typescript
t(`confirmLabel${severity === 'ban' ? 'Ban' : 'Kick'}`, { name, count: n })
```

**Alternative for context-based variants:** i18next also supports a `context` parameter (`t('key', { context: severity, count: n })`), producing keys like `key_ban_one`, `key_ban_few`, etc. Either approach works; the explicit namespace convention above is simpler to reason about during translation.

### Pattern 5: Language Switcher — Instant Switch

```typescript
// Inside SettingsMenu.tsx
const { i18n } = useTranslation()

const handleLanguageSelect = async (lang: 'en' | 'cs') => {
  setMenuOpen(false)  // Close menu first (per UI-SPEC)
  await i18n.changeLanguage(lang)  // react-i18next re-renders entire tree
  await window.mrsproper.setLanguage(lang)  // Persist
}
```

`i18n.changeLanguage()` triggers react-i18next's context update, which causes every component using `useTranslation()` to re-render with the new language. This is the canonical "instant switch" mechanism.

### Pattern 6: Theme Toggle

The existing `main/index.ts` uses `nativeTheme.shouldUseDarkColors` and `nativeTheme.on('updated')` to push theme to the renderer. Phase 8 must:

1. Add `THEME_GET`/`THEME_SET` IPC pair in main (new `themeChannels.ts`)
2. On `THEME_SET`: store the value, set `nativeTheme.themeSource` to `'light'`/`'dark'`/`'system'`
3. The existing `syncRendererTheme` listener already handles the resulting `nativeTheme.updated` event — it reads `nativeTheme.shouldUseDarkColors` and toggles the renderer class
4. On `THEME_GET`: return stored pref or `null` (no pref yet → follow nativeTheme)
5. Pre-mount: read stored pref, apply class directly (the nativeTheme listener fires after `did-finish-load`, not before first paint)

**Key insight from current code:** `main/index.ts` already sets `backgroundColor` based on `nativeTheme.shouldUseDarkColors` at window creation time, and pushes the theme via `executeJavaScript` on `did-finish-load`. After setting `nativeTheme.themeSource`, the `updated` event fires, which triggers `syncRendererTheme`. This means the existing listener continues to work correctly — `nativeTheme.themeSource = 'dark'` causes Electron to emit `updated`, which calls `syncRendererTheme`, which toggles `classList`. **The renderer does not need to call `classList.toggle` itself after setting the theme via IPC** — it just needs to persist the preference. The pre-mount direct toggle handles the first-paint case.

### Anti-Patterns to Avoid

- **Using `i18next-http-backend` or `fetch()` for translation loading:** Production CSP has `connect-src 'none'` — fetch calls will be blocked. Always use static import.
- **Calling `t()` before `i18n.init()` resolves:** Returns the key as a string fallback. The `await initI18n()` before `createRoot` prevents this.
- **Using `useSuspense: true` without a `<Suspense>` boundary:** React will throw if the i18n instance isn't ready. Since we `await init()` before mount, this isn't needed — but mixing modes (Suspense ON + no boundary) causes hard crashes.
- **Translating language option labels:** "English" must stay "English" and "Česky" must stay "Česky" in both locales — a user trapped in the wrong language must be able to find their own language name. [CITED: 08-UI-SPEC.md]
- **Using `tsc --noEmit` in verify blocks:** No-op for this project (confirmed in CLAUDE.md and STATE.md). Use `tsc --build`.
- **Setting `nativeTheme.themeSource` in the renderer process:** `nativeTheme` is main-process-only. The renderer toggles `classList`; main sets `themeSource`.
- **Keeping any `*Copy.ts` module after migration:** LOC-02 requires all copy modules deleted. No dead exports.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Czech plural resolution | Custom `n === 1 ? ... : n <= 4 ? ... : ...` | i18next + `_one/_few/_other` keys | Intl.PluralRules handles edge cases (decimals, 0) correctly; custom code always misses some |
| String interpolation with escaping | Template literals in t() | i18next `{{variable}}` placeholders | React-i18next sets `escapeValue: false` correctly for React; hand-rolled still risks double-escaping |
| Language detection at first launch | `navigator.language.startsWith('cs')` inline everywhere | Single detect-once in `main.tsx` pre-mount | Detection belongs at init time, stored immediately |
| OS locale → Telegram error code translation | Custom mapping table | No mapping — emit error codes from main, translate surrounding copy in renderer | Error codes are typed, stable; the translation is the surrounding sentence, not the code itself |

**Key insight:** All the complex edge cases in Czech plurals (2–4 are "few", but 12 is "other") are handled by `Intl.PluralRules('cs')` which i18next calls internally. The only task is writing the three key variants; the math is automatic.

---

## Hardcoded String Inventory

This is the highest-value research output for the planner: a complete list of user-facing strings currently outside the copy modules, by file. These must all be externalized (LOC-02).

### Six Existing Copy Modules (mechanical migration)

All strings in these modules become JSON keys in the corresponding namespace. The modules are then deleted.

| Copy Module | Namespace | Keys Required |
|-------------|-----------|---------------|
| `src/renderer/auth/errorCopy.ts` | `auth` | `errorCopy.*` (7 error codes + `INVALID_PHONE_FORMAT_COPY`) + `getErrorCopy` becomes `t('auth:errorCode.PHONE_NUMBER_INVALID')` pattern |
| `src/renderer/target/resolveCopy.ts` | `target` | `resolveError.*` (6 codes) + `INVALID_USERNAME_FORMAT_COPY` + `INVALID_PHONE_FORMAT_COPY` + `PHONE_MODE_DISCLOSURE_HINT` + `FLOOD_WAIT_SUBTEXT` |
| `src/renderer/target/searchCopy.ts` | `target` | `searchError.*` (5 codes) + `searchCopy.*` (9 strings, 4 parameterized functions) + `formatFoundIn` (pure JS helper — stays as utility, not translated) |
| `src/renderer/groups/groupsCopy.ts` | `groups` | `greyReason.*` (5) + `groupTypeLabel.*` (3) + `groupError.*` (3) + `scanCopy.*` (2) + `emptyState.*` (5 strings, 1 parameterized) + `formatMemberCount` (stays as utility) |
| `src/renderer/wizard/wizardCopy.ts` | `wizard` | `stepIndicatorAria` + `stageLabel.*` (5) + `reviewTitle` + `severityLabel` + `severityGroupAria` + `severityKick` + `severityBan` + `confirmLabel` (plural + context) + `confirmAriaLabel` + `editSelection` + `runTriggerLabel` (plural) + `runTriggerAria` (plural) + `totalsRemoving` (plural) + `totalsExcluded` (plural) + `totalsCantBlock` (plural) + `totalsEmpty` + `mechanicNote` (4 branches → 4 keys) + `memberCount` (plural) + `groupListAria` + `removeSomeoneElse` + `changeTarget` + `changeTargetAria` |
| `src/renderer/removal/removalCopy.ts` | `removal` | `confirmTitle` (plural + context) + `confirmDestructive` (plural + context) + `confirmNeutral` + `confirmDispatching` + `severityLine` (plural + context) + `runTriggerLabel` (plural + context) + `stopLabel` + `stoppingLabel` + `retryRowLabel` + `progressLabel` + `floodWaitSubline` + `resumeTitle` + `resumeBody` + `resumeDestructive` + `resumeNeutral` + `peerFloodBanner` + `peerFloodResumeLabel` + `rowStatus.*` (6) + `summaryLine`/`summaryLineParts` (complex → multiple keys) + `summaryFailed` (plural) + `summaryStopped` + `summaryTimestamp` (JS Date — stays as utility) |

### Direct Hardcoded Strings in Components

These are **outside** the copy modules and currently embedded directly in JSX. All must be migrated to `t()` calls under the `shell` namespace unless noted.

| File | Strings Found | Namespace |
|------|--------------|-----------|
| `src/renderer/shell/SettingsMenu.tsx` | `aria-label="Settings"` (tooltip), `"Settings menu"` (aria-label on menu div), `"Log out"` (button text) | `shell` |
| `src/renderer/shell/LogoutDialog.tsx` | `"Log out?"` (title), `"You'll need to sign in again with a code."` (description), `"You're signed out on this device, but we couldn't confirm..."` (alert), `"Cancel"`, `"Confirm log out"` (aria-label), `"Logging out…"`, `"Log out"` (button text) | `shell` |
| `src/renderer/shell/IdentityDisplay.tsx` | `aria-label="Signed in"` | `shell` |
| `src/renderer/auth/PhoneStep.tsx` | `"Enter your phone number"` (h1), `"Choose your country and enter your number. We'll send a login code to your Telegram app."` (p), `"Phone number"` (Label), `"Phone number"` (placeholder), `"Wait X seconds before trying again"` (aria-label), `"Send code"` (button text ×2) | `auth` |
| `src/renderer/auth/CodeStep.tsx` | `"Back"` (button), `"Enter the code"` (h1), `"We sent a code to your Telegram app."` (p), `"Sent to {sentTo}"` (p — `sentTo` is dynamic Telegram data, stays verbatim), `"Login code"` (Label), `"Enter code"` (placeholder), `"Wait X seconds..."` (aria-label), `"Resending…"`, `"Resend code"`, `"Verify"` (button ×2) | `auth` |
| `src/renderer/auth/PasswordStep.tsx` | `"Back"`, `"Two-step verification"` (h1), `"Your account is protected by a password. Enter it to finish signing in."` (p), `"Hint: {hint}"` (hint is dynamic, keep as `t('passwordHint', { hint })`), `"Password"` (Label), `"Enter password"` (placeholder), `"Wait X seconds..."`, `"Sign in"` (button ×2) | `auth` |
| `src/renderer/auth/CountryPicker.tsx` | `aria-label="Select country code"`, `placeholder="Search country…"`, `"No country found."` (CommandEmpty) | `auth` |
| `src/renderer/auth/FloodCountdown.tsx` | _(likely has "s" or "sec" suffix — needs inspection)_ | `auth` |
| `src/renderer/target/TargetInput.tsx` | `'Name search mode detected'`, `'Username mode detected'`, `'Phone mode detected'` (aria-labels), `'Finding person…'`, `'Find person'` (button text ×2) | `target` |
| `src/renderer/target/TargetCard.tsx` | `'Stop the removal first'`, `'Clears this person and any group selections'` (tooltips) | `target` |
| `src/renderer/target/CandidateRow.tsx` | `aria-label={`${candidate.name} — found in ${candidate.foundIn.length} of your groups`}` — interpolated | `target` |
| `src/renderer/groups/GroupsPane.tsx` | `aria-label="Stop the removal run"`, `placeholder="Filter groups"`, `aria-label="Refresh group list"` | `groups` |
| `src/renderer/groups/GroupRow.tsx` | `aria-label={`${dialog.title} — include in removal`}` (×2), `aria-label={`Retry removal for ${dialog.title}`}`, `aria-label={`Retry membership check for ${dialog.title}`}` — all interpolated | `groups` |
| `src/renderer/removal/ResumeJobDialog.tsx` | _(uses `removalCopy` which migrates to `removal` namespace; check for any direct strings)_ | `removal` |
| `src/renderer/wizard/StepIndicator.tsx` | _(uses `wizardCopy.stageLabel.*` and `stepIndicatorAria` — migrate to `wizard` namespace)_ | `wizard` |
| `src/renderer/wizard/ReviewScreen.tsx` | _(uses `wizardCopy.*` and `removalCopy.*` — both migrate; check for any residual inline strings)_ | `wizard`/`removal` |

**FloodCountdown** inspection needed: it likely renders a seconds suffix that should be localized. Inspect before planning.

---

## Common Pitfalls

### Pitfall 1: Flash of Untranslated Interface (FOUI)

**What goes wrong:** If `i18n.init()` is not awaited before `ReactDOM.createRoot`, components render briefly with the key strings (e.g., `"wizard.reviewTitle"`) before i18next resolves.
**Why it happens:** `i18n.init()` is async by default when using `useSuspense`. Without Suspense + await, the first render uses fallback keys.
**How to avoid:** The pre-mount pattern — `await initI18n(lng)` inside an async `main()` function that calls `createRoot` only after resolution. `useSuspense: false` prevents Suspense from racing; the `await` ensures the instance is ready.
**Warning signs:** Test in the browser devtools with CPU throttling — if you briefly see `"auth.PHONE_NUMBER_INVALID"` type strings in the UI, the await is missing or the resources aren't bundled.

### Pitfall 2: nativeTheme.on('updated') Clobbering User's Explicit Theme Choice

**What goes wrong:** User picks "Day" theme. OS switches to dark mode. `nativeTheme.on('updated', syncRendererTheme)` fires and overrides the user's choice back to dark.
**Why it happens:** The existing `syncRendererTheme` reads `nativeTheme.shouldUseDarkColors` unconditionally. After Phase 8, a stored user theme pref must make this listener conditional.
**How to avoid:** In `themeChannels.ts`, when `THEME_SET` is called with an explicit value, also set `nativeTheme.themeSource = 'light'|'dark'`. Setting `themeSource` overrides `shouldUseDarkColors` to always reflect the forced value — the `updated` event still fires, but now `shouldUseDarkColors` reflects the forced choice, not the OS. This means `syncRendererTheme` continues to work correctly without needing any changes to its logic.
**Warning signs:** Theme resets to OS preference after OS appearance changes. Test by setting Day theme, then toggling the OS dark mode — theme should stay Day.

### Pitfall 3: Vite Bundling of JSON Requires `resolveJsonModule`

**What goes wrong:** `import enAuth from './locales/en/auth.json'` fails with TypeScript error `"Cannot find module"`.
**Why it happens:** TypeScript needs `resolveJsonModule: true` in tsconfig. Vite bundles JSON natively but TS type-checking needs it.
**How to avoid:** Check the renderer tsconfig (electron-vite generates separate tsconfigs for main/preload/renderer). `resolveJsonModule: true` is required. Also verify the JSON files are inside the `src/` tree (Vite only serves/bundles from the configured root).

### Pitfall 4: Namespace in `useTranslation` Must Match Registered Namespace

**What goes wrong:** `useTranslation('auth')` returns the identity function (key passthrough) even though `auth.json` exists.
**Why it happens:** Namespace name in `useTranslation()` must exactly match the key in the `resources` object. If the resources key is `'en': { authentication: ... }` but the component calls `useTranslation('auth')`, all keys fall through to their string form.
**How to avoid:** Use a shared constant file for namespace names. The `resources` object in `i18n/index.ts` is the single source of truth.

### Pitfall 5: `errorCopy` Tests Break After Copy Module Deletion

**What goes wrong:** `src/renderer/auth/errorCopy.test.ts` imports `errorCopy.ts` directly. After the module is deleted, the test file fails to compile.
**Why it happens:** Tests were written against the copy module API, not the i18n layer.
**How to avoid:** Migrate tests alongside the copy module migration. Tests for translated strings should assert that `t('auth:errorCode.FLOOD_WAIT')` returns a non-empty string and does not contain the raw error code — same logic, different import. Tests run in node env vitest with `@renderer` alias, which resolves correctly.

### Pitfall 6: `formatMemberCount` and `summaryTimestamp` Are Pure JS Utilities, Not Translations

**What goes wrong:** `formatMemberCount` (uses `Intl.NumberFormat`) and `summaryTimestamp` (uses `Intl.DateTimeFormat`) get deleted along with their parent copy modules, breaking GroupRow and the summary band.
**Why it happens:** They live in the copy modules but are not translatable copy — they are locale-sensitive formatting utilities.
**How to avoid:** Move these two functions to a shared utility location (e.g., `src/renderer/lib/format.ts`) before deleting the copy modules. Do not inline them as `t()` keys.

---

## Code Examples

### Czech Plural Verification

This was verified at research time via Node.js runtime (`Intl.PluralRules('cs')`):

```
count 0 → 'other'   (0 skupin)
count 1 → 'one'     (1 skupina)
count 2 → 'few'     (2 skupiny)
count 3 → 'few'     (3 skupiny)
count 4 → 'few'     (4 skupiny)
count 5 → 'other'   (5 skupin)
count 10 → 'other'  (10 skupin)
count 11 → 'other'  (11 skupin)
count 21 → 'other'  (21 skupin)
count 100 → 'other' (100 skupin)
count 102 → 'other' (102 skupin)
```

Note: Unlike Polish/Slovak, Czech does NOT use 'few' for 21, 22, 23, 24 — those are 'other'. The boundary is strictly the ones digit 2–4 only for numbers NOT in the teens.

### languageChannels.ts (clone of severityChannels.ts)

[ASSUMED] — derived from the verified severityChannels.ts pattern

```typescript
// src/main/ipc/languageChannels.ts
import { ipcMain } from 'electron'
import { z } from 'zod'
import { LANGUAGE_GET, LANGUAGE_SET } from '@shared/channels'

const LanguageSchema = z.object({ language: z.enum(['en', 'cs']) })

type LangStore = import('electron-store').default<{ language: 'en' | 'cs' }>
let _store: LangStore | null = null

async function getStore(): Promise<LangStore> {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store<{ language: 'en' | 'cs' }>()  // no default — null means use OS detection
  }
  return _store
}

export function registerLanguageChannels(): void {
  ipcMain.handle(LANGUAGE_GET, async () => {
    const store = await getStore()
    return store.get('language') ?? null  // null = use OS detection in renderer
  })

  ipcMain.handle(LANGUAGE_SET, async (_event, payload: unknown) => {
    const { language } = LanguageSchema.parse(payload)
    const store = await getStore()
    store.set('language', language)
    return language
  })
}
```

### TypeScript Key Safety (Optional but Recommended)

[CITED: i18next.com/overview/typescript]

```typescript
// src/renderer/i18n/i18next.d.ts
import { resources } from './index'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'shell'
    resources: typeof resources['en']
  }
}
```

This makes `t('wizard:reviewTitle')` type-safe — typos become TypeScript errors. Given this project already uses `tsc --build` as a quality gate, this is recommended: it catches translation key typos at compile time.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `i18next-http-backend` + CDN fetch | Static `resources` object with bundled JSON | Required for offline/CSP-restricted apps |
| `compatibilityJSON: 'v3'` (suffix `_0`, `_1`, `_2`) | Default v4 format (`_one`, `_few`, `_other`) | v4 is default since i18next v21.0.0; do NOT set `compatibilityJSON` |
| `useSuspense: true` with Suspense boundaries | `useSuspense: false` + `await init()` pre-mount | Simpler for Electron apps where init can be awaited before mount |
| `keytar` for session encryption | Electron `safeStorage` | `keytar` unmaintained since Dec 2022 |
| `nativeTheme.on('updated')` only | `nativeTheme.themeSource` + conditional listener | `themeSource` is the correct API for persistent user override |

**Deprecated/outdated:**
- `compatibilityJSON: 'v3'`: Do NOT use — it changes suffix format to numeric (`_0`, `_1`, `_2`) and is the legacy format pre-v21. The default v4 format (`_one`/`_few`/`_other`) is what should be used.
- `i18n.init({ initImmediate: false })`: This was the old synchronous init option. In modern i18next, just `await i18n.init()` and the `initImmediate` option has been renamed to `initAsync`; default is async. Using `await` is the correct pattern.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pre-mount async `main()` pattern wrapping IPC + `i18n.init()` before `createRoot` | Pattern 2 | If wrong: need `I18nextProvider` with `Suspense` boundary instead; more complex but functional |
| A2 | `languageChannels.ts` returns `null` from `LANGUAGE_GET` when no pref set | Code Examples | If wrong: store might return undefined; handle both in renderer (`?? null`) |
| A3 | `nativeTheme.themeSource = 'light'/'dark'` causes `updated` event, which the existing `syncRendererTheme` handles correctly | Pitfall 2 | If wrong: renderer gets double-toggles or no toggle; may need explicit IPC push channel instead |
| A4 | `FloodCountdown.tsx` contains translatable strings (seconds suffix) | Inventory | If wrong: file is already clean; low risk either way |
| A5 | TypeScript typed keys via `i18next.d.ts` don't cause compilation slowdown with 6 small namespaces | Code Examples | If wrong: disable typed keys (revert to string literal keys) |

---

## Open Questions (RESOLVED)

1. **FloodCountdown.tsx contents**
   - What we know: File exists at `src/renderer/auth/FloodCountdown.tsx`; renders a countdown, likely has suffix text
   - What's unclear: Whether it contains translatable strings or just the raw number
   - Recommendation: Read file in Wave 0 before planning auth namespace keys
   - RESOLVED: FloodCountdown has an `aria-label` with dynamic time — answered in PATTERNS.md as `floodCountdownAria` key with `{{time}}` interpolation in the auth namespace.

2. **`removeEventListener` for `nativeTheme` when user sets explicit theme**
   - What we know: Main sets `nativeTheme.themeSource`; `updated` still fires; `syncRendererTheme` reads `shouldUseDarkColors` which reflects forced source
   - What's unclear: Whether setting `themeSource` to `'dark'` and then OS switches to light causes a spurious `updated` event that re-asserts the correct `shouldUseDarkColors`
   - Recommendation: Test empirically in Wave 3; fallback is storing theme pref in main memory and checking it inside `syncRendererTheme` before applying
   - RESOLVED: Resolved via `themeSource` approach per Pitfall 2 in PATTERNS.md — setting `nativeTheme.themeSource` to `'light'` or `'dark'` suppresses OS-driven changes; `syncRendererTheme` is made conditional on whether a stored user pref exists.

3. **`formatMemberCount` locale sensitivity**
   - What we know: It uses `Intl.NumberFormat('en', ...)` with hard-coded `'en'` locale for compact notation
   - What's unclear: Should it use the active i18n language for number formatting?
   - Recommendation: Leave `'en'` for now (compact number notation is consistent across locales for this tool); not a LOC-02 requirement
   - RESOLVED: Leave `'en'` locale hardcoded in `formatMemberCount`. Compact number notation (1.2k etc.) is locale-consistent for this tool's purpose; switching locale would not meaningfully improve Czech UX. This is not a LOC-02 requirement.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/runtime | ✓ | (bundled in Electron 37.10.3) | — |
| npm | Package install | ✓ | (project already set up) | — |
| `tsc --build` | Type check gate | ✓ | TypeScript 5.x | — |
| vitest | Test runner | ✓ | 4.1.8 | — |
| `Intl.PluralRules` | Czech plural forms | ✓ | Native in Node 20+/Electron 37 | — |

No missing dependencies. Phase 8 adds only `i18next` and `react-i18next` from npm.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.8 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test` (runs `vitest run`) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOC-01 | Language GET/SET IPC round-trips; Zod rejects invalid locale | unit | `npm test -- --reporter=verbose src/main/ipc/languageChannels.test.ts` | ❌ Wave 0 |
| LOC-01 | Theme GET/SET IPC round-trips; Zod rejects invalid theme value | unit | `npm test -- --reporter=verbose src/main/ipc/themeChannels.test.ts` | ❌ Wave 0 |
| LOC-02 | i18n instance initializes; `t('auth:errorCode.FLOOD_WAIT')` returns non-empty, jargon-free string | unit | `npm test -- --reporter=verbose src/renderer/i18n/i18n.test.ts` | ❌ Wave 0 |
| LOC-02 | Czech auth strings contain no raw Telegram error codes | unit | same i18n.test.ts | ❌ Wave 0 |
| LOC-02 | All six namespace JSON files load without error | unit | same i18n.test.ts | ❌ Wave 0 |
| LOC-03 | Czech plural: count=1 → `_one` suffix; count=2 → `_few`; count=5 → `_other` | unit | `npm test -- --reporter=verbose src/renderer/i18n/i18n.test.ts` | ❌ Wave 0 |
| LOC-03 | Czech group count plurals: 1/2/5 all produce non-empty, non-key-passthrough strings | unit | same | ❌ Wave 0 |
| (existing) | `errorCopy.test.ts` migrated to i18n layer | unit | `npm test -- src/renderer/auth/errorCopy.test.ts` | ✅ (must be rewritten) |

**Existing test migration:** `src/renderer/auth/errorCopy.test.ts` imports `errorCopy.ts` which will be deleted. It must be rewritten to test the i18n layer instead. The same semantic assertions apply — "copy for FLOOD_WAIT does not contain raw code 'FLOOD_WAIT'" etc. — but the import changes to `i18n.t('auth:errorCode.FLOOD_WAIT')`.

### Sampling Rate

- **Per task commit:** `npm test` (all tests, < 30 seconds)
- **Per wave merge:** `npm test && tsc --build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/main/ipc/languageChannels.test.ts` — covers LOC-01 language IPC
- [ ] `src/main/ipc/themeChannels.test.ts` — covers LOC-01 theme IPC
- [ ] `src/renderer/i18n/i18n.test.ts` — covers LOC-02 (init), LOC-03 (Czech plurals, no-jargon)
- [ ] `src/renderer/auth/errorCopy.test.ts` — rewrite (not create new) to test i18n layer instead of deleted module

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | (no auth surface in Phase 8) |
| V3 Session Management | no | (session unchanged) |
| V4 Access Control | no | (no new IPC actions) |
| V5 Input Validation | yes | Zod `z.enum(['en','cs'])` on LANGUAGE_SET; Zod enum on THEME_SET |
| V6 Cryptography | no | Language/theme are non-secret prefs — plain JSON in electron-store, not safeStorage |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer injects arbitrary locale string into electron-store | Tampering | `z.enum(['en','cs'])` on LANGUAGE_SET payload — exact pattern from CLAUDE.md |
| Renderer injects arbitrary theme value | Tampering | `z.enum(['light','dark'])` (or `['day','night']`) on THEME_SET payload |
| Translation keys leak Telegram error codes | Information Disclosure | Czech translations never contain raw codes verbatim — codes appear only in their parenthesized verbatim exception ("FLOOD_WAIT") as specified in CONTEXT.md |

No new attack surface introduced. The `LANGUAGE_GET` and `THEME_GET` handlers are read-only (no payload) and return typed values from electron-store.

---

## Sources

### Primary (HIGH confidence)

- `npm view i18next version` — version 26.3.1, created 2012-01-03, repo github.com/i18next/i18next
- `npm view react-i18next version` — version 17.0.8, created 2015-12-12, peer: `i18next >= 26.2.0`, `react >= 16.8.0`, repo github.com/i18next/react-i18next
- [react.i18next.com/guides/quick-start](https://react.i18next.com/guides/quick-start) — inline resources pattern, `initReactI18next`, `useTranslation` namespace syntax
- [i18next.com/overview/typescript](https://www.i18next.com/overview/typescript) — `CustomTypeOptions`, `i18next.d.ts` pattern
- [electronjs.org/docs/latest/api/native-theme](https://www.electronjs.org/docs/latest/api/native-theme) — `nativeTheme.themeSource` API (`'system'|'light'|'dark'`), `updated` event behavior
- `Node.js Intl.PluralRules('cs')` — verified at runtime: 0→other, 1→one, 2→few, 3→few, 4→few, 5→other, 10→other, 21→other

### Secondary (MEDIUM confidence)

- [i18next.com/translation-function/plurals](https://www.i18next.com/translation-function/plurals) — count interpolation syntax (`{count}` required variable name), v4 suffix format (`_one/_few/_other`)
- [react.i18next.com/latest/i18next-instance](https://react.i18next.com/latest/i18next-instance) — `useSuspense: false` configuration
- `src/main/ipc/severityChannels.ts` (codebase) — verified electron-store 11.x ESM lazy singleton + Zod validation pattern to clone

### Tertiary (LOW confidence)

- WebSearch results on Czech plural rules — corroborated by the Node.js runtime verification; the runtime check is authoritative

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both packages verified via npm registry with age, repo, license, peer deps
- Czech plural forms: HIGH — verified via `Intl.PluralRules('cs')` runtime execution
- Architecture patterns: HIGH for copy module migration (mechanical); MEDIUM for pre-mount async init (standard documented pattern, ASSUMED for exact wiring)
- nativeTheme override: HIGH for `themeSource` API; MEDIUM for behavioral interaction with existing `syncRendererTheme`
- Pitfalls: HIGH — derived from reading the actual codebase

**Research date:** 2026-06-13
**Valid until:** 2026-07-13 (i18next/react-i18next are stable; Electron API is stable at pinned 37.x)
