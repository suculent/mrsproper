// App shell — D-09/D-10/D-11/D-12/D-16/UI-SPEC App-shell layout.
// Slim top header band (secondary surface) + app name + IdentityDisplay + SettingsMenu.
// Two-pane authenticated layout: left pane (TargetInput + TargetCard), right pane (GroupsPane).

import React from 'react'
import type { Identity } from '@shared/authTypes'
import IdentityDisplay from './IdentityDisplay'
import SettingsMenu from './SettingsMenu'
import TargetInput from '../target/TargetInput'
import TargetCard from '../target/TargetCard'
import { GroupsPane } from '../groups/GroupsPane'

interface AppShellProps {
  identity: Identity
}

export default function AppShell({ identity }: AppShellProps): React.JSX.Element {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Slim top header band — secondary surface (UI-SPEC App shell layout) */}
      <header className="bg-secondary border-b border-border px-4 py-2 flex items-center justify-between shrink-0">
        {/* Left side: logged-in user identity */}
        <IdentityDisplay identity={identity} />

        {/* Right side: settings wheel */}
        <SettingsMenu />
      </header>

      {/* Two-pane main layout (D-09/D-10) — authenticated only */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left pane: target input + identity card (flex-[1] = 1/3 width) */}
        <div className="flex flex-col flex-[1] min-w-0 border-r border-border overflow-y-auto p-4">
          <TargetInput />
          <div className="mt-4">
            <TargetCard />
          </div>
        </div>

        {/* Right pane: groups pane (flex-[2] = 2/3 width) */}
        <div className="flex flex-col flex-[2] min-w-0 overflow-hidden">
          <GroupsPane />
        </div>
      </main>
    </div>
  )
}
