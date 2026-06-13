/**
 * GREEN tests for languageChannels IPC round-trips and Zod rejection.
 * LOC-01 — implemented per Phase 8 review WR-01 (formerly RED .todo() stubs).
 *
 * Strategy: mock electron + electron-store, register the channels, capture the
 * LANGUAGE_GET / LANGUAGE_SET handlers from the ipcMain.handle mock, and invoke
 * them directly (same pattern as groupChannels.test.ts).
 *
 * Security invariant under test (T-08-01): LANGUAGE_SET parses the payload with
 * z.enum(['en','cs']) BEFORE any store write — a compromised renderer cannot
 * inject arbitrary locale strings into electron-store.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { ZodError } from 'zod'
import { LANGUAGE_GET, LANGUAGE_SET } from '@shared/channels'

// Shared mock store instance — hoisted so the electron-store mock factory and
// the tests below reference the SAME object (singleton parity with getStore()).
const mocks = vi.hoisted(() => {
  const store = {
    get: vi.fn<(key: string) => 'en' | 'cs' | null>().mockReturnValue(null),
    set: vi.fn(),
  }
  return { store }
})

vi.mock('electron-store', () => ({
  // Regular function (not arrow) — the module calls `new Store(...)`, and only
  // constructible implementations survive `new`; the returned object overrides `this`.
  default: vi.fn(function MockStore() {
    return mocks.store
  }),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  nativeTheme: { themeSource: 'system' },
}))

import { ipcMain } from 'electron'
import { registerLanguageChannels } from './languageChannels'

type IpcHandler = (event: unknown, payload?: unknown) => Promise<unknown>

let getHandler: IpcHandler
let setHandler: IpcHandler

beforeAll(() => {
  registerLanguageChannels()
  const calls = vi.mocked(ipcMain.handle).mock.calls
  getHandler = calls.find(([ch]) => ch === LANGUAGE_GET)![1] as unknown as IpcHandler
  setHandler = calls.find(([ch]) => ch === LANGUAGE_SET)![1] as unknown as IpcHandler
})

beforeEach(() => {
  mocks.store.get.mockReturnValue(null)
  mocks.store.set.mockClear()
})

describe('languageChannels', () => {
  it('registers handlers for LANGUAGE_GET and LANGUAGE_SET', () => {
    expect(getHandler).toBeDefined()
    expect(setHandler).toBeDefined()
  })

  it('LANGUAGE_GET returns null when no pref stored', async () => {
    await expect(getHandler({})).resolves.toBeNull()
  })

  it('LANGUAGE_SET accepts en', async () => {
    await expect(setHandler({}, { language: 'en' })).resolves.toBe('en')
    expect(mocks.store.set).toHaveBeenCalledWith('language', 'en')
  })

  it('LANGUAGE_SET accepts cs', async () => {
    await expect(setHandler({}, { language: 'cs' })).resolves.toBe('cs')
    expect(mocks.store.set).toHaveBeenCalledWith('language', 'cs')
  })

  it('LANGUAGE_SET rejects invalid locale (e.g. "de") — ZodError thrown, store untouched', async () => {
    await expect(setHandler({}, { language: 'de' })).rejects.toThrow(ZodError)
    expect(mocks.store.set).not.toHaveBeenCalled()
  })

  it('LANGUAGE_SET rejects a non-object payload — ZodError thrown', async () => {
    await expect(setHandler({}, 'cs')).rejects.toThrow(ZodError)
    expect(mocks.store.set).not.toHaveBeenCalled()
  })

  it('LANGUAGE_GET returns stored value when pref is set to "cs"', async () => {
    mocks.store.get.mockReturnValue('cs')
    await expect(getHandler({})).resolves.toBe('cs')
  })
})
