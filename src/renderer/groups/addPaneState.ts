// Pure helpers for Add-mode pane display decisions (16-05). No React, no side effects.
// Combines only main-computed booleans (canAdd, canUnban) and scan status.

import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import { isActionableForMode } from './modeRules'

export type AddEmptyState = 'none' | 'all-member' | 'cannot-add'

/**
 * Decides which Add-mode empty state (if any) to show once the scan is complete (D-06).
 * - 'none' when there are no dialogs, any row is actionable, or any row failed verification
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
  if (dialogs.length === 0) return 'none'
  if (failedCount > 0) return 'none'
  if (dialogs.some((d) => isActionableForMode(d, statusOf(d.id), 'add'))) return 'none'
  if (dialogs.every((d) => statusOf(d.id) === 'member')) return 'all-member'
  return 'cannot-add'
}

/** D-16: a row shows Add run status only if it belongs to the job (undefined = unknown, show). */
export function isAddStatusInJob(dialogId: string, jobDialogIds: string[] | undefined): boolean {
  return jobDialogIds === undefined || jobDialogIds.includes(dialogId)
}
