/**
 * RED → GREEN tests for contactService.ts (ADD-05 main-process half, D-08).
 *
 * D-08: contact-add is a standalone, non-blocking service, never part of the AddExecutor run.
 * `addIfMissing()` must never throw — every failure path resolves to { ok: false, code }.
 *
 * Test map:
 *   - calls contacts.AddContact when resolver.getResolvedUser().contact is false
 *   - skips the AddContact call entirely when contact is already true
 *   - returns { ok: false, code } on RPC error, never throws
 *   - returns { ok: true } when resolver.getResolvedUser() is null (no-op, no crash)
 *   - passes phone: '' to AddContact (no phone number required)
 *   - routes the call through governor.run (serialized, not a raw client.invoke)
 */

import { describe, it, expect, vi } from 'vitest'
import { createMockTelegramClient } from './__mocks__/telegramClient'
import { RateLimitGovernor } from './governor'
import { createContactService } from './contactService'

// ---------------------------------------------------------------------------
// Test factory helpers
// ---------------------------------------------------------------------------

function makeResolver(
  resolved: { id: bigint; accessHash: bigint; name?: string; contact?: boolean } | null
) {
  return { getResolvedUser: () => resolved }
}

describe('contactService', () => {
  it('addIfMissing: calls contacts.AddContact when resolver.getResolvedUser().contact is false', async () => {
    const mockClient = createMockTelegramClient({})
    const governor = new RateLimitGovernor({ client: mockClient as never })
    const resolver = makeResolver({
      id: BigInt('99'),
      accessHash: BigInt('12345'),
      name: 'Jan Novák',
      contact: false,
    })
    const service = createContactService({ client: mockClient as never, governor, resolver })

    const result = await service.addIfMissing()

    expect(mockClient.addContactCalls.length).toBe(1)
    expect(mockClient.addContactCalls[0].firstName).toBe('Jan Novák')
    expect(result).toEqual({ ok: true })
  })

  it('addIfMissing: skips the AddContact call entirely when contact is already true', async () => {
    const mockClient = createMockTelegramClient({})
    const governor = new RateLimitGovernor({ client: mockClient as never })
    const resolver = makeResolver({
      id: BigInt('99'),
      accessHash: BigInt('12345'),
      name: 'Jan Novák',
      contact: true,
    })
    const service = createContactService({ client: mockClient as never, governor, resolver })

    const result = await service.addIfMissing()

    expect(mockClient.addContactCalls.length).toBe(0)
    expect(result).toEqual({ ok: true })
  })

  it('addIfMissing: returns { ok: false, code } on RPC error, never throws', async () => {
    const mockClient = createMockTelegramClient({ addContactError: 'CONTACT_NAME_EMPTY' })
    const governor = new RateLimitGovernor({ client: mockClient as never })
    const resolver = makeResolver({
      id: BigInt('99'),
      accessHash: BigInt('12345'),
      name: 'Jan Novák',
      contact: false,
    })
    const service = createContactService({ client: mockClient as never, governor, resolver })

    await expect(service.addIfMissing()).resolves.toEqual({
      ok: false,
      code: 'CONTACT_NAME_EMPTY',
    })
  })

  it('addIfMissing: returns { ok: true } when resolver.getResolvedUser() is null (no-op, no crash)', async () => {
    const mockClient = createMockTelegramClient({})
    const governor = new RateLimitGovernor({ client: mockClient as never })
    const resolver = makeResolver(null)
    const service = createContactService({ client: mockClient as never, governor, resolver })

    const result = await service.addIfMissing()

    expect(mockClient.addContactCalls.length).toBe(0)
    expect(result).toEqual({ ok: true })
  })

  it('addIfMissing: passes phone: "" to AddContact (no phone number required)', async () => {
    const mockClient = createMockTelegramClient({})
    const governor = new RateLimitGovernor({ client: mockClient as never })
    const resolver = makeResolver({
      id: BigInt('99'),
      accessHash: BigInt('12345'),
      name: 'Jan Novák',
      contact: false,
    })
    const service = createContactService({ client: mockClient as never, governor, resolver })

    await service.addIfMissing()

    expect(mockClient.addContactCalls[0].phone).toBe('')
  })

  it('addIfMissing: routes the call through governor.run (serialized, not a raw client.invoke)', async () => {
    const mockClient = createMockTelegramClient({})
    const governor = new RateLimitGovernor({ client: mockClient as never })
    const runSpy = vi.spyOn(governor, 'run')
    const resolver = makeResolver({
      id: BigInt('99'),
      accessHash: BigInt('12345'),
      name: 'Jan Novák',
      contact: false,
    })
    const service = createContactService({ client: mockClient as never, governor, resolver })

    await service.addIfMissing()

    expect(runSpy).toHaveBeenCalledTimes(1)
  })
})
