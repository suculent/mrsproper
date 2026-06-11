/**
 * GREEN tests for MembershipScanner.ts (GRP-01).
 *
 * Test map:
 *   - GRP-01: membership verification for supergroups/channels via GetParticipant
 *   - GRP-01: membership verification for basic groups via GetFullChat participant list
 *   - GRP-01: streaming progress emission during scan
 *   - GRP-01: per-group failure isolation (does not abort rest of scan)
 *   - WR-03: abort/generation token invalidation
 *   - GRP-01: retryGroup single-group re-check
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockTelegramClient } from './__mocks__/telegramClient'
import { RateLimitGovernor } from './governor'
import { MembershipScanner } from './MembershipScanner'
import type { ScanState, AdminDialogDTO } from '@shared/groupTypes'

// ---------------------------------------------------------------------------
// Test factory helpers
// ---------------------------------------------------------------------------

function makeDialog(id: string, type: 'supergroup' | 'basic-group' | 'broadcast-channel' = 'supergroup'): AdminDialogDTO {
  return {
    id,
    title: `Group ${id}`,
    avatar: null,
    memberCount: null,
    type,
    canAct: true,
    greyReason: null,
  }
}

function makeScanner(config: {
  dialogs: AdminDialogDTO[]
  notMemberDialogIds?: string[]
  basicGroupParticipants?: Record<string, string[]>
  participantOverrides?: Record<string, { className: string }>
}) {
  const mockClient = createMockTelegramClient({
    notMemberDialogIds: config.notMemberDialogIds ?? [],
    basicGroupParticipants: config.basicGroupParticipants ?? {},
  })

  // Allow per-test overrides for ChannelParticipantLeft / ChannelParticipantBanned
  if (config.participantOverrides) {
    const overrides = config.participantOverrides
    const originalInvoke = mockClient.invoke.bind(mockClient)
    mockClient.invoke = async (request: unknown): Promise<unknown> => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetParticipant' || className === 'channels.GetParticipant') {
        const channelInput = (request as { channel?: { channelId?: { toString(): string } } }).channel
        const channelId = channelInput?.channelId?.toString() ?? ''
        if (overrides[channelId]) {
          return { participant: overrides[channelId] }
        }
      }
      return originalInvoke(request)
    }
  }

  const governor = new RateLimitGovernor(mockClient as never)

  const stubEnumerator = {
    getState: () => ({ step: 'loaded' as const, dialogs: config.dialogs }),
    getDialogEntity: (id: string) => {
      const dialog = config.dialogs.find(d => d.id === id)
      if (!dialog) return null
      if (dialog.type === 'basic-group') {
        // Return a Chat-like entity
        return { className: 'Chat', id: { toString: () => id } }
      }
      // Return a Channel-like entity
      return { className: 'Channel', channelId: { toString: () => id } }
    },
  }

  const stubResolver = {
    getResolvedUser: () => ({ id: BigInt('99'), accessHash: BigInt('0') }),
  }

  const states: ScanState[] = []
  const onStateChange = (s: ScanState) => states.push(s)

  const scanner = new MembershipScanner({
    client: mockClient as never,
    governor,
    enumerator: stubEnumerator as never,
    resolver: stubResolver,
    onStateChange,
  })

  return { scanner, states }
}

// ---------------------------------------------------------------------------
// GRP-01 — supergroup/channel membership via channels.GetParticipant
// ---------------------------------------------------------------------------

describe('scan — supergroup/channel membership', () => {
  it('isMember=true when GetParticipant returns ChannelParticipant', async () => {
    const dialog = makeDialog('100', 'supergroup')
    const { scanner, states } = makeScanner({ dialogs: [dialog] })

    await scanner.scan()

    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      const result = complete.results.find(r => r.dialogId === '100')
      expect(result?.status).toBe('member')
    }
  })

  it('isMember=false when GetParticipant throws USER_NOT_PARTICIPANT', async () => {
    const dialog = makeDialog('100', 'supergroup')
    const { scanner, states } = makeScanner({
      dialogs: [dialog],
      notMemberDialogIds: ['100'],
    })

    await scanner.scan()

    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      const result = complete.results.find(r => r.dialogId === '100')
      expect(result?.status).toBe('not-member')
    }
  })

  it('isMember=false when GetParticipant returns ChannelParticipantLeft', async () => {
    const dialog = makeDialog('100', 'supergroup')
    const { scanner, states } = makeScanner({
      dialogs: [dialog],
      participantOverrides: { '100': { className: 'ChannelParticipantLeft' } },
    })

    await scanner.scan()

    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      const result = complete.results.find(r => r.dialogId === '100')
      expect(result?.status).toBe('not-member')
    }
  })

  it('isMember=false when GetParticipant returns ChannelParticipantBanned', async () => {
    const dialog = makeDialog('100', 'supergroup')
    const { scanner, states } = makeScanner({
      dialogs: [dialog],
      participantOverrides: { '100': { className: 'ChannelParticipantBanned' } },
    })

    await scanner.scan()

    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      const result = complete.results.find(r => r.dialogId === '100')
      expect(result?.status).toBe('not-member')
    }
  })
})

// ---------------------------------------------------------------------------
// GRP-01 — basic group membership via messages.GetFullChat participant list
// ---------------------------------------------------------------------------

describe('scan — basic group membership', () => {
  it('isMember=true when userId in GetFullChat participants', async () => {
    const dialog = makeDialog('200', 'basic-group')
    const { scanner, states } = makeScanner({
      dialogs: [dialog],
      basicGroupParticipants: { '200': ['99', '100', '101'] },
    })

    await scanner.scan()

    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      const result = complete.results.find(r => r.dialogId === '200')
      expect(result?.status).toBe('member')
    }
  })

  it('isMember=false when userId not in GetFullChat participants', async () => {
    const dialog = makeDialog('200', 'basic-group')
    const { scanner, states } = makeScanner({
      dialogs: [dialog],
      basicGroupParticipants: { '200': ['10', '11', '12'] },
    })

    await scanner.scan()

    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      const result = complete.results.find(r => r.dialogId === '200')
      expect(result?.status).toBe('not-member')
    }
  })
})

// ---------------------------------------------------------------------------
// GRP-01 — streaming progress emission
// ---------------------------------------------------------------------------

describe('scan — progress emission', () => {
  it('emits scanning state with progress { checked, total } per group', async () => {
    const dialogs = [
      makeDialog('1', 'supergroup'),
      makeDialog('2', 'supergroup'),
      makeDialog('3', 'supergroup'),
    ]
    const { scanner, states } = makeScanner({ dialogs })

    await scanner.scan()

    const scanningStates = states.filter(s => s.step === 'scanning')
    // Should have scanning states with incrementing checked values
    expect(scanningStates.length).toBeGreaterThanOrEqual(3)
    const checkedValues = scanningStates.map(s => s.step === 'scanning' ? s.progress.checked : -1)
    expect(checkedValues).toContain(1)
    expect(checkedValues).toContain(2)
    expect(checkedValues).toContain(3)
    // All scanning states should have total=3
    scanningStates.forEach(s => {
      if (s.step === 'scanning') {
        expect(s.progress.total).toBe(3)
      }
    })
  })

  it('emits complete when all groups checked', async () => {
    const dialogs = [makeDialog('1'), makeDialog('2'), makeDialog('3')]
    const { scanner, states } = makeScanner({ dialogs })

    await scanner.scan()

    const lastState = states[states.length - 1]
    expect(lastState.step).toBe('complete')
    if (lastState.step === 'complete') {
      expect(lastState.results).toHaveLength(3)
    }
  })
})

// ---------------------------------------------------------------------------
// GRP-01 — per-group failure isolation
// ---------------------------------------------------------------------------

describe('scan — failure isolation', () => {
  it('per-group error sets status=failed, does not abort rest of scan', async () => {
    const dialogs = [makeDialog('1', 'supergroup'), makeDialog('2', 'supergroup')]
    const mockClient = createMockTelegramClient({})
    // Make the first group throw an unexpected error
    let callCount = 0
    mockClient.invoke = async (request: unknown): Promise<unknown> => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetParticipant' || className === 'channels.GetParticipant') {
        callCount++
        if (callCount === 1) {
          throw new Error('UNEXPECTED_ERROR')
        }
        return { participant: { className: 'ChannelParticipant', userId: { toString: () => '99' } } }
      }
      return {}
    }

    const governor = new RateLimitGovernor(mockClient as never)
    const stubEnumerator = {
      getState: () => ({ step: 'loaded' as const, dialogs }),
      getDialogEntity: (id: string) => ({ className: 'Channel', channelId: { toString: () => id } }),
    }
    const stubResolver = { getResolvedUser: () => ({ id: BigInt('99'), accessHash: BigInt('0') }) }

    const states: ScanState[] = []
    const scanner = new MembershipScanner({
      client: mockClient as never,
      governor,
      enumerator: stubEnumerator as never,
      resolver: stubResolver,
      onStateChange: (s) => states.push(s),
    })

    await scanner.scan()

    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      const r1 = complete.results.find(r => r.dialogId === '1')
      const r2 = complete.results.find(r => r.dialogId === '2')
      expect(r1?.status).toBe('failed')
      expect(r2?.status).toBe('member')
    }
  })
})

// ---------------------------------------------------------------------------
// WR-03 — abort/generation token
// ---------------------------------------------------------------------------

describe('abortScan', () => {
  it('calling abortScan increments generation and emits idle', async () => {
    const dialogs = [makeDialog('1'), makeDialog('2'), makeDialog('3')]
    const { scanner, states } = makeScanner({ dialogs })

    // Start the scan without awaiting, immediately abort
    const scanPromise = scanner.scan()
    scanner.abortScan()
    await scanPromise

    const lastState = states[states.length - 1]
    expect(lastState.step).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// GRP-01 — retryGroup single-group re-check
// ---------------------------------------------------------------------------

describe('retryGroup', () => {
  it('re-checks a single failed group and emits updated results', async () => {
    const dialogs = [makeDialog('1', 'supergroup'), makeDialog('2', 'supergroup')]
    const mockClient = createMockTelegramClient({})
    let firstGroupFailed = false
    mockClient.invoke = async (request: unknown): Promise<unknown> => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetParticipant' || className === 'channels.GetParticipant') {
        const channelInput = (request as { channel?: { channelId?: { toString(): string } } }).channel
        const channelId = channelInput?.channelId?.toString() ?? ''
        if (channelId === '1' && !firstGroupFailed) {
          firstGroupFailed = true
          throw new Error('UNEXPECTED_ERROR')
        }
        return { participant: { className: 'ChannelParticipant', userId: { toString: () => '99' } } }
      }
      return {}
    }

    const governor = new RateLimitGovernor(mockClient as never)
    const stubEnumerator = {
      getState: () => ({ step: 'loaded' as const, dialogs }),
      getDialogEntity: (id: string) => ({ className: 'Channel', channelId: { toString: () => id } }),
    }
    const stubResolver = { getResolvedUser: () => ({ id: BigInt('99'), accessHash: BigInt('0') }) }

    const states: ScanState[] = []
    const scanner = new MembershipScanner({
      client: mockClient as never,
      governor,
      enumerator: stubEnumerator as never,
      resolver: stubResolver,
      onStateChange: (s) => states.push(s),
    })

    await scanner.scan()

    // Verify initial scan has group 1 as failed
    const afterScan = scanner.getState()
    expect(afterScan.step).toBe('complete')
    if (afterScan.step === 'complete') {
      expect(afterScan.results.find(r => r.dialogId === '1')?.status).toBe('failed')
    }

    // Now retry group 1 — this time it should succeed (firstGroupFailed is true, so mock returns member)
    await scanner.retryGroup('1')

    const afterRetry = scanner.getState()
    expect(afterRetry.step).toBe('complete')
    if (afterRetry.step === 'complete') {
      const r1 = afterRetry.results.find(r => r.dialogId === '1')
      expect(r1?.status).toBe('member')
    }
  })
})
