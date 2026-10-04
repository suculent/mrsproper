// Pure vitest tests for tagValidation utilities — no jsdom needed (node env).
// Covers all validateTagInput error cases and computeTagGroups behavior.

import { describe, it, expect } from 'vitest'
import { validateTagInput, computeTagGroups } from './tagValidation'
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

// Simple translate mock — returns the key unchanged
const t = (key: string) => key

// ---------------------------------------------------------------------------
// validateTagInput
// ---------------------------------------------------------------------------

describe('validateTagInput', () => {
  it('empty string → null (valid at input time)', () => {
    expect(validateTagInput('')).toBeNull()
  })

  it('"Moderator" → null (valid string)', () => {
    expect(validateTagInput('Moderator')).toBeNull()
  })

  it('exactly 16 chars → null (at limit)', () => {
    expect(validateTagInput('A'.repeat(16))).toBeNull()
  })

  it('17 chars → tooLong (over limit)', () => {
    expect(validateTagInput('A'.repeat(17))).toBe('tooLong')
  })

  it('newline → controlChars', () => {
    expect(validateTagInput('line\nbreak')).toBe('controlChars')
  })

  it('null byte → controlChars', () => {
    expect(validateTagInput('has\x00null')).toBe('controlChars')
  })

  it('control char \\x1F → controlChars', () => {
    expect(validateTagInput('has\x1Fcontrol')).toBe('controlChars')
  })

  it('tooLong checked before controlChars (length takes precedence)', () => {
    // A string that is both too long AND contains a control char → tooLong
    expect(validateTagInput('A'.repeat(17) + '\n')).toBe('tooLong')
  })
})

// ---------------------------------------------------------------------------
// computeTagGroups
// ---------------------------------------------------------------------------

describe('computeTagGroups', () => {
  const supergroup = makeDialog({ id: '1', type: 'supergroup' })
  const basicGroup = makeDialog({ id: '2', type: 'basic-group' })

  it('includes both checked dialogs with correct willBeSkipped', () => {
    const result = computeTagGroups([supergroup, basicGroup], new Set(['1', '2']), t)
    expect(result).toHaveLength(2)
    const sg = result.find(r => r.dialog.id === '1')
    const bg = result.find(r => r.dialog.id === '2')
    expect(sg?.willBeSkipped).toBe(false)
    expect(bg?.willBeSkipped).toBe(true)
  })

  it('basic-group → mechanicNote includes basicGroup key', () => {
    const result = computeTagGroups([basicGroup], new Set(['2']), t)
    expect(result[0].mechanicNote).toContain('basicGroup')
  })

  it('supergroup → mechanicNote includes supergroup key', () => {
    const result = computeTagGroups([supergroup], new Set(['1']), t)
    expect(result[0].mechanicNote).toContain('supergroup')
  })

  it('unchecked id → excluded from result', () => {
    const result = computeTagGroups([supergroup, basicGroup], new Set(['1']), t)
    expect(result).toHaveLength(1)
    expect(result[0].dialog.id).toBe('1')
  })

  it('canAct=false dialog → included with willBeSkipped=false (tag does not filter on canAct)', () => {
    const noActDialog = makeDialog({ id: '3', type: 'supergroup', canAct: false })
    const result = computeTagGroups([noActDialog], new Set(['3']), t)
    expect(result).toHaveLength(1)
    expect(result[0].willBeSkipped).toBe(false)
  })

  it('broadcast-channel → willBeSkipped=false (same as supergroup)', () => {
    const channel = makeDialog({ id: '4', type: 'broadcast-channel' })
    const result = computeTagGroups([channel], new Set(['4']), t)
    expect(result).toHaveLength(1)
    expect(result[0].willBeSkipped).toBe(false)
  })

  it('empty checkedIds → empty result', () => {
    const result = computeTagGroups([supergroup, basicGroup], new Set(), t)
    expect(result).toHaveLength(0)
  })
})
