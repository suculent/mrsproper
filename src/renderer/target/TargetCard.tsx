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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@renderer/components/ui/tooltip'
import { useTargetStore, targetActions } from '@renderer/store/targetStore'
import { useRemovalStore } from '@renderer/store/removalStore'
import { cn } from '@renderer/lib/utils'

// ---------------------------------------------------------------------------
// Avatar color palette (RESEARCH Pattern, UI-SPEC — 7 hues for deterministic color)
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

function getAvatarColor(numericId: string): string {
  return AVATAR_COLORS[Number(BigInt(numericId) % 7n)]
}

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
// getInitials — first letter of first and last word, uppercase
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ---------------------------------------------------------------------------
// TargetCard component
// ---------------------------------------------------------------------------

export function TargetCard(): React.JSX.Element | null {
  const { target } = useTargetStore()
  const { state: removal } = useRemovalStore()

  // T-05-07-B: disable Change target while removal is running or stopping
  const isRemovalRunning = removal.step === 'running' || removal.step === 'stopping'

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
              <AvatarImage src={avatarUrl} alt={`${t.name}'s avatar`} />
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
                Target confirmed
              </span>
            ) : (
              <span className="text-label text-muted-foreground">
                Is this the right person?
              </span>
            )}

            {/* Name line + badges (D-13, D-18) */}
            <div className="flex flex-row flex-wrap gap-2 items-center min-w-0">
              <span className="text-heading font-semibold text-foreground truncate">
                {t.name}
              </span>
              {/* Deleted badge (D-18) */}
              {t.deleted && (
                <Badge variant="destructive">Deleted account</Badge>
              )}
              {/* Bot badge (D-18) */}
              {t.bot && (
                <Badge variant="secondary">Bot</Badge>
              )}
              {/* Premium badge */}
              {t.premium && (
                <Badge variant="secondary">
                  <Star className="h-3 w-3 mr-1" aria-hidden="true" />
                  Premium
                </Badge>
              )}
            </div>

            {/* Deleted account supporting line (D-18) */}
            {t.deleted && (
              <p className="text-body text-muted-foreground">
                This account was deleted. You can still remove what&rsquo;s left of it from your groups.
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
                  ID {t.id}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Telegram&rsquo;s permanent ID for this account — this is what Mrs. Proper acts on
              </TooltipContent>
            </Tooltip>

            {/* Bio (D-13, max 3 lines) */}
            {t.bio && (
              <p className="text-body text-muted-foreground line-clamp-3">
                {t.bio}
              </p>
            )}

            {/* Last-seen (D-13) */}
            {t.lastSeen && (
              <span className="text-label text-muted-foreground">
                {t.lastSeen}
              </span>
            )}
          </div>
        </div>

        {/* No-photo notice (D-12) — when avatar is null */}
        {!hasAvatar && (
          <Alert variant="default">
            <ImageOff className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              <span className="text-label font-semibold block mb-1">No profile photo</span>
              <span className="text-body">
                Their photo is hidden by privacy settings or was never set. Verify this person
                using the details below before confirming.
              </span>
            </AlertDescription>
          </Alert>
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
                  if (!isRemovalRunning) {
                    void targetActions.resetTarget()
                  }
                }}
                type="button"
                disabled={isRemovalRunning}
                aria-disabled={isRemovalRunning}
              >
                Change target
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isRemovalRunning
                ? 'Stop the removal first'
                : 'Clears this person and any group selections'}
            </TooltipContent>
          </Tooltip>

          {/* Confirm CTA (D-11) — only shown in resolved (pre-confirm) state */}
          {!isConfirmed && (
            <Button
              type="button"
              onClick={() => void targetActions.confirmTarget()}
            >
              Yes, this is the person
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

export default TargetCard
