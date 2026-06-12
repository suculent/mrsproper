/**
 * Tests for searchChannels.ts (TGT-05h).
 *
 * Test map:
 *   - TGT-05h: SEARCH_START handler with a valid query dispatches searcher.search(query)
 *              and returns the current SearchState; Zod rejects short/malformed queries.
 *   - emitSearchState: win.isDestroyed() guard prevents sending to destroyed window.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SearchState } from '@shared/searchTypes'

import { registerSearchChannels, emitSearchState } from './searchChannels'

// ---------------------------------------------------------------------------
// Electron mock — mirrors the pattern from groupChannels.ts
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

/** Create a mock ParticipantSearcher with controllable state and call tracking. */
function makeMockSearcher(initialState: SearchState = { step: 'idle' }) {
  const state = { current: initialState }
  return {
    search: vi.fn(async (_query: string) => {
      // Simulate state change to searching during search()
      state.current = { step: 'idle' }
    }),
    abortSearch: vi.fn(() => {
      state.current = { step: 'idle' }
    }),
    getState: vi.fn(() => state.current),
    getCandidateAccessHash: vi.fn((_userId: string): bigint | null => null),
  }
}

/** Create a mock TargetResolver stub. */
function makeMockResolver() {
  return {
    getState: vi.fn(() => ({ step: 'idle' as const })),
    resolveByCandidate: vi.fn(async () => {}),
  }
}

// ---------------------------------------------------------------------------
// TGT-05h — SEARCH_START handler
// ---------------------------------------------------------------------------

describe('registerSearchChannels — SEARCH_START (TGT-05h)', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('SEARCH_START dispatches search and returns state', async () => {
    const win = makeMockWin()
    const searcher = makeMockSearcher()
    const resolver = makeMockResolver()

    registerSearchChannels(win as never, searcher as never, resolver as never)

    expect(capturedHandlers['search:start']).toBeDefined()

    const result = await capturedHandlers['search:start']({}, { query: 'Alice' })

    // search() must have been called with the parsed query
    expect(searcher.search).toHaveBeenCalledWith('Alice')
    // Returns state snapshot from getState()
    expect((result as SearchState).step).toBeDefined()
  })

  it('SEARCH_START with query shorter than 2 chars is rejected by Zod', async () => {
    const win = makeMockWin()
    const searcher = makeMockSearcher()
    const resolver = makeMockResolver()

    registerSearchChannels(win as never, searcher as never, resolver as never)

    // 1-char query must fail Zod min(2) before reaching searcher
    await expect(
      capturedHandlers['search:start']({}, { query: 'A' })
    ).rejects.toThrow()
    expect(searcher.search).not.toHaveBeenCalled()
  })

  it('SEARCH_START with missing query field is rejected by Zod', async () => {
    const win = makeMockWin()
    const searcher = makeMockSearcher()
    const resolver = makeMockResolver()

    registerSearchChannels(win as never, searcher as never, resolver as never)

    await expect(
      capturedHandlers['search:start']({}, {})
    ).rejects.toThrow()
    expect(searcher.search).not.toHaveBeenCalled()
  })

  it('SEARCH_START trims whitespace before dispatching (Zod .trim())', async () => {
    const win = makeMockWin()
    const searcher = makeMockSearcher()
    const resolver = makeMockResolver()

    registerSearchChannels(win as never, searcher as never, resolver as never)

    // '  Bob  ' trims to 'Bob' — >= 2 chars, must proceed
    await capturedHandlers['search:start']({}, { query: '  Bob  ' })
    expect(searcher.search).toHaveBeenCalledWith('Bob')
  })

  it('SEARCH_START with whitespace-only query is rejected (Zod .trim().min(2))', async () => {
    const win = makeMockWin()
    const searcher = makeMockSearcher()
    const resolver = makeMockResolver()

    registerSearchChannels(win as never, searcher as never, resolver as never)

    // '   ' trims to '' — must fail .min(2)
    await expect(
      capturedHandlers['search:start']({}, { query: '   ' })
    ).rejects.toThrow()
    expect(searcher.search).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// TGT-05i (tested here as part of TARGET_RESOLVE_CANDIDATE gate)
// See targetChannels.test.ts for TGT-05i full coverage.
// ---------------------------------------------------------------------------

describe('registerSearchChannels — TARGET_RESOLVE_CANDIDATE gate', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
  })

  it('TARGET_RESOLVE_CANDIDATE with unknown userId throws before resolveByCandidate', async () => {
    const win = makeMockWin()
    const searcher = makeMockSearcher()
    const resolver = makeMockResolver()

    // getCandidateAccessHash returns null for unknown userId
    searcher.getCandidateAccessHash.mockReturnValue(null)

    registerSearchChannels(win as never, searcher as never, resolver as never)

    await expect(
      capturedHandlers['target:resolveCandidate']({}, { userId: '99999' })
    ).rejects.toThrow('Unknown userId — not in current candidate set')
    expect(resolver.resolveByCandidate).not.toHaveBeenCalled()
  })

  it('TARGET_RESOLVE_CANDIDATE with known userId proceeds to resolveByCandidate', async () => {
    const win = makeMockWin()
    const searcher = makeMockSearcher()
    const resolver = makeMockResolver()

    // getCandidateAccessHash returns a valid hash for known userId
    const fakeHash = BigInt('12345678901234')
    searcher.getCandidateAccessHash.mockReturnValue(fakeHash)

    registerSearchChannels(win as never, searcher as never, resolver as never)

    await capturedHandlers['target:resolveCandidate']({}, { userId: '123456' })
    expect(resolver.resolveByCandidate).toHaveBeenCalledWith(BigInt('123456'), fakeHash)
  })
})

// ---------------------------------------------------------------------------
// emitSearchState — win.isDestroyed() guard
// ---------------------------------------------------------------------------

describe('emitSearchState — skips destroyed window', () => {
  it('does NOT call win.webContents.send when isDestroyed() returns true', () => {
    const win = makeMockWin(true) // destroyed
    const state: SearchState = { step: 'idle' }

    emitSearchState(win as never, state)

    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('DOES call win.webContents.send when isDestroyed() returns false', () => {
    const win = makeMockWin(false) // not destroyed
    const state: SearchState = { step: 'idle' }

    emitSearchState(win as never, state)

    expect(win.webContents.send).toHaveBeenCalledOnce()
  })
})
