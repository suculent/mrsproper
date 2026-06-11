# Phase 2: Rate-Limit Governor & Error Classification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 2-Rate-Limit Governor & Error Classification
**Areas discussed:** (none — user delegated all decisions to Claude)

---

## Gray areas presented

The following four gray areas were surfaced for discussion:

| Area | Question presented | Selected |
|------|--------------------|----------|
| Classifier unification & scope | One unified skip/fail/retry classifier (refactor auth onto it) or two side-by-side? Enumerate full removal-error table now or rate-limit/transport + extensible framework? | delegated |
| Governor coverage (D-18) | Route ALL calls (incl. refactoring existing auth) through the governor now, or stand it up for future bulk ops while auth keeps its inline FLOOD_WAIT handler? | delegated |
| FLOOD_WAIT sleep policy | Silent-absorb short waits vs. always emit countdown? Jitter amount? Upper ceiling above which it gives up rather than blocking? | delegated |
| PEER_FLOOD & retry policy | What "hard-stop" does to the surrounding job + what's surfaced; retry count/backoff for transient errors. | delegated |

**User's choice:** "Don't want to discuss this. Do your best." — all four areas
delegated to Claude in a single response.

**Notes:** Phase is load-bearing infrastructure with strong upstream constraints
(success criteria + Phase 1's D-18 seam), so the decision space was well-bounded.
Claude recorded recommended defaults in CONTEXT.md (D-01 … D-14), each chosen to
satisfy the EXE-01/02/03 success criteria, reuse Phase 1's injectable
`FloodWaitController`/`TimingSource`, and avoid rewriting the completed, tested
Phase 1 auth path.

---

## Claude's Discretion

All decisions were Claude's discretion. Key calls:
- New general `classifyRpcError` with `wait|retry|skip|fail|hard-stop` dispositions;
  leave the auth-specific `classifyTelegramError` untouched (D-01/D-02).
- Governor is the chokepoint for post-auth operational calls; interactive login
  stays on its inline handler; cheap post-session calls (getMe, downloadProfilePhoto,
  LogOut) routed through for literal "single queue" compliance (D-05/D-06/D-08).
- Always emit countdown; additive jitter `[0, clamp(0.1·s,1s,5s)]`; tiered absorption
  via GramJS `floodSleepThreshold ~60s`; 3600s ceiling surfaces instead of blocking
  (D-09…D-12).
- PEER_FLOOD = hard-stop, 0 retries, job-abort deferred to Phase 5; transient errors
  3 retries exp-backoff (D-13/D-14).
- Queue lib (p-queue vs hand-rolled), event shapes, enum member names left to planner.

## Deferred Ideas

- Removal-specific error codes + skip/fail mapping → Phase 5.
- Job-level abort / per-group checkpointing / crash recovery on PEER_FLOOD → Phase 5.
- On-screen countdown / live progress rendering → Phase 5/6.
- Proactive fixed inter-call pacing tuning → revisit if shared api_id shows flood pressure.
