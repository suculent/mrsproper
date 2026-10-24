// Identity card for resolved target (D-11, D-12, D-13, D-14, D-18).
// Renders nothing in idle/resolving states — TargetInput handles those.
// Shows avatar (real or colored-initials fallback), identity details, badges,
// no-photo notice (when avatar is null), and the confirm gate.
// Confirm gate: "Yes, this is the person" → confirmed; "Change target" → reset.

import React, { useMemo } from 'react'
import { CheckCircle2, ImageOff, Ghost, Star } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { Badge } from '@renderer/components/ui/badge'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Label } from '@renderer/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@renderer/components/ui/tooltip'
import { useTargetStore, targetActions } from '@renderer/store/targetStore'
import { useRemovalStore } from '@renderer/store/removalStore'
import { useTagStore } from '@renderer/store/tagStore'
import { useAddStore } from '@renderer/store/addStore'
import { isAnyRunActive } from '@renderer/store/runActivity'
import { cn } from '@renderer/lib/utils'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { LastSeenDTO } from '@shared/targetTypes'
import i18n from '@renderer/i18n'
import { getAvatarColor, getInitials } from './avatarFallback'

// ---------------------------------------------------------------------------
// bytesToDataUrl — convert Uint8Array to a data: URL for <img>
// Duplicated from IdentityDisplay.tsx to avoid a shared-util dependency.
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
// renderLastSeen — localize a structured LastSeenDTO into a display string
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderLastSeen(dto: LastSeenDTO, tTr: TFunction<any, any>): string {
  switch (dto.kind) {
    case 'online':
      return tTr('statusOnline')
    case 'date': {
      const locale = i18n.language === 'cs' ? 'cs-CZ' : 'en-US'
      const date = new Date(dto.iso).toLocaleDateString(locale)
      return tTr('lastSeenDate', { date })
    }
    case 'recently':
      return tTr('lastSeenRecently')
    case 'longAgo':
      return tTr('lastSeenLongAgo')
  }
}

// ---------------------------------------------------------------------------
// TargetCard component
// ---------------------------------------------------------------------------

interface TargetCardProps {
  mode?: 'remove' | 'tag' | 'add'
  onTargetConfirmed?: () => void
  onNavigateToTarget?: () => void
}

export function TargetCard(props: TargetCardProps = {}): React.JSX.Element | null {
  const mode = props.mode ?? 'remove'
  const { t: tTr } = useTranslation('target')
  const { t: tA } = useTranslation('add')
  const { target, addToContactsChecked, contactAddFailed } = useTargetStore()
  const { state: removal } = useRemovalStore()
  const { state: tag } = useTagStore()
  const { state: add } = useAddStore()

  // T-05-07-B / D-15: disable Change target while any Remove, Tag or Add run is active
  const isRunActive = isAnyRunActive(removal, tag, add)

  // Rules of Hooks: ALL hooks must run unconditionally on every render — this
  // component is mounted in idle/resolving states too (StubbedWorkflowRegions),
  // so an early return before the memos would change the hook count between
  // renders and crash React. Derive a nullable binding instead.
  const t =
    target.step === 'resolved' || target.step === 'confirmed' ? target.target : null
  const avatarBytes = t?.avatar ?? null
  const name = t?.name ?? ''

  const avatarUrl = useMemo(() => bytesToDataUrl(avatarBytes), [avatarBytes])
  const initials = useMemo(() => (name ? getInitials(name) : ''), [name])

  // Only render in resolved or confirmed states
  if (!t) return null

  const isConfirmed = target.step === 'confirmed'
  const avatarBg = getAvatarColor(t.id)
  const hasAvatar = Boolean(avatarUrl)

  return (
    <TooltipProvider>
      <div className="max-w-[560px] rounded-lg border bg-card p-6 flex flex-col gap-4">
        {/* Top section: avatar + identity stack */}
        <div className="flex flex-row gap-6 items-start">
          {/* 64px avatar (D-12) */}
          <Avatar
            className={cn(
              'h-16 w-16 shrink-0',
              isConfirmed && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            )}
          >
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={tTr('avatarAlt', { name: t.name })} />
            ) : null}
            <AvatarFallback
              style={{ backgroundColor: avatarBg }}
              className="text-white font-semibold text-base"
            >
              {t.deleted && !t.name ? (
                <Ghost className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              ) : (
                initials
              )}
            </AvatarFallback>
          </Avatar>

          {/* Identity text stack */}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            {/* Kicker / confirmed indicator */}
            {isConfirmed ? (
              <span className="flex items-center gap-1 text-label font-semibold text-[#16A34A]">
                <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" aria-hidden="true" />
                {tTr('targetConfirmed')}
              </span>
            ) : (
              <span className="text-label text-muted-foreground">
                {tTr('isThisRightPerson')}
              </span>
            )}

            {/* Name line + badges (D-13, D-18) */}
            <div className="flex flex-row flex-wrap gap-2 items-center min-w-0">
              <span className="text-heading font-semibold text-foreground truncate">
                {t.name}
              </span>
              {/* Deleted badge (D-18) */}
              {t.deleted && (
                <Badge variant="destructive">{tTr('deletedBadge')}</Badge>
              )}
              {/* Bot badge (D-18) */}
              {t.bot && (
                <Badge variant="secondary">{tTr('botBadge')}</Badge>
              )}
              {/* Premium badge */}
              {t.premium && (
                <Badge variant="secondary">
                  <Star className="h-3 w-3 mr-1" aria-hidden="true" />
                  {tTr('premiumBadge')}
                </Badge>
              )}
            </div>

            {/* Deleted account supporting line (D-18) */}
            {t.deleted && (
              <p className="text-body text-muted-foreground">
                {tTr('deletedNote')}
              </p>
            )}

            {/* @username (D-13) */}
            {t.username && (
              <span className="text-label font-mono text-muted-foreground">
                @{t.username}
              </span>
            )}

            {/* ID line with tooltip (D-13) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-label font-mono text-muted-foreground cursor-default w-fit">
                  {tTr('idLine', { id: t.id })}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {tTr('idTooltip')}
              </TooltipContent>
            </Tooltip>

            {/* Bio (D-13, max 3 lines) */}
            {t.bio && (
              <p className="text-body text-muted-foreground line-clamp-3">
                {t.bio}
              </p>
            )}

            {/* Last-seen (D-13) — render structured DTO via i18n */}
            {t.lastSeen && (
              <span className="text-label text-muted-foreground">
                {renderLastSeen(t.lastSeen, tTr)}
              </span>
            )}
          </div>
        </div>

        {/* No-photo notice (D-12) — when avatar is null */}
        {!hasAvatar && (
          <Alert variant="default">
            <ImageOff className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              <span className="text-label font-semibold block mb-1">{tTr('noPhotoTitle')}</span>
              <span className="text-body">
                {tTr('noPhotoBody')}
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* Add to contacts checkbox + failure notice (D-08, D-09, D-10) — Add mode only,
            both resolved and confirmed states */}
        {mode === 'add' && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-row gap-2 items-center">
              <Checkbox
                id="add-to-contacts"
                checked={addToContactsChecked}
                onCheckedChange={(checked) => targetActions.toggleAddToContacts(checked === true)}
              />
              <Label htmlFor="add-to-contacts">{tA('contactsCheckboxLabel')}</Label>
            </div>
            {contactAddFailed && (
              <span className="text-label text-muted-foreground">
                {tA('contactsFailedNotice')}
              </span>
            )}
          </div>
        )}

        {/* Footer row (D-11, D-14) */}
        <div className="mt-2 flex flex-row justify-between items-center">
          {/* Change target button (D-14) — present in both resolved and confirmed states */}
          {/* T-05-07-B: disabled while removal.step === 'running'|'stopping' */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-label text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (!isRunActive) {
                    void targetActions.resetTarget()
                    props.onNavigateToTarget?.()
                  }
                }}
                type="button"
                disabled={isRunActive}
                aria-disabled={isRunActive}
              >
                {tTr('changeTarget')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isRunActive
                ? tTr('stopRunFirst')
                : tTr('clearTargetTooltip')}
            </TooltipContent>
          </Tooltip>

          {/* Confirm CTA (D-11) — only shown in resolved (pre-confirm) state */}
          {!isConfirmed && (
            <Button
              type="button"
              onClick={async () => {
                await targetActions.confirmTarget()
                if (mode === 'add') await targetActions.maybeAddToContacts()
                props.onTargetConfirmed?.()
              }}
            >
              {tTr('confirmPerson')}
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

export default TargetCard
