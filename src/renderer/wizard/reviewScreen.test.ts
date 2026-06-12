// Tests for computePlannedActions pure function — no jsdom needed (node env).
// SAF-01/02/03 mechanic derivation oracle: all six GroupType × severity branches + edge cases.

import { describe, it, expect } from 'vitest'
import { computePlannedActions } from './ReviewScreen'
import type { AdminDialogDTO } from '@shared/groupTypes'

// ---------------------------------------------------------------------------
// Mock factory helpers
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
    ...overrides,
  }
}

const supergroupActable = makeDialog({ id: '1', type: 'supergroup', canAct: true })
const channelActable = makeDialog({ id: '2', type: 'broadcast-channel', canAct: true })
const basicGroupActable = makeDialog({ id: '3', type: 'basic-group', canAct: true })
const supergroupNoAct = makeDialog({ id: '4', type: 'supergroup', canAct: false })
const basicGroupNoAct = makeDialog({ id: '5', type: 'basic-group', canAct: false })

const ALL_DIALOGS = [supergroupActable, channelActable, basicGroupActable, supergroupNoAct, basicGroupNoAct]

// ---------------------------------------------------------------------------
// computePlannedActions — actionable filter (SAF-01)
// ---------------------------------------------------------------------------

describe('computePlannedActions — actionable filter (SAF-01)', () => {
  it('returns only canAct dialogs from checkedIds (SAF-01 actionable filter)', () => {
    const result = computePlannedActions(ALL_DIALOGS, new Set(['1', '4']), 'kick')
    expect(result).toHaveLength(1)
    expect(result[0].dialog.id).toBe('1')
  })

  it('excludes dialogs where canAct is false (SAF-01 no-rights excluded)', () => {
    const result = computePlannedActions(ALL_DIALOGS, new Set(['4', '5']), 'ban')
    expect(result).toHaveLength(0)
  })

  it('produces empty array when checkedIds is empty (SAF-01 edge)', () => {
    const result = computePlannedActions(ALL_DIALOGS, new Set(), 'kick')
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// computePlannedActions — SAF-02/SAF-03 combined
// ---------------------------------------------------------------------------

describe('computePlannedActions — SAF-02/SAF-03 combined', () => {
  it('returns only canAct dialogs from checkedIds (SAF-01 actionable filter)', () => {
    const result = computePlannedActions(ALL_DIALOGS, new Set(['1', '2', '3', '4', '5']), 'kick')
    expect(result).toHaveLength(3)
    const ids = result.map(r => r.dialog.id)
    expect(ids).toContain('1')
    expect(ids).toContain('2')
    expect(ids).toContain('3')
    expect(ids).not.toContain('4')
    expect(ids).not.toContain('5')
  })

  it('excludes dialogs where canAct is false (SAF-01 no-rights excluded)', () => {
    const result = computePlannedActions(ALL_DIALOGS, new Set(['4']), 'ban')
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// computePlannedActions — mechanic derivation (SAF-03)
// ---------------------------------------------------------------------------

describe('computePlannedActions — mechanic derivation (SAF-03)', () => {
  it('editBanned mechanic for supergroup + ban (SAF-03)', () => {
    const result = computePlannedActions([supergroupActable], new Set(['1']), 'ban')
    expect(result).toHaveLength(1)
    expect(result[0].mechanic).toBe('editBanned')
    expect(result[0].warning).toBeNull()
  })

  it('restrict-then-unban mechanic for supergroup + kick (SAF-03)', () => {
    const result = computePlannedActions([supergroupActable], new Set(['1']), 'kick')
    expect(result).toHaveLength(1)
    expect(result[0].mechanic).toBe('restrict-then-unban')
    expect(result[0].warning).toBeNull()
  })

  it('editBanned mechanic for broadcast-channel + ban (SAF-03)', () => {
    const result = computePlannedActions([channelActable], new Set(['2']), 'ban')
    expect(result).toHaveLength(1)
    expect(result[0].mechanic).toBe('editBanned')
    expect(result[0].warning).toBeNull()
  })

  it('restrict-then-unban mechanic for broadcast-channel + kick (SAF-03)', () => {
    const result = computePlannedActions([channelActable], new Set(['2']), 'kick')
    expect(result).toHaveLength(1)
    expect(result[0].mechanic).toBe('restrict-then-unban')
    expect(result[0].warning).toBeNull()
  })

  it('deleteChatUser mechanic for basic-group + kick (SAF-03)', () => {
    const result = computePlannedActions([basicGroupActable], new Set(['3']), 'kick')
    expect(result).toHaveLength(1)
    expect(result[0].mechanic).toBe('deleteChatUser')
    expect(result[0].warning).toBeNull()
  })

  it('deleteChatUser mechanic for basic-group + ban with rejoin-cant-be-blocked warning (SAF-03)', () => {
    const result = computePlannedActions([basicGroupActable], new Set(['3']), 'ban')
    expect(result).toHaveLength(1)
    expect(result[0].mechanic).toBe('deleteChatUser')
    expect(result[0].warning).toBe('rejoin-cant-be-blocked')
  })

  it('excludes dialog not in dialogs array even if in checkedIds', () => {
    const result = computePlannedActions([supergroupActable], new Set(['999']), 'ban')
    expect(result).toHaveLength(0)
  })
})
