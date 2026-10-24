// Read-only target card for the relaunch-resume job view (17 D-01).
// Renders only main-pushed add.targetName/targetId: no avatar image, no Telegram call.

import React from 'react'
import { User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback } from '@renderer/components/ui/avatar'
import { getAvatarColor, getInitials } from './avatarFallback'

interface JobTargetCardProps {
  targetId: string
  targetName: string
}

function safeAvatarColor(id: string): string {
  try {
    return getAvatarColor(id)
  } catch {
    return getAvatarColor('0')
  }
}

export function JobTargetCard({ targetId, targetName }: JobTargetCardProps): React.JSX.Element {
  const { t: tA } = useTranslation('add')
  const { t: tTr } = useTranslation('target')
  const blank = targetName.trim() === ''

  return (
    <section
      aria-label={tA('jobCard.aria', { name: targetName })}
      className="max-w-[560px] rounded-lg border bg-card p-6 flex flex-col gap-4"
    >
      <div className="flex flex-row gap-6 items-start">
        <Avatar className="h-16 w-16 shrink-0">
          <AvatarFallback
            style={{ backgroundColor: safeAvatarColor(targetId) }}
            className="text-white font-semibold text-base"
          >
            {blank ? (
              <User className="h-6 w-6 text-white" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">{getInitials(targetName)}</span>
            )}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="text-label text-muted-foreground">{tA('jobCard.kicker')}</span>
          <span className="text-heading font-semibold text-foreground truncate">{targetName}</span>
          <span className="text-label font-normal font-mono text-muted-foreground">
            {tTr('idLine', { id: targetId })}
          </span>
          <p className="text-body text-muted-foreground">{tA('jobCard.note')}</p>
        </div>
      </div>
    </section>
  )
}

export default JobTargetCard
