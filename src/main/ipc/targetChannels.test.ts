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

/** Create a mock scanner stub — only abortScan() is needed by TARGET_RESET. */
function makeMockScanner() {
  return {
    abortScan: vi.fn(),
  }
}

/** Create a mock searcher stub — only abortSearch() is needed by TARGET_RESET. */
function makeMockSearcher() {
  return {
    abortSearch: vi.fn(),
  }
}

/** Create a mock tag executor stub — only abortExecution() is needed by TARGET_RESET (CR-03). */
function makeMockTagExecutor() {
  return {
    abortExecution: vi.fn(),
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

    registerTargetChannels(win as never, resolver as never, makeMockScanner() as never, makeMockSearcher() as never)

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

    registerTargetChannels(win as never, resolver as never, makeMockScanner() as never, makeMockSearcher() as never)

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

    registerTargetChannels(win as never, resolver as never, makeMockScanner() as never, makeMockSearcher() as never)

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

  it('target:resolve with whitespace-only input is rejected at the boundary (WR-04/IN-03)', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()

    registerTargetChannels(win as never, resolver as never, makeMockScanner() as never, makeMockSearcher() as never)

    // '   ' trims to '' — must fail .min(1) and never reach the resolver
    // (a whitespace-only input would otherwise spend a governed API call).
    await expect(
      capturedHandlers['target:resolve']({}, { input: '   ' })
    ).rejects.toThrow()
    expect(resolver.resolve).not.toHaveBeenCalled()
  })

  it('target:resolve with input longer than 64 chars is rejected at the boundary (WR-04)', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()

    registerTargetChannels(win as never, resolver as never, makeMockScanner() as never, makeMockSearcher() as never)

    // Usernames max out at 32 chars, E.164 phones at 15 digits — anything past
    // the 64-char bound is garbage that must not reach the Telegram API.
    await expect(
      capturedHandlers['target:resolve']({}, { input: 'a'.repeat(65) })
    ).rejects.toThrow()
    expect(resolver.resolve).not.toHaveBeenCalled()
  })

  it('target:resolve accepts a normal username payload within bounds (WR-04 sanity)', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()

    registerTargetChannels(win as never, resolver as never, makeMockScanner() as never, makeMockSearcher() as never)

    await capturedHandlers['target:resolve']({}, { input: '@validuser' })

    expect(resolver.resolve).toHaveBeenCalledWith('@validuser')
  })
})

// ---------------------------------------------------------------------------
// TGT-05g — TARGET_RESET CR-01 abort ordering
// ---------------------------------------------------------------------------

describe('registerTargetChannels — TARGET_RESET abort ordering (TGT-05g)', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('TARGET_RESET calls searcher.abortSearch() BEFORE scanner.abortScan() and resolver.reset()', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()
    const scanner = makeMockScanner()
    const searcher = makeMockSearcher()

    // Track call order using a shared sequence array
    const callOrder: string[] = []
    searcher.abortSearch.mockImplementation(() => { callOrder.push('abortSearch') })
    scanner.abortScan.mockImplementation(() => { callOrder.push('abortScan') })
    resolver.reset.mockImplementation(() => { callOrder.push('reset') })

    registerTargetChannels(win as never, resolver as never, scanner as never, searcher as never)

    await capturedHandlers['target:reset']({}, undefined)

    // Verify all three were called
    expect(searcher.abortSearch).toHaveBeenCalled()
    expect(scanner.abortScan).toHaveBeenCalled()
    expect(resolver.reset).toHaveBeenCalled()

    // Verify call order: searcher → scanner → resolver (CR-01)
    expect(callOrder).toEqual(['abortSearch', 'abortScan', 'reset'])
  })

  it('TARGET_RESET returns resolver state after all aborts', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()
    const scanner = makeMockScanner()
    const searcher = makeMockSearcher()

    registerTargetChannels(win as never, resolver as never, scanner as never, searcher as never)

    const result = (await capturedHandlers['target:reset']({}, undefined)) as TargetState

    // After reset, resolver returns idle state
    expect(result.step).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// CR-03 — TARGET_RESET aborts active tag run
// ---------------------------------------------------------------------------

describe('registerTargetChannels — TARGET_RESET aborts tag executor (CR-03)', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('TARGET_RESET calls tagExecutor.abortExecution() before resolver.reset()', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()
    const scanner = makeMockScanner()
    const searcher = makeMockSearcher()
    const tagExecutor = makeMockTagExecutor()

    const callOrder: string[] = []
    tagExecutor.abortExecution.mockImplementation(() => { callOrder.push('tagExecutorAbort') })
    resolver.reset.mockImplementation(() => { callOrder.push('reset') })

    registerTargetChannels(
      win as never,
      resolver as never,
      scanner as never,
      searcher as never,
      undefined,
      tagExecutor as never
    )

    await capturedHandlers['target:reset']({}, undefined)

    expect(tagExecutor.abortExecution).toHaveBeenCalled()
    // tag executor abort must precede resolver.reset() so the run doesn't tag the cleared target
    const tagIdx = callOrder.indexOf('tagExecutorAbort')
    const resetIdx = callOrder.indexOf('reset')
    expect(tagIdx).toBeGreaterThanOrEqual(0)
    expect(tagIdx).toBeLessThan(resetIdx)
  })

  it('TARGET_RESET does not throw when tagExecutor is not provided (optional param)', async () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()
    const scanner = makeMockScanner()
    const searcher = makeMockSearcher()

    // No tagExecutor passed — handler must still work (tagExecutor is optional)
    registerTargetChannels(win as never, resolver as never, scanner as never, searcher as never)

    // Handler is synchronous — just invoke it and verify no throw + resolver.reset() called
    let threw = false
    try {
      await capturedHandlers['target:reset']({}, undefined)
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(resolver.reset).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// TGT-05i — TARGET_RESOLVE_CANDIDATE access-hash gate
// (also tested in searchChannels.test.ts — this confirms the gate is in searchChannels.ts,
//  not in targetChannels.ts, and that targetChannels.ts does NOT register the handler)
// ---------------------------------------------------------------------------

describe('registerTargetChannels — TARGET_RESOLVE_CANDIDATE not registered here', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('target:resolveCandidate is NOT registered by registerTargetChannels (belongs to searchChannels)', () => {
    const win = makeMockWin()
    const resolver = makeMockResolver()
    const scanner = makeMockScanner()
    const searcher = makeMockSearcher()

    registerTargetChannels(win as never, resolver as never, scanner as never, searcher as never)

    // TARGET_RESOLVE_CANDIDATE should NOT be registered by targetChannels
    expect(capturedHandlers['target:resolveCandidate']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// D-05 — lookup lock while add job is non-idle
// ---------------------------------------------------------------------------

describe('registerTargetChannels — add-job lookup lock (D-05)', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  function setup(step?: string) {
    const resolver = makeMockResolver()
    const addExecutor = {
      abortExecution: vi.fn(),
      ...(step !== undefined ? { getState: vi.fn(() => ({ step })) } : {}),
    }
    registerTargetChannels(
      makeMockWin() as never, resolver as never, makeMockScanner() as never,
      makeMockSearcher() as never, undefined, undefined, addExecutor as never
    )
    return { resolver, addExecutor }
  }

  for (const step of ['confirming', 'running', 'stopping', 'stopped', 'hard-stopped', 'complete']) {
    it(`TARGET_RESOLVE and TARGET_CONFIRM are no-ops when add step is ${step}`, async () => {
      const { resolver } = setup(step)
      const r1 = await capturedHandlers['target:resolve']({}, { input: '@x' })
      const r2 = await capturedHandlers['target:confirm']({}, undefined)
      expect(resolver.resolve).not.toHaveBeenCalled()
      expect(resolver.confirm).not.toHaveBeenCalled()
      expect(r1).toBe(resolver.getState())
      expect(r2).toBe(resolver.getState())
    })
  }

  it('idle add step leaves resolve/confirm unchanged', async () => {
    const { resolver } = setup('idle')
    await capturedHandlers['target:resolve']({}, { input: '@x' })
    await capturedHandlers['target:confirm']({}, undefined)
    expect(resolver.resolve).toHaveBeenCalledWith('@x')
    expect(resolver.confirm).toHaveBeenCalled()
  })

  it('addExecutor without getState behaves as idle', async () => {
    const { resolver } = setup(undefined)
    await capturedHandlers['target:resolve']({}, { input: '@x' })
    expect(resolver.resolve).toHaveBeenCalled()
  })

  it('WR-05: an add job that starts during TARGET_RESOLVE resets the late result', async () => {
    const resolver = makeMockResolver()
    let step = 'idle'
    resolver.resolve.mockImplementation(async () => {
      step = 'running'
    })
    const addExecutor = { abortExecution: vi.fn(), getState: vi.fn(() => ({ step })) }
    registerTargetChannels(
      makeMockWin() as never, resolver as never, makeMockScanner() as never,
      makeMockSearcher() as never, undefined, undefined, addExecutor as never
    )
    await capturedHandlers['target:resolve']({}, { input: '@x' })
    expect(resolver.resolve).toHaveBeenCalledWith('@x')
    expect(resolver.reset).toHaveBeenCalledOnce()
  })

  it('idle throughout: TARGET_RESOLVE does not reset afterwards', async () => {
    const { resolver } = setup('idle')
    await capturedHandlers['target:resolve']({}, { input: '@x' })
    expect(resolver.reset).not.toHaveBeenCalled()
  })

  it('Zod still runs first while locked', async () => {
    const { resolver } = setup('running')
    await expect(capturedHandlers['target:resolve']({}, {})).rejects.toThrow()
    expect(resolver.resolve).not.toHaveBeenCalled()
  })

  it('TARGET_RESET still aborts add executor while non-idle', async () => {
    const { resolver, addExecutor } = setup('running')
    await capturedHandlers['target:reset']({}, undefined)
    expect(addExecutor.abortExecution).toHaveBeenCalled()
    expect(resolver.reset).toHaveBeenCalled()
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
