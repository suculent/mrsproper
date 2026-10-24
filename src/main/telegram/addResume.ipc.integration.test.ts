/**
 * IPC-level relaunch resume + identity lock test (Phase 17, D-14).
 * Drives the REAL registerAddChannels + registerTargetChannels handlers (captured from a mocked
 * ipcMain) over a REAL AddExecutor, so F1 (relaunch resume with no resolver target, Stop works)
 * and F2 (identity lock while a job is live / ADD_RESUME of A while B is confirmed) are guarded at
 * the same boundary the renderer uses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimitGovernor } from './governor'
import { createMockTelegramClient, type MockClientConfig } from './__mocks__/telegramClient'
import { AddExecutor } from './AddExecutor'
import type { AddState, AddGroupOutcome, AddJobFile, AddLogBlockEntry } from '@shared/addTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { AddAuditStore } from '../storage/addAuditStore'
import { getResumeDialogIds } from '@shared/addResume'
import {
  ADD_START,
  ADD_RESUME,
  ADD_ABORT,
  ADD_RETRY_GROUP,
  TARGET_RESOLVE,
  TARGET_CONFIRM,
  TARGET_RESET,
} from '@shared/channels'
import { registerAddChannels } from '../ipc/addChannels'
import { registerTargetChannels } from '../ipc/targetChannels'

type IpcHandler = (_event: unknown, payload?: unknown) => Promise<unknown>
const capturedHandlers: Record<string, IpcHandler> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => {
      capturedHandlers[channel] = handler
    },
  },
  BrowserWindow: vi.fn(),
  dialog: {},
}))

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
    // IN-05: mirror the real addAuditStore — checkpoint REPLACES any entry for the same
    // dialogId (CR-01 dedup) instead of appending, and setStatus persists dmStatus.
    checkpoint(dialogId: string, outcome: AddGroupOutcome): void {
      if (!state.job) return
      const deduped = state.job.outcomes.filter((o) => o.dialogId !== dialogId)
      state.job = { ...state.job, outcomes: [...deduped, { ...outcome, dialogId }] }
    },
    setStatus(status: AddJobFile['status'], completedAt?: string, dmStatus?: AddJobFile['dmStatus']): void {
      if (state.job) {
        state.job = {
          ...state.job,
          status,
          ...(completedAt !== undefined ? { completedAt } : {}),
          ...(dmStatus !== undefined ? { dmStatus } : {}),
        }
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

interface ResolverUser {
  id: bigint
  accessHash: bigint
  name: string
  deleted: boolean
  bot: boolean
}

function build(mockConfig: MockClientConfig, seed: AddJobFile = seedJob()) {
  const dialogs = ['21001', '21002', '21003'].map(makeDialog)
  const mockClient = createMockTelegramClient(mockConfig)
  const governor = new RateLimitGovernor({ client: mockClient as never })
  const auditStore = makeAuditStore(seed)
  const states: AddState[] = []
  const enumerator = {
    getState: () => ({ step: 'loaded' as const, dialogs }),
    getDialogEntity: (id: string) => ({ id: { toString: () => id }, accessHash: { toString: () => '0' } }),
  }
  const holder: { user: ResolverUser | null } = { user: null }
  const resolver = {
    getResolvedUser: vi.fn(() => holder.user),
    getState: vi.fn(() => ({ step: holder.user ? 'confirmed' : 'idle' })),
    resolve: vi.fn(async () => {}),
    confirm: vi.fn(() => {}),
    reset: vi.fn(() => {
      holder.user = null
    }),
  }
  const executor = new AddExecutor({
    client: mockClient,
    governor,
    enumerator: enumerator as never,
    scanner: { getState: () => ({ step: 'complete', results: [] }) } as never,
    resolver,
    auditStore,
    addLogStore: { appendBlock: (_e: AddLogBlockEntry) => {} },
    getDmText: (vars) => 'Hi ' + vars.name + '\n' + vars.links,
    onStateChange: (s) => states.push(s),
  })
  for (const k of Object.keys(capturedHandlers)) delete capturedHandlers[k]
  const win = { isDestroyed: () => false, webContents: { send: vi.fn() } }
  registerAddChannels(
    win as never,
    executor,
    enumerator as never,
    auditStore,
    { addIfMissing: async () => ({ ok: true }) },
    { getLogPath: () => '' },
    () => ({ step: 'authorized' })
  )
  registerTargetChannels(
    win as never,
    resolver as never,
    { abortScan: vi.fn() },
    { abortSearch: vi.fn() },
    undefined,
    undefined,
    executor
  )
  const clientCalls = (): number => mockClient.inviteToChannelCalls.length + mockClient.sendMessageCalls.length
  return { executor, mockClient, auditStore, states, resolver, holder, clientCalls }
}

const USER_77: ResolverUser = { id: BigInt('77'), accessHash: BigInt('1'), name: 'Other', deleted: false, bot: false }

describe('relaunch resume through real IPC handlers (D-14)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('F1: relaunch resume with no resolver target runs the job; state carries targetName and the full dialogIds', async () => {
    const { auditStore, states } = build({})
    const state = (await capturedHandlers[ADD_RESUME]!({})) as AddState
    expect(state).toBeDefined()
    await vi.runAllTimersAsync()
    expect(auditStore.initJobCalls).toHaveLength(0)
    expect(auditStore._job?.jobId).toBe('ORIGINAL-JOB-ID')
    const final = states[states.length - 1]!
    expect(final.step).toBe('complete')
    expect(final.targetName).toBe('Jan Novák')
    expect(final.dialogIds).toEqual(['21001', '21002', '21003'])
    // IN-05: the reprocessed 'skipped' row is replaced, never duplicated.
    const rows21003 = auditStore._job!.outcomes.filter((o) => o.dialogId === '21003')
    expect(rows21003).toHaveLength(1)
    expect(rows21003[0]!.status).not.toBe('skipped')
  })

  it('F1 Stop: ADD_ABORT during a resumed run transitions to stopped', async () => {
    const { states } = build({})
    await capturedHandlers[ADD_RESUME]!({})
    await vi.advanceTimersByTimeAsync(0)
    await capturedHandlers[ADD_ABORT]!({})
    await vi.runAllTimersAsync()
    const final = states[states.length - 1]!
    expect(final.step).toBe('stopped')
  })

  it('F2: live job + different resolver user: ADD_START and ADD_RETRY_GROUP are no-ops', async () => {
    const { auditStore, executor, holder, clientCalls } = build({})
    await capturedHandlers[ADD_RESUME]!({})
    await vi.advanceTimersByTimeAsync(0)
    await capturedHandlers[ADD_ABORT]!({})
    await vi.runAllTimersAsync()
    // Stopped (non-complete) job on disk, executor non-idle: the job is still live.
    expect(executor.getState().step).toBe('stopped')
    expect(auditStore.readJob()?.status).not.toBe('complete')

    holder.user = USER_77
    const jobBefore = JSON.stringify(auditStore.readJob())
    const callsBefore = clientCalls()
    await capturedHandlers[ADD_START]!({}, { dialogIds: ['21001'] })
    await capturedHandlers[ADD_RETRY_GROUP]!({}, { dialogId: '21003' })
    await vi.runAllTimersAsync()

    expect(auditStore.initJobCalls).toHaveLength(0)
    expect(clientCalls()).toBe(callsBefore)
    expect(JSON.stringify(auditStore.readJob())).toBe(jobBefore)
  })

  it('F2 lookup: TARGET_RESOLVE/CONFIRM are no-ops while the job is live; TARGET_RESET releases the lock', async () => {
    const { executor, resolver } = build({})
    await capturedHandlers[ADD_RESUME]!({})
    await vi.runAllTimersAsync()
    expect(executor.getState().step).not.toBe('idle')

    await capturedHandlers[TARGET_RESOLVE]!({}, { input: '@someone' })
    await capturedHandlers[TARGET_CONFIRM]!({})
    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(resolver.confirm).not.toHaveBeenCalled()

    await capturedHandlers[TARGET_RESET]!({})
    expect(executor.getState().step).toBe('idle')
    await capturedHandlers[TARGET_RESOLVE]!({}, { input: '@someone' })
    expect(resolver.resolve).toHaveBeenCalledTimes(1)
  })

  it('D-07 narrow: idle executor + reviewed different target + different dialog set starts a fresh job', async () => {
    const { auditStore, holder } = build({})
    holder.user = USER_77
    await capturedHandlers[ADD_START]!({}, { dialogIds: ['21001', '21002'] })
    await vi.runAllTimersAsync()
    expect(auditStore.initJobCalls).toHaveLength(1)
    expect(auditStore.initJobCalls[0]!.targetId).toBe('77')
  })

  it('D-07 Resume-of-A: relaunch, idle, B confirmed, ADD_RESUME is rejected (job untouched, no RPC)', async () => {
    const { auditStore, holder, executor, clientCalls } = build({})
    holder.user = USER_77
    const jobBefore = JSON.stringify(auditStore.readJob())
    const state = (await capturedHandlers[ADD_RESUME]!({})) as AddState
    await vi.runAllTimersAsync()
    expect(state.step).toBe('idle')
    expect(auditStore.initJobCalls).toHaveLength(0)
    expect(clientCalls()).toBe(0)
    expect(JSON.stringify(auditStore.readJob())).toBe(jobBefore)
    expect(executor.getState().step).toBe('idle')
  })

  it("D-07 fresh B: relaunch, idle, B confirmed, ADD_START with A's exact ids starts a fresh job for B", async () => {
    const { auditStore, holder } = build({})
    holder.user = USER_77
    const state = (await capturedHandlers[ADD_START]!({}, { dialogIds: getResumeDialogIds(seedJob()) })) as AddState
    expect(state.step).toBe('running')
    expect(state.targetId).toBe('77')
    await vi.runAllTimersAsync()
    expect(auditStore.initJobCalls).toHaveLength(1)
    expect(auditStore.initJobCalls[0]!.targetId).toBe('77')
    expect(auditStore.initJobCalls[0]!.jobId).not.toBe('ORIGINAL-JOB-ID')
  })

  it('ADD_START with no reviewed target never resumes job A (resume goes through ADD_RESUME only)', async () => {
    const { auditStore, clientCalls } = build({})
    const jobBefore = JSON.stringify(auditStore.readJob())
    await capturedHandlers[ADD_START]!({}, { dialogIds: getResumeDialogIds(seedJob()) })
    await vi.runAllTimersAsync()
    expect(auditStore.initJobCalls).toHaveLength(0)
    expect(clientCalls()).toBe(0)
    expect(JSON.stringify(auditStore.readJob())).toBe(jobBefore)
  })
})
