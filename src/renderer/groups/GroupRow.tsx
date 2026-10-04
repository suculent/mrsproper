// Single group row — actionable, greyed (non-actionable), or failed-verify.
// Receives all data via props; does NOT import groupsStore directly (avoids tight coupling).
// Renders the complete row matching UI-SPEC §GroupRow Visual Specification.
// D-02: avatar + name + member count + checkbox
// D-03: grey-out reason always visible (no hover required)
// D-04: type badge on greyed rows only
// D-07: failed-verify shows destructive text + inline retry button
// Phase 5: removalStatus prop renders per-group removal status in checkbox slot + subline.

import React from 'react'
import { Check, Loader2, AlertCircle, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { cn } from '@renderer/lib/utils'
import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import type { RmvErrorCode } from '@shared/removalTypes'
import type { TagErrorCode } from '@shared/tagTypes'
import type { AddErrorCode } from '@shared/addTypes'
import { formatMemberCount } from '@renderer/lib/format'

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
  // Guard against empty seed — BigInt('') throws SyntaxError in V8 (mirrors ReviewScreen)
  if (!seed) return AVATAR_COLORS[0]
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
  /** Removal status for this group. null/undefined = not in a removal run. */
  removalStatus?: 'queued' | 'removing' | 'done' | 'already-gone' | 'failed' | 'skipped' | null
  /** 'basic-group-ban-fallback' annotation or null — affects done copy */
  removalNote?: 'basic-group-ban-fallback' | null
  /** Called when user clicks the "retry removal" link for a failed row */
  onRetryRemoval?: (dialogId: string) => void
  /** Typed failure code — present when removalStatus === 'failed' */
  errorCode?: RmvErrorCode | null
  /** Removal severity — affects done copy ("Banned" vs "Removed") */
  severity?: 'kick' | 'ban'
  /** Tag status for this group. null/undefined = not in a tag run. */
  tagStatus?: 'queued' | 'tagging' | 'done' | 'skipped' | 'failed' | null
  /** Typed tag failure/skip code — present when tagStatus === 'failed' or 'skipped'. */
  tagErrorCode?: TagErrorCode | null
  // NOTE: no onRetryTag, no tagNote — tag has no per-group retry, no basic-group-fallback note
  /** Add status for this group. null/undefined = not in an add run. */
  addStatus?: 'queued' | 'adding' | 'done' | 'already-member' | 'privacy-blocked' | 'failed' | 'skipped' | null
  /** Typed add failure code — present when addStatus === 'failed'. */
  addErrorCode?: AddErrorCode | null
  /** Single-use invite link — present when addStatus === 'privacy-blocked' (D-18). */
  addLink?: string | null
  /** Telegram Premium would have allowed a direct add — present when addStatus === 'privacy-blocked' (D-18/D-09). */
  premiumWouldAllow?: boolean
  /** Called when user clicks the "retry" link for a failed Add row (D-18). */
  onRetryAdd?: (dialogId: string) => void
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
  removalStatus,
  removalNote,
  onRetryRemoval,
  errorCode,
  severity = 'ban',
  tagStatus,
  tagErrorCode,
  addStatus,
}: GroupRowProps): React.JSX.Element {
  const { t: tG } = useTranslation('groups')
  const { t: tR } = useTranslation('removal')
  const { t: tT } = useTranslation('tag')
  const { t: tAdd } = useTranslation('add')

  const isActionable = dialog.canAct && membershipStatus === 'member'
  const isPending = membershipStatus === null || membershipStatus === 'pending'
  const isFailed = membershipStatus === 'failed'

  const avatarUrl = dialog.avatar ? bytesToDataUrl(dialog.avatar) : null
  const initial = getInitials(dialog.title)
  const avatarBg = getAvatarColor(dialog.id)

  // When a removal, tag, or add run is active for this row, disable toggle interactions
  const isRemovalActive = removalStatus != null || tagStatus != null || addStatus != null

  // ---------------------------------------------------------------------------
  // Checkbox slot — Phase 5 removal status branch is FIRST
  // ---------------------------------------------------------------------------

  function renderCheckboxSlot(): React.JSX.Element {
    // 1. removalStatus branch (non-null): switch on removalStatus
    if (removalStatus != null) {
      switch (removalStatus) {
        case 'removing':
          return (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          )
        case 'done':
        case 'already-gone':
          return (
            <Check
              className="h-4 w-4 shrink-0 text-success"
              aria-hidden="true"
            />
          )
        case 'failed':
          return (
            <AlertCircle
              className="h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
          )
        case 'skipped':
          return (
            <Minus
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )
        case 'queued':
          // queued: checked + disabled checkbox (non-interactive, visually filled)
          return (
            <Checkbox
              checked={true}
              disabled={true}
              aria-label={tG('includeInRemovalAria', { title: dialog.title })}
            />
          )
      }
    }

    // 1b. tagStatus branch — parallel to removalStatus, never overlap
    if (tagStatus != null) {
      switch (tagStatus) {
        case 'tagging':
          return (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          )
        case 'done':
          return (
            <Check
              className="h-4 w-4 shrink-0 text-success"
              aria-hidden="true"
            />
          )
        case 'skipped':
          return (
            <Minus
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )
        case 'failed':
          return (
            <AlertCircle
              className="h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
          )
        case 'queued':
          return (
            <Checkbox
              checked={true}
              disabled={true}
              aria-label={tT('queuedTagAria', { title: dialog.title })}
            />
          )
      }
    }

    // 1c. addStatus branch — parallel to removalStatus/tagStatus, never overlap
    if (addStatus != null) {
      switch (addStatus) {
        case 'adding':
          return (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          )
        case 'done':
        case 'already-member':
        case 'privacy-blocked':
          return (
            <Check
              className="h-4 w-4 shrink-0 text-success"
              aria-hidden="true"
            />
          )
        case 'failed':
          return (
            <AlertCircle
              className="h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
          )
        case 'skipped':
          return (
            <Minus
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )
        case 'queued':
          return (
            <Checkbox
              checked={true}
              disabled={true}
              aria-label={tAdd('queuedAddAria', { title: dialog.title })}
            />
          )
      }
    }

    // 2. Existing isPending branch (unchanged)
    if (isPending) {
      return <div className="h-4 w-4 shrink-0 rounded animate-pulse bg-muted" />
    }

    // 3. Existing isActionable branch (unchanged)
    if (isActionable) {
      return (
        <Checkbox
          checked={isChecked}
          onCheckedChange={() => onToggle(dialog.id)}
          aria-label={tG('includeInRemovalAria', { title: dialog.title })}
        />
      )
    }

    // 4. Existing grey-disabled fallback (unchanged)
    return (
      <div
        className="h-4 w-4 shrink-0 rounded-sm border border-primary/30 cursor-not-allowed"
        role="checkbox"
        aria-checked="false"
        aria-disabled="true"
      />
    )
  }

  // ---------------------------------------------------------------------------
  // Removal-status subline — Phase 5 addition
  // ---------------------------------------------------------------------------

  function renderRemovalSubline(): React.JSX.Element | null {
    if (removalStatus == null) return null

    switch (removalStatus) {
      case 'removing':
        return (
          <span className="text-label text-muted-foreground">
            {tR('rowStatus.removing')}
          </span>
        )
      case 'done': {
        let doneCopy: string
        if (removalNote === 'basic-group-ban-fallback') {
          doneCopy = tR('rowStatus.doneBasicFallback')
        } else if (severity === 'ban') {
          doneCopy = tR('rowStatus.doneBan')
        } else {
          doneCopy = tR('rowStatus.doneKick')
        }
        return (
          <span className="text-label text-muted-foreground">{doneCopy}</span>
        )
      }
      case 'already-gone':
        return (
          <span className="text-label text-muted-foreground">
            {tR('rowStatus.alreadyGone')}
          </span>
        )
      case 'failed': {
        const reasonCopy = errorCode
          ? tR(`rowError.${errorCode}`)
          : tR('rowError.UNKNOWN')
        return (
          <span className="text-label text-destructive inline-flex items-baseline gap-1">
            {reasonCopy}
            <button
              onClick={() => onRetryRemoval?.(dialog.id)}
              className="text-label text-primary underline-offset-2 hover:underline"
              aria-label={tG('retryRemovalAria', { title: dialog.title })}
            >
              {tR('retryRowLabel')}
            </button>
          </span>
        )
      }
      case 'skipped':
        return (
          <span className="text-label text-muted-foreground">
            {tR('rowStatus.skipped')}
          </span>
        )
      case 'queued':
        // No subline for queued rows
        return null
    }
  }

  // ---------------------------------------------------------------------------
  // Tag-status subline — parallel to renderRemovalSubline; tag has no per-group retry
  // ---------------------------------------------------------------------------

  function renderTagSubline(): React.JSX.Element | null {
    if (tagStatus == null) return null

    switch (tagStatus) {
      case 'tagging':
        return (
          <span className="text-label text-muted-foreground">{tT('rowStatus.tagging')}</span>
        )
      case 'done':
        return (
          <span className="text-label text-muted-foreground">{tT('rowStatus.done')}</span>
        )
      case 'skipped': {
        const sublineCopy =
          tagErrorCode === 'TAG_TARGET_IS_ADMIN'
            ? tT('rowStatus.skippedAdmin')
            : tagErrorCode === 'TAG_UNSUPPORTED_BASIC_GROUP'
              ? tT('rowStatus.skippedBasicGroup')
              : tT('rowStatus.skipped')
        return (
          <span className="text-label text-muted-foreground">{sublineCopy}</span>
        )
      }
      case 'failed': {
        // Cast to string to satisfy i18n union-type constraint (same approach as tR in removal)
        const errorCopy = tagErrorCode
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? tT(`rowError.${tagErrorCode}` as any)
          : tT('rowError.UNKNOWN')
        // NOTE: no retry button — tag has no per-group retry
        return (
          <span className="text-label text-destructive">{String(errorCopy)}</span>
        )
      }
      case 'queued':
        return null
    }
  }

  return (
    <div
      className={cn(
        'min-h-[56px] px-4 py-3 flex items-center gap-3 hover:bg-accent/10',
        !dialog.canAct && 'opacity-50'
      )}
    >
      {/* Checkbox area — left side (Phase 5 removal status renders first) */}
      {renderCheckboxSlot()}

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

        {/* Removal status subline — Phase 5 addition; renders before the grey-reason subline */}
        {renderRemovalSubline()}

        {/* Tag status subline — Phase 12 addition; renders only when tagStatus != null */}
        {renderTagSubline()}

        {/* Grey reason — canAct=false, not failed-verify (D-03) — only when no removal active */}
        {!isRemovalActive && !dialog.canAct && dialog.greyReason && dialog.greyReason !== 'verify-failed' && !isFailed && (
          <span className="text-label text-muted-foreground">
            {tG(`greyReason.${dialog.greyReason}`)}
          </span>
        )}

        {/* Failed-verify state (D-07) — destructive text + inline retry button */}
        {!isRemovalActive && isFailed && (
          <span className="text-label text-destructive inline-flex items-baseline gap-1">
            {tG('greyReason.verify-failed')}
            <button
              onClick={() => onRetry(dialog.id)}
              className="text-label text-primary underline-offset-2 hover:underline"
              aria-label={tG('retryScanAria', { title: dialog.title })}
            >
              {tG('retryScanLabel')}
            </button>
          </span>
        )}

        {/* Type badge — greyed rows only, not failed-verify (D-04) — only when no removal active */}
        {!isRemovalActive && !dialog.canAct && !isFailed && (
          <Badge variant="secondary" className="w-fit mt-0.5">
            {tG(`groupTypeLabel.${dialog.type}`)}
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
