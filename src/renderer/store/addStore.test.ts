// Tests for addStore module-level behaviors.
// Mirrors src/renderer/store/groupsStore.test.ts's mocking idiom: react's
// useSyncExternalStore is mocked to a plain synchronous function (subscribe once,
// return getSnapshot()) since environment: node has no jsdom/RTL — the real hook
// cannot be invoked outside a component render. This also lets us call useAddStore()
// directly and compare successive snapshot object identities to verify the mandatory
// cachedSnapshot guard (Pitfall 2).
//
// Each test calls loadFreshStore(), which vi.resetModules()s and re-imports the store
// so the module-level singleton (currentState, pendingJob, listeners) starts clean —
// addStore has no exported reset, and state must not leak across tests.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AddState, AddJobFileSafe } from '@shared/addTypes'

vi.mock('react', () => ({
  useSyncExternalStore: (
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => unknown
  ) => {
    subscribe(() => {})
    return getSnapshot()
  },
}))

vi.mock('../ipc/addClient', () => ({
  addClient: {
    startAdd: vi.fn(),
    abortAdd: vi.fn(),
    retryAddGroup: vi.fn(),
    getAddState: vi.fn(() => new Promise(() => {})),
    onAddState: vi.fn(() => vi.fn()),
    getAddJob: vi.fn(() => Promise.resolve(null)),
    discardAddJob: vi.fn(),
    exportAddLog: vi.fn(),
  },
}))

interface MockAddClient {
  startAdd: ReturnType<typeof vi.fn>
  abortAdd: ReturnType<typeof vi.fn>
  retryAddGroup: ReturnType<typeof vi.fn>
  getAddState: ReturnType<typeof vi.fn>
  onAddState: ReturnType<typeof vi.fn>
  getAddJob: ReturnType<typeof vi.fn>
  discardAddJob: ReturnType<typeof vi.fn>
  exportAddLog: ReturnType<typeof vi.fn>
}

// ---------------------------------------------------------------------------
// Fresh-module loader — isolates the singleton store per test.
// ---------------------------------------------------------------------------

async function loadFreshStore() {
  vi.resetModules()
  const clientModule = await import('../ipc/addClient')
  const storeModule = await import('./addStore')
  return {
    useAddStore: storeModule.useAddStore,
    addActions: storeModule.addActions,
    mockClient: clientModule.addClient as unknown as MockAddClient,
  }
}

function makeIdleAddState(): AddState {
  return {
    step: 'idle',
    targetId: '',
    targetName: '',
    progress: { processed: 0, total: 0 },
    outcomes: [],
  }
}

function makeCompletedAddState(): AddState {
  return {
    step: 'complete',
    targetId: '123',
    targetName: 'Alice',
    progress: { processed: 2, total: 2 },
    outcomes: [],
    summary: {
      added: 2,
      alreadyMember: 0,
      privacyBlocked: 0,
      failed: 0,
      skipped: 0,
      completedAt: '2026-10-04T00:00:00.000Z',
    },
  }
}

function makeSafeJob(overrides: Partial<AddJobFileSafe> = {}): AddJobFileSafe {
  return {
    schemaVersion: 1,
    jobId: 'job-1',
    targetId: '123',
    targetName: 'Alice',
    dialogIds: ['1', '2', '3'],
    outcomes: [],
    dmStatus: 'pending',
    startedAt: '2026-10-04T00:00:00.000Z',
    status: 'stopped',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1. cachedSnapshot guard stability (Pitfall 2)
// ---------------------------------------------------------------------------

describe('addStore — cachedSnapshot stability (Pitfall 2)', () => {
  it('returns the same snapshot object reference across calls when state has not changed', async () => {
    const { useAddStore, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {})) // never resolves — stay idle
    mockClient.getAddJob.mockResolvedValue(null)

    const first = useAddStore()
    const second = useAddStore()

    expect(first).toBe(second)
  })

  it('returns a new snapshot reference after state changes via startAdd', async () => {
    const { useAddStore, addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(null)
    mockClient.startAdd.mockResolvedValue(makeCompletedAddState())

    const before = useAddStore()
    await addActions.startAdd(['1', '2'])
    const after = useAddStore()

    expect(after).not.toBe(before)
    expect(after.state.step).toBe('complete')
  })
})

// ---------------------------------------------------------------------------
// 2. addActions.startAdd — single-argument call shape (T-15-07)
// ---------------------------------------------------------------------------

describe('addActions.startAdd — single dialogIds argument (T-15-07)', () => {
  it('calls addClient.startAdd with exactly one argument: the dialogIds array', async () => {
    const { addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(null)
    mockClient.startAdd.mockResolvedValue(makeCompletedAddState())

    await addActions.startAdd(['100', '200'])

    expect(mockClient.startAdd).toHaveBeenCalledTimes(1)
    expect(mockClient.startAdd).toHaveBeenCalledWith(['100', '200'])
    expect(mockClient.startAdd.mock.calls[0]).toHaveLength(1)
  })

  it('updates state from the resolved AddState and clears pendingJob on success', async () => {
    const { useAddStore, addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(makeSafeJob())
    mockClient.startAdd.mockResolvedValue(makeCompletedAddState())

    useAddStore() // trigger subscription startup — bootstraps pendingJob
    await Promise.resolve()
    await Promise.resolve()
    expect(useAddStore().pendingJob).not.toBeNull()

    await addActions.startAdd(['1', '2', '3'])

    const snapshot = useAddStore()
    expect(snapshot.state.step).toBe('complete')
    expect(snapshot.pendingJob).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. addActions.abortAdd
// ---------------------------------------------------------------------------

describe('addActions.abortAdd', () => {
  it('calls addClient.abortAdd and updates state from the resolved AddState', async () => {
    const { useAddStore, addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(null)
    mockClient.abortAdd.mockResolvedValue({ ...makeIdleAddState(), step: 'stopped' })

    await addActions.abortAdd()

    expect(mockClient.abortAdd).toHaveBeenCalledTimes(1)
    expect(useAddStore().state.step).toBe('stopped')
  })
})

// ---------------------------------------------------------------------------
// 4. addActions.retryGroup — borrowed from removalStore.ts (ADD-13/D-17)
// ---------------------------------------------------------------------------

describe('addActions.retryGroup', () => {
  it('calls addClient.retryAddGroup(dialogId)', async () => {
    const { addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(null)
    mockClient.retryAddGroup.mockResolvedValue(undefined)

    await addActions.retryGroup('42')

    expect(mockClient.retryAddGroup).toHaveBeenCalledTimes(1)
    expect(mockClient.retryAddGroup).toHaveBeenCalledWith('42')
  })

  it('catches rejection and never throws', async () => {
    const { addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(null)
    mockClient.retryAddGroup.mockRejectedValue(new Error('boom'))

    await expect(addActions.retryGroup('42')).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 5. addActions.discardJob
// ---------------------------------------------------------------------------

describe('addActions.discardJob', () => {
  it('calls addClient.discardAddJob and clears pendingJob to null', async () => {
    const { useAddStore, addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(makeSafeJob())
    mockClient.discardAddJob.mockResolvedValue(null)

    useAddStore() // trigger subscription startup — bootstraps pendingJob
    await Promise.resolve()
    await Promise.resolve()
    expect(useAddStore().pendingJob).not.toBeNull()

    await addActions.discardJob()

    expect(mockClient.discardAddJob).toHaveBeenCalledTimes(1)
    expect(useAddStore().pendingJob).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 6. addActions.resumeJobFromDisk
// ---------------------------------------------------------------------------

describe('addActions.resumeJobFromDisk', () => {
  it('no-ops when getAddJob() resolves null', async () => {
    const { addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(null)

    await addActions.resumeJobFromDisk()

    expect(mockClient.startAdd).not.toHaveBeenCalled()
  })

  it('no-ops when the job status is "complete"', async () => {
    const { addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(makeSafeJob({ status: 'complete' }))

    await addActions.resumeJobFromDisk()

    expect(mockClient.startAdd).not.toHaveBeenCalled()
  })

  it('no-ops when every dialog has a non-skipped outcome', async () => {
    const { addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(
      makeSafeJob({
        dialogIds: ['1', '2'],
        outcomes: [
          { dialogId: '1', status: 'done', timestamp: '2026-10-04T00:00:00.000Z' },
          { dialogId: '2', status: 'failed', timestamp: '2026-10-04T00:00:00.000Z' },
        ],
      })
    )

    await addActions.resumeJobFromDisk()

    expect(mockClient.startAdd).not.toHaveBeenCalled()
  })

  it('calls startAdd with the FULL dialogIds set, not the remaining subset', async () => {
    const { addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(
      makeSafeJob({
        dialogIds: ['1', '2', '3'],
        outcomes: [
          { dialogId: '1', status: 'done', timestamp: '2026-10-04T00:00:00.000Z' },
          { dialogId: '2', status: 'failed', timestamp: '2026-10-04T00:00:00.000Z' },
        ],
      })
    )
    mockClient.startAdd.mockResolvedValue(makeCompletedAddState())

    await addActions.resumeJobFromDisk()

    expect(mockClient.startAdd).toHaveBeenCalledTimes(1)
    expect(mockClient.startAdd).toHaveBeenCalledWith(['1', '2', '3'])
  })

  it('resumes with the full set when one outcome is skipped (skipped is not processed)', async () => {
    const { addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(
      makeSafeJob({
        dialogIds: ['1', '2'],
        outcomes: [
          { dialogId: '1', status: 'done', timestamp: '2026-10-04T00:00:00.000Z' },
          { dialogId: '2', status: 'skipped', timestamp: '2026-10-04T00:00:00.000Z' },
        ],
      })
    )
    mockClient.startAdd.mockResolvedValue(makeCompletedAddState())

    await addActions.resumeJobFromDisk()

    expect(mockClient.startAdd).toHaveBeenCalledWith(['1', '2'])
  })
})

describe('addActions.startAdd — pendingJob retention (D-04)', () => {
  it('retains pendingJob when the returned state is idle', async () => {
    const { useAddStore, addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(makeSafeJob())
    mockClient.startAdd.mockResolvedValue({ ...makeCompletedAddState(), step: 'idle' })

    useAddStore()
    await Promise.resolve()
    await Promise.resolve()
    const started = await addActions.startAdd(['1', '2', '3'])

    expect(started).toBe(false)
    expect(useAddStore().pendingJob).not.toBeNull()
  })

  it('clears pendingJob when the returned state is not idle', async () => {
    const { useAddStore, addActions, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(makeSafeJob())
    mockClient.startAdd.mockResolvedValue(makeCompletedAddState())

    useAddStore()
    await Promise.resolve()
    await Promise.resolve()
    const started = await addActions.startAdd(['1', '2', '3'])

    expect(started).toBe(true)
    expect(useAddStore().pendingJob).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 7. Bootstrap on first subscription — pendingJob detection
// ---------------------------------------------------------------------------

describe('addStore — bootstrap on first subscription', () => {
  it('sets pendingJob when getAddJob() resolves a non-null, non-complete job', async () => {
    const { useAddStore, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(makeSafeJob({ status: 'hard-stopped' }))

    useAddStore()
    await Promise.resolve()
    await Promise.resolve()

    expect(useAddStore().pendingJob).not.toBeNull()
    expect(useAddStore().pendingJob?.status).toBe('hard-stopped')
  })

  it('does not set pendingJob when getAddJob() resolves null', async () => {
    const { useAddStore, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(null)

    useAddStore()
    await Promise.resolve()
    await Promise.resolve()

    expect(useAddStore().pendingJob).toBeNull()
  })

  it('does not set pendingJob when non-skipped outcomes cover every dialog', async () => {
    const { useAddStore, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(
      makeSafeJob({
        dialogIds: ['1', '2'],
        outcomes: [
          { dialogId: '1', status: 'done', timestamp: '2026-10-04T00:00:00.000Z' },
          { dialogId: '2', status: 'failed', timestamp: '2026-10-04T00:00:00.000Z' },
        ],
      })
    )

    useAddStore()
    await Promise.resolve()
    await Promise.resolve()

    expect(useAddStore().pendingJob).toBeNull()
  })

  it('does not set pendingJob when the job status is "complete"', async () => {
    const { useAddStore, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(makeSafeJob({ status: 'complete' }))

    useAddStore()
    await Promise.resolve()
    await Promise.resolve()

    expect(useAddStore().pendingJob).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 8. No severity field anywhere in state shape
// ---------------------------------------------------------------------------

describe('addStore — no severity concept', () => {
  it('idle state has no severity field', async () => {
    const { useAddStore, mockClient } = await loadFreshStore()
    mockClient.getAddState.mockReturnValue(new Promise(() => {}))
    mockClient.getAddJob.mockResolvedValue(null)

    const snapshot = useAddStore()
    expect('severity' in snapshot.state).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 9. addActions — public action surface
// ---------------------------------------------------------------------------

describe('addActions — public action surface', () => {
  it('exports startAdd, abortAdd, retryGroup, discardJob, resumeJobFromDisk', async () => {
    const { addActions } = await loadFreshStore()
    expect(typeof addActions.startAdd).toBe('function')
    expect(typeof addActions.abortAdd).toBe('function')
    expect(typeof addActions.retryGroup).toBe('function')
    expect(typeof addActions.discardJob).toBe('function')
    expect(typeof addActions.resumeJobFromDisk).toBe('function')
  })
})
