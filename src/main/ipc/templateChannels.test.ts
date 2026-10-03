/**
 * RED tests for templateChannels: pure renderTemplate() substitution plus
 * TEMPLATE_GET / TEMPLATE_SET IPC round-trips and Zod rejection (D-15, ADD-16).
 *
 * Strategy: mock electron + electron-store, register the channels, capture the
 * TEMPLATE_GET / TEMPLATE_SET handlers from the ipcMain.handle mock, and invoke
 * them directly (same pattern as languageChannels.test.ts / groupChannels.test.ts).
 *
 * Security invariant under test (T-14-07): TEMPLATE_SET parses the payload with
 * z.object({ template: z.string().min(1).max(4000) }) BEFORE any store write — a
 * compromised renderer cannot inject an empty or oversized template into
 * electron-store.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { ZodError } from 'zod'
import { TEMPLATE_GET, TEMPLATE_SET } from '@shared/channels'

// Shared mock store instance — hoisted so the electron-store mock factory and
// the tests below reference the SAME object (singleton parity with getStore()).
const mocks = vi.hoisted(() => {
  const store = {
    get: vi.fn<(key: string, fallback: string | null) => string | null>().mockReturnValue(null),
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
}))

import { ipcMain } from 'electron'
import {
  registerTemplateChannels,
  renderTemplate,
  DEFAULT_TEMPLATE_EN,
  DEFAULT_TEMPLATE_CS,
} from './templateChannels'

type IpcHandler = (event: unknown, payload?: unknown) => Promise<unknown>

describe('renderTemplate', () => {
  it('replaces {name} with the provided name', () => {
    expect(renderTemplate('Hi {name}!', { name: 'Jan Novák', links: '' })).toBe('Hi Jan Novák!')
  })

  it('replaces {links} with the provided links string (already newline-joined by the caller)', () => {
    const links = 'https://t.me/+a\nhttps://t.me/+b'
    expect(renderTemplate('Links:\n{links}', { name: '', links })).toBe(`Links:\n${links}`)
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    expect(renderTemplate('{name} said hi, {name}!', { name: 'Petr', links: '' })).toBe(
      'Petr said hi, Petr!'
    )
  })

  it('does not touch i18next-style {{ }} double-brace syntax if present in a template', () => {
    const template = 'Hi {name}! {{notAPlaceholder}}'
    expect(renderTemplate(template, { name: 'Jan', links: '' })).toBe(
      'Hi Jan! {{notAPlaceholder}}'
    )
  })

  it('DEFAULT_TEMPLATE_EN contains both {name} and {links} placeholders', () => {
    expect(DEFAULT_TEMPLATE_EN).toContain('{name}')
    expect(DEFAULT_TEMPLATE_EN).toContain('{links}')
  })

  it('DEFAULT_TEMPLATE_CS contains both {name} and {links} placeholders', () => {
    expect(DEFAULT_TEMPLATE_CS).toContain('{name}')
    expect(DEFAULT_TEMPLATE_CS).toContain('{links}')
  })
})

describe('registerTemplateChannels (IPC)', () => {
  let getHandler: IpcHandler
  let setHandler: IpcHandler

  beforeAll(() => {
    registerTemplateChannels()
    const calls = vi.mocked(ipcMain.handle).mock.calls
    getHandler = calls.find(([ch]) => ch === TEMPLATE_GET)![1] as unknown as IpcHandler
    setHandler = calls.find(([ch]) => ch === TEMPLATE_SET)![1] as unknown as IpcHandler
  })

  beforeEach(() => {
    mocks.store.get.mockReturnValue(null)
    mocks.store.set.mockClear()
  })

  it('registers handlers for TEMPLATE_GET and TEMPLATE_SET', () => {
    expect(getHandler).toBeDefined()
    expect(setHandler).toBeDefined()
  })

  it('TEMPLATE_GET returns null on first call (no stored template yet)', async () => {
    await expect(getHandler({})).resolves.toBeNull()
  })

  it('TEMPLATE_SET persists a valid template, and a subsequent TEMPLATE_GET returns it', async () => {
    const template = 'Hi {name}! {links}'
    await expect(setHandler({}, { template })).resolves.toBe(template)
    expect(mocks.store.set).toHaveBeenCalledWith('template', template)

    mocks.store.get.mockReturnValue(template)
    await expect(getHandler({})).resolves.toBe(template)
  })

  it('TEMPLATE_SET rejects an empty string template (Zod min length)', async () => {
    await expect(setHandler({}, { template: '' })).rejects.toThrow(ZodError)
    expect(mocks.store.set).not.toHaveBeenCalled()
  })

  it('TEMPLATE_SET rejects a template longer than 4000 characters', async () => {
    const tooLong = 'a'.repeat(4001)
    await expect(setHandler({}, { template: tooLong })).rejects.toThrow(ZodError)
    expect(mocks.store.set).not.toHaveBeenCalled()
  })
})
