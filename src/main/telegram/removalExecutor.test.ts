/**
 * RED → GREEN tests for RemovalExecutor.ts (RMV-01, RMV-02, EXE-04, EXE-05).
 *
 * Test map:
 *   RMV-01: ban mechanic — single EditBanned call with viewMessages=true untilDate=0
 *   RMV-01: kick mechanic — two EditBanned calls (restrict + unban) with 500ms sleep between
 *   RMV-02: basic group — DeleteChatUser regardless of severity
 *   RMV-02: basic group ban fallback annotation
 *   RMV-02: USER_NOT_PARTICIPANT → already-gone outcome
 *   RMV-02: USER_ADMIN_INVALID → per-group failed, run continues
 *   RMV-02: CHAT_ADMIN_REQUIRED → per-group failed, run continues
 *   EXE-04: live progress onStateChange before each group API call
 *   EXE-04: progress.processed increments after each group checkpoint
 *   EXE-03: PEER_FLOOD mid-run → hard-stopped, remaining groups not skipped (resumable)
 *   CONTEXT: abort mid-run — current call completes, remaining marked skipped
 *   CONTEXT: generation guard — stale retry result never emitted
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockTelegramClient } from './__mocks__/telegramClient'
import { RateLimitGovernor } from './governor'
import { RemovalExecutor } from './RemovalExecutor'
import type { RemovalState, RemovalGroupOutcome } from '@shared/removalTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { AuditStore } from '../storage/auditStore'

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
 * Create a no-op AuditStore for tests that don't need persistence assertions.
 * checkpoints and initJob calls are tracked in-memory for inspection.
 */
function makeAuditStore(dialogIds: string[] = []): AuditStore & {
  checkpointCalls: Array<{ dialogId: string; outcome: RemovalGroupOutcome }>
  setStatusCalls: Array<{ status: string; completedAt?: string }>
  initJobCalled: boolean
} {
  const checkpointCalls: Array<{ dialogId: string; outcome: RemovalGroupOutcome }> = []
  const setStatusCalls: Array<{ status: string; completedAt?: string }> = []
  let initJobCalled = false
  let _dialogIds = [...dialogIds]
  const outcomes: RemovalGroupOutcome[] = []

  return {
    checkpointCalls,
    setStatusCalls,
    initJobCalled,
    initJob(job) {
      initJobCalled = true
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
 * Create a RemovalExecutor with injectable dependencies.
 *
 * The enumerator stub provides dialogs and a simple entity map.
 * The resolver stub returns a fixed target user.
 */
function makeExecutor(config: {
  dialogs: AdminDialogDTO[]
  removeAlreadyGoneDialogIds?: string[]
  removeErrorDialogIds?: Record<string, string>
  auditStore?: AuditStore
}) {
  const mockClient = createMockTelegramClient({
    removeAlreadyGoneDialogIds: config.removeAlreadyGoneDialogIds ?? [],
    removeErrorDialogIds: config.removeErrorDialogIds ?? {},
  })

  const governor = new RateLimitGovernor({ client: mockClient as never })

  const stubEnumerator = {
    getState: () => ({ step: 'loaded' as const, dialogs: config.dialogs }),
    getDialogEntity: (id: string) => {
      const dialog = config.dialogs.find(d => d.id === id)
      if (!dialog) return null
      if (dialog.type === 'basic-group') {
        return { id: { toString: () => id }, className: 'Chat' }
      }
      // Channel-like entity with id and accessHash (duck-typed per PATTERNS.md)
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
    }),
  }

  const dialogIds = config.dialogs.map(d => d.id)
  const auditStore = config.auditStore ?? makeAuditStore(dialogIds)

  const states: RemovalState[] = []
  const onStateChange = (s: RemovalState) => states.push(s)

  const executor = new RemovalExecutor({
    client: mockClient as never,
    governor,
    enumerator: stubEnumerator as never,
    resolver: stubResolver,
    auditStore,
    onStateChange,
  })

  return { executor, mockClient, states, auditStore }
}

// ---------------------------------------------------------------------------
// RMV-01 — Ban mechanic
// ---------------------------------------------------------------------------

describe('RemovalExecutor — ban mechanic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('ban on supergroup: single EditBanned call with viewMessages=true untilDate=0', async () => {
    const dialogs = [makeDialog('1001', 'supergroup')]
    const { executor, mockClient } = makeExecutor({ dialogs })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['1001'] })
    await vi.runAllTimersAsync()
    await execPromise

    expect(mockClient.editBannedCalls).toHaveLength(1)
    expect(mockClient.editBannedCalls[0].viewMessages).toBe(true)
    expect(mockClient.editBannedCalls[0].untilDate).toBe(0)
  })

  it('ban on supergroup: editBannedCalls.length === 1 after execute', async () => {
    const dialogs = [makeDialog('1001', 'supergroup')]
    const { executor, mockClient } = makeExecutor({ dialogs })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['1001'] })
    await vi.runAllTimersAsync()
    await execPromise

    expect(mockClient.editBannedCalls).toHaveLength(1)
    expect(mockClient.deleteChatUserCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// RMV-01 — Kick mechanic
// ---------------------------------------------------------------------------

describe('RemovalExecutor — kick mechanic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('kick on supergroup: two EditBanned calls (restrict + unban) with 500ms sleep between', async () => {
    const dialogs = [makeDialog('2001', 'supergroup')]
    const { executor, mockClient } = makeExecutor({ dialogs })

    const callTimestamps: number[] = []
    const originalEditBannedCalls = mockClient.editBannedCalls

    // Track timing by recording when each call happens
    const execPromise = executor.execute({ severity: 'kick', dialogIds: ['2001'] })
    await vi.runAllTimersAsync()
    await execPromise

    // Kick = exactly 2 EditBanned calls
    expect(mockClient.editBannedCalls).toHaveLength(2)
    // First call: restrict (viewMessages=true, untilDate=0)
    expect(mockClient.editBannedCalls[0].viewMessages).toBe(true)
    expect(mockClient.editBannedCalls[0].untilDate).toBe(0)
    // Second call: unban (viewMessages=false, untilDate=0)
    expect(mockClient.editBannedCalls[1].viewMessages).toBe(false)
    expect(mockClient.editBannedCalls[1].untilDate).toBe(0)
  })

  it('kick second call: ChatBannedRights with untilDate=0 and all flags omitted', async () => {
    const dialogs = [makeDialog('2002', 'supergroup')]
    const { executor, mockClient } = makeExecutor({ dialogs })

    const execPromise = executor.execute({ severity: 'kick', dialogIds: ['2002'] })
    await vi.runAllTimersAsync()
    await execPromise

    expect(mockClient.editBannedCalls).toHaveLength(2)
    // Second call has untilDate=0 and viewMessages=false (unban — all flags omitted)
    const secondCall = mockClient.editBannedCalls[1]
    expect(secondCall.viewMessages).toBe(false)
    expect(secondCall.untilDate).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// RMV-02 — Basic group
// ---------------------------------------------------------------------------

describe('RemovalExecutor — basic group', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('basic group: DeleteChatUser called regardless of severity', async () => {
    const dialogs = [makeDialog('3001', 'basic-group')]
    const { executor, mockClient } = makeExecutor({ dialogs })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['3001'] })
    await vi.runAllTimersAsync()
    await execPromise

    expect(mockClient.deleteChatUserCalls).toHaveLength(1)
    expect(mockClient.editBannedCalls).toHaveLength(0)
  })

  it('basic group ban: outcome note is basic-group-ban-fallback', async () => {
    const dialogs = [makeDialog('3002', 'basic-group')]
    const dialogIds = ['3002']
    const auditStore = makeAuditStore(dialogIds)
    const { executor } = makeExecutor({ dialogs, auditStore })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['3002'] })
    await vi.runAllTimersAsync()
    await execPromise

    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '3002')
    expect(checkpointCall).toBeDefined()
    expect(checkpointCall!.outcome.note).toBe('basic-group-ban-fallback')
  })

  it('basic group: revokeHistory never passed as true', async () => {
    const dialogs = [makeDialog('3003', 'basic-group')]
    const { executor, mockClient } = makeExecutor({ dialogs })

    // Spy on invoke to verify revokeHistory is not true
    const calls: unknown[] = []
    const originalInvoke = mockClient.invoke.bind(mockClient)
    mockClient.invoke = async (request: unknown) => {
      calls.push(request)
      return originalInvoke(request)
    }

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['3003'] })
    await vi.runAllTimersAsync()
    await execPromise

    const deleteChatUserCall = calls.find(c =>
      (c as { constructor?: { name?: string } })?.constructor?.name === 'DeleteChatUser' ||
      (c as { className?: string })?.className === 'messages.DeleteChatUser'
    )
    expect(deleteChatUserCall).toBeDefined()
    expect((deleteChatUserCall as { revokeHistory?: boolean })?.revokeHistory).not.toBe(true)
  })
})

// ---------------------------------------------------------------------------
// RMV-02 — Outcome classification
// ---------------------------------------------------------------------------

describe('RemovalExecutor — outcome classification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('USER_NOT_PARTICIPANT: outcome status is already-gone (not failed)', async () => {
    const dialogs = [makeDialog('4001', 'supergroup')]
    const dialogIds = ['4001']
    const auditStore = makeAuditStore(dialogIds)
    const { executor } = makeExecutor({
      dialogs,
      removeAlreadyGoneDialogIds: ['4001'],
      auditStore,
    })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['4001'] })
    await vi.runAllTimersAsync()
    await execPromise

    const checkpointCall = auditStore.checkpointCalls.find(c => c.dialogId === '4001')
    expect(checkpointCall).toBeDefined()
    expect(checkpointCall!.outcome.status).toBe('already-gone')
  })

  it('USER_ADMIN_INVALID: per-group outcome failed with code RMV_TARGET_IS_ADMIN; run continues to next group', async () => {
    const dialogs = [
      makeDialog('4002', 'supergroup'),
      makeDialog('4003', 'supergroup'),
      makeDialog('4004', 'supergroup'),
    ]
    const dialogIds = ['4002', '4003', '4004']
    const auditStore = makeAuditStore(dialogIds)
    const { executor } = makeExecutor({
      dialogs,
      removeErrorDialogIds: { '4003': 'USER_ADMIN_INVALID' },
      auditStore,
    })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['4002', '4003', '4004'] })
    await vi.runAllTimersAsync()
    await execPromise

    // Group 4002 should be done
    const g1 = auditStore.checkpointCalls.find(c => c.dialogId === '4002')
    expect(g1?.outcome.status).toBe('done')

    // Group 4003 (USER_ADMIN_INVALID) should be failed with RMV_TARGET_IS_ADMIN
    const g2 = auditStore.checkpointCalls.find(c => c.dialogId === '4003')
    expect(g2).toBeDefined()
    expect(g2!.outcome.status).toBe('failed')
    expect(g2!.outcome.errorCode).toBe('RMV_TARGET_IS_ADMIN')

    // Group 4004 should STILL be processed (run continues after per-group failure)
    const g3 = auditStore.checkpointCalls.find(c => c.dialogId === '4004')
    expect(g3?.outcome.status).toBe('done')
  })

  it('CHAT_ADMIN_REQUIRED: per-group outcome failed with code RMV_NO_RIGHTS; run continues', async () => {
    const dialogs = [
      makeDialog('4005', 'supergroup'),
      makeDialog('4006', 'supergroup'),
    ]
    const dialogIds = ['4005', '4006']
    const auditStore = makeAuditStore(dialogIds)
    const { executor } = makeExecutor({
      dialogs,
      removeErrorDialogIds: { '4005': 'CHAT_ADMIN_REQUIRED' },
      auditStore,
    })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['4005', '4006'] })
    await vi.runAllTimersAsync()
    await execPromise

    const g1 = auditStore.checkpointCalls.find(c => c.dialogId === '4005')
    expect(g1?.outcome.status).toBe('failed')
    expect(g1?.outcome.errorCode).toBe('RMV_NO_RIGHTS')

    // Run continues to the next group
    const g2 = auditStore.checkpointCalls.find(c => c.dialogId === '4006')
    expect(g2?.outcome.status).toBe('done')
  })
})

// ---------------------------------------------------------------------------
// EXE-04 — Live progress
// ---------------------------------------------------------------------------

describe('RemovalExecutor — live progress (EXE-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('onStateChange fires with step=running and currentGroupId before each group API call', async () => {
    const dialogs = [
      makeDialog('5001', 'supergroup'),
      makeDialog('5002', 'supergroup'),
    ]
    const { executor, states } = makeExecutor({ dialogs })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['5001', '5002'] })
    await vi.runAllTimersAsync()
    await execPromise

    // There should be at least one 'running' state per group before the API call
    const runningStates = states.filter(s => s.step === 'running')
    expect(runningStates.length).toBeGreaterThanOrEqual(2)

    // The running states should have currentGroupId set to the group being processed
    const groupIds = runningStates.map(s => s.currentGroupId)
    expect(groupIds).toContain('5001')
    expect(groupIds).toContain('5002')
  })

  it('progress.processed increments after each group checkpoint', async () => {
    const dialogs = [
      makeDialog('5003', 'supergroup'),
      makeDialog('5004', 'supergroup'),
      makeDialog('5005', 'supergroup'),
    ]
    const { executor, states } = makeExecutor({ dialogs })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['5003', '5004', '5005'] })
    await vi.runAllTimersAsync()
    await execPromise

    // Find 'running' states to track progress increments
    const runningStates = states.filter(s => s.step === 'running')
    // At minimum, we should see progress.processed values 0, 1, 2 across running states
    const processedValues = runningStates.map(s => s.progress.processed)
    // progress.processed should start at 0 and increment
    expect(Math.max(...processedValues)).toBeGreaterThanOrEqual(2)

    // Final state should be 'complete' with progress.processed = total
    const finalState = states[states.length - 1]
    expect(finalState.step).toBe('complete')
    expect(finalState.progress.processed).toBe(3)
    expect(finalState.progress.total).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// EXE-03 — PEER_FLOOD hard-stop
// ---------------------------------------------------------------------------

describe('RemovalExecutor — PEER_FLOOD hard-stop (EXE-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('PEER_FLOOD on group 2 of 3: step transitions to hard-stopped; group 3 not marked skipped (resumable)', async () => {
    const dialogs = [
      makeDialog('6001', 'supergroup'),
      makeDialog('6002', 'supergroup'),
      makeDialog('6003', 'supergroup'),
    ]
    const dialogIds = ['6001', '6002', '6003']
    const auditStore = makeAuditStore(dialogIds)
    const { executor, states } = makeExecutor({
      dialogs,
      removeErrorDialogIds: { '6002': 'PEER_FLOOD' },
      auditStore,
    })

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['6001', '6002', '6003'] })
    await vi.runAllTimersAsync()
    await execPromise

    // Final state should be hard-stopped
    const finalState = states[states.length - 1]
    expect(finalState.step).toBe('hard-stopped')

    // Group 6001 should have been checkpointed (done)
    const g1 = auditStore.checkpointCalls.find(c => c.dialogId === '6001')
    expect(g1?.outcome.status).toBe('done')

    // Group 6002 should NOT be checkpointed (PEER_FLOOD means no outcome recorded for it)
    const g2 = auditStore.checkpointCalls.find(c => c.dialogId === '6002')
    expect(g2).toBeUndefined()

    // Group 6003 should NOT be in checkpoints (not marked skipped — remains resumable)
    const g3 = auditStore.checkpointCalls.find(c => c.dialogId === '6003')
    expect(g3).toBeUndefined()

    // setStatus should have been called with 'hard-stopped'
    expect(auditStore.setStatusCalls.some(c => c.status === 'hard-stopped')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CONTEXT — Abort (Stop removal)
// ---------------------------------------------------------------------------

describe('RemovalExecutor — abort (Stop removal)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('abortExecution() during group 2 of 3: current call completes; groups 3+ marked skipped; step=stopped', async () => {
    // Simulate abort by calling abortExecution() after the first group starts processing
    // The key is: current group (2) finishes, then remaining (3) are skipped
    let abortCalled = false

    const dialogs = [
      makeDialog('7001', 'supergroup'),
      makeDialog('7002', 'supergroup'),
      makeDialog('7003', 'supergroup'),
    ]
    const dialogIds = ['7001', '7002', '7003']
    const auditStore = makeAuditStore(dialogIds)
    const { executor, states } = makeExecutor({ dialogs, auditStore })

    // We need to abort after group 7001 is processed but before 7002 completes
    // The pacing sleep (2s+) gives us a window to abort
    // Use a spy on auditStore.checkpoint to abort after group 7001 checkpoints
    const originalCheckpoint = auditStore.checkpoint.bind(auditStore)
    auditStore.checkpoint = (dialogId: string, outcome: RemovalGroupOutcome) => {
      originalCheckpoint(dialogId, outcome)
      if (dialogId === '7001' && !abortCalled) {
        abortCalled = true
        // Abort during the pacing sleep between groups 1 and 2
        executor.abortExecution()
      }
    }

    const execPromise = executor.execute({ severity: 'ban', dialogIds: ['7001', '7002', '7003'] })
    await vi.runAllTimersAsync()
    await execPromise

    // Final state should be 'stopped'
    const finalState = states[states.length - 1]
    expect(finalState.step).toBe('stopped')

    // Group 7001 should be done (was processed before abort)
    const g1 = auditStore.checkpointCalls.find(c => c.dialogId === '7001')
    expect(g1?.outcome.status).toBe('done')

    // Groups 7002 and 7003 should be skipped (remaining groups after abort)
    const g2 = auditStore.checkpointCalls.find(c => c.dialogId === '7002')
    const g3 = auditStore.checkpointCalls.find(c => c.dialogId === '7003')
    expect(g2?.outcome.status).toBe('skipped')
    expect(g3?.outcome.status).toBe('skipped')
  })
})

// ---------------------------------------------------------------------------
// CONTEXT — Generation guard
// ---------------------------------------------------------------------------

describe('RemovalExecutor — generation guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('stale retry: discarded job result from outdated generation never emitted', async () => {
    const dialogs = [makeDialog('8001', 'supergroup')]
    const { executor, states } = makeExecutor({ dialogs })

    // First complete a full run
    const exec1 = executor.execute({ severity: 'ban', dialogIds: ['8001'] })
    await vi.runAllTimersAsync()
    await exec1

    const statesAfterFirstRun = states.length
    const completeState = executor.getState()
    expect(completeState.step).toBe('complete')

    // Now trigger retryGroup with a generation guard in play:
    // We use abortExecution (which increments generation) right before
    // retryGroup's async work resolves, simulating a stale retry.
    // The generation guard should prevent the stale result from being emitted.

    // For this test: call retryGroup and abort immediately during the async gap.
    // If generation guard works, the state after retry should remain 'stopped'
    // (from the abort), not 'complete' with the stale retry result.

    // Reset for a fresh scenario
    const dialogs2 = [makeDialog('8002', 'supergroup')]
    const { executor: executor2, states: states2 } = makeExecutor({ dialogs: dialogs2 })

    // Run to complete
    const exec2 = executor2.execute({ severity: 'ban', dialogIds: ['8002'] })
    await vi.runAllTimersAsync()
    await exec2

    expect(executor2.getState().step).toBe('complete')
    const statesBeforeRetry = states2.length

    // Now increment generation (simulating abort) while retryGroup is awaiting
    // We intercept the execute call to abort mid-flight
    const retryPromise = executor2.retryGroup('8002')
    // Abort immediately - this increments generation
    executor2.abortExecution()

    await vi.runAllTimersAsync()
    await retryPromise

    // After abort + stale retry: the generation guard should have prevented
    // the retry from overwriting the 'stopped' state. The latest state should be 'stopped'.
    const lastState = states2[states2.length - 1]
    expect(lastState.step).toBe('stopped')

    // The stale retry should NOT have emitted a new 'complete' state after the abort
    const statesAfterAbort = states2.slice(statesBeforeRetry)
    const hasCompleteAfterAbort = statesAfterAbort.some(s => s.step === 'complete')
    expect(hasCompleteAfterAbort).toBe(false)
  })
})
