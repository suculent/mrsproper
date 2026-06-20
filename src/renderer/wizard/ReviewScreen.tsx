// ReviewScreen — SAF-01/02/03 gate: dry-run preview + identity + action selector + single confirmation.
// Replaces RemovalConfirmDialog in the Phase 6 wizard flow.
// Phase 12: Extended to 3-way Kick/Ban/Tag action picker with TagInput, tag confirmation block.
// Pattern: src/renderer/removal/RemovalConfirmDialog.tsx (exact analog per PATTERNS.md).
// Identity block: avatar + name + @username + numeric ID in .text-mono (NOT font-mono).
// computePlannedActions + computeActionableTagCount exported for unit testing (pure functions, no jsdom needed).

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import type { AdminDialogDTO } from '@shared/groupTypes'
import { removalActions } from '@renderer/store/removalStore'
import { tagActions } from '@renderer/store/tagStore'
import { useGroupsStore } from '@renderer/store/groupsStore'
import { useTargetStore } from '@renderer/store/targetStore'
import { validateTagInput, computeTagGroups } from './tagValidation'
import type { TagGroupAction } from './tagValidation'
import { TagInput } from './TagInput'

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

// Minimal translate-function type compatible with react-i18next's typed TFunction
// and the identity fallback used in tests (no react context needed).
type TranslateFn = (key: string, options?: Record<string, unknown>) => string

export function computePlannedActions(
  dialogs: AdminDialogDTO[],
  checkedIds: Set<string>,
  severity: 'kick' | 'ban',
  t: TranslateFn = (key) => key
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
      const groupBranch = isBasic ? 'basicGroup' : 'supergroup'
      const severityBranch = severity === 'ban' ? 'Ban' : 'Kick'
      return {
        dialog: d,
        mechanic,
        mechanicNote: t(`mechanicNote.${groupBranch}${severityBranch}`),
        warning,
      }
    })
}

// ---------------------------------------------------------------------------
// computeActionableTagCount — pure helper for tag review group count
// Returns the number of TagGroupActions where willBeSkipped is false.
// Exported for unit testing — no jsdom dependency.
// ---------------------------------------------------------------------------

export function computeActionableTagCount(tagGroupActions: TagGroupAction[]): number {
  return tagGroupActions.filter(g => !g.willBeSkipped).length
}

// ---------------------------------------------------------------------------
// ReviewScreen component props
// ---------------------------------------------------------------------------

interface ReviewScreenProps {
  action: 'kick' | 'ban' | 'tag'
  onActionChange(a: 'kick' | 'ban' | 'tag'): void
  onConfirm(): void
  onBack(): void
}

// ---------------------------------------------------------------------------
// ReviewScreen
// ---------------------------------------------------------------------------

export function ReviewScreen({
  action,
  onActionChange,
  onConfirm,
  onBack,
}: ReviewScreenProps): React.JSX.Element {
  const { t } = useTranslation('wizard')
  const { t: tR } = useTranslation('removal')
  const { t: tT } = useTranslation('tag')
  const { groups, checkedDialogIds } = useGroupsStore()
  const { target: targetState } = useTargetStore()

  const [isDispatching, setIsDispatching] = useState(false)

  // Tag local state
  const [tagValue, setTagValue] = useState('')
  const tagError = validateTagInput(tagValue)  // derived, not stored
  const tagInputRef = useRef<HTMLInputElement>(null)

  const headingRef = useRef<HTMLHeadingElement>(null)

  // Focus heading on stage entry for screen-reader stage announcement
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Reset tagValue when switching away from Tag (T-12-06 mitigation)
  useEffect(() => {
    if (action !== 'tag') setTagValue('')
  }, [action])

  // Focus the tag input when Tag is selected (accessibility — keyboard flow)
  useEffect(() => {
    if (action === 'tag') tagInputRef.current?.focus()
  }, [action])

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

  // Derive planned actions for kick/ban — cast t to the looser TranslateFn type
  const severity = action === 'tag' ? 'ban' : action  // fallback unused for tag path
  const plannedActions = computePlannedActions(dialogs, checkedDialogIds, severity, t as TranslateFn)
  const actionableCount = plannedActions.length

  // Derive tag group actions for the tag confirmation list
  const tagGroupActions = computeTagGroups(dialogs, checkedDialogIds, tT as TranslateFn)
  const actionableTagDialogIds = tagGroupActions.filter(g => !g.willBeSkipped).map(g => g.dialog)
  const actionableTagCount = computeActionableTagCount(tagGroupActions)

  // Count checked groups where canAct is false (no rights) — for kick/ban path
  const noRightsCount = [...checkedDialogIds].filter(id => {
    const d = dialogs.find(d => d.id === id)
    return d !== undefined && !d.canAct
  }).length

  // Count groups with the rejoin-cant-be-blocked warning — for kick/ban path
  const cantBlockCount = plannedActions.filter(p => p.warning === 'rejoin-cant-be-blocked').length

  // Avatar data
  const avatarSrc = bytesToDataUrl(targetAvatar)
  const avatarBg = getAvatarColor(targetId)
  const initials = getInitials(targetName)

  const handleConfirm = useCallback(async () => {
    setIsDispatching(true)
    try {
      if (action === 'tag') {
        await tagActions.startTag(tagValue.trim(), actionableTagDialogIds.map(d => d.id))
      } else {
        await removalActions.startRemoval(action, plannedActions.map(p => p.dialog.id))
      }
      onConfirm()
    } finally {
      setIsDispatching(false)
    }
  }, [action, tagValue, actionableTagDialogIds, plannedActions, onConfirm])

  // Determine confirm button disabled state
  const isConfirmDisabled =
    isDispatching ||
    (action === 'tag'
      ? (tagValue.trim() === '' || tagError !== null || actionableTagCount === 0)
      : actionableCount === 0)

  return (
    <section
      aria-labelledby="review-heading"
      className="w-full max-w-2xl mx-auto px-4 pt-8 flex flex-col gap-6"
    >
      {/* Title */}
      <h2
        id="review-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-heading font-semibold"
      >
        {action === 'tag' ? tT('tagReviewTitle') : t('reviewTitle')}
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
            <span>{t('idLine', { id: targetId })}</span>
          </span>
        </div>
      </div>

      {/* Tag string display block — shown above action picker when action=tag and tagValue non-empty */}
      {action === 'tag' && tagValue && (
        <div className="flex flex-col gap-1">
          <span className="text-label font-semibold">{tT('tagLabel')}</span>
          <span className="bg-secondary rounded-full px-2 py-0.5 text-mono text-label text-foreground w-fit">
            {tagValue}
          </span>
        </div>
      )}

      {/* Action picker — 3-way segmented radiogroup (Phase 12: extended from 2-way severity) */}
      <div className="flex flex-col gap-2">
        <span className="text-label font-semibold">{t('severityLabel')}</span>
        <div
          role="radiogroup"
          aria-label={t('actionGroupAria')}
          className="flex rounded-md border border-border overflow-hidden"
        >
          <Button
            role="radio"
            aria-checked={action === 'kick'}
            variant={action === 'kick' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none flex-1"
            onClick={() => onActionChange('kick')}
          >
            {t('severityKick')}
          </Button>
          <Button
            role="radio"
            aria-checked={action === 'ban'}
            variant={action === 'ban' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none flex-1 border-l border-border"
            onClick={() => onActionChange('ban')}
          >
            {t('severityBan')}
          </Button>
          <Button
            role="radio"
            aria-checked={action === 'tag'}
            variant={action === 'tag' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none flex-1 border-l border-border"
            onClick={() => onActionChange('tag')}
          >
            {tT('actionTag')}
          </Button>
        </div>

        {/* TagInput block — conditionally rendered when action=tag */}
        {action === 'tag' && (
          <TagInput
            value={tagValue}
            onChange={setTagValue}
            error={tagError}
            disabled={isDispatching}
            inputRef={tagInputRef}
          />
        )}

        {/* Consequence line — min-h reserves two lines of space so toggling
            actions never causes a layout shift even if the text wraps */}
        <p className="text-body text-muted-foreground min-h-[2.5rem]">
          {action !== 'tag'
            ? tR(`severityLine${action === 'ban' ? 'Ban' : 'Kick'}`, { count: actionableCount })
            : tT('tagConsequenceLine', { tag: tagValue, count: actionableTagCount })}
        </p>
      </div>

      {/* Totals line */}
      <div className="text-body">
        {action === 'tag' ? (
          actionableTagCount === 0 ? (
            <span className="text-muted-foreground">{tT('tagTotalsEmpty')}</span>
          ) : (
            <span className="font-semibold text-foreground">
              {tT('tagTotalsTagging', { count: actionableTagCount })}
            </span>
          )
        ) : (
          actionableCount === 0 ? (
            <span className="text-muted-foreground">{t('totalsEmpty')}</span>
          ) : (
            <span>
              <span className="font-semibold text-foreground">{t('totalsRemoving', { count: actionableCount })}</span>
              {noRightsCount > 0 && (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-muted-foreground">{t('totalsExcluded', { count: noRightsCount })}</span>
                </>
              )}
              {cantBlockCount > 0 && (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-muted-foreground">{t('totalsCantBlock', { count: cantBlockCount })}</span>
                </>
              )}
            </span>
          )
        )}
      </div>

      {/* Group list — tag path shows tagGroupActions; kick/ban shows plannedActions */}
      <ScrollArea className="max-h-[40vh] border border-border rounded-md">
        {action === 'tag' ? (
          <ul aria-label={t('tagGroupListAria')}>
            {tagGroupActions.map(({ dialog, mechanicNote }) => (
              <li
                key={dialog.id}
                className="px-4 py-2 border-b border-border last:border-b-0 flex flex-col gap-1"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-label font-semibold text-foreground truncate">{dialog.title}</span>
                  <span className="text-label text-muted-foreground shrink-0">
                    {dialog.memberCount != null ? t('memberCount', { count: dialog.memberCount }) : ''}
                  </span>
                </div>
                <span className="text-label text-muted-foreground">{mechanicNote}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul aria-label={t('groupListAria')}>
            {plannedActions.map(({ dialog, mechanicNote, warning }) => (
              <li
                key={dialog.id}
                className="px-4 py-2 border-b border-border last:border-b-0 flex flex-col gap-1"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-label font-semibold text-foreground truncate">{dialog.title}</span>
                  <span className="text-label text-muted-foreground shrink-0">
                    {dialog.memberCount != null ? t('memberCount', { count: dialog.memberCount }) : ''}
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
        )}
      </ScrollArea>

      {/* Footer: back + confirm */}
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack} disabled={isDispatching}>
          {t('editSelection')}
        </Button>

        <Button
          variant={action === 'tag' ? 'default' : 'destructive'}
          onClick={handleConfirm}
          disabled={isConfirmDisabled}
          aria-label={
            action === 'tag'
              ? tT('confirmAriaLabelTag', { name: targetName, count: actionableTagCount })
              : t(`confirmAriaLabel${action === 'ban' ? 'Ban' : 'Kick'}`, { name: targetName, count: actionableCount })
          }
        >
          {isDispatching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              {action === 'tag' ? tT('confirmDispatching') : tR('confirmDispatching')}
            </>
          ) : (
            action === 'tag'
              ? tT('confirmLabelTag', { name: targetName, count: actionableTagCount })
              : t(`confirmLabel${action === 'ban' ? 'Ban' : 'Kick'}`, { name: targetName, count: actionableCount })
          )}
        </Button>
      </div>
    </section>
  )
}
