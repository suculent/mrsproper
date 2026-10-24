// Pure vitest tests for computeAddGroups and validateDmTemplate — no jsdom needed
// (node env). Mirrors tagValidation.test.ts's pure-fn test idiom. Factory duplicated
// locally per plan instruction (not imported from reviewScreen.test.ts).

import { describe, it, expect } from 'vitest'
import { computeAddGroups, validateDmTemplate } from './addValidation'
import { DM_TEMPLATE_MAX_LENGTH } from '@shared/dmTemplate'
import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'

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

// Simple translate mock — returns the key unchanged
const t = (key: string) => key

// WR-04: computeAddGroups only keeps dialogs with a RESOLVED actionable status, so tests that
// expect a row to survive the filter must supply an explicit 'not-member' scan result.
function notMember(...ids: string[]): Map<string, MembershipStatus> {
  return new Map(ids.map((id) => [id, 'not-member' as MembershipStatus]))
}

// ---------------------------------------------------------------------------
// computeAddGroups
// ---------------------------------------------------------------------------

describe('computeAddGroups', () => {
  it('returns one AddGroupAction per dialog in checkedIds, excluding unchecked dialogs', () => {
    const d1 = makeDialog({ id: '1' })
    const d2 = makeDialog({ id: '2' })
    const d3 = makeDialog({ id: '3' })
    const result = computeAddGroups([d1, d2, d3], new Set(['1', '3']), notMember('1', '2', '3'), t)
    expect(result.map((r) => r.dialog.id)).toEqual(['1', '3'])
  })

  it('empty checkedIds → empty result', () => {
    const d1 = makeDialog({ id: '1' })
    const result = computeAddGroups([d1], new Set(), new Map(), t)
    expect(result).toHaveLength(0)
  })

  it('basic-group → mechanicNote is add:mechanicNote.add', () => {
    const d1 = makeDialog({ id: '1', type: 'basic-group' })
    const result = computeAddGroups([d1], new Set(['1']), notMember('1'), t)
    expect(result[0].mechanicNote).toBe('add:mechanicNote.add')
  })

  it('supergroup → mechanicNote is add:mechanicNote.invite', () => {
    const d1 = makeDialog({ id: '1', type: 'supergroup' })
    const result = computeAddGroups([d1], new Set(['1']), notMember('1'), t)
    expect(result[0].mechanicNote).toBe('add:mechanicNote.invite')
  })

  it('broadcast-channel → mechanicNote is add:mechanicNote.invite (same as supergroup)', () => {
    const d1 = makeDialog({ id: '1', type: 'broadcast-channel' })
    const result = computeAddGroups([d1], new Set(['1']), notMember('1'), t)
    expect(result[0].mechanicNote).toBe('add:mechanicNote.invite')
  })

  it('banned status → appends banLiftedSuffix and sets banNoteAppended=true', () => {
    const d1 = makeDialog({ id: '1', type: 'supergroup' })
    const membership = new Map<string, MembershipStatus>([['1', 'banned']])
    const result = computeAddGroups([d1], new Set(['1']), membership, t)
    expect(result[0].mechanicNote).toBe('add:mechanicNote.invite add:mechanicNote.banLiftedSuffix')
    expect(result[0].banNoteAppended).toBe(true)
  })

  it('non-banned status → base note alone, banNoteAppended=false', () => {
    const d1 = makeDialog({ id: '1', type: 'supergroup' })
    const membership = new Map<string, MembershipStatus>([['1', 'not-member']])
    const result = computeAddGroups([d1], new Set(['1']), membership, t)
    expect(result[0].mechanicNote).toBe('add:mechanicNote.invite')
    expect(result[0].banNoteAppended).toBe(false)
  })

  it('WR-04: absent membership entry (unscanned) → excluded, not treated as not-member', () => {
    const d1 = makeDialog({ id: '1', type: 'basic-group' })
    const d2 = makeDialog({ id: '2', type: 'basic-group' })
    const result = computeAddGroups([d1, d2], new Set(['1', '2']), notMember('2'), t)
    expect(result.map((r) => r.dialog.id)).toEqual(['2'])
  })

  it('WR-04: pending/failed/member statuses → excluded in Add mode (D-05)', () => {
    const dialogs = ['1', '2', '3'].map((id) => makeDialog({ id }))
    const status = new Map<string, MembershipStatus>([['1', 'pending'], ['2', 'failed'], ['3', 'member']])
    const result = computeAddGroups(dialogs, new Set(['1', '2', '3']), status, t)
    expect(result).toHaveLength(0)
  })

  it('WR-04: empty membership map (scan not started) → nothing actionable', () => {
    const d1 = makeDialog({ id: '1' })
    const result = computeAddGroups([d1], new Set(['1']), new Map(), t)
    expect(result).toHaveLength(0)
  })

  it('defaults t to identity when not provided', () => {
    const d1 = makeDialog({ id: '1', type: 'basic-group' })
    const result = computeAddGroups([d1], new Set(['1']), notMember('1'))
    expect(result[0].mechanicNote).toBe('add:mechanicNote.add')
  })

  it('WR-03: excludes a checked dialog whose canAdd is false, even though it is in checkedIds', () => {
    const d1 = makeDialog({ id: '1', canAdd: false })
    const d2 = makeDialog({ id: '2', canAdd: true })
    const result = computeAddGroups([d1, d2], new Set(['1', '2']), notMember('1', '2'), t)
    expect(result.map((r) => r.dialog.id)).toEqual(['2'])
  })

  it('D-12: excludes a checked banned dialog with canUnban false, keeps one with canUnban true', () => {
    const d1 = makeDialog({ id: '1', canUnban: false })
    const d2 = makeDialog({ id: '2', canUnban: true })
    const status = new Map<string, 'banned'>([['1', 'banned'], ['2', 'banned']])
    const result = computeAddGroups([d1, d2], new Set(['1', '2']), status, t)
    expect(result.map((r) => r.dialog.id)).toEqual(['2'])
  })
})

// ---------------------------------------------------------------------------
// validateDmTemplate
// ---------------------------------------------------------------------------

describe('validateDmTemplate', () => {
  it('empty string → "empty"', () => {
    expect(validateDmTemplate('')).toBe('empty')
  })

  it('whitespace-only string → "empty"', () => {
    expect(validateDmTemplate('   \n\t  ')).toBe('empty')
  })

  it('string longer than DM_TEMPLATE_MAX_LENGTH → "tooLong", checked before the {links} check', () => {
    // No {links} present either — if order were wrong this would return 'missingLinks'.
    const tooLong = 'a'.repeat(DM_TEMPLATE_MAX_LENGTH + 1)
    expect(validateDmTemplate(tooLong)).toBe('tooLong')
  })

  it('exactly at DM_TEMPLATE_MAX_LENGTH with {links} present → null (at the limit, valid)', () => {
    const atLimit = '{links}' + 'a'.repeat(DM_TEMPLATE_MAX_LENGTH - '{links}'.length)
    expect(atLimit.length).toBe(DM_TEMPLATE_MAX_LENGTH)
    expect(validateDmTemplate(atLimit)).toBeNull()
  })

  it('non-empty, length-valid string without the literal {links} substring → "missingLinks"', () => {
    expect(validateDmTemplate('Hello {name}, welcome!')).toBe('missingLinks')
  })

  it('valid template containing {links} → null', () => {
    expect(validateDmTemplate('Hello {name}, here are your links: {links}')).toBeNull()
  })

  it('{name} is optional — valid template without {name} still returns null (D-12)', () => {
    expect(validateDmTemplate('Here are your links: {links}')).toBeNull()
  })
})
