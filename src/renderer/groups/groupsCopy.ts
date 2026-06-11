// Maps typed GreyReason values + scan error codes + group types to human-readable UI copy.
// No Telegram jargon ever reaches the user.
// i18n hygiene: ALL user-facing strings in Phase 4 go here only.
// Pattern: resolveCopy.ts — Record<TypedCode, string> + helper getter function.

import type { GreyReason, GroupType, GroupErrorCode } from '@shared/groupTypes'

/**
 * Maps GreyReason codes to inline row subtext (D-03, always visible below group name).
 * Exact strings from UI-SPEC §Grey-out reasons.
 */
export const GROUP_GREY_COPY: Record<GreyReason, string> = {
  'not-creator': "Only group creators can remove members here",
  'no-ban-right': "You don’t have the ban right in this group",
  'broadcast-channel': "Channel — subscribers can’t be removed",
  'not-admin': "You’re not an admin here",
  'verify-failed': "Couldn’t verify —",
}

/**
 * Maps GroupType to display label for the type badge (D-04, greyed rows only).
 */
export const GROUP_TYPE_LABEL: Record<GroupType, string> = {
  'basic-group': "Group",
  'supergroup': "Supergroup",
  'broadcast-channel': "Channel",
}

/**
 * Maps GroupErrorCode to user-facing error explanation (UI-SPEC §Error states).
 */
export const GROUP_ERROR_COPY: Record<GroupErrorCode, string> = {
  'FLOOD_WAIT': "Too many requests. The group list will load automatically when Telegram allows it.",
  'NETWORK': "Couldn’t reach Telegram. Check your connection, then tap Refresh.",
  'UNKNOWN': "Something went wrong loading your groups. Tap Refresh to try again.",
}

/**
 * Scan-state copy strings (progress indicator + failed-rows summary).
 */
export const SCAN_COPY = {
  scanning: "Scanning your groups…",
  failedN: (n: number) =>
    `${n} group${n === 1 ? '' : 's'} couldn’t be verified. You can retry them above.`,
} as const

/**
 * Empty-state headings and body copy for the three GroupsPane empty scenarios.
 */
export const EMPTY_STATE_COPY = {
  noGroups: {
    heading: "No groups found",
    body: "Your Telegram account doesn’t appear to administer any groups or channels.",
  },
  noMatches: {
    heading: "No matches",
    body: "No groups match that filter. Try a different name.",
  },
  notInAny: (name: string) => ({
    heading: "Not in any of your groups",
    body: `${name} isn’t a member of any group you can remove them from. They may have already left, or you lack removal rights in all your groups.`,
  }),
} as const

/**
 * Formats a member count for display in group rows.
 * Returns empty string for null; compact notation for counts >= 1000.
 * Example: null → '', 47 → '47', 1234 → '1.2K', 10000 → '10K'.
 */
export function formatMemberCount(count: number | null): string {
  if (count === null) return ''
  if (count < 1000) return count.toString()
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(count)
}

/**
 * Returns the user-facing grey-out reason copy for a given GreyReason.
 * Falls back to the 'verify-failed' copy if the code is not recognized.
 */
export function getGreyCopy(reason: GreyReason): string {
  return GROUP_GREY_COPY[reason] ?? GROUP_GREY_COPY['verify-failed']
}
