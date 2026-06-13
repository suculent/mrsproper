// Settings menu — D-16: gear icon trigger (≥44px hit target), aria-label="Settings" + tooltip.
// Houses the Log out action (not on the identity display itself — D-16).
// Phase 8: Extended with Language (English/Česky) and Theme (Day/Night) sections.

import React, { useState } from 'react'
import { Check, Moon, Settings, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip'
import LogoutDialog from './LogoutDialog'

export default function SettingsMenu(): React.JSX.Element {
  const { t, i18n } = useTranslation('shell')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  )

  const handleLogoutClick = (): void => {
    setMenuOpen(false)
    setDialogOpen(true)
  }

  const handleLanguageSelect = async (lang: 'en' | 'cs'): Promise<void> => {
    setMenuOpen(false)
    await i18n.changeLanguage(lang)
    // WR-02: persistence failure must not surface as an unhandled rejection.
    // The in-session change above still applies; only the next launch reverts.
    try {
      await window.mrsproper.setLanguage(lang)
    } catch (err) {
      console.error('Failed to persist language preference', err)
    }
  }

  const handleThemeSelect = async (theme: 'light' | 'dark'): Promise<void> => {
    setMenuOpen(false)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    setActiveTheme(theme)
    // WR-02: persistence failure must not surface as an unhandled rejection.
    // The in-session change above still applies; only the next launch reverts.
    try {
      await window.mrsproper.setTheme(theme)
    } catch (err) {
      console.error('Failed to persist theme preference', err)
    }
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
                aria-label={t('settingsLabel')}
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
              {t('settingsLabel')}
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
                aria-label={t('settingsMenuAriaLabel')}
                className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-md border bg-popover shadow-md py-1"
              >
                {/* ── Language section ── */}
                <div
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-sm font-semibold text-muted-foreground"
                >
                  {t('languageHeader')}
                </div>

                {/* English — self-named, never translated */}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={i18n.language === 'en'}
                  onClick={() => void handleLanguageSelect('en')}
                  className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-secondary transition-colors"
                >
                  English
                  {i18n.language === 'en' ? (
                    <Check className="h-4 w-4 text-foreground" aria-hidden="true" />
                  ) : (
                    <span className="w-4" aria-hidden="true" />
                  )}
                </button>

                {/* Česky — self-named, never translated */}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={i18n.language === 'cs'}
                  onClick={() => void handleLanguageSelect('cs')}
                  className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-secondary transition-colors"
                >
                  Česky
                  {i18n.language === 'cs' ? (
                    <Check className="h-4 w-4 text-foreground" aria-hidden="true" />
                  ) : (
                    <span className="w-4" aria-hidden="true" />
                  )}
                </button>

                <div className="border-t border-border my-1" role="separator" />

                {/* ── Theme section ── */}
                <div
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-sm font-semibold text-muted-foreground"
                >
                  {t('themeHeader')}
                </div>

                {/* Day theme */}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeTheme === 'light'}
                  onClick={() => void handleThemeSelect('light')}
                  className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-secondary transition-colors"
                >
                  <span className="flex items-center">
                    <Sun className="h-4 w-4 text-muted-foreground mr-2" aria-hidden="true" />
                    {t('themeDay')}
                  </span>
                  {activeTheme === 'light' ? (
                    <Check className="h-4 w-4 text-foreground" aria-hidden="true" />
                  ) : (
                    <span className="w-4" aria-hidden="true" />
                  )}
                </button>

                {/* Night theme */}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeTheme === 'dark'}
                  onClick={() => void handleThemeSelect('dark')}
                  className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-secondary transition-colors"
                >
                  <span className="flex items-center">
                    <Moon className="h-4 w-4 text-muted-foreground mr-2" aria-hidden="true" />
                    {t('themeNight')}
                  </span>
                  {activeTheme === 'dark' ? (
                    <Check className="h-4 w-4 text-foreground" aria-hidden="true" />
                  ) : (
                    <span className="w-4" aria-hidden="true" />
                  )}
                </button>

                <div className="border-t border-border my-1" role="separator" />

                {/* ── Log out ── */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogoutClick}
                  className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  {t('logOut')}
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
