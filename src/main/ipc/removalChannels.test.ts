/**
 * Tests for removalChannels.ts (Phase 5, IPC security gates + Zod validation).
 *
 * Test map:
 *   - Zod validation: rejects missing severity, invalid severity, empty dialogIds, missing dialogId
 *   - Security gate: removal:start requires authState.step === 'authorized'
 *   - Security gate: removal:retryGroup validates dialogId is in current job dialogIds
 *   - Security gate: removal:start validates dialogIds against enumerator dialog map
 *   - Happy path: removal:start dispatches executor.execute() with valid payload when authorized
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RemovalState } from '@shared/removalTypes'

import { registerRemovalChannels, emitRemovalState } from './removalChannels'

// ---------------------------------------------------------------------------
// Electron mock — mirrors searchChannels.test.ts pattern
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

const IDLE_STATE: RemovalState = {
  step: 'idle',
  severity: 'ban',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}

/** Create a mock RemovalExecutor with controllable state and call tracking. */
function makeMockExecutor(initialState: RemovalState = IDLE_STATE) {
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

/** Create a mock AuditStore with a controllable job. */
function makeMockAuditStore(jobDialogIds: string[] | null = null) {
  return {
    readJob: vi.fn(() =>
      jobDialogIds !== null
        ? {
            schemaVersion: 1 as const,
            jobId: '2026-06-12T00:00:00.000Z',
            severity: 'ban' as const,
            targetId: '999',
            targetName: 'Test User',
            targetAccessHash: '12345',
            dialogIds: jobDialogIds,
            outcomes: [],
            startedAt: '2026-06-12T00:00:00.000Z',
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
// removalChannels — Zod validation
// ---------------------------------------------------------------------------

describe('removalChannels — Zod validation', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('removal:start rejects payload missing severity field', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore(['111'])
    const getAuthState = makeGetAuthState('authorized')

    registerRemovalChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    // Missing severity — Zod should throw
    await expect(
      capturedHandlers['removal:start']({}, { dialogIds: ['111'] })
    ).rejects.toThrow()
    expect(executor.execute).not.toHaveBeenCalled()
  })

  it('removal:start rejects severity value not in kick|ban', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore(['111'])
    const getAuthState = makeGetAuthState('authorized')

    registerRemovalChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    // Invalid severity 'nuke'
    await expect(
      capturedHandlers['removal:start']({}, { severity: 'nuke', dialogIds: ['111'] })
    ).rejects.toThrow()
    expect(executor.execute).not.toHaveBeenCalled()
  })

  it('removal:start rejects dialogIds with length 0', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore()
    const getAuthState = makeGetAuthState('authorized')

    registerRemovalChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    // Empty array fails min(1)
    await expect(
      capturedHandlers['removal:start']({}, { severity: 'ban', dialogIds: [] })
    ).rejects.toThrow()
    expect(executor.execute).not.toHaveBeenCalled()
  })

  it('removal:retryGroup rejects payload missing dialogId', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator()
    const auditStore = makeMockAuditStore(['111'])
    const getAuthState = makeGetAuthState('authorized')

    registerRemovalChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    // Missing dialogId field
    await expect(
      capturedHandlers['removal:retryGroup']({}, {})
    ).rejects.toThrow()
    expect(executor.retryGroup).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// removalChannels — security gates
// ---------------------------------------------------------------------------

describe('removalChannels — security gates', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('removal:start requires authState.step === authorized; returns error state when not authorized', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111'])
    const auditStore = makeMockAuditStore(['111'])
    // Not authorized
    const getAuthState = makeGetAuthState('idle')

    registerRemovalChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    const result = await capturedHandlers['removal:start']({}, { severity: 'ban', dialogIds: ['111'] })

    // executor.execute() must NOT have been called
    expect(executor.execute).not.toHaveBeenCalled()
    // Returns executor.getState() which has step: 'idle'
    expect((result as RemovalState).step).toBe('idle')
  })

  it('removal:retryGroup validates dialogId is in current job dialogIds; rejects unknown dialogId', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111', '222'])
    // Job has dialogIds: ['111', '222'] — '999' is NOT in the job
    const auditStore = makeMockAuditStore(['111', '222'])
    const getAuthState = makeGetAuthState('authorized')

    registerRemovalChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    await expect(
      capturedHandlers['removal:retryGroup']({}, { dialogId: '999' })
    ).rejects.toThrow('Unknown dialogId')
    expect(executor.retryGroup).not.toHaveBeenCalled()
  })

  it('removal:start dispatches executor.execute() with valid payload when authorized', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    const enumerator = makeMockEnumerator(['111', '222', '333'])
    const auditStore = makeMockAuditStore()
    const getAuthState = makeGetAuthState('authorized')

    registerRemovalChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    await capturedHandlers['removal:start']({}, { severity: 'ban', dialogIds: ['111', '222'] })

    // executor.execute() must have been called with the severity + filtered dialogIds
    expect(executor.execute).toHaveBeenCalledOnce()
    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'ban', dialogIds: ['111', '222'] })
    )
  })

  it('removal:start rejects dialogIds not in enumerator dialog map', async () => {
    const win = makeMockWin()
    const executor = makeMockExecutor()
    // Enumerator only knows about '111', '222' — '999' is unknown
    const enumerator = makeMockEnumerator(['111', '222'])
    const auditStore = makeMockAuditStore()
    const getAuthState = makeGetAuthState('authorized')

    registerRemovalChannels(win as never, executor as never, enumerator as never, auditStore as never, getAuthState)

    // '999' is not in enumerator — security gate must reject
    await expect(
      capturedHandlers['removal:start']({}, { severity: 'ban', dialogIds: ['999'] })
    ).rejects.toThrow('unknown dialogId')
    expect(executor.execute).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// emitRemovalState — win.isDestroyed() guard
// ---------------------------------------------------------------------------

describe('emitRemovalState — skips destroyed window', () => {
  it('does NOT call win.webContents.send when isDestroyed() returns true', () => {
    const win = makeMockWin(true) // destroyed
    const state = IDLE_STATE

    emitRemovalState(win as never, state)

    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('DOES call win.webContents.send when isDestroyed() returns false', () => {
    const win = makeMockWin(false) // not destroyed
    const state = IDLE_STATE

    emitRemovalState(win as never, state)

    expect(win.webContents.send).toHaveBeenCalledOnce()
  })
})
