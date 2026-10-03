/**
 * RED tests for groupChannels.ts (GRP-02, GRP-03, T-04-06).
 * Import of './groupChannels' will fail until groupChannels.ts is created.
 * That is the correct RED state.
 *
 * Test map:
 *   - GRP-02: groups:getState, groups:refresh handlers
 *   - GRP-03: scan:start, scan:abort, scan:getState, scan:retryGroup handlers
 *   - T-04-06: dialogId validated against known in-memory list before any scanner call
 *   - Zod validation: scan:retryGroup payload shape and bounds
 *   - Window guard: emitGroupsState / emitScanState skip destroyed windows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GroupsState, ScanState } from '@shared/groupTypes'

// RED: This import will fail — groupChannels.ts does not exist yet.
// Task 2 (GREEN) creates: src/main/ipc/groupChannels.ts
import { registerGroupChannels, emitGroupsState, emitScanState } from './groupChannels'

// ---------------------------------------------------------------------------
// Electron mock — mirrors the pattern from targetChannels.test.ts exactly
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

/** Create a mock GroupEnumerator stub. */
function makeMockEnumerator() {
  return {
    getState: vi.fn((): GroupsState => ({
      step: 'loaded',
      dialogs: [{ id: '123', title: 'Test Group', avatar: null, memberCount: 5, type: 'supergroup' as const, canAct: true, greyReason: null, canAdd: true, addGreyReason: null }],
    })),
    refresh: vi.fn((): Promise<void> => Promise.resolve()),
  }
}

/** Create a mock MembershipScanner stub.
 * Uses the real MembershipScanner type to ensure mock stays aligned with the
 * class's actual public API — if a method is renamed or removed in MembershipScanner,
 * TypeScript will flag the mock here (Defect 4 regression guard). */
function makeMockScanner(): Pick<import('../telegram/MembershipScanner').MembershipScanner, 'scan' | 'abortScan' | 'getState' | 'retryGroup'> {
  return {
    scan: vi.fn((): Promise<void> => Promise.resolve()),
    abortScan: vi.fn((): void => undefined),
    getState: vi.fn((): ScanState => ({ step: 'idle' })),
    retryGroup: vi.fn((): Promise<void> => Promise.resolve()),
  }
}

// ---------------------------------------------------------------------------
// GRP-02 — groups:getState
// ---------------------------------------------------------------------------

describe('registerGroupChannels — groups:getState', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('returns current GroupsState from enumerator', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    expect(capturedHandlers['groups:getState']).toBeDefined()

    const result = (await capturedHandlers['groups:getState']({}, undefined)) as GroupsState

    expect(enumerator.getState).toHaveBeenCalled()
    expect(result.step).toBe('loaded')
  })
})

// ---------------------------------------------------------------------------
// GRP-02 — groups:refresh
// ---------------------------------------------------------------------------

describe('registerGroupChannels — groups:refresh', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('calls enumerator.refresh() and returns new state', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    const result = (await capturedHandlers['groups:refresh']({}, undefined)) as GroupsState

    expect(enumerator.refresh).toHaveBeenCalled()
    expect(enumerator.getState).toHaveBeenCalled()
    expect(result.step).toBe('loaded')
  })
})

// ---------------------------------------------------------------------------
// GRP-03 — scan:start
// ---------------------------------------------------------------------------

describe('registerGroupChannels — scan:start', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('calls scanner.scan() and returns ScanState from scanner.getState()', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    const result = (await capturedHandlers['scan:start']({}, undefined)) as ScanState

    expect(scanner.scan).toHaveBeenCalled()
    // Regression: handler must call scanner.getState() (not getScanState()) — Defect 4
    expect(scanner.getState).toHaveBeenCalled()
    expect(result.step).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// GRP-03 — scan:abort
// ---------------------------------------------------------------------------

describe('registerGroupChannels — scan:abort', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('calls scanner.abortScan() and returns ScanState from scanner.getState()', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    const result = (await capturedHandlers['scan:abort']({}, undefined)) as ScanState

    expect(scanner.abortScan).toHaveBeenCalled()
    // Regression: handler must call scanner.getState() (not getScanState()) — Defect 4
    expect(scanner.getState).toHaveBeenCalled()
    expect(result.step).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// GRP-03 — scan:getState
// ---------------------------------------------------------------------------

describe('registerGroupChannels — scan:getState', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('returns scanner.getState()', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    const result = (await capturedHandlers['scan:getState']({}, undefined)) as ScanState

    expect(scanner.getState).toHaveBeenCalled()
    expect(result.step).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// GRP-03, T-04-06 — scan:retryGroup
// ---------------------------------------------------------------------------

describe('registerGroupChannels — scan:retryGroup', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('calls scanner.retryGroup with valid payload and known dialogId', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    await capturedHandlers['scan:retryGroup']({}, { dialogId: '123' })

    expect(scanner.retryGroup).toHaveBeenCalledWith('123')
  })

  it('throws "Unknown dialogId" for unknown dialogId (T-04-06 security gate)', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    await expect(
      capturedHandlers['scan:retryGroup']({}, { dialogId: '999' })
    ).rejects.toThrow('Unknown dialogId')

    expect(scanner.retryGroup).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Zod validation — scan:retryGroup payload
// ---------------------------------------------------------------------------

describe('registerGroupChannels — scan:retryGroup Zod validation', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('throws ZodError on missing dialogId', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    await expect(
      capturedHandlers['scan:retryGroup']({}, {})
    ).rejects.toThrow()

    expect(scanner.retryGroup).not.toHaveBeenCalled()
  })

  it('throws ZodError on dialogId empty string (min 1)', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    await expect(
      capturedHandlers['scan:retryGroup']({}, { dialogId: '' })
    ).rejects.toThrow()

    expect(scanner.retryGroup).not.toHaveBeenCalled()
  })

  it('throws ZodError on dialogId over 32 chars (max 32)', async () => {
    const win = makeMockWin()
    const enumerator = makeMockEnumerator()
    const scanner = makeMockScanner()

    registerGroupChannels(win as never, enumerator as never, scanner as never)

    await expect(
      capturedHandlers['scan:retryGroup']({}, { dialogId: 'a'.repeat(33) })
    ).rejects.toThrow()

    expect(scanner.retryGroup).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Window guard — emitGroupsState
// ---------------------------------------------------------------------------

describe('emitGroupsState — window guard', () => {
  it('does NOT call send when isDestroyed()=true', () => {
    const win = makeMockWin(true) // destroyed
    const state: GroupsState = { step: 'idle' }

    emitGroupsState(win as never, state)

    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('calls send when isDestroyed()=false', () => {
    const win = makeMockWin(false) // live
    const state: GroupsState = { step: 'idle' }

    emitGroupsState(win as never, state)

    expect(win.webContents.send).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Window guard — emitScanState
// ---------------------------------------------------------------------------

describe('emitScanState — window guard', () => {
  it('does NOT call send when isDestroyed()=true', () => {
    const win = makeMockWin(true) // destroyed
    const state: ScanState = { step: 'idle' }

    emitScanState(win as never, state)

    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})
