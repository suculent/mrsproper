# Project Research Summary

**Project:** MrProper
**Domain:** Cross-platform desktop app driving the Telegram MTProto **User** API to bulk-remove one verified target across many admin-owned groups, rate-limit-safe.
**Researched:** 2026-06-10
**Confidence:** MEDIUM-HIGH

## Executive Summary

MrProper is a single-purpose, destructive desktop tool: a Telegram group admin logs in with their **own** account, identifies one bad actor, visually confirms it's the right person, and removes them from every shared community in one throttled pass. The defining constraint is that this can **only** be built on the Telegram MTProto **User** API — the Bot API is structurally incapable of enumerating an admin's groups (`messages.getCommonChats` is user-only) or acting with the admin's authority. Every research file converges on the same stack: **Electron + GramJS (npm `telegram`) running in-process in the main process**, with the renderer UI talking to it over locked-down Electron IPC (`contextBridge`), and the session encrypted at rest via Electron `safeStorage` (macOS Keychain / Windows DPAPI). GramJS is the only actively-maintained MTProto user client that runs natively in a mainstream desktop runtime, so it avoids the sidecar/second-runtime packaging tax that every alternative (Telethon, Pyrogram, grammers) forces.

The way experts build this is "discipline first, features second." The load-bearing infrastructure — a **single serialized rate-limit governor** that every Telegram call funnels through, with `FLOOD_WAIT` parsed/slept/resumed (never treated as an error) and `PEER_FLOOD` hard-stopped (it's an account spam-flag, not a transient wait) — must exist **before** any feature that makes multiple calls. Likewise, the target must be resolved to a **stable numeric user ID + access_hash exactly once, early**, and acted on by ID end-to-end; usernames recycle to new owners, so resolving-by-string at execution time is the canonical wrong-person-ban bug. Avatar/identity verification must be load-bearing (the hidden-avatar path demands *more* deliberate confirmation, not less), and removal must branch by chat type (basic groups use `messages.deleteChatUser`; supergroups/channels use `channels.editBanned`, where kick = restrict-then-unban) while checking the *actual* `ban_users` admin right — "is admin" != "holds ban right."

The dominant risks are account-safety and credential risks, not coding risks. The shared app-wide `api_id`/`api_hash` is a structural single point of failure: aggressive automation across many accounts under one credential can trigger `API_ID_PUBLISHED_FLOOD` or revocation that bricks *all* users at once — mitigated by a remote kill-switch / rotation plan, a dedicated (never reused) credential, and strict human-paced flood-respecting behavior. The stored session string is full account-takeover material if leaked (OS-keystore-held key, never plaintext, full server-side logout). And distribution friction (Gatekeeper / SmartScreen on unsigned binaries) kills adoption for the non-technical admins this targets, so code-signing + notarization are foundational stack constraints, not late polish. The build order follows the dependency spine: SessionManager + auth + keychain -> rate-limit governor + error classification -> AuditStore -> RemovalJobExecutor, with TargetResolver and GroupEnumerator parallelizing after the spine exists and UI binding progressively.

## Key Findings

### Recommended Stack

The unanimous recommendation across STACK.md and ARCHITECTURE.md is **Node.js + TypeScript -> GramJS for MTProto -> Electron for the shell**, with GramJS running **in-process in the Electron main process** (no sidecar). This single-runtime fact is the deciding factor: GramJS *is* a Node library and Electron *is* a Node runtime, so the MTProto client, the throttled executor, and a single in-memory back-off clock all live in one address space. Every alternative (Telethon — now maintenance-mode and archived on GitHub Feb 2026; Pyrogram — unmaintained; grammers — unaudited Rust crypto; TDLib — heavy native build) forces a foreign-runtime sidecar with packaging/signing overhead and zero capability gain. Tauri is the only serious runner-up and only if a <15 MB installer is a hard requirement — which PROJECT.md does not state. See STACK.md and ARCHITECTURE.md for full detail.

**Core technologies:**
- **GramJS** (npm `telegram`, ~2.26.22): MTProto **User** API client — auth, dialogs, participants, kick/ban, photo download, built-in `floodSleepThreshold` — the only maintained, runtime-aligned user client.
- **Electron** (38/39.x): cross-platform shell where GramJS runs in-process; `safeStorage` gives OS-backed session encryption with zero extra deps; electron-builder produces signed `.dmg`/`.exe` installers.
- **TypeScript 5.x**: strong typing matters when a typo can trigger a destructive `EditBanned` call.
- **p-queue (concurrency=1)**: serial removal queue for ordered, observable, paced execution layered over GramJS's own flood handling.
- **Electron `safeStorage`** (Keychain/DPAPI): encrypts the GramJS `StringSession` at rest — preferred over the unmaintained `keytar` and over electron-store's breakable "encryption."

### Expected Features

This is a sparse product market with no direct commercial competitor — feature priority is defined by "what makes a destructive cross-community tool safe and trustworthy," with Telegram's API dictating most hard constraints. See FEATURES.md.

**Must have (table stakes):**
- Phone + code + 2FA login; encrypted session persistence; **revoking** logout (server-side + local wipe) — users expect this; session = full account access.
- Resolve target by username AND phone (with the contacts-privacy gate handled honestly) — both legitimately fail often; graceful non-resolution is a primary path, not an edge case.
- Visual verification: avatar + **text fallback** + name/@username/numeric ID/bio — the central safety promise; hidden avatars are common, not rare.
- Group list via `messages.getCommonChats`, membership-verified (single-user `getParticipant`), admin-rights-aware grey-out — the actionable scope.
- Pre-checked "remove everywhere" selection; per-run kick-vs-ban toggle (group-type-correct); final review + explicit confirm gate.
- Throttled sequential execution with FLOOD_WAIT back-off; live progress + per-group success/failure report.

**Should have (competitive differentiators):**
- **Dry-run / preview mode** — strongest trust feature for a destructive tool; reuses the review screen; promote early.
- Common-groups count on verification ("in 7 of your communities" — near-free from `getCommonChats`).
- Retry-failed-groups, audit log + CSV/JSON export (both fall out cheaply once per-group result state exists).
- Optional "delete target's messages" toggle (opt-in, shown in review).

**Defer (v2+):**
- QR-code login (phone+code already satisfies the requirement).
- Multi-account switcher (adds session-management risk surface).
- Resumable/interruptible jobs as a *user-facing feature* (HIGH complexity — though crash-safe checkpointing should be built into the executor from day one per architecture).
- Revoke target's invite links (niche; admin-level targets only).

### Architecture Approach

The load-bearing architectural decision is **MTProto client in-process in Electron main; UI in renderer over IPC** — the renderer is the least-trusted process and must never touch the session string or a GramJS object. All Telegram I/O and secrets stay in `main/`; the renderer only knows IPC channel names and DTO shapes. A **single `TelegramClient`** behind a service facade gives one connection, one rate-limit surface, and one back-off clock. The bulk removal is modeled as a first-class **observable, cancellable, resumable Job** drained sequentially (concurrency=1), checkpointing each item so a crash/`PEER_FLOOD` mid-job leaves recoverable state. All RPC errors pass through one `classifyTelegramError()` that maps to a typed enum with explicit skip/fail/retry dispositions. See ARCHITECTURE.md.

**Major components:**
1. **SessionManager / MTProto client** — single source of truth for the connection; auth state machine (phone->code->2FA); session persistence + revoking logout.
2. **Rate-limit governor + error classification** (`withFloodWaitBackoff` + `errors.ts`) — the spine every call funnels through; FLOOD_WAIT auto-sleep with UI countdown, distinct from PEER_FLOOD hard-stop.
3. **TargetResolver** — username/phone -> stable numeric user ID + access_hash + identity/avatar, with typed non-resolution failures.
4. **GroupEnumerator + MembershipVerifier** — `getCommonChats` candidate set, single-user `getParticipant` membership check, per-group admin ban-right evaluation (grey-out).
5. **RemovalJobExecutor + Results/AuditStore** — the throttled, type-branching, per-item-isolated, resumable execution engine with durable audit/report.

### Critical Pitfalls

1. **Shared `api_id` flagged/revoked -> all users bricked at once** — use a dedicated (never reused/example) credential; treat it as public (obfuscation is theater); build a **remote-config kill-switch** so a revoked credential can be swapped without re-coding; keep per-account traffic human-paced to keep the credential healthy.
2. **No central rate-limit governor; membership scan flood** — ALL calls (resolve, membership, removal) funnel through one serialized queue; honor `FLOOD_WAIT_X` exactly (sleep + jitter + resume); never parallelize; use cheap single-user `getParticipant`, not full participant scans, for membership.
3. **`PEER_FLOOD` / account spam-flag on the user's REAL account** — detect distinctly from FLOOD_WAIT and **hard-stop** (no retry); add behavioral jitter, volume caps, longer pauses every N actions; warn before large jobs; persist resumable state; point to @SpamBot.
4. **Wrong person (recycled usernames / late resolution / avatar theater)** — resolve to numeric user ID + access_hash **once, early**; act on the ID end-to-end; re-check identity if ever re-resolved; make verification load-bearing (hidden-avatar = *more* deliberate confirmation); show the user ID on the final review screen.
5. **Session takeover on leak** — encrypt session with an **OS-keystore-held** key (never the binary/base64); never log it; logout must terminate the server-side authorization **and** wipe the local blob.

Additional high-priority pitfalls: **permission model across group types** (branch removal by chat type; check the actual `ban_users` right, not "am I admin?"; can't ban an admin); **destructive blast safety** (dry-run, audit log, per-group failure isolation, default to kick not ban); **distribution friction** (sign + notarize for macOS/Windows — a STACK constraint, verify on clean VMs); and **ToS/abuse exposure** (stay strictly within delegated authority; single-purpose; audit log as accountability).

## Implications for Roadmap

Based on combined research, the suggested phase structure follows the architecture's build-order spine (foundational -> dependent), front-loading the credential strategy and rate-limit governor because they are foundational and hard to retrofit.

### Phase 1: Foundation — Auth, Session Security & Credential Strategy
**Rationale:** Nothing works without an authenticated client, and both session-at-rest security and the shared-`api_id` strategy are foundational and expensive to retrofit (Architecture build-order #1; Pitfalls 1 & 8).
**Delivers:** Electron + GramJS in-process wiring; phone->code->2FA auth state machine; `StringSession` encrypted via `safeStorage`; relaunch-without-relogin; **revoking** logout (server-side + local wipe); dedicated embedded `api_id`/`api_hash`; **remote-config kill-switch** scaffold for credential rotation.
**Addresses:** Login, encrypted session persistence, revoking logout (FEATURES table stakes).
**Uses:** GramJS, Electron `safeStorage`, electron-builder.
**Avoids:** Shared-`api_id` revocation bricking all users (Pitfall 1); session takeover on leak (Pitfall 8).

### Phase 2: Rate-Limit Governor & Error Classification (the spine)
**Rationale:** This is core infrastructure that MUST exist before any multi-call feature; every later component depends on it (Architecture build-order #2; Pitfalls 2, 3, 4). Unit-testable against a mock client with no UI.
**Delivers:** Single serialized request queue all Telegram calls funnel through; `withFloodWaitBackoff` (parse -> sleep+jitter -> resume, with UI countdown events); `classifyTelegramError()` typed enum; **distinct FLOOD_WAIT (retry) vs PEER_FLOOD (hard-stop) handling**; rolling rate budget with proactive slow-down.
**Implements:** Governor + `telegram/errors.ts`.
**Avoids:** No-governor flood escalation (Pitfall 3); account spam-flag (Pitfall 4); membership-scan flood multiplier (Pitfall 2).

### Phase 3: Target Resolution & Load-Bearing Verification
**Rationale:** The project's central value prop ("remove the *right* person"); parallelizable once Phases 1-2 exist (Architecture build-order #3; Pitfall 5).
**Delivers:** Username/phone -> **numeric user ID + cached access_hash resolved once, early**; identity panel (name/@username/numeric ID/bio); avatar with no-photo fallback; identity-drift re-check; honest distinct messaging for each non-resolution case (not-occupied / phone-not-a-contact / no-public-profile); hidden-avatar = more deliberate confirmation.
**Addresses:** Target resolution + visual verification (FEATURES table stakes).
**Avoids:** Wrong-person ban via recycled usernames / avatar theater (Pitfall 5).

### Phase 4: Group Enumeration, Membership & Rights Evaluation
**Rationale:** Produces the checklist data model; depends on the governor (Phase 2) and resolved target ID (Phase 3); parallelizable with Phase 3 (Architecture build-order #4; Pitfalls 2, 6).
**Delivers:** `getCommonChats` candidate set; single-user `getParticipant` membership verification (serialized, cached access_hash); **chat-type detection**; per-group actual `ban_users` right check -> pre-checked rows vs greyed-out-with-specific-reason; scan progress UI.
**Addresses:** Group list (membership-verified, rights-aware grey-out), pre-checked selection (FEATURES table stakes).
**Avoids:** Membership-scan flood (Pitfall 2); wrong permission model / wrong grey-out (Pitfall 6).

### Phase 5: AuditStore + Removal Job Executor
**Rationale:** The riskiest, most-testable unit; AuditStore is built *before* the executor so checkpointing is built-in not retrofitted (Architecture build-order #5-6; Pitfalls 3, 4, 6, 7).
**Delivers:** Durable job + per-item state (resumable, crash-safe); sequential (concurrency=1) throttled worker; **chat-type-branched removal** (`deleteChatUser` vs `editBanned`; kick = restrict-then-unban); per-run kick-vs-ban (default kick); per-group failure isolation; PEER_FLOOD hard-stop mid-job; emits progress/flood-wait/done events; audit log persisting target ID + group + action + result.
**Addresses:** Throttled execution, per-group report, kick/ban toggle (FEATURES table stakes); audit log (differentiator).
**Avoids:** Destructive blast without isolation/audit (Pitfall 7); account spam-flag mid-job (Pitfall 4); wrong-type removal failures (Pitfall 6).

### Phase 6: UI Integration — Wizard, Review/Confirm Gate & Live Progress
**Rationale:** Binds progressively against each service as it lands; the review/confirm gate and live-progress view land last on top of the executor's event stream (Architecture build-order #7; Pitfall 7).
**Delivers:** Login wizard, resolve view, checklist (pre-checked + grey-out), **final review screen showing numeric user ID + exact affected groups + action**, one explicit confirmation, live per-group progress + final report; in-app responsible-use / consequences warning.
**Addresses:** Review + confirm gate, live progress (FEATURES table stakes).
**Avoids:** Verification theater / destructive blast (Pitfalls 5, 7); ToS/abuse exposure via warnings (Pitfall 10).

### Phase 7: Packaging, Signing & Release
**Rationale:** Distribution friction is the adoption-killer for non-technical admins; a STACK constraint that must be verified on clean machines (Pitfall 9). *Signing strategy should be validated early in Phase 1, executed/verified here.*
**Delivers:** macOS Developer ID signing + notarization; Windows code-signing (EV cert for SmartScreen reputation); universal macOS binary (Intel + ARM); clean-VM launch verification on both OSes/architectures.
**Avoids:** Gatekeeper/SmartScreen blocking launch (Pitfall 9).

### Phase Ordering Rationale

- **The spine dictates order:** auth/session -> governor/errors -> AuditStore -> executor is a hard dependency chain (Architecture's explicit build order). Phases 3 and 4 parallelize once the spine (1-2) exists; the UI (Phase 6) can be stubbed against fake IPC from the start so frontend and core proceed in parallel.
- **Credential strategy and rate-limit governor are front-loaded** because they are foundational and the most expensive to retrofit (Pitfalls 1 and 3 are both flagged "must exist before any feature that makes multiple calls").
- **Target resolution gets dedicated phase weight** because acting on the wrong person is the project's central failure mode and the value prop.
- **Safety gates (dry-run, audit, confirm, per-group isolation) are structural, not polish** — the executor (Phase 5) and review UI (Phase 6) bake them in rather than deferring.
- **Signing is a constraint surfaced in Phase 1, verified in Phase 7** — it constrains the framework choice (already resolved to Electron, which sidesteps the sidecar-notarization trap) and must be tested on clean VMs.

### Research Flags

Phases likely needing deeper research during planning (`/gsd:plan-phase --research-phase <N>`):
- **Phase 4 (Group enumeration / rights):** MEDIUM-confidence area — per-chat-type rights detection (basic group vs supergroup vs channel, "admin without ban right," "can't ban an admin") needs exact GramJS `Api.*` call mapping and rights-flag inspection.
- **Phase 5 (Executor / removal semantics):** The legacy basic-group removal path (`messages.deleteChatUser`) and the kick = restrict-then-unban supergroup sequence are MEDIUM-confidence; PEER_FLOOD vs FLOOD_WAIT distinction and resumability need careful design + mock-client tests.
- **Phase 1 (Credential kill-switch):** The shared-`api_id` revocation/rotation behavior and remote-config kill-switch are MEDIUM-confidence (community/policy-driven, no SLA) — validate the rotation mechanism.

Phases with standard patterns (skip research-phase):
- **Phase 1 auth/session core:** GramJS auth + `safeStorage` are HIGH-confidence, well-documented.
- **Phase 2 governor:** FLOOD_WAIT handling is HIGH-confidence (library + official docs); the work is discipline, not discovery.
- **Phase 6 UI:** Standard Electron renderer + IPC patterns.
- **Phase 7 signing:** Well-documented Electron code-signing/notarization (notably *without* the Tauri sidecar trap, since Electron runs GramJS in-process).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | GramJS + Electron verified against npm/official docs; library maturity (Telethon archived, Pyrogram unmaintained) confirmed. MEDIUM only on secure-storage edge cases and api_id distribution policy. |
| Features | MEDIUM-HIGH | Telegram API mechanics HIGH (core.telegram.org + GramJS/Telethon docs); competitor landscape MEDIUM — sparse, scripts-only market with no polished benchmark. |
| Architecture | HIGH | Component decomposition, data flow, and throttled-executor design are HIGH; runtime-boundary (Electron + in-process GramJS) MEDIUM-HIGH, driven by library maturity. |
| Pitfalls | MEDIUM-HIGH | API mechanics + credential/distribution facts HIGH (official docs, issue trackers); exact rate-limit/ban thresholds MEDIUM-LOW (Telegram deliberately doesn't publish them — design for adaptivity, not constants). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Exact rate limits / ban heuristics are unpublished by design.** Telegram says knowing exact limits is "useless and harmful." Handle by designing for adaptivity (parse FLOOD_WAIT dynamically, jitter, volume caps), not magic constants. Validate pacing empirically against throwaway accounts during Phase 5.
- **Shared `api_id` flagging/revocation has no SLA.** MEDIUM confidence from policy docs + community reports. Mitigate with the Phase 1 kill-switch and an incident runbook; design so per-user-supplied `api_id` is *possible* later without a rewrite.
- **Legacy basic-group removal path** (`messages.deleteChatUser`) and the kick = restrict-then-unban sequence are MEDIUM — the GramJS calls exist but correct dispatch needs verification with mock-client tests in Phase 4/5.
- **Phone resolution privacy gate:** `contacts.resolvePhone`/`importContact` only works if the target is a contact. Design the contacts-privacy branch as a first-class UX path, not an error.
- **Pin exact versions at build time:** re-verify Electron latest stable and GramJS `telegram` minor before locking the roadmap (fast release cadences).

## Sources

### Primary (HIGH confidence)
- Telegram core API — rights / channel / errors: https://core.telegram.org/api/rights , https://core.telegram.org/api/channel , https://core.telegram.org/api/errors — removal mechanics by type, FLOOD_WAIT semantics.
- `messages.getCommonChats` (user-only): https://core.telegram.org/method/messages.getCommonChats — shared-groups backbone.
- `contacts.resolveUsername` / `contacts.resolvePhone`: https://core.telegram.org/method/contacts.resolvePhone — phone limited to contacts.
- GramJS: https://github.com/gram-js/gramjs , https://gram.js.org/ , https://www.npmjs.com/package/telegram — auth, `StringSession`, `EditBanned`/`GetParticipant`, `floodSleepThreshold`; latest 2.26.22 (Feb 2025).
- Electron `safeStorage`: https://www.electronjs.org/docs/latest/api/safe-storage — Keychain/DPAPI; keytar unmaintained.
- Telethon (reference for taxonomy + sessions): https://docs.telethon.dev/ — flood_sleep_threshold, session = account access; archived on GitHub Feb 2026.
- `auth.importLoginToken` (QR login, deferred): https://core.telegram.org/method/auth.importLoginToken

### Secondary (MEDIUM confidence)
- TDLib issue #534 — shared/example api_id -> accounts deleted within seconds.
- Telethon issues #1569 (session = account access), #3708 (aggressive participant fetch floods).
- tdesktop issue #7395 — recycled/reassigned identity -> wrong-account exposure.
- Tauri vs Electron bundle/runtime tradeoffs + sidecar notarization (#11992): https://v2.tauri.app/ , https://www.gethopp.app/blog/tauri-vs-electron
- Telegram api_id obtaining/published-credential policy: https://core.telegram.org/api/obtaining_api_id
- electron-store encryption is breakable: https://blog.jse.li/posts/electron-store-encryption/

### Tertiary (LOW confidence — needs validation)
- Rate-limit/account-safety community sources (exact numbers indicative only): https://telegram.org/faq_spam , grammY flood docs, python-telegram-bot wiki, GoLogin 2026 ban/detection writeup — timing-variance/jitter heuristics; validate empirically.
- Competitor/anti-pattern references: RkManager (admin bot), remove-all-members (userbot anti-pattern).

---
*Research completed: 2026-06-10*
*Ready for roadmap: yes*
