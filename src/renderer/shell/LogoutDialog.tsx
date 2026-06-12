// Logout confirm dialog — D-15/D-17/UI-SPEC Confirm dialog pattern.
// shadcn Dialog, max-width 400px.
// Cancel (autofocus, neutral) + Log out (destructive).
// When serverRevoked is false after logout, shows red-tinted non-blocking warning banner (D-17).

import React, { useState, useCallback } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { authActions } from '@renderer/store/authStore'

interface LogoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function LogoutDialog({ open, onOpenChange }: LogoutDialogProps): React.JSX.Element {
  const { t } = useTranslation('shell')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [serverRevoked, setServerRevoked] = useState<boolean | null>(null)

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true)
    try {
      const result = await authActions.logout()
      setServerRevoked(result.serverRevoked)

      if (result.serverRevoked) {
        // Clean logout — close dialog, auth store already reset to idle
        onOpenChange(false)
        setServerRevoked(null)
      }
      // If !serverRevoked, keep dialog open to show warning, then auto-close
      // (local session already wiped — user is signed out on this device)
      if (!result.serverRevoked) {
        // Close after a beat so the warning is visible; user can also close manually
        setTimeout(() => {
          onOpenChange(false)
          setServerRevoked(null)
        }, 8000)
      }
    } finally {
      setIsLoggingOut(false)
    }
  }, [onOpenChange])

  const handleClose = useCallback(() => {
    if (!isLoggingOut) {
      onOpenChange(false)
      setServerRevoked(null)
    }
  }, [isLoggingOut, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[400px]"
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-description"
      >
        <DialogHeader>
          <DialogTitle id="logout-dialog-title" className="text-heading">
            {t('logOutTitle')}
          </DialogTitle>
          <DialogDescription id="logout-dialog-description" className="text-body">
            {t('logOutDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Server-revocation-failed warning banner (D-17) */}
        {serverRevoked === false && (
          <Alert
            variant="destructive"
            className="bg-destructive/10 border-destructive/30"
            role="alert"
            aria-live="assertive"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="text-body">
              {t('logOutPartialAlert')}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
          {/* Cancel — autofocus, neutral (D-15) */}
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoggingOut}
            autoFocus
          >
            {t('cancel')}
          </Button>

          {/* Log out — destructive (D-15) */}
          <Button
            variant="destructive"
            onClick={handleLogout}
            disabled={isLoggingOut || serverRevoked !== null}
            aria-label={t('confirmLogOut')}
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t('loggingOut')}
              </>
            ) : (
              t('logOutButton')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
