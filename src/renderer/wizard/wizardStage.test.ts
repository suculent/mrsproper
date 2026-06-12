// Wave 0 stub — real assertions for getNextStage() will replace these todos in Plan 04 Task 3,
// which extracts stage transitions into a pure wizardStage.ts module.

import { describe, it } from 'vitest'

describe('getNextStage — forward gate enforcement (SAF-02)', () => {
  it.todo('target stage: does not advance to groups until targetStore.target.step === confirmed (SAF-02 gate)')
  it.todo('groups stage: does not start removal without navigating through review (SAF-02 gate)')
  it.todo('review stage is mandatory before confirm button is reachable (SAF-02 gate)')
})

describe('getNextStage — auto-advance on terminal removal step (SAF-02)', () => {
  it.todo('run stage: auto-advances to report when removal.step is complete (SAF-02)')
  it.todo('run stage: auto-advances to report when removal.step is stopped (SAF-02)')
})
