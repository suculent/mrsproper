/**
 * Cross-process resume test (Phase 16, D-05): the renderer's resume call contract
 * (getResumeDialogIds from @shared/addResume) feeds AddExecutor.execute({ resume: true }).
 * Proves lineage (same jobId), outcome retention, skipped reprocessing, single DM with
 * links from both segments, and one follow-up add-log block.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimitGovernor } from './governor'
import { createMockTelegramClient, type MockClientConfig } from './__mocks__/telegramClient'
import { AddExecutor } from './AddExecutor'
import type { AddState, AddGroupOutcome, AddJobFile, AddLogBlockEntry } from '@shared/addTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { AddAuditStore } from '../storage/addAuditStore'
import { getResumeDialogIds, countProcessedOutcomes, isJobFinished } from '@shared/addResume'

function makeDialog(id: string): AdminDialogDTO {
  return {
    id,
    title: 'Group ' + id,
    avatar: null,
    memberCount: null,
    type: 'supergroup',
    canAct: true,
    greyReason: null,
    canAdd: true,
    addGreyReason: null,
    canUnban: true,
  }
}

function makeAuditStore(seed: AddJobFile): AddAuditStore & { initJobCalls: AddJobFile[]; _job: AddJobFile | null } {
  const initJobCalls: AddJobFile[] = []
  const state: { job: AddJobFile | null } = { job: seed }
  return {
    initJobCalls,
    get _job(): AddJobFile | null {
      return state.job
    },
    initJob(job: AddJobFile): void {
      initJobCalls.push(job)
      state.job = job
    },
    checkpoint(dialogId: string, outcome: AddGroupOutcome): void {
      if (state.job) state.job = { ...state.job, outcomes: [...state.job.outcomes, { ...outcome, dialogId }] }
    },
    setStatus(status: AddJobFile['status'], completedAt?: string): void {
      if (state.job) state.job = { ...state.job, status, ...(completedAt !== undefined ? { completedAt } : {}) }
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

const L1 = 'https://t.me/+segment1link'

function seedJob(): AddJobFile {
  const ts = new Date().toISOString()
  return {
    schemaVersion: 1,
    jobId: 'ORIGINAL-JOB-ID',
    targetId: '99',
    targetName: 'Jan Novák',
    targetAccessHash: '12345',
    dialogIds: ['21001', '21002', '21003'],
    outcomes: [
      { dialogId: '21001', status: 'done', timestamp: ts },
      { dialogId: '21002', status: 'privacy-blocked', reason: 'privacy', link: L1, timestamp: ts },
      { dialogId: '21003', status: 'skipped', timestamp: ts },
    ],
    dmStatus: 'pending',
    startedAt: ts,
    status: 'stopped',
  } as AddJobFile
}

function build(resolverNull: boolean, mockConfig: MockClientConfig, seed: AddJobFile = seedJob()) {
  const dialogs = ['21001', '21002', '21003'].map(makeDialog)
  const mockClient = createMockTelegramClient(mockConfig)
  const governor = new RateLimitGovernor({ client: mockClient as never })
  const auditStore = makeAuditStore(seed)
  const appendBlockCalls: AddLogBlockEntry[] = []
  const dmTexts: string[] = []
  const states: AddState[] = []
  const executor = new AddExecutor({
    client: mockClient,
    governor,
    enumerator: {
      getState: () => ({ step: 'loaded' as const, dialogs }),
      getDialogEntity: (id: string) => ({ id: { toString: () => id }, accessHash: { toString: () => '0' } }),
    } as never,
    scanner: { getState: () => ({ step: 'complete', results: [] }) } as never,
    resolver: {
      getResolvedUser: () =>
        resolverNull
          ? null
          : { id: BigInt('99'), accessHash: BigInt('12345'), name: 'Jan Novák', deleted: false, bot: false },
    },
    auditStore,
    addLogStore: { appendBlock: (e: AddLogBlockEntry) => void appendBlockCalls.push(e) },
    getDmText: (vars) => {
      const t = 'Hi ' + vars.name + '\n' + vars.links
      dmTexts.push(t)
      return t
    },
    onStateChange: (s) => states.push(s),
  })
  return { executor, mockClient, auditStore, appendBlockCalls, dmTexts, states }
}

describe('shared resume helpers (D-01, D-02)', () => {
  it('getResumeDialogIds returns the FULL set, not the remaining subset', () => {
    const ids = getResumeDialogIds(seedJob())
    expect(ids).toHaveLength(3)
    expect(ids).toEqual(['21001', '21002', '21003'])
  })

  it('countProcessedOutcomes ignores skipped outcomes', () => {
    expect(countProcessedOutcomes(seedJob())).toBe(2)
  })

  it('isJobFinished is false while a skipped outcome exists, true once all are non-skipped', () => {
    const job = seedJob()
    expect(isJobFinished(job)).toBe(false)
    const finished = {
      ...job,
      outcomes: job.outcomes.map((o) => (o.status === 'skipped' ? { ...o, status: 'done' as const } : o)),
    }
    expect(isJobFinished(finished)).toBe(true)
  })
})

describe('cross-process resume: stopped job -> renderer resume call -> AddExecutor (D-05)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  for (const resolverNull of [false, true]) {
    it(`continues the same lineage with one DM and one follow-up block (resolverNull=${resolverNull})`, async () => {
      const { executor, mockClient, auditStore, appendBlockCalls, dmTexts, states } = build(resolverNull, {
        inviteToChannelMissingInviteeDialogIds: { '21003': {} },
      })

      const p = executor.execute({ dialogIds: getResumeDialogIds(seedJob()), resume: true })
      await vi.runAllTimersAsync()
      await p

      expect(auditStore.initJobCalls).toHaveLength(0)
      expect(auditStore._job?.jobId).toBe('ORIGINAL-JOB-ID')

      const final = states[states.length - 1]!
      expect(final.step).toBe('complete')
      expect(final.outcomes.find((o) => o.dialogId === '21001')?.status).toBe('done')
      expect(final.outcomes.find((o) => o.dialogId === '21002')?.link).toBe(L1)
      // skipped group was reprocessed this segment
      const seg2 = final.outcomes.find((o) => o.dialogId === '21003')
      expect(seg2?.status).toBe('privacy-blocked')

      expect(mockClient.sendMessageCalls).toHaveLength(1)
      expect(dmTexts).toHaveLength(1)
      expect(dmTexts[0]).toContain(L1)
      expect(dmTexts[0]).toContain(seg2!.link!)

      expect(appendBlockCalls).toHaveLength(1)
      expect(appendBlockCalls[0]!.isFollowUp).toBe(true)
      expect(appendBlockCalls[0]!.jobId).toBe('ORIGINAL-JOB-ID')
    })
  }

  // WR-02: BigInt('') === 0n does not throw — a malformed job must fall into the idle path.
  for (const bad of [
    { targetAccessHash: '' },
    { targetAccessHash: 'abc' },
    { targetId: '' },
  ] as Partial<AddJobFile>[]) {
    it(`rejects a malformed job file on relaunch resume (${JSON.stringify(bad)})`, async () => {
      const { executor, mockClient, auditStore, states } = build(true, {}, { ...seedJob(), ...bad })

      const p = executor.execute({ dialogIds: getResumeDialogIds(seedJob()), resume: true })
      await vi.runAllTimersAsync()
      await p

      expect(auditStore.initJobCalls).toHaveLength(0)
      expect(mockClient.sendMessageCalls).toHaveLength(0)
      expect(states[states.length - 1]!.step).toBe('idle')
    })
  }
})
