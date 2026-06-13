/**
 * GREEN tests for themeChannels IPC round-trips and Zod rejection.
 * LOC-01 — implemented per Phase 8 review WR-01 (formerly RED .todo() stubs).
 *
 * Strategy: mock electron + electron-store, register the channels, capture the
 * THEME_GET / THEME_SET handlers from the ipcMain.handle mock, and invoke them
 * directly (same pattern as groupChannels.test.ts).
 *
 * Security invariant under test (T-08-02): THEME_SET parses the payload with
 * z.enum(['light','dark']) BEFORE any store write or nativeTheme.themeSource
 * assignment — a compromised renderer cannot inject arbitrary values.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { ZodError } from 'zod'
import { THEME_GET, THEME_SET } from '@shared/channels'

// Shared mock store instance — hoisted so the electron-store mock factory and
// the tests below reference the SAME object (singleton parity with getStore()).
const mocks = vi.hoisted(() => {
  const store = {
    get: vi.fn<(key: string) => 'light' | 'dark' | null>().mockReturnValue(null),
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

import { ipcMain, nativeTheme } from 'electron'
import { registerThemeChannels, getStoredTheme } from './themeChannels'

type IpcHandler = (event: unknown, payload?: unknown) => Promise<unknown>

let getHandler: IpcHandler
let setHandler: IpcHandler

beforeAll(() => {
  registerThemeChannels()
  const calls = vi.mocked(ipcMain.handle).mock.calls
  getHandler = calls.find(([ch]) => ch === THEME_GET)![1] as unknown as IpcHandler
  setHandler = calls.find(([ch]) => ch === THEME_SET)![1] as unknown as IpcHandler
})

beforeEach(() => {
  mocks.store.get.mockReturnValue(null)
  mocks.store.set.mockClear()
  nativeTheme.themeSource = 'system'
})

describe('themeChannels', () => {
  it('registers handlers for THEME_GET and THEME_SET', () => {
    expect(getHandler).toBeDefined()
    expect(setHandler).toBeDefined()
  })

  it('THEME_GET returns null when no pref stored', async () => {
    await expect(getHandler({})).resolves.toBeNull()
  })

  it('THEME_SET accepts "light"', async () => {
    await expect(setHandler({}, { theme: 'light' })).resolves.toBe('light')
    expect(mocks.store.set).toHaveBeenCalledWith('theme', 'light')
  })

  it('THEME_SET accepts "dark"', async () => {
    await expect(setHandler({}, { theme: 'dark' })).resolves.toBe('dark')
    expect(mocks.store.set).toHaveBeenCalledWith('theme', 'dark')
  })

  it('THEME_SET rejects invalid value (e.g. "blue") — ZodError thrown, store and nativeTheme untouched', async () => {
    await expect(setHandler({}, { theme: 'blue' })).rejects.toThrow(ZodError)
    expect(mocks.store.set).not.toHaveBeenCalled()
    expect(nativeTheme.themeSource).toBe('system')
  })

  it('THEME_SET sets nativeTheme.themeSource', async () => {
    await setHandler({}, { theme: 'dark' })
    expect(nativeTheme.themeSource).toBe('dark')
  })

  it('THEME_GET returns stored value when pref is set to "dark"', async () => {
    mocks.store.get.mockReturnValue('dark')
    await expect(getHandler({})).resolves.toBe('dark')
  })

  it('getStoredTheme (launch-time seed, CR-02) returns the stored value', async () => {
    mocks.store.get.mockReturnValue('light')
    await expect(getStoredTheme()).resolves.toBe('light')
  })

  it('getStoredTheme returns null on first launch (no stored pref)', async () => {
    await expect(getStoredTheme()).resolves.toBeNull()
  })
})
