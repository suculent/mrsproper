// Shared avatar fallback helpers (moved verbatim from TargetCard.tsx so TargetCard and
// JobTargetCard produce the same hue and initials for the same id/name).

export const AVATAR_COLORS = [
  '#E17076',
  '#FAA774',
  '#A695E7',
  '#7BC862',
  '#6EC9CB',
  '#65AADD',
  '#EE7AAE',
]

export function getAvatarColor(numericId: string): string {
  return AVATAR_COLORS[Number(BigInt(numericId) % 7n)]
}

// First letter of first and last word, uppercase
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
