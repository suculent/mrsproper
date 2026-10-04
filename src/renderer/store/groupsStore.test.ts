// Tests for groupsStore's mode-aware pre-check rebuild (CR-03, D-03, D-05).
// Mirrors src/renderer/store/tagStore.test.ts's mocking idiom for ../ipc/groupsClient.
//
// This store additionally mocks 'react' so useSyncExternalStore becomes a plain
// synchronous function (subscribe once, return getSnapshot()). environment: node has
// no jsdom/RTL (Pitfall 6), so the real useSyncExternalStore hook cannot be invoked
// outside a component render — this mock lets the test both (a) trigger the module's
// subscription startup (capturing the onGroupsState/onScanState push callbacks the
// real IPC bridge would otherwise own) and (b) read the current snapshot directly.
//
// Each test calls loadFreshStore(), which vi.resetModules()s and re-imports the store
// so the module-level singleton (currentState, _prevScanStep, listeners) starts clean —
// groupsStore has no exported reset, and state must not leak across tests.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AdminDialogDTO, GroupsState, ScanState } from '@shared/groupTypes'

vi.mock('react', () => ({
  useSyncExternalStore: (
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => unknown
  ) => {
    subscribe(() => {})
    return getSnapshot()
  },
}))

vi.mock('../ipc/groupsClient', () => ({
  groupsClient: {
    getGroupsState: vi.fn(() => new Promise(() => {})),
    onGroupsState: vi.fn(() => vi.fn()),
    startScan: vi.fn(),
    abortScan: vi.fn(),
    retryScanGroup: vi.fn(),
    refreshGroups: vi.fn(),
    onScanState: vi.fn(() => vi.fn()),
  },
}))

// ---------------------------------------------------------------------------
// Mock factory helper
// ---------------------------------------------------------------------------

function makeDialog(overrides: Partial<AdminDialogDTO>): AdminDialogDTO {
  return {
    id: '100',
    title: 'Test Group',
    avatar: null,
    memberCount: 10,
    type: 'supergroup',
    canAct: true,
    greyReason: null,
    canAdd: true,
    addGreyReason: null,
    canUnban: true,
    ...overrides,
  }
}

interface MockGroupsClient {
  getGroupsState: ReturnType<typeof vi.fn>
  onGroupsState: ReturnType<typeof vi.fn>
  startScan: ReturnType<typeof vi.fn>
  abortScan: ReturnType<typeof vi.fn>
  retryScanGroup: ReturnType<typeof vi.fn>
  refreshGroups: ReturnType<typeof vi.fn>
  onScanState: ReturnType<typeof vi.fn>
}

// ---------------------------------------------------------------------------
// Fresh-module loader — isolates the singleton store per test.
// ---------------------------------------------------------------------------

async function loadFreshStore() {
  vi.resetModules()
  const clientModule = await import('../ipc/groupsClient')
  const storeModule = await import('./groupsStore')
  return {
    useGroupsStore: storeModule.useGroupsStore,
    groupsActions: storeModule.groupsActions,
    mockClient: clientModule.groupsClient as unknown as MockGroupsClient,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// (a) Existing Remove-mode first-completion pre-check rebuild — provably unchanged
// ---------------------------------------------------------------------------

describe('groupsStore — onScanState Remove-mode first-completion rebuild (CR-03, unchanged)', () => {
  it('selects canAct+member rows and excludes canAct=false / non-member rows', async () => {
    const { useGroupsStore, mockClient } = await loadFreshStore()
    useGroupsStore() // trigger subscription startup — captures onGroupsState/onScanState callbacks

    const dialogs = [
      makeDialog({ id: '1', canAct: true }), // member, canAct → actionable
      makeDialog({ id: '2', canAct: false }), // member, no rights → excluded
      makeDialog({ id: '3', canAct: true }), // not-member → excluded
    ]
    const onGroupsState = mockClient.onGroupsState.mock.calls[0][0] as (s: GroupsState) => void
    onGroupsState({ step: 'loaded', dialogs })

    const onScanState = mockClient.onScanState.mock.calls[0][0] as (s: ScanState) => void
    onScanState({
      step: 'complete',
      results: [
        { dialogId: '1', status: 'member' },
        { dialogId: '2', status: 'member' },
        { dialogId: '3', status: 'not-member' },
      ],
    })

    expect(useGroupsStore().checkedDialogIds).toEqual(new Set(['1']))
  })
})

// ---------------------------------------------------------------------------
// (b) Retry-complete re-emission does NOT re-rebuild checkedDialogIds (CR-03 preserved)
// ---------------------------------------------------------------------------

describe('groupsStore — onScanState retry-complete does not rebuild (CR-03)', () => {
  it('preserves a manual deselection across a second "complete" emission', async () => {
    const { useGroupsStore, groupsActions, mockClient } = await loadFreshStore()
    useGroupsStore()

    const dialogs = [makeDialog({ id: '1', canAct: true }), makeDialog({ id: '2', canAct: true })]
    const onGroupsState = mockClient.onGroupsState.mock.calls[0][0] as (s: GroupsState) => void
    onGroupsState({ step: 'loaded', dialogs })

    const onScanState = mockClient.onScanState.mock.calls[0][0] as (s: ScanState) => void
    const completeState: ScanState = {
      step: 'complete',
      results: [
        { dialogId: '1', status: 'member' },
        { dialogId: '2', status: 'member' },
      ],
    }

    // First completion pre-checks both.
    onScanState(completeState)
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set(['1', '2']))

    // User manually deselects '2'.
    groupsActions.toggleGroup('2')
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set(['1']))

    // A retry-complete re-emission (scan.step was already 'complete') must NOT rebuild.
    onScanState(completeState)
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set(['1']))
  })
})

// ---------------------------------------------------------------------------
// (c) recomputeCheckedForMode('add') — canAdd+not-member/banned only, excludes pending
// ---------------------------------------------------------------------------

describe("groupsStore — recomputeCheckedForMode('add') (D-05)", () => {
  it('selects only canAdd+not-member/banned rows and excludes pending/member/no-right rows', async () => {
    const { useGroupsStore, groupsActions, mockClient } = await loadFreshStore()
    useGroupsStore()

    const dialogs = [
      makeDialog({ id: '1', canAdd: true }), // not-member → actionable
      makeDialog({ id: '2', canAdd: true }), // banned → actionable
      makeDialog({ id: '3', canAdd: false }), // not-member, no invite right → excluded
      makeDialog({ id: '4', canAdd: true }), // no result entry → pending/null → excluded (D-05)
      makeDialog({ id: '5', canAdd: true }), // member → excluded
    ]
    const onGroupsState = mockClient.onGroupsState.mock.calls[0][0] as (s: GroupsState) => void
    onGroupsState({ step: 'loaded', dialogs })

    const onScanState = mockClient.onScanState.mock.calls[0][0] as (s: ScanState) => void
    onScanState({
      step: 'complete',
      results: [
        { dialogId: '1', status: 'not-member' },
        { dialogId: '2', status: 'banned' },
        { dialogId: '3', status: 'not-member' },
        { dialogId: '5', status: 'member' },
      ],
    })

    groupsActions.recomputeCheckedForMode('add')
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set(['1', '2']))
  })
})

// ---------------------------------------------------------------------------
// (d) recomputeCheckedForMode('remove') after an Add-mode selection re-selects Remove rows
// ---------------------------------------------------------------------------

describe('groupsStore — recomputeCheckedForMode mode switching (D-03)', () => {
  it('switching add → remove rebuilds the checked-set to the Remove rule, not the stale Add set', async () => {
    const { useGroupsStore, groupsActions, mockClient } = await loadFreshStore()
    useGroupsStore()

    const dialogs = [
      makeDialog({ id: '1', canAct: true, canAdd: false }), // member → Remove-actionable only
      makeDialog({ id: '2', canAct: false, canAdd: true }), // not-member → Add-actionable only
    ]
    const onGroupsState = mockClient.onGroupsState.mock.calls[0][0] as (s: GroupsState) => void
    onGroupsState({ step: 'loaded', dialogs })

    const onScanState = mockClient.onScanState.mock.calls[0][0] as (s: ScanState) => void
    onScanState({
      step: 'complete',
      results: [
        { dialogId: '1', status: 'member' },
        { dialogId: '2', status: 'not-member' },
      ],
    })

    groupsActions.recomputeCheckedForMode('add')
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set(['2']))

    groupsActions.recomputeCheckedForMode('remove')
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set(['1']))
  })
})

// ---------------------------------------------------------------------------
// (e) toggleGroup is unaffected by this change
// ---------------------------------------------------------------------------

describe('groupsStore — toggleGroup (unaffected regression check)', () => {
  it('still adds/removes a single dialogId without touching the rest of the set', async () => {
    const { useGroupsStore, groupsActions, mockClient } = await loadFreshStore()
    useGroupsStore()

    const onGroupsState = mockClient.onGroupsState.mock.calls[0][0] as (s: GroupsState) => void
    onGroupsState({ step: 'loaded', dialogs: [makeDialog({ id: '1' })] })

    expect(useGroupsStore().checkedDialogIds).toEqual(new Set())
    groupsActions.toggleGroup('1')
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set(['1']))
    groupsActions.toggleGroup('1')
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set())
  })
})

// ---------------------------------------------------------------------------
// recomputeCheckedForMode — no-op guards
// ---------------------------------------------------------------------------

describe('groupsStore — recomputeCheckedForMode no-op guards', () => {
  it('is a no-op when groups.step !== "loaded"', async () => {
    const { useGroupsStore, groupsActions } = await loadFreshStore()
    useGroupsStore()

    expect(() => groupsActions.recomputeCheckedForMode('add')).not.toThrow()
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set())
  })

  it('is a no-op when scan.step is neither "scanning" nor "complete"', async () => {
    const { useGroupsStore, groupsActions, mockClient } = await loadFreshStore()
    useGroupsStore()

    const onGroupsState = mockClient.onGroupsState.mock.calls[0][0] as (s: GroupsState) => void
    onGroupsState({ step: 'loaded', dialogs: [makeDialog({ id: '1' })] })

    expect(() => groupsActions.recomputeCheckedForMode('add')).not.toThrow()
    expect(useGroupsStore().checkedDialogIds).toEqual(new Set())
  })
})

// ---------------------------------------------------------------------------
// (f) First scan-complete while Add mode is already active uses the Add rule (15-14, must_haves #5)
// ---------------------------------------------------------------------------

describe('groupsStore — first scan-complete rebuild while Add mode is already active (15-14)', () => {
  it('uses the Add partition rule, not a hardcoded Remove rule, when recomputeCheckedForMode("add") ran during scanning', async () => {
    const { useGroupsStore, groupsActions, mockClient } = await loadFreshStore()
    useGroupsStore()

    const dialogs = [
      makeDialog({ id: '1', canAct: true, canAdd: false }), // will resolve to 'member' — Remove-actionable only
      makeDialog({ id: '2', canAct: false, canAdd: true }), // will resolve to 'not-member' — Add-actionable only
    ]
    const onGroupsState = mockClient.onGroupsState.mock.calls[0][0] as (s: GroupsState) => void
    onGroupsState({ step: 'loaded', dialogs })

    const onScanState = mockClient.onScanState.mock.calls[0][0] as (s: ScanState) => void

    // Scan is still in progress; the user switches to Add mode, which records the active mode.
    onScanState({
      step: 'scanning',
      progress: { checked: 1, total: 2 },
      results: [{ dialogId: '1', status: 'member' }],
    })
    groupsActions.recomputeCheckedForMode('add')

    // First-ever 'complete' emission, with Add mode already active.
    onScanState({
      step: 'complete',
      results: [
        { dialogId: '1', status: 'member' },
        { dialogId: '2', status: 'not-member' },
      ],
    })

    expect(useGroupsStore().checkedDialogIds).toEqual(new Set(['2']))
  })
})
