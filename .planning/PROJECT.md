# MrProper

## What This Is

MrProper is a portable desktop app for macOS and Windows that lets a Telegram group administrator remove a specific person from *all* of their communities at once. The admin logs in with their own Telegram account (via the MTProto User API), identifies a target by username or phone number, visually confirms it's the right person via their avatar and identity details, and then bulk-removes (kicks or bans) them across every group where the admin has rights — with safe, throttled execution that respects Telegram's rate limits.

It exists for the recurring "serial bad actor" problem: a spammer, troll, or banned person who keeps surfacing across multiple communities you run, where removing them one group at a time is slow and error-prone.

## Core Value

A group admin can confidently remove the right person from every relevant community in one safe, verified pass — without tripping Telegram's rate limits or hitting the wrong account.

## Current State

**Shipped:** v1.6 Member Tag Action (2026-06-20) — a third action (Tag) alongside Kick/Ban that
sets a Telegram member tag across selected groups via `messages.editChatParticipantRank` over an
isolated layer-224 connection, reusing the throttled, resumable, audited execution pipeline.
Confirmed working end-to-end against a real account. Built on v1.0 (core removal app) + v1.5
(localization/theme).

**Key v1.6 outcome:** the layer-224 tag write required a two-phase isolation fix — a concurrent
224 connection upgrades the shared session to layer 224, corrupting the main layer-198 client's
response parsing. Resolved by separating layer-198 reads (admin pre-checks) from layer-224 writes
in time and restoring the main client to 198 afterward.

**2026-10-03 fix (quick 261003-jni):** Telegram's late-September schema rollout broke membership
scan/name search at TL layer 198 (participant constructors renumbered to carry `rank`). The whole
GramJS package now runs at TL layer 229 via a vendored TDLib schema (`vendor/telegram-api.tl`,
regenerated into `node_modules/telegram` by a postinstall script). The layer-224 isolation hack is
no longer needed; `tagClient` is layer-neutral, `TagExecutor` cleanup is queued for v1.7.

**2026-10-03 Phase 13 complete (v1.7 foundation):** every enumerated dialog now carries `canAdd` +
`addGreyReason` computed in `GroupEnumerator` (creator / `inviteUsers` right / default permissions,
broadcast channels included, 200-member channel cap); `MembershipScanner` distinguishes `banned`
from `not-member`; `TagExecutor` is a single-client loop (layer-224 isolation code and
`tagClient.ts`/`tagApi.ts` deleted). Main-process/data layer only, no renderer changes yet.

**2026-10-03 Phase 14 complete (v1.7 engine):** `AddExecutor` adds the target to every selected
dialog via `channels.InviteToChannel` / `messages.AddChatUser` through the shared governor, lifts
bans first, falls back to single-use 5-day invite links on privacy blocks, and sends one templated
DM at run end (refusal reported as a distinct status, links retained). Per-group outcomes checkpoint
to `add-job.json` with continuation-based resume (same job id across stop/resume); a plain-text
`add-log.txt` records each run. Contact-add service, EN/CS DM template store and the full `ADD_*`
IPC surface are wired in main and exposed on the preload bridge. Code review surfaced seven
control-flow issues (duplicate outcomes on resume, DM failure wedging the run, PEER_FLOOD swallowed
during link export); all fixed with regression tests. 501 tests green. Renderer UI is Phase 15.

## Current Milestone: v1.7 Add Mode

**Goal:** Let the admin add the resolved target to every selected group they are not yet in, with
the same safety, throttling and reporting as removal.

**Target features:**
- Remove / Tag / Add mode switch on the groups pane; in Add mode the membership checklist inverts
  to show groups the target is NOT in (kick/ban stay inside Remove mode on the review screen)
- "Add to contacts" / "Přidat do kontaktů" checkbox, pre-checked, shown with the target card while
  Add mode is active; on target confirmation the target is added to the admin's contacts if not
  already there (unchecked = skip; the privacy fallback then goes straight to links)
- Direct add via `channels.InviteToChannel` (supergroups AND broadcast channels when the admin holds
  the invite right) / `messages.AddChatUser` (basic groups); unban first for banned targets
- Privacy-block fallback: unique single-use invite links per group expiring in 5 days, sent to the
  target in ONE direct message at run end; message previewed on the review screen before confirm
- Add log: one record per added user (timestamp + the invite links generated for them), stored
  alongside the job files, exportable as plain text from the app
- New throttled, resumable AddExecutor with its own job file and per-group outcomes
  (done | already-member | privacy-blocked+links | failed(code) | skipped)
- Cleanup: remove the dead layer-224 two-phase / restoreMainClientLayer logic in TagExecutor

**Design reference:** `docs/superpowers/specs/2026-06-20-member-tag-action-design.md`.

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

- ✓ Search for a target by First + Last Name across the admin's groups (group-scoped participant search, candidate disambiguation) — Phase 4.1
- ✓ List only the groups where the target is actually a member (membership verified before display) — Phase 4
- ✓ Present groups as a checklist pre-checked for removal (default = remove everywhere; uncheck to keep them in selected groups) — Phase 4
- ✓ Show groups where the admin lacks kick rights as greyed-out with a reason (visible but not actionable) — Phase 4
- ✓ Per-run choice between ban (kick + block rejoin) and kick (removable, can rejoin) — Phase 6 (Review screen segmented control, default Ban, persisted)
- ✓ Final review screen showing target identity + the exact list of affected groups, requiring one explicit confirmation before execution — Phase 6 (SAF-01/02/03 human-verified)
- ✓ Execute removals as a throttled, sequential job with automatic FLOOD_WAIT back-off so Telegram rate limits are never hit — Phase 5
- ✓ Show live progress during execution and a per-group success/failure report afterward — Phase 6 (live wizard run stage + structured report band; known defects in resume-after-restart path tracked in 06-HUMAN-UAT.md / 06-REVIEW.md)
- ✓ Code-signed, notarized portable builds verified launching on clean macOS and Windows machines — Phase 7 (0.9.1 RC; 3/4 machines passed, Big Sur smoke test deferred — 07-HUMAN-UAT.md)
- ✓ Language switcher (English/Česky) with persisted preference, all UI strings externalized via i18next, complete Czech translation (formal vykání, 3-form plurals), plus Day/Night theme toggle — Phase 8 (v1.5; UAT approved after one TargetCard fix cycle; re-confirmation items in 08-HUMAN-UAT.md)
- ✓ Choose a "Tag" action (alongside Kick/Ban) and enter one tag string applied to all selected groups — v1.6 (TAG-01)
- ✓ Set the member tag across selected supergroups/channels via `editChatParticipantRank` over an isolated layer-224 connection, leaving the main layer-198 client undisturbed — v1.6 (TAG-02; live-confirmed end-to-end after the two-phase layer-isolation fix)
- ✓ Tag writes throttled through the shared governor (FLOOD_WAIT/PEER_FLOOD honored) and resumable via a `tag-job` audit file — v1.6 (TAG-03)
- ✓ Skip & flag already-admin targets (no title clobbering) and basic groups; report per-group outcomes — v1.6 (TAG-04)
- ✓ Explicit confirmation gate (tag + identity + group list) before any write; target identity sourced from the main process only — v1.6 (TAG-05)
- ✓ Live progress and per-group success/failure report, reusing the removal flow UI — v1.6 (TAG-06)

### Active

<!-- Current scope. Building toward these. -->

(v1.7 Add Mode — see REQUIREMENTS.md and Current Milestone above. Remaining: Phases 14–15,
AddExecutor + Add-mode renderer.)

Validated in Phase 13: Add Rights & Scan Semantics (Foundation) — 2026-10-03:
- ✓ Each enumerated dialog carries a main-process `canAdd` flag (creator, `inviteUsers` admin right, or default permissions allowing invites); the renderer never derives rights itself — ADD-04
- ✓ Broadcast channels report `canAdd: true` when the admin holds the invite right while staying non-actionable for removal — ADD-03 (data layer; Add-mode UI lands in Phase 15)
- ✓ Per-dialog data distinguishes already-member / no-invite-right / channel-full / banned-without-unban-right so Add mode can grey rows with a cause-specific reason — ADD-02 (data layer; checklist inversion lands in Phase 15)
- ✓ TagExecutor runs on the single shared client with no two-phase layer isolation, no `restoreMainClientLayer`, no stale layer-224 comments; tag behaviour and tests unchanged — TAG-07

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
*Last updated: 2026-10-03 — Phase 14 (AddExecutor engine) complete; v1.7 Add Mode continues with Phase 15 (renderer UI).*
