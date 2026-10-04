// ReviewScreen — SAF-01/02/03 gate: dry-run preview + identity + action selector + single confirmation.
// Replaces RemovalConfirmDialog in the Phase 6 wizard flow.
// Phase 12: Extended to 3-way Kick/Ban/Tag action picker with TagInput, tag confirmation block.
// Pattern: src/renderer/removal/RemovalConfirmDialog.tsx (exact analog per PATTERNS.md).
// Identity block: avatar + name + @username + numeric ID in .text-mono (NOT font-mono).
// computePlannedActions + computeActionableTagCount exported for unit testing (pure functions, no jsdom needed).

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '@renderer/i18n'
import { Button } from '@renderer/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import { removalActions } from '@renderer/store/removalStore'
import { tagActions } from '@renderer/store/tagStore'
import { addActions } from '@renderer/store/addStore'
import { useGroupsStore } from '@renderer/store/groupsStore'
import { useTargetStore, targetActions } from '@renderer/store/targetStore'
import { validateTagInput, computeTagGroups } from './tagValidation'
import type { TagGroupAction } from './tagValidation'
import { TagInput } from './TagInput'
import { computeAddGroups } from './addValidation'
import { DmTemplateEditor } from './DmTemplateEditor'
import { templateClient } from '../ipc/templateClient'
import { renderTemplate, DEFAULT_TEMPLATE_EN, DEFAULT_TEMPLATE_CS } from '@shared/dmTemplate'

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
  /** Read-only — D-01 moved the Remove/Tag/Add picker to GroupsPane's ModeSwitch. */
  mode?: 'remove' | 'tag' | 'add'
  /** Kick/Ban severity, only rendered/consumed when mode === 'remove'. */
  severity?: 'kick' | 'ban'
  onSeverityChange?(s: 'kick' | 'ban'): void
  onConfirm(): void
  onBack(): void
}

// ---------------------------------------------------------------------------
// ReviewScreen
// ---------------------------------------------------------------------------

export function ReviewScreen(props: ReviewScreenProps): React.JSX.Element {
  const { onConfirm, onBack } = props
  const mode = props.mode ?? 'remove'
  const severity = props.severity ?? 'ban'
  const onSeverityChange = props.onSeverityChange ?? (() => {})

  const { t } = useTranslation('wizard')
  const { t: tR } = useTranslation('removal')
  const { t: tT } = useTranslation('tag')
  const { t: tA } = useTranslation('add')
  const { groups, checkedDialogIds, scan } = useGroupsStore()
  const { target: targetState } = useTargetStore()

  const [isDispatching, setIsDispatching] = useState(false)

  // Tag local state
  const [tagValue, setTagValue] = useState('')
  const tagError = validateTagInput(tagValue)  // derived, not stored
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Add local state — the persisted/default DM template (D-11/D-13)
  const [currentTemplate, setCurrentTemplate] = useState('')

  const headingRef = useRef<HTMLHeadingElement>(null)

  // Focus heading on stage entry for screen-reader stage announcement
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  // Reset tagValue when switching away from Tag (T-12-06 mitigation)
  useEffect(() => {
    if (mode !== 'tag') setTagValue('')
  }, [mode])

  // Focus the tag input when Tag is selected (accessibility — keyboard flow)
  useEffect(() => {
    if (mode === 'tag') tagInputRef.current?.focus()
  }, [mode])

  // Fetch the persisted DM template on entering Add mode, falling back to the
  // language-appropriate default when none is saved yet (D-11/D-13).
  useEffect(() => {
    if (mode !== 'add') return
    let cancelled = false
    const defaultTemplate = i18n.language === 'cs' ? DEFAULT_TEMPLATE_CS : DEFAULT_TEMPLATE_EN
    templateClient
      .getDmTemplate()
      .then((saved) => {
        if (cancelled) return
        setCurrentTemplate(saved !== null ? saved : defaultTemplate)
      })
      .catch(() => {
        if (!cancelled) setCurrentTemplate(defaultTemplate)
      })
    return () => {
      cancelled = true
    }
  }, [mode])

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

  // Derive membership status by dialog id from the scan snapshot (for computeAddGroups'
  // ban-lifted-first note, D-06) — available once the scan has started.
  const membershipByDialogId = new Map<string, MembershipStatus>()
  if (scan.step === 'scanning' || scan.step === 'complete') {
    for (const r of scan.results) membershipByDialogId.set(r.dialogId, r.status)
  }

  // Derive add group actions for the Add review list (D-14)
  const addGroupActions = computeAddGroups(dialogs, checkedDialogIds, membershipByDialogId, tA as TranslateFn)
  const actionableAddCount = addGroupActions.length

  // Count checked groups where canAdd is false (no invite rights) — for Add path
  const excludedAddCount = [...checkedDialogIds].filter(id => {
    const d = dialogs.find(d => d.id === id)
    return d !== undefined && !d.canAdd
  }).length

  // D-16: a deleted or bot target disables the Add confirm button with an explanation.
  const isTargetInvalidForAdd =
    mode === 'add' &&
    targetState.step === 'confirmed' &&
    (targetState.target.deleted === true || targetState.target.bot === true)

  // Avatar data
  const avatarSrc = bytesToDataUrl(targetAvatar)
  const avatarBg = getAvatarColor(targetId)
  const initials = getInitials(targetName)

  // D-13: the preview must render byte-identically to what AddExecutor actually sends.
  const dmPreviewPlaceholderLine = tA('dmPreviewPlaceholderLine')
  const renderedDmPreview = renderTemplate(currentTemplate, {
    name: targetName,
    links: dmPreviewPlaceholderLine,
  })

  const handleConfirm = useCallback(async () => {
    setIsDispatching(true)
    try {
      if (mode === 'tag') {
        await tagActions.startTag(tagValue.trim(), actionableTagDialogIds.map(d => d.id))
      } else if (mode === 'add') {
        // D-15: startAdd(dialogIds) only — no identity, access hash or resume flag.
        await addActions.startAdd(addGroupActions.map(g => g.dialog.id))
        // D-09: idempotent — a no-op if the checkbox trigger on TargetCard already fired.
        await targetActions.maybeAddToContacts()
      } else {
        await removalActions.startRemoval(severity, plannedActions.map(p => p.dialog.id))
      }
      onConfirm()
    } finally {
      setIsDispatching(false)
    }
  }, [mode, severity, tagValue, actionableTagDialogIds, addGroupActions, plannedActions, onConfirm])

  // Determine confirm button disabled state
  const isConfirmDisabled =
    isDispatching ||
    (mode === 'tag'
      ? (tagValue.trim() === '' || tagError !== null || actionableTagCount === 0)
      : mode === 'add'
        ? (actionableAddCount === 0 || isTargetInvalidForAdd)
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
        {mode === 'tag' ? tT('tagReviewTitle') : mode === 'add' ? tA('reviewTitle') : t('reviewTitle')}
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

      {/* Tag string display block — shown above the severity/tag/add block when mode=tag and tagValue non-empty */}
      {mode === 'tag' && tagValue && (
        <div className="flex flex-col gap-1">
          <span className="text-label font-semibold">{tT('tagLabel')}</span>
          <span className="bg-secondary rounded-full px-2 py-0.5 text-mono text-label text-foreground w-fit">
            {tagValue}
          </span>
        </div>
      )}

      {/* Mode-gated action block: Kick/Ban toggle (remove), tag input (tag), nothing extra (add) */}
      <div className="flex flex-col gap-2">
        {mode === 'remove' && (
          <>
            <span className="text-label font-semibold">{t('severityLabel')}</span>
            <div
              role="radiogroup"
              aria-label={t('actionGroupAria')}
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
                {t('severityKick')}
              </Button>
              <Button
                role="radio"
                aria-checked={severity === 'ban'}
                variant={severity === 'ban' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none flex-1 border-l border-border"
                onClick={() => onSeverityChange('ban')}
              >
                {t('severityBan')}
              </Button>
            </div>
          </>
        )}

        {/* TagInput block — conditionally rendered when mode=tag */}
        {mode === 'tag' && (
          <TagInput
            value={tagValue}
            onChange={setTagValue}
            error={tagError}
            disabled={isDispatching}
            inputRef={tagInputRef}
          />
        )}

        {/* Consequence line — min-h reserves two lines of space so toggling
            modes never causes a layout shift even if the text wraps */}
        <p className="text-body text-muted-foreground min-h-[2.5rem]">
          {mode === 'tag'
            ? tT('tagConsequenceLine', { tag: tagValue, count: actionableTagCount })
            : mode === 'add'
              ? tA('consequenceLine', { name: targetName, count: actionableAddCount })
              : tR(`severityLine${severity === 'ban' ? 'Ban' : 'Kick'}`, { count: actionableCount })}
        </p>
      </div>

      {/* Totals line */}
      <div className="text-body">
        {mode === 'tag' ? (
          actionableTagCount === 0 ? (
            <span className="text-muted-foreground">{tT('tagTotalsEmpty')}</span>
          ) : (
            <span className="font-semibold text-foreground">
              {tT('tagTotalsTagging', { count: actionableTagCount })}
            </span>
          )
        ) : mode === 'add' ? (
          actionableAddCount === 0 ? (
            <span className="text-muted-foreground">{tA('totalsEmpty')}</span>
          ) : (
            <span>
              <span className="font-semibold text-foreground">{tA('totalsAdding', { count: actionableAddCount })}</span>
              {excludedAddCount > 0 && (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-muted-foreground">{tA('totalsExcluded', { count: excludedAddCount })}</span>
                </>
              )}
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

      {/* Group list — tag path shows tagGroupActions; add path shows addGroupActions; remove shows plannedActions */}
      <ScrollArea className="max-h-[40vh] border border-border rounded-md">
        {mode === 'tag' ? (
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
        ) : mode === 'add' ? (
          <ul aria-label={tA('groupListAria', { name: targetName })}>
            {addGroupActions.map(({ dialog, mechanicNote }) => (
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

      {/* DM section (D-11/D-12/D-13) — Add mode only, between the group list and the footer */}
      {mode === 'add' && (
        <div className="flex flex-col gap-2">
          <span className="text-label font-semibold">{tA('dmSectionTitle', { name: targetName })}</span>
          <div className="rounded-md border border-border bg-secondary p-4 text-body whitespace-pre-wrap">
            {(() => {
              const idx = renderedDmPreview.indexOf(dmPreviewPlaceholderLine)
              if (idx === -1) return renderedDmPreview
              return (
                <>
                  {renderedDmPreview.slice(0, idx)}
                  <em className="italic text-muted-foreground">{dmPreviewPlaceholderLine}</em>
                  {renderedDmPreview.slice(idx + dmPreviewPlaceholderLine.length)}
                </>
              )
            })()}
          </div>
          <span className="text-label text-muted-foreground">{tA('dmCaption')}</span>
          <DmTemplateEditor
            value={currentTemplate}
            onSave={(next) => {
              setCurrentTemplate(next)
              void templateClient.setDmTemplate(next)
            }}
            onReset={() => {
              const def = i18n.language === 'cs' ? DEFAULT_TEMPLATE_CS : DEFAULT_TEMPLATE_EN
              setCurrentTemplate(def)
              void templateClient.setDmTemplate(def)
            }}
          />
        </div>
      )}

      {/* Footer: back + confirm */}
      <div className="flex justify-between items-start">
        <Button variant="outline" onClick={onBack} disabled={isDispatching}>
          {t('editSelection')}
        </Button>

        <div className="flex flex-col items-end gap-1">
          <Button
            variant={mode === 'remove' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            aria-label={
              mode === 'tag'
                ? tT('confirmAriaLabelTag', { name: targetName, count: actionableTagCount })
                : mode === 'add'
                  ? tA('confirmAriaLabel', { name: targetName, count: actionableAddCount })
                  : t(`confirmAriaLabel${severity === 'ban' ? 'Ban' : 'Kick'}`, { name: targetName, count: actionableCount })
            }
          >
            {isDispatching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {mode === 'tag' ? tT('confirmDispatching') : mode === 'add' ? tA('confirmDispatching') : tR('confirmDispatching')}
              </>
            ) : (
              mode === 'tag'
                ? tT('confirmLabelTag', { name: targetName, count: actionableTagCount })
                : mode === 'add'
                  ? tA('confirmLabel', { name: targetName, count: actionableAddCount })
                  : t(`confirmLabel${severity === 'ban' ? 'Ban' : 'Kick'}`, { name: targetName, count: actionableCount })
            )}
          </Button>
          {isTargetInvalidForAdd && (
            <p className="text-label text-destructive">{tA('confirmDisabledInvalidTarget')}</p>
          )}
        </div>
      </div>
    </section>
  )
}
