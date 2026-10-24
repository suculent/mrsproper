// Pure helpers for Add-mode pane display decisions (16-05). No React, no side effects.
// Combines only main-computed booleans (canAdd, canUnban) and scan status.

import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import { isActionableForMode } from './modeRules'

export type AddEmptyState = 'none' | 'all-member' | 'cannot-add' | 'no-groups'

/**
 * Decides which Add-mode empty state (if any) to show once the scan is complete (D-06).
 * - 'no-groups' when there are zero dialogs (D-14), checked first.
 * - 'none' when any row is actionable, or any row failed verification
 *   (failedCount > 0 keeps the checklist visible so the retry banner stays reachable;
 *   confirm at UAT).
 * - 'all-member' when every dialog is already a member.
 * - 'cannot-add' otherwise (no invite/unban right, full group, etc.).
 */
export function getAddEmptyState(
  dialogs: AdminDialogDTO[],
  statusOf: (id: string) => MembershipStatus | null,
  failedCount: number
): AddEmptyState {
  if (dialogs.length === 0) return 'no-groups'
  if (failedCount > 0) return 'none'
  if (dialogs.some((d) => isActionableForMode(d, statusOf(d.id), 'add'))) return 'none'
  if (dialogs.every((d) => statusOf(d.id) === 'member')) return 'all-member'
  return 'cannot-add'
}

/** D-16: a row shows Add run status only if it belongs to the job (undefined = unknown, show). */
export function isAddStatusInJob(dialogId: string, jobDialogIds: string[] | undefined): boolean {
  return jobDialogIds === undefined || jobDialogIds.includes(dialogId)
}

export type PaneView = 'browse' | 'checklist' | 'job'

/**
 * D-04: the Add slot must never be hidden. A non-idle add job with no confirmed target
 * (relaunch resume) renders the job view regardless of the browse/checklist mode.
 */
export function getPaneView(addStep: string, targetStep: string): PaneView {
  if (addStep !== 'idle' && targetStep !== 'confirmed') return 'job'
  return targetStep === 'confirmed' ? 'checklist' : 'browse'
}

/** D-03: rows limited to the job's dialogIds, in job order; unknown ids skipped. */
export function getJobRows<T extends { id: string }>(
  allDialogs: T[],
  dialogIds: string[] | undefined
): T[] {
  if (!dialogIds) return []
  const byId = new Map(allDialogs.map((d) => [d.id, d]))
  const out: T[] = []
  for (const id of dialogIds) {
    const row = byId.get(id)
    if (row) out.push(row)
  }
  return out
}
