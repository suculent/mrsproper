// Single group row — actionable, greyed (non-actionable), or failed-verify.
// Receives all data via props; does NOT import groupsStore directly (avoids tight coupling).
// Renders the complete row matching UI-SPEC §GroupRow Visual Specification.
// D-02: avatar + name + member count + checkbox
// D-03: grey-out reason always visible (no hover required)
// D-04: type badge on greyed rows only
// D-07: failed-verify shows destructive text + inline retry button
// Phase 5: removalStatus prop renders per-group removal status in checkbox slot + subline.

import React, { useState } from 'react'
import { Check, Loader2, AlertCircle, Minus, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { cn } from '@renderer/lib/utils'
import type { AdminDialogDTO, AddGreyReason, MembershipStatus } from '@shared/groupTypes'
import type { RmvErrorCode } from '@shared/removalTypes'
import type { TagErrorCode } from '@shared/tagTypes'
import type { AddErrorCode } from '@shared/addTypes'
import { formatMemberCount } from '@renderer/lib/format'
import { clipboardClient } from '../ipc/clipboardClient'
import { isActionableForMode, type GroupMode } from './modeRules'

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
  /** Active Remove/Tag/Add mode (CR-01) — drives actionability + checkbox aria-label. Defaults to 'remove' so existing callers (tests, etc.) stay byte-identical. */
  activeMode?: GroupMode
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
  activeMode = 'remove',
  removalStatus,
  removalNote,
  onRetryRemoval,
  errorCode,
  severity = 'ban',
  tagStatus,
  tagErrorCode,
  addStatus,
  addErrorCode,
  addLink,
  premiumWouldAllow,
  onRetryAdd,
}: GroupRowProps): React.JSX.Element {
  const { t: tG } = useTranslation('groups')
  const { t: tR } = useTranslation('removal')
  const { t: tT } = useTranslation('tag')
  const { t: tAdd } = useTranslation('add')

  const [justCopied, setJustCopied] = useState(false)

  // CR-01: single shared predicate — never a duplicated inline rule — so this row's
  // actionability can never silently drift from groupsStore's pre-check rebuild/GroupsPane's
  // partition loop (modeRules.ts).
  const isActionable = isActionableForMode(dialog, membershipStatus, activeMode)
  const isPending = membershipStatus === null || membershipStatus === 'pending'
  const isFailed = membershipStatus === 'failed'

  // 15-14: mode-aware "is this row greyed" flag — drives wrapper opacity + type badge.
  // For Add mode, reuses isActionable (already mode-aware via isActionableForMode) instead
  // of the Remove-only dialog.canAct flag, so a row that is actionable-but-not-kickable
  // (canAct=false, canAdd=true) no longer renders dimmed. For any other mode this is
  // byte-identical to the pre-fix expression, so Remove/Tag output never changes.
  const isGreyedVisual =
    activeMode === 'add' ? !isActionable && !isPending && !isFailed : !dialog.canAct

  // 15-14: mode-aware Add-mode grey-reason key. Membership status wins over the
  // enumeration-time addGreyReason because a row can be canAdd=true yet still a current
  // member — Add mode never considers a member row actionable regardless of rights.
  const addGreyReasonKey: AddGreyReason | 'already-member' | null =
    activeMode === 'add' && addStatus == null && !isPending && !isFailed
      ? membershipStatus === 'member'
        ? 'already-member'
        : dialog.addGreyReason
      : null

  const avatarUrl = dialog.avatar ? bytesToDataUrl(dialog.avatar) : null
  const initial = getInitials(dialog.title)
  const avatarBg = getAvatarColor(dialog.id)

  // When a removal, tag, or add run is active for this row, disable toggle interactions
  const isRemovalActive = removalStatus != null || tagStatus != null || addStatus != null

  function handleCopyLink(): void {
    void clipboardClient.writeClipboardText(addLink ?? '')
    setJustCopied(true)
    setTimeout(() => setJustCopied(false), 2000)
  }

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

    // 3. Existing isActionable branch — aria-label switches to the Add-mode copy (CR-01)
    if (isActionable) {
      return (
        <Checkbox
          checked={isChecked}
          onCheckedChange={() => onToggle(dialog.id)}
          aria-label={
            activeMode === 'add'
              ? tAdd('includeInAddAria', { title: dialog.title })
              : tG('includeInRemovalAria', { title: dialog.title })
          }
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

  // ---------------------------------------------------------------------------
  // Add-status subline — parallel to renderRemovalSubline/renderTagSubline (D-17/D-18)
  // ---------------------------------------------------------------------------

  function renderAddSubline(): React.JSX.Element | null {
    if (addStatus == null) return null

    switch (addStatus) {
      case 'adding':
        return (
          <span className="text-label text-muted-foreground">{tAdd('rowStatus.adding')}</span>
        )
      case 'done':
        return (
          <span className="text-label text-muted-foreground">{tAdd('rowStatus.done')}</span>
        )
      case 'already-member':
        return (
          <span className="text-label text-muted-foreground">{tAdd('rowStatus.alreadyMember')}</span>
        )
      case 'privacy-blocked':
        return (
          <>
            <span className="text-label text-muted-foreground inline-flex items-baseline gap-1">
              {tAdd('rowStatus.linkCreated')}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopyLink}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{tAdd('rowStatus.copyLink')}</span>
                {justCopied && <span className="ml-1" aria-hidden="true">{tAdd('rowStatus.linkCopied')}</span>}
              </Button>
            </span>
            {premiumWouldAllow === true && (
              <span className="text-label text-muted-foreground">
                {tAdd('rowStatus.premiumHint')}
              </span>
            )}
          </>
        )
      case 'failed': {
        const reasonCopy = addErrorCode
          ? tAdd(`rowError.${addErrorCode}`)
          : tAdd('rowError.UNKNOWN')
        return (
          <span className="text-label text-destructive inline-flex items-baseline gap-1">
            {reasonCopy}
            <button
              onClick={() => onRetryAdd?.(dialog.id)}
              className="text-label text-primary underline-offset-2 hover:underline"
              aria-label={tAdd('retryAddAria', { title: dialog.title })}
            >
              {tAdd('retryRowLabel')}
            </button>
          </span>
        )
      }
      case 'skipped':
        return (
          <span className="text-label text-muted-foreground">{tAdd('rowStatus.skipped')}</span>
        )
      case 'queued':
        // No subline for queued rows
        return null
    }
  }

  return (
    <div
      className={cn(
        'min-h-[56px] px-4 py-3 flex items-center gap-3 hover:bg-accent/10',
        isGreyedVisual && 'opacity-50'
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

        {/* Add status subline — Phase 15 addition; renders only when addStatus != null */}
        {renderAddSubline()}

        {/* Banned-but-actionable note (D-06) — Add mode, no run active, row stays interactive */}
        {/* CR-02: gated on activeMode === 'add' — canAdd is populated unconditionally by the
            scan, so without this guard a banned row being reviewed for Remove/Tag could show
            an Add-specific note. */}
        {activeMode === 'add' && addStatus == null && membershipStatus === 'banned' && dialog.canAdd && (
          <span className="text-label text-muted-foreground">
            {tAdd('rowNote.bannedWillUnban')}
          </span>
        )}

        {/* Grey reason — canAct=false, not failed-verify (D-03) — only when no removal active */}
        {/* 15-14: suppressed entirely in Add mode — the Remove reason is irrelevant to Add
            actionability and must never co-render with (or crowd out) the Add-mode reason. */}
        {activeMode !== 'add' && !isRemovalActive && !dialog.canAct && dialog.greyReason && dialog.greyReason !== 'verify-failed' && !isFailed && (
          <span className="text-label text-muted-foreground">
            {tG(`greyReason.${dialog.greyReason}`)}
          </span>
        )}

        {/* Add-mode grey reason — canAdd=false or already a member (D-08, data layer shipped
            Phase 13; 15-14 derives 'already-member' in the renderer and drops the old
            dialog.greyReason == null gate, which made this unreachable on every channel). */}
        {addGreyReasonKey != null && (
          <span className="text-label text-muted-foreground">
            {tG(`greyReason.${addGreyReasonKey}`)}
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
        {!isRemovalActive && !isFailed && isGreyedVisual && (
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
