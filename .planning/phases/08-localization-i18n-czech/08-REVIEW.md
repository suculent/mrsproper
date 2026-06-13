---
phase: 08-localization-i18n-czech
reviewed: 2026-06-13T00:00:00Z
depth: standard
files_reviewed: 45
files_reviewed_list:
  - src/main/index.ts
  - src/main/ipc/languageChannels.ts
  - src/main/ipc/languageChannels.test.ts
  - src/main/ipc/themeChannels.ts
  - src/main/ipc/themeChannels.test.ts
  - src/main/telegram/TargetResolver.ts
  - src/shared/channels.ts
  - src/shared/targetTypes.ts
  - src/preload/index.ts
  - src/renderer/main.tsx
  - src/renderer/i18n/index.ts
  - src/renderer/i18n/i18next.d.ts
  - src/renderer/i18n/i18n.test.ts
  - src/renderer/i18n/locales/en/auth.json
  - src/renderer/i18n/locales/en/target.json
  - src/renderer/i18n/locales/en/groups.json
  - src/renderer/i18n/locales/en/wizard.json
  - src/renderer/i18n/locales/en/removal.json
  - src/renderer/i18n/locales/en/shell.json
  - src/renderer/i18n/locales/cs/auth.json
  - src/renderer/i18n/locales/cs/target.json
  - src/renderer/i18n/locales/cs/groups.json
  - src/renderer/i18n/locales/cs/wizard.json
  - src/renderer/i18n/locales/cs/removal.json
  - src/renderer/i18n/locales/cs/shell.json
  - src/renderer/ipc/languageClient.ts
  - src/renderer/ipc/themeClient.ts
  - src/renderer/lib/format.ts
  - src/renderer/auth/PhoneStep.tsx
  - src/renderer/auth/CodeStep.tsx
  - src/renderer/auth/PasswordStep.tsx
  - src/renderer/auth/CountryPicker.tsx
  - src/renderer/auth/FloodCountdown.tsx
  - src/renderer/auth/errorCopy.test.ts
  - src/renderer/shell/LogoutDialog.tsx
  - src/renderer/shell/IdentityDisplay.tsx
  - src/renderer/shell/SettingsMenu.tsx
  - src/renderer/target/TargetInput.tsx
  - src/renderer/target/TargetCard.tsx
  - src/renderer/target/CandidateRow.tsx
  - src/renderer/target/CandidateList.tsx
  - src/renderer/groups/GroupRow.tsx
  - src/renderer/groups/GroupsPane.tsx
  - src/renderer/wizard/ReviewScreen.tsx
  - src/renderer/wizard/StepIndicator.tsx
  - src/renderer/removal/ResumeJobDialog.tsx
findings:
  critical: 2
  warning: 6
  info: 5
  total: 13
fixes:
  fixed_at: 2026-06-13T00:00:00Z
  fixed: 9
  remaining_open: 4
  scope: critical + warning + IN-03 (user-visible Czech text)
status: fixed
---

# Phase 8: Code Review Report

**Reviewed:** 2026-06-13
**Depth:** standard
**Files Reviewed:** 45
**Status:** fixed (was: issues_found)

## Fix Resolution (2026-06-13)

All Critical and Warning findings plus IN-03 were fixed; the remaining Info
findings (IN-01, IN-02, IN-04, IN-05) stay open by scope decision. Gates after
fixes: `npm test` 278/278 green (24 new real tests replacing the WR-01 .todo()
stubs), `npx tsc --build` clean.

| Finding | Status | Commit |
|---|---|---|
| CR-01 | fixed | 069b682 |
| CR-02 | fixed | 186a35e |
| WR-01 | fixed | 9a57a01 |
| WR-02 | fixed | 395466a |
| WR-03 | fixed | 34c81e7 |
| WR-04 | fixed | 40ee3bf |
| WR-05 | fixed | 780a5c0 |
| WR-06 | fixed | bd39fc3 |
| IN-03 | fixed | 0401d2e |
| IN-01, IN-02, IN-04, IN-05 | open (out of fix scope) | — |

## Summary

Phase 8 (localization-i18n-czech) was reviewed at standard depth with cross-file
verification of every dynamic `t()` key path against both locale files.

What holds up well:
- Zod validation on LANGUAGE_SET / THEME_SET is correctly implemented (`z.enum` parsed
  before any store write or `nativeTheme.themeSource` assignment) — a compromised
  renderer cannot inject arbitrary values (T-08-01/T-08-02 verified in code).
- electron-store is used only for non-secret prefs; safeStorage paths in
  `src/main/index.ts` are untouched.
- The `LastSeenDTO` discriminated union is correctly produced in main
  (`TargetResolver.classifyLastSeen`) and localized only in the renderer
  (`TargetCard.renderLastSeen`) — the renderer-only i18n boundary holds.
- Every error-code union maps 1:1 to locale keys in BOTH en and cs:
  AuthErrorCode (7), TargetErrorCode (6), SearchErrorCode (5), GroupErrorCode (3),
  RmvErrorCode (6), GreyReason (5), GroupType (3). No missing-key passthroughs found
  for dynamic keys.
- Czech `_one/_few/_other` plural forms are present and parallel with English
  `_one/_other` across all five namespaces that use counts.

What does not hold up:
- The phase's core invariant — "no remaining hardcoded user-facing strings" — is
  violated in 9 components (CR-01). A Czech user sees English in the flood-wait
  button, the entire target-input heading block, the scan counter, sort toggle,
  several aria-labels, and retry links.
- The persisted theme preference is never applied in the main process at launch,
  so the OS-driven `syncRendererTheme` races with (and can override) the user's
  stored choice (CR-02).
- All three new test suites (languageChannels, themeChannels, i18n) remain `.todo()`
  stubs — the Zod-rejection and Czech-plural invariants are asserted nowhere (WR-01).

## Critical Issues

### CR-01: Hardcoded user-facing English strings remain in 9 components — Czech UI shows English

**File:** multiple (inventory below)
**Issue:** The phase invariant "no remaining hardcoded user-facing strings in components"
is violated. Every occurrence below renders literal English to the user (visually or via
screen reader) regardless of the selected language:

| File:Line | String | Surface |
|---|---|---|
| `src/renderer/auth/PhoneStep.tsx:138` | `Try again in{' '}` | flood-wait button text |
| `src/renderer/auth/CodeStep.tsx:169` | `Try again in{' '}` | flood-wait button text |
| `src/renderer/auth/PasswordStep.tsx:129` | `Try again in{' '}` | flood-wait button text |
| `src/renderer/target/TargetInput.tsx:246` | `Who are you removing?` | section heading |
| `src/renderer/target/TargetInput.tsx:248-251` | `Enter their @username or phone number. You'll confirm…` | section description |
| `src/renderer/target/TargetInput.tsx:257` | `Username or phone number` | sr-only label |
| `src/renderer/target/TargetInput.tsx:277` | `placeholder="@username or phone number"` | input placeholder |
| `src/renderer/target/TargetInput.tsx:310,315,320` | `Name` / `Phone` / `Username` | visible mode chips |
| `src/renderer/target/TargetInput.tsx:379` | `` `Wait ${governorFloodRemaining} seconds before trying again` `` | aria-label |
| `src/renderer/target/TargetInput.tsx:392` | `Try again in{' '}` | flood-wait button text |
| `src/renderer/target/CandidateList.tsx:61` | `aria-label="Stop name search"` | aria-label |
| `src/renderer/target/CandidateList.tsx:64` | `Stop search` | visible button text |
| `src/renderer/target/CandidateList.tsx:97` | `aria-label="Search results"` | list aria-label |
| `src/renderer/target/CandidateRow.tsx:95-96` | `` `@${u} · ID ${id}` `` / `` `ID ${id}` `` | identity line ("ID" literal — `target:idLine` key exists and is unused here) |
| `src/renderer/groups/GroupRow.tsx:294` | `retry` | failed-verify retry link (note: cs `greyReason.verify-failed` ends with "—" expecting this link text, so cs renders "Ověření se nezdařilo — retry") |
| `src/renderer/groups/GroupsPane.tsx:406` | `checked {checked} / {total}` | scan progress counter |
| `src/renderer/groups/GroupsPane.tsx:467` | `'A–Z' : 'By size'` | sort toggle label |
| `src/renderer/groups/GroupsPane.tsx:476` | `'Removal in progress' : 'Re-fetch your group list from Telegram'` | refresh tooltip |
| `src/renderer/shell/IdentityDisplay.tsx:53` | `` `${identity.name}'s avatar` `` | avatar alt (English possessive; `target:avatarAlt` pattern exists, shell namespace has no equivalent) |
| `src/renderer/wizard/ReviewScreen.tsx:209` | `ID {targetId}` | identity line |
| `src/renderer/removal/ResumeJobDialog.tsx:85` | `aria-label="Resume removal job"` | aria-label |

**Fix:** Add keys to the appropriate namespaces and replace each literal. Examples:

```tsx
// auth.json (en): "tryAgainIn": "Try again in" / (cs): "Zkuste to znovu za"
<>{t('tryAgainIn')}{' '}<FloodCountdown remaining={floodRemaining} /></>

// GroupsPane scan counter — groups.json: "scan.checkedCounter": "checked {{checked}} / {{total}}"
{tG('scan.checkedCounter', { checked: scan.progress.checked, total: scan.progress.total })}

// GroupRow retry link — reuse the existing removal:retryRowLabel pattern:
// groups.json: "retryScanLabel": "retry" / (cs): "zkusit znovu"
{tG('retryScanLabel')}
```
The aria-only strings (CandidateList, ResumeJobDialog, TargetInput:379) must also go
through `t()` — screen-reader output is user-facing copy.

**Resolution (fixed, 069b682):** All 21 inventoried occurrences externalized. New keys
added to BOTH locales: `target` (inputHeading/inputDescription/inputLabel/inputPlaceholder,
modeChipName/Phone/Username, tryAgainIn, floodWaitAria with cs `_one/_few/_other` plurals,
search.stopAria/stopLabel/resultsAria), `auth:tryAgainIn`, `groups`
(scan.checkedCounter, sortAz/sortBySize, refreshTooltip/refreshBlockedTooltip,
retryScanLabel), `shell:avatarAlt`, `wizard:idLine`, `removal:resumeDestructiveAria`.
CandidateRow now reuses the existing `target:idLine` key. Czech copy uses formal vykání.

### CR-02: Persisted theme is never applied to `nativeTheme` at launch — stored preference races with and is overridden by OS theme

**File:** `src/main/index.ts:56-63` (syncRendererTheme), `src/main/ipc/themeChannels.ts:86`, `src/renderer/main.tsx:24-25`
**Issue:** `THEME_SET` sets `nativeTheme.themeSource` for the current session only. On the
next launch nothing reads the stored theme back into `nativeTheme`, so `themeSource`
is `'system'` again. Consequences for a user whose stored theme differs from the OS theme:

1. `createWindow()` paints `backgroundColor` from `nativeTheme.shouldUseDarkColors`
   (OS value) — wrong-theme flash guaranteed.
2. `syncRendererTheme` fires on `did-finish-load` and executes
   `classList.toggle('dark', <OS value>)` in the renderer. This **races** with the
   renderer's own pre-mount toggle in `main.tsx:25` (which applies the stored theme
   after an async IPC round-trip). Whichever runs last wins — non-deterministic startup
   theme.
3. Any `nativeTheme 'updated'` event during the session (e.g. macOS auto dark mode
   switching at sunset) re-runs `syncRendererTheme` with the OS value and silently
   reverts the user's explicit stored choice mid-session.

The renderer-side toggle in `main.tsx` cannot fix this because main re-asserts the OS
theme on every `updated` event; the two writers disagree about the source of truth.

**Fix:** In `app.whenReady()`, before `createWindow()`, read the persisted theme and seed
`nativeTheme.themeSource` so main and renderer share one source of truth:

```ts
// main/index.ts — before createWindow()
const { default: Store } = await import('electron-store')
const prefStore = new Store<{ theme?: 'light' | 'dark' }>()
const storedTheme = prefStore.get('theme')
if (storedTheme === 'light' || storedTheme === 'dark') {
  nativeTheme.themeSource = storedTheme
}
let currentWin = createWindow() // backgroundColor + syncRendererTheme now honor the pref
```
(Extract the lazy store factory from themeChannels.ts into a shared helper rather than
duplicating it.)

**Resolution (fixed, 186a35e):** `themeChannels.ts` now exports `getStoredTheme()`
(reuses the existing lazy store singleton — no duplicate factory). `app.whenReady()`
awaits it and seeds `nativeTheme.themeSource` BEFORE `createWindow()` (try/catch,
non-fatal fallback to OS theme). With themeSource seeded, `backgroundColor`,
`syncRendererTheme`, and every `nativeTheme 'updated'` event all follow the stored
preference, so OS theme changes no longer override an explicit user choice.

## Warnings

### WR-01: All three new test suites are `.todo()` stubs — Zod rejection and Czech plural invariants are asserted nowhere

**File:** `src/main/ipc/languageChannels.test.ts:29-38`, `src/main/ipc/themeChannels.test.ts:29-39`, `src/renderer/i18n/i18n.test.ts:20-40`
**Issue:** The files are still labeled "RED stubs … pending GREEN implementation" while the
modules they test exist and shipped. Every behavioral case — `LANGUAGE_SET rejects "de"`,
`THEME_SET rejects "blue"`, `THEME_SET sets nativeTheme.themeSource`, all four i18n init
cases, and all four Czech plural cases (LOC-03) — is `it.todo()`. The only executed
assertions are `expect(fn).toBeDefined()` sentinels. The suite passes green while
verifying nothing about the phase's two security-relevant handlers or its plural-form
requirement. The header comments ("module does not exist yet") are also now false.
**Fix:** Implement the stubbed cases. The Zod tests need only invoke the handler captured
from the `ipcMain.handle` mock:

```ts
registerLanguageChannels()
const setHandler = vi.mocked(ipcMain.handle).mock.calls
  .find(([ch]) => ch === 'language:set')![1]
await expect(setHandler({} as never, { language: 'de' })).rejects.toThrow(ZodError)
```
For Czech plurals: `i18n.t('wizard:groupCount', { count: 2 })` must contain "skupiny", etc.
Update the stale header comments.

**Resolution (fixed, 9a57a01):** All three suites implemented (24 real tests, 0 todos).
languageChannels: GET null/stored, SET en/cs accepted, "de" and non-object payloads
rejected with ZodError + store untouched. themeChannels: same matrix for light/dark/"blue",
plus `nativeTheme.themeSource` assertion and `getStoredTheme()` coverage (CR-02 helper).
i18n: isInitialized, all 6 namespaces × both locales non-empty, FLOOD_WAIT non-empty,
no key passthrough; Czech plurals asserted as EXACT strings ("1 skupina"/"2 skupiny"/
"5 skupin") so suffix selection is verified. Stale "module does not exist yet" headers
replaced.

### WR-02: SettingsMenu mutates UI state before persistence and swallows IPC failures as unhandled rejections

**File:** `src/renderer/shell/SettingsMenu.tsx:30-41` (call sites at 94, 110, 136, 155)
**Issue:** `handleLanguageSelect` / `handleThemeSelect` apply the change locally
(`i18n.changeLanguage`, `classList.toggle`, `setActiveTheme`) and then `await`
`setLanguage`/`setTheme`. The handlers are invoked as `void handleLanguageSelect('en')`
with no `.catch`: if the IPC call rejects (handler error, store write failure), the
result is an unhandled promise rejection and a silent divergence — the UI shows the new
language/theme for this session but the preference was never persisted, so the app
reverts on next launch with no feedback.
**Fix:** Catch and at minimum log; ideally revert or surface failure:

```tsx
const handleLanguageSelect = async (lang: 'en' | 'cs'): Promise<void> => {
  setMenuOpen(false)
  await i18n.changeLanguage(lang)
  try {
    await window.mrsproper.setLanguage(lang)
  } catch (err) {
    console.error('Failed to persist language preference', err)
  }
}
```

**Resolution (fixed, 395466a):** Both `handleLanguageSelect` and `handleThemeSelect`
wrap the persistence IPC call in try/catch with `console.error`. The in-session change
still applies; failure only means the preference reverts on next launch — no unhandled
rejection, no UI crash.

### WR-03: `main.tsx` has no failure containment — any pre-mount error leaves a permanently blank window

**File:** `src/renderer/main.tsx:10-34`
**Issue:** The IPC pref fetches are individually guarded with `.catch(() => null)` (good),
but `initI18n()` and `ReactDOM.createRoot(...).render(...)` are not. `void main()`
discards the promise, so if `initI18n` rejects or `getElementById('root')` is null
(the `as HTMLElement` cast hides this), the app never mounts, the user gets a blank
window, and the only trace is an unhandled-rejection in a DevTools console no end user
will open. For a desktop tool aimed at non-technical admins this is a dead-end failure
mode.
**Fix:** Wrap the body and fall back to mounting with defaults:

```tsx
void main().catch((err) => {
  console.error('Renderer bootstrap failed', err)
  // last-resort mount in English so the app is not a blank window
  ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
})
```

**Resolution (fixed, 34c81e7):** `void main()` replaced with `main().catch(...)` that
logs and attempts a last-resort mount with defaults; if even that fails (e.g. #root
missing), `document.body.textContent` shows a bilingual restart message instead of a
blank window. The `as HTMLElement` cast inside `main()` was also replaced with an
explicit null check.

### WR-04: Country names are hardcoded to English and computed once at module load — Czech UI lists countries in English

**File:** `src/renderer/auth/CountryPicker.tsx:27, 51-58`
**Issue:** `new Intl.DisplayNames(['en'], { type: 'region' })` pins country display names
to English, and `COUNTRY_OPTIONS` is a module-level constant, so even a locale-aware
`DisplayNames` would never react to a language switch. In the Czech UI the country
picker (used in both auth and target-input phone mode) shows "Czechia", "Germany",
"Austria" instead of "Česko", "Německo", "Rakousko" — and the search filter only matches
English names, so a Czech user typing "Německo" finds nothing. Unlike
`formatMemberCount` (where the `'en'` pin is a documented decision), no decision record
covers this.
**Fix:** Build the option list per language and memoize on `i18n.language`:

```tsx
const options = useMemo(() => buildCountryOptions(i18n.language), [i18n.language])
// buildCountryOptions(lang) uses new Intl.DisplayNames([lang], { type: 'region' })
```

**Resolution (fixed, 40ee3bf):** `buildCountryOptions(lang)` builds and locale-sorts
(`localeCompare(..., lang)`) the list per language; the component memoizes on
`i18n.language`, so both display names and the search filter follow the active UI
language. `COUNTRY_OPTIONS` remains the exported English baseline for module-level
code/dialCode consumers (TargetInput locale guess, DEFAULT_COUNTRY).

### WR-05: Stale `t` captured in `useCallback` — validation errors render in the previously selected language

**File:** `src/renderer/auth/PhoneStep.tsx:52-70` (deps `[country, national]`), `src/renderer/target/TargetInput.tsx:173-211` (deps `[mode, normalized, isResolving, isFlood, isNameSearchRunning, country]`)
**Issue:** Both submit handlers call `t('invalidPhoneFormat')` / `t('invalidUsernameFormat')` /
`t('search.minLengthError')` inside `useCallback` closures whose dependency arrays omit
`t`. react-i18next produces a new `t` when the language changes; the memoized callback
keeps the old one. Repro: switch language in SettingsMenu, then submit an invalid phone
number — the inline error appears in the previous language. Server-derived errors are
unaffected (computed during render), which makes the inconsistency more visible.
**Fix:** Add `t` to both dependency arrays (the i18next eslint plugin or
`react-hooks/exhaustive-deps` would have caught this).

**Resolution (fixed, 780a5c0):** `t` added to both `useCallback` dependency arrays
(PhoneStep `handleSubmit`, TargetInput `handleSubmit`).

### WR-06: `CandidateList.handleSelect` lacks try/finally — a failed candidate selection permanently disables every row

**File:** `src/renderer/target/CandidateList.tsx:33-37`
**Issue:** `setSelectingId(userId)` is set before `await searchActions.selectCandidate(userId)`
and cleared only after it resolves. If `selectCandidate` rejects (IPC error, expired
accessHash on the fallback path), `setSelectingId(null)` never runs; `selectingId` stays
set, so every other row is disabled (`disabled={selectingId !== null && …}`) and the
clicked row spins forever. The user's only escape is restarting the search.
**Fix:**

```tsx
async function handleSelect(userId: string): Promise<void> {
  setSelectingId(userId)
  try {
    await searchActions.selectCandidate(userId)
  } finally {
    setSelectingId(null)
  }
}
```

**Resolution (fixed, bd39fc3):** Applied exactly as suggested — `selectCandidate`
wrapped in try/finally so `selectingId` is always cleared.

## Info

### IN-01: Dead locale keys `shell.language.en` / `shell.language.cs`

**File:** `src/renderer/i18n/locales/en/shell.json:15-18`, `src/renderer/i18n/locales/cs/shell.json:15-18`
**Issue:** SettingsMenu deliberately hardcodes the self-named labels "English"/"Česky"
(correct UX), so the `language.en`/`language.cs` keys are never referenced anywhere.
**Fix:** Remove the dead keys from both files, or use them in SettingsMenu to keep a
single source for the labels.

### IN-02: LogoutDialog 8-second timeout is never cleared

**File:** `src/renderer/shell/LogoutDialog.tsx:46-49`
**Issue:** The `setTimeout` scheduled after a partial logout is not stored/cleared. If the
user manually closes and reopens the dialog within 8 s, the stale timer fires
`onOpenChange(false)` and closes the newly opened dialog; it also fires after unmount.
**Fix:** Keep the timer id in a ref and clear it in `handleClose` and a `useEffect`
cleanup.

### IN-03: Czech mistranslation in `target:search.nameHint`

**File:** `src/renderer/i18n/locales/cs/target.json:31`
**Issue:** "Funguje první nebo příjmení." is garbled Czech — "první" (first) is missing its
noun. Should read "Funguje křestní jméno i příjmení." (first name or surname works).
**Fix:** Replace with "Funguje křestní jméno i příjmení."

**Resolution (fixed, 0401d2e):** Replaced with "Funguje křestní jméno i příjmení."
(matches the en source "First or last name works.").

### IN-04: `floodCountdownAria` receives raw seconds in the step components but mm:ss in FloodCountdown

**File:** `src/renderer/auth/PhoneStep.tsx:129`, `src/renderer/auth/CodeStep.tsx:160`, `src/renderer/auth/PasswordStep.tsx:120`
**Issue:** The submit buttons interpolate `{ time: floodRemaining }` (raw number, e.g.
"Wait 90 before trying again" — no unit), while `FloodCountdown.tsx:29` interpolates the
formatted `formatCountdown(remaining)` ("Wait 01:30 …"). Screen-reader users get two
different formats for the same countdown, one of them unitless.
**Fix:** Pass `formatCountdown(floodRemaining)` (exported from FloodCountdown.tsx) at all
three call sites.

### IN-05: severity, language, and theme channels each construct an unnamed electron-store — three modules silently share `config.json`

**File:** `src/main/ipc/languageChannels.ts:43`, `src/main/ipc/themeChannels.ts:49`, `src/main/ipc/severityChannels.ts:42`
**Issue:** All three `new Store(...)` calls omit the `name` option, so all three instances
read/write `userData/config.json` under distinct keys. This works today (conf re-reads
the file per access and writes atomically), but the coupling is implicit: a future
`clear()` or `defaults` change in one module mutates the others' file, and the per-module
type parameters (`Store<{ language: … }>`) misrepresent the actual file contents.
**Fix:** Either give each store an explicit shared name with a combined schema type, or
extract one `prefsStore` module used by all three channel files (which would also serve
CR-02's launch-time theme read).

---

_Reviewed: 2026-06-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
