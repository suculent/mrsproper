# Phase 16: Close gap: ADD-08 resume path and ADD-02 empty state - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-04
**Phase:** 16-close-gap-add-08-resume-path-and-add-02-empty-state
**Areas discussed:** Resume contract, Add-mode empty state, Banned no unban right, Tech-debt bundle

---

## Resume contract

| Option | Description | Selected |
|--------|-------------|----------|
| Renderer sends full set | Dialog/store pass job.dialogIds; executor gate untouched | ✓ |
| Executor accepts a subset | Loosen the continuation gate | |
| Main computes the id list | ADD_START ignores payload ids when a job exists | |

**User's choice:** Renderer sends full set

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, skipped are resumable | Resume reprocesses groups skipped by a user Stop | ✓ |
| No, only hard-stops resume | Stop is final | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rebuild from job file | Executor builds the peer from targetId/targetAccessHash/targetName when resolver is empty | ✓ |
| Require re-confirming the target | Resume disabled until target re-resolved | |

| Option | Description | Selected |
|--------|-------------|----------|
| Resume waits for groups | Button disabled with "Loading your groups…" until enumeration loaded | ✓ |
| Main queues the start | Pending-start state in main | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, keep D-13/D-18 | One DM at completion, CONTINUATION log block; add cross-process test | ✓ |
| Revisit | | |

**Notes:** User declined the follow-up about restoring the target card for a prompt-resumed run; captured as Claude's discretion / deferred.

---

## Add-mode empty state

| Option | Description | Selected |
|--------|-------------|----------|
| Only when nothing is actionable | Empty state only when no Add-actionable row; Remove branch gated | ✓ |
| Never in Add mode | Always render the list | |

| Option | Description | Selected |
|--------|-------------|----------|
| Cause-aware, two lines | "Nothing to add" + cause-specific body | ✓ |
| One neutral line | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Remove wording for Tag | No Tag change | |
| Give Tag its own body line | Small copy addition | ✓ |

---

## Banned, no unban right

| Option | Description | Selected |
|--------|-------------|----------|
| Keep D-02: grey the row | Needs a main-computed ban-right flag | ✓ |
| Drop it: let the run report it | Delete enum member and copy | |

| Option | Description | Selected |
|--------|-------------|----------|
| New DTO boolean from main | canUnban independent of canAct | ✓ |
| Reuse canAct and accept channel miss | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Grey reason line only | Banned note reserved for actionable rows | ✓ |
| Both lines | | |

---

## Tech-debt bundle

| Option | Description | Selected |
|--------|-------------|----------|
| Main reads the live language | getDmText resolves stored language at render time | ✓ |
| Renderer persists the default | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Title with id fallback | AddExecutor passes title into log entries | ✓ |
| Leave ids only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fix both | Change target disabled during any run; unselected rows show no run status | ✓ |
| Fix Change target only | | |
| Defer both | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, intended; do the housekeeping | Promote 14-VALIDATION, fix 13-02 polarity note | ✓ |
| Not intended; revert Remove to not-member | | |

## Claude's Discretion

- DTO field name for the unban-right flag; where the grey reason is assigned.
- Location and wording of the new empty-state keys (en/cs).
- Mechanism for the "Loading your groups…" state in the resume dialog.
- Shape of the cross-process resume test.
- Whether a prompt-resumed run restores the target card.

## Deferred Ideas

- Target card for prompt-resumed runs beyond progress/report rendering.
- Remove/Tag queued-row rendering for unselected rows.
- Remove/Tag relaunch resume without re-resolving the target.
- wizardStage ADD_* events and DmTextProvider type orphans.
