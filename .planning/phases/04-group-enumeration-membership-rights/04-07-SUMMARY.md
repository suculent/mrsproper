---
phase: 04-group-enumeration-membership-rights
plan: "07"
subsystem: renderer-groups-leaf
tags:
  - renderer
  - copy-module
  - group-row
  - i18n-hygiene
  - group-enumeration
  - membership-scan
dependency_graph:
  requires:
    - "04-02-SUMMARY.md (groupTypes.ts — GreyReason, GroupType, GroupErrorCode, AdminDialogDTO, MembershipStatus)"
    - "04-06-SUMMARY.md (checkbox.tsx, scroll-area.tsx, groupsStore — consumed by GroupRow)"
  provides:
    - "src/renderer/groups/groupsCopy.ts (all Phase 4 user-facing strings — i18n hygiene)"
    - "src/renderer/groups/GroupRow.tsx (single group row — actionable, greyed, failed-verify states)"
  affects:
    - "04-08-PLAN.md (GroupsPane.tsx — imports GroupRow + groupsCopy)"
tech_stack:
  added: []
  patterns:
    - "Copy module pattern: Record<TypedCode, string> + getter with fallback (mirrors resolveCopy.ts)"
    - "GroupRow props-only contract — no store import inside component (testable, reusable)"
    - "Avatar helpers duplicated from TargetCard per PATTERNS.md (avoids premature abstraction)"
key_files:
  created:
    - src/renderer/groups/groupsCopy.ts
    - src/renderer/groups/GroupRow.tsx
  modified: []
decisions:
  - "GroupRow receives all data via props — no direct useGroupsStore() call inside component (decouples rendering from store, enables unit testing)"
  - "getInitials in GroupRow returns first char only (group name vs person name — single initial is sufficient for 36px avatar)"
  - "Type badge shown on greyed rows only and never on failed-verify rows (isFailed guard) — matches D-04 exactly"
metrics:
  duration_minutes: 4
  completed_date: "2026-06-12"
  tasks_completed: 2
  files_modified: 2
---

# Phase 4 Plan 7: groupsCopy.ts and GroupRow.tsx Summary

All Phase 4 user-facing strings isolated in groupsCopy.ts (i18n hygiene) and GroupRow.tsx renders three distinct row states (actionable with checkbox, greyed with reason and type badge, failed-verify with destructive text and inline retry) with all D-02/D-03/D-04/D-07 requirements met.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create groupsCopy.ts with all Phase 4 user-facing strings | 058ec5b | src/renderer/groups/groupsCopy.ts |
| 2 | Create GroupRow.tsx — actionable, greyed, failed-verify row states | eb5a321 | src/renderer/groups/GroupRow.tsx |

## What Was Built

**groupsCopy.ts** (new file, 82 lines):
- `GROUP_GREY_COPY: Record<GreyReason, string>` — exact UI-SPEC strings for all 5 grey reasons ('not-creator', 'no-ban-right', 'broadcast-channel', 'not-admin', 'verify-failed')
- `GROUP_TYPE_LABEL: Record<GroupType, string>` — 'Group' / 'Supergroup' / 'Channel' display labels
- `GROUP_ERROR_COPY: Record<GroupErrorCode, string>` — FLOOD_WAIT / NETWORK / UNKNOWN error copy
- `SCAN_COPY` — `{ scanning: "Scanning your groups…", failedN: (n: number) => string }`
- `EMPTY_STATE_COPY` — noGroups / noMatches / notInAny(name) empty state objects
- `formatMemberCount(count: number | null): string` — Intl.NumberFormat compact notation
- `getGreyCopy(reason: GreyReason): string` — getter with verify-failed fallback

**GroupRow.tsx** (new file, 173 lines):
- `GroupRowProps`: `{ dialog: AdminDialogDTO; membershipStatus: MembershipStatus | null; isChecked: boolean; onToggle: (dialogId: string) => void; onRetry: (dialogId: string) => void }`
- Actionable state: `<Checkbox>` with `aria-label="{title} — include in removal"` + member count
- Greyed state: `opacity-50` on row, non-interactive checkbox placeholder (`role="checkbox" aria-disabled="true"`), reason subtext always visible, type badge (`<Badge variant="secondary">`)
- Failed-verify state: `text-destructive` for "Couldn't verify —" text + inline `<button>` with `aria-label="Retry membership check for {title}"`
- Scan-pending state: `animate-pulse bg-muted rounded` skeleton in checkbox area
- Avatar: `h-9 w-9` with initials fallback using AVATAR_COLORS palette
- Helpers `bytesToDataUrl`, `getInitials`, `AVATAR_COLORS`, `getAvatarColor` duplicated from TargetCard per PATTERNS.md

## Verification Results

```
grep -r "hardcoded|'Only group|couldn't verify|Channel —'" GroupRow.tsx → no matches (PASS)
grep "GROUP_GREY_COPY|GROUP_TYPE_LABEL|formatMemberCount" GroupRow.tsx → all 3 present (PASS)
grep "opacity-50" GroupRow.tsx → PASS
grep "aria-label" GroupRow.tsx | grep "include in removal|Retry membership" → both present (PASS)
npx tsc --noEmit → 0 errors (clean)
npm test → 2 failed | 150 passed — same pre-existing AUTH-03 baseline as Plan 06
```

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. groupsCopy.ts contains all required strings. GroupRow.tsx renders all three states with real data from props — no hardcoded placeholders, no stubs.

## Threat Flags

None. Per threat model:
- T-04-11: `onRetry(dialogId)` propagates to IPC caller via prop — GroupRow has no direct IPC access; accepted.
- T-04-12: Avatar bytes are Uint8Array from main-side downloadProfilePhoto; cosmetic group photos, no sensitive data — accepted.

## Self-Check: PASSED

Files created:
- FOUND: src/renderer/groups/groupsCopy.ts
- FOUND: src/renderer/groups/GroupRow.tsx

Commits verified:
- FOUND: 058ec5b (Task 1 — groupsCopy.ts)
- FOUND: eb5a321 (Task 2 — GroupRow.tsx)
