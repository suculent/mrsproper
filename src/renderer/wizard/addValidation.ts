// Pure validation/derivation utilities for the Add action (ADD-12, ADD-16).
// No React import, no side effects. Mirrors tagValidation.ts's computeTagGroups/
// TranslateFn pattern. Imported by ReviewScreen and DmTemplateEditor (Plan 15-10).

import { DM_TEMPLATE_MAX_LENGTH } from '@shared/dmTemplate'
import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import type { TranslateFn } from './tagValidation'
import { isActionableForMode } from '../groups/modeRules'

// ---------------------------------------------------------------------------
// AddGroupAction — result of mapping a checked dialog to its add-run mechanic (D-14)
// ---------------------------------------------------------------------------

/** Per-group action descriptor for the Add review screen. */
export type AddGroupAction = {
  dialog: AdminDialogDTO
  /** Human-readable mechanic note, translated via the provided t() function. */
  mechanicNote: string
  /** True if the "ban will be lifted first" suffix was appended (D-06/D-14). */
  banNoteAppended: boolean
}

/**
 * Maps the checked dialogs to their add-run action descriptors.
 * Only includes dialogs whose id is in checkedIds.
 * basic-group → 'add:mechanicNote.add'; supergroup/broadcast-channel → 'add:mechanicNote.invite'.
 * When the dialog's current membership status is 'banned', the ban-lifted-first note is
 * appended and banNoteAppended is true (D-06) — otherwise the base note is returned alone.
 */
export function computeAddGroups(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  membershipByDialogId: Map<string, MembershipStatus>,
  t: TranslateFn = (key) => key
): AddGroupAction[] {
  return dialogs
    // WR-03 / D-12: defensive re-filter via the shared predicate (canAdd + banned-needs-canUnban),
    // mirroring computePlannedActions' safety net on the Remove path — a dialog the target
    // cannot actually be added to must never reach startAdd(dialogIds), even if checkedDialogIds
    // is stale/incorrect.
    // WR-04 (D-05): an absent (unscanned/pending) membership status is passed as `null`, which
    // isActionableForMode deliberately treats as NOT actionable in Add mode — unknown membership
    // must never be silently upgraded to 'not-member' and slip past this safety net.
    .filter((d) => checkedIds.has(d.id) && isActionableForMode(d, membershipByDialogId.get(d.id) ?? null, 'add'))
    .map((d) => {
      const isBasic = d.type === 'basic-group'
      const isBanned = membershipByDialogId.get(d.id) === 'banned'
      const base = isBasic ? t('add:mechanicNote.add') : t('add:mechanicNote.invite')
      return {
        dialog: d,
        mechanicNote: isBanned ? `${base} ${t('add:mechanicNote.banLiftedSuffix')}` : base,
        banNoteAppended: isBanned,
      }
    })
}

// ---------------------------------------------------------------------------
// DmTemplateError — discriminated union for DM template validation results (D-12)
// ---------------------------------------------------------------------------

/** null = valid; 'empty' | 'tooLong' | 'missingLinks' describe the failure mode. */
export type DmTemplateError = 'missingLinks' | 'empty' | 'tooLong' | null

/**
 * Validates a DM template draft before Save (D-12).
 * Check order: empty → tooLong → missingLinks → null (valid).
 * The length bound is imported from the shared DM_TEMPLATE_MAX_LENGTH constant
 * (never a re-hardcoded literal) so this stays in lockstep with the main-process
 * Zod schema bound (T-15-04). '{name}' is intentionally NOT required — optional per D-12.
 */
export function validateDmTemplate(text: string): DmTemplateError {
  if (text.trim() === '') return 'empty'
  if (text.length > DM_TEMPLATE_MAX_LENGTH) return 'tooLong'
  if (!text.includes('{links}')) return 'missingLinks'
  return null
}
