# Phase 8: Localization — i18n & Czech Translation - Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 21 new/modified files
**Analogs found:** 19 / 21

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/main/ipc/languageChannels.ts` | service | request-response | `src/main/ipc/severityChannels.ts` | exact |
| `src/main/ipc/themeChannels.ts` | service | request-response | `src/main/ipc/severityChannels.ts` | exact |
| `src/shared/channels.ts` | config | — | `src/shared/channels.ts` (self, augment) | exact |
| `src/preload/index.ts` | middleware | request-response | `src/preload/index.ts` (self, augment) | exact |
| `src/renderer/i18n/index.ts` | service | transform | `src/renderer/auth/errorCopy.ts` (data pattern) | partial |
| `src/renderer/i18n/locales/en/*.json` | config | — | `src/renderer/auth/errorCopy.ts` (key inventory) | role-match |
| `src/renderer/i18n/locales/cs/*.json` | config | — | `src/renderer/auth/errorCopy.ts` (key inventory) | role-match |
| `src/renderer/i18n/i18next.d.ts` | config | — | — | none |
| `src/renderer/main.tsx` | provider | request-response | `src/renderer/main.tsx` (self, modify) | exact |
| `src/renderer/shell/SettingsMenu.tsx` | component | event-driven | `src/renderer/shell/SettingsMenu.tsx` (self, extend) | exact |
| `src/renderer/auth/errorCopy.ts` | — | — | deleted after migration | — |
| `src/renderer/target/resolveCopy.ts` | — | — | deleted after migration | — |
| `src/renderer/target/searchCopy.ts` | — | — | deleted after migration | — |
| `src/renderer/groups/groupsCopy.ts` | — | — | deleted after migration | — |
| `src/renderer/wizard/wizardCopy.ts` | — | — | deleted after migration | — |
| `src/renderer/removal/removalCopy.ts` | — | — | deleted after migration | — |
| `src/renderer/lib/format.ts` | utility | transform | `src/renderer/groups/groupsCopy.ts` (formatMemberCount) | role-match |
| `src/renderer/auth/FloodCountdown.tsx` | component | event-driven | `src/renderer/auth/FloodCountdown.tsx` (self, modify) | exact |
| `src/renderer/auth/errorCopy.test.ts` | test | — | `src/renderer/auth/errorCopy.test.ts` (self, rewrite) | exact |
| `src/main/ipc/languageChannels.test.ts` | test | — | `src/renderer/auth/errorCopy.test.ts` | role-match |
| `src/main/ipc/themeChannels.test.ts` | test | — | `src/renderer/auth/errorCopy.test.ts` | role-match |
| `src/renderer/i18n/i18n.test.ts` | test | — | `src/renderer/auth/errorCopy.test.ts` | role-match |

---

## Pattern Assignments

### `src/main/ipc/languageChannels.ts` (service, request-response)

**Analog:** `src/main/ipc/severityChannels.ts`
**Match:** Exact — same role, same data flow, same framework (electron-store ESM lazy singleton + Zod)

**Full analog** (`src/main/ipc/severityChannels.ts`, lines 1–77):

```typescript
// File-level JSDoc block pattern (lines 1–19):
/**
 * IPC handlers for severity preference (kick vs ban).
 * Persists the user's choice across app launches via electron-store in the main process.
 * Severity is a non-secret preference — stored as plain JSON in userData (not safeStorage).
 * safeStorage is reserved for the session credential only (CLAUDE.md).
 * ...
 */
```

**Imports pattern** (lines 21–23):
```typescript
import { ipcMain } from 'electron'
import { z } from 'zod'
import { SEVERITY_GET, SEVERITY_SET } from '@shared/channels'
```

**Zod schema pattern** (lines 30–30):
```typescript
const SeveritySchema = z.object({ severity: z.enum(['kick', 'ban']) })
```

**ESM lazy store pattern** (lines 36–45):
```typescript
type SeverityStore = import('electron-store').default<{ severity: 'kick' | 'ban' }>
let _store: SeverityStore | null = null

async function getStore(): Promise<SeverityStore> {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store<{ severity: 'kick' | 'ban' }>({ defaults: { severity: 'ban' } })
  }
  return _store
}
```

**Handler registration pattern** (lines 61–77):
```typescript
export function registerSeverityChannels(): void {
  ipcMain.handle(SEVERITY_GET, async () => {
    const store = await getStore()
    return store.get('severity', 'ban')
  })

  ipcMain.handle(SEVERITY_SET, async (_event, payload: unknown) => {
    const { severity } = SeveritySchema.parse(payload)
    const store = await getStore()
    store.set('severity', severity)
    return severity
  })
}
```

**Key differences for `languageChannels.ts`:**
- Schema: `z.object({ language: z.enum(['en', 'cs']) })`
- Store type: `{ language: 'en' | 'cs' }`
- No `defaults` on the store — `LANGUAGE_GET` returns `null` (not a hardcoded default) so the renderer can detect "first launch" and apply OS locale detection
- `store.get('language') ?? null` instead of `store.get('language', 'ban')`
- Export function named `registerLanguageChannels`
- Import `LANGUAGE_GET, LANGUAGE_SET` from `@shared/channels`

---

### `src/main/ipc/themeChannels.ts` (service, request-response)

**Analog:** `src/main/ipc/severityChannels.ts`
**Match:** Exact — same pattern, with one addition: `nativeTheme.themeSource` side-effect in the SET handler.

**Core pattern** — copy `severityChannels.ts` wholesale with these differences:
- Schema: `z.object({ theme: z.enum(['light', 'dark']) })`
- Store type: `{ theme: 'light' | 'dark' }`
- No defaults on store — `THEME_GET` returns `null` on first launch
- In `THEME_SET` handler, after `store.set('theme', theme)` add:
  ```typescript
  import { nativeTheme } from 'electron'
  // (at top of file)
  nativeTheme.themeSource = theme  // 'light' | 'dark' — overrides OS; existing syncRendererTheme fires via 'updated' event
  ```
- Export function named `registerThemeChannels`
- Import `THEME_GET, THEME_SET` from `@shared/channels`

**nativeTheme context** (`src/main/index.ts`, lines 54–66):
```typescript
const syncRendererTheme = (): void => {
  const dark = nativeTheme.shouldUseDarkColors
  mainWindow.webContents
    .executeJavaScript(`document.documentElement.classList.toggle('dark', ${dark})`)
    .catch(() => {})
}
mainWindow.webContents.on('did-finish-load', syncRendererTheme)
nativeTheme.on('updated', syncRendererTheme)
mainWindow.on('closed', () => {
  nativeTheme.removeListener('updated', syncRendererTheme)
})
```
Setting `nativeTheme.themeSource = 'light' | 'dark'` causes the `updated` event to fire, which calls `syncRendererTheme`. No changes to `syncRendererTheme` itself are needed — it reads `shouldUseDarkColors` which now reflects the forced `themeSource`.

---

### `src/shared/channels.ts` (config, augment)

**Analog:** `src/shared/channels.ts` (self)

**Existing severity block pattern** (lines 59–63) — copy this block structure for language and theme:
```typescript
// Severity preference IPC channels (Phase 6, electron-store pref). Non-secret;
// Zod-validated (z.enum(['kick','ban'])) in severityChannels.ts.
export const SEVERITY_GET = 'severity:get' as const
export const SEVERITY_SET = 'severity:set' as const
```

**Add after the SEVERITY block:**
```typescript
// Language preference IPC channels (Phase 8, electron-store pref). Non-secret;
// Zod-validated (z.enum(['en','cs'])) in languageChannels.ts.
export const LANGUAGE_GET = 'language:get' as const
export const LANGUAGE_SET = 'language:set' as const

// Theme preference IPC channels (Phase 8, electron-store pref). Non-secret;
// Zod-validated (z.enum(['light','dark'])) in themeChannels.ts.
export const THEME_GET = 'theme:get' as const
export const THEME_SET = 'theme:set' as const
```

**Also add to the CHANNELS namespace object** (lines 65–102) — four new entries following the same pattern as `SEVERITY_GET`, `SEVERITY_SET`.

---

### `src/preload/index.ts` (middleware, augment)

**Analog:** `src/preload/index.ts` (self) — severity block (lines 160–165) is the direct template.

**Existing severity bridge pattern** (lines 160–165):
```typescript
// ── Severity preference bridge (Phase 6, SAF-01/02/03) ───────────────────
// Non-secret pref channels; Zod-validated (z.enum(['kick','ban'])) in severityChannels.ts.
getSeverity: (): Promise<'kick' | 'ban'> =>
  ipcRenderer.invoke(SEVERITY_GET) as Promise<'kick' | 'ban'>,
setSeverity: (severity: 'kick' | 'ban'): Promise<'kick' | 'ban'> =>
  ipcRenderer.invoke(SEVERITY_SET, { severity }) as Promise<'kick' | 'ban'>,
```

**Add to the `contextBridge.exposeInMainWorld('mrsproper', { ... })` object:**
```typescript
// ── Language preference bridge (Phase 8) ────────────────────────────────
// Non-secret pref channels; Zod-validated (z.enum(['en','cs'])) in languageChannels.ts.
getLanguage: (): Promise<'en' | 'cs' | null> =>
  ipcRenderer.invoke(LANGUAGE_GET) as Promise<'en' | 'cs' | null>,
setLanguage: (language: 'en' | 'cs'): Promise<'en' | 'cs'> =>
  ipcRenderer.invoke(LANGUAGE_SET, { language }) as Promise<'en' | 'cs'>,

// ── Theme preference bridge (Phase 8) ───────────────────────────────────
// Non-secret pref channels; Zod-validated (z.enum(['light','dark'])) in themeChannels.ts.
getTheme: (): Promise<'light' | 'dark' | null> =>
  ipcRenderer.invoke(THEME_GET) as Promise<'light' | 'dark' | null>,
setTheme: (theme: 'light' | 'dark'): Promise<'light' | 'dark'> =>
  ipcRenderer.invoke(THEME_SET, { theme }) as Promise<'light' | 'dark'>,
```

**Also add imports** at top of preload alongside the existing `SEVERITY_GET, SEVERITY_SET` import:
```typescript
LANGUAGE_GET,
LANGUAGE_SET,
THEME_GET,
THEME_SET,
```

---

### `src/renderer/main.tsx` (provider, modify)

**Analog:** `src/renderer/main.tsx` (self — lines 1–24 are the complete current file)

**Current file** (lines 1–24):
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import './styles/globals.css'
import App from './App'

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = (isDark: boolean): void => {
  document.documentElement.classList.toggle('dark', isDark)
}
applyTheme(prefersDark.matches)
prefersDark.addEventListener('change', (e) => applyTheme(e.matches))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Migration:** Replace the entire synchronous body with an `async main()` function. The existing synchronous `applyTheme` + `addEventListener` block is replaced by the pre-mount IPC fetch. The `createRoot` call moves inside `main()`.

**New pattern (full replacement):**
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import './styles/globals.css'
import App from './App'
import { initI18n } from './i18n'

async function main(): Promise<void> {
  // Fetch persisted prefs BEFORE React mounts — eliminates flash of wrong language/theme.
  // Both calls return null on first launch (no stored pref yet).
  const [storedLang, storedTheme] = await Promise.all([
    window.mrsproper.getLanguage().catch(() => null),
    window.mrsproper.getTheme().catch(() => null),
  ])

  // Resolve language: stored pref → OS locale detection → 'en' fallback
  const lng = storedLang ?? (navigator.language.startsWith('cs') ? 'cs' : 'en')
  await initI18n(lng as 'en' | 'cs')

  // Apply theme before first paint — main process syncRendererTheme fires on did-finish-load,
  // which is after paint. Direct classList toggle here is the only way to avoid flash.
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

**Critical note:** The existing `prefersDark.addEventListener` listener is dropped — OS theme changes after first paint are handled by main's `syncRendererTheme` (via `nativeTheme.on('updated')`), which continues to work unchanged.

---

### `src/renderer/shell/SettingsMenu.tsx` (component, extend)

**Analog:** `src/renderer/shell/SettingsMenu.tsx` (self — 79 lines, complete)

**Existing state + handlers pattern** (lines 16–22):
```typescript
const [dialogOpen, setDialogOpen] = useState(false)
const [menuOpen, setMenuOpen] = useState(false)

const handleLogoutClick = (): void => {
  setMenuOpen(false)
  setDialogOpen(true)
}
```

**Existing menu item pattern** (lines 62–69):
```typescript
<button
  type="button"
  role="menuitem"
  onClick={handleLogoutClick}
  className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
>
  Log out
</button>
```

**Existing backdrop + menu container pattern** (lines 49–73): The `role="menu"` div with `aria-label="Settings menu"`, backdrop div above it, and `min-w-[160px]` dropdown.

**Migration approach:**
1. Add `const { t, i18n } = useTranslation('shell')` at top of component
2. Add two new state pieces: `activeLanguage` (read from `i18n.language`) and `activeTheme` (local state, initialized from pre-mount applied class)
3. Add handlers following the `handleLogoutClick` pattern:
   ```typescript
   const handleLanguageSelect = async (lang: 'en' | 'cs'): Promise<void> => {
     setMenuOpen(false)
     await i18n.changeLanguage(lang)
     await window.mrsproper.setLanguage(lang)
   }
   const handleThemeSelect = async (theme: 'light' | 'dark'): Promise<void> => {
     setMenuOpen(false)
     document.documentElement.classList.toggle('dark', theme === 'dark')
     setActiveTheme(theme)
     await window.mrsproper.setTheme(theme)
   }
   ```
4. Replace all hardcoded strings with `t()` calls: `"Settings"` → `t('settingsLabel')`, `"Settings menu"` → `t('settingsMenuAriaLabel')`, `"Log out"` → `t('logOut')`
5. Add Language and Theme rows above "Log out" in the menu, using `Check` icon from `lucide-react` for the active indicator

---

### `src/renderer/i18n/index.ts` (service, transform)

**No exact analog** — this is new infrastructure. Pattern comes from RESEARCH.md Pattern 1 and the copy module structure.

**Key structural references:**
- Copy module key naming (e.g., `ERROR_COPY` keys → `auth.errorCode.PHONE_NUMBER_INVALID`)
- i18next API pattern from RESEARCH.md Pattern 1
- `resolveJsonModule` must be `true` in renderer tsconfig (check before writing)

**Core pattern** (from RESEARCH.md Pattern 1):
```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
// Static imports — bundled by Vite, no HTTP backend (offline + CSP constraint)
import enAuth from './locales/en/auth.json'
// ... (all 12 JSON files)

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
      interpolation: { escapeValue: false },  // React already escapes
      react: { useSuspense: false },           // pre-mount await handles loading
    })
}

export default i18n
```

---

### `src/renderer/i18n/i18next.d.ts` (config)

**No analog in codebase** — TypeScript declaration file for i18next typed keys.

**Pattern from RESEARCH.md:**
```typescript
import { resources } from './index'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'shell'
    resources: typeof resources['en']
  }
}
```

---

### `src/renderer/lib/format.ts` (utility, transform)

**Analog:** `src/renderer/groups/groupsCopy.ts` (lines 70–74) and `src/renderer/removal/removalCopy.ts` (lines 147–149)

**Functions to rescue from deleted copy modules:**

`formatMemberCount` (from `groupsCopy.ts` lines 70–74):
```typescript
export function formatMemberCount(count: number | null): string {
  if (count === null) return ''
  if (count < 1000) return count.toString()
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(count)
}
```

`summaryTimestamp` (from `removalCopy.ts` lines 147–149):
```typescript
export function summaryTimestamp(isoString: string): string {
  return `Finished ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(isoString))}`
}
```

`formatFoundIn` (from `searchCopy.ts` lines 67–74):
```typescript
export function formatFoundIn(titles: string[], max = 2): string {
  if (titles.length === 0) return ''
  const shown = titles.slice(0, max).join(', ')
  if (titles.length > max) {
    return `${shown} +${titles.length - max} more`
  }
  return shown
}
```

These are pure JS utilities (not translatable copy) that must be moved before the copy modules are deleted. All consumers of these functions must be updated to import from `@renderer/lib/format` instead.

---

### `src/renderer/auth/FloodCountdown.tsx` (component, modify)

**Analog:** `src/renderer/auth/FloodCountdown.tsx` (self — 32 lines, complete)

**Current hardcoded string** (line 27):
```typescript
aria-label={`Wait ${formatCountdown(remaining)} before trying again`}
```

**Migration:** Replace with `t()` call. The `formatCountdown(remaining)` result is dynamic Telegram data (a timer value) — keep it verbatim as an interpolation variable:
```typescript
const { t } = useTranslation('auth')
// ...
aria-label={t('floodCountdownAria', { time: formatCountdown(remaining) })}
```

JSON key: `"floodCountdownAria": "Wait {{time}} before trying again"` (en), `"Počkejte {{time}} před dalším pokusem"` (cs).

---

### Copy module JSON files: `src/renderer/i18n/locales/en/*.json` and `src/renderer/i18n/locales/cs/*.json`

**Analog:** The six `*Copy.ts` modules are the direct key inventory source.

**Key naming convention:** Mirror the existing property names from the copy modules where practical. Examples:
- `ERROR_COPY.PHONE_NUMBER_INVALID` → `auth.json` key `"errorCode": { "PHONE_NUMBER_INVALID": "..." }`
- `wizardCopy.reviewTitle` → `wizard.json` key `"reviewTitle": "..."`
- `wizardCopy.stageLabel.target` → `wizard.json` key `"stageLabel": { "target": "..." }`
- `removalCopy.rowStatus.removing` → `removal.json` key `"rowStatus": { "removing": "..." }`

**Plural key pattern** (from RESEARCH.md Pattern 3 — verified via `Intl.PluralRules('cs')`):
```json
// en/wizard.json — English (2 plural forms)
{
  "memberCount_one": "{{count}} member",
  "memberCount_other": "{{count}} members"
}

// cs/wizard.json — Czech (3 plural forms)
{
  "memberCount_one": "{{count}} člen",
  "memberCount_few": "{{count}} členové",
  "memberCount_other": "{{count}} členů"
}
```

**Parameterized function → interpolation pattern** (from RESEARCH.md Pattern 4):
```json
// en/removal.json
{
  "confirmTitleBan_one": "Ban {{name}} from {{count}} group?",
  "confirmTitleBan_other": "Ban {{name}} from {{count}} groups?",
  "confirmTitleKick_one": "Remove {{name}} from {{count}} group?",
  "confirmTitleKick_other": "Remove {{name}} from {{count}} groups?"
}
```

**DO NOT translate:**
- Language option labels: `"English"` stays `"English"` in both locales; `"Česky"` stays `"Česky"` in both locales
- Telegram error codes used verbatim in explanations (e.g., `FLOOD_WAIT` in parentheses)

---

### Test files

#### `src/renderer/auth/errorCopy.test.ts` (rewrite, not new)

**Analog:** Current `src/renderer/auth/errorCopy.test.ts` (78 lines) — same semantic assertions, new import.

**Current import pattern** (lines 1–6):
```typescript
import { describe, it, expect } from 'vitest'
import { getErrorCopy, ERROR_COPY, INVALID_PHONE_FORMAT_COPY } from './errorCopy'
import type { AuthErrorCode } from '@shared/authTypes'
```

**New import pattern after migration:**
```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n } from '@renderer/i18n'
import type { AuthErrorCode } from '@shared/authTypes'

beforeAll(async () => {
  await initI18n('en')
})
```

**Assertion migration pattern:**
```typescript
// Before (current):
expect(getErrorCopy('FLOOD_WAIT')).not.toContain('FLOOD_WAIT')

// After (migrated):
expect(i18n.t('auth:errorCode.FLOOD_WAIT')).not.toContain('FLOOD_WAIT')
expect(i18n.t('auth:errorCode.FLOOD_WAIT').length).toBeGreaterThan(0)
```

The full set of semantic assertions is preserved — jargon-free, mentions the right human concept (number, code, password, connection). Add Czech-locale assertions for LOC-03:
```typescript
// Czech assertions (add separate describe block):
beforeAll(async () => { await i18n.changeLanguage('cs') })
// same jargon-free checks in Czech
```

#### `src/main/ipc/languageChannels.test.ts` and `src/main/ipc/themeChannels.test.ts` (new)

**Analog:** `src/renderer/auth/errorCopy.test.ts` — vitest describe/it/expect structure.

**vitest config context** (`vitest.config.ts` key lines):
- `environment: 'node'`
- `globals: false` (must import from vitest)
- `alias: { '@renderer': resolve(__dirname, 'src/renderer') }`

**Pattern for IPC channel tests** — mock electron-store and ipcMain, test Zod rejection:
```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock electron-store before importing the channel module
vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  })),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

describe('languageChannels', () => {
  it('LANGUAGE_SET rejects invalid locale', async () => {
    // Extract handler from ipcMain.handle mock calls and call it directly
    // Assert ZodError thrown for payload { language: 'de' }
  })
  it('LANGUAGE_SET accepts en and cs', async () => { ... })
  it('LANGUAGE_GET returns null when no pref stored', async () => { ... })
})
```

#### `src/renderer/i18n/i18n.test.ts` (new)

**Analog:** `src/renderer/auth/errorCopy.test.ts` — describe/it/expect pattern with `beforeAll`.

**Pattern:**
```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n } from '@renderer/i18n'

describe('i18n initialization', () => {
  beforeAll(async () => { await initI18n('en') })

  it('initializes without error', () => {
    expect(i18n.isInitialized).toBe(true)
  })

  it('all six namespaces load without error', () => {
    for (const ns of ['auth', 'target', 'groups', 'wizard', 'removal', 'shell']) {
      expect(i18n.hasResourceBundle('en', ns), `Missing en/${ns}`).toBe(true)
      expect(i18n.hasResourceBundle('cs', ns), `Missing cs/${ns}`).toBe(true)
    }
  })

  it('t() returns non-empty string (not key passthrough) for known key', () => {
    expect(i18n.t('auth:errorCode.FLOOD_WAIT')).not.toBe('auth:errorCode.FLOOD_WAIT')
    expect(i18n.t('auth:errorCode.FLOOD_WAIT').length).toBeGreaterThan(0)
  })
})

describe('Czech plural forms (LOC-03)', () => {
  beforeAll(async () => { await i18n.changeLanguage('cs') })

  it('groupCount: 1 → _one form', () => {
    const result = i18n.t('wizard:groupCount', { count: 1 })
    expect(result).not.toContain('_one')   // key not passed through
    expect(result).toContain('skupina')     // Czech singular
  })

  it('groupCount: 2 → _few form', () => {
    const result = i18n.t('wizard:groupCount', { count: 2 })
    expect(result).toContain('skupiny')    // Czech few
  })

  it('groupCount: 5 → _other form', () => {
    const result = i18n.t('wizard:groupCount', { count: 5 })
    expect(result).toContain('skupin')     // Czech other
  })
})
```

---

## Shared Patterns

### electron-store ESM lazy singleton
**Source:** `src/main/ipc/severityChannels.ts` lines 36–45
**Apply to:** `languageChannels.ts`, `themeChannels.ts`
```typescript
type XxxStore = import('electron-store').default<{ key: ValType }>
let _store: XxxStore | null = null

async function getStore(): Promise<XxxStore> {
  if (!_store) {
    const { default: Store } = await import('electron-store')
    _store = new Store<{ key: ValType }>()  // omit defaults for nullable prefs
  }
  return _store
}
```

### Zod IPC payload validation
**Source:** `src/main/ipc/severityChannels.ts` lines 30, 71
**Apply to:** `languageChannels.ts`, `themeChannels.ts`
```typescript
const XxxSchema = z.object({ key: z.enum([...]) })
// In handler:
const { key } = XxxSchema.parse(payload)  // throws ZodError before store.set()
```

### contextBridge method pair (GET + SET)
**Source:** `src/preload/index.ts` lines 160–165
**Apply to:** Language and Theme bridge entries
```typescript
getXxx: (): Promise<ValType | null> =>
  ipcRenderer.invoke(XXX_GET) as Promise<ValType | null>,
setXxx: (val: ValType): Promise<ValType> =>
  ipcRenderer.invoke(XXX_SET, { key: val }) as Promise<ValType>,
```

### ipcMain.handle registration pattern
**Source:** `src/main/index.ts` line 18 (import) + app.whenReady block
**Apply to:** `src/main/index.ts` — add `registerLanguageChannels()` and `registerThemeChannels()` calls alongside existing `registerSeverityChannels()` call
```typescript
import { registerSeverityChannels } from './ipc/severityChannels'
// Add:
import { registerLanguageChannels } from './ipc/languageChannels'
import { registerThemeChannels } from './ipc/themeChannels'
// In app.whenReady():
registerSeverityChannels()
registerLanguageChannels()
registerThemeChannels()
```

### Channel constant block
**Source:** `src/shared/channels.ts` lines 59–63
**Apply to:** New `LANGUAGE_*` and `THEME_*` constants and CHANNELS namespace entries

### useTranslation hook (component pattern)
**Source:** react-i18next standard — no codebase analog yet
**Apply to:** Every component that currently imports a `*Copy.ts` module
```typescript
// Replace: import { wizardCopy } from '../wizard/wizardCopy'
// With:
import { useTranslation } from 'react-i18next'
// Inside component:
const { t } = useTranslation('wizard')
// Usage: wizardCopy.reviewTitle → t('reviewTitle')
// Usage: wizardCopy.confirmLabel(severity, name, n) → t(`confirmLabel${capitalize(severity)}`, { name, count: n })
```

### CSS theme tokens
**Source:** `src/renderer/styles/globals.css` lines 10–104
**Apply to:** No changes needed — `:root` (light) and `.dark` tokens are already fully defined. Phase 8 makes the `.dark` class togglable by user choice; no new CSS variables needed.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/renderer/i18n/i18next.d.ts` | config | — | TypeScript module augmentation — no precedent in this codebase; follow RESEARCH.md pattern exactly |
| `src/renderer/i18n/locales/en/*.json` + `cs/*.json` | config | — | Translation resource files — content derived from copy module inventory in RESEARCH.md; no JSON resource files exist yet |

---

## Copy Module Deletion Checklist

Before deleting each `*Copy.ts` module, the planner must ensure:

1. All consumers of that module have been migrated to `useTranslation()` / `t()`
2. Any pure utility functions (not translatable) have been moved to `src/renderer/lib/format.ts`
3. The module's test file (`errorCopy.test.ts`) has been rewritten to use the i18n layer

| Module | Utility functions to rescue | Consumer files to update |
|--------|-----------------------------|--------------------------|
| `errorCopy.ts` | none | `PhoneStep.tsx`, `CodeStep.tsx`, `PasswordStep.tsx` + any that call `getErrorCopy` |
| `resolveCopy.ts` | none | `TargetInput.tsx`, `TargetCard.tsx` |
| `searchCopy.ts` | `formatFoundIn` → `lib/format.ts` | `TargetInput.tsx`, `CandidateRow.tsx`, search-related components |
| `groupsCopy.ts` | `formatMemberCount` → `lib/format.ts` | `GroupRow.tsx`, `GroupsPane.tsx` |
| `wizardCopy.ts` | none (`s()` helper is eliminated by plural keys) | `ReviewScreen.tsx`, `StepIndicator.tsx`, groups toolbar |
| `removalCopy.ts` | `summaryTimestamp` → `lib/format.ts` | `ResumeJobDialog.tsx`, `ReviewScreen.tsx`, removal band |

---

## Metadata

**Analog search scope:** `src/main/ipc/`, `src/shared/`, `src/preload/`, `src/renderer/` (all subdirectories)
**Files scanned:** 14 source files read directly; 4 bash grep passes
**Pattern extraction date:** 2026-06-13
