/**
 * Tests for tagChannels.ts (Phase 10, IPC security gates + Zod validation + T-05-04-B identity boundary).
 *
 * Test map:
 *   - Zod validation: rejects missing dialogIds, tag: '' (empty string), dialogIds: [] (empty array)
 *   - Security gate: tag:start requires authState.step === 'authorized' (auth gate)
 *   - Security gate: tag:start double-start guard (running/stopping states)
 *   - Security gate: tag:start validates dialogIds against enumerator dialog map (dialog-map gate)
 *   - Identity boundary (T-05-04-B): execute() called with only { dialogIds, tag } — no targetId/targetName/targetAccessHash
 *   - Push guard: emitTagState skips destroyed window
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TagState } from '@shared/tagTypes'

import { registerTagChannels, emitTagState } from './tagChannels'

// ---------------------------------------------------------------------------
// Electron mock — mirrors removalChannels.test.ts pattern (lines 21–32)
// ---------------------------------------------------------------------------

type IpcHandler = (_event: unknown, payload: unknown) => Promise<unknown>

const capturedHandlers: Record<string, IpcHandler> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => {
      capturedHandlers[channel] = handler
    },
  },
  BrowserWindow: vi.fn(),
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

const IDLE_TAG_STATE: TagState = {
  step: 'idle',
  tag: '',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}

/** Create a mock TagExecutorLike with controllable state and call tracking. No retryGroup. */
function makeMockExecutor(initialState: TagState = IDLE_TAG_STATE) {
  const state = { current: initialState }
  return {
    execute: vi.fn(async () => {}),
    abortExecution: vi.fn(() => {}),
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

/** Create a mock TagAuditStore with a controllable job. */
function makeMockTagAuditStore(jobDialogIds: string[] | null = null) {
  return {
    readJob: vi.fn(() =>
      jobDialogIds !== null
        ? {
            schemaVersion: 1 as const,
            jobId: '2026-06-20T00:00:00.000Z',
            tag: 'TestTag',
            targetId: '999',
            targetName: 'Test User',
            targetAccessHash: '12345',
            dialogIds: jobDialogIds,
            outcomes: [],
            startedAt: '2026-06-20T00:00:00.000Z',
            status: 'running' as const,
          }
        : null
    ),
    clearJob: vi.fn(() => {}),
    initJob: vi.fn(() => {}),
    checkpoint: vi.fn(() => {}),
    setStatus: vi.fn(() => {}),
    getRemaining: vi.fn(() => jobDialogIds ?? []),
  }
}

/** Create a getAuthState function that returns a specified step. */
function makeGetAuthState(step: string) {
  return vi.fn(() => ({ step }))
}

// ---------------------------------------------------------------------------
// tagChannels — Zod validation
// ---------------------------------------------------------------------------

describe('tagChannels — Zod validation', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('tag:start — Zod rejects payload missing dialogIds', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockTagAuditStore()
    const getAuthState = makeGetAuthState('authorized')

    registerTagChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    // Missing dialogIds — Zod should throw
    await expect(
      capturedHandlers['tag:start']({}, { tag: 'T' })
    ).rejects.toThrow()
    expect(executor.execute).not.toHaveBeenCalled()
  })

  it('tag:start — Zod rejects tag: empty string', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockTagAuditStore()
    const getAuthState = makeGetAuthState('authorized')

    registerTagChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    // Empty string fails z.string().min(1)
    await expect(
      capturedHandlers['tag:start']({}, { dialogIds: ['111'], tag: '' })
    ).rejects.toThrow()
    expect(executor.execute).not.toHaveBeenCalled()
  })

  it('tag:start — Zod rejects dialogIds: empty array', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockTagAuditStore()
    const getAuthState = makeGetAuthState('authorized')

    registerTagChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    // Empty array fails min(1)
    await expect(
      capturedHandlers['tag:start']({}, { dialogIds: [], tag: 'T' })
    ).rejects.toThrow()
    expect(executor.execute).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// tagChannels — security gates
// ---------------------------------------------------------------------------

describe('tagChannels — security gates', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('tag:start — auth gate: returns idle when step !== authorized', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111'])
    const auditStore = makeMockTagAuditStore()
    // Not authorized
    const getAuthState = makeGetAuthState('idle')

    registerTagChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    const result = await capturedHandlers['tag:start']({}, { dialogIds: ['111'], tag: 'T' })

    // executor.execute() must NOT have been called
    expect(executor.execute).not.toHaveBeenCalled()
    // Returns executor.getState() which has step: 'idle'
    expect((result as TagState).step).toBe('idle')
  })

  it('tag:start — double-start guard: returns running state without re-dispatching when step is running', async () => {
    const win = makeMockWin()
    const RUNNING_STATE: TagState = {
      step: 'running',
      tag: 'TestTag',
      targetId: '123',
      targetName: 'Test',
      progress: { processed: 1, total: 3 },
      outcomes: [],
    }
    const executor = makeMockExecutor(RUNNING_STATE)
    const enumerator = makeMockEnumerator(['111', '222'])
    const auditStore = makeMockTagAuditStore()
    const getAuthState = makeGetAuthState('authorized')

    registerTagChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    const result = await capturedHandlers['tag:start']({}, { dialogIds: ['111'], tag: 'T' })

    // execute() must NOT have been called — the double-start guard fires first
    expect(executor.execute).not.toHaveBeenCalled()
    // Returns current running state
    expect((result as TagState).step).toBe('running')
  })

  it('tag:start — dialog-map gate: throws on unknown dialogId', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    // Enumerator only knows about '111', '222' — '999' is unknown
    const enumerator = makeMockEnumerator(['111', '222'])
    const auditStore = makeMockTagAuditStore()
    const getAuthState = makeGetAuthState('authorized')

    registerTagChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    // '999' is not in enumerator — security gate must reject
    await expect(
      capturedHandlers['tag:start']({}, { dialogIds: ['111', '999'], tag: 'TestTag' })
    ).rejects.toThrow()
    expect(executor.execute).not.toHaveBeenCalled()
  })

  it('tag:start — dispatches execute with { dialogIds, tag } — no identity fields', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111', '222', '333'])
    const auditStore = makeMockTagAuditStore()
    const getAuthState = makeGetAuthState('authorized')

    registerTagChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    await capturedHandlers['tag:start']({}, { dialogIds: ['111'], tag: 'TestTag' })

    // execute() must have been called with dialogIds + tag only — no identity fields
    expect(executor.execute).toHaveBeenCalledOnce()
    const callArg = (executor.execute.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0]
    expect(callArg).toHaveProperty('dialogIds', ['111'])
    expect(callArg).toHaveProperty('tag', 'TestTag')
    // T-05-04-B: identity must NOT be passed from renderer payload
    expect(callArg).not.toHaveProperty('targetId')
    expect(callArg).not.toHaveProperty('targetName')
    expect(callArg).not.toHaveProperty('targetAccessHash')
  })
})

// ---------------------------------------------------------------------------
// emitTagState — win.isDestroyed() guard
// ---------------------------------------------------------------------------

describe('emitTagState — skips destroyed window', () => {
  it('emitTagState — sends to live window', () => {
    const win = makeMockWin(false) // not destroyed
    const state = IDLE_TAG_STATE

    emitTagState(win as never, state)

    expect(win.webContents.send).toHaveBeenCalledOnce()
  })

  it('emitTagState — skips destroyed window', () => {
    const win = makeMockWin(true) // destroyed
    const state = IDLE_TAG_STATE

    emitTagState(win as never, state)

    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})
