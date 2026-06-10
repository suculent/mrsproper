# Feature Research

**Domain:** Telegram moderation / bulk member management desktop utility (MTProto User API)
**Researched:** 2026-06-10
**Confidence:** MEDIUM-HIGH (Telegram API mechanics HIGH from core.telegram.org + Telethon/GramJS docs; competitor feature landscape MEDIUM — this is a thin, mostly-scripts market with few polished products)

## Domain Note

This is a sparse product market. There is no established "bulk-remove-one-person-from-all-my-groups" commercial app to benchmark against. What exists falls into two buckets:

1. **Admin management bots** (Bot API) — RkManager, OmniGest, Combot, Rose, Shieldy. These moderate *within* a single group (ban, mute, anti-spam, captcha). They **cannot** enumerate an admin's groups or act across them — Bot API has no equivalent of `messages.getCommonChats` or cross-chat authority. Not direct competitors, but they set user expectations for moderation UX.
2. **Userbot scripts** (MTProto — Telethon/Pyrogram/GramJS) — GitHub one-off scripts like "remove-all-members". These are CLI, unsafe (no verification, no throttling discipline), and remove *everyone*, not a *targeted* person. They are the closest functional analog and define the anti-feature boundary.

Therefore "table stakes" here is defined less by competitors and more by **what makes a destructive cross-community tool safe and trustworthy**. The Telegram API itself dictates most hard constraints.

## Feature Landscape

### Table Stakes (Users Expect These / Tool Is Unusable or Unsafe Without)

#### Auth & Session

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Phone + login code + 2FA password login (MTProto) | Only auth path for User API; the tool literally cannot start without it | MEDIUM | `auth.sendCode` → `auth.signIn` → `auth.checkPassword` (SRP). Handle `SESSION_PASSWORD_NEEDED`, wrong-code, wrong-password, `PHONE_CODE_EXPIRED`. |
| Encrypted session persistence on disk | Re-entering phone+code every launch is intolerable; session = full account access so plaintext is unacceptable | MEDIUM | Store the auth key encrypted at rest (OS keychain for the encryption key, or passphrase-derived). A leaked session string is total account compromise. |
| Logout that revokes + clears the session | Users need to safely hand off / abandon a machine; also the only "undo" for trust | LOW | Call `auth.logOut` (server-side revoke) AND delete local session file. Local delete alone leaves an active session on Telegram's side. |
| Graceful login error handling | Codes expire, 2FA is common, FLOOD_WAIT can hit at login | LOW-MEDIUM | Distinct messages for expired code, bad password, flood, banned number. |

#### Target Resolution

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Resolve target by @username | Most common identifier admins have | LOW | `contacts.resolveUsername`. Handle `USERNAME_NOT_OCCUPIED` / not found. Usernames change — treat as ephemeral. |
| Resolve target by phone number | Admins sometimes only have a number | MEDIUM | Phone resolution **only works if the target is already in the logged-in user's contacts** (Telegram privacy). Otherwise must `contacts.importContact` first, which can fail or return no match if the target hides their number. Must explain this clearly, not just fail silently. |
| Graceful non-resolution handling | Both identifiers legitimately fail often | LOW | Clear "couldn't find this person — try the other identifier / add them as a contact" guidance. This is a primary UX path, not an edge case. |

#### Visual Verification

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Avatar display | The whole "right person" safety promise rests on this | LOW-MEDIUM | Download profile photo via `photos.getUserPhotos` / `users.getFullUser`. Cache. |
| Text fallback when no/hidden avatar | Avatars are routinely hidden by privacy or absent | LOW | Show initials/placeholder. This is the *common* case, not rare — privacy-conscious bad actors hide photos. |
| Identity panel: name, @username, numeric user ID, bio | One field alone is spoofable; the bundle is what enables confident confirmation | LOW | `users.getFullUser`. Numeric ID is the only stable identifier — surface it prominently. |

#### Group Listing & Selection

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| List groups the target is actually in | Core workflow; showing all admin groups would be noise and wrong | MEDIUM | **Recommended primary path: `messages.getCommonChats(target)`** — returns chats+channels in common between you and the target in one paginated call. Far cheaper than enumerating all dialogs + per-group membership checks. User-only method (perfect — this is a userbot). |
| Per-group membership verification | "Common chats" needs confirming the target is a *current* member, and admin's rights must be checked per group | MEDIUM | Cross-reference with admin's own admin status. For supergroups, `channels.getParticipant` confirms current membership; handle `USER_NOT_PARTICIPANT`. |
| Pre-checked checkboxes (default = remove everywhere) | Matches the core value: "remove from all" is the default intent | LOW | Uncheck-to-keep model. |
| Grey out groups where admin lacks kick rights, with reason | Honesty — can't promise actions the API will reject | MEDIUM | Check `admin_rights.ban_users` per chat. Non-actionable but visible. Prevents confusing per-group `CHAT_ADMIN_REQUIRED` failures at execution. |
| Select-all / select-none | Standard list-management affordance | LOW | Trivial, expected. |
| Group-type awareness (basic group vs supergroup/megagroup vs channel) | Removal mechanics differ by type; UI must not promise the wrong thing | MEDIUM | Basic groups: `messages.deleteChatUser`. Supergroups/channels: `channels.editBanned`. Channels (broadcast) rarely have the target as a removable "member." Detect type and branch. |

#### Removal Semantics

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Kick (removable, can rejoin) vs Ban (kick + block rejoin) | Different severity for different situations; named in PROJECT scope | MEDIUM | Supergroup **kick** = `channels.editBanned` with `view_messages=false` then immediately unban (lift restrictions) so they can rejoin; **ban** = `channels.editBanned` with `view_messages=true` and leave it. Basic groups: `messages.deleteChatUser` (no true "ban"; rejoin depends on invite link). This asymmetry must be reflected honestly per group type. |
| Per-run kick-vs-ban toggle | One choice applied to the whole run keeps the UX simple and the intent clear | LOW | Single global toggle, not per-group, for v1. |

#### Safety Gates

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Final review screen (target identity + exact affected-group list) before execution | Destructive, cross-community, hard to undo — the central safety promise | LOW | Re-show avatar + ID + the precise checked groups + chosen action (kick/ban). One screen, no ambiguity. |
| Explicit single confirmation to execute | Prevent accidental fire | LOW | Deliberate friction by design. |

#### Execution

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Throttled sequential execution | Parallel blast reliably triggers FLOOD_WAIT and risks account restriction | MEDIUM | One group at a time with a baseline inter-call delay. Sequential is correct here, not slow-by-accident. |
| FLOOD_WAIT-aware automatic back-off | The single most important reliability constraint; named explicitly in PROJECT | MEDIUM | Catch `FLOOD_WAIT_X`, sleep `X` seconds (+jitter/margin), resume. Surface "waiting N s" in UI so it doesn't look frozen. Most libraries (Telethon/GramJS) have a built-in flood threshold; rely on it but also surface it. |
| Live progress display | Long runs across many groups must not look hung | LOW-MEDIUM | Per-group status: pending / in-progress / waiting-on-flood / done / failed. |
| Per-group success/failure report | Users must know exactly what happened where | LOW | Outcome list with reason on failure (`CHAT_ADMIN_REQUIRED`, `USER_NOT_PARTICIPANT`, `USER_ADMIN_INVALID` for removing another admin, etc.). |

### Differentiators (Competitive Advantage / Quality-of-Life)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dry-run / preview mode | Run the full flow, hit every API path *except* the destructive call — shows exactly what *would* happen | MEDIUM | Huge trust win for a destructive tool. Distinguishes this from reckless scripts. |
| Common-groups count on the verification screen | "This person is in 7 of your communities" reinforces correct identification and motivates the action | LOW | Falls out of `getCommonChats` for free. |
| Retry failed groups (post-run) | Partial failures are normal (transient flood, momentary perms); re-running only failures is faster and safer than redoing everything | MEDIUM | Requires per-group result state from execution. |
| Resumable / interruptible jobs | If the app closes or network drops mid-run, don't restart from zero or double-act | HIGH | Persist run state (which groups done). Idempotency matters: re-kicking an already-removed user is harmless but re-banning is fine; design actions to be safely repeatable. |
| Audit log of actions (what / where / when / outcome) | A real Telegram session doing destructive things deserves a record; supports accountability and "what did I do last week" | LOW-MEDIUM | Local append-only log per run: target ID, action, per-group result, timestamps. |
| Export audit log (CSV/JSON) | Share/record-keep moderation actions across a team | LOW | Trivial once the log exists. |
| Also delete the target's messages on removal | "Clean up the spam too," not just the person | MEDIUM | Supergroups: `channels.deleteParticipantHistory` removes all of one user's messages. Per-run optional toggle. Higher destructiveness — must be opt-in and shown in review. |
| Revoke the target's active invite links on ban | A banned spammer who created invite links can keep funneling people | MEDIUM-HIGH | `messages.getExportedChatInvites(admin_id=target)` + revoke. Niche; only matters if target was an admin/link-creator. Defer unless requested. |
| QR-code login | Faster, avoids typing the code; familiar from Telegram Desktop | MEDIUM | `auth.exportLoginToken` → render QR → poll/`updateLoginToken` → `auth.importLoginToken`. Nice but phone+code already covers the requirement; secondary. |
| Multi-account / account switcher | Admins who run communities from more than one Telegram account | MEDIUM-HIGH | Multiple encrypted sessions + selector. Real but not v1 — adds session-management surface and risk. |
| Per-group rate-pacing config | Power users who know their flood tolerance | LOW | Sensible default first; expose later only if needed. |

### Anti-Features (Deliberately NOT Built — Abuse-Prevention Boundary)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Member scraping / participant export | "Let me grab everyone's username/ID" | Turns a cleanup tool into a harvesting tool; violates privacy norms and Telegram ToS; classic userbot abuse pattern | Only ever touch the *one* resolved target and the admin's *own* common groups. Never enumerate other members. |
| Bulk messaging / DM blast / broadcast | "While I'm here, message everyone" | This is spam tooling; the exact behavior the product fights | Out of scope, hard line. Single-purpose tool. |
| Remove *all* members / mass-kick everyone | The GitHub "remove-all-members" script pattern | Indiscriminate; the product's entire value is *targeted, verified* removal of one person | The tool acts on one verified individual only, never "everyone." |
| Growth / auto-join / auto-invite automation | "Add members too" | Automation-abuse class; gets accounts banned; off-mission | Not built. |
| Acting on groups the admin doesn't administer | "Remove them from that group too" | The tool only does what the logged-in account is already permitted to do; anything else is impossible *and* a misuse invitation | Grey-out non-admin groups; never attempt. |
| Per-group different actions in one run | "Kick here, ban there, delete-messages only there" | Multiplies the safety-review surface; makes the confirmation screen ambiguous; raises wrong-action risk | One action per run. Run again for a different action. |
| Headless / scheduled / unattended runs | "Automate it nightly" | Removes the human verification gate that is the core safety mechanism; invites accidents and abuse | Every run is interactive and confirmed by a human. |
| Bot API support / token login | "Use a bot instead, it's easier/safer" | Bot API cannot enumerate the admin's groups or get common chats — it's functionally incapable of the core task | MTProto User API only (already a PROJECT decision). |

## Feature Dependencies

```
Phone+code+2FA login (MTProto auth)
    └──requires──> App-embedded api_id/api_hash
    └──enables──> Encrypted session persistence
                      └──enables──> Logout (revoke + clear)
                      └──enables──> Multi-account (v2)

Target resolution (username / phone)
    └──requires──> Authenticated session
    └──phone path requires──> contacts.importContact (privacy gate)
    └──enables──> Visual verification (avatar + identity)
                      └──enables──> Common-groups count
                      └──requires──> users.getFullUser

Group listing
    └──primary path──> messages.getCommonChats(target)   [user-only method]
    └──requires──> Per-group admin-rights check (ban_users)
    └──requires──> Group-type detection (basic / supergroup / channel)
    └──enables──> Pre-checked selection + grey-out + select-all/none

Removal semantics (kick vs ban)
    └──requires──> Group-type detection (different API per type)
    └──basic group──> messages.deleteChatUser
    └──supergroup/channel──> channels.editBanned (+ unban for kick)
    └──optional add-on──> channels.deleteParticipantHistory (delete messages)

Safety gate (review + confirm)
    └──requires──> Resolved target + finalized group selection + chosen action
    └──enhanced by──> Dry-run mode

Execution engine (throttled + FLOOD_WAIT back-off)
    └──requires──> Confirmed run plan
    └──produces──> Per-group result state
                      └──enables──> Retry-failed
                      └──enables──> Audit log ──enables──> Export
                      └──enables──> Resumability
```

### Dependency Notes

- **Group listing depends on `getCommonChats`:** This single user-only method is the efficient backbone — it returns exactly "groups you and the target share," which *is* the candidate set. Avoids enumerating all dialogs and per-group membership probing. Membership is then confirmed/filtered by admin-rights check.
- **Phone resolution depends on the contacts privacy gate:** A `contacts.importContact` step (or pre-existing contact) is mandatory before phone lookup can ever succeed. This is a Telegram privacy rule, not a choice — it must be a first-class UX branch.
- **Retry, audit, and resumability all depend on per-group result state:** The execution engine must emit structured per-group outcomes; once it does, all three differentiators become cheap. Design the result model early.
- **Kick vs ban depends on group-type detection:** Kick on a supergroup is "ban then unban"; on a basic group there's no true ban. The action semantics are not uniform — type detection must precede action.
- **Dry-run enhances the safety gate:** Both serve verification; dry-run is the stronger version and should reuse the same review screen.

## MVP Definition

### Launch With (v1) — the safe, complete targeted-removal pass

- [ ] Phone + code + 2FA login — only way in
- [ ] Encrypted session persistence + revoking logout — usability + security floor
- [ ] Resolve target by username AND phone (with contacts-privacy handling) — core entry
- [ ] Visual verification: avatar + text fallback + name/@username/ID/bio — the safety promise
- [ ] Group list via `getCommonChats`, membership-verified, admin-rights aware (grey-out) — actionable scope
- [ ] Pre-checked selection + select-all/none — the "remove everywhere" default
- [ ] Per-run kick vs ban toggle, group-type-correct — the action
- [ ] Final review + explicit confirm — the gate
- [ ] Throttled sequential execution with FLOOD_WAIT back-off — reliability
- [ ] Live progress + per-group success/failure report — visibility

### Add After Validation (v1.x)

- [ ] Dry-run / preview mode — trigger: any user hesitation about destructiveness; strongest trust feature, promote early
- [ ] Common-groups count on verification screen — trigger: near-free with getCommonChats
- [ ] Retry-failed-groups — trigger: real runs show partial failures (they will)
- [ ] Audit log + CSV/JSON export — trigger: first "what did I remove last week" question
- [ ] Optional "delete target's messages" toggle — trigger: spam-cleanup requests

### Future Consideration (v2+)

- [ ] QR-code login — defer: phone+code already satisfies the requirement
- [ ] Multi-account switcher — defer: adds session-management risk surface
- [ ] Resumable/interruptible jobs — defer: HIGH complexity; only if long runs get interrupted in practice
- [ ] Revoke target's invite links on ban — defer: niche, only for admin-level targets
- [ ] Per-group rate-pacing config — defer: default should suffice

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Phone+code+2FA login | HIGH | MEDIUM | P1 |
| Encrypted session + logout | HIGH | MEDIUM | P1 |
| Target resolution (username/phone + privacy handling) | HIGH | MEDIUM | P1 |
| Visual verification (avatar + fallback + identity) | HIGH | LOW-MEDIUM | P1 |
| Group list via getCommonChats + membership/rights | HIGH | MEDIUM | P1 |
| Pre-checked selection + grey-out + select-all/none | HIGH | LOW-MEDIUM | P1 |
| Kick vs ban toggle (type-correct) | HIGH | MEDIUM | P1 |
| Review + confirm gate | HIGH | LOW | P1 |
| Throttled exec + FLOOD_WAIT back-off | HIGH | MEDIUM | P1 |
| Live progress + per-group report | HIGH | LOW-MEDIUM | P1 |
| Dry-run / preview | HIGH | MEDIUM | P2 |
| Common-groups count | MEDIUM | LOW | P2 |
| Retry-failed | MEDIUM | MEDIUM | P2 |
| Audit log + export | MEDIUM | LOW-MEDIUM | P2 |
| Delete target's messages | MEDIUM | MEDIUM | P2 |
| QR login | LOW-MEDIUM | MEDIUM | P3 |
| Multi-account | LOW-MEDIUM | MEDIUM-HIGH | P3 |
| Resumable jobs | MEDIUM | HIGH | P3 |
| Revoke invite links | LOW | MEDIUM-HIGH | P3 |

## Competitor Feature Analysis

| Feature | Admin bots (RkManager/Rose/Combot) | Userbot scripts (remove-all-members) | Our Approach |
|---------|-----------------------------------|--------------------------------------|--------------|
| Cross-group authority | None (Bot API, single-group) | Yes (MTProto) but indiscriminate | Yes, via MTProto, but *targeted + verified* |
| Target identification | N/A (act on whoever triggers) | None / manual ID | Username/phone resolve + visual verify |
| Group discovery | N/A | Manual / all dialogs | `getCommonChats` — only shared groups |
| Safety gate | Reactive rules, no confirm | None — fire immediately | Review screen + explicit confirm + dry-run |
| Rate-limit handling | Server-side via Bot API | Usually naive → gets flooded | Sequential + FLOOD_WAIT back-off |
| Kick vs ban | Yes, per-command | Often kick-only | Per-run toggle, type-correct semantics |
| Reporting | Logs in chat | stdout / none | Per-group report + exportable audit log |
| Scope discipline | Single group | "remove everyone" | One verified person, admin-permitted groups only |

## Telegram-Specific Constraints Reflected in Features

- **Phone privacy:** phone lookup requires the target be a contact (`contacts.importContact` gate) — a primary UX branch, confidence HIGH (core.telegram.org / Telethon entities docs).
- **Admin-rights requirement:** removal needs `admin_rights.ban_users` per group; non-admin groups are greyed out, confidence HIGH (core.telegram.org/api/rights).
- **FLOOD_WAIT:** bulk cross-group ops reliably trigger it; mandatory sequential + back-off, confidence HIGH (Telethon/GramJS flood handling docs).
- **Group-type asymmetry:** basic groups (`messages.deleteChatUser`) vs supergroups/channels (`channels.editBanned`); kick = ban-then-unban on supergroups; confidence HIGH (core.telegram.org/api/channel, GramJS channels.editBanned).
- **getCommonChats is user-only:** ideal for this userbot, impossible for a bot — reinforces the MTProto-only decision, confidence HIGH.
- **Avatars often hidden:** privacy settings make text fallback the common path, not an edge case, confidence HIGH.

## Sources

- Telegram API — Channels/supergroups/basic groups: https://core.telegram.org/api/channel (HIGH)
- Telegram API — Admin/banned/default rights: https://core.telegram.org/api/rights (HIGH)
- Telegram API — messages.getCommonChats: https://core.telegram.org/method/messages.getCommonChats (HIGH, user-only confirmed)
- Telegram API — auth.importLoginToken (QR login): https://core.telegram.org/method/auth.importLoginToken (HIGH)
- GramJS — channels.EditBanned: https://gram.js.org/tl/channels/EditBanned (HIGH)
- Telethon — TelegramClient / FloodWaitError handling: https://docs.telethon.dev/en/stable/modules/client.html (HIGH)
- Telethon — entities / phone-as-contact resolution: https://docs.telethon.dev/en/stable/concepts/entities.html (HIGH)
- GramJS — StringSession vs StoreSession (session persistence): https://github.com/gram-js/gramjs (MEDIUM)
- RkManager (admin bot reference): https://github.com/Rohk25/RkManager (MEDIUM)
- remove-all-members (userbot script — anti-pattern reference): https://github.com/samadii/remove-all-members (MEDIUM)
- Telegram admin guide 2026 (expectations baseline): https://omnigestbot.com/blog/telegram-group-admin-guide (LOW-MEDIUM)

---
*Feature research for: Telegram bulk targeted-member-removal desktop tool (MrProper)*
*Researched: 2026-06-10*
