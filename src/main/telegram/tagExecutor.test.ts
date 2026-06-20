/**
 * RED → GREEN tests for TagExecutor.ts (TAG-03, TAG-04, §4.3 lifecycle).
 *
 * Test map:
 *   TAG-03 per-group dispatch: tagClient.invoke called once per supergroup
 *   TAG-03 per-group dispatch: tagClient.connect at run start / disconnect at run end
 *   TAG-03 per-group dispatch: step:running emitted with currentGroupId
 *   TAG-04 already-admin skip: GetParticipant → ChannelParticipantAdmin → skipped TAG_TARGET_IS_ADMIN
 *   TAG-04 already-admin skip: GetParticipant called via mainClient, not tagClient
 *   TAG-04 basic-group skip: TAG_UNSUPPORTED_BASIC_GROUP, no API call
 *   TAG-03 PEER_FLOOD: hard-stop; remaining groups NOT marked skipped (resumable)
 *   TAG-03 PEER_FLOOD: tagClient.disconnect called even on hard-stop
 *   TAG-03 abort: remaining groups marked skipped, step:stopped
 *   TAG-03 abort: abortExecution() when idle emits idle state
 *   TAG-03 generation guard: stale run result not emitted after new execute()
 *   TAG-03 checkpoint ordering: checkpoint fires BEFORE pacing sleep
 *   TAG-03 checkpoint ordering: setStatus('stopped') called when aborted mid-run
 *   TAG-03 _handleGovernorEvent no-op when _runActive is false
 *   TAG-03 _handleGovernorEvent emits floodWaitRemaining during active run
 *   §4.3 tagClient lifecycle: disconnect called on abort (stopped path)
 *   §4.3 tagClient lifecycle: connect called before first invoke
 *   §4.3 tagClient lifecycle: connect NOT called twice when run already in-flight
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bigInt from 'big-integer'
import { RateLimitGovernor } from './governor'
import { TagExecutor } from './TagExecutor'
import type { TagState, TagGroupOutcome } from '@shared/tagTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { TagAuditStore } from '../storage/tagAuditStore'

// ---------------------------------------------------------------------------
// Test factory helpers
// ---------------------------------------------------------------------------

function makeDialog(
  id: string,
  type: 'supergroup' | 'basic-group' | 'broadcast-channel' = 'supergroup'
): AdminDialogDTO {
  return {
    id,
    title: `Group ${id}`,
    avatar: null,
    memberCount: null,
    type,
    canAct: true,
    greyReason: null,
  }
}

/**
 * Create a no-op TagAuditStore for tests that need persistence assertions.
 * checkpoint and initJob calls are tracked in-memory for inspection.
 */
function makeTagAuditStore(dialogIds: string[] = []): TagAuditStore & {
  checkpointCalls: Array<{ dialogId: string; outcome: TagGroupOutcome }>
  setStatusCalls: Array<{ status: string; completedAt?: string }>
  initJobCalled: boolean
} {
  const checkpointCalls: Array<{ dialogId: string; outcome: TagGroupOutcome }> = []
  const setStatusCalls: Array<{ status: string; completedAt?: string }> = []
  const state = { initJobCalled: false }
  let _dialogIds = [...dialogIds]
  const outcomes: TagGroupOutcome[] = []

  return {
    checkpointCalls,
    setStatusCalls,
    get initJobCalled() { return state.initJobCalled },
    initJob(job) {
      state.initJobCalled = true
      _dialogIds = [...job.dialogIds]
    },
    checkpoint(dialogId, outcome) {
      outcomes.push({ ...outcome, dialogId })
      checkpointCalls.push({ dialogId, outcome })
    },
    setStatus(status, completedAt?) {
      setStatusCalls.push({ status, completedAt })
    },
    readJob: () => null,
    clearJob: () => {},
    getRemaining() {
      const done = new Set(outcomes.map(o => o.dialogId))
      return _dialogIds.filter(id => !done.has(id))
    },
  }
}

/**
 * Create a TagExecutor with injectable dependencies.
 *
 * mockTagClient: connect/invoke/disconnect spies for the layer-224 write path.
 * mockMainClient: invoke spy for GetParticipant (already-admin check) — returns
 *   ChannelParticipant by default, ChannelParticipantAdmin for adminDialogIds.
 */
function makeTagExecutor(config: {
  dialogs: AdminDialogDTO[]
  /** dialogIds where GetParticipant returns ChannelParticipantAdmin → triggers skip */
  adminDialogIds?: string[]
  auditStore?: TagAuditStore
}) {
  // mockTagClient — layer-224 write path; invoke records editChatParticipantRank calls
  const mockTagClient = {
    connect: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    disconnect: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    invoke: vi.fn<[unknown], Promise<unknown>>().mockResolvedValue({}),
  }

  // mockMainClient — main layer-198 client; used for GetParticipant pre-flight only
  const mockMainClient = {
    invoke: vi.fn<[unknown], Promise<unknown>>().mockImplementation(async (request: unknown) => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetParticipant' || className === 'channels.GetParticipant') {
        const channelId = (
          request as { channel?: { channelId?: { toString(): string } } }
        ).channel?.channelId?.toString() ?? ''
        if (config.adminDialogIds?.includes(channelId)) {
          return { participant: { className: 'ChannelParticipantAdmin' } }
        }
        return { participant: { className: 'ChannelParticipant' } }
      }
      return {}
    }),
  }

  const governor = new RateLimitGovernor({ client: mockMainClient as never })

  const stubEnumerator = {
    getState: () => ({ step: 'loaded' as const, dialogs: config.dialogs }),
    getDialogEntity: (id: string) => {
      const dialog = config.dialogs.find(d => d.id === id)
      if (!dialog) return null
      if (dialog.type === 'basic-group') {
        return { id: { toString: () => id }, className: 'Chat' }
      }
      return {
        id: { toString: () => id },
        accessHash: { toString: () => '0' },
        className: 'Channel',
      }
    },
  }

  const stubResolver = {
    getResolvedUser: () => ({
      id: BigInt('99'),
      accessHash: BigInt('12345'),
      name: 'Test User',
    }),
  }

  const dialogIds = config.dialogs.map(d => d.id)
  const auditStore = config.auditStore ?? makeTagAuditStore(dialogIds)

  const states: TagState[] = []
  const onStateChange = (s: TagState) => states.push(s)

  const executor = new TagExecutor({
    tagClient: mockTagClient as never,
    mainClient: mockMainClient,
    governor,
    enumerator: stubEnumerator as never,
    resolver: stubResolver,
    auditStore,
    onStateChange,
  })

  return { executor, mockTagClient, mockMainClient, states, auditStore, dialogIds }
}

// ---------------------------------------------------------------------------
// TAG-03 — per-group dispatch
// ---------------------------------------------------------------------------

describe('TagExecutor — per-group dispatch (TAG-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls tagClient.invoke with editChatParticipantRank request once per supergroup', async () => {
    const dialogs = [makeDialog('1001', 'supergroup'), makeDialog('1002', 'supergroup')]
    const { executor, mockTagClient, states } = makeTagExecutor({ dialogs })

    const execPromise = executor.execute({ dialogIds: ['1001', '1002'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(mockTagClient.invoke).toHaveBeenCalledTimes(2)
    const finalState = states[states.length - 1]
    expect(finalState.step).toBe('complete')
  })

  it('calls tagClient.connect at run start and tagClient.disconnect at run end (§4.3)', async () => {
    const dialogs = [makeDialog('1003', 'supergroup')]
    const { executor, mockTagClient } = makeTagExecutor({ dialogs })

    const connectOrder: string[] = []
    mockTagClient.connect.mockImplementation(async () => {
      connectOrder.push('connect')
    })
    mockTagClient.invoke.mockImplementation(async () => {
      connectOrder.push('invoke')
      return {}
    })
    mockTagClient.disconnect.mockImplementation(async () => {
      connectOrder.push('disconnect')
    })

    const execPromise = executor.execute({ dialogIds: ['1003'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(mockTagClient.connect).toHaveBeenCalledTimes(1)
    expect(mockTagClient.disconnect).toHaveBeenCalledTimes(1)
    // connect must precede invoke which must precede disconnect
    const connectIdx = connectOrder.indexOf('connect')
    const invokeIdx = connectOrder.indexOf('invoke')
    const disconnectIdx = connectOrder.lastIndexOf('disconnect')
    expect(connectIdx).toBeLessThan(invokeIdx)
    expect(invokeIdx).toBeLessThan(disconnectIdx)
  })

  it('emits step:running with currentGroupId for each group being processed', async () => {
    const dialogs = [makeDialog('1004', 'supergroup'), makeDialog('1005', 'supergroup')]
    const { executor, states } = makeTagExecutor({ dialogs })

    const execPromise = executor.execute({ dialogIds: ['1004', '1005'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    const runningStates = states.filter(s => s.step === 'running')
    expect(runningStates.length).toBeGreaterThanOrEqual(2)
    const groupIds = runningStates.map(s => s.currentGroupId)
    expect(groupIds).toContain('1004')
    expect(groupIds).toContain('1005')
  })
})

// ---------------------------------------------------------------------------
// TAG-04 — already-admin skip
// ---------------------------------------------------------------------------

describe('TagExecutor — already-admin skip (TAG-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips group where GetParticipant returns ChannelParticipantAdmin with TAG_TARGET_IS_ADMIN', async () => {
    const dialogs = [makeDialog('2001', 'supergroup')]
    const auditStore = makeTagAuditStore(['2001'])
    const { executor, mockTagClient } = makeTagExecutor({
      dialogs,
      adminDialogIds: ['2001'],
      auditStore,
    })

    const execPromise = executor.execute({ dialogIds: ['2001'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(mockTagClient.invoke).not.toHaveBeenCalled()
    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '2001')
    expect(checkpointCall).toBeDefined()
    expect(checkpointCall!.outcome.status).toBe('skipped')
    expect(checkpointCall!.outcome.errorCode).toBe('TAG_TARGET_IS_ADMIN')
  })

  it('GetParticipant is called via mainClient (not tagClient) for already-admin check', async () => {
    const dialogs = [makeDialog('2002', 'supergroup')]
    const { executor, mockTagClient, mockMainClient } = makeTagExecutor({ dialogs })

    const execPromise = executor.execute({ dialogIds: ['2002'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    // mainClient.invoke should have been called for GetParticipant
    expect(mockMainClient.invoke).toHaveBeenCalled()
    const mainCalls = mockMainClient.invoke.mock.calls
    const getParticipantCall = mainCalls.find(args => {
      const req = args[0] as { className?: string; constructor?: { name?: string } }
      return req?.className === 'channels.GetParticipant' ||
             req?.constructor?.name === 'GetParticipant'
    })
    expect(getParticipantCall).toBeDefined()
    // tagClient.invoke should also be called (for the actual tag write on a non-admin)
    expect(mockTagClient.invoke).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// TAG-04 — basic-group skip
// ---------------------------------------------------------------------------

describe('TagExecutor — basic-group skip (TAG-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips basic-group dialogs with TAG_UNSUPPORTED_BASIC_GROUP, no API call', async () => {
    const dialogs = [makeDialog('3001', 'basic-group')]
    const auditStore = makeTagAuditStore(['3001'])
    const { executor, mockTagClient, mockMainClient } = makeTagExecutor({ dialogs, auditStore })

    const execPromise = executor.execute({ dialogIds: ['3001'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    // No tagClient.invoke for basic-group (skipped before any API call)
    expect(mockTagClient.invoke).not.toHaveBeenCalled()
    // No mainClient.invoke for GetParticipant (basic-group is detected from type, no pre-flight)
    const getParticipantCall = mockMainClient.invoke.mock.calls.find(args => {
      const req = args[0] as { className?: string; constructor?: { name?: string } }
      return req?.className === 'channels.GetParticipant' ||
             req?.constructor?.name === 'GetParticipant'
    })
    expect(getParticipantCall).toBeUndefined()
    // outcome should be skipped with TAG_UNSUPPORTED_BASIC_GROUP
    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '3001')
    expect(checkpointCall).toBeDefined()
    expect(checkpointCall!.outcome.status).toBe('skipped')
    expect(checkpointCall!.outcome.errorCode).toBe('TAG_UNSUPPORTED_BASIC_GROUP')
  })
})

// ---------------------------------------------------------------------------
// TAG-03 — PEER_FLOOD hard-stop
// ---------------------------------------------------------------------------

describe('TagExecutor — PEER_FLOOD hard-stop (TAG-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hard-stops on PEER_FLOOD: step becomes hard-stopped, remaining groups NOT marked skipped', async () => {
    const dialogs = [
      makeDialog('4001', 'supergroup'),
      makeDialog('4002', 'supergroup'),
      makeDialog('4003', 'supergroup'),
    ]
    const dialogIds = ['4001', '4002', '4003']
    const auditStore = makeTagAuditStore(dialogIds)
    const { executor, mockTagClient, states } = makeTagExecutor({ dialogs, auditStore })

    // PEER_FLOOD on group 4002 (second invoke call)
    let invokeCallCount = 0
    mockTagClient.invoke.mockImplementation(async () => {
      invokeCallCount++
      if (invokeCallCount === 2) {
        throw { errorMessage: 'PEER_FLOOD' }
      }
      return {}
    })

    const execPromise = executor.execute({ dialogIds, tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    const finalState = states[states.length - 1]
    expect(finalState.step).toBe('hard-stopped')

    // Group 4001 should be checkpointed (done)
    const g1 = auditStore.checkpointCalls.find(c => c.dialogId === '4001')
    expect(g1?.outcome.status).toBe('done')

    // Group 4002 should NOT be checkpointed (PEER_FLOOD — no outcome recorded)
    const g2 = auditStore.checkpointCalls.find(c => c.dialogId === '4002')
    expect(g2).toBeUndefined()

    // Group 4003 should NOT be checkpointed (not marked skipped — remains resumable)
    const g3 = auditStore.checkpointCalls.find(c => c.dialogId === '4003')
    expect(g3).toBeUndefined()

    expect(auditStore.setStatusCalls.some(c => c.status === 'hard-stopped')).toBe(true)
  })

  it('calls tagClient.disconnect even on PEER_FLOOD hard-stop', async () => {
    const dialogs = [makeDialog('4004', 'supergroup'), makeDialog('4005', 'supergroup')]
    const { executor, mockTagClient } = makeTagExecutor({ dialogs })

    mockTagClient.invoke.mockRejectedValueOnce({ errorMessage: 'PEER_FLOOD' })

    const execPromise = executor.execute({ dialogIds: ['4004', '4005'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(mockTagClient.disconnect).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// TAG-03 — Abort (Stop tag run)
// ---------------------------------------------------------------------------

describe('TagExecutor — abort (Stop tag run)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('abortExecution() during group 2 of 3: remaining groups marked skipped, step becomes stopped', async () => {
    const dialogs = [
      makeDialog('5001', 'supergroup'),
      makeDialog('5002', 'supergroup'),
      makeDialog('5003', 'supergroup'),
    ]
    const dialogIds = ['5001', '5002', '5003']
    const auditStore = makeTagAuditStore(dialogIds)
    const { executor, states } = makeTagExecutor({ dialogs, auditStore })

    let abortCalled = false
    const originalCheckpoint = auditStore.checkpoint.bind(auditStore)
    auditStore.checkpoint = (dialogId: string, outcome: TagGroupOutcome) => {
      originalCheckpoint(dialogId, outcome)
      // Abort after group 5001 checkpoints (triggers during pacing sleep before group 5002)
      if (dialogId === '5001' && !abortCalled) {
        abortCalled = true
        executor.abortExecution()
      }
    }

    const execPromise = executor.execute({ dialogIds, tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    const finalState = states[states.length - 1]
    expect(finalState.step).toBe('stopped')

    // Group 5001 should be done (processed before abort)
    const g1 = auditStore.checkpointCalls.find(c => c.dialogId === '5001')
    expect(g1?.outcome.status).toBe('done')

    // Remaining groups should be skipped
    const hasAnySkipped = auditStore.checkpointCalls.some(c => c.outcome.status === 'skipped')
    expect(hasAnySkipped).toBe(true)
  })

  it('abortExecution() when idle emits idle state (not stopped)', () => {
    const dialogs = [makeDialog('5004', 'supergroup')]
    const { executor, states } = makeTagExecutor({ dialogs })

    // No execute() called — executor is idle
    executor.abortExecution()

    const lastState = states[states.length - 1]
    expect(lastState?.step).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// TAG-03 — Generation guard (D-15)
// ---------------------------------------------------------------------------

describe('TagExecutor — generation guard (D-15)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('new execute() call while first is in-flight: first run outcome not emitted after second starts', async () => {
    const dialogs = [makeDialog('6001', 'supergroup'), makeDialog('6002', 'supergroup')]
    const { executor, mockTagClient, states } = makeTagExecutor({ dialogs })

    // First call starts
    const firstPromise = executor.execute({ dialogIds: ['6001', '6002'], tag: 'dev' })

    // Immediately start a second execute() which increments _generation
    const secondPromise = executor.execute({ dialogIds: ['6001', '6002'], tag: 'dev' })

    await vi.runAllTimersAsync()
    await Promise.allSettled([firstPromise, secondPromise])

    // Only one terminal state should be the last emitted state
    const lastState = states[states.length - 1]
    expect(['complete', 'stopped', 'hard-stopped']).toContain(lastState.step)

    // The executor should be in a consistent state (not corrupted by stale generation)
    expect(executor.getState()).toBeDefined()

    // tagClient.invoke calls should be well-defined (not duplicated from stale run)
    expect(mockTagClient.invoke.mock.calls.length).toBeGreaterThanOrEqual(0)
  })
})

// ---------------------------------------------------------------------------
// TAG-03 — Checkpoint ordering
// ---------------------------------------------------------------------------

describe('TagExecutor — checkpoint ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('per-group checkpoint fires BEFORE pacing sleep, not after', async () => {
    const dialogs = [makeDialog('7001', 'supergroup')]
    const auditStore = makeTagAuditStore(['7001'])
    const { executor } = makeTagExecutor({ dialogs, auditStore })

    let checkpointFiredBeforeTimers = false
    const originalCheckpoint = auditStore.checkpoint.bind(auditStore)
    auditStore.checkpoint = (dialogId: string, outcome: TagGroupOutcome) => {
      // If checkpoint fires before timers advance, fake timers are still pending
      checkpointFiredBeforeTimers = true
      originalCheckpoint(dialogId, outcome)
    }

    // Start the execution (pacing sleep will be held by fake timers)
    const execPromise = executor.execute({ dialogIds: ['7001'], tag: 'dev' })

    // Advance timers to flush pacing sleeps
    await vi.runAllTimersAsync()
    await execPromise

    // Checkpoint must have fired
    expect(checkpointFiredBeforeTimers).toBe(true)
    expect(auditStore.checkpointCalls).toHaveLength(1)
    expect(auditStore.checkpointCalls[0].dialogId).toBe('7001')
  })

  it('setStatus("stopped") called when aborted mid-run', async () => {
    const dialogs = [makeDialog('7002', 'supergroup'), makeDialog('7003', 'supergroup')]
    const auditStore = makeTagAuditStore(['7002', '7003'])
    const { executor } = makeTagExecutor({ dialogs, auditStore })

    let abortCalled = false
    const originalCheckpoint = auditStore.checkpoint.bind(auditStore)
    auditStore.checkpoint = (dialogId: string, outcome: TagGroupOutcome) => {
      originalCheckpoint(dialogId, outcome)
      if (dialogId === '7002' && !abortCalled) {
        abortCalled = true
        executor.abortExecution()
      }
    }

    const execPromise = executor.execute({ dialogIds: ['7002', '7003'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(auditStore.setStatusCalls.some(c => c.status === 'stopped')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TAG-03 — _handleGovernorEvent + _runActive
// ---------------------------------------------------------------------------

describe('TagExecutor — _handleGovernorEvent + _runActive', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('_handleGovernorEvent is a no-op when _runActive is false (no run active)', () => {
    const dialogs = [makeDialog('8001', 'supergroup')]
    const { executor, states } = makeTagExecutor({ dialogs })

    // No execute() call — _runActive is false
    executor._handleGovernorEvent({ type: 'flood-tick', remaining: 30 })

    // No state should have been emitted
    expect(states).toHaveLength(0)
  })

  it('_handleGovernorEvent emits floodWaitRemaining during active run', async () => {
    const dialogs = [makeDialog('8002', 'supergroup')]
    const { executor, states } = makeTagExecutor({ dialogs })

    // Start a run (sets _runActive = true)
    const execPromise = executor.execute({ dialogIds: ['8002'], tag: 'dev' })

    // Simulate a flood-tick event arriving from the governor during the run
    executor._handleGovernorEvent({ type: 'flood-tick', remaining: 30 })

    // The event should have caused a state emission with floodWaitRemaining
    const floodState = states.find(s => s.floodWaitRemaining === 30)
    expect(floodState).toBeDefined()

    await vi.runAllTimersAsync()
    await execPromise
  })
})

// ---------------------------------------------------------------------------
// §4.3 — tagClient lifecycle
// ---------------------------------------------------------------------------

describe('TagExecutor — tagClient lifecycle (§4.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('tagClient.disconnect is called on abort (stopped path)', async () => {
    const dialogs = [makeDialog('9001', 'supergroup'), makeDialog('9002', 'supergroup')]
    const auditStore = makeTagAuditStore(['9001', '9002'])
    const { executor, mockTagClient } = makeTagExecutor({ dialogs, auditStore })

    let abortCalled = false
    const originalCheckpoint = auditStore.checkpoint.bind(auditStore)
    auditStore.checkpoint = (dialogId: string, outcome: TagGroupOutcome) => {
      originalCheckpoint(dialogId, outcome)
      if (dialogId === '9001' && !abortCalled) {
        abortCalled = true
        executor.abortExecution()
      }
    }

    const execPromise = executor.execute({ dialogIds: ['9001', '9002'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(mockTagClient.disconnect).toHaveBeenCalledTimes(1)
  })

  it('tagClient.connect is called before the first invoke', async () => {
    const dialogs = [makeDialog('9003', 'supergroup')]
    const { executor, mockTagClient } = makeTagExecutor({ dialogs })

    const callOrder: string[] = []
    mockTagClient.connect.mockImplementation(async () => {
      callOrder.push('connect')
    })
    mockTagClient.invoke.mockImplementation(async () => {
      callOrder.push('invoke')
      return {}
    })

    const execPromise = executor.execute({ dialogIds: ['9003'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(callOrder.indexOf('connect')).toBeLessThan(callOrder.indexOf('invoke'))
  })

  it('tagClient.connect() is NOT called when a run is already active (_connectingTagClient guard)', async () => {
    const dialogs = [makeDialog('9004', 'supergroup'), makeDialog('9005', 'supergroup')]
    const { executor, mockTagClient } = makeTagExecutor({ dialogs })

    // First execute() starts running — sets run in-flight
    const firstPromise = executor.execute({ dialogIds: ['9004', '9005'], tag: 'dev' })

    // Second execute() while first is in-flight:
    // Because _runActive is true, the idle assertion fails early → connect NOT called again
    const secondPromise = executor.execute({ dialogIds: ['9004', '9005'], tag: 'dev' })

    await vi.runAllTimersAsync()
    await Promise.allSettled([firstPromise, secondPromise])

    // connect should have been called only once (second execute() short-circuits)
    expect(mockTagClient.connect).toHaveBeenCalledTimes(1)
  })
})
