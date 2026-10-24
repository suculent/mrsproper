# Phase 17: Close gap: ADD-08/ADD-12 — relaunch-resume UI visibility and target-identity lock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 17-close-gap-add-08-add-12-relaunch-resume-ui-visibility-and-ta
**Areas discussed:** Relaunch run view, Identity lock policy, Leaving the resumed job, Fold non-critical findings

---

## Relaunch run view

| Option | Description | Selected |
|--------|-------------|----------|
| Band + job card | Band plus read-only target card from the job file and the job's rows | ✓ |
| Band only | Audit minimum: Add band whenever add is non-idle, add.targetName labels | |
| Full re-resolve | Re-fetch the target's profile from the job's id/access hash | |

| Option | Description | Selected |
|--------|-------------|----------|
| Force Add, lock switch | Switch to Add on Resume; Remove/Tag disabled until the job is left | ✓ |
| Force Add, switch free | Switch to Add on Resume; admin can switch away | |

| Option | Description | Selected |
|--------|-------------|----------|
| Only the job's groups | Job dialogIds with statuses, no checkboxes | ✓ |
| All groups, job rows marked | Full list, only job rows carry statuses | |

---

## Identity lock policy

| Option | Description | Selected |
|--------|-------------|----------|
| Blocked in UI and main | Target input disabled; main rejects TARGET_RESOLVE/CONFIRM while add non-idle | ✓ |
| Allowed, aborts job A | New resolve aborts and clears the add run | |

| Option | Description | Selected |
|--------|-------------|----------|
| Job target only | retryGroup uses _resolvedTarget; refuse on resolver mismatch | ✓ |
| Resolver, checked vs job | Prefer resolver but require id equality | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reject, keep job | ADD_START error state, job untouched, existing resumeFailed message | ✓ |
| Reject + explain | Same plus a message naming the job's target | |

---

## Leaving the resumed job

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, job target | Retry available on failed rows, using the job target | ✓ |
| No retry after relaunch | Read-only report after relaunch | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same as today | "Add someone else" resets and navigates to target | ✓ |
| Add 'Done' button | Extra button that returns to browse | |

---

## Fold non-critical findings

| Option | Description | Selected |
|--------|-------------|----------|
| F3 unban-first on relaunch | Persist per-group banned flag in add-job.json | ✓ |
| F4 in-session Resume after Stop | Resume on the stopped band | ✓ |
| F5 retry privacy link | Log it and DM it | ✓ |
| F6 + tech-debt items | First-launch DM language; small debt items | ✓ |

**F5 follow-up:** Log + DM that one link (selected) vs log only, show link.
**F4 follow-up:** Button on stopped band (selected) vs re-open resume dialog.

---

## Claude's Discretion

- Job card rendering, main-side block return shape, banned-flag field name, en/cs copy, F6 language hand-off mechanism.

## Deferred Ideas

None.
