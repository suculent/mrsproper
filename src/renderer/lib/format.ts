// Pure formatting utilities rescued from copy modules before their deletion (Phase 8, LOC-02).
// These are locale-sensitive JS utilities — NOT translatable copy.
// The English words that formerly surrounded these values are now i18next JSON keys:
//   - "Finished {{time}}" → removal namespace key 'finishedAt'
//   - "+{{count}} more"   → target namespace key 'foundInMore'
// Consumers compose: formatFoundInTitles(titles) + (overflow > 0 ? t('target:foundInMore', { count: overflow }) : '')
//
// Do NOT add i18n imports here — these are pure JS utilities with no embedded English words.

/**
 * Formats a member count for display in group rows.
 * Returns empty string for null; compact notation for counts >= 1000.
 * Example: null → '', 47 → '47', 1234 → '1.2K', 10000 → '10K'.
 * Note: 'en' locale hardcoded for compact notation consistency (RESEARCH.md Open Question 3).
 */
export function formatMemberCount(count: number | null): string {
  if (count === null) return ''
  if (count < 1000) return count.toString()
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(count)
}

/**
 * Formats an ISO timestamp to a localized HH:MM time string.
 * Returns ONLY the time portion — the translatable wrapper ("Finished {{time}}" / "Dokončeno {{time}}")
 * lives in the removal namespace JSON key 'finishedAt'.
 * Example: "2024-01-15T14:35:00Z" → "14:35" (or locale-equivalent)
 */
export function formatTime(isoString: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(isoString)
  )
}

/**
 * Formats a list of group titles into a joined string showing up to `max` titles.
 * Returns ONLY the joined title list — the overflow suffix ("+{{count}} more" / "+{{count}} dalších")
 * lives in the target namespace JSON key 'foundInMore'.
 * Callers compose: formatFoundInTitles(titles) + (overflow > 0 ? t('target:foundInMore', { count: overflow }) : '')
 * Example: ['Group A', 'Group B', 'Group C'], max=2 → 'Group A, Group B'
 */
export function formatFoundInTitles(titles: string[], max = 2): string {
  if (titles.length === 0) return ''
  return titles.slice(0, max).join(', ')
}
