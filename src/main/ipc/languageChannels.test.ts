/**
 * RED stubs for languageChannels IPC round-trips and Zod rejection.
 * LOC-01 — Wave 0 Nyquist compliance.
 *
 * This file imports from ./languageChannels which does not exist yet.
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
import { registerLanguageChannels } from './languageChannels'

describe('languageChannels', () => {
  it.todo('LANGUAGE_GET returns null when no pref stored')
  it.todo('LANGUAGE_SET accepts en')
  it.todo('LANGUAGE_SET accepts cs')
  it.todo('LANGUAGE_SET rejects invalid locale (e.g. "de") — ZodError thrown')
  it.todo('LANGUAGE_GET returns stored value when pref is set to "cs"')

  // Sentinel: ensures the import above is exercised by a non-todo suite entry
  it('module registers without throwing (will fail RED until languageChannels.ts is created)', () => {
    expect(registerLanguageChannels).toBeDefined()
  })
})
