/**
 * RED tests for targetChannels.ts (VRF-03 confirm gate, T-03-04 Zod validation, win guard).
 * Import of './targetChannels' will fail until Plan 03-03 creates targetChannels.ts.
 * That is the correct RED state — Wave 2 Plan 03 makes these tests GREEN.
 *
 * Test map:
 *   - VRF-03: target:confirm IPC handler advances TargetState from resolved → confirmed
 *   - T-03-04 (ASVS V5): target:resolve with malformed payload (missing input) rejected
 *   - Window guard: emitTargetState skips win.webContents.send when win.isDestroyed()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TargetState } from '@shared/targetTypes'

// RED: This import will fail — targetChannels.ts does not exist yet (Wave 0).
// Plan 03-03 creates: src/main/ipc/targetChannels.ts
import { registerTargetChannels, emitTargetState } from './targetChannels'

// ---------------------------------------------------------------------------
// Electron mock — mirrors the pattern from authChannels.ts
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

/** Create a mock TargetResolver stub with controllable state. */
function makeMockResolver() {
  let state: TargetState = {
    step: 'resolved',
    target: {
      id: '123',
      name: 'Test User',
      username: 'testuser',
      bio: null,
      avatar: null,
      deleted: false,
      bot: false,
      premium: false,
      lastSeen: null,
    },
  }

  return {
    getState: vi.fn(() => state),
    confirm: vi.fn(() => {
      state = {
        step: 'confirmed',
        target: {
          id: '123',
          name: 'Test User',
          username: 'testuser',
          bio: null,
          avatar: null,
          deleted: false,
          bot: false,
          premium: false,
          lastSeen: null,
        },
      }
    }),
    resolve: vi.fn(),
    reset: vi.fn(() => {
      state = { step: 'idle' }
    }),
    getResolvedUser: vi.fn(() => null),
  }
}

// ---------------------------------------------------------------------------
// VRF-03 — confirm gate
// ---------------------------------------------------------------------------

describe('registerTargetChannels — confirm gate (VRF-03)', () => {
  beforeEach(() => {
    // Clear captured handlers before each test
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('target:confirm handler advances state from resolved to confirmed', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()

    registerTargetChannels(win as never, resolver as never)

    // Verify handler was registered
    expect(capturedHandlers['target:confirm']).toBeDefined()

    // Simulate renderer invoking the handler
    const result = (await capturedHandlers['target:confirm'](
      {},
      undefined
    )) as TargetState

    // confirm() should have been called on the resolver
    expect(resolver.confirm).toHaveBeenCalled()
    // Returned state step should be 'confirmed'
    expect(result.step).toBe('confirmed')
  })

  it('target:confirm returns the new confirmed TargetState', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()

    registerTargetChannels(win as never, resolver as never)

    const result = (await capturedHandlers['target:confirm'](
      {},
      undefined
    )) as Extract<TargetState, { step: 'confirmed' }>

    expect(result.step).toBe('confirmed')
    expect(result.target).toBeDefined()
    expect(result.target.id).toBe('123')
  })
})

// ---------------------------------------------------------------------------
// T-03-04 — Zod validation at IPC boundary (ASVS V5)
// ---------------------------------------------------------------------------

describe('registerTargetChannels — target:resolve Zod validation (T-03-04)', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('target:resolve with missing input field throws or returns error (malformed payload rejected)', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()

    registerTargetChannels(win as never, resolver as never)

    expect(capturedHandlers['target:resolve']).toBeDefined()

    // Payload missing required `input` field — Zod must reject before reaching resolver
    let threw = false
    let result: unknown = undefined
    try {
      result = await capturedHandlers['target:resolve']({}, {})
      // If it doesn't throw, it should return an error state
    } catch {
      threw = true
    }

    // Either a throw (Zod parse error) or an error TargetState — resolver MUST NOT be called
    if (!threw) {
      const state = result as TargetState
      expect(state.step).toBe('error')
    }
    // In either case the resolver.resolve() must NOT have been invoked
    expect(resolver.resolve).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Window destroyed guard
// ---------------------------------------------------------------------------

describe('emitTargetState — skips destroyed window', () => {
  it('does NOT call win.webContents.send when isDestroyed() returns true', () => {
    const win = makeMockWin(true) // destroyed
    const state: TargetState = { step: 'idle' }

    emitTargetState(win as never, state)

    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('DOES call win.webContents.send when isDestroyed() returns false', () => {
    const win = makeMockWin(false) // not destroyed
    const state: TargetState = { step: 'idle' }

    emitTargetState(win as never, state)

    expect(win.webContents.send).toHaveBeenCalledOnce()
  })
})
