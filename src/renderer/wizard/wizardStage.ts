// Pure stage transition function for the Phase 6 wizard (SAF-02).
// No React import, no side effects. Imported by AppShell for documentation
// of valid transitions; AppShell's explicit setStage() calls remain authoritative
// (per RESEARCH Pitfall 2 — stage is never fully derived from store state).

import type { WizardStage } from './StepIndicator'

// ---------------------------------------------------------------------------
// WizardEvent — all valid navigation events in the wizard
// ---------------------------------------------------------------------------

export type WizardEvent =
  | 'TARGET_CONFIRMED'
  | 'NAVIGATE_TO_REVIEW'
  | 'CHANGE_TARGET'
  | 'CONFIRM'
  | 'BACK'
  | 'REMOVAL_COMPLETE'
  | 'REMOVAL_STOPPED'
  | 'RESET'

// ---------------------------------------------------------------------------
// getNextStage — pure lookup table; invalid (stage, event) pairs return stage unchanged
// ---------------------------------------------------------------------------

export function getNextStage(stage: WizardStage, event: WizardEvent): WizardStage {
  switch (stage) {
    case 'target':
      if (event === 'TARGET_CONFIRMED') return 'groups'
      return stage

    case 'groups':
      if (event === 'NAVIGATE_TO_REVIEW') return 'review'
      if (event === 'CHANGE_TARGET') return 'target'
      return stage

    case 'review':
      if (event === 'CONFIRM') return 'run'
      if (event === 'BACK') return 'groups'
      return stage

    case 'run':
      if (event === 'REMOVAL_COMPLETE') return 'report'
      if (event === 'REMOVAL_STOPPED') return 'report'
      return stage

    case 'report':
      if (event === 'RESET') return 'target'
      return stage

    default:
      return stage
  }
}
