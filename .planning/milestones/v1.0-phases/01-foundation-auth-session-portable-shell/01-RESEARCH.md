# Phase 1: Foundation — Auth, Session & Portable Shell - Research

**Researched:** 2026-06-10
**Domain:** Electron + GramJS desktop app — MTProto User-API auth state machine, OS-keystore session persistence, portable macOS/Windows packaging
**Confidence:** HIGH (scaffold toolchain, GramJS auth surface, safeStorage, packaging), MEDIUM (api_id build-time injection details, FLOOD_WAIT-during-login surfacing — design choice not a fixed API)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Electron shell with **GramJS (npm `telegram`) running in-process in the Electron main process**. No sidecar/second runtime.
- **D-02:** Renderer ↔ main over locked-down Electron IPC via a `contextBridge` preload. The renderer must never import GramJS or touch the session string in plaintext; all Telegram I/O and secrets stay in main.
- **D-03:** Session persisted as the GramJS `StringSession`, **encrypted at rest via Electron `safeStorage`** (macOS Keychain / Windows DPAPI). Not `keytar`, not electron-store "encryption".
- **D-04:** App ships with an **embedded api_id/api_hash**, loaded from an untracked env/config at build time — NOT hardcoded in committed source. Credential kill-switch/rotation deferred to v2 (CRED-01). (api_id `36396181`; api_hash in the untracked memory file.)
- **D-05:** Session is **always persisted** after successful login (no "remember me" toggle).
- **D-06:** **Stepped screens** — distinct phone → enter-code → (conditional) 2FA-password screens, one step at a time.
- **D-07:** Phone entry uses a **country picker (flag + dial code) + separate national-number field**.
- **D-08:** Login code entered **manually**, with a hint ("sent to your Telegram app").
- **D-09:** While a login step processes, **inline spinner on the submit button + disable inputs**. No full-screen loader.
- **D-10:** Phase 1 lays out the **full eventual app shell with workflow regions stubbed / non-functional**.
- **D-11:** Prominently confirm the logged-in account with **display name + @username + avatar**.
- **D-12:** Wrong/expired login code → **inline error under the code field, stay on the code step**; offer **"resend code"** for the expired case.
- **D-13:** FLOOD_WAIT during login → **"too many attempts — try again in N seconds" with a live countdown**, disabled submit until clear.
- **D-14:** Phone number → **basic format validation before sending**; surface `PHONE_NUMBER_INVALID` inline.
- **D-15:** Logout shows a **confirmation dialog**.
- **D-16:** Logout control lives in an **app settings / menu** location.
- **D-17:** Logout **always wipes the local session**, even if server-side revocation fails — and in that failure case **warn the user**. Never leave a local session blob behind.
- **D-18:** FLOOD_WAIT-during-login countdown depends on logic that formally belongs to the Phase 2 governor. Planner picks: (a) Phase 1 minimal inline handler Phase 2 generalizes, or (b) Phase 2 governor wraps auth too and Phase 1 anticipates that interface. Choose an approach that avoids rework.

### Claude's Discretion
- App window sizing, single-window behavior, system-tray presence, first-run welcome, and session-expiry/AUTH_KEY-invalidation handling were not discussed — sensible defaults allowed (e.g. silently route an invalidated session back to login with a brief notice). Surface any that become load-bearing.

### Deferred Ideas (OUT OF SCOPE)
- Credential kill-switch / remote rotation (CRED-01); user-supplied api_id (CRED-02); QR login (AUTH-06); multi-account switcher (AUTH-07).
- Responsible-use / consequences warning (belongs to Phase 6 safety gates).
- App-window/tray/first-run polish (planner discretion or later polish pass).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Log in via phone number + login code | GramJS `sendCode()` → `Api.auth.SignIn` flow (§Pattern 2); stepped state machine (§Pattern 4) |
| AUTH-02 | Complete login when account has a 2FA password | `SESSION_PASSWORD_NEEDED` detection → `signInWithPassword()` / `computeCheck` SRP (§Pattern 2) |
| AUTH-03 | Embedded api_id/api_hash, no per-user registration | Build-time injection via env → `define`/`import.meta.env` (§api_id Injection) |
| AUTH-04 | Encrypted persistent session (OS keystore-backed) | `StringSession.save()` → `safeStorage.encryptString` → `userData` file (§Pattern 3) |
| AUTH-05 | Logout revokes server-side authorization + wipes local | `Api.auth.LogOut` then always-wipe sequence with D-17 warning (§Pattern 5) |
| APP-01 | Runs as portable desktop app on macOS | electron-vite + electron-builder `dmg`/`zip` unsigned-runnable (§Packaging) |
| APP-02 | Runs as portable desktop app on Windows | electron-builder `portable`/NSIS unsigned-runnable (§Packaging) |
</phase_requirements>

## Summary

This phase is the genesis of an **Electron + TypeScript + React (Vite)** desktop app where **GramJS (npm `telegram@2.26.22`) runs in-process in the Electron main process** and the React renderer drives a stepped login UI purely over a locked-down `contextBridge` IPC bridge. The single load-bearing security invariant — every secret (api_id/api_hash, the `StringSession`) and every Telegram RPC lives in main; the renderer only sends typed intents and receives typed state — is the architecture from `ARCHITECTURE.md` and must be honored from the first commit.

The recommended scaffold is **electron-vite** (not electron-forge, not hand-rolled): it gives a first-class `main`/`preload`/`renderer` three-bundle split with HMR, TypeScript out of the box, and clean integration with **electron-builder** for portable macOS/Windows output. Pin Electron 42.x, electron-vite 5.x, and **Vite 7** (NOT Vite 8 — `electron-vite@5` peer-depends `vite ^5||^6||^7`; Vite 8 just shipped and ecosystem peer ranges lag — using Vite 7 avoids `npm install` peer conflicts and Rolldown surprises). React 19 + TypeScript 5.x.

The GramJS auth surface gives exactly the control D-06's stepped screens need. **Do not use `client.start()`** (its callback model fights a stepped UI). Instead drive the lower-level flow: `client.sendCode(apiCreds, phone)` → returns `{ phoneCodeHash, isCodeViaApp }`; submit code via `client.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode }))`; **catch the `SESSION_PASSWORD_NEEDED` RPCError** (`err.errorMessage === "SESSION_PASSWORD_NEEDED"`) to branch into the conditional 2FA step, then `client.signInWithPassword(apiCreds, { password })` (which internally does `account.getPassword` → `computeCheck`/SRP → `Api.auth.CheckPassword`). Session persistence is `client.session.save()` (a `StringSession` string) → `safeStorage.encryptString()` → write ciphertext to `app.getPath('userData')`. Logout is `client.invoke(new Api.auth.LogOut({}))` wrapped so the **local wipe always runs even if the server call throws** (D-17).

**Primary recommendation:** electron-vite 5 + Electron 42 + Vite 7 + React 19 + TypeScript 5; GramJS lower-level stepped auth (`sendCode` → `Api.auth.SignIn` → catch `SESSION_PASSWORD_NEEDED` → `signInWithPassword`); `StringSession` + `safeStorage` for at-rest encryption; electron-builder for unsigned-but-runnable portable builds (signing is Phase 7). Build a SessionManager service facade in main that exposes a small typed IPC surface — this becomes the integration point every later phase extends.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MTProto auth flow (phone/code/2FA) | Main process (Node) | — | GramJS is a Node lib; auth is a per-connection secret operation. Renderer must never see it (D-02). |
| Auth state machine orchestration | Main process | Renderer (mirror) | Authoritative state lives in main; renderer holds a derived UI copy fed by IPC events. |
| Session serialization + encryption | Main process | OS keystore (Keychain/DPAPI) | `StringSession` + `safeStorage` are main-only; the OS keystore holds the encryption key. |
| Login UI (stepped screens, validation, countdown) | Renderer (React) | — | Pure presentation + intent dispatch; phone format pre-validation (D-14) can run renderer-side, but the authoritative reject is the server. |
| api_id/api_hash storage | Main bundle (compiled in) | Build-time env injection | Shipped with binary (semi-public); injected at build time so it's not in committed source (D-04). |
| IPC contract / contextBridge | Preload (isolated bridge) | — | The single trust boundary; exposes only whitelisted channels, never the GramJS object. |
| Portable packaging | electron-builder (build tool) | — | Produces the portable macOS/Windows artifacts (APP-01/02). |
| Logout server-revoke + local-wipe | Main process | OS keystore | `Api.auth.LogOut` + file delete; must be atomic-ish with always-wipe semantics (D-17). |

## Standard Stack

### Core
| Library | Version (verified 2026-06-10) | Purpose | Why Standard |
|---------|--------------------------------|---------|--------------|
| `electron` | **42.4.0** | Desktop shell; main process is the GramJS host | [VERIFIED: npm registry] Latest stable; `safeStorage` (Keychain/DPAPI) built in. Re-verify at build time (fast cadence). |
| `telegram` (GramJS) | **2.26.22** (published 2025-02-12) | MTProto User-API client | [VERIFIED: npm registry + CITED: gram.js.org] Only actively-maintained user-API client; runs in main unmodified (pure JS). Locked by project research. |
| `electron-vite` | **5.0.0** | main/preload/renderer build + HMR | [VERIFIED: npm registry] First-class three-bundle Electron split; peer-deps `vite ^5\|\|^6\|\|^7` + `@swc/core ^1`. |
| `vite` | **7.x** (use latest 7.x, NOT 8) | Renderer bundler/dev server | [VERIFIED: npm registry — registry shows 8.0.16 latest] **Pin to 7.x**: `electron-vite@5` does not list Vite 8 in peers; ecosystem peer ranges lag Vite 8. Avoids `npm install` conflicts. |
| `react` + `react-dom` | **19.x** (19.2.7 latest) | Renderer UI | [VERIFIED: npm registry] Standard Electron renderer stack; UI-SPEC assumes React + shadcn/ui. |
| `typescript` | **5.x** (NOT 6) | Language | [ASSUMED] TS 6.0.3 is on registry but very new; electron-vite/React-tooling templates target TS 5.x. Pin 5.x for tooling compatibility; revisit TS 6 later. |

> **Vite 8 caveat (load-bearing):** the npm registry returns `vite@8.0.16` as `latest`. `electron-vite@5` peer range is `^5||^6||^7`. Vite 8 switched the default bundler path (Rolldown) and many plugins' peer ranges have not caught up. **Pin `vite@^7` explicitly in `package.json`** so the renderer toolchain resolves cleanly. [VERIFIED: npm view electron-vite peerDependencies → `{ vite: '^5.0.0 || ^6.0.0 || ^7.0.0' }`]

### Supporting
| Library | Version (verified) | Purpose | When to Use |
|---------|--------------------|---------|-------------|
| `electron-builder` | **26.15.2** | Portable macOS/Windows packaging | [VERIFIED: npm registry] Phase 1 produces unsigned-runnable builds; signing config arrives Phase 7. |
| `electron-store` | **11.0.2** | Non-secret prefs (window size, OS-theme follow) | [VERIFIED: npm registry] Optional. **Never** use its "encryption" for the session (obfuscation only). |
| `@fontsource/inter` | **5.2.8** | Offline Inter font (UI-SPEC) | [VERIFIED: npm registry] Bundle offline — no CDN at runtime. |
| `lucide-react` | (use shadcn-pinned version) | Icons (UI-SPEC) | [VERIFIED: npm registry — note 1.17.0 is `latest` tag; confirm the version shadcn pulls] `Loader2`, `AlertCircle`, gear. |
| `tailwindcss` | **4.x** (4.3.0 latest) | Styling tokens (UI-SPEC) | [VERIFIED: npm registry] shadcn/ui "new-york" + slate. Tailwind 4 config differs from 3 — follow current shadcn init. |
| `libphonenumber-js` | **1.13.6** | Phone format pre-validation (D-14) + country/dial-code list (D-07) | [ASSUMED — discovered via training, exists on registry] Standard for phone parsing; gives country metadata + format checks. Confirm before locking. |
| `zod` | **4.x** (4.4.3 latest) | IPC payload validation (V5 input validation) | [ASSUMED — discovered via training] Validate every IPC payload crossing the trust boundary. Confirm before locking. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-vite | electron-forge (+ Vite plugin) | Forge is heavier, opinionated, and its Vite plugin lags Vite versions (open issue for Vite 8). electron-vite is lighter and the cleaner main/preload/renderer split for this app. |
| electron-vite | Hand-rolled Vite + esbuild for main | More control, much more maintenance; loses HMR-across-processes for free. Not worth it for greenfield. |
| `libphonenumber-js` | `react-phone-number-input` | The latter is a full UI widget; UI-SPEC specifies a custom shadcn `Select` country picker (D-07), so use the parsing lib only, build the picker per UI-SPEC. |
| `client.start()` | `sendCode` + `Api.auth.SignIn` + `signInWithPassword` | `start()`'s callback model assumes a blocking prompt loop — fights the D-06 stepped, event-driven UI. Use the lower-level methods for full control + inline retry/resend. |

**Installation (indicative — verify versions at plan time):**
```bash
# Core runtime
npm install telegram@2.26.22

# Renderer
npm install react@^19 react-dom@^19
npm install @fontsource/inter lucide-react tailwindcss
npm install libphonenumber-js zod        # confirm before locking

# Optional non-secret prefs
npm install electron-store

# Dev / build (pin vite to 7.x explicitly)
npm install -D electron@^42 electron-vite@^5 vite@^7 electron-builder@^26 typescript@^5 @swc/core
```

**Version verification:** all `[VERIFIED: npm registry]` rows confirmed via `npm view <pkg> version` on 2026-06-10. `telegram` confirmed last modified 2025-02-12 (stable, not abandoned). Re-run `npm view electron version` and `npm view telegram version` immediately before locking plans (per STATE.md blocker).

## Package Legitimacy Audit

> slopcheck could NOT be installed/run in this session (sandbox denied installing+executing an agent-chosen package — a reasonable supply-chain guard). Per the graceful-degradation protocol, packages discovered via training/WebSearch are tagged `[ASSUMED]` and the planner MUST gate each non-core install behind a `checkpoint:human-verify` task. Core packages below are cross-verified via official project research (STACK.md) AND the npm registry, but absent slopcheck they remain best-effort.

| Package | Registry | Latest ver | Source Repo | slopcheck | Disposition |
|---------|----------|-----------|-------------|-----------|-------------|
| `telegram` (GramJS) | npm | 2.26.22 | github.com/gram-js/gramjs | unavailable | Approved (project-locked, official docs cited) |
| `electron` | npm | 42.4.0 | github.com/electron/electron | unavailable | Approved (official) |
| `electron-vite` | npm | 5.0.0 | github.com/alex8088/electron-vite | unavailable | Approved (well-known) |
| `electron-builder` | npm | 26.15.2 | github.com/electron-userland/electron-builder | unavailable | Approved (well-known) |
| `vite` / `react` / `react-dom` / `typescript` | npm | 7.x / 19.2.7 / — / 5.x | official orgs | unavailable | Approved (official) |
| `electron-store` | npm | 11.0.2 | github.com/sindresorhus/electron-store | unavailable | Approved (well-known maintainer) |
| `@fontsource/inter` | npm | 5.2.8 | github.com/fontsource/fontsource | unavailable | Approved (well-known) |
| `lucide-react` | npm | (confirm shadcn pin) | github.com/lucide-icons/lucide | unavailable | Approved (well-known) |
| `tailwindcss` | npm | 4.3.0 | github.com/tailwindlabs/tailwindcss | unavailable | Approved (official) |
| `libphonenumber-js` | npm | 1.13.6 | github.com/catamphetamine/libphonenumber-js | unavailable | **Flagged [ASSUMED]** — planner adds checkpoint before install |
| `zod` | npm | 4.4.3 | github.com/colinhacks/zod | unavailable | **Flagged [ASSUMED]** — planner adds checkpoint before install |

**Packages removed due to slopcheck [SLOP]:** none (slopcheck did not run).
**Packages flagged [ASSUMED] (planner inserts `checkpoint:human-verify` before install):** `libphonenumber-js`, `zod`. Also re-verify `lucide-react` version range matches what `npx shadcn add` pulls.

**Postinstall safety note:** `npm view telegram scripts.postinstall` returned empty (no postinstall script) — clean. GramJS deps (`@cryptography/aes`, `big-integer`, `websocket`, `pako`, `socks`, etc.) are pure-JS / well-known; no native build step required, so `@electron/rebuild` is NOT needed for Phase 1.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────── RENDERER (React + shadcn/ui) — NO secrets, NO GramJS ─────────────┐
│                                                                                            │
│  ┌─────────┐   ┌────────┐   ┌──────────┐         ┌──────────────────────────────────────┐ │
│  │ Phone   │──▶│ Code   │──▶│ 2FA pwd  │──▶ ✓ ──▶│ App shell (identity + stubbed regions) │ │
│  │ step    │   │ step   │   │ (cond.)  │         │  + Settings menu → Logout dialog       │ │
│  └─────────┘   └────────┘   └──────────┘         └──────────────────────────────────────┘ │
│       │  intents (submitPhone/submitCode/submitPassword/logout)  ▲  state+event stream     │
└───────┼──────────────────────────────────────────────────────────┼────────────────────────┘
        │  window.mrproper.invoke(channel, payload)                 │  onAuthState / onFloodTick
        ▼  (contextBridge — preload, contextIsolation ON)           │  (webContents.send)
┌──────────────────────── PRELOAD (isolated bridge — whitelist only) ────────────────────────┐
│   exposeInMainWorld('mrproper', { submitPhone, submitCode, submitPassword,                  │
│                                   getAuthState, logout, onAuthState, onFloodTick })         │
└───────┬──────────────────────────────────────────────────────────▲────────────────────────┘
        │  ipcRenderer.invoke / ipcRenderer.on                       │
        ▼  ipcMain.handle                                            │  win.webContents.send
┌──────────────────────── MAIN PROCESS (Node) ───────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────────────────────────────────────┐    │
│  │ SessionManager (the ONE service facade — every later phase extends this)            │    │
│  │   • single TelegramClient(StringSession, apiId, apiHash, {floodSleepThreshold})     │    │
│  │   • AuthStateMachine: idle→sendingCode→needCode→[needPassword]→authorized           │    │
│  │   • sendCode() → Api.auth.SignIn → catch SESSION_PASSWORD_NEEDED → signInWithPassword│    │
│  │   • persist(): session.save() → safeStorage.encryptString → write userData file     │    │
│  │   • restore(): read file → safeStorage.decryptString → new StringSession → connect   │    │
│  │   • logout(): Api.auth.LogOut (try) ───────────► then ALWAYS wipe local (D-17)       │    │
│  │   • classifyError(): RPCError.errorMessage → typed domain error (UI copy lookup)     │    │
│  └────────────────────────────────────────────────────────────────────────────────────┘    │
│        │ MTProto/TLS                                  │ encrypt key                          │
└────────┼─────────────────────────────────────────────┼─────────────────────────────────────┘
         ▼                                              ▼
   ┌────────────┐                          ┌─────────────────────────────┐
   │ Telegram   │                          │ OS keystore (Keychain/DPAPI)│
   │ DCs        │                          │ + ciphertext in userData    │
   └────────────┘                          └─────────────────────────────┘
```

Trace the happy path: renderer `submitPhone` → main `sendCode` → state `needCode` event → renderer shows code step → `submitCode` → `Api.auth.SignIn` → (a) `authorized` → persist + identity, or (b) `SESSION_PASSWORD_NEEDED` → state `needPassword` → renderer shows 2FA step → `submitPassword` → `signInWithPassword` → `authorized` → persist.

### Recommended Project Structure
```
src/
├── main/                         # Electron main — the application core (all secrets/GramJS here)
│   ├── index.ts                  # app lifecycle; createWindow; restore session on ready
│   ├── ipc/
│   │   └── authChannels.ts       # ipcMain.handle registrations; the ONLY renderer surface
│   ├── telegram/
│   │   ├── SessionManager.ts     # single TelegramClient + auth state machine (Pattern 4)
│   │   ├── authFlow.ts           # sendCode → SignIn → SESSION_PASSWORD_NEEDED → signInWithPassword
│   │   ├── errors.ts             # classifyTelegramError(): RPCError → typed domain error
│   │   └── config.ts             # apiId/apiHash injected at build time (NOT committed)
│   └── storage/
│       └── secrets.ts            # safeStorage encrypt/decrypt + userData read/write/delete
├── preload/
│   └── index.ts                  # contextBridge.exposeInMainWorld('mrproper', {...whitelist})
├── renderer/                     # React UI — no GramJS import, no session string
│   ├── App.tsx
│   ├── auth/                     # PhoneStep, CodeStep, PasswordStep, CountryPicker, FloodCountdown
│   ├── shell/                    # AppShell, IdentityDisplay, SettingsMenu, LogoutDialog (stubs)
│   ├── ipc/                      # typed wrappers over window.mrproper
│   └── store/                    # UI state mirror, fed by onAuthState events
└── shared/
    ├── authTypes.ts              # AuthState union, IPC DTOs, error codes (imported by both sides)
    └── channels.ts               # channel-name constants
```

### Pattern 1: contextBridge IPC contract (typed, locked-down)
**What:** Preload exposes ONLY whitelisted async functions + event subscriptions. The renderer never gets the GramJS client, the session string, or raw `ipcRenderer`.
**When to use:** Always — this is the D-02 trust boundary.
```typescript
// preload/index.ts — contextIsolation: true, nodeIntegration: false, sandbox: true
// Source: https://www.electronjs.org/docs/latest/api/context-bridge
import { contextBridge, ipcRenderer } from 'electron';
import type { AuthState, FloodTick } from '../shared/authTypes';

contextBridge.exposeInMainWorld('mrproper', {
  submitPhone:    (p: { dialCode: string; national: string }) => ipcRenderer.invoke('auth:submitPhone', p),
  submitCode:     (p: { code: string }) => ipcRenderer.invoke('auth:submitCode', p),
  submitPassword: (p: { password: string }) => ipcRenderer.invoke('auth:submitPassword', p),
  resendCode:     () => ipcRenderer.invoke('auth:resendCode'),
  getAuthState:   () => ipcRenderer.invoke('auth:getState') as Promise<AuthState>,
  logout:         () => ipcRenderer.invoke('auth:logout'),
  onAuthState:    (cb: (s: AuthState) => void) => {
    const h = (_: unknown, s: AuthState) => cb(s);
    ipcRenderer.on('auth:state', h);
    return () => ipcRenderer.removeListener('auth:state', h);   // always return an unsubscribe
  },
  onFloodTick:    (cb: (t: FloodTick) => void) => {
    const h = (_: unknown, t: FloodTick) => cb(t);
    ipcRenderer.on('auth:floodTick', h);
    return () => ipcRenderer.removeListener('auth:floodTick', h);
  },
});
```
- Window MUST be created with `webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: <path> }`.
- `ipcMain.handle` returns serializable DTOs only — never a GramJS object or the session string.
- Validate every inbound payload in main with `zod` before use (V5 input validation).

### Pattern 2: Stepped GramJS auth flow in main (the lower-level path)
**What:** Drive `sendCode` / `Api.auth.SignIn` / `signInWithPassword` explicitly instead of `client.start()`, so each IPC call advances exactly one step and inline retry/resend (D-12) work without re-entering the phone step.
**When to use:** Always for this app (D-06).
```typescript
// main/telegram/authFlow.ts
// Sources: https://github.com/gram-js/gramjs/blob/master/gramjs/client/auth.ts
//          https://gram.js.org/beta/classes/TelegramClient.html
import { Api } from 'telegram';

// returned by client.sendCode(apiCreds, phoneNumber, forceSMS?)
//   => { phoneCodeHash: string; isCodeViaApp: boolean }
async function startPhone(client, apiCreds, phoneNumber: string) {
  const { phoneCodeHash, isCodeViaApp } = await client.sendCode(apiCreds, phoneNumber);
  return { phoneCodeHash, isCodeViaApp };   // store phoneCodeHash in the state machine
}

// submit code; detect the conditional 2FA branch by RPCError message
async function submitCode(client, phoneNumber: string, phoneCodeHash: string, phoneCode: string) {
  try {
    const res = await client.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode }));
    return { authorized: true, result: res };
  } catch (err: any) {
    // GramJS surfaces this as RPCError with errorMessage === "SESSION_PASSWORD_NEEDED"
    // (gramjs auth.ts uses exactly this string check to branch into signInWithPassword)
    if (err?.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      return { authorized: false, needPassword: true };   // → advance state machine to needPassword
    }
    throw err;   // PHONE_CODE_INVALID / PHONE_CODE_EXPIRED / FLOOD_WAIT_x → classifyTelegramError
  }
}

// 2FA step — signInWithPassword internally: account.getPassword → computeCheck(SRP) → Api.auth.CheckPassword
async function submitPassword(client, apiCreds, password: string) {
  // signInWithPassword(apiCredentials, { password }) returns the authorized user.
  // Do NOT hand-roll SRP — GramJS's computeCheck does it.
  const user = await client.signInWithPassword(apiCreds, { password: async () => password });
  return { authorized: true, user };
}

// post-login identity (D-11): name + @username + avatar bytes
async function fetchIdentity(client) {
  const me = await client.getMe();                                  // User
  const photo = await client.downloadProfilePhoto(me);              // Buffer (empty if none → initials fallback)
  return { name: `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim(),
           username: me.username ?? null,
           id: me.id?.toString(),
           avatar: photo && photo.length ? photo : null };
}
```
> **`apiCreds`** is `{ apiId, apiHash }`. `signInWithPassword`'s `password` field is a callback returning the password string (matches GramJS's `UserPasswordAuthParams`). Confirm the exact `signInWithPassword` arg shape against the installed `telegram@2.26.22` types during planning — it accepts either a value or a callback; the callback form is safest. [CITED: gram-js/gramjs auth.ts]

### Pattern 3: Session persist + restore via safeStorage
**What:** Serialize `StringSession`, encrypt with `safeStorage`, store ciphertext in `userData`; restore on launch.
```typescript
// main/storage/secrets.ts
// Source: https://www.electronjs.org/docs/latest/api/safe-storage
import { app, safeStorage } from 'electron';
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const sessionFile = () => join(app.getPath('userData'), 'session.bin');

export function persistSession(stringSession: string): void {
  // safeStorage requires app 'ready' to have fired before use.
  if (!safeStorage.isEncryptionAvailable()) {
    // D-03 / Pitfall 8: do NOT silently fall back to plaintext. Treat as "can't persist securely".
    throw new Error('ENCRYPTION_UNAVAILABLE');   // → main keeps session in memory only this run
  }
  const cipher: Buffer = safeStorage.encryptString(stringSession);
  writeFileSync(sessionFile(), cipher, { mode: 0o600 });   // restrict perms
}

export function restoreSession(): string | null {
  if (!existsSync(sessionFile())) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;   // can't decrypt → route to login
  try { return safeStorage.decryptString(readFileSync(sessionFile())); }
  catch { return null; }   // corrupt/blob from another key → treat as no session
}

export function wipeSession(): void {
  if (existsSync(sessionFile())) rmSync(sessionFile(), { force: true });
}
```
- On launch: `restoreSession()` → if string, `new StringSession(s)` → `client.connect()`. If connect throws `AUTH_KEY_UNREGISTERED` / `SESSION_REVOKED` / `AUTH_KEY_DUPLICATED`, the saved session is dead → `wipeSession()` and route to login with a brief notice (Claude's discretion default).
- `safeStorage.isEncryptionAvailable() === false`: on macOS/Windows this is rare (Keychain/DPAPI are present), but handle it — keep the session in-memory for the session, warn that "stay-logged-in" is unavailable, do NOT write plaintext.

### Pattern 4: Auth as an explicit state machine in SessionManager
**What:** Model login as `idle → sendingCode → needCode → (needPassword) → authorized | error`. IPC calls are the only transitions; main emits each new state to the renderer via `auth:state`.
```typescript
// shared/authTypes.ts (imported by main AND renderer — single source of truth)
export type AuthState =
  | { step: 'idle' }
  | { step: 'sendingCode' }
  | { step: 'needCode'; sentTo: string; canResend: boolean }
  | { step: 'verifying' }
  | { step: 'needPassword'; hint?: string }
  | { step: 'authorized'; identity: Identity }
  | { step: 'error'; code: AuthErrorCode; retryStep: 'phone' | 'code' | 'password' }
  | { step: 'floodWait'; retryStep: 'code' | 'password'; secondsRemaining: number };
```
- `error` carries `retryStep` so the renderer stays on the offending step (D-12) — never bounces to phone.
- `floodWait` carries `secondsRemaining`; main drives a 1-Hz timer and emits `auth:floodTick` (Pattern 5).

### Pattern 5: Minimal inline FLOOD_WAIT handler (D-18 — seed for Phase 2 governor)
**What:** On `FLOOD_WAIT_x` during `Api.auth.SignIn`/`CheckPassword`, parse `x`, emit a per-second countdown to the renderer, disable submit, re-enable at zero.
**D-18 recommendation:** implement **option (a)** — a tiny standalone `FloodWaitController` in `main/telegram/` whose *timing source is injectable*. Phase 2's governor later supplies the timing source without UI rework. Keep the countdown rendering (UI-SPEC "Live countdown" pattern) decoupled from the timer that drives it.
```typescript
// main/telegram/floodWait.ts
function floodWaitSeconds(err: any): number | null {
  // GramJS FloodWaitError exposes `.seconds`; raw RPCError message is "FLOOD_WAIT_<n>"
  if (typeof err?.seconds === 'number') return err.seconds;
  const m = /FLOOD_WAIT_(\d+)/.exec(err?.errorMessage ?? err?.message ?? '');
  return m ? Number(m[1]) : null;
}

// On catch in submitCode/submitPassword:
//   const wait = floodWaitSeconds(err);
//   if (wait != null) startCountdown(wait, (remaining) => win.webContents.send('auth:floodTick', { remaining }));
```
> **GramJS `floodSleepThreshold`:** the client auto-sleeps+retries when `x <= floodSleepThreshold` (default 60s). For *login*, set `floodSleepThreshold` low (e.g. **0–5s**) so login flood waits are *thrown* (surfaced as a visible countdown D-13) rather than silently slept — a 30s silent freeze on the login screen looks like a hang. [CITED: STACK.md + gram.js.org client params]

### Pattern 6: Revoking logout with always-wipe (D-17)
```typescript
// main/telegram/SessionManager.ts (logout)
async function logout(client): Promise<{ serverRevoked: boolean }> {
  let serverRevoked = false;
  try {
    await client.invoke(new Api.auth.LogOut({}));   // server-side authorization revoke
    serverRevoked = true;
  } catch {
    serverRevoked = false;   // network/RPC failure — do NOT abort the local wipe
  } finally {
    try { await client.disconnect(); } catch {}
    wipeSession();           // ALWAYS — even if server call failed (D-17)
  }
  return { serverRevoked };  // renderer shows the red-tinted warning banner when false
}
```

### Anti-Patterns to Avoid
- **Importing GramJS or the session string in the renderer** — the whole D-02 boundary collapses. All Telegram I/O + secrets stay in main.
- **Using `client.start()` for the stepped UI** — its blocking-callback model fights D-06; you lose clean inline retry/resend.
- **Writing the session to disk in plaintext when `safeStorage` is unavailable** — never. Keep in-memory or refuse to persist (Pitfall 8).
- **Hardcoding api_id/api_hash in committed source** — violates D-04. Inject at build time from untracked env.
- **`nodeIntegration: true` / `contextIsolation: false`** — opens the renderer to the full Node API; defeats the trust boundary.
- **Logout that only deletes the local file** — leaves a live server-side authorization (Pitfall 8). Always call `Api.auth.LogOut` and always wipe local.
- **Bouncing to the phone step on a bad code** — D-12 requires staying on the code step with inline error + resend.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 2FA password verification | Custom SRP / `auth.CheckPassword` payload | GramJS `signInWithPassword` (`computeCheck`) | SRP is cryptographic; one mistake = auth failure or insecure. GramJS implements it correctly. |
| Session at-rest encryption | AES with a binary-embedded key, base64 | Electron `safeStorage` | Key in the binary = trivially extractable (Pitfall 8). safeStorage uses Keychain/DPAPI. |
| MTProto transport / auth-key | Anything | GramJS `TelegramClient` | The whole reason GramJS exists. |
| Phone format validation + country/dial list | Regex per country | `libphonenumber-js` | Per-country rules are huge and change; a regex will reject valid numbers (D-14). |
| Main/preload/renderer bundling | esbuild glue | electron-vite | Three-bundle split + HMR + TS, maintained. |
| Serializing the session | Custom format | GramJS `StringSession.save()` | Portable, library-native string. |
| FLOOD_WAIT seconds parsing | String hacks scattered everywhere | One `floodWaitSeconds()` helper reading `err.seconds` | GramJS `FloodWaitError` already carries `.seconds`. |

**Key insight:** in an auth/session security phase, every hand-rolled crypto or storage primitive is a takeover vector. The libraries here exist precisely because these are footguns — lean on them.

## Common Pitfalls

### Pitfall 1: Stored session = full account takeover if weakly protected
**What goes wrong:** A leaked `StringSession` grants full account access with no phone/code/2FA. Plaintext or binary-keyed "encryption" at rest is a takeover primitive.
**Why it happens:** Libraries default to plaintext; "encrypted" gets implemented as base64 or a constant key.
**How to avoid:** `safeStorage` (OS-keystore-backed) only; `0o600` file perms; never log the session; **logout revokes server-side too** (D-17); on `safeStorage` unavailable, refuse to persist rather than weaken.
**Warning signs:** session readable without keystore unlock; session in logs; logout that only deletes a local file.

### Pitfall 2: Shared api_id flagged/throttled (Pitfall 1/8 from PITFALLS.md)
**What goes wrong:** One shared api_id serves all users; abuse-flagging (`API_ID_PUBLISHED_FLOOD`) or revocation can brick every user at once. A brand-new session doing aggressive actions is high-risk.
**Why it happens:** Devs treat api_id like a quota'd key; Telegram treats it as a reputation/abuse-attribution unit.
**How to avoid (Phase 1 scope):** use the project's **dedicated** api_id (`36396181`, NOT an official client's); treat as semi-public; keep login flood-respecting (Pattern 5). The kill-switch/rotation itself is **deferred to v2 (CRED-01)** — do NOT build it here, but don't design anything that *prevents* a later rotation (keep api creds in one injected `config.ts`).
**Warning signs:** `API_ID_PUBLISHED_FLOOD` at login; simultaneous login failures across users.

### Pitfall 3: `safeStorage` called before app `ready`, or returning false
**What goes wrong:** `safeStorage.isEncryptionAvailable()` returns false / throws if called before the `ready` event; on Linux without a keyring it silently degrades to `basic_text` (plaintext).
**Why it happens:** Eager session restore at module load, before `app.whenReady()`.
**How to avoid:** Only touch `safeStorage` after `app.whenReady()`; check `isEncryptionAvailable()` every time; this app targets macOS/Windows where Keychain/DPAPI are present, but still guard (never assume true). On false, route to login and don't persist.
**Warning signs:** "encryption not available" on first launch; session that re-prompts every relaunch.

### Pitfall 4: 2FA branch missed because the error check is wrong
**What goes wrong:** Code expects a specific error class but GramJS surfaces `SESSION_PASSWORD_NEEDED` as `RPCError.errorMessage === "SESSION_PASSWORD_NEEDED"`. Checking the wrong field never enters the 2FA step → login dead-ends for 2FA users (AUTH-02 broken).
**How to avoid:** branch on `err?.errorMessage === 'SESSION_PASSWORD_NEEDED'` (exactly what gramjs/auth.ts does), OR use `signInUser`/`signInWithPassword` which encapsulate it. Test against a mock that throws this exact shape.
**Warning signs:** 2FA accounts get a generic error after entering the code.

### Pitfall 5: FLOOD_WAIT during login silently slept → looks like a hang
**What goes wrong:** With a high `floodSleepThreshold`, GramJS sleeps 30–60s internally on a login flood wait; the UI shows a frozen spinner (D-13 violated).
**How to avoid:** set `floodSleepThreshold` low for the auth client so login flood waits throw and are surfaced as a visible countdown (Pattern 5). Distinguish `FLOOD_WAIT` (timed, retryable) from terminal errors.
**Warning signs:** login button spins for 30s+ with no feedback.

### Pitfall 6: Distribution friction — unsigned build won't launch for non-technical users
**What goes wrong:** Even though signing is Phase 7, an unsigned Phase-1 build triggers Gatekeeper ("unidentified developer") / SmartScreen on *other* machines. Acceptable for dev/test, but verify it *launches at all* on a clean machine (right-click-open on macOS).
**How to avoid (Phase 1):** produce unsigned portable artifacts; document the dev launch path (macOS: right-click → Open, or `xattr -dr com.apple.quarantine`); test on a clean VM/second machine, not just the dev box. Real signing/notarization is Phase 7 (APP-03).
**Warning signs:** "app is damaged" on macOS; SmartScreen block on Windows; works on dev box only.

## Runtime State Inventory

> This is a greenfield phase (no existing code/data to migrate). Section included for completeness; most categories are N/A.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — first run creates `userData/session.bin`. No prior datastore. | None |
| Live service config | None — no external service config in git. | None |
| OS-registered state | None — no scheduled tasks/services. (Future: macOS Keychain item + Windows DPAPI blob are created at first successful login — that IS the session storage, by design.) | None for Phase 1; document that uninstall leaves the encrypted blob in `userData` (Phase 7 concern). |
| Secrets/env vars | api_id/api_hash live in untracked `~/.claude/.../telegram-api-credentials.md`; must be injected at build time into `config.ts`. No committed secret. | Set up build-time env injection (see §api_id Injection). |
| Build artifacts | None yet (no package.json — `cat package.json` → NO package.json). This phase creates them. | Scaffold creates `dist/`, `out/`, `node_modules/` — add to `.gitignore`. |

**Verified:** `cat package.json` → "NO package.json"; `ls .claude/skills/` → none. Confirmed greenfield.

## api_id / api_hash Build-Time Injection (D-04, AUTH-03)

**Goal:** api_id/api_hash end up in the shipped binary (unavoidable, semi-public) but are NOT in committed source.

**Recommended approach (Vite `define` for renderer is WRONG here — creds live in MAIN):**
1. Store creds in an **untracked `.env`** (gitignored) read at build time, e.g. `MRPROPER_API_ID`, `MRPROPER_API_HASH`. The values come from the project memory file; the developer/CI populates `.env` locally.
2. electron-vite reads env via Vite's env mechanism. For the **main** bundle, inject with `define` in `electron.vite.config.ts`:
```typescript
// electron.vite.config.ts
import { defineConfig } from 'electron-vite';
export default defineConfig({
  main: {
    define: {
      'import.meta.env.MRPROPER_API_ID':   JSON.stringify(process.env.MRPROPER_API_ID),
      'import.meta.env.MRPROPER_API_HASH':  JSON.stringify(process.env.MRPROPER_API_HASH),
    },
  },
  preload: { /* ... */ },
  renderer: { /* ... */ },   // NEVER inject creds into the renderer bundle
});
```
3. `main/telegram/config.ts` reads them: `export const API_ID = Number(import.meta.env.MRPROPER_API_ID); export const API_HASH = import.meta.env.MRPROPER_API_HASH;`
4. `.env` is gitignored; CI provides the vars from a secret store. A committed `.env.example` documents the names (not values).

**Honest caveat (carry from STACK.md):** `define` does literal string substitution → the values land **in the compiled main bundle inside the packaged app** and are extractable. That is acceptable and expected (Telegram intends client api creds to be embedded). The ONLY requirement Phase 1 satisfies is "not in committed source" (D-04). Do NOT over-invest in obfuscation. [CITED: STACK.md §Shipping a single app-wide api_id]

> Confidence: MEDIUM on the exact electron-vite `define` ergonomics for the main process — verify against electron-vite 5 docs at plan time (env handling differs slightly between main/preload/renderer; `process.env` at build time is the reliable source). An alternative is a plain build-time codegen step that writes `config.generated.ts` (gitignored) from env. Either satisfies D-04.

## Code Examples

### Creating the auth client in main (with low flood threshold for login)
```typescript
// main/telegram/SessionManager.ts
// Source: https://gram.js.org/getting-started/authorization
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { API_ID, API_HASH } from './config';

const saved = restoreSession() ?? '';
const client = new TelegramClient(new StringSession(saved), API_ID, API_HASH, {
  connectionRetries: 5,
  floodSleepThreshold: 5,   // login: surface flood waits as countdown, don't silently sleep (Pattern 5)
});
await client.connect();
const authorized = await client.checkAuthorization();   // true if restored session is live
```

### Persisting after successful login
```typescript
// after authorized:
persistSession(client.session.save() as string);   // StringSession string → safeStorage → userData
const identity = await fetchIdentity(client);       // D-11 name/@username/avatar
win.webContents.send('auth:state', { step: 'authorized', identity });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `keytar` for secrets | Electron `safeStorage` | keytar unmaintained since Dec 2022 | Use safeStorage (D-03); no native module. |
| electron-forge / hand-rolled webpack | electron-vite | ~2023+ | Cleaner main/preload/renderer split + HMR. |
| `client.start()` callback login | lower-level `sendCode`/`SignIn`/`signInWithPassword` | n/a (always available) | Needed for stepped, event-driven UI (D-06). |
| Vite 6/7 (rollup) | Vite 8 (Rolldown default) | Vite 8 release ~2026 | **Avoid for now** — peer ranges lag; pin Vite 7. |

**Deprecated/outdated:**
- `keytar` — unmaintained; use `safeStorage`.
- Pyrogram / Telethon for greenfield — unmaintained / maintenance-mode-archived (per STACK.md). GramJS only.

## Validation Architecture

> `workflow.nyquist_validation: true` in config — section REQUIRED.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **Vitest** (Vite-native; aligns with the electron-vite/Vite toolchain) — [ASSUMED, recommend]; confirm at plan time |
| Config file | none yet — **Wave 0** creates `vitest.config.ts` |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npx vitest run` |

> Vitest is the natural fit (shared Vite config, fast, TS-native). Main-process logic (SessionManager, authFlow, errors, secrets) is plain Node/TS and unit-testable with Vitest + a **mock GramJS client**. End-to-end Electron launch / real Telegram login are **manual/integration** (cannot be automated without real credentials + a real account + a phone).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | phone→code happy path advances state machine to authorized | unit (mock client) | `npx vitest run src/main/telegram/authFlow.test.ts` | ❌ Wave 0 |
| AUTH-01 | wrong/expired code stays on code step (D-12) | unit | `npx vitest run src/main/telegram/authFlow.test.ts -t "code error"` | ❌ Wave 0 |
| AUTH-02 | `SESSION_PASSWORD_NEEDED` → advances to needPassword → authorized | unit | `npx vitest run src/main/telegram/authFlow.test.ts -t "2fa"` | ❌ Wave 0 |
| AUTH-02 | wrong 2FA password classified, stays on password step | unit | `npx vitest run src/main/telegram/errors.test.ts -t "password"` | ❌ Wave 0 |
| AUTH-03 | api_id/api_hash present at build, absent from committed source | unit + grep CI check | `npx vitest run src/main/telegram/config.test.ts` + `git grep` guard | ❌ Wave 0 |
| AUTH-04 | session encrypt→write→read→decrypt round-trips identically | unit (mock safeStorage) | `npx vitest run src/main/storage/secrets.test.ts` | ❌ Wave 0 |
| AUTH-04 | `isEncryptionAvailable()===false` → no plaintext written, routes to login | unit | `npx vitest run src/main/storage/secrets.test.ts -t "unavailable"` | ❌ Wave 0 |
| AUTH-04 | dead session (`AUTH_KEY_UNREGISTERED` on connect) → wipe + login | unit | `npx vitest run src/main/telegram/SessionManager.test.ts -t "dead session"` | ❌ Wave 0 |
| AUTH-05 | logout: server-revoke success → local wiped | unit | `npx vitest run src/main/telegram/SessionManager.test.ts -t "logout ok"` | ❌ Wave 0 |
| AUTH-05 | logout: server-revoke FAILS → local STILL wiped + warning flag (D-17) | unit | `npx vitest run src/main/telegram/SessionManager.test.ts -t "logout server fail"` | ❌ Wave 0 |
| D-13 | FLOOD_WAIT_x parsed → countdown ticks emitted, submit re-enabled at 0 | unit (fake timers) | `npx vitest run src/main/telegram/floodWait.test.ts` | ❌ Wave 0 |
| — | error classification: each RPCError code → correct UI copy key | unit | `npx vitest run src/main/telegram/errors.test.ts` | ❌ Wave 0 |
| AUTH-01..05 | real Telegram login (phone/code/2FA), persist across relaunch, logout | **manual/integration** | manual checklist | N/A |
| APP-01 | portable build launches on clean macOS (Intel + Apple Silicon) | **manual** | manual on clean machine/VM | N/A |
| APP-02 | portable build launches on clean Windows | **manual** | manual on clean machine/VM | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file>` (quick).
- **Per wave merge:** `npx vitest run` (full unit suite).
- **Phase gate:** full unit suite green + the manual checklist (real login on macOS + Windows, relaunch-persists, logout-revokes) completed before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.ts` + `npm i -D vitest` — framework install (none detected)
- [ ] `src/main/telegram/__mocks__/telegramClient.ts` — mock GramJS client (throws `SESSION_PASSWORD_NEEDED`, `PHONE_CODE_INVALID`, `PHONE_CODE_EXPIRED`, `FLOOD_WAIT_n`, `AUTH_KEY_UNREGISTERED` on demand)
- [ ] `src/main/storage/__mocks__/safeStorage.ts` — mock `safeStorage` (available/unavailable modes, in-memory encrypt/decrypt)
- [ ] `authFlow.test.ts`, `errors.test.ts`, `secrets.test.ts`, `SessionManager.test.ts`, `floodWait.test.ts`, `config.test.ts`
- [ ] CI/grep guard that `git grep` finds no api_hash literal in committed source (AUTH-03 / D-04)
- [ ] Manual integration checklist doc: real login (no-2FA + 2FA account), relaunch-persists, dead-session-routes-to-login, logout-revokes, unsigned build launches on clean macOS + Windows

## Security Domain

> `security_enforcement` absent in config → treated as ENABLED.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Delegated entirely to Telegram MTProto via GramJS; app never stores a password — 2FA via SRP (`computeCheck`). |
| V3 Session Management | yes | Session = GramJS `StringSession`; encrypted at rest via `safeStorage`; logout revokes server-side (`Api.auth.LogOut`) + wipes local (D-17). |
| V4 Access Control | yes | Trust boundary = preload `contextBridge`; renderer (least-trusted) can only call whitelisted IPC channels; no GramJS/secret crosses. |
| V5 Input Validation | yes | Validate every IPC payload in main with `zod`; phone pre-validation via `libphonenumber-js`. |
| V6 Cryptography | yes | **Never hand-roll** — `safeStorage` (OS keystore) for at-rest; SRP via GramJS `computeCheck`; MTProto transport crypto in GramJS. |

### Known Threat Patterns for Electron + GramJS
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer reads/exfiltrates the session string | Information Disclosure | `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`; session never sent to renderer; no GramJS import in renderer. |
| Session blob copied off disk → account takeover | Elevation of Privilege | `safeStorage` (Keychain/DPAPI) + `0o600` perms; never plaintext; never in logs. |
| Logout leaves live server authorization | Repudiation / Spoofing | `Api.auth.LogOut` + always-wipe (D-17); warn on server-revoke failure. |
| Malicious IPC payload (injection) | Tampering | `zod`-validate every IPC payload before use. |
| api_id/api_hash committed to source | Information Disclosure | Build-time env injection (D-04); `.env` gitignored; `git grep` CI guard. |
| Shared api_id abuse-flagging | Denial of Service (fleet-wide) | Dedicated api_id; flood-respecting login; rotation deferred to v2 but creds isolated in one injected module. |
| Remote-content/SSRF in renderer | Tampering | Load only local bundle; no remote URLs; CSP; offline fonts (`@fontsource/inter`, no CDN per UI-SPEC). |

## Project Constraints (from CLAUDE.md)
- **GSD workflow enforcement:** do not make direct repo edits outside a GSD workflow; use `/gsd-execute-phase` for planned phase work. (Relevant to execution agents, not research.)
- **Conventions / Architecture sections:** "not yet established / not yet mapped" — this phase establishes them (main/renderer split, IPC contract shape, SessionManager facade). The planner should treat the structures in §Recommended Project Structure as the project-wide conventions other phases inherit.
- **Stack section** in CLAUDE.md mirrors STACK.md (GramJS in-process, safeStorage, shared api_id semi-public) — consistent with this research.

## Environment Availability
| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build + GramJS runtime | ✓ | v22.22.0 (LTS) | — |
| npm | Package install | ✓ | 10.9.4 | — |
| git | VCS / grep guard | ✓ | 2.50.1 | — |
| macOS | APP-01 target + Keychain | ✓ | 26.4 (dev machine) | — |
| Windows | APP-02 target + DPAPI | ✗ (not this machine) | — | Build cross-target via electron-builder on macOS produces the Windows artifact, but **launch verification on Windows requires a Windows machine/VM** — manual, can't be automated here. |
| Apple Developer ID / Win EV cert | Signing | ✗ | — | **Not needed Phase 1** — unsigned-runnable builds (signing is Phase 7 / APP-03). |

**Missing dependencies with no fallback:** Windows launch verification needs a Windows host (manual phase-gate step).
**Missing dependencies with fallback:** signing certs — deferred to Phase 7, not blocking.

## Assumptions Log
| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pin Vite **7** (not 8) for electron-vite 5 compatibility | Standard Stack | If electron-vite 5 actually supports Vite 8 cleanly, pinning 7 is merely conservative (low risk). Verified peer range excludes 8 → low risk. |
| A2 | `signInWithPassword(apiCreds, { password })` accepts a callback returning the password | Pattern 2 | If arg shape differs in 2.26.22, 2FA call needs adjusting — verify against installed types. Medium. |
| A3 | TypeScript **5.x** (not 6) for tooling compatibility | Standard Stack | TS 6 may work; pinning 5 is conservative. Low. |
| A4 | `libphonenumber-js` for phone validation/country list | Standard Stack | Could swap for another lib; UI-SPEC needs custom picker regardless. Low. Flagged for slopcheck. |
| A5 | `zod` for IPC payload validation | Standard Stack / Security | Could use another validator; pattern stands. Low. Flagged for slopcheck. |
| A6 | **Vitest** as test framework | Validation Architecture | Could use Jest; Vitest is the natural Vite-aligned choice. Low. |
| A7 | electron-vite `define` is the cleanest api_id injection | api_id Injection | A codegen-from-env alternative also satisfies D-04; verify ergonomics. Medium. |
| A8 | `lucide-react` `latest` (1.17.0) — confirm shadcn pins a compatible version | Standard Stack | shadcn add pulls its own range; reconcile at plan time. Low. |
| A9 | api creds belong in MAIN bundle only, never renderer | api_id Injection / Security | This is firmly correct per D-02; not really at risk. Very low. |

## Open Questions
1. **Exact `signInWithPassword` signature in `telegram@2.26.22`**
   - What we know: it does `account.getPassword` → `computeCheck` → `Api.auth.CheckPassword`; accepts `UserPasswordAuthParams` with a `password` field (value or callback).
   - What's unclear: value-vs-callback at this exact version.
   - Recommendation: install `telegram@2.26.22` in Wave 0 and read its `.d.ts` for `signInWithPassword` / `UserAuthParams`; write the mock to match.
2. **D-18 governor interface shape** (option a vs b)
   - What we know: option (a) — minimal injectable-timing FloodWaitController now, Phase 2 generalizes — is recommended (least rework, decoupled from UI per UI-SPEC).
   - What's unclear: whether Phase 2's governor design (not yet written) prefers wrapping auth calls directly.
   - Recommendation: implement (a) with the timing source injectable; document the seam so Phase 2 can feed it.
3. **electron-vite 5 env injection for the MAIN process**
   - What we know: Vite `define` works; main/preload/renderer have slightly different env handling.
   - Recommendation: verify against electron-vite 5 docs at plan time; the codegen-from-env fallback always works.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`, 2026-06-10): `telegram@2.26.22`, `electron@42.4.0`, `electron-vite@5.0.0` (peers `vite ^5||^6||^7`), `electron-builder@26.15.2`, `vite@8.0.16` (latest), `react@19.2.7`, `electron-store@11.0.2`, `@fontsource/inter@5.2.8`, `tailwindcss@4.3.0`, `libphonenumber-js@1.13.6`, `zod@4.4.3`, `p-queue@9.3.0`
- GramJS auth source — exact `signInUser`/`signInWithPassword`/`SESSION_PASSWORD_NEEDED` control flow: https://github.com/gram-js/gramjs/blob/master/gramjs/client/auth.ts
- GramJS TelegramClient API (method signatures `sendCode`, `signInUser`, `signInWithPassword`, `getMe`, `invoke`, `checkAuthorization`): https://gram.js.org/beta/classes/TelegramClient.html
- GramJS authorization guide: https://gram.js.org/getting-started/authorization
- Electron `safeStorage` (Keychain/DPAPI, `isEncryptionAvailable`, ready-event requirement, basic_text caveat): https://www.electronjs.org/docs/latest/api/safe-storage
- Electron contextBridge / IPC: https://www.electronjs.org/docs/latest/api/context-bridge
- Project research (load-bearing, project-internal): STACK.md, ARCHITECTURE.md, PITFALLS.md, 01-CONTEXT.md, 01-UI-SPEC.md

### Secondary (MEDIUM confidence)
- electron-vite Vite-8 status / peer handling (WebSearch + repo): https://github.com/electron-vite/vite-plugin-electron ; https://vite.dev/blog/announcing-vite8
- GramJS 2FA/SRP (`computeCheck`/`auth.CheckPassword`): https://gram.js.org/tl/auth/CheckPassword ; https://painor.gitbook.io/gramjs/registration-and-authorization/auth.checkpassword
- GramJS logout: https://gram.js.org/tl/auth/LogOut

### Tertiary (LOW confidence — validate at plan time)
- `libphonenumber-js`, `zod`, Vitest recommendations — discovered from training; registry-confirmed but slopcheck did not run. Planner gates installs behind `checkpoint:human-verify`.

## Metadata
**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry today; Vite-8 caveat verified via peer range.
- GramJS auth surface: HIGH — exact control flow confirmed from gramjs/auth.ts source + API reference.
- Session/safeStorage: HIGH — official Electron docs.
- api_id injection ergonomics: MEDIUM — `define` approach sound; exact electron-vite 5 env wiring to verify.
- Packaging (unsigned-runnable): HIGH on approach, MEDIUM on per-OS launch gotchas (manual verification required).

**Research date:** 2026-06-10
**Valid until:** ~2026-07-10 (stable libs) — but re-verify `electron` and `telegram` versions immediately before locking plans (per STATE.md blocker: fast Electron cadence).
