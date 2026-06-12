// Real assertions for SAF-02 stage transition rules.
// Replaced it.todo() stubs from Wave 0 — getNextStage extracted in Plan 04 Task 3.

import { describe, it, expect } from 'vitest'
import { getNextStage } from './wizardStage'

describe('getNextStage — forward gate enforcement (SAF-02)', () => {
  it('target stage: does not advance to groups until targetStore.target.step === confirmed (SAF-02 gate)', () => {
    expect(getNextStage('target', 'TARGET_CONFIRMED')).toBe('groups')
  })

  it('groups stage: does not start removal without navigating through review (SAF-02 gate)', () => {
    expect(getNextStage('groups', 'NAVIGATE_TO_REVIEW')).toBe('review')
  })

  it('review stage is mandatory before confirm button is reachable (SAF-02 gate)', () => {
    expect(getNextStage('review', 'CONFIRM')).toBe('run')
  })
})

describe('getNextStage — auto-advance on terminal removal step (SAF-02)', () => {
  it('run stage: auto-advances to report when removal.step is complete (SAF-02)', () => {
    expect(getNextStage('run', 'REMOVAL_COMPLETE')).toBe('report')
  })

  it('run stage: auto-advances to report when removal.step is stopped (SAF-02)', () => {
    expect(getNextStage('run', 'REMOVAL_STOPPED')).toBe('report')
  })
})

describe('getNextStage — back navigation and reset', () => {
  it('review stage: BACK returns to groups', () => {
    expect(getNextStage('review', 'BACK')).toBe('groups')
  })

  it('report stage: RESET returns to target', () => {
    expect(getNextStage('report', 'RESET')).toBe('target')
  })
})

describe('getNextStage — invalid event guard (SAF-02)', () => {
  it('does NOT advance to review from target (skipping groups is not a valid event)', () => {
    // TARGET_CONFIRMED from target → groups (not review)
    expect(getNextStage('target', 'NAVIGATE_TO_REVIEW')).toBe('target')
  })

  it('returns current stage unchanged for any invalid event in that stage', () => {
    expect(getNextStage('groups', 'CONFIRM')).toBe('groups')
    expect(getNextStage('target', 'RESET')).toBe('target')
    expect(getNextStage('run', 'TARGET_CONFIRMED')).toBe('run')
    expect(getNextStage('report', 'NAVIGATE_TO_REVIEW')).toBe('report')
  })
})
