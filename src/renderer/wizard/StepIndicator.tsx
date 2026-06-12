// Non-interactive five-stage wizard step indicator strip.
// Renders orientation only — navigation happens via explicit buttons in each stage.
// Pattern: src/renderer/shell/IdentityDisplay.tsx (role-match, slim strip below header).
// UI-SPEC §Step indicator strip: px-4 py-2 border-b, aria-current="step" on current stage.

import React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { wizardCopy } from './wizardCopy'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WizardStage = 'target' | 'groups' | 'review' | 'run' | 'report'

const STAGES: WizardStage[] = ['target', 'groups', 'review', 'run', 'report']

interface StepIndicatorProps {
  currentStage: WizardStage
}

// ---------------------------------------------------------------------------
// StepIndicator
// ---------------------------------------------------------------------------

export function StepIndicator({ currentStage }: StepIndicatorProps): React.JSX.Element {
  const currentIndex = STAGES.indexOf(currentStage)

  return (
    <nav
      aria-label={wizardCopy.stepIndicatorAria}
      className="px-4 py-2 border-b border-border bg-background shrink-0"
    >
      <ol className="flex items-center gap-1">
        {STAGES.map((stage, i) => {
          const isCurrent = stage === currentStage
          const isCompleted = i < currentIndex
          return (
            <React.Fragment key={stage}>
              <li>
                <span
                  className={cn(
                    'text-label',
                    isCurrent && 'text-foreground font-semibold',
                    isCompleted && 'text-muted-foreground',
                    !isCurrent && !isCompleted && 'text-muted-foreground/60'
                  )}
                  {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
                >
                  {wizardCopy.stageLabel[stage]}
                </span>
              </li>
              {i < STAGES.length - 1 && (
                <li aria-hidden="true">
                  <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                </li>
              )}
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
