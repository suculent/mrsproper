# MrProper

## What This Is

MrProper is a portable desktop app for macOS and Windows that lets a Telegram group administrator remove a specific person from *all* of their communities at once. The admin logs in with their own Telegram account (via the MTProto User API), identifies a target by username or phone number, visually confirms it's the right person via their avatar and identity details, and then bulk-removes (kicks or bans) them across every group where the admin has rights — with safe, throttled execution that respects Telegram's rate limits.

It exists for the recurring "serial bad actor" problem: a spammer, troll, or banned person who keeps surfacing across multiple communities you run, where removing them one group at a time is slow and error-prone.

## Core Value

A group admin can confidently remove the right person from every relevant community in one safe, verified pass — without tripping Telegram's rate limits or hitting the wrong account.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Cross-platform desktop app, portable/easy to run on macOS and Windows — Phase 1 (macOS launch confirmed; Windows build configured, launch pending on a Windows host)
- ✓ Log in to a Telegram user account via MTProto (phone + code + 2FA password) — Phase 1 (no-2FA confirmed; real-2FA path implemented, confirmation pending a 2FA account)
- ✓ App ships with its own api_id/api_hash (no per-user registration required) — Phase 1
- ✓ Persist the session encrypted on disk so re-login isn't needed every launch; provide a logout that clears it — Phase 1 (confirmed)
- ✓ All Telegram calls route through one serialized, rate-limited governor: FLOOD_WAIT honored by sleep+jitter+resume with countdown events, PEER_FLOOD hard-stops with no retry, single typed error classifier — Phase 2 (17/17 verified; removal-job consumer lands in Phase 5)
- ✓ Resolve a target person by username OR phone number — Phase 3 (4/4 verified incl. human-verified real-API smoke test; gap closure via code-review fixes + plan 03-06)
- ✓ Show the target's avatar plus identity details (name, username, ID, bio) for visual verification, with a graceful "no photo" fallback — Phase 3 (TargetCard with confirm gate; app renamed Mrs. Proper with custom icons en route)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Search for a target by First + Last Name across the admin's groups (group-scoped participant search, candidate disambiguation) — Phase 4.1
- [ ] List only the groups where the target is actually a member (membership verified before display)
- [ ] Present groups as a checklist pre-checked for removal (default = remove everywhere; uncheck to keep them in selected groups)
- [ ] Show groups where the admin lacks kick rights as greyed-out with a reason (visible but not actionable)
- [ ] Per-run choice between ban (kick + block rejoin) and kick (removable, can rejoin)
- [ ] Final review screen showing target identity + the exact list of affected groups, requiring one explicit confirmation before execution
- [ ] Execute removals as a throttled, sequential job with automatic FLOOD_WAIT back-off so Telegram rate limits are never hit
- [ ] Show live progress during execution and a per-group success/failure report afterward

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Telegram Bot API — bots cannot enumerate the admin's groups or act with the admin's authority; this requires the User (MTProto) API
- Mobile app (iOS/Android) — desktop-first; the workflow is an admin task, not on-the-go
- Managing/creating groups, editing settings, or other moderation beyond member removal — single-purpose tool
- Bulk messaging, scraping, or any growth/automation features — this is a cleanup tool, not a marketing tool
- Acting on channels the admin doesn't administer or removing people the admin has no rights over — the tool only does what the logged-in account is already permitted to do

## Context

- **API surface:** Telegram MTProto User API (not Bot API). Requires api_id/api_hash from my.telegram.org; the app embeds shared credentials. Auth flow is phone → login code → optional 2FA password.
- **Telegram realities that shape the product:**
  - Phone-number resolution only works if the target is in the logged-in user's contacts (Telegram privacy). Username can change or be removed. Both identifiers can fail — the app must handle non-resolution gracefully.
  - Avatars can be hidden via privacy settings or simply absent — visual verification needs a text-based fallback.
  - Removing members requires admin rights with the ban/kick permission in each specific group; the admin belongs to many groups but only administers some.
  - Group types differ (basic groups vs supergroups/megagroups vs channels); removal mechanics vary.
- **Rate limiting is a first-class concern:** bulk operations across many groups reliably trigger FLOOD_WAIT. Execution must be paced and back-off-aware, not parallel-blast.
- **Trust/safety:** the app holds a real Telegram session and performs destructive, hard-to-undo actions. Verification gates and encrypted session storage are core, not optional polish.

## Constraints

- **Tech stack**: Cross-platform desktop, "easily portable" — must produce simple-to-run macOS and Windows builds (framework TBD in research). Why: target users are admins, not engineers; install friction kills adoption.
- **API**: Must use Telegram MTProto User API. Why: only the user API can enumerate the admin's groups and act with their authority.
- **Performance/Rate limits**: All Telegram calls (membership checks, removals) must be throttled with FLOOD_WAIT handling. Why: hitting rate limits gets the account temporarily restricted and breaks the core task.
- **Security**: Session credentials stored encrypted at rest; shipped api_id/api_hash. Why: a leaked session is full account access.
- **Safety**: Destructive actions require explicit final confirmation against a reviewed identity + group list. Why: removing the wrong person from communities is hard to undo and damages trust.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use Telegram MTProto User API (not Bot API) | Only the user API can list the admin's groups and act with admin authority | — Pending |
| Ship app-wide api_id/api_hash in the binary | Zero setup for users; they only log in with their phone | — Pending |
| Persist encrypted session, logout clears it | Avoid re-auth every launch while protecting account access | — Pending |
| Support target lookup by username OR phone | Admins may only have one identifier; maximize match odds | — Pending |
| Verify membership before listing groups | Show only actionable groups; avoid clutter and wasted calls | — Pending |
| Greyed-out groups where admin lacks kick rights | Transparency without false promises of action | — Pending |
| Per-run ban vs kick toggle | Different situations need different severity | — Pending |
| Throttled sequential execution with FLOOD_WAIT back-off | Telegram rate limits will otherwise restrict the account | — Pending |
| Final review + confirm gate before execution | Destructive cross-community action must be deliberate | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-11 after Phase 3 (Target Resolution & Verification) completion*
