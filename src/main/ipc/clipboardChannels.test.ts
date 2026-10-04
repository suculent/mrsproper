/**
 * Tests for clipboardChannels.ts (Phase 15, D-18, T-15-01/T-15-03).
 *
 * Test map:
 *   1. a valid payload calls clipboard.writeText(text) and resolves { ok: true }
 *   2. an unauthenticated getAuthState returns { ok: false } WITHOUT calling clipboard.writeText
 *   3. a payload with text longer than 2000 chars throws (ZodError) before clipboard.writeText is called
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { registerClipboardChannels } from './clipboardChannels'

// ---------------------------------------------------------------------------
// Electron mock — mirrors addChannels.test.ts's electron-mock-and-capture-handler pattern
// ---------------------------------------------------------------------------

type IpcHandler = (_event: unknown, payload: unknown) => Promise<unknown>

const capturedHandlers: Record<string, IpcHandler> = {}
const writeTextMock = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => {
      capturedHandlers[channel] = handler
    },
  },
  clipboard: {
    writeText: (text: string) => writeTextMock(text),
  },
}))

/** Create a getAuthState function that returns a specified step. */
function makeGetAuthState(step: string) {
  return vi.fn(() => ({ step }))
}

describe('clipboardChannels — CLIPBOARD_WRITE_TEXT', () => {
  beforeEach(() => {
    Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k])
    writeTextMock.mockClear()
  })

  it('1. a valid payload calls clipboard.writeText(text) and resolves { ok: true }', async () => {
    const getAuthState = makeGetAuthState('authorized')
    registerClipboardChannels(getAuthState)

    const result = await capturedHandlers['clipboard:writeText']({}, { text: 'https://t.me/+abc123' })

    expect(writeTextMock).toHaveBeenCalledWith('https://t.me/+abc123')
    expect(result).toEqual({ ok: true })
  })

  it('2. an unauthenticated getAuthState returns { ok: false } without calling clipboard.writeText', async () => {
    const getAuthState = makeGetAuthState('idle')
    registerClipboardChannels(getAuthState)

    const result = await capturedHandlers['clipboard:writeText']({}, { text: 'https://t.me/+abc123' })

    expect(writeTextMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false })
  })

  it('3. a payload with text longer than 2000 chars throws before clipboard.writeText is called', async () => {
    const getAuthState = makeGetAuthState('authorized')
    registerClipboardChannels(getAuthState)

    const tooLong = 'a'.repeat(2001)

    await expect(capturedHandlers['clipboard:writeText']({}, { text: tooLong })).rejects.toThrow()
    expect(writeTextMock).not.toHaveBeenCalled()
  })
})
