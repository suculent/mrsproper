import { describe, it, expect, vi } from 'vitest'
import { wipeAddSessionState } from './sessionWipe'

describe('wipeAddSessionState', () => {
  it('runs executor reset, clearJob, resolver reset in order', () => {
    const order: string[] = []
    wipeAddSessionState({
      addExecutor: { resetForSessionWipe: () => order.push('exec') },
      addAuditStore: { clearJob: () => order.push('clear') },
      resolver: { reset: () => order.push('resolver') },
    })
    expect(order).toEqual(['exec', 'clear', 'resolver'])
  })

  it('tolerates null deps', () => {
    expect(() => wipeAddSessionState({ addExecutor: null, addAuditStore: null, resolver: null })).not.toThrow()
  })

  it('a throwing step does not skip the others', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const clearJob = vi.fn()
    const reset = vi.fn()
    expect(() =>
      wipeAddSessionState({
        addExecutor: { resetForSessionWipe: () => { throw new Error('boom') } },
        addAuditStore: { clearJob },
        resolver: { reset },
      })
    ).not.toThrow()
    expect(clearJob).toHaveBeenCalled()
    expect(reset).toHaveBeenCalled()
    err.mockRestore()
  })
})
