// Pure predicate: single source of truth for per-mode checklist actionability (D-03, D-05).
// No React import, no side effects. Imported by groupsStore.ts's pre-check rebuild and
// GroupsPane.tsx's partition loop (Plan 15-09) so the two call sites never silently drift
// apart (15-RESEARCH.md Pitfall 2).

import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'

/** The three checklist modes a groups-pane row can be partitioned/pre-checked under. */
export type GroupMode = 'remove' | 'tag' | 'add'

/**
 * Determines whether a checklist row is actionable (and pre-checked) for the given mode.
 *
 * - remove/tag share one rule — true iff `dialog.canAct` and the scan status is
 *   `member` or `null` (pending rows ARE actionable while the scan is still running;
 *   this is today's existing Remove behavior, unchanged).
 * - add is the inverted rule (D-05) — true iff `dialog.canAdd` and the scan status is
 *   `not-member`, or `banned` AND `dialog.canUnban` (D-09/D-10: a banned target can only
 *   be added if the admin can lift the ban first; otherwise the row is greyed).
 *   A `null`/pending status is deliberately NOT actionable in Add mode —
 *   this asymmetry with remove/tag is intentional (D-05: rows become pre-checked only
 *   once their status resolves), not a bug to unify away.
 */
export function isActionableForMode(
  dialog: AdminDialogDTO,
  status: MembershipStatus | null,
  mode: GroupMode
): boolean {
  if (mode === 'add') {
    return dialog.canAdd && (status === 'not-member' || (status === 'banned' && dialog.canUnban))
  }
  return dialog.canAct && (status === 'member' || status === null)
}
