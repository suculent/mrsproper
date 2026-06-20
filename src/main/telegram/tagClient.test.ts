/**
 * tagClient.test.ts — layer-224 patch-connect-restore assertions (Phase 9 Plan 02)
 *
 * Test map:
 *   1. LAYER restored to 198 after connect() resolves
 *   2. LAYER is 224 at the moment innerClient.connect() is called
 *   3. LAYER restored to 198 even when connect() throws (finally block)
 *   4. invoke() routes through governor.run() — not directly to inner client
 *   5. governor.run() wraps innerClient.invoke() with the request object
 *   6. disconnect() calls innerClient.disconnect() once
 *   7. Second connect() while one is in progress throws without calling innerClient.connect() twice
 */

import { describe, it, expect, vi } from 'vitest'
import { TagClient } from './tagClient'
import { RateLimitGovernor } from './governor'

// ── AllTLObjects mock ──────────────────────────────────────────────────────────
// vi.mock is hoisted; the LAYER property is mutable so tests can inspect it.
vi.mock('telegram/tl/AllTLObjects', () => ({ LAYER: 198 }))

// ── Helper: build a mock TagClientInner ───────────────────────────────────────

type LayerSnapshot = { value: number }

/**
 * Create a mock inner client.
 * `connectLayerSeen` is a snapshot object — connect() captures LAYER at call time
 * by reading the mocked AllTLObjects module. We use a callback so the test can
 * control what happens during connect().
 */
function makeMockInner(opts?: {
  connectImpl?: () => Promise<void>
  /** If true, connect never resolves (simulates in-flight connect). */
  connectNeverResolves?: boolean
}) {
  const connectLayerSeen: LayerSnapshot = { value: -1 }

  const connect = vi.fn(async () => {
    // Capture the LAYER value at call time by dynamically requiring the mocked module.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const allTl = require('telegram/tl/AllTLObjects') as { LAYER: number }
    connectLayerSeen.value = allTl.LAYER

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

  return { connect, disconnect, invoke, connectLayerSeen }
}

// ── Helper: build a no-op governor for tests that don't need governor assertions ──

function makeGovernor(mockInner: ReturnType<typeof makeMockInner>) {
  return new RateLimitGovernor({
    client: { invoke: mockInner.invoke },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TagClient', () => {
  describe('patch-connect-restore: AllTLObjects.LAYER', () => {
    it('restores LAYER to 198 after connect() resolves', async () => {
      const allTl = await import('telegram/tl/AllTLObjects')
      const mockInner = makeMockInner()
      const governor = makeGovernor(mockInner)
      const tagClient = new TagClient({ inner: mockInner, governor })

      await tagClient.connect()

      expect(allTl.LAYER).toBe(198)
    })

    it('sets LAYER to 224 at the moment innerClient.connect() is called', async () => {
      const mockInner = makeMockInner()
      const governor = makeGovernor(mockInner)
      const tagClient = new TagClient({ inner: mockInner, governor })

      await tagClient.connect()

      expect(mockInner.connectLayerSeen.value).toBe(224)
    })

    it('restores LAYER to 198 even when innerClient.connect() throws', async () => {
      const allTl = await import('telegram/tl/AllTLObjects')
      const mockInner = makeMockInner({
        connectImpl: async () => {
          throw new Error('network error during connect')
        },
      })
      const governor = makeGovernor(mockInner)
      const tagClient = new TagClient({ inner: mockInner, governor })

      try {
        await tagClient.connect()
      } catch {
        // expected
      }

      expect(allTl.LAYER).toBe(198)
    })
  })

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

  describe('invoke() — layer-224 unparseable response = write accepted', () => {
    // editChatParticipantRank returns an Updates carrying layer-224 constructors that the
    // layer-198 deserializer cannot parse. GramJS throws TypeNotFoundError (.invalidConstructorId
    // set, message "...Constructor ID..."), but the WRITE already succeeded server-side (proven by
    // the Phase 0 spike). TagClient must treat this specific parse failure as success so the
    // governor does not retry it and the executor records 'done', not a NETWORK failure.

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
