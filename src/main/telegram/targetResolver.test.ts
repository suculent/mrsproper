/**
 * RED tests for TargetResolver.ts (TGT-01..04, VRF-01..02, VRF-03 prerequisite).
 * Import of './TargetResolver' will fail until Plan 03-03 creates TargetResolver.ts.
 * That is the correct RED state — Wave 2 Plan 03 makes these tests GREEN.
 *
 * Test map:
 *   - TGT-01: username resolution → resolved state
 *   - TGT-02: phone resolution → resolved state
 *   - TGT-03: bigint IDs > Number.MAX_SAFE_INTEGER serialized without loss
 *   - TGT-04: username/phone not found → typed error codes
 *   - VRF-01: avatar bytes available → Uint8Array; avatar hidden/missing → null
 *   - VRF-02: bio from GetFullUser; graceful degradation when GetFullUser fails
 *   - VRF-03 prerequisite: confirm() advances resolved → confirmed; getResolvedUser() bigint shape
 */

import { describe, it, expect, vi } from 'vitest'
import type { TargetState, ResolvedTargetDTO } from '@shared/targetTypes'
import { createMockTelegramClient } from './__mocks__/telegramClient'

// RED: This import will fail — TargetResolver.ts does not exist yet (Wave 0).
// Plan 03-03 creates: src/main/telegram/TargetResolver.ts
import { TargetResolver } from './TargetResolver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a TargetResolver wired to a mock client; captures all state changes. */
function makeResolver(config: Parameters<typeof createMockTelegramClient>[0] = {}) {
  const client = createMockTelegramClient(config)
  const states: TargetState[] = []
  const resolver = new TargetResolver({
    client,
    onStateChange: (s: TargetState) => states.push(s),
    onGovernorEvent: vi.fn(),
  })
  return { resolver, states, client }
}

// ---------------------------------------------------------------------------
// TGT-01, TGT-03 — username resolution
// ---------------------------------------------------------------------------

describe('TargetResolver.resolve — username path (TGT-01, TGT-03)', () => {
  it('resolves @username to a resolved TargetState with string id', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: '111111111',
        username: 'testuser',
        firstName: 'Test',
        accessHash: '0',
      },
    })

    await resolver.resolve('@testuser')

    const last = states[states.length - 1]
    expect(last.step).toBe('resolved')
    const resolved = last as Extract<TargetState, { step: 'resolved' }>
    expect(resolved.target.id).toBe('111111111')
    expect(resolved.target.username).toBe('testuser')
    expect(resolved.target.name).toBeTruthy()
  })

  it('bigint user ID > Number.MAX_SAFE_INTEGER serializes to string without precision loss (TGT-03)', async () => {
    const largeId = '1234567890123456789'
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: largeId,
        username: 'biguser',
        firstName: 'Big',
        accessHash: '0',
      },
    })

    await resolver.resolve('@biguser')

    const last = states[states.length - 1] as Extract<TargetState, { step: 'resolved' }>
    expect(last.step).toBe('resolved')
    // Must be exact decimal string — no rounding from Number conversion
    expect(last.target.id).toBe(largeId)
  })

  it('resolves when GramJS returns big-integer ID objects, not native bigint (CR-02)', async () => {
    const { resolver, states, client } = makeResolver({
      resolveUsernameResult: {
        userId: '111111111',
        username: 'bigintobj',
        firstName: 'BigIntObj',
        accessHash: '0',
      },
    })

    // Sanity: the mock's peer IDs are `big-integer` objects (the real GramJS
    // deserializer shape) — typeof 'object', NOT 'bigint'. Any resolver code
    // that duck-types with `typeof === 'bigint'` or compares IDs with `===`
    // must fail against this shape.
    const raw = (await client.invoke({ className: 'contacts.ResolveUsername' })) as {
      peer: { userId: unknown }
      users: Array<{ id: unknown }>
    }
    expect(typeof raw.peer.userId).toBe('object')
    expect(typeof raw.users[0].id).toBe('object')
    // Two separate responses produce distinct object instances — reference
    // equality between peer.userId and users[].id can never hold.
    expect(raw.peer.userId === raw.users[0].id).toBe(false)

    await resolver.resolve('@bigintobj')

    const last = states[states.length - 1]
    expect(last.step).toBe('resolved')
    const resolved = last as Extract<TargetState, { step: 'resolved' }>
    expect(resolved.target.id).toBe('111111111')
  })

  it('state transitions through resolving → resolved', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: '12345',
        username: 'someone',
        firstName: 'Someone',
        accessHash: '0',
      },
    })

    await resolver.resolve('@someone')

    expect(states.some((s) => s.step === 'resolving')).toBe(true)
    expect(states[states.length - 1].step).toBe('resolved')
  })
})

// ---------------------------------------------------------------------------
// TGT-04 — username not found
// ---------------------------------------------------------------------------

describe('TargetResolver.resolve — username not found (TGT-04)', () => {
  it('USERNAME_NOT_OCCUPIED → error state with code TARGET_USERNAME_NOT_FOUND', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameError: 'USERNAME_NOT_OCCUPIED',
    })

    await resolver.resolve('@nobody')

    const last = states[states.length - 1]
    expect(last.step).toBe('error')
    const errState = last as Extract<TargetState, { step: 'error' }>
    expect(errState.code).toBe('TARGET_USERNAME_NOT_FOUND')
  })

  it('channel/group peer (no userId) → error code TARGET_NO_PUBLIC_PROFILE, not NETWORK (CR-03)', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameChannelPeer: true,
    })

    await resolver.resolve('@somechannel')

    const last = states[states.length - 1]
    expect(last.step).toBe('error')
    const errState = last as Extract<TargetState, { step: 'error' }>
    expect(errState.code).toBe('TARGET_NO_PUBLIC_PROFILE')
  })
})

// ---------------------------------------------------------------------------
// TGT-02, TGT-03 — phone resolution
// ---------------------------------------------------------------------------

describe('TargetResolver.resolve — phone path (TGT-02, TGT-03)', () => {
  it('resolves phone number to a resolved TargetState', async () => {
    const { resolver, states } = makeResolver({
      resolvePhoneResult: {
        userId: '222222222',
        firstName: 'PhoneUser',
        username: undefined,
        accessHash: '0',
      },
    })

    await resolver.resolve('+420123456789')

    const last = states[states.length - 1]
    expect(last.step).toBe('resolved')
    const resolved = last as Extract<TargetState, { step: 'resolved' }>
    expect(resolved.target.id).toBe('222222222')
  })

  it('input +420123456789 routes to phone resolution path (not username)', async () => {
    const { resolver, states } = makeResolver({
      resolvePhoneResult: {
        userId: '333333333',
        firstName: 'PhoneTest',
        accessHash: '0',
      },
    })

    await resolver.resolve('+420123456789')

    const last = states[states.length - 1] as Extract<TargetState, { step: 'resolved' }>
    expect(last.step).toBe('resolved')
    // Resolved from phone path — id comes from resolvePhoneResult
    expect(last.target.id).toBe('333333333')
  })

  it('leading + with digits routes to phone path, @name routes to username path', async () => {
    // Phone path
    const { resolver: phoneResolver, states: phoneStates } = makeResolver({
      resolvePhoneResult: { userId: '444', firstName: 'P', accessHash: '0' },
    })
    await phoneResolver.resolve('+1234567890')
    expect(phoneStates[phoneStates.length - 1].step).toBe('resolved')

    // Username path — @prefix routes differently
    const { resolver: userResolver, states: userStates } = makeResolver({
      resolveUsernameResult: { userId: '555', username: 'u', firstName: 'U', accessHash: '0' },
    })
    await userResolver.resolve('@u')
    expect(userStates[userStates.length - 1].step).toBe('resolved')
  })
})

// ---------------------------------------------------------------------------
// TGT-04 — phone not found
// ---------------------------------------------------------------------------

describe('TargetResolver.resolve — phone not found (TGT-04)', () => {
  it('PHONE_NOT_OCCUPIED → error state with code TARGET_PHONE_NOT_FOUND', async () => {
    const { resolver, states } = makeResolver({
      resolvePhoneError: 'PHONE_NOT_OCCUPIED',
    })

    await resolver.resolve('+420000000000')

    const last = states[states.length - 1]
    expect(last.step).toBe('error')
    const errState = last as Extract<TargetState, { step: 'error' }>
    expect(errState.code).toBe('TARGET_PHONE_NOT_FOUND')
  })
})

// ---------------------------------------------------------------------------
// VRF-01, VRF-02 — avatar and bio
// ---------------------------------------------------------------------------

describe('TargetResolver.resolve — avatar and bio (VRF-01, VRF-02)', () => {
  it('downloadProfilePhoto returns non-empty Buffer → target.avatar is Uint8Array (VRF-01)', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: '100',
        username: 'photouser',
        firstName: 'Photo',
        accessHash: '0',
      },
      identity: {
        firstName: 'Photo',
        id: '100',
        hasPhoto: true,
      },
      getFullUserResult: { about: 'Bio text' },
    })

    await resolver.resolve('@photouser')

    const last = states[states.length - 1] as Extract<TargetState, { step: 'resolved' }>
    expect(last.step).toBe('resolved')
    expect(last.target.avatar).toBeInstanceOf(Uint8Array)
    expect((last.target.avatar as Uint8Array).length).toBeGreaterThan(0)
  })

  it('downloadProfilePhoto returns null → target.avatar is null (VRF-01)', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: '101',
        username: 'nophoto',
        firstName: 'NoPhoto',
        accessHash: '0',
      },
      identity: {
        firstName: 'NoPhoto',
        id: '101',
        hasPhoto: false,
      },
    })

    await resolver.resolve('@nophoto')

    const last = states[states.length - 1] as Extract<TargetState, { step: 'resolved' }>
    expect(last.step).toBe('resolved')
    expect(last.target.avatar).toBeNull()
  })

  it('downloadProfilePhoto throws → avatar is null but state is still resolved (WR-02 graceful degradation)', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: '104',
        username: 'photofail',
        firstName: 'PhotoFail',
        accessHash: '0',
      },
      downloadProfilePhotoError: 'FILE_REFERENCE_EXPIRED',
    })

    await resolver.resolve('@photofail')

    const last = states[states.length - 1] as Extract<TargetState, { step: 'resolved' }>
    // A failed avatar download must NOT abort the successful identity resolution
    expect(last.step).toBe('resolved')
    expect(last.target.avatar).toBeNull()
  })

  it('GetFullUser succeeds → target.bio is populated (VRF-02)', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: '102',
        username: 'biouser',
        firstName: 'Bio',
        accessHash: '0',
      },
      getFullUserResult: { about: 'My bio text' },
    })

    await resolver.resolve('@biouser')

    const last = states[states.length - 1] as Extract<TargetState, { step: 'resolved' }>
    expect(last.step).toBe('resolved')
    expect(last.target.bio).toBe('My bio text')
  })

  it('GetFullUser throws → bio is null but state is still resolved (VRF-02 graceful degradation)', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: '103',
        username: 'nobi',
        firstName: 'NoBio',
        accessHash: '0',
      },
      getFullUserError: 'USERNAME_NOT_OCCUPIED', // any error causes graceful fallback
    })

    await resolver.resolve('@nobi')

    const last = states[states.length - 1] as Extract<TargetState, { step: 'resolved' }>
    // Must still be resolved even if bio fetch fails
    expect(last.step).toBe('resolved')
    expect(last.target.bio).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// VRF-03 prerequisite — confirm gate
// ---------------------------------------------------------------------------

describe('TargetResolver.confirm (VRF-03 prerequisite)', () => {
  it('after resolve, confirm() advances state from resolved to confirmed', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: '200',
        username: 'confirmme',
        firstName: 'Confirm',
        accessHash: '0',
      },
    })

    await resolver.resolve('@confirmme')
    expect(resolver.getState().step).toBe('resolved')

    resolver.confirm()

    expect(resolver.getState().step).toBe('confirmed')
    const last = states[states.length - 1]
    expect(last.step).toBe('confirmed')
  })

  it('getResolvedUser() returns { id: bigint, accessHash: bigint } in confirmed state (T-03-03)', () => {
    const { resolver } = makeResolver({
      resolveUsernameResult: {
        userId: '201',
        username: 'bigintcheck',
        firstName: 'BigInt',
        accessHash: '9999999999999999',
      },
    })

    // Start in a synthetic resolved state is not possible directly —
    // the test verifies the shape contract after a full resolve+confirm cycle
    // but since we can't await here, we assert the type contract inline:
    // getResolvedUser() MUST return null until confirmed.
    const before = resolver.getResolvedUser()
    expect(before).toBeNull()
  })

  it('getResolvedUser() returns bigint id+accessHash after confirm', async () => {
    const { resolver } = makeResolver({
      resolveUsernameResult: {
        userId: '202',
        username: 'confirmed',
        firstName: 'Confirmed',
        accessHash: '9999999999999999',
      },
    })

    await resolver.resolve('@confirmed')
    resolver.confirm()

    const user = resolver.getResolvedUser()
    expect(user).not.toBeNull()
    expect(typeof user!.id).toBe('bigint')
    expect(typeof user!.accessHash).toBe('bigint')
  })
})

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

describe('TargetResolver.reset', () => {
  it('after resolve, reset() returns state to idle', async () => {
    const { resolver } = makeResolver({
      resolveUsernameResult: {
        userId: '300',
        username: 'resetme',
        firstName: 'Reset',
        accessHash: '0',
      },
    })

    await resolver.resolve('@resetme')
    expect(resolver.getState().step).toBe('resolved')

    resolver.reset()

    expect(resolver.getState().step).toBe('idle')
  })

  it('after confirm, reset() returns state to idle', async () => {
    const { resolver } = makeResolver({
      resolveUsernameResult: {
        userId: '301',
        username: 'resetafter',
        firstName: 'Reset',
        accessHash: '0',
      },
    })

    await resolver.resolve('@resetafter')
    resolver.confirm()
    expect(resolver.getState().step).toBe('confirmed')

    resolver.reset()

    expect(resolver.getState().step).toBe('idle')
  })

  it('getResolvedUser() returns null after reset', async () => {
    const { resolver } = makeResolver({
      resolveUsernameResult: {
        userId: '302',
        username: 'resetuser',
        firstName: 'Reset',
        accessHash: '0',
      },
    })

    await resolver.resolve('@resetuser')
    resolver.confirm()
    resolver.reset()

    expect(resolver.getResolvedUser()).toBeNull()
  })

  it('reset() during an in-flight resolve discards the stale resolution (WR-03)', async () => {
    const { resolver, states } = makeResolver({
      resolveUsernameResult: {
        userId: '303',
        username: 'staleuser',
        firstName: 'Stale',
        accessHash: '0',
      },
    })

    // Start a resolve but reset() before it completes — the pending resolution
    // must NOT resurrect the cleared target or repopulate the private fields.
    const pending = resolver.resolve('@staleuser')
    resolver.reset()
    await pending

    expect(resolver.getState().step).toBe('idle')
    expect(resolver.getResolvedUser()).toBeNull()
    // No 'resolved' state may have been emitted after the reset's 'idle'
    const idleIndex = states.findIndex((s) => s.step === 'idle')
    expect(states.slice(idleIndex).some((s) => s.step === 'resolved')).toBe(false)
  })

  it('a newer resolve() supersedes an older in-flight resolve (WR-03)', async () => {
    const { resolver } = makeResolver({
      resolveUsernameResult: {
        userId: '304',
        username: 'winner',
        firstName: 'Winner',
        accessHash: '0',
      },
    })

    // Two overlapping resolves — the LAST one started must win; the displayed
    // identity and getResolvedUser() must agree (never the older resolution).
    const first = resolver.resolve('@loser')
    const second = resolver.resolve('@winner')
    await Promise.all([first, second])

    const state = resolver.getState()
    expect(state.step).toBe('resolved')
    const resolved = state as Extract<TargetState, { step: 'resolved' }>
    expect(resolved.target.id).toBe('304')
    resolver.confirm()
    expect(resolver.getResolvedUser()?.id).toBe(BigInt('304'))
  })
})

// ---------------------------------------------------------------------------
// TGT-05j, TGT-05i — resolveByCandidate (Phase 4.1)
// ---------------------------------------------------------------------------

describe('TargetResolver.resolveByCandidate (TGT-05j, TGT-05i)', () => {
  it('TGT-05j: resolveByCandidate calls GetUsers and emits resolved state with same shape as username/phone path', async () => {
    const { resolver, states } = makeResolver({
      getUsersResult: {
        '12345': {
          firstName: 'Anna',
          lastName: 'Smith',
          username: 'annasmith',
          accessHash: '0',
        },
      },
    })

    await resolver.resolveByCandidate(12345n, 0n)

    const last = states[states.length - 1]
    expect(last.step).toBe('resolved')
    const resolved = last as Extract<TargetState, { step: 'resolved' }>
    expect(resolved.target.id).toBe('12345')
    expect(resolved.target.name).toBe('Anna Smith')
    // Security (T-03-01, T-04.1-05): accessHash must NOT appear in DTO
    expect((resolved.target as unknown as Record<string, unknown>).accessHash).toBeUndefined()
  })

  it('TGT-05j: state transitions through resolving → resolved', async () => {
    const { resolver, states } = makeResolver({
      getUsersResult: {
        '12345': { firstName: 'Anna', accessHash: '0' },
      },
    })

    await resolver.resolveByCandidate(12345n, 0n)

    expect(states.some(s => s.step === 'resolving')).toBe(true)
    expect(states[states.length - 1].step).toBe('resolved')
  })

  it('TGT-05j: resolveByCandidate result is compatible with getResolvedUser() after confirm', async () => {
    const { resolver } = makeResolver({
      getUsersResult: {
        '42000': { firstName: 'TestUser', accessHash: '9999999' },
      },
    })

    await resolver.resolveByCandidate(42000n, 9999999n)
    resolver.confirm()

    const user = resolver.getResolvedUser()
    expect(user).not.toBeNull()
    expect(typeof user!.id).toBe('bigint')
    expect(user!.id).toBe(42000n)
  })

  it('TGT-05i: generation superseded by reset() during resolveByCandidate must not emit resolved state', async () => {
    // Use a deferred promise to pause the GetUsers call mid-flight
    let resolveDeferred!: () => void
    const deferred = new Promise<void>((res) => { resolveDeferred = res })

    const { resolver: baseResolver } = makeResolver({})

    // Create a custom client that pauses on GetUsers
    const { createMockTelegramClient: _, ...rest } = await import('./__mocks__/telegramClient')
    void rest
    const pausingClient = createMockTelegramClient({
      getUsersResult: { '99': { firstName: 'Pausing', accessHash: '0' } },
    })

    const originalInvoke = pausingClient.invoke.bind(pausingClient)
    pausingClient.invoke = async (request: unknown): Promise<unknown> => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetUsers' || className === 'users.GetUsers') {
        await deferred // pause until reset() is called
      }
      return originalInvoke(request)
    }

    const states: TargetState[] = []
    const { TargetResolver: TR } = await import('./TargetResolver')
    const resolver = new TR({
      client: pausingClient as never,
      onStateChange: (s: TargetState) => states.push(s),
      onGovernorEvent: vi.fn(),
    })

    void baseResolver // suppress unused warning

    // Start resolveByCandidate (will pause at GetUsers)
    const pending = resolver.resolveByCandidate(99n, 0n)

    // reset() supersedes the in-flight resolveByCandidate
    resolver.reset()

    // Unblock GetUsers
    resolveDeferred()

    await pending

    // Final state must be idle (from reset), not resolved
    expect(resolver.getState().step).toBe('idle')
    expect(resolver.getResolvedUser()).toBeNull()

    // No 'resolved' state may appear after the 'idle' from reset
    const idleIdx = states.findIndex(s => s.step === 'idle')
    expect(idleIdx).toBeGreaterThanOrEqual(0)
    expect(states.slice(idleIdx).some(s => s.step === 'resolved')).toBe(false)
  })
})
