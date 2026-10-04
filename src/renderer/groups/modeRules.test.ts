// Pure vitest tests for isActionableForMode — no jsdom needed (node env).
// Mirrors tagValidation.test.ts's pure-fn test idiom. Covers D-03/D-05's per-mode
// actionability rule, including the deliberate Add-mode pending-row asymmetry.

import { describe, it, expect } from 'vitest'
import { isActionableForMode } from './modeRules'
import type { AdminDialogDTO } from '@shared/groupTypes'

// ---------------------------------------------------------------------------
// Mock factory helper
// ---------------------------------------------------------------------------

function makeDialog(overrides: Partial<AdminDialogDTO>): AdminDialogDTO {
  return {
    id: '100',
    title: 'Test Group',
    avatar: null,
    memberCount: 10,
    type: 'supergroup',
    canAct: true,
    greyReason: null,
    canAdd: true,
    addGreyReason: null,
    canUnban: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Add mode
// ---------------------------------------------------------------------------

describe('isActionableForMode — add mode (D-05)', () => {
  it('true when canAdd is true and status is not-member', () => {
    const d = makeDialog({ canAdd: true })
    expect(isActionableForMode(d, 'not-member', 'add')).toBe(true)
  })

  it('true when canAdd is true and status is banned', () => {
    const d = makeDialog({ canAdd: true })
    expect(isActionableForMode(d, 'banned', 'add')).toBe(true)
  })

  it('false when canAdd is false, even if status is not-member', () => {
    const d = makeDialog({ canAdd: false })
    expect(isActionableForMode(d, 'not-member', 'add')).toBe(false)
  })

  it('false when canAdd is false, even if status is banned', () => {
    const d = makeDialog({ canAdd: false })
    expect(isActionableForMode(d, 'banned', 'add')).toBe(false)
  })

  it('false when status is member, regardless of canAdd', () => {
    const d = makeDialog({ canAdd: true })
    expect(isActionableForMode(d, 'member', 'add')).toBe(false)
  })

  it('false when status is null/pending — D-05 asymmetry: Add does NOT pre-check pending rows', () => {
    const d = makeDialog({ canAdd: true })
    expect(isActionableForMode(d, null, 'add')).toBe(false)
  })

  it('false when status is pending (scan-in-progress literal), even with canAdd true', () => {
    const d = makeDialog({ canAdd: true })
    expect(isActionableForMode(d, 'pending', 'add')).toBe(false)
  })

  it('false when status is failed', () => {
    const d = makeDialog({ canAdd: true })
    expect(isActionableForMode(d, 'failed', 'add')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Remove mode — identical to today's existing rule, unchanged
// ---------------------------------------------------------------------------

describe('isActionableForMode — remove mode (unchanged from today)', () => {
  it('true when canAct is true and status is member', () => {
    const d = makeDialog({ canAct: true })
    expect(isActionableForMode(d, 'member', 'remove')).toBe(true)
  })

  it('true when canAct is true and status is null (pending rows ARE actionable while scanning)', () => {
    const d = makeDialog({ canAct: true })
    expect(isActionableForMode(d, null, 'remove')).toBe(true)
  })

  it('false when canAct is false, even if status is member', () => {
    const d = makeDialog({ canAct: false })
    expect(isActionableForMode(d, 'member', 'remove')).toBe(false)
  })

  it('false when status is not-member', () => {
    const d = makeDialog({ canAct: true })
    expect(isActionableForMode(d, 'not-member', 'remove')).toBe(false)
  })

  it('false when status is banned', () => {
    const d = makeDialog({ canAct: true })
    expect(isActionableForMode(d, 'banned', 'remove')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tag mode — identical rule to remove mode (tag targets members exactly like removal)
// ---------------------------------------------------------------------------

describe('isActionableForMode — tag mode (identical to remove)', () => {
  it('true when canAct is true and status is member', () => {
    const d = makeDialog({ canAct: true })
    expect(isActionableForMode(d, 'member', 'tag')).toBe(true)
  })

  it('true when canAct is true and status is null (pending)', () => {
    const d = makeDialog({ canAct: true })
    expect(isActionableForMode(d, null, 'tag')).toBe(true)
  })

  it('false when canAct is false', () => {
    const d = makeDialog({ canAct: false })
    expect(isActionableForMode(d, 'member', 'tag')).toBe(false)
  })

  it('produces the exact same result as remove mode for any given dialog/status pair', () => {
    const d = makeDialog({ canAct: true })
    const statuses = ['member', 'not-member', 'banned', 'failed', 'pending', null] as const
    for (const status of statuses) {
      expect(isActionableForMode(d, status, 'tag')).toBe(isActionableForMode(d, status, 'remove'))
    }
  })
})
