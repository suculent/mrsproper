/**
 * Tests for addChannels.ts (Phase 14, ADD_* IPC security gates + Zod validation +
 * target:addContact non-blocking contract).
 *
 * Test map (15 cases per 14-10-PLAN.md):
 *   1.  ADD_START — Zod rejects payload missing dialogIds
 *   2.  ADD_START — unauthenticated returns current state without calling execute()
 *   3.  ADD_START — double-start guard (already running) returns current state, no re-dispatch
 *   4.  ADD_START — dialog-map gate: unknown dialogId throws
 *   5.  ADD_START — valid payload calls execute({ dialogIds, resume }) with resume computed
 *       from auditStore.readJob() (two sub-cases: no job -> falsy; non-complete job -> true)
 *   6.  ADD_ABORT — calls executor.abortExecution(), returns state
 *   7.  ADD_RETRY_GROUP — dialogId not in current job's dialogIds throws
 *   8.  ADD_RETRY_GROUP — valid dialogId calls executor.retryGroup(dialogId)
 *   9.  ADD_GET_STATE — returns executor.getState()
 *   10. ADD_GET_JOB — returns null when auditStore.readJob() is null
 *   11. ADD_GET_JOB — strips targetAccessHash from a non-null job
 *   12. ADD_DISCARD_JOB — calls auditStore.clearJob() and returns null
 *   13. target:addContact — resolves to the contactService result on success
 *   14. target:addContact — resolves to { ok: false } (never throws) when addIfMissing rejects
 *   15. target:addContact — unauthenticated returns { ok: false } without calling contactService
 *   16. ADD_EXPORT_LOG — existsSync=false returns { ok: false, reason: 'no-log' } without
 *       calling showSaveDialog
 *   17. ADD_EXPORT_LOG — existsSync=true, showSaveDialog resolves { canceled: true } returns
 *       { ok: false, reason: 'canceled' } without calling copyFileSync
 *   18. ADD_EXPORT_LOG — existsSync=true, showSaveDialog resolves { canceled: false, filePath }
 *       calls copyFileSync(logPath, filePath) and returns { ok: true }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AddState, AddJobFile } from '@shared/addTypes'

import { registerAddChannels, emitAddState } from './addChannels'

// ---------------------------------------------------------------------------
// Electron mock — mirrors tagChannels.test.ts / removalChannels.test.ts pattern
// ---------------------------------------------------------------------------

type IpcHandler = (_event: unknown, payload: unknown) => Promise<unknown>

const capturedHandlers: Record<string, IpcHandler> = {}
const showSaveDialogMock = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => {
      capturedHandlers[channel] = handler
    },
  },
  BrowserWindow: Object.assign(vi.fn(), { getFocusedWindow: vi.fn(() => null) }),
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialogMock(...args),
  },
}))

const copyFileSyncMock = vi.fn()
const existsSyncMock = vi.fn()

vi.mock('node:fs', () => ({
  copyFileSync: (...args: unknown[]) => copyFileSyncMock(...args),
  existsSync: (...args: unknown[]) => existsSyncMock(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock BrowserWindow with configurable isDestroyed. */
function makeMockWin(destroyed = false) {
  return {
    webContents: {
      send: vi.fn(),
    },
    isDestroyed: () => destroyed,
  }
}

const IDLE_ADD_STATE: AddState = {
  step: 'idle',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}

/** Create a mock AddExecutorLike with controllable state and call tracking. */
function makeMockExecutor(initialState: AddState = IDLE_ADD_STATE) {
  const state = { current: initialState }
  return {
    execute: vi.fn(async () => {}),
    abortExecution: vi.fn(() => {}),
    retryGroup: vi.fn(async () => {}),
    getState: vi.fn(() => state.current),
  }
}

/** Create a mock GroupEnumerator with a controllable loaded state. */
function makeMockEnumerator(dialogIds: string[] = ['111', '222', '333']) {
  return {
    getState: vi.fn(() => ({
      step: 'loaded' as const,
      dialogs: dialogIds.map((id) => ({ id, title: `Group ${id}`, type: 'supergroup' as const })),
    })),
  }
}

/** Build a fake on-disk AddJobFile for auditStore.readJob() fixtures. */
function makeJobFile(overrides: Partial<AddJobFile> = {}): AddJobFile {
  return {
    schemaVersion: 1,
    jobId: '2026-10-03T00:00:00.000Z',
    targetId: '999',
    targetName: 'Test User',
    targetAccessHash: '12345',
    dialogIds: ['111', '222'],
    outcomes: [],
    dmStatus: 'pending',
    startedAt: '2026-10-03T00:00:00.000Z',
    status: 'running',
    ...overrides,
  }
}

/** Create a mock AddAuditStore with a controllable job returned from readJob(). */
function makeMockAuditStore(job: AddJobFile | null = null) {
  return {
    readJob: vi.fn(() => job),
    clearJob: vi.fn(() => {}),
    initJob: vi.fn(() => {}),
    checkpoint: vi.fn(() => {}),
    setStatus: vi.fn(() => {}),
    getRemaining: vi.fn(() => job?.dialogIds ?? []),
  }
}

/** Create a mock ContactService. */
function makeMockContactService(impl?: () => Promise<{ ok: boolean; code?: string }>) {
  return {
    addIfMissing: vi.fn(impl ?? (async () => ({ ok: true }))),
  }
}

/** Create a mock AddLogStore with a controllable path returned from getLogPath(). */
function makeMockAddLogStore(path = '/fake/add-log.txt') {
  return {
    getLogPath: vi.fn(() => path),
  }
}

/** Create a getAuthState function that returns a specified step. */
function makeGetAuthState(step: string) {
  return vi.fn(() => ({ step }))
}

// ---------------------------------------------------------------------------
// ADD_START — Zod validation
// ---------------------------------------------------------------------------

describe('addChannels — ADD_START Zod validation', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('1. ADD_START — Zod rejects a payload with no dialogIds field', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    await expect(capturedHandlers['add:start']({}, {})).rejects.toThrow()
    expect(executor.execute).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ADD_START — security gates
// ---------------------------------------------------------------------------

describe('addChannels — ADD_START security gates', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('2. ADD_START — unauthenticated returns current state without calling executor.execute', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111'])
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('idle')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    const result = await capturedHandlers['add:start']({}, { dialogIds: ['111'] })

    expect(executor.execute).not.toHaveBeenCalled()
    expect((result as AddState).step).toBe('idle')
  })

  it('3. ADD_START — executor already running returns current state without re-dispatching', async () => {
    const win = makeMockWin()
    const RUNNING_STATE: AddState = {
      step: 'running',
      targetId: '123',
      targetName: 'Test',
      progress: { processed: 1, total: 3 },
      outcomes: [],
    }
    const executor = makeMockExecutor(RUNNING_STATE)
    const enumerator = makeMockEnumerator(['111', '222'])
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    const result = await capturedHandlers['add:start']({}, { dialogIds: ['111'] })

    expect(executor.execute).not.toHaveBeenCalled()
    expect((result as AddState).step).toBe('running')
  })

  it('4. ADD_START — a dialogId not present in enumerator dialog map throws', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111', '222'])
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    await expect(
      capturedHandlers['add:start']({}, { dialogIds: ['111', '999'] })
    ).rejects.toThrow()
    expect(executor.execute).not.toHaveBeenCalled()
  })

  it('5a. ADD_START — valid payload calls execute({ dialogIds, resume }) with resume falsy when no job on disk', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111', '222'])
    const auditStore = makeMockAuditStore(null) // no job on disk
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    await capturedHandlers['add:start']({}, { dialogIds: ['111', '222'] })

    expect(executor.execute).toHaveBeenCalledOnce()
    const callArg = (executor.execute.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0]
    expect(callArg).toHaveProperty('dialogIds', ['111', '222'])
    expect(callArg.resume).toBeFalsy()
  })

  it('5b. ADD_START — valid payload calls execute({ dialogIds, resume: true }) when a non-complete job exists on disk', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111', '222'])
    const auditStore = makeMockAuditStore(makeJobFile({ status: 'stopped' }))
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    await capturedHandlers['add:start']({}, { dialogIds: ['111', '222'] })

    expect(executor.execute).toHaveBeenCalledOnce()
    const callArg = (executor.execute.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0]
    expect(callArg).toHaveProperty('dialogIds', ['111', '222'])
    expect(callArg.resume).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ADD_ABORT
// ---------------------------------------------------------------------------

describe('addChannels — ADD_ABORT', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('6. ADD_ABORT — calls executor.abortExecution() and returns state', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    const result = await capturedHandlers['add:abort']({}, undefined)

    expect(executor.abortExecution).toHaveBeenCalledOnce()
    expect((result as AddState).step).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// ADD_RETRY_GROUP
// ---------------------------------------------------------------------------

describe('addChannels — ADD_RETRY_GROUP', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('7. ADD_RETRY_GROUP — a dialogId not in the current job throws', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111', '222'])
    const auditStore = makeMockAuditStore(makeJobFile({ dialogIds: ['111', '222'] }))
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    await expect(
      capturedHandlers['add:retryGroup']({}, { dialogId: '999' })
    ).rejects.toThrow()
    expect(executor.retryGroup).not.toHaveBeenCalled()
  })

  it('8. ADD_RETRY_GROUP — a valid dialogId calls executor.retryGroup(dialogId)', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111', '222'])
    const auditStore = makeMockAuditStore(makeJobFile({ dialogIds: ['111', '222'] }))
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    await capturedHandlers['add:retryGroup']({}, { dialogId: '111' })

    expect(executor.retryGroup).toHaveBeenCalledWith('111')
  })
})

// ---------------------------------------------------------------------------
// ADD_GET_STATE
// ---------------------------------------------------------------------------

describe('addChannels — ADD_GET_STATE', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('9. ADD_GET_STATE — returns executor.getState()', async () => {
    const win = makeMockWin()
    const RUNNING_STATE: AddState = {
      step: 'running',
      targetId: '123',
      targetName: 'Test',
      progress: { processed: 1, total: 3 },
      outcomes: [],
    }
    const executor = makeMockExecutor(RUNNING_STATE)
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    const result = await capturedHandlers['add:getState']({}, undefined)
    expect(result).toBe(RUNNING_STATE)
  })
})

// ---------------------------------------------------------------------------
// ADD_GET_JOB — targetAccessHash stripping (T-14-17)
// ---------------------------------------------------------------------------

describe('addChannels — ADD_GET_JOB', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('10. ADD_GET_JOB — returns null when auditStore.readJob() is null', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore(null)
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    const result = await capturedHandlers['add:getJob']({}, undefined)
    expect(result).toBeNull()
  })

  it('11. ADD_GET_JOB — strips targetAccessHash from a non-null job before returning', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore(makeJobFile())
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    const result = await capturedHandlers['add:getJob']({}, undefined)

    expect(result).not.toBeNull()
    expect(result).not.toHaveProperty('targetAccessHash')
    const job = result as Record<string, unknown>
    expect(job).toHaveProperty('jobId')
    expect(job).toHaveProperty('targetId')
    expect(job).toHaveProperty('targetName')
    expect(job).toHaveProperty('dialogIds')
  })
})

// ---------------------------------------------------------------------------
// ADD_DISCARD_JOB
// ---------------------------------------------------------------------------

describe('addChannels — ADD_DISCARD_JOB', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('12. ADD_DISCARD_JOB — calls auditStore.clearJob() and returns null', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore(makeJobFile())
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    const result = await capturedHandlers['add:discardJob']({}, undefined)

    expect(auditStore.clearJob).toHaveBeenCalledOnce()
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// target:addContact — non-blocking contract (D-08)
// ---------------------------------------------------------------------------

describe('addChannels — target:addContact', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('13. target:addContact — resolves to the contactService result on success', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService(async () => ({ ok: true }))
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    const result = await capturedHandlers['target:addContact']({}, undefined)

    expect(contactService.addIfMissing).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true })
  })

  it('14. target:addContact — resolves to { ok: false } (never throws) when addIfMissing rejects', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    contactService.addIfMissing.mockRejectedValue(new Error('boom'))
    const getAuthState = makeGetAuthState('authorized')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    await expect(capturedHandlers['target:addContact']({}, undefined)).resolves.toEqual({ ok: false })
  })

  it('15. target:addContact — unauthenticated returns { ok: false } without calling contactService', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const getAuthState = makeGetAuthState('idle')

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      makeMockAddLogStore() as never,
      getAuthState
    )

    const result = await capturedHandlers['target:addContact']({}, undefined)

    expect(contactService.addIfMissing).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false })
  })
})

// ---------------------------------------------------------------------------
// ADD_EXPORT_LOG — save dialog + copyFileSync (D-20, T-15-02)
// ---------------------------------------------------------------------------

describe('addChannels — ADD_EXPORT_LOG', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
    showSaveDialogMock.mockReset()
    copyFileSyncMock.mockReset()
    existsSyncMock.mockReset()
  })

  it('16. ADD_EXPORT_LOG — existsSync=false returns { ok: false, reason: "no-log" } without calling showSaveDialog', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const addLogStore = makeMockAddLogStore('/fake/add-log.txt')
    const getAuthState = makeGetAuthState('authorized')
    existsSyncMock.mockReturnValue(false)

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      addLogStore as never,
      getAuthState
    )

    const result = await capturedHandlers['add:exportLog']({}, undefined)

    expect(showSaveDialogMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: 'no-log' })
  })

  it('17. ADD_EXPORT_LOG — existsSync=true, showSaveDialog canceled returns { ok: false, reason: "canceled" } without calling copyFileSync', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const addLogStore = makeMockAddLogStore('/fake/add-log.txt')
    const getAuthState = makeGetAuthState('authorized')
    existsSyncMock.mockReturnValue(true)
    showSaveDialogMock.mockResolvedValue({ canceled: true, filePath: undefined })

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      addLogStore as never,
      getAuthState
    )

    const result = await capturedHandlers['add:exportLog']({}, undefined)

    expect(copyFileSyncMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false, reason: 'canceled' })
  })

  it('18. ADD_EXPORT_LOG — existsSync=true, showSaveDialog resolves a filePath calls copyFileSync(logPath, filePath) and returns { ok: true }', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const addLogStore = makeMockAddLogStore('/fake/add-log.txt')
    const getAuthState = makeGetAuthState('authorized')
    existsSyncMock.mockReturnValue(true)
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: '/chosen/path.txt' })

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      addLogStore as never,
      getAuthState
    )

    const result = await capturedHandlers['add:exportLog']({}, undefined)

    expect(copyFileSyncMock).toHaveBeenCalledWith('/fake/add-log.txt', '/chosen/path.txt')
    expect(result).toEqual({ ok: true })
  })

  it('19. ADD_EXPORT_LOG — copyFileSync throws (e.g. permission error, full disk, or a benign existsSync/dialog race) returns { ok: false, reason: "canceled" } instead of rejecting (WR-02)', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const addLogStore = makeMockAddLogStore('/fake/add-log.txt')
    const getAuthState = makeGetAuthState('authorized')
    existsSyncMock.mockReturnValue(true)
    showSaveDialogMock.mockResolvedValue({ canceled: false, filePath: '/chosen/path.txt' })
    copyFileSyncMock.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      addLogStore as never,
      getAuthState
    )

    const result = await capturedHandlers['add:exportLog']({}, undefined)

    expect(result).toEqual({ ok: false, reason: 'canceled' })
  })

  it('20. ADD_EXPORT_LOG — unauthenticated returns { ok: false } without calling showSaveDialog or copyFileSync (T-15-03)', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const contactService = makeMockContactService()
    const addLogStore = makeMockAddLogStore('/fake/add-log.txt')
    const getAuthState = makeGetAuthState('idle')
    existsSyncMock.mockReturnValue(true)

    registerAddChannels(
      win as never,
      executor as never,
      enumerator as never,
      auditStore as never,
      contactService as never,
      addLogStore as never,
      getAuthState
    )

    const result = await capturedHandlers['add:exportLog']({}, undefined)

    expect(showSaveDialogMock).not.toHaveBeenCalled()
    expect(copyFileSyncMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false })
  })
})

// ---------------------------------------------------------------------------
// emitAddState — win.isDestroyed() guard
// ---------------------------------------------------------------------------

describe('emitAddState — skips destroyed window', () => {
  it('emitAddState — sends to live window', () => {
    const win = makeMockWin(false)
    emitAddState(win as never, IDLE_ADD_STATE)
    expect(win.webContents.send).toHaveBeenCalledOnce()
  })

  it('emitAddState — skips destroyed window', () => {
    const win = makeMockWin(true)
    emitAddState(win as never, IDLE_ADD_STATE)
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})
