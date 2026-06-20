// Pure validation utilities for the Tag action input.
// No React import, no side effects. Imported by TagInput, ReviewScreen, and tagValidation.test.ts.

import { TAG_MAX_LENGTH } from '@shared/tagConstants'
import type { AdminDialogDTO } from '@shared/groupTypes'

// ---------------------------------------------------------------------------
// TagInputError — discriminated union for input validation results
// ---------------------------------------------------------------------------

/** null = valid; 'tooLong' = exceeds TAG_MAX_LENGTH; 'controlChars' = contains control chars */
export type TagInputError = 'tooLong' | 'controlChars' | null

/**
 * Validates a tag input value.
 * Checks length first, then control characters.
 * Returns null if the value is valid (including empty — empty confirm is blocked elsewhere).
 */
export function validateTagInput(value: string): TagInputError {
  if (value.length > TAG_MAX_LENGTH) return 'tooLong'
  // Reject if value contains any control characters or line breaks
  if (value !== value.replace(/[\x00-\x1F\x7F\r\n]+/g, '')) return 'controlChars'
  return null
}

// ---------------------------------------------------------------------------
// TagGroupAction — result of mapping a dialog to its tag-run mechanic
// ---------------------------------------------------------------------------

/** Per-group action descriptor for the tag review screen and tag run executor. */
export type TagGroupAction = {
  dialog: AdminDialogDTO
  /** Human-readable mechanic note, translated via the provided t() function. */
  mechanicNote: string
  /** True if this group will be skipped during the tag run (e.g., basic groups). */
  willBeSkipped: boolean
}

/** Minimal translate function type — matches the i18next t() signature used here. */
export type TranslateFn = (key: string, options?: Record<string, unknown>) => string

/**
 * Maps the checked dialogs to their tag-run action descriptors.
 * Only includes dialogs whose id is in checkedIds.
 * basic-group → willBeSkipped=true (TAG_UNSUPPORTED_BASIC_GROUP path).
 * supergroup/broadcast-channel → willBeSkipped=false.
 * canAct is intentionally NOT filtered here — the TagExecutor handles permission errors
 * differently from RemovalExecutor; all checked dialogs are included.
 */
export function computeTagGroups(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  t: TranslateFn = (key) => key
): TagGroupAction[] {
  return dialogs
    .filter((d) => checkedIds.has(d.id))
    .map((d) => {
      const isBasicGroup = d.type === 'basic-group'
      return {
        dialog: d,
        mechanicNote: isBasicGroup
          ? t('tag:mechanicNote.basicGroup')
          : t('tag:mechanicNote.supergroup'),
        willBeSkipped: isBasicGroup,
      }
    })
}
