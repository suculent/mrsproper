// App shell — D-10/D-11/D-16/UI-SPEC App-shell layout.
// Slim top header band (secondary surface) + app name + IdentityDisplay + SettingsMenu.
// Main content area with stubbed workflow regions.

import React from 'react'
import type { Identity } from '@shared/authTypes'
import IdentityDisplay from './IdentityDisplay'
import SettingsMenu from './SettingsMenu'
import StubbedWorkflowRegions from './StubbedWorkflowRegions'

interface AppShellProps {
  identity: Identity
}

export default function AppShell({ identity }: AppShellProps): React.JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Slim top header band — secondary surface (UI-SPEC App shell layout) */}
      <header className="bg-secondary border-b border-border px-4 py-2 flex items-center justify-between shrink-0">
        {/* App name — Display size */}
        <span className="text-display font-semibold text-foreground">MrProper</span>

        {/* Right side: identity + settings */}
        <div className="flex items-center gap-3">
          <IdentityDisplay identity={identity} />
          <SettingsMenu />
        </div>
      </header>

      {/* Main content area — stubbed workflow regions */}
      <main className="flex-1 overflow-auto">
        <StubbedWorkflowRegions />
      </main>
    </div>
  )
}
