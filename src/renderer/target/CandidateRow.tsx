// Single clickable candidate row for name-search results (Phase 4.1, TGT-05).
// Props-only — no store imports. Mirrors GroupRow geometry and avatar pattern.
// UI-SPEC §Candidate List & Row Specification.

import React from 'react'
import { Loader2, Ghost } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { cn } from '@renderer/lib/utils'
import type { CandidateDTO } from '@shared/searchTypes'
import { formatFoundIn } from './searchCopy'

// ---------------------------------------------------------------------------
// Avatar color palette — duplicated from GroupRow/TargetCard — avoids premature abstraction per PATTERNS.md
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  '#E17076',
  '#FAA774',
  '#A695E7',
  '#7BC862',
  '#6EC9CB',
  '#65AADD',
  '#EE7AAE',
]

function getAvatarColor(seed: string): string {
  return AVATAR_COLORS[Number(BigInt(seed) % 7n)]
}

// ---------------------------------------------------------------------------
// bytesToDataUrl — duplicated from GroupRow/TargetCard — avoids premature abstraction per PATTERNS.md
// ---------------------------------------------------------------------------

function bytesToDataUrl(bytes: Uint8Array | null): string | null {
  if (!bytes || bytes.length === 0) return null
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  const b64 = btoa(binary)
  return `data:image/jpeg;base64,${b64}`
}

// ---------------------------------------------------------------------------
// getInitials — two-letter form: first letter of first word + first letter of last word
// Duplicated from TargetCard — avoids premature abstraction per PATTERNS.md
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ---------------------------------------------------------------------------
// CandidateRowProps
// ---------------------------------------------------------------------------

export interface CandidateRowProps {
  candidate: CandidateDTO
  onSelect: (userId: string) => void
  isSelecting: boolean
  disabled: boolean
}

// ---------------------------------------------------------------------------
// CandidateRow component
// ---------------------------------------------------------------------------

export function CandidateRow({
  candidate,
  onSelect,
  isSelecting,
  disabled,
}: CandidateRowProps): React.JSX.Element {
  const avatarUrl = bytesToDataUrl(candidate.avatar)
  const initials = candidate.name ? getInitials(candidate.name) : ''
  const avatarBg = getAvatarColor(candidate.id)

  const identityLine = candidate.username
    ? `@${candidate.username} · ID ${candidate.id}`
    : `ID ${candidate.id}`

  const foundInText = formatFoundIn(candidate.foundIn, 2)
  const foundInFull = candidate.foundIn.join(', ')

  return (
    <button
      type="button"
      className={cn(
        'min-h-[56px] px-4 py-3 flex items-center gap-3 w-full text-left',
        'hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50'
      )}
      disabled={disabled || isSelecting}
      aria-label={`${candidate.name} — found in ${candidate.foundIn.length} of your groups`}
      onClick={() => onSelect(candidate.id)}
    >
      {/* Avatar (36px per UI-SPEC) */}
      <Avatar className="h-9 w-9 shrink-0 rounded-full">
        <AvatarImage src={avatarUrl ?? ''} alt="" />
        <AvatarFallback
          style={candidate.deleted ? undefined : { backgroundColor: avatarBg }}
          className={cn(
            'text-white font-semibold text-xs',
            candidate.deleted && 'bg-secondary'
          )}
        >
          {candidate.deleted ? (
            <Ghost className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            initials
          )}
        </AvatarFallback>
      </Avatar>

      {/* Text stack */}
      <div className="flex flex-col min-w-0 flex-1">
        {/* Name */}
        <span className="text-label font-semibold text-foreground truncate">
          {candidate.name}
        </span>

        {/* Identity line — @username · ID ... or ID ... */}
        <span className="text-label font-mono text-muted-foreground truncate">
          {identityLine}
        </span>

        {/* Found-in line */}
        {foundInText && (
          <span
            className="text-label text-muted-foreground truncate"
            title={foundInFull}
          >
            {foundInText}
          </span>
        )}
      </div>

      {/* Selecting spinner — right slot */}
      {isSelecting && (
        <Loader2
          className="h-4 w-4 animate-spin text-muted-foreground shrink-0"
          aria-hidden="true"
        />
      )}
    </button>
  )
}

export default CandidateRow
