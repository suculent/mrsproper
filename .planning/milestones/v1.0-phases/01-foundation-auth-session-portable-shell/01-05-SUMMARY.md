---
phase: 01-foundation-auth-session-portable-shell
plan: 05
subsystem: renderer-ui
tags: [renderer, auth-ui, stepped-form, identity-display, app-shell, shadcn, libphonenumber-js, d-06, d-07, d-08, d-09, d-10, d-11, d-12, d-13, d-14, d-15, d-16, d-17, d-18, auth-01, auth-02, auth-05, app-01, app-02]

requires:
  - 01-04 (window.mrproper contextBridge surface — 8 members)
  - 01-02 (shared/authTypes.ts, shared/channels.ts)
  - 01-01 (electron-vite scaffold, shadcn/ui components)

provides:
  - src/renderer/ipc/authClient.ts — typed window.mrproper wrapper (no ipcRenderer)
  - src/renderer/store/authStore.ts — useSyncExternalStore AuthState mirror
  - src/renderer/auth/errorCopy.ts — AuthErrorCode → jargon-free UI copy (T-05-02)
  - src/renderer/auth/CountryPicker.tsx — flag+dialCode picker via libphonenumber-js
  - src/renderer/auth/PhoneStep.tsx — pre-send validation, D-09/D-14 loading state
  - src/renderer/auth/CodeStep.tsx — inline error + Resend for expired D-12
  - src/renderer/auth/PasswordStep.tsx — conditional 2FA step
  - src/renderer/auth/FloodCountdown.tsx — mm:ss monospace countdown D-13
  - src/renderer/shell/AppShell.tsx — slim header + main shell layout
  - src/renderer/shell/IdentityDisplay.tsx — 48px avatar, name, Signed-in check, @username D-11
  - src/renderer/shell/SettingsMenu.tsx — ≥44px gear, aria-label Settings, tooltip D-16
  - src/renderer/shell/LogoutDialog.tsx — confirm dialog + serverRevoked warning D-15/D-17
  - src/renderer/shell/StubbedWorkflowRegions.tsx — inert labeled empty states D-10
  - src/renderer/components/ui/popover.tsx — Radix popover (for country picker dropdown)
  - src/renderer/components/ui/tooltip.tsx — Radix tooltip (for settings gear)

affects:
  - Phase 3 (target resolution UI — inherits stepped form, inline error, loading patterns)
  - Phase 4 (group list UI — inherits app shell layout, identity display, stubbed regions)
  - Phase 6 (safety gates UI — inherits confirm dialog, destructive action patterns)

tech-stack:
  added:
    - "@radix-ui/react-popover" — Radix popover primitive (country picker dropdown)
    - "@radix-ui/react-tooltip" — Radix tooltip primitive (settings gear accessibility)
  patterns:
    - useSyncExternalStore external store (authStore — no Redux/Zustand, React 18 native)
    - Typed contextBridge wrapper (authClient — renderer never calls ipcRenderer directly)
    - Stepped form pattern (one step visible, 400px card, Back link on code/2FA only)
    - Inline error pattern (destructive border + AlertCircle + stays on step — D-12)
    - Loading/disabled pattern (Loader2 spinner left of label, inputs disabled — D-09)
    - Live countdown pattern (D-13/D-18: timing source injectable for Phase 2 governor)
    - Initials fallback avatar (no broken image ring when avatar is null — D-11)
    - Server-revoke-failed warning banner (D-17: always wipe, warn if unconfirmed)

key-files:
  created:
    - src/renderer/ipc/authClient.ts
    - src/renderer/store/authStore.ts
    - src/renderer/auth/errorCopy.ts
    - src/renderer/auth/errorCopy.test.ts (12 assertions GREEN)
    - src/renderer/auth/phoneValidation.test.ts (12 assertions GREEN)
    - src/renderer/auth/CountryPicker.tsx
    - src/renderer/auth/PhoneStep.tsx
    - src/renderer/auth/CodeStep.tsx
    - src/renderer/auth/PasswordStep.tsx
    - src/renderer/auth/FloodCountdown.tsx
    - src/renderer/shell/AppShell.tsx
    - src/renderer/shell/IdentityDisplay.tsx
    - src/renderer/shell/SettingsMenu.tsx
    - src/renderer/shell/LogoutDialog.tsx
    - src/renderer/shell/StubbedWorkflowRegions.tsx
    - src/renderer/components/ui/popover.tsx
    - src/renderer/components/ui/tooltip.tsx
  modified:
    - src/renderer/App.tsx (wired step routing — idle/sendingCode/needCode/verifying/needPassword/authorized)
    - electron.vite.config.ts (added @shared/@main alias to main+preload build contexts)

key-decisions:
  - "useSyncExternalStore (React 18 native) chosen over Zustand/Redux — no extra dep, fits the simple single-store use case"
  - "CountryPicker uses Radix Popover + Command for searchable dropdown — more accessible than native select"
  - "authStore resets localFlow to 'phone' only on idle/authorized — error/floodWait keep current step (D-12 compliance)"
  - "FloodCountdown accepts `remaining` prop (not a ref to store) — D-18: timing source stays decoupled for Phase 2 governor"
  - "electron.vite.config.ts main+preload @shared alias added (Rule 3 auto-fix: build was blocked by missing alias)"
  - "@radix-ui/react-popover and @radix-ui/react-tooltip installed — official Radix packages, same provenance as existing radix deps"

duration: 45min
completed: 2026-06-10
---

# Phase 01 Plan 05: React Renderer — Login UI + App Shell Summary

**Build GREEN: stepped phone/code/2FA login UI, FLOOD_WAIT countdown, authenticated shell with identity display, settings-menu logout, and all reusable UI patterns — all over window.mrproper, no GramJS in renderer.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-10T23:18:00Z
- **Completed:** 2026-06-10
- **Tasks:** 2 automated + 1 manual checkpoint (Task 3 — real Telegram login gate)
- **Files created:** 17; Files modified: 2

## Accomplishments

### Task 1: Bridge client + auth store + stepped login UI

**src/renderer/ipc/authClient.ts:**
- Typed thin wrapper over `window.mrproper` — renderer never calls `ipcRenderer` directly
- TypeScript `declare global` types the contextBridge surface per 01-04-SUMMARY.md
- All 8 bridge members wrapped: submitPhone/submitCode/submitPassword/resendCode/getAuthState/logout/onAuthState/onFloodTick

**src/renderer/store/authStore.ts:**
- `useSyncExternalStore` external store (React 18 native, no extra dep)
- Subscribes to `onAuthState` + `onFloodTick` on first component mount; unsubscribes when last component unmounts
- Bootstraps from `getAuthState()` on initialization (catches restore-on-launch state)
- `authActions` object: submitPhone/submitCode/submitPassword/resendCode/logout dispatchers

**src/renderer/auth/errorCopy.ts:**
- `ERROR_COPY` record maps all 7 `AuthErrorCode` values to UI-SPEC plain-language strings
- `getErrorCopy(code)` helper + `INVALID_PHONE_FORMAT_COPY` for pre-send validation failure
- Zero Telegram jargon in any copy string (T-05-02 mitigation verified by test)

**src/renderer/auth/CountryPicker.tsx:**
- Radix Popover + shadcn Command (searchable) — flag emoji + dial code trigger
- `libphonenumber-js/min` for country list + dial codes (245 countries)
- `Intl.DisplayNames` for country names (no extra dep)
- Selecting country never clears typed national number (D-07)

**src/renderer/auth/PhoneStep.tsx:**
- CountryPicker + national Input with 8px gap (sm spacing token)
- Pre-send `isValidPhoneNumber` check from `libphonenumber-js/min` (D-14)
- Invalid format → `INVALID_PHONE_FORMAT_COPY` local error, no server call
- Server error (retryStep === 'phone') renders via `getErrorCopy(code)`
- D-09: Loader2 spinner left of label, button + inputs disabled while processing
- D-13: Flood mode shows "Try again in {mm:ss}" with FloodCountdown, submit disabled

**src/renderer/auth/CodeStep.tsx:**
- Manual entry with monospace input, "We sent a code to your Telegram app" hint (D-08)
- Error stays on code step — no phone-step bounce (D-12)
- Resend link emphasized when PHONE_CODE_EXPIRED (D-12)
- Back link top-left (code step only, per stepped-form pattern)

**src/renderer/auth/PasswordStep.tsx:**
- Conditional — rendered when localFlow === 'password' (needPassword state)
- Optional hint display, inline error stays on password step (D-12 pattern)
- Back link top-left

**src/renderer/auth/FloodCountdown.tsx:**
- Renders `mm:ss` in monospace (`text-mono tabular-nums`) — layout doesn't jitter
- `formatCountdown` exported for unit testing
- D-18: accepts `remaining` prop — timing source fully decoupled for Phase 2 governor

**src/renderer/App.tsx:**
- Routes by `localFlow` (phone/code/password) derived from `auth.step`
- Error/floodWait states keep `localFlow` unchanged (D-12: stay on offending step)
- `authorized` → renders AppShell
- Centered 400px card with bg-card, border, shadow

**Tests:**
- `errorCopy.test.ts`: 12 assertions — all codes covered, no jargon, UI-SPEC copy match ✓
- `phoneValidation.test.ts`: 12 assertions — valid/invalid numbers + FloodCountdown formatter ✓

### Task 2: Authenticated app shell

**src/renderer/shell/IdentityDisplay.tsx (D-11):**
- 48px Avatar with `ring-2 ring-primary ring-offset-2` (accent ring)
- `bytesToDataUrl` converts `Uint8Array` avatar to `data:image/jpeg;base64,…`
- Initials fallback on AvatarFallback (bg-secondary slate circle) — no broken image
- Line 1: display name (text-heading) + green CheckCircle2 + "Signed in" label
- Line 2: `@username` in `text-mono text-muted-foreground` (monospace, muted)

**src/renderer/shell/StubbedWorkflowRegions.tsx (D-10):**
- Two dashed-border sections with `aria-disabled`
- "Nothing to clean up yet" heading + UI-SPEC exact empty-state body
- "Group list" section — visibly inert, not fake-interactive

**src/renderer/shell/SettingsMenu.tsx (D-16):**
- `Button variant="ghost" size="icon"` with `h-11 w-11` (44px hit target)
- `aria-label="Settings"` + Radix Tooltip showing "Settings" on hover
- Simple dropdown menu (no extra dep) with "Log out" as a destructive action
- Opens LogoutDialog on "Log out" click

**src/renderer/shell/LogoutDialog.tsx (D-15/D-17):**
- shadcn Dialog, `sm:max-w-[400px]`
- Title "Log out?" / Body "You'll need to sign in again with a code."
- Cancel (autofocus, outline) + Log out (destructive) — right-aligned (DialogFooter)
- On confirm: calls `authActions.logout()`; stores `serverRevoked` result
- When `serverRevoked === false`: shows red-tinted Alert banner with exact UI-SPEC copy
- D-17: local session always wiped by main regardless (guarantee in SessionManager.ts)

**src/renderer/shell/AppShell.tsx:**
- `bg-secondary border-b` slim top header (secondary surface — UI-SPEC App shell layout)
- App name "MrProper" (text-display) left, IdentityDisplay + SettingsMenu right
- `<main className="flex-1 overflow-auto">` hosting StubbedWorkflowRegions

**Build fix (Rule 3 — blocking):**
- `electron.vite.config.ts` main+preload sections lacked `@shared` resolve alias
- `authChannels.ts` imports `from '@shared/channels'` — build was failing
- Added `resolve.alias: { '@shared': resolve('src/shared'), '@main': resolve('src/main') }` to both main and preload configs

## Reusable UI Patterns Established (Phases 3/4/6 inherit)

| Pattern | Component | Token Usage |
|---------|-----------|-------------|
| Stepped form | PhoneStep/CodeStep/PasswordStep + App.tsx routing | 400px card, text-display title, text-body hint |
| Country picker | CountryPicker.tsx | Popover+Command, 8px gap (sm), libphonenumber-js |
| Loading/disabled | All auth steps + LogoutDialog | Loader2 animate-spin, inputs disabled, ≥300ms visible |
| Inline error | PhoneStep/CodeStep/PasswordStep | AlertCircle 16px, text-label text-destructive, destructive border |
| Live countdown | FloodCountdown.tsx | text-mono tabular-nums, remaining prop (D-18 decoupled) |
| Confirm dialog | LogoutDialog.tsx | Dialog max-w-[400px], Cancel autofocus, destructive Log out |
| Identity display | IdentityDisplay.tsx | 48px ring-primary avatar, text-heading, text-mono @username |
| App shell | AppShell.tsx | bg-secondary header, IdentityDisplay + SettingsMenu |

## Verification

**Automated (both tasks):**
```
npx vitest run

 Test Files  1 failed | 7 passed (8)
      Tests  2 failed | 57 passed (59)
   Duration  327ms
```
- 57 GREEN: all renderer + main tests
- 2 RED: config.test.ts (intentionally RED — build-time env injection, documented in 01-04-SUMMARY)

**Build:**
```
npm run build → ✓ built in 989ms
renderer bundle: 1,085.30 kB (1 chunk)
```

**Security grep (T-05-01):**
- `grep -r "from 'telegram'" src/renderer/` → no results (CLEAN)
- `grep -r "StringSession" src/renderer/` → no results (CLEAN)
- `grep -r "session.save" src/renderer/` → no results (CLEAN)

**Task 3: AWAITING MANUAL PHASE GATE** — see checkpoint below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] electron.vite.config.ts missing @shared alias in main+preload builds**
- **Found during:** Task 2 verification (`npm run build`)
- **Issue:** The main build (authChannels.ts) uses `from '@shared/channels'` but the electron-vite config had `@shared` alias only in the `renderer` section. Rollup could not resolve the import during `electron-vite build`.
- **Fix:** Added `resolve.alias: { '@shared': resolve('src/shared'), '@main': resolve('src/main') }` to both `main` and `preload` sections of `electron.vite.config.ts`.
- **Files modified:** `electron.vite.config.ts`
- **Commit:** 240730a

**2. [Rule 2 - Missing] @radix-ui/react-popover not installed (country picker requires Popover)**
- **Found during:** Task 1 implementation
- **Issue:** CountryPicker requires a Popover + Command combination for the searchable dropdown. `@radix-ui/react-popover` was not in `package.json` despite being a first-party Radix package (same provenance as the 8 already-installed Radix packages).
- **Fix:** Installed `@radix-ui/react-popover` + created `src/renderer/components/ui/popover.tsx` (shadcn pattern). Similarly installed `@radix-ui/react-tooltip` for the settings gear tooltip (D-16 accessibility requirement).
- **Commit:** 88c0d55

## Known Stubs

The following intentional stubs are in scope for this plan (D-10):

| Stub | File | Reason |
|------|------|--------|
| Target-input region | StubbedWorkflowRegions.tsx | Phase 3 delivers target resolution UI |
| Group-list region | StubbedWorkflowRegions.tsx | Phase 4 delivers group enumeration UI |

These stubs are intentional per D-10 and do NOT prevent the plan's goals (AUTH-01/02/05, APP-01/APP-02). The plan explicitly calls for inert labeled empty states in Phase 1.

## Threat Surface Scan

| Concern | File | Assessment |
|---------|------|------------|
| T-05-01: renderer imports GramJS | src/renderer/** | CLEAN — automated grep confirms no `telegram`/`StringSession`/`session.save` in renderer |
| T-05-02: raw error codes in UI | errorCopy.ts | CLEAN — all 7 codes mapped to jargon-free strings, verified by test |
| T-05-03: silent server revoke | LogoutDialog.tsx | MITIGATED — `serverRevoked === false` shows red-tinted warning banner |
| T-05-04: CSP/offline | electron.vite.config.ts | No CDN added — bundled fonts, offline-safe |
| New: @radix-ui/react-popover | package.json | Legitimate Radix package (same org as all other @radix-ui/* in project) |
| New: @radix-ui/react-tooltip | package.json | Legitimate Radix package |

No new network endpoints, external fetch calls, or trust-boundary changes.

## Task Commits

1. **Task 1: Bridge client, auth store, stepped login UI + flood countdown** — `88c0d55`
   - 15 files created/modified
2. **Task 2: Authenticated shell — identity, stubbed regions, settings-menu logout** — `240730a`
   - 6 files created/modified

## Self-Check

Files created (checking key ones):
- src/renderer/ipc/authClient.ts: FOUND
- src/renderer/store/authStore.ts: FOUND
- src/renderer/auth/PhoneStep.tsx: FOUND
- src/renderer/auth/errorCopy.ts: FOUND
- src/renderer/shell/AppShell.tsx: FOUND
- src/renderer/shell/LogoutDialog.tsx: FOUND

Commits:
- 88c0d55: FOUND
- 240730a: FOUND
