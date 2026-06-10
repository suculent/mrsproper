<!-- GSD:project-start source:PROJECT.md -->
## Project

**MrProper**

MrProper is a portable desktop app for macOS and Windows that lets a Telegram group administrator remove a specific person from *all* of their communities at once. The admin logs in with their own Telegram account (via the MTProto User API), identifies a target by username or phone number, visually confirms it's the right person via their avatar and identity details, and then bulk-removes (kicks or bans) them across every group where the admin has rights — with safe, throttled execution that respects Telegram's rate limits.

It exists for the recurring "serial bad actor" problem: a spammer, troll, or banned person who keeps surfacing across multiple communities you run, where removing them one group at a time is slow and error-prone.

**Core Value:** A group admin can confidently remove the right person from every relevant community in one safe, verified pass — without tripping Telegram's rate limits or hitting the wrong account.

### Constraints

- **Tech stack**: Cross-platform desktop, "easily portable" — must produce simple-to-run macOS and Windows builds (framework TBD in research). Why: target users are admins, not engineers; install friction kills adoption.
- **API**: Must use Telegram MTProto User API. Why: only the user API can enumerate the admin's groups and act with their authority.
- **Performance/Rate limits**: All Telegram calls (membership checks, removals) must be throttled with FLOOD_WAIT handling. Why: hitting rate limits gets the account temporarily restricted and breaks the core task.
- **Security**: Session credentials stored encrypted at rest; shipped api_id/api_hash. Why: a leaked session is full account access.
- **Safety**: Destructive actions require explicit final confirmation against a reviewed identity + group list. Why: removing the wrong person from communities is hard to undo and damages trust.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Recommendation
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | 20 LTS or 22 LTS | Runtime for both the MTProto client and the Electron main process | Single runtime end-to-end; the MTProto library is a native Node module so there is no cross-runtime boundary |
| **TypeScript** | 5.x | Language | GramJS ships first-class types; strong typing matters when a typo triggers a destructive `EditBanned` call. Also Electron's de-facto language |
| **GramJS** (npm package name: `telegram`) | 2.26.22 (Feb 2025) | MTProto **User** API client — auth, dialogs, participants, kick/ban, photo download, FLOOD_WAIT handling | The only actively-maintained, runtime-aligned MTProto user client. Full coverage of every required call. Runs inside Electron's main process directly |
| **Electron** | 38.x / 39.x (latest stable; verify at build time) | Cross-platform desktop shell (macOS + Windows) | GramJS runs in-process (no sidecar). Mature single-download distribution via electron-builder. `safeStorage` gives OS-backed encryption for the session with zero extra deps |
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
# Core
# Renderer + build
# Dev dependencies
## How the MTProto library and desktop framework actually talk to each other
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
## FLOOD_WAIT / rate-limit handling (concrete)
- GramJS has **built-in flood handling** via `floodSleepThreshold` (default 60s). If Telegram returns `FLOOD_WAIT_x` where `x <= floodSleepThreshold`, GramJS **sleeps and retries automatically**; if `x > threshold`, it **throws `FloodWaitError`** for you to handle.
- Recommended config for bulk destructive ops: set `floodSleepThreshold` to a moderate value (e.g. 60–120s) so short waits auto-absorb, and catch `FloodWaitError` for long waits to surface "pausing N seconds" in the UI rather than blocking silently.
- Layer **`p-queue` with concurrency 1** over the per-group removals so execution is strictly sequential (PROJECT.md: "not parallel-blast"), gives natural progress events, and lets you insert a small fixed inter-call delay (e.g. 1–2s) to stay well under flood thresholds proactively.
## Securely persisting the session (per-platform)
| Platform | Backing | Notes |
|----------|---------|-------|
| macOS | Keychain (AES via Keychain-derived key) | `safeStorage.isEncryptionAvailable()` true when Keychain available |
| Windows | DPAPI (per-user) | Encrypted against the OS user; protects from other users on the machine, not other apps in the same userspace |
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
- Use **Electron + GramJS in-process**. ~85–150 MB installer is fine for a desktop admin tool; the win is zero cross-runtime packaging and the simplest, safest session handling (`safeStorage`).
- Use **Tauri 2 + GramJS as a Node sidecar** (compile GramJS app with `pkg` → `externalBin`, talk over stdio/IPC), and **tauri-plugin-keyring** for the session. Accept the extra packaging and the multi-runtime boundary.
- Use **Telethon as a sidecar** behind Electron/Tauri — but accept it's a maintenance-mode, archived-on-GitHub dependency. Prefer GramJS unless Python expertise outweighs that.
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `telegram@2.26.22` (GramJS) | Node 18/20/22 | Pure-JS; runs in Electron main process unmodified |
| Electron 38/39 | Node 20/22 (bundled), `safeStorage` API | `safeStorage` requires app `ready` event before use |
| electron-builder 25+ | Electron 30+ | Handles macOS notarization + Windows NSIS/code-signing |
| GramJS `StringSession` | `safeStorage.encryptString` | Encrypt the saved session string; store ciphertext in `userData` |
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
