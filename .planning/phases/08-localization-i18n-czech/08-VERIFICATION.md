---
phase: 08-localization-i18n-czech
verified: 2026-06-13T03:00:00Z
status: human_needed
score: 7/7
overrides_applied: 0
human_verification:
  - test: "Language switch takes effect without restart — click Česky in Settings, walk all screens"
    expected: "Every screen shows Czech immediately, no English strings visible, no page reload"
    why_human: "Runtime DOM rendering cannot be verified programmatically; requires visual inspection of all screens in Czech mode"
  - test: "Czech plural forms visually correct in running app with real group counts"
    expected: "1 group → '1 skupina', 2–4 groups → '2 skupiny', 5+ groups → '5 skupin'"
    why_human: "The i18n.test.ts confirms the translations exist; human confirmation that the correct plural form is selected in the running UI context (already done during UAT but recorded here for completeness)"
  - test: "No flash of wrong language or theme on relaunch — set Czech + Day, quit, relaunch"
    expected: "First paint shows Czech AND Day theme with zero flash of wrong state"
    why_human: "Startup visual timing requires running the app and observing; cannot be detected by static analysis"
  - test: "OS theme change does not override stored Day/Night user preference"
    expected: "Toggling macOS System Preferences Appearance while app shows Day keeps app in Day"
    why_human: "nativeTheme interplay requires system-level interaction"
---

# Phase 8: Localization i18n Czech — Verification Report

**Phase Goal:** A user can switch the app language via a Language settings row with English and Česky options, with every UI string externalized through an i18n framework and fully translated to Czech — shipped as v1.5.
**Verified:** 2026-06-13T03:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Settings has Language row with English/Česky options, switching takes effect without restart | VERIFIED (automated gates) | `SettingsMenu.tsx:100–131` — Language section with English/Česky menuitemradio buttons; `handleLanguageSelect` calls `i18n.changeLanguage(lang)` synchronously then persists via IPC; no page reload |
| 2 | No user-facing string hardcoded in components — all through the i18n layer, copy modules migrated | VERIFIED | 17 components use `useTranslation`; `grep` sweep for hardcoded English strings returns 0 hits; all 6 copy modules (errorCopy, resolveCopy, searchCopy, groupsCopy, wizardCopy, removalCopy) source files deleted; only dead `.d.ts`/`.js` build artifacts remain |
| 3 | Full app usable in Czech — every label, error, confirmation gate, progress string | VERIFIED (automated) + human_needed (visual) | All 6 namespaces × both locales loaded (i18n.test.ts confirms non-empty bundles); key parity check: zero EN-only keys in any namespace after plural-suffix normalization; TargetCard, ResumeJobDialog, GroupRow, GroupsPane, SettingsMenu, all auth steps — all use `t()`; human UAT approved all 7 steps |
| 4 | Language preference persists across launches via non-secret pref storage | VERIFIED | `languageChannels.ts` persists to `electron-store` (plain JSON, not safeStorage); `main.tsx:13–19` reads stored pref before mount; OS locale fallback when null; `languageChannels.test.ts` confirms store.set called on SET and retrieved on GET |
| 5 | Czech plural forms correct (1 skupina, 2 skupiny, 5 skupin) | VERIFIED | `i18n.test.ts:57–66` asserts exact strings; `cs/wizard.json` has `groupCount_one`, `groupCount_few`, `groupCount_other`; spot-check via Node: `1 skupina`, `2 skupiny`, `5 skupin` confirmed |
| 6 | No raw Telegram error codes visible as user-readable text in either language | VERIFIED | `errorCopy.test.ts` jargon-free assertions; cs FLOOD_WAIT = "Příliš mnoho pokusů…" (no "FLOOD_WAIT" literal); all 7 AuthErrorCodes, 6 TargetErrorCodes, 5 SearchErrorCodes, 3 GroupErrorCodes, 6 RmvErrorCodes mapped in both locales |
| 7 | Theme preference (Day/Night) persists across launches via non-secret pref storage | VERIFIED | `themeChannels.ts` persists via `electron-store`; CR-02 fix: `getStoredTheme()` awaited in `app.whenReady()` before `createWindow()` — seeds `nativeTheme.themeSource` before first paint; `themeChannels.test.ts` confirms all paths |

**Score:** 7/7 truths verified (automated evidence)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/main/ipc/languageChannels.ts` | LANGUAGE_GET/SET IPC with Zod enum validation | VERIFIED | Implements GET (returns null on first launch) and SET (z.enum(['en','cs']) rejects invalid locale); `getStore()` lazy singleton |
| `src/main/ipc/themeChannels.ts` | THEME_GET/SET IPC with Zod enum + nativeTheme | VERIFIED | ThemeSchema validates; THEME_SET sets `nativeTheme.themeSource`; exports `getStoredTheme()` for CR-02 launch-time seeding |
| `src/renderer/i18n/index.ts` | i18n init function, 12 bundled JSON imports | VERIFIED | Statically imports all 12 JSON files; `initI18n(lng)` guards re-init; correct i18next + react-i18next config |
| `src/renderer/i18n/locales/en/*.json` (6 files) | Complete English translations | VERIFIED | 6 files present; all 6 namespaces non-empty; zero missing keys |
| `src/renderer/i18n/locales/cs/*.json` (6 files) | Complete Czech translations with plural forms | VERIFIED | 6 files present; en/cs key parity confirmed programmatically (zero EN-only keys across all namespaces); Czech-specific `_few` plural forms present where required |
| `src/renderer/shell/SettingsMenu.tsx` | Language + Theme UI sections, IPC persistence | VERIFIED | Language section at lines 93–131; Theme section at 135–179; both `handleLanguageSelect` and `handleThemeSelect` wrap persistence in try/catch (WR-02 fix) |
| `src/renderer/main.tsx` | Pre-mount pref fetch, i18n init before ReactDOM | VERIFIED | Fetches `getLanguage()`/`getTheme()` before mount; `initI18n(lng)` awaited; OS locale fallback; failure containment via `.catch()` (WR-03 fix) |
| `src/main/ipc/languageChannels.test.ts` | 7 real behavioral tests (no .todo) | VERIFIED | 7 tests covering GET null/stored, SET en/cs accepted, "de" and non-object rejected with ZodError + store untouched |
| `src/main/ipc/themeChannels.test.ts` | 9 real behavioral tests | VERIFIED | 9 tests including nativeTheme.themeSource assertion and getStoredTheme() coverage |
| `src/renderer/i18n/i18n.test.ts` | 8 real tests incl. Czech plural exact-string assertions | VERIFIED | 8 tests; Czech plural forms asserted as exact strings ("1 skupina"/"2 skupiny"/"5 skupin") |
| `src/shared/targetTypes.ts` | LastSeenDTO discriminated union | VERIFIED | `LastSeenDTO = "never" | "online" | { timestamp: number }` — main emits structured DTO, renderer localizes |
| `src/renderer/target/TargetCard.tsx` | All user-facing strings via tTr() | VERIFIED | `useTranslation('target')` with `tTr` alias; 22+ `tTr()` calls covering avatarAlt, badges, idLine, lastSeen, noPhoto, confirm gate |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| SettingsMenu Language row | `i18n.changeLanguage()` | `handleLanguageSelect` | VERIFIED | Line 32: `await i18n.changeLanguage(lang)` — synchronous language swap before menu close |
| SettingsMenu Language row | `electron-store` (persist) | `window.mrsproper.setLanguage` → IPC → `languageChannels.ts` | VERIFIED | Line 36: `await window.mrsproper.setLanguage(lang)` in try/catch |
| `renderer/main.tsx` | `getLanguage()` IPC → i18n init | `window.mrsproper.getLanguage()` → `initI18n(lng)` | VERIFIED | Lines 13–20 fetch stored pref, resolve to locale, await initI18n before mount |
| `main/index.ts` | `nativeTheme.themeSource` seeding | `getStoredTheme()` awaited before `createWindow()` | VERIFIED | Lines 118–126: try/catch reads stored theme, seeds themeSource if 'light' or 'dark' |
| `themeChannels.ts` THEME_SET | `nativeTheme.themeSource` | Direct assignment after Zod validation | VERIFIED | Line 100: `nativeTheme.themeSource = theme` after `ThemeSchema.parse(payload)` |
| Preload bridge | `languageChannels.ts` IPC | `LANGUAGE_GET`/`LANGUAGE_SET` channel constants | VERIFIED | `preload/index.ts:174–177`: getLanguage/setLanguage exposed via contextBridge |
| i18n module | 12 locale JSON bundles | Static import (Vite bundled) | VERIFIED | `index.ts:9–21` — 12 static imports; bundled at build time, no fetch at runtime |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SettingsMenu.tsx` | `i18n.language` | i18n singleton (from `initI18n` + `changeLanguage`) | Yes — state driven by actual locale; set from stored pref at launch | FLOWING |
| `main.tsx` | `storedLang` / `storedTheme` | `window.mrsproper.getLanguage/getTheme()` → `languageChannels.ts` → `electron-store` | Yes — real electron-store read, returns null on first launch | FLOWING |
| `TargetCard.tsx` | `t.lastSeen` (LastSeenDTO) | `targetTypes.ts` discriminated union from `TargetResolver.classifyLastSeen` in main | Yes — main emits typed DTO from GramJS UserStatus; renderer localizes via `renderLastSeen(dto, tTr)` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 278 tests pass (incl. 24 new real behavioral tests) | `npm test` | 278/278, 0 todo | PASS |
| TypeScript build clean | `npx tsc --build` | exit 0, no output | PASS |
| Czech plural forms correct | Node.js spot-check via JSON | `1 skupina`, `2 skupiny`, `5 skupin` | PASS |
| FLOOD_WAIT not exposed as raw code | Node.js spot-check | cs = "Příliš mnoho pokusů…", contains no "FLOOD_WAIT" | PASS |
| All 6 namespaces × both locales non-empty | Node.js key-count check | Zero EN-only keys across all 6 namespaces | PASS |
| No hardcoded English copy module imports in production source | grep sweep | 0 matches | PASS |
| No hardcoded user-facing English strings in components | grep sweep | 0 matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LOC-01 | 08-01 through 08-09 | Settings has Language row with English/Česky; preference persists across launches | SATISFIED | `SettingsMenu.tsx` Language section; `languageChannels.ts` + `electron-store` persistence; `main.tsx` pre-mount pref read; `themeChannels.ts` + CR-02 fix for theme persistence |
| LOC-02 | 08-01 through 08-09 | All user-facing strings externalized through i18n layer | SATISFIED | 17 components using `useTranslation`; 0 hardcoded strings in grep sweep; 6 copy modules deleted; `i18n/index.ts` with 12 static JSON imports |
| LOC-03 | 08-01 through 08-09 | Complete Czech translation of the app | SATISFIED | 6 cs namespace files with full key parity; `_one/_few/_other` plural forms present; errorCopy.test.ts jargon-free Czech assertions passing; human UAT approved all 7 steps |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `08-09-SUMMARY.md` | — | Claims `src/renderer/components/TargetCard.tsx` and `common.json` files — paths inaccurate | Info | TargetCard is at `src/renderer/target/TargetCard.tsx`; lastSeen keys placed in `target.json` not `common.json`. Implementation is correct; SUMMARY path claims are wrong |
| `src/renderer/shell/SettingsMenu.tsx` | 32 | `await i18n.changeLanguage(lang)` is outside the try/catch (IN-06 from code review) | Info | With statically bundled resources this path is effectively unreachable — recorded per review |
| `src/renderer/target/`, `src/renderer/groups/`, etc. | — | Dead `.d.ts`/`.js` build artifacts for old copy modules (resolveCopy, searchCopy, etc.) | Info | Build artifacts only — no corresponding `.ts` source files; no imports; will be cleaned up by `tsc --build` on a clean rebuild |

No TBD/FIXME/XXX markers found in any phase-8 modified files.

### Human Verification Required

The following items cannot be verified programmatically and were partially confirmed by human UAT (approved after one fix cycle). They are documented here per the standard gate for human-verified truths.

#### 1. Full Czech UI coverage — visual inspection across all screens

**Test:** Start app, open Settings, click "Česky"; walk through every screen: PhoneStep/CodeStep/PasswordStep auth flow, CountryPicker, TargetInput (all three modes), CandidateList/CandidateRow results, GroupsPane (empty state, scan progress, group rows), ReviewScreen, run trigger button, confirmation dialog, removal progress, report screen, SettingsMenu.
**Expected:** Every visible string is Czech; no English strings except the self-named "English" option; no raw key passthroughs like "wizard.reviewTitle".
**Why human:** Runtime DOM rendering is language-conditional; static analysis cannot substitute for visual traversal.

#### 2. Language switch instant — no page reload

**Test:** From English, click Česky; observe whether the app reloads or transitions inline.
**Expected:** Language switch is instantaneous — entire app re-renders in Czech without a reload or flash.
**Why human:** React re-render timing requires runtime observation.

#### 3. No flash of wrong language or theme at startup

**Test:** Set language to Czech, theme to Day. Quit the app. Relaunch.
**Expected:** First paint shows Czech + Day (light) with zero flash of English or dark theme.
**Why human:** Startup timing race requires visual observation; the CR-02 fix seeds `nativeTheme.themeSource` before `createWindow()` but the no-flash guarantee requires human verification.

#### 4. OS theme change does not override stored user Day/Night preference

**Test:** With Day theme stored, toggle macOS System Preferences → Appearance → Dark. Observe app.
**Expected:** App stays in Day (light) theme — OS dark mode must not override stored preference.
**Why human:** Requires macOS system-level interaction with nativeTheme observer.

**UAT status:** All 7 steps were approved during plan 08-09 UAT (after one fix cycle for TargetCard). These items are recorded for process completeness — the human approver has already confirmed them.

### Gaps Summary

No blocking gaps found. All 7 observable truths are verified against actual code artifacts. The human verification items above reflect standard UX behaviors already approved in human UAT during plan 08-09.

The only SUMMARY inaccuracy found (path of TargetCard, absence of common.json) does not reflect a code defect — the actual implementation is correct and tested.

---

_Verified: 2026-06-13T03:00:00Z_
_Verifier: Claude (gsd-verifier)_
