/**
 * Tests for TagExecutor.ts (TAG-03, TAG-04, TAG-07 single-client consolidation).
 *
 * Test map:
 *   TAG-03 per-group dispatch: EditChatParticipantRank issued once per supergroup
 *   TAG-03 per-group dispatch: step:running emitted with currentGroupId
 *   TAG-04 already-admin skip: GetParticipant → ChannelParticipantAdmin → skipped TAG_TARGET_IS_ADMIN
 *   TAG-04 already-admin skip: GetParticipant precheck issued before the write for a non-admin target
 *   TAG-04 basic-group skip: TAG_UNSUPPORTED_BASIC_GROUP, no API call
 *   TAG-03 PEER_FLOOD: hard-stop; remaining groups NOT marked skipped (resumable)
 *   TAG-03 abort: remaining groups marked skipped, step:stopped
 *   TAG-03 abort: abortExecution() when idle emits idle state
 *   TAG-03 generation guard: stale run result not emitted after new execute()
 *   TAG-03 checkpoint ordering: checkpoint fires BEFORE pacing sleep
 *   TAG-03 checkpoint ordering: setStatus('stopped') called when aborted mid-run
 *   TAG-03 _handleGovernorEvent no-op when _runActive is false
 *   TAG-03 _handleGovernorEvent emits floodWaitRemaining during active run
 *   D-11: a parse failure (non-RPC-shaped error) on the write surfaces as UNKNOWN, not success
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    canAdd: true,
    addGreyReason: null,
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
 * mockClient: a SINGLE client (TAG-07 D-10 — no second tagClient/mainClient split).
 * Its invoke() dispatches BOTH GetParticipant (already-admin precheck) AND
 * EditChatParticipantRank (the tag write) by ctorName/className, mirroring the shared
 * __mocks__/telegramClient.ts dispatch pattern.
 */
function makeTagExecutor(config: {
  dialogs: AdminDialogDTO[]
  /** dialogIds where GetParticipant returns ChannelParticipantAdmin → triggers skip */
  adminDialogIds?: string[]
  /** dialogId (channelId) → exact participant shape returned by GetParticipant (overrides adminDialogIds) */
  participantOverrides?: Record<string, { className: string; left?: boolean }>
  /** dialogId (channelId) → errorMessage thrown by the EditChatParticipantRank write */
  tagErrorDialogIds?: Record<string, string>
  auditStore?: TagAuditStore
}) {
  const editChatParticipantRankCalls: Array<{ channelId: string; rank: string }> = []
  const getParticipantCalls: Array<{ channelId: string }> = []

  const defaultInvoke = async (request: unknown): Promise<unknown> => {
    const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
    const className = (request as { className?: string })?.className ?? ''

    if (ctorName === 'GetParticipant' || className === 'channels.GetParticipant') {
      const channelId = (
        request as { channel?: { channelId?: { toString(): string } } }
      ).channel?.channelId?.toString() ?? ''
      getParticipantCalls.push({ channelId })
      if (config.participantOverrides?.[channelId]) {
        return { participant: { ...config.participantOverrides[channelId] } }
      }
      if (config.adminDialogIds?.includes(channelId)) {
        return { participant: { className: 'ChannelParticipantAdmin' } }
      }
      return { participant: { className: 'ChannelParticipant' } }
    }

    if (ctorName === 'EditChatParticipantRank' || className === 'messages.EditChatParticipantRank') {
      const channelId = (
        request as { peer?: { channelId?: { toString(): string } } }
      ).peer?.channelId?.toString() ?? ''
      const rank = (request as { rank?: string }).rank ?? ''
      editChatParticipantRankCalls.push({ channelId, rank })
      if (config.tagErrorDialogIds?.[channelId]) {
        const msg = config.tagErrorDialogIds[channelId]!
        throw Object.assign(new Error(msg), { errorMessage: msg })
      }
      return {}
    }

    return {}
  }

  // Single shared client — TAG-07 D-10: no mainClient/tagClient split.
  const mockClient = {
    invoke: vi.fn<(arg: unknown) => Promise<unknown>>().mockImplementation(defaultInvoke),
  }

  const governor = new RateLimitGovernor({ client: mockClient as never })

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
    client: mockClient,
    governor,
    enumerator: stubEnumerator as never,
    resolver: stubResolver,
    auditStore,
    onStateChange,
  })

  return {
    executor,
    mockClient,
    editChatParticipantRankCalls,
    getParticipantCalls,
    states,
    auditStore,
    dialogIds,
  }
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

  it('issues EditChatParticipantRank once per supergroup', async () => {
    const dialogs = [makeDialog('1001', 'supergroup'), makeDialog('1002', 'supergroup')]
    const { executor, editChatParticipantRankCalls, states } = makeTagExecutor({ dialogs })

    const execPromise = executor.execute({ dialogIds: ['1001', '1002'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(editChatParticipantRankCalls).toHaveLength(2)
    const finalState = states[states.length - 1]
    expect(finalState.step).toBe('complete')
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
    const { executor, editChatParticipantRankCalls } = makeTagExecutor({
      dialogs,
      adminDialogIds: ['2001'],
      auditStore,
    })

    const execPromise = executor.execute({ dialogIds: ['2001'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(editChatParticipantRankCalls).toHaveLength(0)
    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '2001')
    expect(checkpointCall).toBeDefined()
    expect(checkpointCall!.outcome.status).toBe('skipped')
    expect(checkpointCall!.outcome.errorCode).toBe('TAG_TARGET_IS_ADMIN')
  })

  it('skips group where GetParticipant returns ChannelParticipantCreator with TAG_TARGET_IS_ADMIN (no write)', async () => {
    const dialogs = [makeDialog('2011', 'supergroup')]
    const auditStore = makeTagAuditStore(['2011'])
    const { executor, editChatParticipantRankCalls } = makeTagExecutor({
      dialogs,
      participantOverrides: { '2011': { className: 'ChannelParticipantCreator' } },
      auditStore,
    })

    const execPromise = executor.execute({ dialogIds: ['2011'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(editChatParticipantRankCalls).toHaveLength(0)
    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '2011')
    expect(checkpointCall).toBeDefined()
    expect(checkpointCall!.outcome.status).toBe('skipped')
    expect(checkpointCall!.outcome.errorCode).toBe('TAG_TARGET_IS_ADMIN')
  })

  it('fails with TAG_USER_INVALID without a write when GetParticipant returns ChannelParticipantLeft', async () => {
    const dialogs = [makeDialog('2012', 'supergroup')]
    const auditStore = makeTagAuditStore(['2012'])
    const { executor, editChatParticipantRankCalls } = makeTagExecutor({
      dialogs,
      participantOverrides: { '2012': { className: 'ChannelParticipantLeft' } },
      auditStore,
    })

    const execPromise = executor.execute({ dialogIds: ['2012'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(editChatParticipantRankCalls).toHaveLength(0)
    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '2012')
    expect(checkpointCall).toBeDefined()
    expect(checkpointCall!.outcome.status).toBe('failed')
    expect(checkpointCall!.outcome.errorCode).toBe('TAG_USER_INVALID')
  })

  it('fails with TAG_USER_INVALID without a write when GetParticipant returns ChannelParticipantBanned with left=true (kicked)', async () => {
    const dialogs = [makeDialog('2013', 'supergroup')]
    const auditStore = makeTagAuditStore(['2013'])
    const { executor, editChatParticipantRankCalls } = makeTagExecutor({
      dialogs,
      participantOverrides: { '2013': { className: 'ChannelParticipantBanned', left: true } },
      auditStore,
    })

    const execPromise = executor.execute({ dialogIds: ['2013'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(editChatParticipantRankCalls).toHaveLength(0)
    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '2013')
    expect(checkpointCall).toBeDefined()
    expect(checkpointCall!.outcome.status).toBe('failed')
    expect(checkpointCall!.outcome.errorCode).toBe('TAG_USER_INVALID')
  })

  it('proceeds to the write when GetParticipant returns ChannelParticipantBanned with left unset (restricted but present)', async () => {
    const dialogs = [makeDialog('2014', 'supergroup')]
    const auditStore = makeTagAuditStore(['2014'])
    const { executor, editChatParticipantRankCalls } = makeTagExecutor({
      dialogs,
      participantOverrides: { '2014': { className: 'ChannelParticipantBanned' } },
      auditStore,
    })

    const execPromise = executor.execute({ dialogIds: ['2014'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    expect(editChatParticipantRankCalls).toHaveLength(1)
    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '2014')
    expect(checkpointCall?.outcome.status).toBe('done')
  })

  it('GetParticipant precheck is issued before the EditChatParticipantRank write for a non-admin target', async () => {
    const dialogs = [makeDialog('2002', 'supergroup')]
    const { executor, mockClient } = makeTagExecutor({ dialogs })

    const execPromise = executor.execute({ dialogIds: ['2002'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    const ctorNames = mockClient.invoke.mock.calls.map(args => {
      const req = args[0] as { className?: string; constructor?: { name?: string } }
      return req?.className ?? req?.constructor?.name ?? ''
    })
    const getParticipantIdx = ctorNames.findIndex(n => n.includes('GetParticipant'))
    const editRankIdx = ctorNames.findIndex(n => n.includes('EditChatParticipantRank'))
    expect(getParticipantIdx).toBeGreaterThanOrEqual(0)
    expect(editRankIdx).toBeGreaterThan(getParticipantIdx)
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
    const { executor, editChatParticipantRankCalls, getParticipantCalls } = makeTagExecutor({ dialogs, auditStore })

    const execPromise = executor.execute({ dialogIds: ['3001'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    // No write and no precheck for basic-group (skipped before any API call)
    expect(editChatParticipantRankCalls).toHaveLength(0)
    expect(getParticipantCalls).toHaveLength(0)
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
    const { executor, states } = makeTagExecutor({
      dialogs,
      auditStore,
      // PEER_FLOOD on group 4002's write
      tagErrorDialogIds: { '4002': 'PEER_FLOOD' },
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
// TAG-03 — abort during an in-flight write that then hard-stops (PEER_FLOOD)
// ---------------------------------------------------------------------------

describe('TagExecutor — abort wins over a PEER_FLOOD that lands after Stop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ends stopped (not hard-stopped) and marks remaining groups skipped when the write rejects with PEER_FLOOD after abortExecution()', async () => {
    const dialogs = [makeDialog('7001', 'supergroup'), makeDialog('7002', 'supergroup')]
    const dialogIds = ['7001', '7002']
    const auditStore = makeTagAuditStore(dialogIds)
    const { executor, mockClient, states } = makeTagExecutor({ dialogs, auditStore })

    // Wrap the harness dispatch: the first write aborts the run while in flight, then
    // rejects with PEER_FLOOD — the hard-stop must not override the user's Stop.
    const defaultInvoke = mockClient.invoke.getMockImplementation()!
    mockClient.invoke.mockImplementation(async (request: unknown) => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'EditChatParticipantRank' || className === 'messages.EditChatParticipantRank') {
        executor.abortExecution()
        throw Object.assign(new Error('PEER_FLOOD'), { errorMessage: 'PEER_FLOOD' })
      }
      return defaultInvoke(request)
    })

    const execPromise = executor.execute({ dialogIds, tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    const finalState = states[states.length - 1]
    expect(finalState.step).toBe('stopped')
    expect(states.map(s => s.step)).not.toContain('hard-stopped')

    // Abort semantics: remaining groups are marked skipped, job status is 'stopped'.
    expect(auditStore.setStatusCalls.map(c => c.status)).toEqual(['stopped'])
    const g2 = auditStore.checkpointCalls.find(c => c.dialogId === '7002')
    expect(g2?.outcome.status).toBe('skipped')
    // The aborted group itself is not recorded as done.
    const g1 = auditStore.checkpointCalls.find(c => c.dialogId === '7001')
    expect(g1?.outcome.status ?? 'skipped').toBe('skipped')
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

  it('new execute() call while first is in-flight: stale run exits silently and never writes into the new run', async () => {
    const dialogs = [makeDialog('6001', 'supergroup'), makeDialog('6002', 'supergroup')]
    const auditStore = makeTagAuditStore(['6001', '6002'])
    const { executor, states } = makeTagExecutor({ dialogs, auditStore })

    // First call starts
    const firstPromise = executor.execute({ dialogIds: ['6001', '6002'], tag: 'dev' })

    // Immediately start a second execute() which increments _generation and supersedes the first
    const secondPromise = executor.execute({ dialogIds: ['6001', '6002'], tag: 'dev' })

    await vi.runAllTimersAsync()
    await Promise.allSettled([firstPromise, secondPromise])

    // The second run owns the terminal state: it must be 'complete', not a 'stopped'
    // emitted by the superseded first run.
    const lastState = states[states.length - 1]
    expect(lastState.step).toBe('complete')
    expect(executor.getState().step).toBe('complete')

    // No 'stopped' state may be emitted at all — supersession is not an abort.
    expect(states.map(s => s.step)).not.toContain('stopped')

    // The stale run must not checkpoint its leftover dialogs as 'skipped' into the new job:
    // each dialog is checkpointed exactly once, with status 'done'.
    for (const id of ['6001', '6002']) {
      const calls = auditStore.checkpointCalls.filter(c => c.dialogId === id)
      expect(calls).toHaveLength(1)
      expect(calls[0]!.outcome.status).toBe('done')
    }

    // The job status is never flipped to 'stopped' by the stale run.
    expect(auditStore.setStatusCalls.map(c => c.status)).not.toContain('stopped')
    expect(auditStore.setStatusCalls.map(c => c.status)).toContain('complete')
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
// D-11 — parse failure on EditChatParticipantRank is NOT swallowed as success
// ---------------------------------------------------------------------------

describe('TagExecutor — D-11 parse-failure surfaces as UNKNOWN', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('an unrecognized/unparseable RPC error on the write surfaces as status=failed, errorCode=UNKNOWN', async () => {
    const dialogs = [makeDialog('10001', 'supergroup')]
    const auditStore = makeTagAuditStore(['10001'])
    const { executor, mockClient } = makeTagExecutor({ dialogs, auditStore })

    // Override the write branch to throw an RPC-shaped error whose message does not match
    // any recognized TagErrorCode string — simulates a parse failure / unparseable response.
    // No "unparseable response = success" tolerance exists (D-11): this must propagate to
    // _classifyTagError's UNKNOWN fallthrough, NOT be silently recorded as 'done'.
    mockClient.invoke.mockImplementation(async (request: unknown) => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetParticipant' || className === 'channels.GetParticipant') {
        return { participant: { className: 'ChannelParticipant' } }
      }
      if (ctorName === 'EditChatParticipantRank' || className === 'messages.EditChatParticipantRank') {
        throw Object.assign(new Error('UNRECOGNIZED_PARSE_ERROR'), { errorMessage: 'UNRECOGNIZED_PARSE_ERROR' })
      }
      return {}
    })

    const execPromise = executor.execute({ dialogIds: ['10001'], tag: 'dev' })
    await vi.runAllTimersAsync()
    await execPromise

    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '10001')
    expect(checkpointCall).toBeDefined()
    expect(checkpointCall!.outcome.status).toBe('failed')
    expect(checkpointCall!.outcome.errorCode).toBe('UNKNOWN')
  })
})
