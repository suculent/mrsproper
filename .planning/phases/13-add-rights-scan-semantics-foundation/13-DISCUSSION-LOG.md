# Phase 13: Add Rights & Scan Semantics (Foundation) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 13-add-rights-scan-semantics-foundation
**Areas discussed:** Ban-aware scan status, canAdd rule edges, Add-mode grey reasons, TagExecutor cleanup depth

---

## Ban-aware scan status

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct 'banned' status | Extend MembershipStatus; ChannelParticipantBanned → banned, Left → not-member; Remove mode unchanged | ✓ |
| Keep member / not-member | Executor discovers the ban when the invite fails | |
| Separate add-mode scan | Second scanner with its own state and IPC | |

| Option | Description | Selected |
|--------|-------------|----------|
| Require the ban right | Banned row actionable only if the admin can lift bans there; else greyed | ✓ |
| Always actionable, fail at run time | Try the unban regardless, report failure | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, channels only | Basic groups keep member/not-member; AddChatUser attempted directly | ✓ |
| Probe anyway | No-op unban on basic groups | |

**User's choice:** all recommended options.
**Notes:** none.

---

## canAdd rule edges

| Option | Description | Selected |
|--------|-------------|----------|
| Creator, invite right, or open permissions | creator ‖ adminRights.inviteUsers ‖ default permissions allow invites | ✓ |
| Creator or admin invite right only | Ignore open-permission groups | |

| Option | Description | Selected |
|--------|-------------|----------|
| Grey up front | participantsCount ≥ 200 → 'channel-full' | ✓ |
| Discover at run time | Keep actionable; refused add falls into link fallback | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same rule | One rule for all three group types | ✓ |
| Admin-only for basic groups | More conservative | |

**User's choice:** all recommended options.
**Notes:** none.

---

## Add-mode grey reasons

| Option | Description | Selected |
|--------|-------------|----------|
| Shown greyed below | Already-member rows visible and greyed, mirrors Remove mode | ✓ |
| Hidden | Only addable and rights-blocked rows shown | |

| Option | Description | Selected |
|--------|-------------|----------|
| Four specific reasons | already-member, no-invite-right, channel-full, banned-no-unban-right | ✓ |
| One generic reason | Single 'cannot add here' line | |

| Option | Description | Selected |
|--------|-------------|----------|
| Claude drafts, user reviews at UAT | Short factual en/cs lines in the existing style | ✓ |
| User provides the wording | Exact strings supplied before planning | |

**User's choice:** all recommended options.
**Notes:** none.

---

## TagExecutor cleanup depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full: one client, generated request | Delete tagClient.ts + tagApi.ts; main client + generated EditChatParticipantRank | ✓ |
| Minimal: strip two-phase only | Keep TagClient and vendored request | |
| Minimal now, full later | Defer the consolidation | |

| Option | Description | Selected |
|--------|-------------|----------|
| Remove the unparseable-response tolerance | Parse failures surface as UNKNOWN | ✓ |
| Keep as defence in depth | Tolerate newer constructors | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep writes unconditional | Behaviour identical to v1.6 | ✓ |
| Skip identical tags | Save a call per already-tagged group | |

**User's choice:** all recommended options.
**Notes:** none.

---

## Todos

| Option | Description | Selected |
|--------|-------------|----------|
| Neither | Leave both country-picker todos in the backlog | |
| Default country Czechia | Fold the +420 default into this phase | ✓ |
| Country rows clickable | Fold the clickable-rows fix into this phase | ✓ |

**User's choice:** fold both todos.

## Claude's Discretion

- DTO extension shape and type names for `canAdd` / add grey reason / `banned` status
- Whether to check the admin's own invite restriction during the scan
- Internal decomposition of `GroupEnumerator._classifyDialog`

## Deferred Ideas

- Skip tag write when the identical tag is already set
- Keep an unparseable-response tolerance as defence in depth
