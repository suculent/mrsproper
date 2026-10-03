/**
 * Tests for AddExecutor.ts (ADD-06..ADD-11, ADD-14) — RED phase (Plan 14-07).
 *
 * AddExecutor.ts does NOT exist yet. This file is importable TypeScript but every test
 * fails at import time with "Cannot find module './AddExecutor'" — that is the expected
 * RED state. No implementation is created by this plan.
 *
 * Test map (every behavior from D-01 through D-20 in 14-CONTEXT.md gets >=1 failing test):
 *   describe('AddExecutor — per-group dispatch (ADD-06, D-02)')
 *   describe('AddExecutor — unban-before-invite (ADD-07, D-02/D-04)')
 *   describe('AddExecutor — D-05 pre-flight deleted/bot guard')
 *   describe('AddExecutor — already-member (D-06, dual signal)')
 *   describe('AddExecutor — privacy-blocked + inline link export (ADD-10, D-07/D-09/D-10)')
 *   describe('AddExecutor — channel-full branching (ADD-09, D-12, Open Question 2 RESOLVED)')
 *   describe('AddExecutor — error classification (ADD-09, D-19)')
 *   describe('AddExecutor — PEER_FLOOD hard-stop, abort, generation guard (mirrors TagExecutor exactly)')
 *   describe('AddExecutor — continuation-based resume (ADD-08, D-20)')
 *   describe('AddExecutor — end-of-run DM dispatch (ADD-11, D-13/D-14)')
 *   describe('AddExecutor — add-log append (ADD-14, D-17/D-18)')
 *   describe('AddExecutor — retryGroup (mirrors RemovalExecutor.retryGroup)')
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bigInt from 'big-integer'
import { RateLimitGovernor } from './governor'
import { createMockTelegramClient, type MockClientConfig } from './__mocks__/telegramClient'
import { AddExecutor } from './AddExecutor'
import { sameDialogIdSet } from '../storage/addAuditStore'
import type { AddState, AddGroupOutcome, AddJobFile, AddLogBlockEntry } from '@shared/addTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { AddAuditStore } from '../storage/addAuditStore'

// Silence an "unused import" complaint for environments that type-check this RED file —
// bigInt is used by several resolved-user fixtures below.
void bigInt

// ---------------------------------------------------------------------------
// Test factory helpers
// ---------------------------------------------------------------------------

function makeDialog(
  id: string,
  type: 'basic-group' | 'supergroup' | 'broadcast-channel' = 'supergroup'
): AdminDialogDTO {
  return {
    id,
    title: 'Group ' + id,
    avatar: null,
    memberCount: null,
    type,
    canAct: true,
    greyReason: null,
    canAdd: true,
    addGreyReason: null,
  }
}

/** Extract a human-readable constructor/className tag off a mock invoke() request. */
function ctorNameOf(request: unknown): string {
  const r = request as { className?: string; constructor?: { name?: string } }
  return r?.className ?? r?.constructor?.name ?? ''
}

/**
 * In-memory instrumented fake implementing the AddAuditStore interface.
 * `existing` seeds `_job` for continuation-resume tests; omitted means no job on disk.
 */
function makeAddAuditStore(
  dialogIds: string[],
  existing?: Partial<AddJobFile>
): AddAuditStore & {
  initJobCalls: AddJobFile[]
  checkpointCalls: Array<{ dialogId: string; outcome: AddGroupOutcome }>
  setStatusCalls: Array<{ status: AddJobFile['status']; completedAt?: string }>
  _job: AddJobFile | null
} {
  const initJobCalls: AddJobFile[] = []
  const checkpointCalls: Array<{ dialogId: string; outcome: AddGroupOutcome }> = []
  const setStatusCalls: Array<{ status: AddJobFile['status']; completedAt?: string }> = []

  const seeded: AddJobFile | null = existing
    ? ({
        schemaVersion: 1,
        jobId: 'SEEDED-JOB-ID',
        targetId: '99',
        targetName: 'Jan Novák',
        targetAccessHash: '12345',
        dialogIds,
        outcomes: [],
        dmStatus: 'pending',
        startedAt: new Date().toISOString(),
        status: 'running',
        ...existing,
      } as AddJobFile)
    : null

  const state: { job: AddJobFile | null } = { job: seeded }

  return {
    initJobCalls,
    checkpointCalls,
    setStatusCalls,
    get _job(): AddJobFile | null {
      return state.job
    },
    initJob(job: AddJobFile): void {
      initJobCalls.push(job)
      state.job = { ...job, outcomes: [...job.outcomes] }
    },
    checkpoint(dialogId: string, outcome: AddGroupOutcome): void {
      checkpointCalls.push({ dialogId, outcome })
      if (state.job) {
        state.job = { ...state.job, outcomes: [...state.job.outcomes, { ...outcome, dialogId }] }
      }
    },
    setStatus(status: AddJobFile['status'], completedAt?: string): void {
      setStatusCalls.push({ status, completedAt })
      if (state.job) {
        state.job = { ...state.job, status, ...(completedAt !== undefined ? { completedAt } : {}) }
      }
    },
    readJob(): AddJobFile | null {
      return state.job
    },
    clearJob(): void {
      state.job = null
    },
    getRemaining(): string[] {
      if (!state.job) return []
      const done = new Set(state.job.outcomes.map((o) => o.dialogId))
      return state.job.dialogIds.filter((id) => !done.has(id))
    },
  }
}

/** { appendBlockCalls, appendBlock } fake for AddLogStore, per plan Action item 4. */
function makeAddLogStore(): { appendBlockCalls: AddLogBlockEntry[]; appendBlock: (entry: AddLogBlockEntry) => void } {
  const appendBlockCalls: AddLogBlockEntry[] = []
  return {
    appendBlockCalls,
    appendBlock: vi.fn((entry: AddLogBlockEntry) => {
      appendBlockCalls.push(entry)
    }),
  }
}

/** The instrumented AddAuditStore fake's full return type — used to avoid TypeScript
 *  widening `config.auditStore ?? makeAddAuditStore(...)` down to the bare AddAuditStore
 *  interface (which would drop checkpointCalls/initJobCalls/setStatusCalls/_job). */
type InstrumentedAddAuditStore = ReturnType<typeof makeAddAuditStore>

/** Scanner stub — mirrors MembershipScanner's getState() shape (Phase 13). */
function makeScanner(
  results: Array<{ dialogId: string; status: 'member' | 'not-member' | 'banned' | 'pending' | 'failed' }>
) {
  return { getState: () => ({ step: 'complete' as const, results }) }
}

interface ResolvedUserFixture {
  id: bigint
  accessHash: bigint
  name: string
  deleted: boolean
  bot: boolean
  contact: boolean
}

/**
 * Build an AddExecutor with fully injectable dependencies.
 * Mirrors TagExecutor/RemovalExecutor's test-factory convention (makeDialog/makeAuditStore/
 * makeExecutor), adapted per this plan's <action> item 6.
 */
function makeExecutor(config: {
  dialogs: AdminDialogDTO[]
  mockConfig?: MockClientConfig
  resolved?: ResolvedUserFixture
  scanResults?: Array<{ dialogId: string; status: 'member' | 'not-member' | 'banned' | 'pending' | 'failed' }>
  auditStore?: InstrumentedAddAuditStore
  addLogStore?: { appendBlockCalls: AddLogBlockEntry[]; appendBlock: (entry: AddLogBlockEntry) => void }
  getDmText?: (vars: { name: string; links: string }) => string
}) {
  const mockClient = createMockTelegramClient(config.mockConfig ?? {})
  const governor = new RateLimitGovernor({ client: mockClient as never })

  const stubEnumerator = {
    getState: () => ({ step: 'loaded' as const, dialogs: config.dialogs }),
    getDialogEntity: (id: string) =>
      config.dialogs.find((d) => d.id === id)?.type === 'basic-group'
        ? { id: { toString: () => id } }
        : { id: { toString: () => id }, accessHash: { toString: () => '0' } },
  }

  const stubResolver = {
    getResolvedUser: () =>
      config.resolved ?? {
        id: BigInt('99'),
        accessHash: BigInt('12345'),
        name: 'Jan Novák',
        deleted: false,
        bot: false,
        contact: false,
      },
  }

  const stubScanner = makeScanner(config.scanResults ?? [])
  const auditStore = config.auditStore ?? makeAddAuditStore(config.dialogs.map((d) => d.id))
  const addLogStore = config.addLogStore ?? makeAddLogStore()
  const getDmText =
    config.getDmText ?? ((vars: { name: string; links: string }) => 'Hi ' + vars.name + '\n' + vars.links)

  const states: AddState[] = []

  const executor = new AddExecutor({
    client: mockClient,
    governor,
    enumerator: stubEnumerator as never,
    scanner: stubScanner as never,
    resolver: stubResolver,
    auditStore,
    addLogStore,
    getDmText,
    onStateChange: (s: AddState) => states.push(s),
  })

  return {
    executor,
    mockClient,
    governor,
    auditStore,
    addLogStore,
    states,
    dialogIds: config.dialogs.map((d) => d.id),
  }
}

// ---------------------------------------------------------------------------
// AddExecutor — per-group dispatch (ADD-06, D-02)
// ---------------------------------------------------------------------------

describe('AddExecutor — per-group dispatch (ADD-06, D-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('basic-group: calls messages.AddChatUser with fwdLimit 1000 on the first attempt', async () => {
    const dialogs = [makeDialog('3001', 'basic-group')]
    const { executor, mockClient } = makeExecutor({ dialogs })

    const p = executor.execute({ dialogIds: ['3001'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.addChatUserCalls).toHaveLength(1)
    expect(mockClient.addChatUserCalls[0]!.fwdLimit).toBe(1000)
  })

  it('basic-group: on an unrecognized first-attempt error, retries exactly once with fwdLimit 100 (D-03)', async () => {
    const dialogs = [makeDialog('3002', 'basic-group')]
    const { executor, mockClient } = makeExecutor({
      dialogs,
      mockConfig: { addChatUserErrorDialogIds: { '3002': 'SOME_UNRECOGNIZED_FWD_LIMIT_ERROR' } },
    })

    const p = executor.execute({ dialogIds: ['3002'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.addChatUserCalls).toHaveLength(2)
    expect(mockClient.addChatUserCalls[0]!.fwdLimit).toBe(1000)
    expect(mockClient.addChatUserCalls[1]!.fwdLimit).toBe(100)
  })

  it('basic-group: a recognized terminal error (CHAT_ADMIN_REQUIRED) on the first attempt does NOT trigger the fwd_limit retry', async () => {
    const dialogs = [makeDialog('3003', 'basic-group')]
    const { executor, mockClient, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { addChatUserErrorDialogIds: { '3003': 'CHAT_ADMIN_REQUIRED' } },
    })

    const p = executor.execute({ dialogIds: ['3003'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.addChatUserCalls).toHaveLength(1)
    const checkpointCall = auditStore.checkpointCalls.find((c) => c.dialogId === '3003')
    expect(checkpointCall?.outcome.status).toBe('failed')
    expect(checkpointCall?.outcome.errorCode).toBe('ADD_NO_RIGHTS')
  })

  it('supergroup/broadcast-channel: calls channels.InviteToChannel with InputChannel + InputPeerUser from the entity map and resolver — never bigInt.zero for the user', async () => {
    const dialogs = [makeDialog('4001', 'supergroup'), makeDialog('4002', 'broadcast-channel')]
    const { executor, mockClient } = makeExecutor({ dialogs })

    const p = executor.execute({ dialogIds: ['4001', '4002'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.inviteToChannelCalls).toHaveLength(2)
    for (const call of mockClient.inviteToChannelCalls) {
      expect(call.userIds).toEqual(['99'])
      expect(call.userIds).not.toContain('0')
    }
  })

  it('emits step:running with currentGroupId for each group being processed', async () => {
    const dialogs = [makeDialog('4003', 'supergroup'), makeDialog('4004', 'supergroup')]
    const { executor, states } = makeExecutor({ dialogs })

    const p = executor.execute({ dialogIds: ['4003', '4004'] })
    await vi.runAllTimersAsync()
    await p

    const runningStates = states.filter((s) => s.step === 'running')
    const groupIds = runningStates.map((s) => s.currentGroupId)
    expect(groupIds).toContain('4003')
    expect(groupIds).toContain('4004')
  })

  it('checkpoints each outcome to auditStore BEFORE the ~3s (2000-3000ms) inter-group pacing sleep fires', async () => {
    const dialogs = [makeDialog('4005', 'supergroup')]
    const auditStore = makeAddAuditStore(['4005'])
    const { executor } = makeExecutor({ dialogs, auditStore })

    let checkpointedBeforeSleep = false
    const originalCheckpoint = auditStore.checkpoint.bind(auditStore)
    auditStore.checkpoint = (dialogId: string, outcome: AddGroupOutcome) => {
      checkpointedBeforeSleep = true
      originalCheckpoint(dialogId, outcome)
    }

    const p = executor.execute({ dialogIds: ['4005'] })
    await vi.runAllTimersAsync()
    await p

    expect(checkpointedBeforeSleep).toBe(true)
    expect(auditStore.checkpointCalls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — unban-before-invite (ADD-07, D-02/D-04)
// ---------------------------------------------------------------------------

describe('AddExecutor — unban-before-invite (ADD-07, D-02/D-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a supergroup with scanner status "banned": issues EditBanned (empty rights) BEFORE InviteToChannel, as two separate governor.run() calls', async () => {
    const dialogs = [makeDialog('5001', 'supergroup')]
    const { executor, mockClient } = makeExecutor({
      dialogs,
      scanResults: [{ dialogId: '5001', status: 'banned' }],
    })

    const invokeSpy = vi.spyOn(mockClient, 'invoke')

    const p = executor.execute({ dialogIds: ['5001'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.editBannedCalls).toHaveLength(1)
    expect(mockClient.editBannedCalls[0]!.viewMessages).toBe(false)
    expect(mockClient.editBannedCalls[0]!.untilDate).toBe(0)
    expect(mockClient.inviteToChannelCalls).toHaveLength(1)

    const ctorNames = invokeSpy.mock.calls.map((args) => ctorNameOf(args[0]))
    const editIdx = ctorNames.findIndex((n) => n.includes('EditBanned'))
    const inviteIdx = ctorNames.findIndex((n) => n.includes('InviteToChannel'))
    expect(editIdx).toBeGreaterThanOrEqual(0)
    expect(inviteIdx).toBeGreaterThan(editIdx)
  })

  it('a supergroup NOT flagged banned by the scanner: issues InviteToChannel directly, with zero EditBanned calls', async () => {
    const dialogs = [makeDialog('5002', 'supergroup')]
    const { executor, mockClient } = makeExecutor({
      dialogs,
      scanResults: [{ dialogId: '5002', status: 'not-member' }],
    })

    const p = executor.execute({ dialogIds: ['5002'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.editBannedCalls).toHaveLength(0)
    expect(mockClient.inviteToChannelCalls).toHaveLength(1)
  })

  it('D-04: if EditBanned succeeds but the subsequent InviteToChannel fails, the outcome is failed and NO second (re-ban) EditBanned call is ever issued', async () => {
    const dialogs = [makeDialog('5003', 'supergroup')]
    const { executor, mockClient, auditStore } = makeExecutor({
      dialogs,
      scanResults: [{ dialogId: '5003', status: 'banned' }],
      mockConfig: { inviteToChannelErrorDialogIds: { '5003': 'CHAT_ADMIN_REQUIRED' } },
    })

    const p = executor.execute({ dialogIds: ['5003'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.editBannedCalls).toHaveLength(1)
    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '5003')
    expect(outcome?.outcome.status).toBe('failed')
  })

  it('a basic-group dialog is never subject to an unban call regardless of scanner status (Phase 13 D-03: bans invisible for basic groups)', async () => {
    const dialogs = [makeDialog('5004', 'basic-group')]
    const { executor, mockClient } = makeExecutor({
      dialogs,
      scanResults: [{ dialogId: '5004', status: 'banned' }],
    })

    const p = executor.execute({ dialogIds: ['5004'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.editBannedCalls).toHaveLength(0)
    expect(mockClient.addChatUserCalls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — D-05 pre-flight deleted/bot guard
// ---------------------------------------------------------------------------

describe('AddExecutor — D-05 pre-flight deleted/bot guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolved.deleted === true: every selected dialog outcome is failed(ADD_TARGET_INVALID) with ZERO invoke calls of any kind', async () => {
    const dialogs = [makeDialog('6001', 'supergroup'), makeDialog('6002', 'basic-group')]
    const { executor, mockClient, auditStore } = makeExecutor({
      dialogs,
      resolved: { id: BigInt('99'), accessHash: BigInt('12345'), name: 'Jan Novák', deleted: true, bot: false, contact: false },
    })

    const p = executor.execute({ dialogIds: ['6001', '6002'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.inviteToChannelCalls).toHaveLength(0)
    expect(mockClient.addChatUserCalls).toHaveLength(0)
    expect(mockClient.editBannedCalls).toHaveLength(0)
    for (const id of ['6001', '6002']) {
      const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === id)
      expect(outcome?.outcome.status).toBe('failed')
      expect(outcome?.outcome.errorCode).toBe('ADD_TARGET_INVALID')
    }
  })

  it('resolved.bot === true: same zero-API-traffic behavior', async () => {
    const dialogs = [makeDialog('6003', 'supergroup')]
    const { executor, mockClient, auditStore } = makeExecutor({
      dialogs,
      resolved: { id: BigInt('99'), accessHash: BigInt('12345'), name: 'Jan Novák', deleted: false, bot: true, contact: false },
    })

    const p = executor.execute({ dialogIds: ['6003'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.inviteToChannelCalls).toHaveLength(0)
    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '6003')
    expect(outcome?.outcome.status).toBe('failed')
    expect(outcome?.outcome.errorCode).toBe('ADD_TARGET_INVALID')
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — already-member (D-06, dual signal)
// ---------------------------------------------------------------------------

describe('AddExecutor — already-member (D-06, dual signal)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a dialog with scanner pre-run status "member": short-circuits to already-member with ZERO invoke calls for that dialog', async () => {
    const dialogs = [makeDialog('7001', 'supergroup')]
    const { executor, mockClient, auditStore } = makeExecutor({
      dialogs,
      scanResults: [{ dialogId: '7001', status: 'member' }],
    })

    const p = executor.execute({ dialogIds: ['7001'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.inviteToChannelCalls).toHaveLength(0)
    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '7001')
    expect(outcome?.outcome.status).toBe('already-member')
  })

  it('a dialog with scanner status "not-member" that throws USER_ALREADY_PARTICIPANT at runtime: classifies to already-member (not failed)', async () => {
    const dialogs = [makeDialog('7002', 'supergroup')]
    const { executor, auditStore } = makeExecutor({
      dialogs,
      scanResults: [{ dialogId: '7002', status: 'not-member' }],
      mockConfig: { inviteToChannelErrorDialogIds: { '7002': 'USER_ALREADY_PARTICIPANT' } },
    })

    const p = executor.execute({ dialogIds: ['7002'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '7002')
    expect(outcome?.outcome.status).toBe('already-member')
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — privacy-blocked + inline link export (ADD-10, D-07/D-09/D-10)
// ---------------------------------------------------------------------------

describe('AddExecutor — privacy-blocked + inline link export (ADD-10, D-07/D-09/D-10)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('missingInvitees response (no thrown error) containing the target: privacy-blocked, reason "privacy", link populated via an inline ExportChatInvite call checkpointed together with the outcome', async () => {
    const dialogs = [makeDialog('8001', 'supergroup')]
    const { executor, mockClient, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelMissingInviteeDialogIds: { '8001': {} } },
    })

    const p = executor.execute({ dialogIds: ['8001'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.exportChatInviteCalls).toHaveLength(1)
    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '8001')
    expect(outcome?.outcome.status).toBe('privacy-blocked')
    expect(outcome?.outcome.reason).toBe('privacy')
    expect(outcome?.outcome.link).toBeTruthy()
  })

  it('thrown USER_PRIVACY_RESTRICTED: privacy-blocked reason "privacy" + link', async () => {
    const dialogs = [makeDialog('8002', 'supergroup')]
    const { executor, mockClient, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '8002': 'USER_PRIVACY_RESTRICTED' } },
    })

    const p = executor.execute({ dialogIds: ['8002'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.exportChatInviteCalls).toHaveLength(1)
    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '8002')
    expect(outcome?.outcome.status).toBe('privacy-blocked')
    expect(outcome?.outcome.reason).toBe('privacy')
    expect(outcome?.outcome.link).toBeTruthy()
  })

  it('thrown USER_NOT_MUTUAL_CONTACT: privacy-blocked reason "privacy" + link (NOT failed(ADD_NOT_MUTUAL_CONTACT) — Pitfall 4)', async () => {
    const dialogs = [makeDialog('8003', 'supergroup')]
    const { executor, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '8003': 'USER_NOT_MUTUAL_CONTACT' } },
    })

    const p = executor.execute({ dialogIds: ['8003'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '8003')
    expect(outcome?.outcome.status).toBe('privacy-blocked')
    expect(outcome?.outcome.reason).toBe('privacy')
    expect(outcome?.outcome.errorCode).toBeUndefined()
    expect(outcome?.outcome.link).toBeTruthy()
  })

  it('a missing invitee carrying premiumWouldAllowInvite: outcome.premiumWouldAllow === true', async () => {
    const dialogs = [makeDialog('8004', 'supergroup')]
    const { executor, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelMissingInviteeDialogIds: { '8004': { premiumWouldAllowInvite: true } } },
    })

    const p = executor.execute({ dialogIds: ['8004'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '8004')
    expect(outcome?.outcome.premiumWouldAllow).toBe(true)
  })

  it('ExportChatInvite is called with usageLimit:1, expireDate approximately now+432000 (5 days), and a title of "Admin • <targetName>" truncated to 32 characters', async () => {
    const dialogs = [makeDialog('8005', 'supergroup')]
    const { executor, mockClient } = makeExecutor({
      dialogs,
      resolved: {
        id: BigInt('99'),
        accessHash: BigInt('12345'),
        name: 'A Very Long Display Name That Exceeds Thirty Two Characters',
        deleted: false,
        bot: false,
        contact: false,
      },
      mockConfig: { inviteToChannelMissingInviteeDialogIds: { '8005': {} } },
    })

    const before = Math.floor(Date.now() / 1000)
    const p = executor.execute({ dialogIds: ['8005'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.exportChatInviteCalls).toHaveLength(1)
    const call = mockClient.exportChatInviteCalls[0]!
    expect(call.usageLimit).toBe(1)
    expect(call.expireDate).toBeGreaterThanOrEqual(before + 432000 - 5)
    expect(call.expireDate).toBeLessThanOrEqual(before + 432000 + 5)
    expect(call.title.length).toBeLessThanOrEqual(32)
    expect(call.title.startsWith('Admin • ')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — channel-full branching (ADD-09, D-12, Open Question 2 RESOLVED)
// ---------------------------------------------------------------------------

describe('AddExecutor — channel-full branching (ADD-09, D-12, Open Question 2 RESOLVED)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('USERS_TOO_MUCH on InviteToChannel (broadcast/supergroup): privacy-blocked reason "channel-full", link exported inline', async () => {
    const dialogs = [makeDialog('9001', 'broadcast-channel')]
    const { executor, mockClient, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '9001': 'USERS_TOO_MUCH' } },
    })

    const p = executor.execute({ dialogIds: ['9001'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.exportChatInviteCalls).toHaveLength(1)
    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '9001')
    expect(outcome?.outcome.status).toBe('privacy-blocked')
    expect(outcome?.outcome.reason).toBe('channel-full')
    expect(outcome?.outcome.link).toBeTruthy()
  })

  it('USERS_TOO_MUCH on InviteToChannel where the subsequent link export itself throws: failed(ADD_CHANNEL_FULL), status is NOT privacy-blocked', async () => {
    const dialogs = [makeDialog('9002', 'broadcast-channel')]
    const { executor, auditStore } = makeExecutor({
      dialogs,
      mockConfig: {
        inviteToChannelErrorDialogIds: { '9002': 'USERS_TOO_MUCH' },
        exportChatInviteErrorPeerIds: ['9002'],
      },
    })

    const p = executor.execute({ dialogIds: ['9002'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '9002')
    expect(outcome?.outcome.status).toBe('failed')
    expect(outcome?.outcome.errorCode).toBe('ADD_CHANNEL_FULL')
  })

  it('USERS_TOO_MUCH on AddChatUser (basic-group): failed(ADD_CHANNEL_FULL), ZERO ExportChatInvite calls', async () => {
    const dialogs = [makeDialog('9003', 'basic-group')]
    const { executor, mockClient, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { addChatUserErrorDialogIds: { '9003': 'USERS_TOO_MUCH' } },
    })

    const p = executor.execute({ dialogIds: ['9003'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.exportChatInviteCalls).toHaveLength(0)
    expect(mockClient.addChatUserCalls).toHaveLength(1)
    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '9003')
    expect(outcome?.outcome.status).toBe('failed')
    expect(outcome?.outcome.errorCode).toBe('ADD_CHANNEL_FULL')
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — error classification (ADD-09, D-19)
// ---------------------------------------------------------------------------

describe('AddExecutor — error classification (ADD-09, D-19)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('CHAT_ADMIN_REQUIRED -> failed(ADD_NO_RIGHTS)', async () => {
    const dialogs = [makeDialog('10001', 'supergroup')]
    const { executor, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '10001': 'CHAT_ADMIN_REQUIRED' } },
    })

    const p = executor.execute({ dialogIds: ['10001'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '10001')
    expect(outcome?.outcome.status).toBe('failed')
    expect(outcome?.outcome.errorCode).toBe('ADD_NO_RIGHTS')
  })

  it('USER_CHANNELS_TOO_MUCH -> failed(ADD_USER_CHANNELS_TOO_MUCH)', async () => {
    const dialogs = [makeDialog('10002', 'supergroup')]
    const { executor, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '10002': 'USER_CHANNELS_TOO_MUCH' } },
    })

    const p = executor.execute({ dialogIds: ['10002'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '10002')
    expect(outcome?.outcome.status).toBe('failed')
    expect(outcome?.outcome.errorCode).toBe('ADD_USER_CHANNELS_TOO_MUCH')
  })

  it('USER_KICKED (basic-group) -> failed(ADD_USER_KICKED)', async () => {
    const dialogs = [makeDialog('10003', 'basic-group')]
    const { executor, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { addChatUserErrorDialogIds: { '10003': 'USER_KICKED' } },
    })

    const p = executor.execute({ dialogIds: ['10003'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '10003')
    expect(outcome?.outcome.status).toBe('failed')
    expect(outcome?.outcome.errorCode).toBe('ADD_USER_KICKED')
  })

  it('CHANNEL_PRIVATE on InviteToChannel -> failed(UNKNOWN) (Open Question 3 RESOLVED — no dedicated code)', async () => {
    const dialogs = [makeDialog('10004', 'supergroup')]
    const { executor, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '10004': 'CHANNEL_PRIVATE' } },
    })

    const p = executor.execute({ dialogIds: ['10004'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '10004')
    expect(outcome?.outcome.status).toBe('failed')
    expect(outcome?.outcome.errorCode).toBe('UNKNOWN')
  })

  it('an unrecognized RPC error string -> failed(UNKNOWN)', async () => {
    const dialogs = [makeDialog('10005', 'supergroup')]
    const { executor, auditStore } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '10005': 'SOME_TOTALLY_UNRECOGNIZED_ERROR' } },
    })

    const p = executor.execute({ dialogIds: ['10005'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '10005')
    expect(outcome?.outcome.status).toBe('failed')
    expect(outcome?.outcome.errorCode).toBe('UNKNOWN')
  })

  it('an error with no errorMessage (network failure) -> failed(NETWORK)', async () => {
    const dialogs = [makeDialog('10006', 'supergroup')]
    const { executor, mockClient, auditStore } = makeExecutor({ dialogs })

    const originalInvoke = mockClient.invoke.bind(mockClient)
    mockClient.invoke = async (request: unknown): Promise<unknown> => {
      if (ctorNameOf(request).includes('InviteToChannel')) {
        throw new Error('ECONNRESET')
      }
      return originalInvoke(request)
    }

    const p = executor.execute({ dialogIds: ['10006'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '10006')
    expect(outcome?.outcome.status).toBe('failed')
    expect(outcome?.outcome.errorCode).toBe('NETWORK')
  })

  it('PEER_FLOOD is re-thrown by the classifier before any string matching, never returned as a per-group outcome', async () => {
    const dialogs = [makeDialog('10007', 'supergroup')]
    const { executor, auditStore, states } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '10007': 'PEER_FLOOD' } },
    })

    const p = executor.execute({ dialogIds: ['10007'] })
    await vi.runAllTimersAsync()
    await p

    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '10007')
    expect(outcome).toBeUndefined()
    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('hard-stopped')
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — PEER_FLOOD hard-stop, abort, generation guard (mirrors TagExecutor exactly)
// ---------------------------------------------------------------------------

describe('AddExecutor — PEER_FLOOD hard-stop, abort, generation guard (mirrors TagExecutor exactly)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('PEER_FLOOD hard-stops the run: step becomes hard-stopped, remaining groups NOT marked skipped (left pending, resumable)', async () => {
    const dialogs = [makeDialog('11001', 'supergroup'), makeDialog('11002', 'supergroup'), makeDialog('11003', 'supergroup')]
    const dialogIds = ['11001', '11002', '11003']
    const auditStore = makeAddAuditStore(dialogIds)
    const { executor, states } = makeExecutor({
      dialogs,
      auditStore,
      mockConfig: { inviteToChannelErrorDialogIds: { '11002': 'PEER_FLOOD' } },
    })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('hard-stopped')

    const g1 = auditStore.checkpointCalls.find((c) => c.dialogId === '11001')
    expect(g1?.outcome.status).toBe('done')
    const g2 = auditStore.checkpointCalls.find((c) => c.dialogId === '11002')
    expect(g2).toBeUndefined()
    const g3 = auditStore.checkpointCalls.find((c) => c.dialogId === '11003')
    expect(g3).toBeUndefined()

    expect(auditStore.setStatusCalls.some((c) => c.status === 'hard-stopped')).toBe(true)
  })

  it('CR-03: PEER_FLOOD from the inline ExportChatInvite call (triggered by a missingInvitees response) hard-stops the run instead of being swallowed into failed(UNKNOWN)', async () => {
    const dialogs = [makeDialog('19001', 'supergroup'), makeDialog('19002', 'supergroup')]
    const dialogIds = ['19001', '19002']
    const auditStore = makeAddAuditStore(dialogIds)
    const { executor, states } = makeExecutor({
      dialogs,
      auditStore,
      mockConfig: {
        inviteToChannelMissingInviteeDialogIds: { '19001': {} },
        exportChatInvitePeerFloodPeerIds: ['19001'],
      },
    })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('hard-stopped')
    const g1 = auditStore.checkpointCalls.find((c) => c.dialogId === '19001')
    expect(g1).toBeUndefined()
    const g2 = auditStore.checkpointCalls.find((c) => c.dialogId === '19002')
    expect(g2).toBeUndefined()
  })

  it('CR-03: PEER_FLOOD from the inline ExportChatInvite call triggered by a thrown USER_PRIVACY_RESTRICTED (_classifyAddError privacy branch) hard-stops the run instead of being swallowed into failed(UNKNOWN)', async () => {
    const dialogs = [makeDialog('19003', 'supergroup'), makeDialog('19004', 'supergroup')]
    const dialogIds = ['19003', '19004']
    const auditStore = makeAddAuditStore(dialogIds)
    const { executor, states } = makeExecutor({
      dialogs,
      auditStore,
      mockConfig: {
        inviteToChannelErrorDialogIds: { '19003': 'USER_PRIVACY_RESTRICTED' },
        exportChatInvitePeerFloodPeerIds: ['19003'],
      },
    })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('hard-stopped')
    const g2 = auditStore.checkpointCalls.find((c) => c.dialogId === '19004')
    expect(g2).toBeUndefined()
  })

  it('CR-03: PEER_FLOOD from the inline ExportChatInvite call triggered by a thrown USERS_TOO_MUCH (_classifyAddError channel-full branch) hard-stops the run instead of being swallowed into failed(ADD_CHANNEL_FULL)', async () => {
    const dialogs = [makeDialog('19005', 'supergroup'), makeDialog('19006', 'supergroup')]
    const dialogIds = ['19005', '19006']
    const auditStore = makeAddAuditStore(dialogIds)
    const { executor, states } = makeExecutor({
      dialogs,
      auditStore,
      mockConfig: {
        inviteToChannelErrorDialogIds: { '19005': 'USERS_TOO_MUCH' },
        exportChatInvitePeerFloodPeerIds: ['19005'],
      },
    })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('hard-stopped')
    const g2 = auditStore.checkpointCalls.find((c) => c.dialogId === '19006')
    expect(g2).toBeUndefined()
  })

  it('abortExecution() during group 2 of 3: remaining groups marked skipped, step becomes stopped', async () => {
    const dialogs = [makeDialog('12001', 'supergroup'), makeDialog('12002', 'supergroup'), makeDialog('12003', 'supergroup')]
    const dialogIds = ['12001', '12002', '12003']
    const auditStore = makeAddAuditStore(dialogIds)
    const { executor, states } = makeExecutor({ dialogs, auditStore })

    let abortCalled = false
    const originalCheckpoint = auditStore.checkpoint.bind(auditStore)
    auditStore.checkpoint = (dialogId: string, outcome: AddGroupOutcome) => {
      originalCheckpoint(dialogId, outcome)
      if (dialogId === '12001' && !abortCalled) {
        abortCalled = true
        executor.abortExecution()
      }
    }

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('stopped')
    const hasAnySkipped = auditStore.checkpointCalls.some((c) => c.outcome.status === 'skipped')
    expect(hasAnySkipped).toBe(true)
  })

  it('abortExecution() when idle emits idle state (not stopped)', () => {
    const dialogs = [makeDialog('12004', 'supergroup')]
    const { executor, states } = makeExecutor({ dialogs })

    executor.abortExecution()

    const lastState = states[states.length - 1]
    expect(lastState?.step).toBe('idle')
  })

  it('a newer execute() call supersedes an in-flight one: the superseded run emits nothing further (gen mismatch exits silently, per WR-01 abort-first ordering)', async () => {
    const dialogs = [makeDialog('13001', 'supergroup'), makeDialog('13002', 'supergroup')]
    const dialogIds = ['13001', '13002']
    const auditStore = makeAddAuditStore(dialogIds)
    const { executor, states } = makeExecutor({ dialogs, auditStore })

    const firstPromise = executor.execute({ dialogIds })
    const secondPromise = executor.execute({ dialogIds })

    await vi.runAllTimersAsync()
    await Promise.allSettled([firstPromise, secondPromise])

    const lastState = states[states.length - 1]!
    expect(lastState.step).toBe('complete')
    expect(states.map((s) => s.step)).not.toContain('stopped')

    for (const id of dialogIds) {
      const calls = auditStore.checkpointCalls.filter((c) => c.dialogId === id)
      expect(calls).toHaveLength(1)
      expect(calls[0]!.outcome.status).toBe('done')
    }
  })

  it('the abort check is evaluated BEFORE the generation check at every guard checkpoint (signal.aborted wins even if a newer execute() also started)', async () => {
    const dialogs = [makeDialog('14001', 'supergroup'), makeDialog('14002', 'supergroup')]
    const dialogIds = ['14001', '14002']
    const auditStore = makeAddAuditStore(dialogIds)
    const { executor, mockClient, states } = makeExecutor({ dialogs, auditStore })

    const originalInvoke = mockClient.invoke.bind(mockClient)
    mockClient.invoke = async (request: unknown): Promise<unknown> => {
      if (ctorNameOf(request).includes('InviteToChannel')) {
        executor.abortExecution()
        throw Object.assign(new Error('PEER_FLOOD'), { errorMessage: 'PEER_FLOOD' })
      }
      return originalInvoke(request)
    }

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('stopped')
    expect(states.map((s) => s.step)).not.toContain('hard-stopped')
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — continuation-based resume (ADD-08, D-20)
// ---------------------------------------------------------------------------

describe('AddExecutor — continuation-based resume (ADD-08, D-20)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resume:false (or omitted) with no existing job: initJob() is called with a fresh jobId', async () => {
    const dialogs = [makeDialog('15001', 'supergroup')]
    const dialogIds = ['15001']
    const auditStore = makeAddAuditStore(dialogIds)
    const { executor } = makeExecutor({ dialogs, auditStore })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    expect(auditStore.initJobCalls).toHaveLength(1)
    expect(auditStore.initJobCalls[0]!.jobId).toBeTruthy()
  })

  it('resume:false with an existing non-complete job on disk for the SAME target+dialogs: still starts fresh — initJob() called with a NEW jobId, the old job is overwritten (explicit-intent rule)', async () => {
    const dialogs = [makeDialog('15002', 'supergroup')]
    const dialogIds = ['15002']
    const auditStore = makeAddAuditStore(dialogIds, {
      jobId: 'OLD-JOB-ID',
      targetId: '99',
      dialogIds,
      outcomes: [],
      dmStatus: 'pending',
      status: 'stopped',
    })
    const { executor } = makeExecutor({ dialogs, auditStore })

    const p = executor.execute({ dialogIds, resume: false })
    await vi.runAllTimersAsync()
    await p

    expect(auditStore.initJobCalls).toHaveLength(1)
    expect(auditStore.initJobCalls[0]!.jobId).not.toBe('OLD-JOB-ID')
  })

  it('resume:true with an existing "stopped" job matching targetId AND dialogId set: initJob() is NOT called; the executor reuses the existing jobId; outcomes are seeded from the existing job', async () => {
    const dialogs = [makeDialog('15003', 'supergroup'), makeDialog('15004', 'supergroup')]
    const dialogIds = ['15003', '15004']
    const existingOutcome: AddGroupOutcome = {
      dialogId: '15003',
      status: 'done',
      timestamp: new Date().toISOString(),
    }
    const auditStore = makeAddAuditStore(dialogIds, {
      jobId: 'OLD-JOB-ID',
      targetId: '99',
      dialogIds,
      outcomes: [existingOutcome],
      dmStatus: 'pending',
      status: 'stopped',
    })
    const { executor, states } = makeExecutor({ dialogs, auditStore })

    const p = executor.execute({ dialogIds, resume: true })
    await vi.runAllTimersAsync()
    await p

    expect(auditStore.initJobCalls).toHaveLength(0)
    expect(auditStore._job?.jobId).toBe('OLD-JOB-ID')
    const finalState = states[states.length - 1]!
    expect(finalState.outcomes.some((o) => o.dialogId === '15003' && o.status === 'done')).toBe(true)
  })

  it("resume:true but the existing job's targetId does not match the resolved target: falls back to a fresh job (new jobId)", async () => {
    const dialogs = [makeDialog('15005', 'supergroup')]
    const dialogIds = ['15005']
    const auditStore = makeAddAuditStore(dialogIds, {
      jobId: 'OLD-JOB-ID',
      targetId: 'A-DIFFERENT-TARGET-ID',
      dialogIds,
      outcomes: [],
      dmStatus: 'pending',
      status: 'stopped',
    })
    const { executor } = makeExecutor({ dialogs, auditStore })

    const p = executor.execute({ dialogIds, resume: true })
    await vi.runAllTimersAsync()
    await p

    expect(auditStore.initJobCalls).toHaveLength(1)
    expect(auditStore.initJobCalls[0]!.jobId).not.toBe('OLD-JOB-ID')
  })

  it("resume:true but the existing job's dialogIds set does not match (order-insensitive compare via sameDialogIdSet): falls back to a fresh job", async () => {
    const dialogs = [makeDialog('15006', 'supergroup'), makeDialog('15007', 'supergroup')]
    const dialogIds = ['15006', '15007']
    const mismatchedDialogIds = ['15006']
    expect(sameDialogIdSet(mismatchedDialogIds, dialogIds)).toBe(false)

    const auditStore = makeAddAuditStore(dialogIds, {
      jobId: 'OLD-JOB-ID',
      targetId: '99',
      dialogIds: mismatchedDialogIds,
      outcomes: [],
      dmStatus: 'pending',
      status: 'stopped',
    })
    const { executor } = makeExecutor({ dialogs, auditStore })

    const p = executor.execute({ dialogIds, resume: true })
    await vi.runAllTimersAsync()
    await p

    expect(auditStore.initJobCalls).toHaveLength(1)
    expect(auditStore.initJobCalls[0]!.jobId).not.toBe('OLD-JOB-ID')
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — end-of-run DM dispatch (ADD-11, D-13/D-14)
// ---------------------------------------------------------------------------

describe('AddExecutor — end-of-run DM dispatch (ADD-11, D-13/D-14)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('run completes with >=1 privacy-blocked outcome carrying a link: exactly ONE messages.SendMessage call, message text contains every accumulated link', async () => {
    const dialogs = [makeDialog('16001', 'supergroup'), makeDialog('16002', 'supergroup')]
    const dialogIds = ['16001', '16002']
    const { executor, mockClient } = makeExecutor({
      dialogs,
      mockConfig: {
        inviteToChannelMissingInviteeDialogIds: { '16001': {}, '16002': {} },
        exportChatInviteResult: {
          '16001': { link: 'https://t.me/+linkA' },
          '16002': { link: 'https://t.me/+linkB' },
        },
      },
    })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.sendMessageCalls).toHaveLength(1)
    expect(mockClient.sendMessageCalls[0]!.message).toContain('https://t.me/+linkA')
    expect(mockClient.sendMessageCalls[0]!.message).toContain('https://t.me/+linkB')
  })

  it('run completes with ZERO links accumulated: ZERO SendMessage calls, dmStatus becomes "not-needed"', async () => {
    const dialogs = [makeDialog('16003', 'supergroup')]
    const { executor, mockClient, states } = makeExecutor({ dialogs })

    const p = executor.execute({ dialogIds: ['16003'] })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.sendMessageCalls).toHaveLength(0)
    const finalState = states[states.length - 1]!
    expect(finalState.dmStatus).toBe('not-needed')
  })

  it('SendMessage succeeds: dmStatus becomes "sent"', async () => {
    const dialogs = [makeDialog('16004', 'supergroup')]
    const { executor, states } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelMissingInviteeDialogIds: { '16004': {} } },
    })

    const p = executor.execute({ dialogIds: ['16004'] })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.dmStatus).toBe('sent')
  })

  it('SendMessage throws USER_PRIVACY_RESTRICTED or USER_IS_BLOCKED: dmStatus becomes "refused"; the privacy-blocked outcomes and their links are UNCHANGED (not cleared)', async () => {
    const dialogs = [makeDialog('16005', 'supergroup')]
    const { executor, states, auditStore } = makeExecutor({
      dialogs,
      mockConfig: {
        inviteToChannelMissingInviteeDialogIds: { '16005': {} },
        sendMessageError: 'USER_IS_BLOCKED',
      },
    })

    const p = executor.execute({ dialogIds: ['16005'] })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.dmStatus).toBe('refused')
    const outcome = auditStore.checkpointCalls.find((c) => c.dialogId === '16005')
    expect(outcome?.outcome.status).toBe('privacy-blocked')
    expect(outcome?.outcome.link).toBeTruthy()
  })

  it('CR-02: SendMessage throws a NETWORK (non-privacy) error: the run still reaches "complete" with dmStatus "refused" instead of hanging uncaught at "running" forever', async () => {
    const dialogs = [makeDialog('16012', 'supergroup')]
    const { executor, states, auditStore } = makeExecutor({
      dialogs,
      mockConfig: {
        inviteToChannelMissingInviteeDialogIds: { '16012': {} },
        sendMessageError: 'NETWORK',
      },
    })

    const p = executor.execute({ dialogIds: ['16012'] })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('complete')
    expect(finalState.dmStatus).toBe('refused')
    // The run reached a terminal state: _runActive was reset, so a fresh execute() call
    // is not blocked by the double-start guard (mirrored at the IPC layer via getState()).
    expect(executor.getState().step).toBe('complete')
    expect(auditStore.setStatusCalls.some((c) => c.status === 'complete')).toBe(true)
  })

  it('CR-02: SendMessage throws PEER_FLOOD: the run hard-stops (T-14-11) rather than being folded into dmStatus "refused"', async () => {
    const dialogs = [makeDialog('16013', 'supergroup')]
    const { executor, states } = makeExecutor({
      dialogs,
      mockConfig: {
        inviteToChannelMissingInviteeDialogIds: { '16013': {} },
        sendMessageError: 'PEER_FLOOD',
      },
    })

    const p = executor.execute({ dialogIds: ['16013'] })
    await vi.runAllTimersAsync()
    await p

    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('hard-stopped')
  })

  it('a run stopped (abort) mid-run: ZERO SendMessage calls, dmStatus stays "pending"', async () => {
    const dialogs = [makeDialog('16006', 'supergroup'), makeDialog('16007', 'supergroup')]
    const dialogIds = ['16006', '16007']
    const auditStore = makeAddAuditStore(dialogIds)
    const { executor, mockClient, states } = makeExecutor({ dialogs, auditStore })

    let abortCalled = false
    const originalCheckpoint = auditStore.checkpoint.bind(auditStore)
    auditStore.checkpoint = (dialogId: string, outcome: AddGroupOutcome) => {
      originalCheckpoint(dialogId, outcome)
      if (dialogId === '16006' && !abortCalled) {
        abortCalled = true
        executor.abortExecution()
      }
    }

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.sendMessageCalls).toHaveLength(0)
    const finalState = states[states.length - 1]!
    expect(finalState.dmStatus).toBe('pending')
  })

  it('a run hard-stopped (PEER_FLOOD) mid-run: ZERO SendMessage calls, dmStatus stays "pending"', async () => {
    const dialogs = [makeDialog('16008', 'supergroup'), makeDialog('16009', 'supergroup')]
    const dialogIds = ['16008', '16009']
    const { executor, mockClient, states } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '16008': 'PEER_FLOOD' } },
    })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.sendMessageCalls).toHaveLength(0)
    const finalState = states[states.length - 1]!
    expect(finalState.dmStatus).toBe('pending')
  })

  it('CR-03: PEER_FLOOD from the inline ExportChatInvite call during stale-link (>5 days) regeneration hard-stops the run instead of silently continuing to SendMessage', async () => {
    const dialogs = [makeDialog('19007', 'supergroup')]
    const dialogIds = ['19007']
    const staleOutcome: AddGroupOutcome = {
      dialogId: '19007',
      status: 'privacy-blocked',
      reason: 'privacy',
      link: 'https://t.me/+stalelink',
      timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days old
    }
    const auditStore = makeAddAuditStore(dialogIds, {
      jobId: 'ORIGINAL-JOB-ID',
      targetId: '99',
      dialogIds,
      outcomes: [staleOutcome],
      dmStatus: 'pending',
      status: 'stopped',
    })
    const { executor, states, mockClient } = makeExecutor({
      dialogs,
      auditStore,
      mockConfig: { exportChatInvitePeerFloodPeerIds: ['19007'] },
    })

    const p = executor.execute({ dialogIds, resume: true })
    await vi.runAllTimersAsync()
    await p

    expect(mockClient.sendMessageCalls).toHaveLength(0)
    const finalState = states[states.length - 1]!
    expect(finalState.step).toBe('hard-stopped')
  })

  it('a resumed run (two segments: first stopped with 1 link, second resumed+completed with a 2nd link): the single end-of-run SendMessage call\'s message contains links from BOTH segments', async () => {
    const dialogs = [makeDialog('16010', 'supergroup'), makeDialog('16011', 'supergroup')]
    const dialogIds = ['16010', '16011']

    // Segment 1: dialog 16010 is privacy-blocked (gets a link), then the run is aborted
    // before dialog 16011 is processed.
    const sharedAuditStore = makeAddAuditStore(dialogIds)
    const { executor: executor1, states: states1 } = makeExecutor({
      dialogs,
      auditStore: sharedAuditStore,
      mockConfig: { inviteToChannelMissingInviteeDialogIds: { '16010': {} } },
    })

    let abortCalled = false
    const originalCheckpoint = sharedAuditStore.checkpoint.bind(sharedAuditStore)
    sharedAuditStore.checkpoint = (dialogId: string, outcome: AddGroupOutcome) => {
      originalCheckpoint(dialogId, outcome)
      if (dialogId === '16010' && !abortCalled) {
        abortCalled = true
        executor1.abortExecution()
      }
    }

    const p1 = executor1.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p1
    expect(states1[states1.length - 1]!.step).toBe('stopped')
    expect(sharedAuditStore._job).not.toBeNull()

    // Segment 2: a fresh AddExecutor instance resumes the SAME job (same auditStore,
    // same dialogIds, resume:true) and completes, adding a 2nd link for dialog 16011.
    const { executor: executor2, states: states2, mockClient: mockClient2 } = makeExecutor({
      dialogs,
      auditStore: sharedAuditStore,
      mockConfig: { inviteToChannelMissingInviteeDialogIds: { '16011': {} } },
    })

    const p2 = executor2.execute({ dialogIds, resume: true })
    await vi.runAllTimersAsync()
    await p2

    const finalState = states2[states2.length - 1]!
    expect(finalState.step).toBe('complete')
    expect(mockClient2.sendMessageCalls).toHaveLength(1)

    const seg1Outcome = finalState.outcomes.find((o) => o.dialogId === '16010')
    const seg2Outcome = finalState.outcomes.find((o) => o.dialogId === '16011')
    expect(seg1Outcome?.link).toBeTruthy()
    expect(seg2Outcome?.link).toBeTruthy()
    expect(mockClient2.sendMessageCalls[0]!.message).toContain(seg1Outcome!.link!)
    expect(mockClient2.sendMessageCalls[0]!.message).toContain(seg2Outcome!.link!)
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — add-log append (ADD-14, D-17/D-18)
// ---------------------------------------------------------------------------

describe('AddExecutor — add-log append (ADD-14, D-17/D-18)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('run completes: addLogStore.appendBlock() called exactly once with isFollowUp:false, jobId matching the job, addedDialogs containing only "done" outcomes, linkedDialogs containing only privacy-blocked outcomes that have a link', async () => {
    const dialogs = [makeDialog('17001', 'supergroup'), makeDialog('17002', 'supergroup'), makeDialog('17003', 'supergroup')]
    const dialogIds = ['17001', '17002', '17003']
    const auditStore = makeAddAuditStore(dialogIds)
    const addLogStore = makeAddLogStore()
    const { executor } = makeExecutor({
      dialogs,
      auditStore,
      addLogStore,
      mockConfig: {
        inviteToChannelMissingInviteeDialogIds: { '17002': {} },
        inviteToChannelErrorDialogIds: { '17003': 'CHAT_ADMIN_REQUIRED' },
      },
    })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    expect(addLogStore.appendBlockCalls).toHaveLength(1)
    const block = addLogStore.appendBlockCalls[0]!
    expect(block.isFollowUp).toBe(false)
    expect(block.jobId).toBe(auditStore._job?.jobId)
    expect(block.addedDialogs.map((d) => d.dialogId)).toEqual(['17001'])
    expect(block.linkedDialogs.map((d) => d.dialogId)).toEqual(['17002'])
    expect(block.linkedDialogs[0]!.link).toBeTruthy()
  })

  it('a failed or skipped outcome never appears in addedDialogs or linkedDialogs', async () => {
    const dialogs = [makeDialog('17004', 'supergroup'), makeDialog('17005', 'supergroup')]
    const dialogIds = ['17004', '17005']
    const auditStore = makeAddAuditStore(dialogIds)
    const addLogStore = makeAddLogStore()
    const { executor } = makeExecutor({
      dialogs,
      auditStore,
      addLogStore,
      mockConfig: { inviteToChannelErrorDialogIds: { '17005': 'CHAT_ADMIN_REQUIRED' } },
    })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    expect(addLogStore.appendBlockCalls).toHaveLength(1)
    const block = addLogStore.appendBlockCalls[0]!
    expect(block.addedDialogs.some((d) => d.dialogId === '17005')).toBe(false)
    expect(block.linkedDialogs.some((d) => d.dialogId === '17005')).toBe(false)
  })

  it("a resumed run's completion: appendBlock() called with isFollowUp:true, jobId equal to the ORIGINAL job's id (not a newly minted one)", async () => {
    const dialogs = [makeDialog('17006', 'supergroup'), makeDialog('17007', 'supergroup')]
    const dialogIds = ['17006', '17007']
    const existingOutcome: AddGroupOutcome = {
      dialogId: '17006',
      status: 'done',
      timestamp: new Date().toISOString(),
    }
    const auditStore = makeAddAuditStore(dialogIds, {
      jobId: 'ORIGINAL-JOB-ID',
      targetId: '99',
      dialogIds,
      outcomes: [existingOutcome],
      dmStatus: 'pending',
      status: 'stopped',
    })
    const addLogStore = makeAddLogStore()
    const { executor } = makeExecutor({ dialogs, auditStore, addLogStore })

    const p = executor.execute({ dialogIds, resume: true })
    await vi.runAllTimersAsync()
    await p

    expect(addLogStore.appendBlockCalls).toHaveLength(1)
    const block = addLogStore.appendBlockCalls[0]!
    expect(block.isFollowUp).toBe(true)
    expect(block.jobId).toBe('ORIGINAL-JOB-ID')
  })

  it('a run that stops (abort) does NOT call appendBlock() — only "complete" does', async () => {
    const dialogs = [makeDialog('17008', 'supergroup'), makeDialog('17009', 'supergroup')]
    const dialogIds = ['17008', '17009']
    const auditStore = makeAddAuditStore(dialogIds)
    const addLogStore = makeAddLogStore()
    const { executor } = makeExecutor({ dialogs, auditStore, addLogStore })

    let abortCalled = false
    const originalCheckpoint = auditStore.checkpoint.bind(auditStore)
    auditStore.checkpoint = (dialogId: string, outcome: AddGroupOutcome) => {
      originalCheckpoint(dialogId, outcome)
      if (dialogId === '17008' && !abortCalled) {
        abortCalled = true
        executor.abortExecution()
      }
    }

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    expect(addLogStore.appendBlockCalls).toHaveLength(0)
  })

  it('a run that hard-stops (PEER_FLOOD) does NOT call appendBlock()', async () => {
    const dialogs = [makeDialog('17010', 'supergroup'), makeDialog('17011', 'supergroup')]
    const dialogIds = ['17010', '17011']
    const addLogStore = makeAddLogStore()
    const { executor } = makeExecutor({
      dialogs,
      addLogStore,
      mockConfig: { inviteToChannelErrorDialogIds: { '17010': 'PEER_FLOOD' } },
    })

    const p = executor.execute({ dialogIds })
    await vi.runAllTimersAsync()
    await p

    expect(addLogStore.appendBlockCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// AddExecutor — retryGroup (mirrors RemovalExecutor.retryGroup)
// ---------------------------------------------------------------------------

describe('AddExecutor — retryGroup (mirrors RemovalExecutor.retryGroup)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('WR-01: retryGroup() hitting a PEER_FLOOD-classified error transitions to hard-stopped instead of vanishing into the fire-and-forget IPC .catch() with no feedback', async () => {
    const dialogs = [makeDialog('18008', 'supergroup')]
    const mockConfig: MockClientConfig = { inviteToChannelErrorDialogIds: { '18008': 'CHAT_ADMIN_REQUIRED' } }
    const { executor } = makeExecutor({ dialogs, mockConfig })

    const p = executor.execute({ dialogIds: ['18008'] })
    await vi.runAllTimersAsync()
    await p
    expect(executor.getState().step).toBe('complete')

    // Reconfigure the SAME mock config object (captured by reference inside the mock
    // client's closures) so the retry hits PEER_FLOOD instead of the original error.
    mockConfig.inviteToChannelErrorDialogIds = { '18008': 'PEER_FLOOD' }
    await executor.retryGroup('18008')

    expect(executor.getState().step).toBe('hard-stopped')
  })

  it('retryGroup is available when step is complete, stopped, or hard-stopped', async () => {
    const dialogs = [makeDialog('18001', 'supergroup')]
    const { executor, mockClient } = makeExecutor({
      dialogs,
      mockConfig: { inviteToChannelErrorDialogIds: { '18001': 'CHAT_ADMIN_REQUIRED' } },
    })

    const p = executor.execute({ dialogIds: ['18001'] })
    await vi.runAllTimersAsync()
    await p

    expect(executor.getState().step).toBe('complete')
    const callsBefore = mockClient.inviteToChannelCalls.length
    await executor.retryGroup('18001')
    expect(mockClient.inviteToChannelCalls.length).toBeGreaterThan(callsBefore)
  })

  it('retryGroup re-dispatches the correct mechanic for the dialog type and checkpoints the new outcome, merging it into the current outcomes array', async () => {
    const dialogs = [makeDialog('18002', 'basic-group')]
    const auditStore = makeAddAuditStore(['18002'])
    const { executor, mockClient } = makeExecutor({
      dialogs,
      auditStore,
      mockConfig: { addChatUserErrorDialogIds: { '18002': 'CHAT_ADMIN_REQUIRED' } },
    })

    const p = executor.execute({ dialogIds: ['18002'] })
    await vi.runAllTimersAsync()
    await p

    expect(executor.getState().outcomes.find((o) => o.dialogId === '18002')?.status).toBe('failed')
    const checkpointCountBefore = auditStore.checkpointCalls.length

    await executor.retryGroup('18002')

    expect(mockClient.addChatUserCalls.length).toBeGreaterThanOrEqual(2)
    expect(auditStore.checkpointCalls.length).toBeGreaterThan(checkpointCountBefore)
    const mergedOutcome = executor.getState().outcomes.find((o) => o.dialogId === '18002')
    expect(mergedOutcome).toBeDefined()
  })

  it('retryGroup is a no-op while step is running', async () => {
    const dialogs = [makeDialog('18003', 'supergroup'), makeDialog('18004', 'supergroup')]
    const dialogIds = ['18003', '18004']
    const { executor, mockClient } = makeExecutor({ dialogs })

    const p = executor.execute({ dialogIds })
    const retryPromise = executor.retryGroup('18003')
    await vi.runAllTimersAsync()
    await Promise.all([p, retryPromise])

    expect(mockClient.inviteToChannelCalls.filter((c) => c.channelId === '18003')).toHaveLength(1)
  })
})
