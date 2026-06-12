/**
 * RED stubs for themeChannels IPC round-trips and Zod rejection.
 * LOC-01 — Wave 0 Nyquist compliance.
 *
 * This file imports from ./themeChannels which does not exist yet.
 * The suite will fail with "Cannot find module" — intentionally RED.
 * All test cases are .todo() stubs pending GREEN implementation.
 */

import { describe, it, expect, vi } from 'vitest'

// Mock electron-store before importing the channel module
vi.mock('electron-store', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  })),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  nativeTheme: { themeSource: 'system' },
}))

// RED import — module does not exist yet; resolution triggers test failure
import { registerThemeChannels } from './themeChannels'

describe('themeChannels', () => {
  it.todo('THEME_GET returns null when no pref stored')
  it.todo('THEME_SET accepts "light"')
  it.todo('THEME_SET accepts "dark"')
  it.todo('THEME_SET rejects invalid value (e.g. "blue") — ZodError thrown')
  it.todo('THEME_SET sets nativeTheme.themeSource')
  it.todo('THEME_GET returns stored value when pref is set to "dark"')

  // Sentinel: ensures the import above is exercised by a non-todo suite entry
  it('module registers without throwing (will fail RED until themeChannels.ts is created)', () => {
    expect(registerThemeChannels).toBeDefined()
  })
})
