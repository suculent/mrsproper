// Tests for computePlannedActions and computeActionableTagCount pure functions.
// No jsdom needed (node env). SAF-01/02/03 mechanic derivation oracle plus
// tag action count-derivation (Phase 12 Plan 03 extension).

import { describe, it, expect, vi } from 'vitest'
import { computePlannedActions, computeActionableTagCount, runAddConfirm } from './ReviewScreen'
import { computeTagGroups } from './tagValidation'
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
    canAdd: true,
    addGreyReason: null,
    canUnban: true,
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

// ---------------------------------------------------------------------------
// computeActionableTagCount — Phase 12 tag count-derivation (uses computeTagGroups)
// ---------------------------------------------------------------------------

describe('computeActionableTagCount', () => {
  const t = (key: string) => key

  it('returns count of non-skipped TagGroupActions (supergroups only)', () => {
    const dialogs: AdminDialogDTO[] = [
      makeDialog({ id: '10', type: 'supergroup', canAct: true }),
      makeDialog({ id: '11', type: 'broadcast-channel', canAct: true }),
    ]
    const tagGroupActions = computeTagGroups(dialogs, new Set(['10', '11']), t)
    const count = computeActionableTagCount(tagGroupActions)
    expect(count).toBe(2)
  })

  it('excludes basic-group (willBeSkipped=true) from count', () => {
    const dialogs: AdminDialogDTO[] = [
      makeDialog({ id: '20', type: 'supergroup', canAct: true }),
      makeDialog({ id: '21', type: 'basic-group', canAct: true }),
    ]
    const tagGroupActions = computeTagGroups(dialogs, new Set(['20', '21']), t)
    const count = computeActionableTagCount(tagGroupActions)
    expect(count).toBe(1)
  })

  it('returns 0 when all groups are basic-group (all skipped)', () => {
    const dialogs: AdminDialogDTO[] = [
      makeDialog({ id: '30', type: 'basic-group', canAct: true }),
      makeDialog({ id: '31', type: 'basic-group', canAct: true }),
    ]
    const tagGroupActions = computeTagGroups(dialogs, new Set(['30', '31']), t)
    const count = computeActionableTagCount(tagGroupActions)
    expect(count).toBe(0)
  })

  it('returns 0 for empty tag group actions', () => {
    const count = computeActionableTagCount([])
    expect(count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// CR-01: runAddConfirm honours startAdd's boolean
// ---------------------------------------------------------------------------

describe('runAddConfirm (CR-01)', () => {
  it('startAdd false: no contact write, no stage advance, returns false', async () => {
    const startAdd = vi.fn(async () => false)
    const maybeAddToContacts = vi.fn(async () => {})
    const onConfirm = vi.fn()
    const ok = await runAddConfirm(['1', '2'], { startAdd, maybeAddToContacts, onConfirm })
    expect(ok).toBe(false)
    expect(startAdd).toHaveBeenCalledWith(['1', '2'])
    expect(maybeAddToContacts).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('startAdd true: adds to contacts, then advances, returns true', async () => {
    const order: string[] = []
    const ok = await runAddConfirm(['1'], {
      startAdd: async () => {
        order.push('start')
        return true
      },
      maybeAddToContacts: async () => {
        order.push('contacts')
      },
      onConfirm: () => order.push('confirm'),
    })
    expect(ok).toBe(true)
    expect(order).toEqual(['start', 'contacts', 'confirm'])
  })
})
