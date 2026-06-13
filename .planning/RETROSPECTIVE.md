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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 9 | 57 | Established dependency-spine phase ordering + wave-based execution |

### Cumulative Quality

| Milestone | Tests | Type Gate | Zero-Dep Additions |
|-----------|-------|-----------|--------------------|
| v1.0 | 278 passing | tsc --build | safeStorage (no keytar), electron-store prefs |

### Top Lessons (Verified Across Milestones)

1. Verify the actual gate command does what you think (the `tsc --noEmit` no-op).
2. Typed process boundaries (no pre-formatted strings across IPC) keep presentation concerns where they belong.
