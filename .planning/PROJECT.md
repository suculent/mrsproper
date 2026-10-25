# MrProper

## What This Is

MrProper is a portable desktop app for macOS and Windows that lets a Telegram group administrator remove a specific person from *all* of their communities at once. The admin logs in with their own Telegram account (via the MTProto User API), identifies a target by username or phone number, visually confirms it's the right person via their avatar and identity details, and then bulk-removes (kicks or bans) them across every group where the admin has rights — with safe, throttled execution that respects Telegram's rate limits.

The same verified, throttled, resumable pipeline also drives two further actions: **Tag** (set one member tag across selected groups, v1.6) and **Add** (put the verified person into every selected group they are not yet in, with unban-first and a privacy-block fallback of expiring invite links sent in one templated DM, v1.7).

It exists for the recurring "serial bad actor" problem: a spammer, troll, or banned person who keeps surfacing across multiple communities you run, where removing them one group at a time is slow and error-prone.

## Core Value

A group admin can confidently remove the right person from every relevant community in one safe, verified pass — without tripping Telegram's rate limits or hitting the wrong account.

## Current State

**Shipped:** v1.7 Add Mode (2026-10-25). It adds a fourth action, Add, next to Kick/Ban and Tag.
Admins switch the groups pane between Remove, Tag and Add. In Add mode the checklist inverts:
groups the target is not in are actionable and pre-checked, and every other row is greyed with
a cause-specific reason (already member, no invite right, channel full, banned without unban right).
`AddExecutor` invites through `channels.InviteToChannel` / `messages.AddChatUser` via the shared
governor and lifts bans first. When privacy blocks a direct add, it falls back to unique single-use
5-day invite links sent in one templated DM at run end, with an editable en/cs template previewed
byte-for-byte on the review screen. Outcomes checkpoint to `add-job.json` with continuation resume
(same job id across stop/relaunch). The target identity is locked while a job exists, and
`add-log.txt` records every run and can be exported. Also shipped: an add-to-contacts checkbox, and
TagExecutor collapsed to a single-client loop now that GramJS runs at TL layer 229 (quick 261003-jni).

**Codebase:** ~36k LOC TypeScript (Electron + GramJS + React). 764 Vitest tests pass; the only
failure is the env-dependent `config.test.ts`. GramJS runs at TL layer 229 from a vendored TDLib
schema regenerated at postinstall.

**Known debt at close:** see `milestones/v1.7-MILESTONE-AUDIT.md` and the MILESTONES.md v1.7
entry. W3 (stage indicator after in-session Resume), W5 (no main-side block on concurrent
Remove/Tag + Add), WR-03 (hard-stop during the end-of-run DM), UI-REVIEW polish, Phase 16/17
Nyquist drafts, and Remove/Tag job files that survive logout.

**History:** v1.0 core removal app (2026-06-13) · v1.5 localization/theme · v1.6 Member Tag Action
(2026-06-20) · v1.7 Add Mode (2026-10-25).

## Current Milestone

None in progress. v1.7 Add Mode shipped on 2026-10-25. The next milestone is TBD: run
`/gsd-new-milestone` to define it.

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

- ✓ Remove / Tag / Add mode switch on the groups pane; mode decides the review-screen action and switching resets the selection — v1.7 (ADD-01)
- ✓ Add-mode inverted checklist: not-member groups actionable and pre-checked, others greyed with a cause-specific reason — v1.7 (ADD-02)
- ✓ Broadcast channels actionable in Add mode when the admin holds the invite right (Remove unchanged) — v1.7 (ADD-03)
- ✓ Main-process `canAdd` flag per dialog (creator / `inviteUsers` / open default permissions); renderer never derives rights — v1.7 (ADD-04)
- ✓ Pre-checked "Add to contacts" / "Přidat do kontaktů" checkbox on the target card in Add mode, non-blocking — v1.7 (ADD-05)
- ✓ Throttled sequential add run via `InviteToChannel` / `AddChatUser` through the governor (FLOOD_WAIT countdown, PEER_FLOOD hard-stop, ~3 s pacing) — v1.7 (ADD-06)
- ✓ Banned targets are unbanned first, including after a relaunch resume — v1.7 (ADD-07)
- ✓ Per-group checkpoint to `add-job.json`; relaunch offers Resume/Discard and stopped or hard-stopped runs continue the same job, with the job's target identity locked — v1.7 (ADD-08)
- ✓ Typed per-group outcomes: done / already-member / privacy-blocked / failed(code) / skipped — v1.7 (ADD-09)
- ✓ Unique single-use invite link expiring after 5 days for each privacy-blocked group — v1.7 (ADD-10)
- ✓ All links sent in ONE end-of-run DM; a refused DM is reported with the links kept for the admin — v1.7 (ADD-11)
- ✓ Review screen shows the consequence line, exact group list and exact DM text before one explicit confirmation; identity from main only — v1.7 (ADD-12)
- ✓ Live per-group add progress, results report and per-group retry — v1.7 (ADD-13)
- ✓ Owner-only `add-log.txt` (timestamp, user, groups, links) exportable as plain text via a save dialog — v1.7 (ADD-14)
- ✓ All new strings in English and Czech (formal vykání, 3-form plurals) — v1.7 (ADD-15)
- ✓ Editable, persisted DM template with en/cs defaults and `{name}`/`{links}` placeholders; the preview matches what is sent — v1.7 (ADD-16)
- ✓ TagExecutor runs on the single shared client with no layer-224 isolation code — v1.7 (TAG-07)

### Active

<!-- Current scope. Building toward these. -->

No milestone is active. Candidates for the next milestone, carried from v1.7 Future Requirements and the audit:
- [ ] TAG-08: read back and display the target's existing tag per group (readable at layer 229)
- [ ] TAG-09: clear-tag action
- [ ] ADD-17: bulk Add mode (several targets in one run)
- [ ] v1.7 audit debt: W3, W5, WR-03, UI-REVIEW polish, Remove/Tag job wipe on logout

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Telegram Bot API — bots cannot enumerate the admin's groups or act with the admin's authority; this requires the User (MTProto) API
- Mobile app (iOS/Android) — desktop-first; the workflow is an admin task, not on-the-go
- Managing/creating groups, editing settings, or other moderation beyond member membership (remove / tag / add) — single-purpose tool
- Bulk messaging, scraping, or any growth/automation features — this is a membership tool, not a marketing tool (the single invite-link DM in Add mode is the only message the app ever sends)
- Removing the target from contacts after an add run — the contact stays; silent contact churn is confusing and costs extra API calls (v1.7)
- Parallel ("blast") invites — reliably triggers PEER_FLOOD; sequential only (v1.7)
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
| Use Telegram MTProto User API (not Bot API) | Only the user API can list the admin's groups and act with admin authority | ✓ Good |
| Ship app-wide api_id/api_hash in the binary | Zero setup for users; they only log in with their phone | ✓ Good |
| Persist encrypted session, logout clears it | Avoid re-auth every launch while protecting account access | ✓ Good |
| Support target lookup by username OR phone | Admins may only have one identifier; maximize match odds | ✓ Good |
| Verify membership before listing groups | Show only actionable groups; avoid clutter and wasted calls | ✓ Good |
| Greyed-out groups where admin lacks kick rights | Transparency without false promises of action | ✓ Good |
| Per-run ban vs kick toggle | Different situations need different severity | ✓ Good |
| Throttled sequential execution with FLOOD_WAIT back-off | Telegram rate limits will otherwise restrict the account | ✓ Good |
| Final review + confirm gate before execution | Destructive cross-community action must be deliberate | ✓ Good |
| Tag via `editChatParticipantRank` on an isolated layer-224 client (v1.6) | GramJS lacked the request at layer 198 | ⚠️ Revisit → superseded: whole package moved to TL layer 229 (quick 261003-jni); isolation deleted in v1.7 (TAG-07) |
| Rights (`canAdd`, `canUnban`, `addGreyReason`) computed in main, never in the renderer (v1.7) | Renderer must not be trusted to decide what is actionable | ✓ Good |
| One mode-aware actionability rule, `isActionableForMode`, for Remove/Tag/Add (v1.7) | Single source of truth for checkbox, grey visuals and review list | ✓ Good (a Remove-only grey flag caused a UAT gap until unified) |
| Privacy-blocked adds fall back to single-use 5-day invite links sent in ONE end-of-run DM (v1.7) | Respects target privacy, limits spam exposure of the admin account | ✓ Good |
| Shared zero-dependency `renderTemplate` for preview and send (v1.7) | Review-screen DM text must be byte-identical to what is sent | ✓ Good |
| Continuation-based resume: same jobId, skipped outcomes reprocessed, target rebuilt from `add-job.json` (v1.7) | Stop/relaunch must continue the same job, not start a new one | ✓ Good |
| Explicit main-owned `ADD_RESUME` channel; resume intent never accepted from the renderer (v1.7) | Prevents a renderer from resuming job A against a different person | ✓ Good |
| D-07 narrow rule: a mismatched Resume is rejected and the job kept; `ADD_START` with a different reviewed person starts fresh (v1.7) | Locks the job's identity without trapping the admin | ✓ Good |
| Add job locked to its target: resolve/confirm/name-search are no-ops while add is non-idle; retry uses the job target only (v1.7) | Wrong-identity add was the critical re-audit finding (F2) | ✓ Good |
| Logout wipes the add job, AddExecutor state and resolver (v1.7, quick 261025-dnf) | Another account must never be offered the previous account's job | ✓ Good (Remove/Tag job files still survive logout; follow-up) |
| Contact-add is non-blocking and never undone (v1.7) | A failed contact add must never block the run | ✓ Good |

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
*Last updated: 2026-10-25 after v1.7 milestone*
