/**
 * GREEN tests for ParticipantSearcher.ts (TGT-05a through TGT-05f, TGT-05k).
 *
 * Test map:
 *   - TGT-05a: streams candidates for supergroup via GetParticipants+ChannelParticipantsSearch
 *   - TGT-05b: applies client-side filter for basic groups
 *   - TGT-05c: deduplicates by userId and merges foundIn across groups
 *   - TGT-05d: generation guard: new search() invalidates prior in-flight search
 *   - TGT-05e: abortSearch() emits idle and clears candidateAccessHashes
 *   - TGT-05f: per-group failure isolation: one group error does not abort remaining groups
 *   - TGT-05k: ChannelParticipantsNotModified handled gracefully — no crash
 */

import { describe, it, expect } from 'vitest'
import { createMockTelegramClient } from './__mocks__/telegramClient'
import { RateLimitGovernor } from './governor'
import { ParticipantSearcher } from './ParticipantSearcher'
import type { SearchState, CandidateDTO } from '@shared/searchTypes'
import type { AdminDialogDTO } from '@shared/groupTypes'

// ---------------------------------------------------------------------------
// Test factory helpers
// ---------------------------------------------------------------------------

function makeDialog(
  id: string,
  title: string,
  type: AdminDialogDTO['type'] = 'supergroup'
): AdminDialogDTO {
  return {
    id,
    title,
    avatar: null,
    memberCount: null,
    type,
    canAct: true,
    greyReason: null,
  }
}

interface MakeSearcherConfig {
  dialogs: AdminDialogDTO[]
  getParticipantsResult?: Record<string, Array<{
    userId: string
    firstName?: string
    lastName?: string
    username?: string
    accessHash?: string
  }>>
  getParticipantsError?: Record<string, 'USERNAME_NOT_OCCUPIED'>
  basicGroupParticipants?: Record<string, string[]>
  /** Map of dialogId → entity object for getDialogEntity */
  entityMap?: Record<string, { id?: { toString(): string }; accessHash?: { toString(): string } }>
  /** If true, getParticipantsResult returns ChannelParticipantsNotModified for all channels */
  returnNotModified?: boolean
}

function makeSearcher(config: MakeSearcherConfig) {
  const mockClient = createMockTelegramClient({
    getParticipantsResult: config.getParticipantsResult ?? {},
    getParticipantsError: config.getParticipantsError as never,
    basicGroupParticipants: config.basicGroupParticipants ?? {},
  })

  // Override invoke for ChannelParticipantsNotModified test
  if (config.returnNotModified) {
    const originalInvoke = mockClient.invoke.bind(mockClient)
    mockClient.invoke = async (request: unknown): Promise<unknown> => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetParticipants' || className === 'channels.GetParticipants') {
        return { className: 'channels.ChannelParticipantsNotModified' }
      }
      return originalInvoke(request)
    }
  }

  const governor = new RateLimitGovernor(mockClient as never)

  const stubEnumerator = {
    getState: () => ({ step: 'loaded' as const, dialogs: config.dialogs }),
    getDialogEntity: (id: string) => {
      // Use custom entity map if provided
      if (config.entityMap?.[id]) {
        return config.entityMap[id]
      }
      const dialog = config.dialogs.find(d => d.id === id)
      if (!dialog) return null
      if (dialog.type === 'basic-group') {
        return { className: 'Chat', id: { toString: () => id } }
      }
      // Return Channel-like entity with id and accessHash
      return {
        className: 'Channel',
        id: { toString: () => id },
        accessHash: { toString: () => '12345' },
      }
    },
  }

  const states: SearchState[] = []
  const onStateChange = (s: SearchState) => states.push(s)

  const searcher = new ParticipantSearcher({
    client: mockClient as never,
    governor,
    enumerator: stubEnumerator as never,
    onStateChange,
  })

  return { searcher, states }
}

// ---------------------------------------------------------------------------
// TGT-05a: supergroup via GetParticipants+ChannelParticipantsSearch
// ---------------------------------------------------------------------------

describe('ParticipantSearcher', () => {
  it('streams candidates for supergroup via GetParticipants+ChannelParticipantsSearch', async () => {
    const dialog = makeDialog('100', 'Tech Group', 'supergroup')
    const { searcher, states } = makeSearcher({
      dialogs: [dialog],
      getParticipantsResult: {
        '100': [
          { userId: '999', firstName: 'Anna', lastName: 'Smith', username: 'annasmith', accessHash: '555' },
        ],
      },
    })

    await searcher.search('anna')

    // Should have emitted searching states then complete
    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      expect(complete.candidates.length).toBeGreaterThan(0)
      const anna = complete.candidates.find((c: CandidateDTO) => c.id === '999')
      expect(anna).toBeDefined()
      expect(anna?.name).toBe('Anna Smith')
      expect(anna?.username).toBe('annasmith')
      expect(anna?.foundIn).toContain('Tech Group')
      // Security: accessHash must NOT appear in CandidateDTO
      expect((anna as unknown as Record<string, unknown>)?.accessHash).toBeUndefined()
    }
  })

  // ---------------------------------------------------------------------------
  // TGT-05b: client-side filter for basic groups
  // ---------------------------------------------------------------------------

  it('applies client-side filter for basic groups', async () => {
    const dialog = makeDialog('200', 'Basic Group', 'basic-group')
    // Mock GetFullChat participants — all users in the group
    // The client-side filter should only return users matching 'anna'
    const { searcher, states } = makeSearcher({
      dialogs: [dialog],
      basicGroupParticipants: {
        '200': ['999', '888', '777'],
      },
    })

    // Override the mock client to return user details for GetFullChat
    // We need to intercept at the searcher level — use a custom invoke override
    const mockClient = createMockTelegramClient({
      basicGroupParticipants: { '200': ['999', '888', '777'] },
    })

    const originalInvoke = mockClient.invoke.bind(mockClient)
    mockClient.invoke = async (request: unknown): Promise<unknown> => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetFullChat' || className === 'messages.GetFullChat') {
        // Return participants with full user objects in the users array
        return {
          fullChat: {
            className: 'ChatFull',
            participants: {
              className: 'ChatParticipants',
              participants: [
                { userId: { toString: () => '999' } },
                { userId: { toString: () => '888' } },
                { userId: { toString: () => '777' } },
              ],
            },
          },
          users: [
            { id: { toString: () => '999' }, firstName: 'Anna', lastName: 'Johnson', username: null, deleted: false },
            { id: { toString: () => '888' }, firstName: 'Bob', lastName: 'Smith', username: null, deleted: false },
            { id: { toString: () => '777' }, firstName: 'Anna', lastName: 'Lee', username: 'annaalee', deleted: false },
          ],
        }
      }
      return originalInvoke(request)
    }

    const governor = new RateLimitGovernor(mockClient as never)
    const stubEnumerator = {
      getState: () => ({ step: 'loaded' as const, dialogs: [dialog] }),
      getDialogEntity: (id: string) => ({ className: 'Chat', id: { toString: () => id } }),
    }

    const states2: SearchState[] = []
    const searcher2 = new ParticipantSearcher({
      client: mockClient as never,
      governor,
      enumerator: stubEnumerator as never,
      onStateChange: (s) => states2.push(s),
    })

    await searcher2.search('anna')

    const complete = states2.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      // Only 'anna' users should match; Bob should not appear
      const ids = complete.candidates.map((c: CandidateDTO) => c.id)
      expect(ids).toContain('999')
      expect(ids).toContain('777')
      expect(ids).not.toContain('888')
    }

    void states // suppress unused warning
    void searcher
  })

  // ---------------------------------------------------------------------------
  // TGT-05c: deduplication by userId + foundIn merging
  // ---------------------------------------------------------------------------

  it('deduplicates by userId and merges foundIn across groups', async () => {
    const dialog1 = makeDialog('100', 'Group A', 'supergroup')
    const dialog2 = makeDialog('200', 'Group B', 'supergroup')

    const { searcher, states } = makeSearcher({
      dialogs: [dialog1, dialog2],
      getParticipantsResult: {
        // userId '999' appears in both groups
        '100': [{ userId: '999', firstName: 'Anna', lastName: 'Smith' }],
        '200': [{ userId: '999', firstName: 'Anna', lastName: 'Smith' }],
      },
    })

    await searcher.search('anna')

    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      // Only ONE candidate with userId '999'
      const annaCandidates = complete.candidates.filter((c: CandidateDTO) => c.id === '999')
      expect(annaCandidates).toHaveLength(1)
      // foundIn should contain both group titles
      expect(annaCandidates[0].foundIn).toContain('Group A')
      expect(annaCandidates[0].foundIn).toContain('Group B')
    }
  })

  // ---------------------------------------------------------------------------
  // TGT-05d: generation guard — new search() invalidates prior in-flight search
  // ---------------------------------------------------------------------------

  it('generation guard: new search() invalidates prior in-flight search', async () => {
    // Create a deferred promise to pause the first search mid-flight
    let resolveDeferred!: () => void
    const deferred = new Promise<void>((res) => { resolveDeferred = res })

    const dialog = makeDialog('100', 'Group', 'supergroup')
    const mockClient = createMockTelegramClient({
      getParticipantsResult: {
        '100': [{ userId: '999', firstName: 'Alice' }],
      },
    })

    let callCount = 0
    const originalInvoke = mockClient.invoke.bind(mockClient)
    mockClient.invoke = async (request: unknown): Promise<unknown> => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetParticipants' || className === 'channels.GetParticipants') {
        callCount++
        if (callCount === 1) {
          // Pause the first search call until deferred resolves
          await deferred
        }
      }
      return originalInvoke(request)
    }

    const governor = new RateLimitGovernor(mockClient as never)
    const stubEnumerator = {
      getState: () => ({ step: 'loaded' as const, dialogs: [dialog] }),
      getDialogEntity: (id: string) => ({
        className: 'Channel',
        id: { toString: () => id },
        accessHash: { toString: () => '0' },
      }),
    }

    const states: SearchState[] = []
    const searcher = new ParticipantSearcher({
      client: mockClient as never,
      governor,
      enumerator: stubEnumerator as never,
      onStateChange: (s) => states.push(s),
    })

    // Start first search (will pause mid-flight)
    const firstSearch = searcher.search('alice')

    // Start second search immediately — supersedes first (increments generation)
    const secondSearch = searcher.search('bob')

    // Unblock the deferred first search
    resolveDeferred()

    await Promise.all([firstSearch, secondSearch])

    // CR-02 key assertion: the generation guard must prevent the first (stale) search
    // from emitting a 'complete' state AFTER the second search has already emitted.
    // The second search runs after the first is unblocked; since the mock returns
    // results regardless of query, what matters is that the generation guard works:
    // when search('alice') resumes and checks gen !== this._generation, it must exit
    // without emitting a final 'complete' for generation 1.
    //
    // After both finish, final state should be 'complete' from the SECOND search.
    const lastState = states[states.length - 1]
    expect(lastState.step).toBe('complete')

    // Verify only one complete state was emitted (the second search's complete).
    // The first search must have been cancelled before emitting its complete.
    // In practice, if generation guard works, the first search exits without complete.
    const completeStates = states.filter(s => s.step === 'complete')
    // There should be exactly 1 complete (from the second search)
    // because the first search's generation was superseded
    expect(completeStates.length).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // TGT-05e: abortSearch() emits idle and clears candidateAccessHashes
  // ---------------------------------------------------------------------------

  it('abortSearch() emits idle and clears candidateAccessHashes', async () => {
    // First do a search to populate candidateAccessHashes
    const dialog = makeDialog('100', 'Group', 'supergroup')
    const { searcher, states } = makeSearcher({
      dialogs: [dialog],
      getParticipantsResult: {
        '100': [{ userId: '999', firstName: 'Anna', accessHash: '555' }],
      },
    })

    await searcher.search('anna')

    // Verify accessHash was stored
    expect(searcher.getCandidateAccessHash('999')).not.toBeNull()
    expect(searcher.getCandidateAccessHash('999')).toBe(BigInt('555'))

    // Now abort
    searcher.abortSearch()

    // Should emit idle
    const lastState = states[states.length - 1]
    expect(lastState.step).toBe('idle')

    // getCandidateAccessHash should return null after abort
    expect(searcher.getCandidateAccessHash('999')).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // TGT-05f: per-group failure isolation
  // ---------------------------------------------------------------------------

  it('per-group failure isolation: one group error does not abort remaining groups', async () => {
    const dialog1 = makeDialog('100', 'Failing Group', 'supergroup')
    const dialog2 = makeDialog('200', 'Working Group', 'supergroup')

    const { searcher, states } = makeSearcher({
      dialogs: [dialog1, dialog2],
      getParticipantsError: {
        '100': 'USERNAME_NOT_OCCUPIED', // simulate FLOOD_WAIT or any error
      },
      getParticipantsResult: {
        '200': [{ userId: '888', firstName: 'Anna', lastName: 'Brown' }],
      },
    })

    await searcher.search('anna')

    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      // Candidates from the working group should be present
      expect(complete.candidates.length).toBeGreaterThan(0)
      expect(complete.candidates.find((c: CandidateDTO) => c.id === '888')).toBeDefined()
      // errorCount should be 1 for the failing group
      expect(complete.errorCount).toBe(1)
    }
  })

  // ---------------------------------------------------------------------------
  // TGT-05k: ChannelParticipantsNotModified handled gracefully
  // ---------------------------------------------------------------------------

  it('ChannelParticipantsNotModified handled gracefully — no crash', async () => {
    const dialog = makeDialog('100', 'Group', 'supergroup')

    const mockClient = createMockTelegramClient({})
    const originalInvoke = mockClient.invoke.bind(mockClient)
    mockClient.invoke = async (request: unknown): Promise<unknown> => {
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
      const className = (request as { className?: string })?.className ?? ''
      if (ctorName === 'GetParticipants' || className === 'channels.GetParticipants') {
        // Return ChannelParticipantsNotModified
        return { className: 'channels.ChannelParticipantsNotModified' }
      }
      return originalInvoke(request)
    }

    const governor = new RateLimitGovernor(mockClient as never)
    const stubEnumerator = {
      getState: () => ({ step: 'loaded' as const, dialogs: [dialog] }),
      getDialogEntity: (id: string) => ({
        className: 'Channel',
        id: { toString: () => id },
        accessHash: { toString: () => '0' },
      }),
    }

    const states: SearchState[] = []
    const searcher = new ParticipantSearcher({
      client: mockClient as never,
      governor,
      enumerator: stubEnumerator as never,
      onStateChange: (s) => states.push(s),
    })

    // Should NOT throw
    await expect(searcher.search('test')).resolves.toBeUndefined()

    // Should reach complete state with no candidates
    const complete = states.find(s => s.step === 'complete')
    expect(complete).toBeDefined()
    if (complete?.step === 'complete') {
      expect(complete.candidates).toHaveLength(0)
      expect(complete.errorCount).toBe(0)
    }
  })

  // ---------------------------------------------------------------------------
  // WR-01: short query emits SEARCH_QUERY_TOO_SHORT, not UNKNOWN
  // ---------------------------------------------------------------------------

  it('WR-01: query shorter than 2 chars emits SEARCH_QUERY_TOO_SHORT error code', async () => {
    const dialog = makeDialog('100', 'Any Group', 'supergroup')
    const { searcher, states } = makeSearcher({ dialogs: [dialog] })

    await searcher.search('A')  // 1 char — too short

    const last = states[states.length - 1]
    expect(last.step).toBe('error')
    if (last.step === 'error') {
      expect(last.code).toBe('SEARCH_QUERY_TOO_SHORT')
      // Must NOT emit the misleading UNKNOWN code
      expect(last.code).not.toBe('UNKNOWN')
    }
  })

  it('WR-01: whitespace-only query (trims to empty) emits SEARCH_QUERY_TOO_SHORT', async () => {
    const dialog = makeDialog('100', 'Any Group', 'supergroup')
    const { searcher, states } = makeSearcher({ dialogs: [dialog] })

    await searcher.search('   ')  // trims to '' — too short

    const last = states[states.length - 1]
    expect(last.step).toBe('error')
    if (last.step === 'error') {
      expect(last.code).toBe('SEARCH_QUERY_TOO_SHORT')
    }
  })
})
