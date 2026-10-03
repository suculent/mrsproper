# Phase 14: AddExecutor — Dispatch, Privacy Fallback & Audit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 14-addexecutor-dispatch-privacy-fallback-audit
**Areas discussed:** Privacy block & contact-add, Invite links & the DM, Per-group dispatch edges, Add log & job file

---

## Privacy block & contact-add

| Option | Description | Selected |
|--------|-------------|----------|
| Separate IPC at confirmation | Main-process contact service + IPC called by Phase 15 at confirmation; executor only gets a flag | ✓ |
| Executor does it lazily | Add contact on first privacy block, retry once | |
| Both | Confirm-time add plus one in-run retry | |

**User's choice:** Separate IPC at confirmation. **Notes:** Implies no in-run retry of a blocked invite.

| Option | Description | Selected |
|--------|-------------|----------|
| Still privacy-blocked, flag noted | Outcome unchanged, `premiumWouldAllow` detail for a Phase 15 hint | ✓ |
| Distinct failed code | New code, skip the link | |
| Ignore the flag | Drop it | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inline, right after the block | Link exported in the same per-group step and checkpointed with the outcome | ✓ |
| Batched at run end | Generate all links just before the DM | |

| Option | Description | Selected |
|--------|-------------|----------|
| Non-blocking, report and continue | `{ok:false, code}` back to the UI, run may start | ✓ |
| Blocking | Confirmation fails until contact add succeeds | |

---

## Invite links & the DM

| Option | Description | Selected |
|--------|-------------|----------|
| App + target name | e.g. "MrProper · Jan Novák" | |
| App name only | "MrProper" | |
| No title | Plain link | |
| Neutral prefix + target name (user) | "Admin • Jan Novák", no app name leaked | ✓ |

**User's choice:** "Admin • Jan Novák" (clarified between "Admin" and "Link" prefixes; user picked Admin).

| Option | Description | Selected |
|--------|-------------|----------|
| Only on complete | Stopped/hard-stopped keep links, DM sent when a resumed run completes; stale links regenerated | ✓ |
| Also on Stop | Partial DM on Stop, second DM after resume | |

| Option | Description | Selected |
|--------|-------------|----------|
| Attempt once, then report refused | One governed SendMessage, `dmStatus=refused`, links retained | ✓ |
| Skip the attempt when flagged | Rely on `premium_required_for_pm` | |

| Option | Description | Selected |
|--------|-------------|----------|
| `{name}` / `{links}`, one stored template | Single-brace, one template in electron-store prefs, default by app language | ✓ |
| `{{name}}` / `{{links}}`, per-language templates | Two templates switched by language | |

---

## Per-group dispatch edges

| Option | Description | Selected |
|--------|-------------|----------|
| 100 | Telegram maximum / client default | |
| 0 | No history | |
| 50 | Middle ground | |
| 1000 then 100 (user) | Try 1000, fall back to 100 if rejected | ✓ |

**Notes:** Claude flagged that Telegram caps at 100 and appears to clamp silently; recorded as "send 1000, retry once with 100 on explicit rejection".

| Option | Description | Selected |
|--------|-------------|----------|
| Leave it lifted | No re-ban write when the invite fails after an unban | ✓ |
| Re-ban to restore prior state | Extra EditBanned | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-check, mark all failed, no calls | Deleted/bot target → `failed(ADD_TARGET_INVALID)` for every group | ✓ |
| Attempt and let the server answer | Map per-group server errors | |

| Option | Description | Selected |
|--------|-------------|----------|
| Link fallback | Mid-run channel cap → `privacy-blocked` with `reason=channel-full` and a link | ✓ |
| Failed code, no link | Follow ADD-09 literally | |

**Notes:** Resolves the PROJECT.md vs ADD-09 wording conflict in favour of PROJECT.md.

---

## Add log & job file

| Option | Description | Selected |
|--------|-------------|----------|
| JSON Lines, add-log.jsonl | Structured, render on export | |
| Plain text, add-log.txt | Human-readable, export is a copy | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Once per run at terminal state | Complete/stopped/hard-stopped; resumed run updates the entry | ✓ |
| Only on complete | | |
| Per group as it happens | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Successes + links only | ADD-14 literal | ✓ |
| Full per-group outcome list | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Forever, append-only | | ✓ |
| Cap at the last 500 entries | | |
| Prune entries older than 1 year | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Append a follow-up block | Resumed run appends a block referencing the job id | ✓ |
| Rewrite the block in place | Read-modify-write | |

---

## Claude's Discretion

Module/constant names, Zod schemas, exact RPC-error → `ADD_*` mapping, jitter, already-contact detection, revocation of regenerated links, default template wording (en/cs), log block layout, template snapshot in the job file.

## Deferred Ideas

Re-ban on failed invite (rejected); JSONL log (rejected); partial DM on Stop (rejected); Phase 15 follow-ons: contact-add failure notice, Premium hint, add-job Resume/Discard prompt; align ADD-09 wording with D-12.
