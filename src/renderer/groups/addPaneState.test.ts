import { describe, it, expect } from 'vitest'
import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import { getAddEmptyState, isAddStatusInJob, getPaneView, getJobRows } from './addPaneState'

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
  it("returns 'no-groups' for no dialogs, even when failedCount > 0", () => {
    expect(getAddEmptyState([], of({}), 0)).toBe('no-groups')
    expect(getAddEmptyState([], of({}), 3)).toBe('no-groups')
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

describe('getPaneView', () => {
  it('derives the view from add/target step', () => {
    expect(getPaneView('idle', 'confirmed')).toBe('checklist')
    expect(getPaneView('idle', 'idle')).toBe('browse')
    expect(getPaneView('running', 'idle')).toBe('job')
    expect(getPaneView('stopped', 'resolving')).toBe('job')
    expect(getPaneView('running', 'confirmed')).toBe('checklist')
  })
})

describe('getJobRows', () => {
  it('limits to job ids in job order, skipping unknown', () => {
    const all = [d('1'), d('2'), d('3')]
    expect(getJobRows(all, ['3', '9', '1']).map((x) => x.id)).toEqual(['3', '1'])
    expect(getJobRows(all, undefined)).toEqual([])
  })
})
