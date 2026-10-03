/**
 * tagClient.test.ts — TagClient behavior assertions (Phase 9 Plan 02; layer-neutral since TL229)
 *
 * Test map:
 *   1. invoke() routes through governor.run() — not directly to inner client
 *   2. governor.run() wraps innerClient.invoke() with the request object
 *   3. unparseable-response catch treats a TypeNotFoundError-shaped error as success
 *   4. disconnect() calls innerClient.disconnect() once
 *   5. Second connect() while one is in progress throws without calling innerClient.connect() twice
 *
 * No AllTLObjects/LAYER mocking here — TagClient no longer mutates any global TL
 * layer (see src/main/telegram/tlLayer.test.ts for the real-package LAYER=229 guard).
 */

import { describe, it, expect, vi } from 'vitest'
import { TagClient } from './tagClient'
import { RateLimitGovernor } from './governor'

// ── Helper: build a mock TagClientInner ───────────────────────────────────────

/**
 * Create a mock inner client. We use a callback so the test can control what
 * happens during connect().
 */
function makeMockInner(opts?: {
  connectImpl?: () => Promise<void>
  /** If true, connect never resolves (simulates in-flight connect). */
  connectNeverResolves?: boolean
}) {
  const connect = vi.fn(async () => {
    if (opts?.connectNeverResolves) {
      // Return a promise that never resolves — simulates an in-flight connect.
      return new Promise<void>(() => {})
    }
    if (opts?.connectImpl) {
      return opts.connectImpl()
    }
  })

  const disconnect = vi.fn(async () => {})
  const invoke = vi.fn(async (_req: unknown) => ({}))

  return { connect, disconnect, invoke }
}

// ── Helper: build a no-op governor for tests that don't need governor assertions ──

function makeGovernor(mockInner: ReturnType<typeof makeMockInner>) {
  return new RateLimitGovernor({
    client: { invoke: mockInner.invoke },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TagClient', () => {
  describe('invoke() governor routing', () => {
    it('routes invoke() through governor.run() — not directly to innerClient.invoke()', async () => {
      const mockInner = makeMockInner()
      const governor = makeGovernor(mockInner)
      const runSpy = vi.spyOn(governor, 'run')
      const tagClient = new TagClient({ inner: mockInner, governor })

      await tagClient.invoke({ className: 'test-request' })

      expect(runSpy).toHaveBeenCalledOnce()
    })

    it('governor.run() wraps innerClient.invoke() with the request object', async () => {
      const mockInner = makeMockInner()
      const governor = makeGovernor(mockInner)
      const tagClient = new TagClient({ inner: mockInner, governor })
      const req = { className: 'messages.EditChatParticipantRank', classType: 'request' }

      await tagClient.invoke(req)

      expect(mockInner.invoke).toHaveBeenCalledOnce()
      expect(mockInner.invoke).toHaveBeenCalledWith(req)
    })
  })

  describe('invoke() — layer-229 unparseable response = write accepted', () => {
    // This defensive fallback catches any TypeNotFoundError-shaped error
    // (.invalidConstructorId set, message "...Constructor ID..."). If GramJS ever
    // throws this shape, TagClient must treat it as success so the governor does
    // not retry it and the executor records 'done', not a NETWORK failure.

    it('resolves (treats as success) when inner.invoke throws a TypeNotFoundError-shaped error', async () => {
      const mockInner = makeMockInner()
      // Persistent rejection: if TagClient did NOT catch this, the governor would retry
      // (NETWORK/retry disposition) and eventually throw — so a passing test proves the catch.
      mockInner.invoke.mockRejectedValue(
        Object.assign(new Error('Could not find a matching Constructor ID for the TLObject ... read with ID 0xdeadbeef'), {
          invalidConstructorId: 0xdeadbeef,
        })
      )
      const governor = makeGovernor(mockInner)
      const tagClient = new TagClient({ inner: mockInner, governor })

      await expect(tagClient.invoke({ className: 'messages.EditChatParticipantRank' })).resolves.toBeDefined()
      // The catch must short-circuit BEFORE the governor's retry path — inner.invoke called once.
      expect(mockInner.invoke).toHaveBeenCalledOnce()
    })

    it('resolves when the error message contains "Constructor ID" even without invalidConstructorId', async () => {
      const mockInner = makeMockInner()
      mockInner.invoke.mockRejectedValue(new Error('Could not find a matching Constructor ID for the TLObject'))
      const governor = makeGovernor(mockInner)
      const tagClient = new TagClient({ inner: mockInner, governor })

      await expect(tagClient.invoke({ className: 'messages.EditChatParticipantRank' })).resolves.toBeDefined()
    })

    it('still rejects on a genuine RPC error (errorMessage present)', async () => {
      const mockInner = makeMockInner()
      mockInner.invoke.mockRejectedValueOnce(
        Object.assign(new Error('CHAT_ADMIN_REQUIRED'), { errorMessage: 'CHAT_ADMIN_REQUIRED' })
      )
      const governor = makeGovernor(mockInner)
      const tagClient = new TagClient({ inner: mockInner, governor })

      await expect(tagClient.invoke({ className: 'messages.EditChatParticipantRank' })).rejects.toThrow('CHAT_ADMIN_REQUIRED')
    })
  })

  describe('disconnect()', () => {
    it('calls innerClient.disconnect() exactly once', async () => {
      const mockInner = makeMockInner()
      const governor = makeGovernor(mockInner)
      const tagClient = new TagClient({ inner: mockInner, governor })

      await tagClient.disconnect()

      expect(mockInner.disconnect).toHaveBeenCalledOnce()
    })
  })

  describe('double-connect guard', () => {
    it('throws when connect() is called while another connect() is in progress', async () => {
      const mockInner = makeMockInner({ connectNeverResolves: true })
      const governor = makeGovernor(mockInner)
      const tagClient = new TagClient({ inner: mockInner, governor })

      // Start first connect — do NOT await; it never resolves.
      void tagClient.connect().catch(() => {})

      // Second call must throw immediately.
      await expect(tagClient.connect()).rejects.toThrow('TagClient: connect() already in progress')

      // innerClient.connect() must only have been called once (for the first call).
      expect(mockInner.connect).toHaveBeenCalledOnce()
    })
  })
})
