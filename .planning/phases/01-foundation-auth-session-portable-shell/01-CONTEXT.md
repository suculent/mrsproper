# Phase 1: Foundation — Auth, Session & Portable Shell - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase stands up the portable desktop application shell and the full Telegram authentication + session lifecycle. It delivers: an Electron + GramJS app that launches on macOS and Windows without a developer environment; a phone → code → 2FA login flow using the app's embedded credential; encrypted-at-rest session persistence so the user stays logged in across launches; and a logout that revokes the server-side authorization and wipes the local session.

**In scope:** AUTH-01 (phone+code login), AUTH-02 (2FA password), AUTH-03 (embedded api_id/api_hash), AUTH-04 (encrypted persistent session), AUTH-05 (revoking logout), APP-01 (runs on macOS), APP-02 (runs on Windows).

**Out of scope (later phases):** target resolution & verification (Phase 3), group enumeration (Phase 4), removal execution (Phase 5), the central rate-limit governor as shared infra (Phase 2), code-signing & notarization (Phase 7). The post-login workflow UI is laid out as a **non-functional stub** in this phase — its behavior is built later.

</domain>

<decisions>
## Implementation Decisions

### Architecture (locked from project research — do not re-litigate)
- **D-01:** Electron shell with **GramJS (npm `telegram`) running in-process in the Electron main process**. No sidecar/second runtime.
- **D-02:** Renderer ↔ main communication over locked-down Electron IPC via a `contextBridge` preload. The renderer must never import GramJS or touch the session string in plaintext; all Telegram I/O and secrets stay in main.
- **D-03:** Session persisted as the GramJS `StringSession`, **encrypted at rest via Electron `safeStorage`** (macOS Keychain / Windows DPAPI). Not `keytar`, not electron-store "encryption".
- **D-04:** App ships with an **embedded api_id/api_hash** (see Canonical References for the actual values' location). No per-user registration. Credential kill-switch/rotation is explicitly deferred to v2 (CRED-01).
- **D-05:** Session is **always persisted** after successful login (no "remember me" toggle — the user chose stay-logged-in during project setup).

### Login Flow Presentation
- **D-06:** **Stepped screens** — distinct phone → enter-code → (conditional) 2FA-password screens, one step at a time. Matches how Telegram's own clients present login.
- **D-07:** Phone entry uses a **country picker (flag + dial code) plus a separate national-number field** — avoids "+ prefix" mistakes.
- **D-08:** Login code is entered **manually**, with a hint telling the user where it was sent (e.g. "sent to your Telegram app").
- **D-09:** While a login step is processing (sending code, verifying), show an **inline spinner on the submit button and disable inputs** until the server responds. No full-screen blocking loader.

### Post-Login Landing
- **D-10:** Phase 1 lays out the **full eventual app shell with the workflow regions stubbed / non-functional** (e.g. target-input area, group-list area as placeholders). Real behavior arrives in Phases 3–6. This is layout scaffolding only — no Telegram calls beyond auth/identity.
- **D-11:** Prominently confirm the logged-in account with **display name + @username + avatar** (this is a powerful account; the user must be certain it's the right one).

### Login Error Handling
- **D-12:** Wrong/expired login code → **inline error under the code field, stay on the code step**, allow immediate retry; offer **"resend code"** for the expired case. Don't bounce back to the phone step.
- **D-13:** FLOOD_WAIT during login → show **"too many attempts — try again in N seconds" with a live countdown** and a disabled submit until it clears (see cross-phase note below).
- **D-14:** Phone number → **basic format validation before sending**; if Telegram rejects it (e.g. `PHONE_NUMBER_INVALID`), surface a clear inline message.

### Logout Behavior
- **D-15:** Logout shows a **confirmation dialog** ("Log out? You'll need to sign in again with a code.").
- **D-16:** The logout control lives in an **app settings / menu** location (not on the main account display).
- **D-17:** Logout **always wipes the local session**, even if the server-side revocation network call fails — and in that failure case **warn the user** that server-side revocation wasn't confirmed and suggest retrying / checking active sessions in Telegram. Never leave a local session blob behind.

### Cross-Phase Dependency (flag for planner)
- **D-18:** The FLOOD_WAIT-during-login countdown (D-13) depends on logic that formally belongs to the Phase 2 rate-limit governor. Resolve one of two ways at planning time: (a) Phase 1 implements a **minimal inline FLOOD_WAIT handler** that Phase 2 later generalizes into the governor, or (b) the Phase 2 governor is designed to **wrap auth calls too** and Phase 1 anticipates that interface. Planner should pick an approach that doesn't require rework when Phase 2 lands.

### Claude's Discretion
- App window sizing, single-window behavior, system-tray presence, first-run welcome, and session-expiry/AUTH_KEY-invalidation handling were not discussed — Claude/planner may choose sensible defaults (e.g. silently route an invalidated session back to the login flow with a brief notice). Surface any of these in planning if they become load-bearing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — product definition, core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements (this phase: AUTH-01..05, APP-01, APP-02)
- `.planning/ROADMAP.md` §"Phase 1" — phase goal and success criteria

### Research (load-bearing for this phase)
- `.planning/research/STACK.md` — Electron + GramJS in-process integration path, `safeStorage` session encryption, api_id-can't-be-secret caveat, version pins to re-verify at build time
- `.planning/research/ARCHITECTURE.md` — SessionManager / MTProto client design, the main↔renderer IPC trust boundary, auth state machine (phone→code→2FA), revoking logout
- `.planning/research/PITFALLS.md` — shared-api_id revocation risk (Pitfall 1/8), session-takeover-on-leak, distribution/signing notarization caveats
- `.planning/research/SUMMARY.md` — consolidated findings + Phase 1 roadmap implications

### Credentials
- **Embedded api_id/api_hash** are recorded in project memory (local, untracked): `~/.claude/projects/-Users-igraczech-Repositories-MrProper/memory/telegram-api-credentials.md`. Do NOT hardcode these in committed source — load from an untracked env/config at build time. (api_id `36396181`; api_hash in the memory file.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project. No source code, no codebase maps exist yet. This phase scaffolds the initial Electron + TypeScript project structure.

### Established Patterns
- None yet. This phase establishes the foundational patterns (main/renderer split, IPC contract shape, SessionManager service facade) that Phases 2–6 will build on.

### Integration Points
- The IPC contract and SessionManager service facade created here become the integration surface for every later phase (the governor wraps the same client; resolver/enumerator/executor call through the same session).

</code_context>

<specifics>
## Specific Ideas

- Login UX should feel familiar to anyone who has logged into an official Telegram client (stepped phone → code → 2FA, "code sent to your Telegram app" hint).
- Identity confirmation is treated as a safety feature, not decoration — name + @username + avatar shown prominently because this account can perform destructive cross-community actions.

</specifics>

<deferred>
## Deferred Ideas

- **Credential kill-switch / remote rotation (CRED-01)** — deferred to v2 per project scoping. A flagged shared api_id can restrict all users at once; revisit if it becomes a problem.
- **User-supplied api_id (CRED-02)**, **QR login (AUTH-06)**, **multi-account switcher (AUTH-07)** — v2.
- **Responsible-use / consequences warning** — belongs to the Phase 6 UI integration (safety gates), not the login shell.
- **App-window/tray/first-run polish** — not load-bearing for Phase 1; planner's discretion or a later polish pass.

</deferred>

---

*Phase: 1-Foundation — Auth, Session & Portable Shell*
*Context gathered: 2026-06-10*
