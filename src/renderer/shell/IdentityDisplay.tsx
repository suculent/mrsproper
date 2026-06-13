// Identity display — D-11: 48px avatar with accent ring, name + green "Signed in" check, @username.
// When avatar bytes are null, shows initials on a slate circle (no broken image).
// Lives at the top of the authenticated shell.

import React, { useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import type { Identity } from '@shared/authTypes'
import { cn } from '@renderer/lib/utils'

interface IdentityDisplayProps {
  identity: Identity
}

// Convert Uint8Array bytes to a data URL for the avatar image
function bytesToDataUrl(bytes: Uint8Array | null): string | null {
  if (!bytes || bytes.length === 0) return null
  // Convert Uint8Array to base64
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  const b64 = btoa(binary)
  return `data:image/jpeg;base64,${b64}`
}

// Get initials from a display name (first letter of first and last word)
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export default function IdentityDisplay({ identity }: IdentityDisplayProps): React.JSX.Element {
  const { t } = useTranslation('shell')
  const avatarUrl = useMemo(() => bytesToDataUrl(identity.avatar), [identity.avatar])
  const initials = useMemo(() => getInitials(identity.name), [identity.name])

  return (
    <div className="flex items-center gap-3">
      {/* 48px avatar with accent ring */}
      <Avatar
        className={cn(
          'h-12 w-12 shrink-0',
          'ring-2 ring-primary ring-offset-2 ring-offset-background'
        )}
      >
        {avatarUrl ? (
          <AvatarImage
            src={avatarUrl}
            alt={t('avatarAlt', { name: identity.name })}
          />
        ) : null}
        {/* Initials fallback — shown when avatar is null (no broken image ring) */}
        <AvatarFallback className="bg-secondary text-secondary-foreground text-sm font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Two-line identity stack */}
      <div className="flex flex-col min-w-0">
        {/* Line 1: display name + green "Signed in" check */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-heading text-foreground truncate">
            {identity.name}
          </span>
          <CheckCircle2
            className="h-4 w-4 text-[#16A34A] shrink-0"
            aria-label={t('signedInAria')}
          />
          <span className="text-label text-[#16A34A] shrink-0 hidden sm:inline">
            {t('signedInAria')}
          </span>
        </div>
        {/* Line 2: @username in monospace, muted */}
        {identity.username && (
          <span className="text-label text-mono text-muted-foreground truncate">
            @{identity.username}
          </span>
        )}
      </div>
    </div>
  )
}
