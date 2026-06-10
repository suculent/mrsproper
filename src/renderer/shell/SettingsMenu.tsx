// Settings menu — D-16: gear icon trigger (≥44px hit target), aria-label="Settings" + tooltip.
// Houses the Log out action (not on the identity display itself — D-16).

import React, { useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip'
import LogoutDialog from './LogoutDialog'

export default function SettingsMenu(): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogoutClick = (): void => {
    setMenuOpen(false)
    setDialogOpen(true)
  }

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Settings"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                // ≥44px hit target (D-16/UI-SPEC App shell layout)
                className="h-11 w-11"
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Settings
            </TooltipContent>
          </Tooltip>

          {/* Simple dropdown menu */}
          {menuOpen && (
            <>
              {/* Backdrop to close on outside click */}
              <div
                className="fixed inset-0 z-40"
                aria-hidden="true"
                onClick={() => setMenuOpen(false)}
              />
              <div
                role="menu"
                aria-label="Settings menu"
                className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border bg-popover shadow-md py-1"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogoutClick}
                  className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </TooltipProvider>

      <LogoutDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
