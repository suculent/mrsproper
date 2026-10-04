import { describe, it, expect } from 'vitest'
import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import { getAddEmptyState, isAddStatusInJob } from './addPaneState'

function d(id: string, o: Partial<AdminDialogDTO> = {}): AdminDialogDTO {
  return {
    id,
    title: 'G' + id,
    avatar: null,
    memberCount: 1,
    type: 'supergroup',
    canAct: true,
    greyReason: null,
    canAdd: true,
    addGreyReason: null,
    canUnban: true,
    ...o,
  }
}
const of = (m: Record<string, MembershipStatus>) => (id: string) => m[id] ?? null

describe('getAddEmptyState', () => {
  it("returns 'none' for no dialogs", () => {
    expect(getAddEmptyState([], of({}), 0)).toBe('none')
  })
  it("returns 'none' when a row is actionable", () => {
    expect(getAddEmptyState([d('1'), d('2')], of({ '1': 'not-member', '2': 'member' }), 0)).toBe('none')
  })
  it("returns 'all-member' when every row is a member", () => {
    expect(getAddEmptyState([d('1'), d('2')], of({ '1': 'member', '2': 'member' }), 0)).toBe('all-member')
  })
  it("returns 'cannot-add' for banned without canUnban / canAdd false mixed with members", () => {
    const rows = [d('1', { canUnban: false }), d('2', { canAdd: false }), d('3')]
    expect(getAddEmptyState(rows, of({ '1': 'banned', '2': 'not-member', '3': 'member' }), 0)).toBe('cannot-add')
  })
  it("returns 'none' when failedCount > 0 with no actionable row (retry banner reachable)", () => {
    expect(getAddEmptyState([d('1'), d('2')], of({ '1': 'member', '2': 'failed' }), 1)).toBe('none')
  })
})

describe('isAddStatusInJob', () => {
  it('true when job ids unknown', () => expect(isAddStatusInJob('x', undefined)).toBe(true))
  it('false when id not in job', () => expect(isAddStatusInJob('x', ['a'])).toBe(false))
  it('true when id in job', () => expect(isAddStatusInJob('a', ['a'])).toBe(true))
})
