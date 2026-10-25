---
phase: 16-close-gap-add-08-resume-path-and-add-02-empty-state
verified: 2026-10-04T22:45:00Z
status: passed
score: 9/9 must-haves verified (automated); manual UAT 3/3 passed
overrides_applied: 0
human_verification:
  - test: "Start an Add run, Stop it, quit and relaunch the app, choose Resume on the launch prompt"
    expected: "Run continues the same jobId from its checkpoint without re-resolving the target, report renders, one DM covers links from all segments, add log has a CONTINUATION block"
    why_human: "Needs a live Telegram session and a real relaunch (16-VALIDATION manual-only)"
  - test: "Pick a target already in every invitable group (and one in none of the admin's groups / not addable) in Add mode, en and cs"
    expected: "Inverted checklist shows when the target is in none of the groups; 'Nothing to add' + cause-aware body only when no row is actionable; wording reads correctly in en and cs (formal vykani)"
    why_human: "Wording review and visual rendering"
  - test: "Add-mode scan complete with at least one verify-failed row and no actionable rows"
    expected: "Checklist stays visible so failed rows can be retried (planner refinement: empty state requires failedCount === 0)"
    why_human: "Executor flagged this refinement for UAT"
---

# Phase 16 Verification Report

**Goal:** Close the two v1.7 audit blockers (ADD-08 resume path, ADD-02 empty state) plus the orphaned grey reason and small tech debt.
**Status:** passed. All automated checks pass; no gaps found. Manual UAT 3/3 passed (16-HUMAN-UAT.md).
**Re-verification:** No (initial).

## Automated Baseline
`npx tsc --build` clean; `npx vitest run` 52 files / 661 tests passing. Emitted .js/.d.ts cleaned; `git status` shows only the pre-existing untracked 16-REVIEW.md.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Resume sends the FULL job.dialogIds set (D-01) | VERIFIED | `src/shared/addResume.ts getResumeDialogIds` returns copy of `job.dialogIds`; used in `AddResumeJobDialog.tsx:52` and `addStore.ts:181`. Continuation gate `sameDialogIdSet` in AddExecutor unchanged. |
| 2 | Skipped outcomes are not "processed" and are reprocessed (D-02) | VERIFIED | `countProcessedOutcomes`/`isJobFinished` exclude `'skipped'`; used in dialog, `addStore` bootstrap (L66) and resume (L180). Executor L280-284 filters skipped from seeded outcomes. Stop-then-resume (empty remaining) blocker closed. |
| 3 | Relaunch resume rebuilds target from add-job.json in main only (D-03) | VERIFIED | `AddExecutor.execute` L211-237: when resolver null AND `resume===true` AND job non-complete AND same dialog set, builds `ResolvedAddUser` from `targetId/targetAccessHash/targetName`; else returns idle without initJob. Resume flag computed in main (`addChannels.ts:174`), not from renderer. |
| 4 | Same jobId continued, DM links from all segments, CONTINUATION block (D-05) | VERIFIED (code + cross-process test `addResume.integration.test.ts`); live flow is manual | Continuation branch L300-315 reuses jobId; test suite green. |
| 5 | Resume waits for enumeration; pendingJob not cleared on idle (D-04) | VERIFIED | `AddResumeJobDialog` has `groupsLoaded` + `getResumeDialogState`; `addStore.startAdd` returns false on `idle` and keeps pendingJob (L123-131). |
| 6 | Add mode never shows Remove "not in any" empty state; shows inverted checklist unless nothing actionable (D-06/D-07) | VERIFIED | `GroupsPane.renderEmptyState` L306-335: Add branch uses `getAddEmptyState`; "not in any" only in Remove/Tag else-branch. en/cs `nothingToAddHeading`, `allAlreadyMember`, `cannotAddBody` keys present. |
| 7 | Tag gets its own empty body (D-08) | VERIFIED | `notInAnyBodyTag` key used for tag in GroupsPane. |
| 8 | `banned-no-unban-right` assigned; banned rows without unban right greyed, not pre-checked (D-09..D-12) | VERIFIED | `canUnban` on `AdminDialogDTO` (groupTypes.ts:61), computed in GroupEnumerator (L194/226/255); `modeRules.isActionableForMode` requires `canUnban` for banned; `GroupRow.tsx:161` assigns reason; `addValidation.computeAddGroups` uses shared predicate (L41); note gated on `canUnban` (GroupRow:556). |
| 9 | Tech debt: add-log titles (D-14), DM default language at render time (D-13), Change-target disabled in any run (D-15), no queued status for rows outside job (D-16), docs housekeeping (D-17) | VERIFIED | AddExecutor L525-535 passes `title`; `getDmText` reads `getCachedLanguage()` per render and LANGUAGE_SET updates the cache; TargetCard uses `isAnyRunActive(removal, tag, add)`; `GroupsPane` L252 `isAddStatusInJob` + `AddState.dialogIds` exposed (AddExecutor L174); 14-VALIDATION status `complete`; 13-02-SUMMARY polarity corrected. |

## Audit Cross-Reference (v1.7-MILESTONE-AUDIT.md)

| Audit item | Status |
|------------|--------|
| Blocker 1: subset vs full-set | Closed (truth 1) |
| Blocker 2: stopped job has no remaining ids | Closed (truth 2) |
| Blocker 3: relaunch resolver-null; ADD_START silent while loading / pendingJob cleared | Closed (truths 3, 5) |
| Blocker 4: empty state hides Add checklist | Closed (truth 6) |
| Warning: orphaned `banned-no-unban-right` | Closed (truth 8) |
| Warning: DM default language divergence | Closed (truth 9) |
| Warning: add-log titles | Closed (truth 9) |
| Warning: scan polarity SUMMARY drift | Closed (SUMMARY corrected); stale code comment remains, see below |
| Warning: TargetCard Change target; queued rows | Closed (truth 9) |
| 14-VALIDATION draft | Closed |
| Not addressed (out of scope for phase): `DmTextProvider` type orphan, `wizardStage` ADD_* orphan events, 5 live-server manual items from 14-VALIDATION, config.test env-var tests (green with .env sourced) | Informational |

## Requirements Coverage

| Req | Status | Evidence |
|-----|--------|----------|
| ADD-08 | SATISFIED (live relaunch flow manual) | truths 1-5 |
| ADD-02 | SATISFIED (copy wording manual) | truths 6, 8 |
| ADD-11 | SATISFIED | links aggregated across segments via continuation, integration test |
| ADD-14 | SATISFIED | titles in log, CONTINUATION block |
| ADD-07 | SATISFIED | banned rows without unban right greyed up front |

All five IDs appear in REQUIREMENTS.md (marked [x], traceability table); no orphaned IDs for Phase 16.

## Executor-Reported Items Weighed

- **`computeAddGroups` defaults missing membership to `'not-member'`** (addValidation.ts:41): matches the pre-existing behavior for unscanned rows; a banned/member row always has a scan entry after a complete scan, so no wrong-target risk found. Accepted, Info.
- **Add empty state requires `failedCount === 0`**: reasonable (keeps retry reachable); departs from a literal reading of D-06 ("no row actionable"). Listed for UAT, not a gap.
- **Stale polarity docblock, `MembershipScanner.ts` ~L233-234**: says banned with `left` unset/false -> `'banned'`, `left===true` -> `'not-member'`, which is the inverse of the code/tests and corrected 13-02 SUMMARY. Comment only; WARNING (documentation drift, the exact kind the audit flagged). Recommend a one-line fix.

## Anti-Patterns
No TBD/FIXME/XXX debt markers found in the checked phase touchpoints; no stubs found.

## Gaps Summary
No functional gaps. Phase goal achieved in code and tests. Remaining: manual relaunch/Resume flow and en/cs empty-state wording review (human_verification above), plus one stale comment in MembershipScanner.ts.
