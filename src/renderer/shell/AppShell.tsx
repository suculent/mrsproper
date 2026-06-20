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
import { TagResumeJobDialog } from '../removal/TagResumeJobDialog'
import { useSearchStore } from '../store/searchStore'
import { useRemovalStore } from '../store/removalStore'
import { useTagStore } from '../store/tagStore'
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

  // Phase 12: severity widened to action ('kick' | 'ban' | 'tag') — full wiring in Plan 04.
  // Minimal update here to keep ReviewScreen props in sync after interface rename.
  const [action, setAction] = useState<'kick' | 'ban' | 'tag'>('ban')

  useEffect(() => {
    severityClient.getSeverity().then(setAction).catch(() => {})
  }, [])

  const handleActionChange = useCallback((a: 'kick' | 'ban' | 'tag') => {
    setAction(a)
    // Only persist kick/ban to electron-store — 'tag' is not a severity
    if (a === 'kick' || a === 'ban') void severityClient.setSeverity(a)
  }, [])

  // ---------------------------------------------------------------------------
  // Auto-advance run→report when removal reaches a terminal state
  // ---------------------------------------------------------------------------

  const { state: removal, pendingJob } = useRemovalStore()
  const [resumeOpen, setResumeOpen] = useState(!!pendingJob)

  // Removal auto-advance run→report when removal reaches a terminal state (unchanged)
  useEffect(() => {
    if (
      stage === 'run' &&
      (removal.step === 'complete' || removal.step === 'stopped' || removal.step === 'hard-stopped')
    ) {
      setStage('report')
    }
  }, [removal.step, stage])

  // ---------------------------------------------------------------------------
  // Tag store subscription + tag auto-advance (gated on action === 'tag')
  // ---------------------------------------------------------------------------

  const { state: tag, pendingJob: pendingTagJob } = useTagStore()

  // Tag auto-advance run→report — CRITICAL: gate on action === 'tag' to prevent
  // cross-contamination with removal auto-advance (RESEARCH Pitfall 3)
  useEffect(() => {
    if (
      stage === 'run' &&
      action === 'tag' &&
      (tag.step === 'complete' || tag.step === 'stopped' || tag.step === 'hard-stopped')
    ) {
      setStage('report')
    }
  }, [tag.step, stage, action])

  // Derive tagResumeOpen reactively from store — NOT via useState (RESEARCH Pitfall 1:
  // useState would miss the initial value when pendingTagJob is set before first render)
  const tagResumeOpen = pendingTagJob !== null

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

      {/* Stage-conditional main layout.
          Review stage uses flex-col so ReviewScreen's w-full/max-w-2xl/mx-auto
          center as expected in a block-level context. Two-pane stages use flex-row
          (the Tailwind default) for side-by-side pane layout. */}
      <main className={`flex flex-1 overflow-hidden${stage === 'review' ? ' flex-col w-full overflow-y-auto' : ''}`}>
        {stage === 'review' ? (
          <ReviewScreen
            action={action}
            onActionChange={handleActionChange}
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
                activeAction={action}
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

      {/* TagResumeJobDialog — independent from removal dialog; mounts when pending tag job exists */}
      {pendingTagJob && (
        <TagResumeJobDialog
          open={tagResumeOpen}
          onOpenChange={() => {}}
          job={pendingTagJob}
          onResume={() => setStage('run')}
        />
      )}
    </div>
  )
}
