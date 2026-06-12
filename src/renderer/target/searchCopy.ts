// All user-facing strings for the name-search flow (Phase 4.1, TGT-05).
// i18n hygiene: no hardcoded strings in components — all copy lives here.
// Pattern: groupsCopy.ts — Record<TypedCode, string> + helper functions.

import type { SearchErrorCode } from '@shared/searchTypes'

/**
 * Maps SearchErrorCode to user-facing error copy.
 * Terminal search errors — displayed inline below the input.
 */
export const SEARCH_ERROR_COPY: Record<SearchErrorCode, string> = {
  GROUPS_NOT_LOADED: "Your group list is still loading — try again in a moment.",
  FLOOD_WAIT: "The name search couldn't complete. Check your connection and try again.",
  NETWORK: "The name search couldn't complete. Check your connection and try again.",
  UNKNOWN: "The name search couldn't complete. Check your connection and try again.",
}

/**
 * All other user-facing strings for the name-search surface.
 */
export const SEARCH_COPY = {
  /** Progress label during a running scan. */
  searching: (x: number, total: number): string =>
    `Searching group ${x} of ${total}…`,

  /** Line shown after user aborts a running scan. */
  stopped: (n: number): string => `Search stopped — ${n} found so far.`,

  /** Shown below the candidate list when results have been capped at 100. */
  capNotice: "Showing first 100 — refine your search.",

  /** Soft-failure note when some groups couldn't be searched. */
  failedN: (n: number): string =>
    `Couldn't search ${n} group${n === 1 ? '' : 's'}`,

  /** Empty-state heading after a completed scan with no results. */
  emptyHeading: (query: string, n: number): string =>
    `No one named '${query}' found in your ${n} groups`,

  /** Empty-state body after a completed scan with no results. */
  emptyBody:
    "Check the spelling, or try their @username or phone number instead.",

  /** Muted subline shown below the progress bar during a FLOOD_WAIT mid-scan. */
  floodSubline:
    "Telegram asked us to slow down — resuming automatically.",

  /** Hint line shown below the input when name mode is detected. */
  nameHint:
    "Searches members of the groups you administer. First or last name works.",

  /** Client-side validation error when query is too short. */
  minLengthError: "Type at least 2 letters of their name.",

  /** Error when the user has no groups to search. */
  noGroupsError: "You don't administer any groups to search.",
} as const

/**
 * Formats the "Found in" line for a candidate row.
 * Shows first `max` group titles joined with ", ".
 * Appends " +{N} more" if titles.length > max.
 * Returns empty string when titles is empty.
 */
export function formatFoundIn(titles: string[], max = 2): string {
  if (titles.length === 0) return ''
  const shown = titles.slice(0, max).join(', ')
  if (titles.length > max) {
    return `${shown} +${titles.length - max} more`
  }
  return shown
}
