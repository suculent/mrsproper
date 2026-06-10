# Pitfalls Research

**Domain:** Telegram MTProto User API — bulk destructive member-removal desktop tool
**Researched:** 2026-06-10
**Confidence:** MEDIUM-HIGH (Telegram intentionally does not publish exact limits; account-safety thresholds are MEDIUM/LOW from community sources, while API mechanics and credential/distribution facts are HIGH from official docs and library issue trackers)

> **Framing note:** Telegram deliberately keeps rate limits and ban heuristics opaque. Per Telegram's own guidance, knowing "the exact limits" is "useless and harmful" — you must handle `FLOOD_WAIT` dynamically regardless. Treat every quantified number below as an order-of-magnitude planning input, not a contract. Design for adaptivity, not for a magic constant.

---

## Critical Pitfalls

### Pitfall 1: Shipping the app's embedded `api_id`/`api_hash` and getting it flagged, throttled, or revoked — taking down every user at once

**What goes wrong:**
The project's stated design (PROJECT.md: "App ships with its own api_id/api_hash") means one shared credential serves all users. Telegram treats a single `api_id` as a single "application." When that one credential drives aggressive, automated, destructive traffic across many accounts, Telegram can: (a) return `API_ID_PUBLISHED_FLOOD` (the documented penalty for credentials that are public/shared/example), (b) place every account logging in under that `api_id` "under observation," or (c) revoke the `api_id` entirely — instantly bricking *all* users of the app. There are documented cases of accounts being **deleted within seconds of login** when using a "tainted" shared/example `api_id` (TDLib issue #534).

**Why it happens:**
Developers assume `api_id`/`api_hash` are like a normal API key — a per-app identifier with a quota. In reality Telegram uses the `api_id` as a *reputation and abuse-attribution unit*. A non-official client doing automation is already "under observation"; a shared credential concentrates the entire fleet's risk into one revocable token. The credential also cannot be kept secret in a distributed binary — it is trivially extractable, so others can abuse *your* `api_id`, accelerating its flagging.

**How to avoid:**
- Generate a **dedicated** `api_id` from `my.telegram.org` specifically for this app; never reuse example/official-client credentials (those are the ones that trigger `API_ID_PUBLISHED_FLOOD`).
- Treat the embedded credential as **public, not secret** — obfuscation is theater. Plan for it leaking.
- Build a **kill-switch / remote-config** path so a revoked `api_id` can be swapped via an app update without re-coding (e.g. fetch the active credential from a signed remote config at launch, with the embedded one as fallback).
- **Minimize per-account aggressiveness** (see Pitfalls 2–4) — the single biggest lever to keep the shared `api_id` healthy is making each account's traffic look human.
- Have a documented **incident runbook** for "api_id revoked": how fast can you ship a new build/config?
- Consider (and document the tradeoff of) the alternative: letting power users supply their own `api_id`. It kills the "zero-setup" value prop but isolates blast radius. At minimum, design so this is *possible* later without a rewrite.

**Warning signs:**
`API_ID_PUBLISHED_FLOOD` errors at login; sudden login failures across multiple users simultaneously; accounts auto-restricted right after first login with no user action.

**Phase to address:** Authentication / MTProto-integration phase (credential strategy is foundational and hard to retrofit). Add a remote-config kill-switch as an early, not-deferred item.

---

### Pitfall 2: Membership verification across hundreds of groups — the silent flood multiplier before any removal happens

**What goes wrong:**
PROJECT.md requires "List only the groups where the target is actually a member (membership verified before display)." The naive implementation iterates every dialog and calls `channels.getParticipant`/`channels.getParticipants` per group to check membership. An admin in 200+ groups generates 200+ resolution/participant calls *before the user has even confirmed the target*. `GetParticipants` is documented as flood-prone; Telethon's `aggressive=True` (parallel participant fetch) reliably produces `MultiError`-wrapped `FLOOD_WAIT`s. Doing hundreds of these back-to-back can trigger an **account-level** flood wait that stalls the whole app — and repeated offense raises spam-flag risk.

**Why it happens:**
Membership checking *feels* read-only and harmless, so it gets no throttling budget. The cost is invisible in testing with 3 groups and catastrophic with 300. Developers also reach for `getParticipants` (full member list) when they only need a single-member check.

**How to avoid:**
- Use **`channels.getParticipant`** (single-user lookup, cheap) rather than enumerating full participant lists with `getParticipants`. You only care whether the target is in the group.
- **Throttle and serialize** these checks through the *same* rate-limit governor used for removals — never parallel-blast.
- **Reuse the dialog list** you already have to filter to groups the admin can act in (admin + ban rights) *before* doing any membership network calls — don't membership-check groups you can't act on anyway.
- **Cache `access_hash`** for the target user once resolved (see Pitfall 5) so each group check doesn't re-resolve the user.
- Surface a **progress indicator** for the scan; it is a long operation by design, not a hang.
- Consider deferring membership precision: list *candidate* groups fast, verify membership lazily/just-in-time at removal, or batch-verify with explicit pacing and a visible ETA.

**Warning signs:**
`FLOOD_WAIT` during the "scanning groups" step; scan time scaling linearly and badly with group count; the app appearing to hang on accounts with many groups.

**Phase to address:** Group enumeration / membership-verification phase. The rate-limit governor (Pitfall 3) must exist *before* this phase ships.

---

### Pitfall 3: No central rate-limit governor — treating `FLOOD_WAIT` as an error instead of normal flow control

**What goes wrong:**
Each Telegram operation (`ResolveUsername`, `getParticipant`, `deleteChatUser`, `channels.editBanned`) is independently throttled but contributes to shared account-level limits. Without one governor, retries are ad-hoc, parallel calls stack, and `FLOOD_WAIT_X` is treated as a failure to surface to the user rather than a "sleep X seconds and resume" instruction. Aggressive bursts escalate from per-method waits to account-wide limitation.

**Why it happens:**
`FLOOD_WAIT` looks like an exception, so it lands in a generic error handler. Developers also under-pace because small test runs never hit limits. Parallelism is added for speed and silently multiplies request rate.

**How to avoid:**
- Build a **single serialized request queue** with a global pacer that ALL Telegram calls funnel through (resolution, membership checks, removals alike). No raw client calls outside it.
- **Honor `FLOOD_WAIT_X` exactly**: parse the seconds, wait that long (plus jitter), then resume the *same* operation. PROJECT.md already mandates "automatic FLOOD_WAIT back-off" — make it the queue's core behavior, not a try/catch afterthought.
- **Insert deliberate inter-operation delays** (human-paced, with randomized jitter — uniform-interval automation is itself a detection signal per 2026 community reports). Community-reported safe-ish spacing for membership mutations is on the order of tens of seconds between actions, not sub-second.
- **Never parallelize** destructive or participant calls. Sequential by design (PROJECT.md already says "throttled sequential execution" — enforce it architecturally so no future code can bypass it).
- Track a **rolling request-rate budget** and proactively slow down as you approach it, rather than only reacting after a `FLOOD_WAIT`.
- Distinguish `FLOOD_WAIT` (transient, wait-and-retry) from `PEER_FLOOD`/account-limitation (a spam flag — stop, do not retry; see Pitfall 4).

**Warning signs:**
Long `FLOOD_WAIT_X` values that keep growing run-over-run; the same operation flooding repeatedly; any code path issuing a Telegram call without going through the queue.

**Phase to address:** Must exist as core infrastructure in the MTProto-integration phase, before *any* feature that makes multiple calls (membership scan, execution).

---

### Pitfall 4: Account-level spam flag / `PEER_FLOOD` — the user's real personal account gets limited or banned mid-job

**What goes wrong:**
Unlike a transient `FLOOD_WAIT`, a spam flag (`PEER_FLOOD`, account limitation) restricts the user's **real, personal Telegram account** — the one they use daily. A bulk-removal tool that hammers automation patterns (uniform timing, high-volume destructive actions, mass membership probing) can get the account flagged as bot/spammer. A limited account can still receive messages and reply to existing contacts but loses the ability to act on strangers/new peers. If this lands **mid-job**, the user is left with a half-cleaned set of communities, no clear state, and a damaged personal account. New or freshly-logged-in accounts (a new MTProto session) are under tighter scrutiny — a brand-new session doing destructive bulk actions immediately is high-risk.

**Why it happens:**
Telegram's 2026 detection reportedly weighs *how* you act (timing variance, behavioral pattern) as much as *what* you do. A "remove this person from 200 groups in 4 minutes" pattern is exactly what abuse looks like. Developers test on throwaway accounts and never feel the consequence; the *user* feels it on their primary account. The destructive nature means there's no harmless "warm-up" — every action is high-signal.

**How to avoid:**
- **Pace conservatively and add behavioral jitter** — randomized, human-scale delays between removals; avoid metronome-perfect intervals.
- **Cap per-run volume** and/or insert longer pauses after every N actions; consider chunking very large jobs across sessions/time rather than one giant blast.
- **Detect `PEER_FLOOD`/limitation distinctly and HARD-STOP** the job: do not retry, surface a clear "your account has been temporarily limited by Telegram" message, point to `@SpamBot` for appeal, and persist exactly where the job stopped so it's resumable later.
- **Warn the user before large jobs** that aggressive automation can risk their account, and that this tool uses their real session.
- Treat **new sessions cautiously** — consider gentler default pacing on a session's first job.
- Keep the tool **single-purpose** (PROJECT.md already excludes messaging/scraping) — this is genuinely protective, since unsolicited-message spam is the #1 flag trigger and this tool sends none.

**Warning signs:**
`PEER_FLOOD` error; `@SpamBot` reports the account is limited; removals start succeeding then suddenly all fail with permission/flood errors; user reports they can no longer message strangers.

**Phase to address:** Execution-engine phase (pacing, hard-stop, resumability) and UX phase (pre-run warning, limitation messaging). Recovery/resume state is a "looks done but isn't" trap (see checklist).

---

### Pitfall 5: Acting on the WRONG PERSON — recycled usernames, late ID resolution, and avatar-verification theater

**What goes wrong:**
The core safety promise is "remove the *right* person." Three distinct failure modes break it:
1. **Recycled/changed usernames:** Telegram usernames can be released and **reassigned to a different person**. If the app resolves `@target` at the start, then re-resolves the username later (or the admin saved a username from weeks ago), the username may now point to a *completely different account*. Resolving by username at execution time risks banning an innocent new owner of a recycled handle.
2. **Phone resolution requires contact:** `contacts.resolvePhone` only works if the target's number is in the logged-in user's contacts (Telegram privacy). For non-contacts it returns nothing — and silently treating an empty result as "not found / skip" vs. surfacing "can't resolve by phone, add as contact or use username" changes the whole UX.
3. **Avatar verification as theater:** PROJECT.md relies on avatar + identity for visual confirmation. But avatars can be hidden/absent (privacy), and a hidden avatar must NOT degrade into "looks fine, proceed." If verification is just a decorative screen the user clicks past, it provides false assurance, not safety.

**Why it happens:**
Developers treat username/phone as stable primary keys. They're not — only the numeric **user ID** is stable. Resolution is often re-done lazily at each step instead of once. Empty/None results from privacy restrictions get coerced into benign defaults. Verification UX is built to look reassuring rather than to actively defend against the wrong target.

**How to avoid:**
- **Resolve to the stable numeric user ID (and cache its `access_hash`) exactly once, early**, immediately after identification and visual confirmation. From that point on, every membership check and every removal targets the **user ID**, never the username string. The username is a lookup key, not an identity.
- **Re-confirm identity drift:** if you ever re-resolve, verify the user ID still matches the confirmed one; if it changed, **abort and re-verify** (the handle was recycled).
- **Handle empty resolution explicitly** with distinct, honest messaging: "username not found / not occupied," "phone not in your contacts (Telegram privacy) — can't resolve by phone," "user has no public profile." Never coerce empty → proceed.
- **Make verification load-bearing, not decorative:** show photo + full name + @username + numeric ID + bio; when the avatar is hidden/absent, make the **fallback identity details prominent and require a more deliberate confirmation**, not a softer one. Show the numeric ID on the final review screen so the same identity is provably carried through to execution.
- The **final review screen** (PROJECT.md) should display the resolved **user ID** alongside the group list, so the confirmed identity and the execution target are demonstrably the same object.

**Warning signs:**
Code that passes a username string into removal calls; re-resolving the target inside the per-group loop; "no avatar" paths that skip or soften confirmation; empty resolution results mapped to non-error states.

**Phase to address:** Target-resolution phase (resolve-to-ID-early, recycled-username defense) and verification-UX phase (anti-theater confirmation). This is the project's central value prop — give it dedicated phase weight.

---

### Pitfall 6: Permission model wrong across group types — greying out the wrong groups, or attempting removals that can't succeed

**What goes wrong:**
PROJECT.md requires "Show groups where the admin lacks kick rights as greyed-out with a reason." Getting the permission model wrong means either (a) greying out groups the admin *can* act in (under-delivering), or (b) presenting groups as actionable that then fail with `CHAT_ADMIN_REQUIRED` mid-execution (broken promise, partial job). Telegram's removal mechanics differ sharply by type:
- **Basic groups (`chat`):** removal uses `messages.deleteChatUser`. No granular per-user ban rights model; semantics differ from supergroups. Migration to supergroup changes the rules.
- **Supergroups/megagroups & channels:** removal uses `channels.editBanned` with `ChatBannedRights`; requires the admin to actually hold the **ban-users** admin right (`chatAdminRights`), which is a *specific* right an admin may not have even if they're "an admin."
- **Creator-only / right-hierarchy edge cases:** an admin generally can't ban another admin, and certain actions are effectively creator-gated. "Is an admin" ≠ "can ban this particular user."

Detecting rights only from "am I an admin?" rather than "do I hold ban rights AND can I ban *this* target here?" produces wrong grey-out decisions and runtime failures.

**Why it happens:**
The Bot API hides much of this; on MTProto the developer must branch on chat type and inspect actual admin-rights flags. Developers test in a supergroup they created (full rights) and never hit the basic-group path, the "admin without ban right" path, or the "can't ban an admin" path.

**How to avoid:**
- **Branch removal by chat type**: `messages.deleteChatUser` for basic groups; `channels.editBanned` for supergroups/channels. Don't assume one method everywhere.
- **Check the actual `chatAdminRights` ban flag**, not just admin membership, when deciding actionable vs greyed-out.
- **Account for hierarchy:** target is creator/admin → likely un-bannable by this admin → grey out with an accurate reason.
- **Make grey-out reasons specific and honest:** "you lack ban rights here," "target is an admin," "basic group — limited controls," not a generic "can't act."
- **Defend at execution too:** even with correct pre-checks, treat `CHAT_ADMIN_REQUIRED` / rights errors at removal time as a per-group failure in the report (Pitfall 7), never a job-killer.

**Warning signs:**
Single removal code path for all chat types; rights derived only from admin-membership boolean; `CHAT_ADMIN_REQUIRED` appearing during execution for groups the UI showed as actionable; basic groups behaving oddly.

**Phase to address:** Group enumeration / rights-evaluation phase (correct grey-out) and execution phase (per-type removal + runtime error tolerance).

---

### Pitfall 7: Destructive blast with no dry-run, audit log, or per-group failure isolation — wrong removals are effectively irreversible

**What goes wrong:**
Removing someone from many communities is **hard to undo**: a kicked user can rejoin only if they find/are re-invited; a **banned** user is blocked from rejoining entirely and must be manually unbanned per group. If the job acts on the wrong person (Pitfall 5) or fails partway (Pitfall 4), there's no record of what happened, no way to reverse it cleanly, and one failing group can abort the whole run leaving inconsistent state. **Ban vs kick** is a severity decision with very different reversibility — conflating them or defaulting to the harsher one is dangerous.

**Why it happens:**
The happy path (everything succeeds) is easy to demo; the partial-failure and wrong-target paths require deliberate engineering that's easy to defer. Audit logging feels like "polish." Developers let one exception bubble up and kill the loop.

**How to avoid:**
- **Confirm gate (PROJECT.md has this):** final review screen with target identity + exact affected-group list + ban-vs-kick choice + one explicit confirmation. Keep it; don't weaken it.
- **Dry-run mode:** produce the exact would-affect list (groups + action) *without executing*, so the user sees the full blast radius first. Cheap insurance against Pitfall 5/6 mistakes.
- **Per-group isolation:** wrap each removal; a failure in group N records a per-group result and **continues** to N+1. Never let one group abort the run (PROJECT.md's "per-group success/failure report" implies this — enforce it).
- **Audit log:** persist a record of every action (who, where, ban/kick, timestamp, result, target user ID). This is the *only* way to undo a mistake — it becomes the worklist for an "undo / unban" recovery.
- **Make ban vs kick consequences explicit in the UI:** ban = blocks rejoin, manual unban per group to reverse; kick = removable, target can rejoin. Default to the *less* destructive option (kick) unless the user opts into ban.
- **Resumable state:** persist job progress so a mid-job `PEER_FLOOD`/limitation (Pitfall 4) or crash leaves a recoverable, inspectable state, not an unknown one.

**Warning signs:**
No persisted record of completed actions; the loop aborting on first error; no dry-run; ban as the default; users unable to answer "what exactly did it do?"

**Phase to address:** Execution-engine phase (isolation, resumability, audit log) and review-UX phase (dry-run, ban/kick clarity, confirm gate).

---

### Pitfall 8: Stored session string = full account takeover if leaked — weak at-rest protection

**What goes wrong:**
PROJECT.md persists an encrypted session so users don't re-login. A Telegram session (auth key) is **full account access**: anyone who copies the session file/string can act as the user **without** re-authenticating — no phone, no code, no 2FA needed (the documented Telethon concern: "anyone who has access to the session file can access said account even if they did not directly authenticate"). A plaintext or weakly-protected session at rest on a desktop is a complete account-takeover primitive. Worse, sessions are portable across libraries/formats, so a leaked string is immediately usable by an attacker's own client.

**Why it happens:**
Libraries default to writing sessions as plaintext SQLite files or bare strings for convenience. "Encrypted at rest" gets implemented as base64 or a hardcoded key (no real protection). Developers underestimate that the session, not the password, is the crown jewel.

**How to avoid:**
- **Encrypt the session with a key held in the OS secure store** — macOS Keychain, Windows Credential Manager / DPAPI — not a key embedded in the binary or derived from a constant.
- Never write the session to disk in plaintext, logs, crash reports, or telemetry. Audit that the session string never leaves the device.
- **Logout must fully destroy** the session both locally (wipe encrypted blob + key) and server-side (terminate the Telegram authorization), so a logged-out machine retains nothing usable. PROJECT.md's "logout that clears it" must mean *both*.
- Restrict file permissions on any on-disk artifacts to the current user.
- Consider invalidating/re-prompting if the encrypted store can't be unlocked (don't silently fall back to weaker storage).

**Warning signs:**
Session readable without OS-keystore unlock; session string in logs/telemetry; logout that only deletes a local file but leaves the Telegram authorization active; encryption key found in the binary.

**Phase to address:** Session-persistence/security phase. Keychain/Credential-Manager integration is platform-specific work — budget it explicitly, don't assume "encrypt at rest" is a one-liner.

---

### Pitfall 9: Distribution friction — unsigned binaries and a bundled MTProto runtime that won't launch on users' machines

**What goes wrong:**
The whole value prop is "easily portable, simple-to-run for non-engineer admins." That dies if: (a) macOS **Gatekeeper** blocks the unsigned/unnotarized app ("can't be opened, unidentified developer"), (b) Windows **SmartScreen** warns users away (collapsing install rates), or (c) the bundled MTProto runtime / native dependencies aren't portable across OS versions and CPU architectures. With Tauri specifically, bundling external/sidecar binaries (e.g. a Python MTProto runtime) is a **known notarization pain point** — apps notarize fine *until* an `externalBin` sidecar is added, then fail. Apple-Silicon vs Intel universal-binary handling for sidecars is **not automatic**.

**Why it happens:**
Code-signing/notarization is invisible on the developer's own machine (signed by their dev identity / Gatekeeper-trusted locally). It only bites *other people's* machines — i.e. exactly the non-technical admins this tool targets. Native deps and the runtime "work on my machine" and break on a clean OS.

**How to avoid:**
- Plan **macOS Developer ID signing + notarization** and **Windows code-signing** from the start; budget the Apple Developer account, certs, and the notarization toolchain. An **EV cert on Windows** earns immediate SmartScreen reputation and avoids warnings.
- **Validate the chosen framework against the sidecar/notarization gotcha early** (this directly informs the STACK decision): if the MTProto runtime is a bundled sidecar, prototype signing+notarizing *with the sidecar included* before committing — don't discover the `externalBin` notarization failure at release.
- Build/ship **universal macOS binaries** (Intel + Apple Silicon) including any sidecar; the framework won't do this for non-Rust sidecars automatically.
- Test launch on **clean VMs** (fresh macOS + fresh Windows, both architectures), not just dev machines.
- Pick a stack where the MTProto runtime is portable without per-user toolchain installs (no "install Python first").

**Warning signs:**
"Unidentified developer" / "app is damaged" on macOS; SmartScreen warning on Windows; app runs in dev but not on testers' clean machines; notarization that passes until a sidecar is added; works on Apple Silicon but not Intel (or vice versa).

**Phase to address:** Cross-cutting — flag in the FIRST/foundational stack-selection phase (because it constrains the framework choice) and verify in the packaging/release phase. This is a STACK decision input, not a late add-on.

---

### Pitfall 10: ToS / abuse-vector exposure — a "remove anyone from everywhere" tool is dual-use

**What goes wrong:**
The tool automates the User API (Telegram ToS governs automation) and lowers the effort to mass-remove people. Even constrained to "only what the logged-in admin is already permitted to do," it can be weaponized (e.g. an admin systematically purging a faction, or coordinated harassment). Beyond reputational risk, automation that looks abusive raises the shared-`api_id` flagging risk (Pitfall 1) and the per-account spam-flag risk (Pitfall 4).

**Why it happens:**
Capability is built without a use-policy or guardrails; the tool's power is treated purely as a feature. The legal/ToS surface is left unconsidered because "it only does what the admin could do manually."

**How to avoid:**
- **Stay strictly within delegated authority** (PROJECT.md already scopes to "only what the logged-in account is permitted to do" — keep this as a hard invariant; never add capability to act beyond the admin's rights).
- Keep the tool **single-purpose** (no messaging/scraping/growth — PROJECT.md excludes these) — this materially lowers both the ToS and the spam-flag profile.
- The **audit log** (Pitfall 7) and **confirm gates** double as accountability — the user owns a record of deliberate actions.
- Add clear **in-app warnings** that actions are real, destructive, attributable to the user's account, and that aggressive use can get *their* account limited.
- Review Telegram's ToS/automation stance and document the tool's compliance posture; surface a short responsible-use notice.

**Warning signs:**
Feature requests to exceed the admin's actual rights, to message/scrape, or to bypass confirmation; absence of any usage record; no in-app statement of consequences.

**Phase to address:** Scope/product-definition (invariants) and UX phase (warnings, responsible-use notice). Mostly a guardrail-maintenance concern across all phases.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Raw Telegram calls bypassing the rate-limit queue "just for this one read" | Faster to code, feels harmless | A single un-governed path triggers account-wide `FLOOD_WAIT`/spam flag; defeats the whole pacing design | **Never** — all calls through the governor |
| Resolving target by username string at each step instead of caching the user ID | Less plumbing | Recycled-username → wrong-person ban; the core safety failure | **Never** — resolve to user ID once, early |
| `getParticipants` (full list) for a membership check | One familiar call | Heavy, flood-prone at scale; needless data | Never for membership; use `getParticipant` |
| Session "encrypted" via base64 / hardcoded key | Ships fast, looks encrypted | Full account takeover on leak; false security | **Never** — use OS keystore |
| Single removal code path for all chat types | Less branching | Basic-group failures, runtime `CHAT_ADMIN_REQUIRED`, broken grey-out | Never — branch by chat type |
| Skip dry-run / audit log for MVP | Faster to "done" | No way to verify blast radius or undo a wrong-target mistake | Only if confirm-gate + per-group report are rock-solid; even then risky |
| Uniform-interval pacing (fixed sleep) | Simple | Metronome timing is itself a bot-detection signal in 2026 | Acceptable as a start; add jitter before scale |
| Defer Apple notarization / Windows EV signing | Ship a build sooner | Non-technical users can't launch it; adoption dies | Only for internal/dev testing, never public release |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Telegram MTProto auth | Embedding example/official-client `api_id` | Dedicated `api_id` from my.telegram.org; remote-config kill-switch for revocation |
| `contacts.resolvePhone` | Assuming any phone resolves | Only works if target is a contact (privacy); handle empty result with explicit, honest messaging |
| `contacts.resolveUsername` | Treating username as stable identity | Resolve to numeric user ID + `access_hash` once; never act on the string later |
| `channels.getParticipant(s)` | Looping `getParticipants(aggressive=True)` across groups | Single-user `getParticipant`, serialized through the governor, cached access_hash |
| `channels.editBanned` vs `messages.deleteChatUser` | One method for all chat types | Branch: basic group → `deleteChatUser`; supergroup/channel → `editBanned` |
| Admin rights detection | "Am I admin?" boolean | Inspect actual `chatAdminRights` ban flag AND target hierarchy (can't ban admins/creator) |
| `FLOOD_WAIT_X` | Catch-and-fail / surface as error | Parse seconds, wait + jitter, resume same op |
| `PEER_FLOOD` / account limitation | Retry like a normal flood | Hard-stop, no retry, inform user, point to @SpamBot, persist resumable state |
| Session storage (Telethon/GramJS/Pyrogram) | Default plaintext SQLite/string on disk | Encrypt with OS-keystore key; full logout terminates server-side authorization too |
| Tauri/Electron + MTProto runtime sidecar | Assuming `externalBin` notarizes like the main app | Prototype sign+notarize *with* the sidecar early; build universal (Intel+ARM) binaries |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-group membership scan unthrottled | Long hangs, `FLOOD_WAIT` during "scanning" | Serialize through governor; use cheap `getParticipant`; progress UI | ~tens to low-hundreds of groups |
| Parallel participant/removal calls for speed | `MultiError` of `FLOOD_WAIT`s; escalating waits | Strictly sequential; no concurrency on Telegram calls | Almost immediately under bulk load |
| Re-resolving target inside the per-group loop | Redundant `ResolveUsername` calls, flood, wrong-person drift | Resolve once early, cache user ID + access_hash | Scales with group count |
| Fixed-interval pacing at high volume | Account spam-flagged despite "respecting limits" | Randomized jitter, per-N-action longer pauses, volume caps | Large jobs / new sessions |
| Giant single job, no chunking | Mid-job limitation leaves inconsistent state | Chunk big jobs; resumable state; per-group isolation | Very large group sets |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Plaintext / weakly-"encrypted" session at rest | Full account takeover from one file copy | Encrypt with OS-keystore-held key (Keychain / Credential Manager / DPAPI) |
| Session string in logs, telemetry, crash reports | Silent exfiltration of full account access | Scrub session from all diagnostics; never transmit off-device |
| Logout deletes local file only | Server-side authorization stays live; stale machine still has access | Logout terminates the Telegram authorization server-side AND wipes local blob + key |
| Embedded `api_id`/`api_hash` treated as secret | False sense of security; abuse of your credential by others | Treat as public; minimize per-account aggressiveness; kill-switch for revocation |
| No anti-wrong-target controls | Innocent user banned across many communities (recycled handle) | Resolve-to-ID-early, identity-drift re-check, load-bearing verification, dry-run |
| No audit trail | Can't prove or reverse what was done; abuse-deniability | Persist every action (target ID, group, ban/kick, time, result) |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Avatar verification that's decorative | User clicks past, wrong person removed | Show photo + name + @username + numeric ID + bio; hidden-avatar path demands *more* deliberate confirmation, shows ID on final review |
| Empty resolution coerced to "skip/proceed" | Silent wrong behavior; confusion | Distinct, honest messages: not-found vs not-a-contact (phone privacy) vs no-public-profile |
| Generic "can't act here" on greyed groups | User doesn't understand / distrusts tool | Specific reasons: no ban right / target is admin / basic-group limits |
| No dry-run before destructive blast | User can't see blast radius before committing | Dry-run produces exact would-affect list first |
| Ban as default | Irreversible over-removal (blocks rejoin) | Default to kick; make ban an explicit opt-in with consequences shown |
| Mid-job limitation shown as a crash/error | User left confused, communities half-cleaned | Clear "Telegram limited your account" message, @SpamBot pointer, resumable state, what-completed report |
| Long membership scan looks like a hang | User force-quits mid-scan | Progress indicator + ETA; communicate it's inherently slow by design |

---

## "Looks Done But Isn't" Checklist

- [ ] **FLOOD_WAIT handling:** Often missing — verify *every* call path (resolution, membership, removal) routes through the governor and resumes after waiting, not just the removal loop.
- [ ] **PEER_FLOOD / account limitation:** Often conflated with FLOOD_WAIT — verify it hard-stops, doesn't retry, informs the user, and leaves resumable state.
- [ ] **Recycled-username defense:** Often missing — verify the app acts on the cached numeric user ID end-to-end and re-checks identity if it ever re-resolves.
- [ ] **Empty/None resolution:** Often coerced silently — verify each empty case (no username, phone-not-contact, hidden profile) has distinct, honest UX.
- [ ] **Chat-type branching:** Often single-path — verify basic groups (`deleteChatUser`) and supergroups/channels (`editBanned`) both tested, plus "admin without ban right" and "can't ban an admin."
- [ ] **Per-group failure isolation:** Often missing — verify one group's failure records a result and continues; the run never aborts on first error.
- [ ] **Audit log:** Often deferred — verify every executed action is persisted (target ID, group, ban/kick, timestamp, result).
- [ ] **Dry-run:** Often skipped — verify the would-affect list can be produced without executing.
- [ ] **Session at rest:** Often weakly encrypted — verify the key lives in the OS keystore, not the binary; session never in logs.
- [ ] **Full logout:** Often local-only — verify it terminates the server-side authorization too.
- [ ] **Signing/notarization with sidecar:** Often passes without sidecar, fails with it — verify a signed+notarized build launches on clean macOS (Intel + ARM) and Windows VMs.
- [ ] **Resumability:** Often missing — verify a job interrupted by limitation/crash resumes from a known, inspectable point.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `api_id` revoked / flagged | HIGH | Generate new `api_id`; push via remote-config kill-switch or emergency app update; investigate which traffic pattern triggered it and dial back pacing |
| User account spam-limited (`PEER_FLOOD`) | MEDIUM-HIGH | Stop job; user appeals via @SpamBot (days, not guaranteed); meanwhile account can't act on new peers; resume job after lift with gentler pacing |
| Wrong person removed (recycled handle) | HIGH (banned) / MEDIUM (kicked) | Use audit log as worklist; per-group unban (ban) or re-invite (kick); ban is far costlier — reinforces "default to kick" |
| Job interrupted mid-run | LOW-MEDIUM (if resumable) | Resume from persisted progress; reconcile per-group report; re-verify target ID unchanged before resuming |
| Session leaked | HIGH | User terminates all sessions in Telegram settings, changes 2FA; app must support immediate full logout / session revocation |
| Hit `FLOOD_WAIT` repeatedly | LOW | Governor already waits + resumes; increase inter-op delay/jitter, reduce volume per run |
| Build blocked by Gatekeeper/SmartScreen | MEDIUM | Sign + notarize (macOS), EV-sign (Windows); re-test on clean VMs; for sidecar, fix universal-binary + notarization config |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Shared `api_id` flagged/revoked (1) | Auth / MTProto-integration (foundational) | Dedicated api_id used; remote-config kill-switch exists; no example creds |
| Membership-scan flood (2) | Group enumeration / membership | `getParticipant` (not full list), serialized, cached access_hash, progress UI |
| No rate-limit governor (3) | MTProto-integration (core infra, before features) | All calls funnel through one queue; FLOOD_WAIT parsed+resumed; no concurrency |
| Account spam flag mid-job (4) | Execution engine + UX | PEER_FLOOD hard-stop, jitter, volume caps, resumable state, user warning |
| Wrong person / recycled username (5) | Target resolution + verification UX | Acts on user ID end-to-end; identity-drift re-check; honest empty-result UX; load-bearing avatar verification |
| Permission model wrong (6) | Rights evaluation + execution | Chat-type branching; ban-right flag checked; accurate grey-out; runtime CHAT_ADMIN_REQUIRED tolerated |
| Destructive blast unsafe (7) | Execution engine + review UX | Dry-run, audit log, per-group isolation, kick default, confirm gate |
| Session takeover on leak (8) | Session-persistence/security | OS-keystore key; no plaintext/logs; full server-side logout |
| Distribution friction (9) | Stack selection (constraint) + packaging/release | Signed+notarized build (with sidecar) launches on clean macOS Intel+ARM and Windows |
| ToS / abuse exposure (10) | Scope/product-def + UX | Stays within delegated rights; single-purpose; audit log; responsible-use notice |

---

## Sources

**Official Telegram / library documentation (HIGH confidence):**
- [Telegram Spam FAQ](https://telegram.org/faq_spam) — what limits accounts, what limited accounts can do, @SpamBot appeals
- [Telegram core API — Admin, banned, default rights](https://core.telegram.org/api/rights) — `deleteChatUser` (basic groups) vs `channels.editBanned` (supergroups/channels), chatAdminRights/chatBannedRights
- [channels.getParticipants](https://core.telegram.org/method/channels.getParticipants) — participant fetch mechanics
- [channels.editBanned](https://core.telegram.org/method/channels.editBanned) — ban/kick/restrict on supergroups & channels
- [Creating your Telegram Application](https://core.telegram.org/api/obtaining_api_id) — obtaining api_id, published-credential restrictions
- [Telethon — Entities (access_hash caching)](https://docs.telethon.dev/en/stable/concepts/entities.html)
- [Telethon — Session Files](https://docs.telethon.dev/en/stable/concepts/sessions.html)
- [ResolvePhoneRequest — Telethon](https://tl.telethon.dev/methods/contacts/resolve_phone.html) — phone must be a contact
- [Avoiding FLOOD_WAITs — MadelineProto](https://docs.madelineproto.xyz/docs/FLOOD_WAIT.html)

**Library issue trackers / real-world evidence (MEDIUM-HIGH confidence):**
- [TDLib issue #534 — API ID Causing Bans](https://github.com/tdlib/td/issues/534) — shared/example api_id → accounts deleted within seconds
- [Telethon issue #1569 — session reuse with different api_id](https://github.com/LonamiWebs/Telethon/issues/1569) — session file = account access without re-auth
- [Telethon issue #3708 — FloodWaitError on GetParticipants](https://github.com/LonamiWebs/Telethon/issues/3708) — aggressive parallel participant fetch floods
- [tdesktop issue #7395 — reassigned number/recycled identity](https://github.com/telegramdesktop/tdesktop/issues/7395) — recycling → wrong-account exposure

**Distribution / signing (HIGH confidence on mechanics):**
- [macOS Code Signing — Tauri v2](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri issue #11992 — codesigning/notarization with ExternalBin sidecar](https://github.com/tauri-apps/tauri/issues/11992) — sidecar breaks notarization
- [Code Signing — Electron](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Code Signing and Notarization for Cross-Platform Desktop Apps — KeyQ](https://www.keyq.cloud/blog/code-signing-and-notarization-for-macos-desktop-apps/)

**Rate-limit / account-safety community sources (MEDIUM-LOW confidence — exact numbers are indicative, not authoritative; Telegram does not publish limits):**
- [grammY — Scaling Up IV: Flood Limits](https://grammy.dev/advanced/flood)
- [Avoiding flood limits — python-telegram-bot wiki](https://github.com/python-telegram-bot/python-telegram-bot/wiki/Avoiding-flood-limits)
- [Telegram limits and restrictions reference — bot-market.net](https://bot-market.net/help/telegram-limit/)
- [Telegram Account Banned: Recovery & Prevention — GoLogin](https://gologin.com/blog/telegram-account-banned/) — 2026 AI detection, timing-variance analysis, cascade bans

---
*Pitfalls research for: Telegram MTProto bulk member-removal desktop tool*
*Researched: 2026-06-10*
