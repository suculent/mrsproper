# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-06-13
**Phases:** 9 (1–8 + inserted 4.1) | **Plans:** 57 | **Tasks:** 80

### What Was Built
- Portable Electron + GramJS desktop app (macOS + Windows) with phone/code/2FA login and OS-keystore-encrypted session persistence
- Single serialized rate-limit governor — every Telegram call funnels through it with FLOOD_WAIT sleep+resume and PEER_FLOOD hard-stop
- Target resolution by username/phone/name-search with avatar+identity confirmation gate (accessHash never crosses the IPC boundary)
- Membership-verified, rights-aware group checklist; throttled per-group-type kick/ban executor with live progress and crash-resume
- Full safety-gated wizard (dry-run → review with numeric ID → single explicit confirm)
- Code-signed + notarized installers (0.9.1 RC)
- v1.5 localization: i18next with full Czech translation (formal vykání, 3-form plurals) and a Day/Night theme toggle

### What Worked
- The dependency-spine ordering (auth → governor → resolution → enumeration → executor → UI → packaging) meant later phases always built on verified foundations
- Copy-module hygiene maintained from Phase 4 onward made the Phase 8 i18n extraction largely mechanical
- Wave-based sequential execution with per-plan atomic commits gave clean rollback points
- Adversarial plan-checker caught the LOC-03 "Finished/more" hardcoded-English-in-formatter gap before execution

### What Was Inefficient
- `tsc --noEmit` was discovered to be a no-op for this project's tsconfig mid-Phase-5; several earlier verify blocks gave false confidence until `tsc --build` was adopted
- Phase 8 UAT surfaced TargetCard as entirely unmigrated despite the migration plans — a full-component sweep at plan time would have caught it; required a fix cycle (LastSeenDTO architecture correction)
- `.env` must be sourced for the AUTH-03 config tests; full-suite runs flapped between 255/257/278 depending on env state until standardized

### Patterns Established
- Structured IPC DTOs over pre-formatted strings: main emits typed discriminated unions (e.g. `LastSeenDTO`), renderer owns all locale-aware presentation — carry forward to any future display-string IPC
- electron-store + Zod-enum IPC channel template (severityChannels → languageChannels/themeChannels) for non-secret prefs; safeStorage reserved for the session
- Pre-mount async init in `main.tsx` (fetch prefs → init i18n → apply theme → render) eliminates flash-of-wrong-state

### Key Lessons
1. Always use `tsc --build` as the type gate in this project; `tsc --noEmit` checks nothing here.
2. When a phase "migrates" components, audit every component in scope at plan time — partial migration passes can leave whole surfaces untouched and only surface in UAT.
3. Keep user-facing strings out of the main process from day one; retrofitting renderer-only i18n is cheap when main emits typed values, expensive when it emits English.

### Cost Observations
- Model mix: predominantly Sonnet for executors/researchers/reviewers; orchestration on Opus
- Notable: the adversarial code-review + fix + re-review loop (Phase 8) resolved 2 Critical + 6 Warning findings in one automated cycle, reaching `clean` status

---

## Milestone: v1.7 — Add Mode

**Shipped:** 2026-10-25
**Phases:** 5 (13–17, of which 16 and 17 were audit gap closures) | **Plans:** 41 | **Tasks:** 60

### What Was Built
- Main-computed `canAdd` / `canUnban` / `addGreyReason` per dialog (broadcast channels included) and a distinct `banned` scan status
- TagExecutor collapsed to a single-client loop after GramJS moved to TL layer 229 (layer-224 isolation code deleted, TAG-07)
- `AddExecutor`: `InviteToChannel` / `AddChatUser` dispatch via the governor, unban-first, deleted/bot pre-flight, privacy-block fallback with single-use 5-day invite links and one templated end-of-run DM, PEER_FLOOD hard-stop, continuation resume over `add-job.json`, append-only `add-log.txt`
- Renderer Add mode: Remove/Tag/Add switch, inverted checklist via one `isActionableForMode` rule, add-to-contacts checkbox, DM template editor with byte-identical preview, review/run/report bands with retry and Copy-link, add-log export, en/cs strings
- Relaunch-resume made visible and safe: job view with `JobTargetCard`, target identity locked while a job exists, explicit `ADD_RESUME`, persisted `bannedDialogIds`, retry DMs and log blocks, in-session "Resume adding"
- Quick 261025-dnf closed audit warnings W1/W2/W4 (language IPC ordering, forced-mode pre-check sync, logout wipes the add job)

### What Worked
- TDD-first executor: 54 failing `addExecutor.test.ts` cases written before `AddExecutor.ts` existed (14-07), then turned green in two plans (14-08: 46/54, 14-09: 54/54). The D-01..D-20 contract was settled before any code was written.
- Cloning shipped structures (tagAuditStore → addAuditStore, TagResumeJobDialog → AddResumeJobDialog, tagChannels' 4-layer gate chain → addChannels) kept the new surface consistent and reviewable.
- The milestone audit worked as a real gate. Two audit runs each found critical relaunch-path gaps (ADD-08 resume continuity, then F1 invisible relaunched run and F2 wrong-identity add) after every phase VERIFICATION had passed. Without them, Add Mode would have shipped with a destructive identity bug.
- The Phase 17 code-review fix loop converged in 3 iterations: 13 findings (2 critical, 6 warning) → 6 (0 critical) → clean with 2 info. Each round's fixes were small enough to re-review cheaply.
- A subagent-heavy workflow (researcher, planner, plan-checker, executors, reviewer/fixer, verifier, UI auditor, integration checker) kept the orchestrator's context small across 41 plans and 304 commits.

### What Was Inefficient
- The milestone needed two gap-closure phases (16, 17) on top of the three planned ones. Both gaps sat on the stop → relaunch → Resume path, which the phase tests never drove end-to-end.
- Unit tests called `AddExecutor` and the stores directly and bypassed IPC. So the relaunch path, where `ADD_START` / `ADD_RESUME` handlers, resolver state and job-file reconstruction interact, went unexercised until Phase 17-08 added an integration suite that drives the real registered `ipcMain` handlers.
- Phase 15 shipped with a Remove-only grey flag (`dialog.canAct`) on Add rows, which UAT caught. A dedicated plan (15-14) was needed to make the grey visuals follow the same predicate as the checkbox.
- The SDK `audit-open` scanner still reports quick-task false positives (missing status frontmatter on old quick SUMMARYs). Only the legacy `gsd-tools.cjs audit-open` reported 0 open items. The SDK scanner needs fixing.
- Nyquist validation was left as drafts for the gap-closure phases (16, 17: partial). 5 server-behaviour checks still need a live account.

### Patterns Established
- **Resume intent is owned by main.** The renderer never sends a "resume" flag. Main derives it from the on-disk job and exposes an explicit `ADD_RESUME` channel.
- **Job identity lock:** while an executor job is non-idle, target resolve/confirm/search are no-ops in main, and retry/resume act only on the job's persisted target (`checkResumeIdentity` plus a defense-in-depth re-check after awaits).
- **Single actionability predicate per mode** (`isActionableForMode`) drives the checkbox, grey visuals, pre-check and review list. Never derive "greyed" from a separate flag.
- **Shared zero-dependency modules in `src/shared/`** for anything that must render identically in both processes (`dmTemplate.ts`).
- **Integration tests through captured `ipcMain` handlers** for any cross-process lifecycle (relaunch, logout wipe), not just unit tests on the executor.
- **Iterated review files** (`*-REVIEW.iterN.md` / `*-REVIEW-FIX.iterN.md`) keep the fix-loop history auditable.

### Key Lessons
1. A passing phase VERIFICATION does not prove a cross-process lifecycle works. Any flow that crosses relaunch or logout needs a test that goes through the real IPC registration, and the milestone audit should trace it explicitly.
2. Treat "the job knows who it is for" as a safety invariant from the first plan of any resumable destructive or additive executor. Retrofitting the identity lock in Phase 17 cost a whole phase.
3. Re-run the milestone audit after every gap-closure phase. The second re-run found new critical gaps that the first closure had exposed.
4. When a new mode reuses an existing row component, audit every visual branch for mode-specific flags. Checking only the checkbox is not enough.

### Cost Observations
- Model mix: Opus orchestration; Sonnet-class subagents for research, planning, execution, review/fix, verification and audits
- Sessions: multiple, spanning 2026-10-03 to 2026-10-25 (bulk of Phases 13–16 in 2 days; Phase 17 after the 10-24 re-audit)
- Notable: 41 plans in 5 phases with 304 commits. Most spend went to the two audit-driven gap closures (13 of 41 plans), which is the main argument for driving relaunch flows through IPC earlier.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 9 | 57 | Established dependency-spine phase ordering + wave-based execution |
| v1.6 | 4 | 13 | Phase 0 empirical spike before roadmap; parallel executor class instead of refactor (no retrospective written) |
| v1.7 | 5 | 41 | TDD-first executor contract; milestone audit used as a hard gate (2 re-runs → 2 gap-closure phases); 3-iteration review-fix loop |

### Cumulative Quality

| Milestone | Tests | Type Gate | Zero-Dep Additions |
|-----------|-------|-----------|--------------------|
| v1.0 | 278 passing | tsc --build | safeStorage (no keytar), electron-store prefs |
| v1.7 | 764 passing (2 env-dependent config.test.ts failures) | tsc --build (both projects) | none: Add Mode reused governor, Zod, electron-store; vendored layer-229 TL schema |

### Top Lessons (Verified Across Milestones)

1. Verify the actual gate command does what you think (the `tsc --noEmit` no-op).
2. Typed process boundaries (no pre-formatted strings across IPC) keep presentation concerns where they belong.
3. Test cross-process lifecycles (relaunch, resume, logout) through the real IPC handlers; unit tests that bypass IPC passed while the relaunch path was broken (v1.7).
4. Run the milestone audit and re-run it after each gap closure; it found what phase verification missed (v1.7).
