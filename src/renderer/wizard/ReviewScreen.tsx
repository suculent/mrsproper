// ReviewScreen — SAF-01/02/03 gate: dry-run preview + identity + severity selector + single confirmation.
// Replaces RemovalConfirmDialog in the Phase 6 wizard flow.
// Pattern: src/renderer/removal/RemovalConfirmDialog.tsx (exact analog per PATTERNS.md).
// Identity block: avatar + name + @username + numeric ID in .text-mono (NOT font-mono).
// computePlannedActions exported for unit testing (pure function, no jsdom needed).

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import type { AdminDialogDTO } from '@shared/groupTypes'
import { removalActions } from '@renderer/store/removalStore'
import { useGroupsStore } from '@renderer/store/groupsStore'
import { useTargetStore } from '@renderer/store/targetStore'
import { removalCopy } from '../removal/removalCopy'
import { wizardCopy } from './wizardCopy'

// ---------------------------------------------------------------------------
// Avatar color palette — duplicated from RemovalConfirmDialog.tsx per PATTERNS.md
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
  // CR-03: guard against empty seed — BigInt('') throws SyntaxError in V8
  if (!seed) return AVATAR_COLORS[0]
  return AVATAR_COLORS[Number(BigInt(seed) % 7n)]
}

function bytesToDataUrl(bytes: Uint8Array | null): string | null {
  if (!bytes || bytes.length === 0) return null
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return `data:image/jpeg;base64,${btoa(binary)}`
}

function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}

// ---------------------------------------------------------------------------
// PlannedGroupAction — exported type for unit testing and AppShell wiring
// ---------------------------------------------------------------------------

export type PlannedGroupAction = {
  dialog: AdminDialogDTO
  mechanic: 'editBanned' | 'restrict-then-unban' | 'deleteChatUser'
  mechanicNote: string
  warning: 'rejoin-cant-be-blocked' | null
}

// ---------------------------------------------------------------------------
// computePlannedActions — pure function (SAF-03 mechanic derivation oracle)
// Exported for unit testing — no jsdom dependency.
// ---------------------------------------------------------------------------

export function computePlannedActions(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  severity: 'kick' | 'ban'
): PlannedGroupAction[] {
  return [...checkedIds]
    .map(id => dialogs.find(d => d.id === id))
    .filter((d): d is AdminDialogDTO => d !== undefined && d.canAct)
    .map(d => {
      const isBasic = d.type === 'basic-group'
      const mechanic: PlannedGroupAction['mechanic'] = isBasic
        ? 'deleteChatUser'
        : severity === 'ban' ? 'editBanned' : 'restrict-then-unban'
      const warning: PlannedGroupAction['warning'] = isBasic && severity === 'ban'
        ? 'rejoin-cant-be-blocked'
        : null
      return {
        dialog: d,
        mechanic,
        mechanicNote: wizardCopy.mechanicNote(d.type, severity),
        warning,
      }
    })
}

// ---------------------------------------------------------------------------
// ReviewScreen component props
// ---------------------------------------------------------------------------

interface ReviewScreenProps {
  severity: 'kick' | 'ban'
  onSeverityChange(s: 'kick' | 'ban'): void
  onConfirm(): void
  onBack(): void
}

// ---------------------------------------------------------------------------
// ReviewScreen
// ---------------------------------------------------------------------------

export function ReviewScreen({
  severity,
  onSeverityChange,
  onConfirm,
  onBack,
}: ReviewScreenProps): React.JSX.Element {
  const { groups, checkedDialogIds } = useGroupsStore()
  const { target: targetState } = useTargetStore()

  const [isDispatching, setIsDispatching] = useState(false)

  const headingRef = useRef<HTMLHeadingElement>(null)

  // Focus heading on stage entry for screen-reader stage announcement
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Derive target identity data
  const targetName =
    targetState.step === 'confirmed' ? targetState.target.name : ''
  const targetId =
    targetState.step === 'confirmed' ? targetState.target.id : ''
  const targetUsername =
    targetState.step === 'confirmed' ? (targetState.target.username ?? null) : null
  const targetAvatar =
    targetState.step === 'confirmed' ? (targetState.target.avatar ?? null) : null

  // Derive dialogs list
  const dialogs: AdminDialogDTO[] =
    groups.step === 'loaded' ? groups.dialogs : []

  // Derive planned actions
  const plannedActions = computePlannedActions(dialogs, checkedDialogIds, severity)
  const actionableCount = plannedActions.length

  // Count checked groups where canAct is false (no rights)
  const noRightsCount = [...checkedDialogIds].filter(id => {
    const d = dialogs.find(d => d.id === id)
    return d !== undefined && !d.canAct
  }).length

  // Count groups with the rejoin-cant-be-blocked warning
  const cantBlockCount = plannedActions.filter(p => p.warning === 'rejoin-cant-be-blocked').length

  // Avatar data
  const avatarSrc = bytesToDataUrl(targetAvatar)
  const avatarBg = getAvatarColor(targetId)
  const initials = getInitials(targetName)

  const handleConfirm = useCallback(async () => {
    setIsDispatching(true)
    try {
      await removalActions.startRemoval(severity, plannedActions.map(p => p.dialog.id))
      onConfirm()
    } finally {
      setIsDispatching(false)
    }
  }, [severity, plannedActions, onConfirm])

  return (
    <section
      aria-labelledby="review-heading"
      className="max-w-2xl mx-auto px-4 pt-8 flex flex-col gap-6"
    >
      {/* Title */}
      <h2
        id="review-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-heading font-semibold"
      >
        {wizardCopy.reviewTitle}
      </h2>

      {/* Identity block: avatar + name + @username/ID */}
      <div className="flex items-center gap-2">
        <Avatar className="h-9 w-9 shrink-0">
          {avatarSrc ? <AvatarImage src={avatarSrc} alt={targetName} /> : null}
          <AvatarFallback style={{ backgroundColor: avatarBg }} className="text-white text-sm font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-label font-semibold truncate">{targetName}</span>
          <span className="text-mono text-label text-muted-foreground truncate">
            {targetUsername ? (
              <>
                <span>@{targetUsername}</span>
                <span className="mx-1">·</span>
              </>
            ) : null}
            <span>ID {targetId}</span>
          </span>
        </div>
      </div>

      {/* Severity segmented control */}
      <div className="flex flex-col gap-2">
        <span className="text-label font-semibold">{wizardCopy.severityLabel}</span>
        <div
          role="radiogroup"
          aria-label={wizardCopy.severityGroupAria}
          className="flex rounded-md border border-border overflow-hidden"
        >
          <Button
            role="radio"
            aria-checked={severity === 'kick'}
            variant={severity === 'kick' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none flex-1"
            onClick={() => onSeverityChange('kick')}
          >
            {wizardCopy.severityKick}
          </Button>
          <Button
            role="radio"
            aria-checked={severity === 'ban'}
            variant={severity === 'ban' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none flex-1 border-l border-border"
            onClick={() => onSeverityChange('ban')}
          >
            {wizardCopy.severityBan}
          </Button>
        </div>

        {/* Consequence line */}
        <p className="text-body text-muted-foreground">
          {removalCopy.severityLine(severity, actionableCount)}
        </p>
      </div>

      {/* Totals line */}
      <div className="text-body">
        {actionableCount === 0 ? (
          <span className="text-muted-foreground">{wizardCopy.totalsEmpty}</span>
        ) : (
          <span>
            <span className="font-semibold text-foreground">{wizardCopy.totalsRemoving(actionableCount)}</span>
            {noRightsCount > 0 && (
              <>
                <span className="text-muted-foreground"> · </span>
                <span className="text-muted-foreground">{wizardCopy.totalsExcluded(noRightsCount)}</span>
              </>
            )}
            {cantBlockCount > 0 && (
              <>
                <span className="text-muted-foreground"> · </span>
                <span className="text-muted-foreground">{wizardCopy.totalsCantBlock(cantBlockCount)}</span>
              </>
            )}
          </span>
        )}
      </div>

      {/* Group list — only checked + actionable groups */}
      <ScrollArea className="max-h-[40vh] border border-border rounded-md">
        <ul aria-label={wizardCopy.groupListAria}>
          {plannedActions.map(({ dialog, mechanicNote, warning }) => (
            <li
              key={dialog.id}
              className="px-4 py-2 border-b border-border last:border-b-0 flex flex-col gap-1"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-label font-semibold text-foreground truncate">{dialog.title}</span>
                <span className="text-label text-muted-foreground shrink-0">
                  {dialog.memberCount != null ? wizardCopy.memberCount(dialog.memberCount) : ''}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {warning && (
                  <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                )}
                <span className="text-label text-muted-foreground">{mechanicNote}</span>
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>

      {/* Footer: back + confirm */}
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack} disabled={isDispatching}>
          {wizardCopy.editSelection}
        </Button>

        <Button
          variant="destructive"
          onClick={handleConfirm}
          disabled={isDispatching || actionableCount === 0}
          aria-label={wizardCopy.confirmAriaLabel(severity, targetName, actionableCount)}
        >
          {isDispatching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              {removalCopy.confirmDispatching}
            </>
          ) : (
            wizardCopy.confirmLabel(severity, targetName, actionableCount)
          )}
        </Button>
      </div>
    </section>
  )
}
