// Single group row — actionable, greyed (non-actionable), or failed-verify.
// Receives all data via props; does NOT import groupsStore directly (avoids tight coupling).
// Renders the complete row matching UI-SPEC §GroupRow Visual Specification.
// D-02: avatar + name + member count + checkbox
// D-03: grey-out reason always visible (no hover required)
// D-04: type badge on greyed rows only
// D-07: failed-verify shows destructive text + inline retry button

import React from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { cn } from '@renderer/lib/utils'
import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import {
  GROUP_GREY_COPY,
  GROUP_TYPE_LABEL,
  formatMemberCount,
} from './groupsCopy'

// ---------------------------------------------------------------------------
// Avatar color palette — duplicated from TargetCard — avoids premature abstraction per PATTERNS.md
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
// bytesToDataUrl — duplicated from TargetCard — avoids premature abstraction per PATTERNS.md
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
// getInitials — duplicated from TargetCard — avoids premature abstraction per PATTERNS.md
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}

// ---------------------------------------------------------------------------
// GroupRowProps
// ---------------------------------------------------------------------------

export interface GroupRowProps {
  dialog: AdminDialogDTO
  membershipStatus: MembershipStatus | null // null = pending / not-yet-scanned
  isChecked: boolean
  onToggle: (dialogId: string) => void
  onRetry: (dialogId: string) => void
}

// ---------------------------------------------------------------------------
// GroupRow component
// ---------------------------------------------------------------------------

export function GroupRow({
  dialog,
  membershipStatus,
  isChecked,
  onToggle,
  onRetry,
}: GroupRowProps): React.JSX.Element {
  const isActionable = dialog.canAct && membershipStatus === 'member'
  const isPending = membershipStatus === null || membershipStatus === 'pending'
  const isFailed = membershipStatus === 'failed'

  const avatarUrl = dialog.avatar ? bytesToDataUrl(dialog.avatar) : null
  const initial = getInitials(dialog.title)
  const avatarBg = getAvatarColor(dialog.id)

  return (
    <div
      className={cn(
        'min-h-[56px] px-4 py-3 flex items-center gap-3 hover:bg-accent/10',
        !dialog.canAct && 'opacity-50'
      )}
    >
      {/* Checkbox area — left side */}
      {isPending ? (
        // Scan-pending skeleton (UI-SPEC scan-pending row)
        <div className="h-4 w-4 shrink-0 rounded animate-pulse bg-muted" />
      ) : isActionable ? (
        // Actionable: real Checkbox (D-02)
        <Checkbox
          checked={isChecked}
          onCheckedChange={() => onToggle(dialog.id)}
          aria-label={`${dialog.title} — include in removal`}
        />
      ) : (
        // Greyed or failed: non-interactive placeholder (UI-SPEC greyed rows + pending states)
        <div
          className="h-4 w-4 shrink-0 rounded-sm border border-primary/30 cursor-not-allowed"
          role="checkbox"
          aria-checked="false"
          aria-disabled="true"
        />
      )}

      {/* Group avatar (36px per UI-SPEC) */}
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={avatarUrl ?? ''} alt="" />
        <AvatarFallback style={{ backgroundColor: avatarBg }} className="text-white font-semibold text-xs">
          {initial}
        </AvatarFallback>
      </Avatar>

      {/* Name + reason + badge column */}
      <div className="flex flex-col min-w-0 flex-1">
        {/* Group name (D-02) */}
        <span className="text-label font-medium truncate">{dialog.title}</span>

        {/* Grey reason — canAct=false, not failed-verify (D-03) */}
        {!dialog.canAct && dialog.greyReason && dialog.greyReason !== 'verify-failed' && !isFailed && (
          <span className="text-label text-muted-foreground">
            {GROUP_GREY_COPY[dialog.greyReason]}
          </span>
        )}

        {/* Failed-verify state (D-07) — destructive text + inline retry button */}
        {isFailed && (
          <span className="text-label text-destructive inline-flex items-baseline gap-1">
            {GROUP_GREY_COPY['verify-failed']}
            <button
              onClick={() => onRetry(dialog.id)}
              className="text-label text-primary underline-offset-2 hover:underline"
              aria-label={`Retry membership check for ${dialog.title}`}
            >
              retry
            </button>
          </span>
        )}

        {/* Type badge — greyed rows only, not failed-verify (D-04) */}
        {!dialog.canAct && !isFailed && (
          <Badge variant="secondary" className="w-fit mt-0.5">
            {GROUP_TYPE_LABEL[dialog.type]}
          </Badge>
        )}
      </div>

      {/* Member count — right side (D-02) */}
      {dialog.memberCount !== null && (
        <span className="text-label text-muted-foreground tabular-nums shrink-0">
          {formatMemberCount(dialog.memberCount)}
        </span>
      )}
    </div>
  )
}

export default GroupRow
