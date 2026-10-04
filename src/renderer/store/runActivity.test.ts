import { describe, it, expect } from 'vitest'
import { isAnyRunActive } from './runActivity'

const idle = { step: 'idle' }

describe('isAnyRunActive', () => {
  it('true when removal is running', () => {
    expect(isAnyRunActive({ step: 'running' }, idle, idle)).toBe(true)
  })
  it('true when tag or add is running or stopping', () => {
    expect(isAnyRunActive(idle, { step: 'running' }, idle)).toBe(true)
    expect(isAnyRunActive(idle, idle, { step: 'stopping' })).toBe(true)
    expect(isAnyRunActive({ step: 'stopping' }, idle, idle)).toBe(true)
  })
  it('false for idle/complete/stopped/hard-stopped', () => {
    for (const step of ['idle', 'complete', 'stopped', 'hard-stopped']) {
      expect(isAnyRunActive({ step }, { step }, { step })).toBe(false)
    }
  })
})
