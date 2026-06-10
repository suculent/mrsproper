# Stack Research

**Domain:** Cross-platform desktop app (macOS + Windows) using the Telegram MTProto **User** API to bulk-remove a target member across many groups
**Researched:** 2026-06-10
**Confidence:** HIGH (MTProto library + desktop framework), MEDIUM (secure-storage details, api_id distribution policy)

## Executive Recommendation

**Build it with: Node.js + TypeScript → GramJS (`telegram`) for MTProto → Electron for the desktop shell.**

Rationale in one paragraph: GramJS is the only MTProto **User**-API client that is (a) actively maintained in 2025/2026, (b) runs natively in the same runtime as a mainstream cross-platform desktop framework, and (c) covers every capability this product needs (phone+code+2FA login, string-session persistence, dialog enumeration, participant listing, kick/ban via `EditBanned`, resolve-by-username and resolve-by-phone, profile-photo download, and built-in FLOOD_WAIT auto-sleep). Because GramJS *is* a Node library and Electron *is* a Node runtime, the MTProto client runs directly in Electron's main process — **no sidecar, no IPC bridge to a foreign runtime, no second language**. That single-runtime fact is the deciding factor: every other MTProto option forces you to either pick a dying library (Telethon/Pyrogram) or bolt a Python/PHP/Rust process onto your desktop app as a sidecar, adding packaging pain for zero capability gain.

Tauri is the strong runner-up shell (much smaller binaries) but it forces a sidecar to run GramJS, which reintroduces exactly the multi-runtime packaging cost we're trying to avoid. Choose Tauri only if a <15 MB installer is a hard requirement (see "Stack Patterns by Variant").

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | 20 LTS or 22 LTS | Runtime for both the MTProto client and the Electron main process | Single runtime end-to-end; the MTProto library is a native Node module so there is no cross-runtime boundary |
| **TypeScript** | 5.x | Language | GramJS ships first-class types; strong typing matters when a typo triggers a destructive `EditBanned` call. Also Electron's de-facto language |
| **GramJS** (npm package name: `telegram`) | 2.26.22 (Feb 2025) | MTProto **User** API client — auth, dialogs, participants, kick/ban, photo download, FLOOD_WAIT handling | The only actively-maintained, runtime-aligned MTProto user client. Full coverage of every required call. Runs inside Electron's main process directly |
| **Electron** | 38.x / 39.x (latest stable; verify at build time) | Cross-platform desktop shell (macOS + Windows) | GramJS runs in-process (no sidecar). Mature single-download distribution via electron-builder. `safeStorage` gives OS-backed encryption for the session with zero extra deps |

> Install note: GramJS is published on npm as **`telegram`**, *not* `gramjs`. `npm install telegram@2.26.22`.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **electron-builder** | 25.x+ | Produces signed `.dmg`/`.zip` (macOS) and `.exe`/NSIS (Windows) installers from one config | Always — this is the "single download, no per-user setup" delivery mechanism |
| **Electron `safeStorage`** (built-in, no install) | bundled with Electron | OS-backed encryption of the GramJS `StringSession` at rest (macOS Keychain, Windows DPAPI) | Always — primary session-at-rest protection |
| **GramJS `StringSession`** (part of `telegram`) | bundled | Serializes the auth session to a single string you can encrypt + persist | Always — this is the value you feed into `safeStorage` |
| **electron-store** | 10.x | Simple JSON persistence for non-secret app state (window size, last-used ban/kick toggle, target history) | Optional — for non-sensitive prefs only. Do NOT use its built-in "encryption" for the session (it's obfuscation, not real encryption) |
| **p-queue** | 8.x | Serial job queue with concurrency=1 for the throttled removal run | Recommended — gives clean live-progress + sequential execution on top of GramJS's own flood handling |
| **Vite + React (or Svelte)** | Vite 6/7, React 18/19 | Renderer UI (checklist, review screen, progress) | Recommended — standard Electron renderer stack; any framework works since the MTProto logic lives in main |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **electron-vite** | Dev server + build glue for Electron main/preload/renderer | Smooths the main/renderer split; HMR for the UI |
| **electron-builder** | Packaging + code signing | macOS notarization (Apple Developer ID) and Windows code-signing strongly recommended to avoid Gatekeeper/SmartScreen friction for non-technical admins |
| **@electron/rebuild** | Rebuild native deps against Electron's Node ABI | Only if you add a native module; GramJS itself is pure JS so often not needed |

## Installation

```bash
# Core
npm install telegram            # GramJS — published as "telegram"

# Renderer + build
npm install react react-dom
npm install p-queue electron-store

# Dev dependencies
npm install -D electron electron-builder electron-vite typescript vite
```

## How the MTProto library and desktop framework actually talk to each other

This is the load-bearing integration detail:

1. **GramJS runs in the Electron main process** (Node context). You instantiate `new TelegramClient(new StringSession(saved), apiId, apiHash, { connectionRetries, floodSleepThreshold })` there. No subprocess, no HTTP, no foreign-runtime sidecar.
2. **The renderer (UI) never touches the Telegram session.** It communicates with main over Electron **IPC** (`ipcRenderer.invoke` → `ipcMain.handle`), exposed through a locked-down **preload `contextBridge`**. The renderer sends intents like `resolveTarget(usernameOrPhone)`, `listGroupsWithTarget()`, `executeRemovals(groupIds, mode)`; main runs the GramJS calls and streams progress back via `webContents.send`.
3. **Session at rest:** main serializes `client.session.save()` → `StringSession` string → `safeStorage.encryptString()` → write the ciphertext to `app.getPath('userData')`. On launch, read → `safeStorage.decryptString()` → rehydrate the client. Logout = delete the file + `client.logOut()`.

This keeps the real account credential (the session) entirely in the privileged main process, never in renderer-reachable memory or disk in plaintext.

## Capability coverage check (all REQUIRED features map to GramJS)

| Requirement (from PROJECT.md) | GramJS mechanism | Confidence |
|-------------------------------|------------------|------------|
| Login: phone + code + 2FA password | `client.start({ phoneNumber, phoneCode, password })` callbacks | HIGH |
| Persist encrypted session; logout clears it | `StringSession` + `client.session.save()` / `client.logOut()` | HIGH |
| Resolve target by **username** | `client.getEntity('@username')` | HIGH |
| Resolve target by **phone** | `contacts.ImportContacts` (InputPhoneContact) then resolve — only works if Telegram privacy allows, matching PROJECT.md's caveat | HIGH |
| Show avatar + identity, graceful "no photo" | `client.downloadProfilePhoto(entity)` — returns empty buffer when absent → triggers text fallback | HIGH |
| List the admin's dialogs/groups | `client.getDialogs()` / `client.iterDialogs()` | HIGH |
| Verify target is a member per group | `client.getParticipants(chat, { search/filter })` / `iterParticipants` | HIGH |
| Detect lack of kick rights (grey out) | Inspect `participant.adminRights` / chat `defaultBannedRights`; surface as non-actionable | MEDIUM (need per-chat-type handling) |
| Ban (kick + block rejoin) vs Kick | `channels.EditBanned` with `ChatBannedRights` (ban) vs kick-then-unban semantics; basic groups use `messages.deleteChatUser` | HIGH (channels), MEDIUM (legacy basic-group path) |
| Throttled sequential execution with FLOOD_WAIT back-off | `floodSleepThreshold` auto-sleeps; wrap run in `p-queue` concurrency=1 for ordering + progress | HIGH |

> Note the two MEDIUM rows are not library gaps — they're **Telegram domain branching** (megagroup/supergroup vs legacy basic group vs channel have different removal calls). GramJS exposes all the raw `Api.*` methods needed; the work is correct dispatch, which belongs in a domain/architecture phase, not a stack risk.

## FLOOD_WAIT / rate-limit handling (concrete)

- GramJS has **built-in flood handling** via `floodSleepThreshold` (default 60s). If Telegram returns `FLOOD_WAIT_x` where `x <= floodSleepThreshold`, GramJS **sleeps and retries automatically**; if `x > threshold`, it **throws `FloodWaitError`** for you to handle.
- Recommended config for bulk destructive ops: set `floodSleepThreshold` to a moderate value (e.g. 60–120s) so short waits auto-absorb, and catch `FloodWaitError` for long waits to surface "pausing N seconds" in the UI rather than blocking silently.
- Layer **`p-queue` with concurrency 1** over the per-group removals so execution is strictly sequential (PROJECT.md: "not parallel-blast"), gives natural progress events, and lets you insert a small fixed inter-call delay (e.g. 1–2s) to stay well under flood thresholds proactively.

## Securely persisting the session (per-platform)

**Primary recommendation: Electron `safeStorage` (OS-backed, zero extra deps).**

| Platform | Backing | Notes |
|----------|---------|-------|
| macOS | Keychain (AES via Keychain-derived key) | `safeStorage.isEncryptionAvailable()` true when Keychain available |
| Windows | DPAPI (per-user) | Encrypted against the OS user; protects from other users on the machine, not other apps in the same userspace |

Pattern: encrypt the `StringSession` with `safeStorage.encryptString()`, store the ciphertext blob in `userData`. This is simpler and better-maintained than `keytar` (unmaintained since Dec 2022; VS Code and others migrated off it). Do **not** rely on `electron-store`'s "encryption" option for the session — its key is derivable from the binary (documented break), so it's obfuscation only.

> If you ever move to Tauri instead, the equivalent is the community **tauri-plugin-keyring** (native keychain via the Rust `keyring` crate). Avoid Tauri's **Stronghold** plugin for new work — it's slated for deprecation/removal in Tauri v3.

## Shipping a single app-wide api_id / api_hash (honest constraints)

- **It cannot be truly secret in a client binary.** Telegram explicitly intends api_id/api_hash to be hardcoded in client apps; any user can then log in with just a phone number. But anyone who decompiles your binary can extract the pair — this is how people recover even the official clients' credentials. Treat the embedded pair as *semi-public*, not a secret. (Confidence: HIGH on the "can't be secret" reality.)
- **Mitigations are friction, not protection:** light obfuscation (split/XOR the strings, assemble at runtime, store as bytes not literals) raises the bar for casual grep but stops a determined extractor for ~minutes. Don't over-invest.
- **Real risk to plan for:** if your shared api_id gets flagged for abuse, *all* your users' logins through it can be impacted (flood errors / restrictions). Generate **your own** pair from my.telegram.org — **never reuse an official client's pair** (policy violation, ban risk). Consider operational levers: be ready to rotate the pair in an update, and keep flood-respecting behavior strict to avoid the shared pair getting flagged. (Confidence: MEDIUM — based on Telegram policy docs + community reports, not a guaranteed-outcome SLA.)

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Electron shell | **Tauri 2** | If installer size (<15 MB vs ~85–150 MB) or RAM is a hard product requirement, AND you accept running GramJS as a bundled Node **sidecar** (via `externalBin` + `pkg`-compiled binary) talking to Rust over stdio/IPC. More moving parts, more packaging work |
| GramJS (Node) | **Telethon (Python)** | Only if the team is Python-only and willing to ship a Python sidecar. Telethon is now in maintenance mode and **archived on GitHub (Feb 2026), moved to Codeberg** — still patched but no longer the safe default for a greenfield desktop app |
| GramJS (Node) | **TDLib + bindings** | If you want Telegram's own C++ core (battle-tested, handles updates/caching). Cost: heavy native build, cross-compiling for mac+win, and a binding layer. Overkill for a single-purpose tool; slower to iterate |
| Electron | **Wails / .NET MAUI / Flutter / Qt** | Only if you already have deep expertise there AND a matching MTProto client. None pair with a maintained MTProto **user** client as cleanly as Node+GramJS; all force a sidecar |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Telegram Bot API** | Bots cannot enumerate the admin's groups or act with the admin's authority — structurally incapable of this product's core task (already in PROJECT.md Out of Scope) | MTProto **User** API via GramJS |
| **Pyrogram** | **Officially no longer maintained** (project marked unmaintained). Do not start greenfield on it | GramJS |
| **Telethon for a greenfield desktop app** | Maintenance-mode + GitHub repo & org archived Feb 2026 (dev moved to Codeberg). Still works, but it's a Python sidecar dependency on a project in wind-down posture | GramJS |
| **MadelineProto (PHP)** | PHP runtime is the worst fit for a portable desktop app; sidecar/packaging pain with no upside here | GramJS |
| **`keytar`** | Unmaintained since Dec 2022; ecosystem migrated off it | Electron `safeStorage` |
| **`electron-store` encryption for the session** | Encryption key is derivable from the binary (publicly documented break) — obfuscation, not security | `safeStorage` for the session; `electron-store` for non-secret prefs only |
| **Reusing an official Telegram client's api_id/api_hash** | Policy violation; risks account restrictions/bans for your users | Generate your own pair at my.telegram.org |
| **Parallel ("blast") removal execution** | Reliably triggers FLOOD_WAIT and gets the account restricted | Sequential `p-queue` (concurrency 1) + `floodSleepThreshold` |

## Stack Patterns by Variant

**If "single small download" is just "one installer, no setup" (the PROJECT.md intent):**
- Use **Electron + GramJS in-process**. ~85–150 MB installer is fine for a desktop admin tool; the win is zero cross-runtime packaging and the simplest, safest session handling (`safeStorage`).

**If installer size / memory is a hard constraint (<15 MB, low RAM):**
- Use **Tauri 2 + GramJS as a Node sidecar** (compile GramJS app with `pkg` → `externalBin`, talk over stdio/IPC), and **tauri-plugin-keyring** for the session. Accept the extra packaging and the multi-runtime boundary.

**If the team is hard-committed to Python:**
- Use **Telethon as a sidecar** behind Electron/Tauri — but accept it's a maintenance-mode, archived-on-GitHub dependency. Prefer GramJS unless Python expertise outweighs that.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `telegram@2.26.22` (GramJS) | Node 18/20/22 | Pure-JS; runs in Electron main process unmodified |
| Electron 38/39 | Node 20/22 (bundled), `safeStorage` API | `safeStorage` requires app `ready` event before use |
| electron-builder 25+ | Electron 30+ | Handles macOS notarization + Windows NSIS/code-signing |
| GramJS `StringSession` | `safeStorage.encryptString` | Encrypt the saved session string; store ciphertext in `userData` |

> Pin exact versions in `package.json`. Re-verify Electron's latest stable at build time (fast release cadence) and confirm GramJS hasn't shipped a newer minor (check npm `telegram` + gram-js/gramjs releases) before locking the roadmap.

## Sources

- https://github.com/gram-js/gramjs + https://www.npmjs.com/package/telegram — GramJS latest version **2.26.22** (Feb 2025), maintained — HIGH
- https://gram.js.org/getting-started/authorization, https://gram.js.org/tl/channels/EditBanned, https://gram.js.org/beta/interfaces/client.telegramBaseClient.TelegramClientParams.html — auth, EditBanned (ban/kick), `floodSleepThreshold`, `getParticipants`, `downloadProfilePhoto`, `StringSession` — HIGH
- https://docs.pyrogram.org/ — Pyrogram **no longer maintained** — HIGH
- https://github.com/LonamiWebs/Telethon + https://codeberg.org/Lonami/Telethon + https://pypi.org/project/Telethon/ — Telethon **1.43.2** (Apr 2026), **maintenance mode**, GitHub repo + org **archived Feb 2026**, moved to Codeberg — HIGH
- https://v2.tauri.app/learn/sidecar-nodejs/, https://v2.tauri.app/develop/sidecar/ — Tauri Node sidecar via `externalBin` + `pkg` — HIGH
- https://www.gethopp.app/blog/tauri-vs-electron, https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/ — Electron ~85–150 MB vs Tauri <15 MB bundle/memory tradeoffs — MEDIUM
- https://www.electronjs.org/docs/latest/api/safe-storage — `safeStorage` (Keychain/DPAPI), keytar unmaintained since Dec 2022 — HIGH
- https://v2.tauri.app/plugin/stronghold/ + https://github.com/charlesportwoodii/tauri-plugin-keyring — Stronghold deprecating in v3; keyring plugin alternative — MEDIUM
- https://blog.jse.li/posts/electron-store-encryption/ — electron-store "encryption" is breakable (obfuscation only) — MEDIUM
- https://core.telegram.org/api/obtaining_api_id + https://github.com/tdlib/telegram-bot-api/issues/560 + https://grokipedia.com/page/Official_Telegram_client_API_ID_and_API_hash — api_id/api_hash hardcoded by design, extractable, official pairs off-limits — MEDIUM/HIGH

---
*Stack research for: cross-platform Telegram MTProto User-API desktop removal tool*
*Researched: 2026-06-10*
