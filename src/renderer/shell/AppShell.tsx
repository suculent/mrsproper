// App shell — D-09/D-10/D-11/D-12/D-16/UI-SPEC App-shell layout.
// Slim top header band (secondary surface) + app name + IdentityDisplay + SettingsMenu.
// Phase 6: wizard stage machine (target→groups→review→run→report), StepIndicator strip,
// ReviewScreen stage, severity rehydrated from electron-store, ResumeJobDialog resume→run.

import React, { useState, useEffect, useCallback } from 'react'
import type { Identity } from '@shared/authTypes'
import IdentityDisplay from './IdentityDisplay'
import SettingsMenu from './SettingsMenu'
import TargetInput from '../target/TargetInput'
import TargetCard from '../target/TargetCard'
import { CandidateList } from '../target/CandidateList'
import { GroupsPane } from '../groups/GroupsPane'
import { StepIndicator } from '../wizard/StepIndicator'
import type { WizardStage } from '../wizard/StepIndicator'
import { ReviewScreen } from '../wizard/ReviewScreen'
import { ResumeJobDialog } from '../removal/ResumeJobDialog'
import { useSearchStore } from '../store/searchStore'
import { useRemovalStore } from '../store/removalStore'
import { severityClient } from '../ipc/severityClient'

interface AppShellProps {
  identity: Identity
}

export default function AppShell({ identity }: AppShellProps): React.JSX.Element {
  const search = useSearchStore()

  // ---------------------------------------------------------------------------
  // Wizard stage state (explicit — never fully derived from store state, per RESEARCH Pitfall 2)
  // ---------------------------------------------------------------------------

  const [stage, setStage] = useState<WizardStage>('target')

  // ---------------------------------------------------------------------------
  // Severity state — rehydrated from electron-store on mount
  // ---------------------------------------------------------------------------

  const [severity, setSeverity] = useState<'kick' | 'ban'>('ban')

  useEffect(() => {
    severityClient.getSeverity().then(setSeverity).catch(() => {})
  }, [])

  const handleSeverityChange = useCallback((s: 'kick' | 'ban') => {
    setSeverity(s)
    void severityClient.setSeverity(s)
  }, [])

  // ---------------------------------------------------------------------------
  // Auto-advance run→report when removal reaches a terminal state
  // ---------------------------------------------------------------------------

  const { state: removal, pendingJob } = useRemovalStore()
  const [resumeOpen, setResumeOpen] = useState(!!pendingJob)

  useEffect(() => {
    if (
      stage === 'run' &&
      (removal.step === 'complete' || removal.step === 'stopped' || removal.step === 'hard-stopped')
    ) {
      setStage('report')
    }
  }, [removal.step, stage])

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Slim top header band — secondary surface (UI-SPEC App shell layout) */}
      <header className="bg-secondary border-b border-border px-4 py-2 flex items-center justify-between shrink-0">
        {/* Left side: logged-in user identity */}
        <IdentityDisplay identity={identity} />

        {/* Right side: settings wheel */}
        <SettingsMenu />
      </header>

      {/* Step indicator strip — below header, above main */}
      <StepIndicator currentStage={stage} />

      {/* Stage-conditional main layout */}
      <main className="flex flex-1 overflow-hidden">
        {stage === 'review' ? (
          <ReviewScreen
            severity={severity}
            onSeverityChange={handleSeverityChange}
            onConfirm={() => setStage('run')}
            onBack={() => setStage('groups')}
          />
        ) : (
          <>
            {/* Left pane: target input + candidate list or identity card (flex-[1] = 1/3 width) */}
            <div className="flex flex-col flex-[1] min-w-0 border-r border-border overflow-y-auto p-4">
              <TargetInput />
              <div className="mt-4">
                {/* CandidateList renders when a name search is active or has results */}
                {search.step !== 'idle' && <CandidateList />}
                {/* TargetCard renders when a target has been resolved/confirmed */}
                <TargetCard
                  onTargetConfirmed={() => setStage('groups')}
                  onNavigateToTarget={() => setStage('target')}
                />
              </div>
            </div>

            {/* Right pane: groups pane (flex-[2] = 2/3 width) */}
            <div className="flex flex-col flex-[2] min-w-0 overflow-hidden">
              <GroupsPane
                onNavigateToReview={() => setStage('review')}
                onNavigateToTarget={() => setStage('target')}
                stage={stage}
              />
            </div>
          </>
        )}
      </main>

      {/* ResumeJobDialog — on launch when incomplete job present; onResume advances to Run stage */}
      {pendingJob && (
        <ResumeJobDialog
          open={resumeOpen}
          onOpenChange={setResumeOpen}
          job={pendingJob}
          onResume={() => setStage('run')}
        />
      )}
    </div>
  )
}
