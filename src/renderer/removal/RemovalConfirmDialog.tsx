// Destructive-confirm gate for removal runs (PROJECT safety constraint).
// LogoutDialog analog: Dialog sm:max-w-[400px]; identity block (avatar + name + @username/ID mono)
// + group count + severity consequence line; neutral button autofocus; destructive primary.
// D-15: neutral button autofocus (safe default). D-17: dialog pattern.
// T-05-06-A: this dialog is additive UI safety — IPC security gates are in the main-process handler.

import React, { useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@renderer/components/ui/avatar'
import { removalActions } from '@renderer/store/removalStore'
import { removalCopy } from './removalCopy'

// ---------------------------------------------------------------------------
// Avatar color palette — duplicated from GroupRow.tsx — avoids premature abstraction per PATTERNS.md
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
// bytesToDataUrl — duplicated from GroupRow.tsx — avoids premature abstraction per PATTERNS.md
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
// getInitials — duplicated from GroupRow.tsx — avoids premature abstraction per PATTERNS.md
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}

// ---------------------------------------------------------------------------
// RemovalConfirmDialog
// ---------------------------------------------------------------------------

interface RemovalConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  severity: 'kick' | 'ban'
  targetId: string
  targetName: string
  targetUsername: string | null
  targetAvatar: Uint8Array | null
  dialogIds: string[]
}

export function RemovalConfirmDialog({
  open,
  onOpenChange,
  severity,
  targetId,
  targetName,
  targetUsername,
  targetAvatar,
  dialogIds,
}: RemovalConfirmDialogProps): React.JSX.Element {
  const [isDispatching, setIsDispatching] = useState(false)

  const handleConfirm = useCallback(async () => {
    setIsDispatching(true)
    try {
      await removalActions.startRemoval(severity, dialogIds)
      onOpenChange(false)
    } finally {
      setIsDispatching(false)
    }
  }, [severity, dialogIds, onOpenChange])

  const handleClose = useCallback(() => {
    if (!isDispatching) {
      onOpenChange(false)
    }
  }, [isDispatching, onOpenChange])

  const avatarSrc = bytesToDataUrl(targetAvatar)
  const avatarBg = getAvatarColor(targetId)
  const initials = getInitials(targetName)
  const n = dialogIds.length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[400px]"
        aria-labelledby="removal-confirm-title"
        aria-describedby="removal-confirm-desc"
      >
        <DialogHeader>
          <DialogTitle id="removal-confirm-title" className="text-heading">
            {removalCopy.confirmTitle(severity, targetName, n)}
          </DialogTitle>
        </DialogHeader>

        {/* Identity block: avatar + name + @username/ID mono */}
        <div className="flex items-center gap-2">
          <Avatar className="h-9 w-9 shrink-0">
            {avatarSrc ? (
              <AvatarImage src={avatarSrc} alt={targetName} />
            ) : null}
            <AvatarFallback style={{ backgroundColor: avatarBg }} className="text-white text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-label font-semibold truncate">{targetName}</span>
            <span className="text-label text-muted-foreground font-mono truncate">
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

        <DialogDescription id="removal-confirm-desc" className="text-body text-muted-foreground">
          {removalCopy.severityLine(severity, n)}
        </DialogDescription>

        <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
          {/* Neutral — autofocus (D-15) */}
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isDispatching}
            autoFocus
          >
            {removalCopy.confirmNeutral}
          </Button>

          {/* Destructive */}
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDispatching}
            aria-label={`Confirm ban from ${n} groups`}
          >
            {isDispatching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {removalCopy.confirmDispatching}
              </>
            ) : (
              removalCopy.confirmDestructive(severity, n)
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
