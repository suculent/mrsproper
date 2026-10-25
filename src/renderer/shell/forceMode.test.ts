// forceMode syncs groupsStore active mode before flipping AppShell mode (audit W2, ADD-02).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AdminDialogDTO, GroupsState, ScanState } from '@shared/groupTypes'

vi.mock('react', () => ({
  useSyncExternalStore: (subscribe: (cb: () => void) => () => void, getSnapshot: () => unknown) => {
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

function makeDialog(overrides: Partial<AdminDialogDTO>): AdminDialogDTO {
  return {
    id: '100', title: 'Test Group', avatar: null, memberCount: 10, type: 'supergroup',
    canAct: true, greyReason: null, canAdd: true, addGreyReason: null, canUnban: true,
    ...overrides,
  }
}

async function load() {
  vi.resetModules()
  const client = (await import('../ipc/groupsClient')).groupsClient as unknown as {
    onGroupsState: ReturnType<typeof vi.fn>
    onScanState: ReturnType<typeof vi.fn>
  }
  const store = await import('./../store/groupsStore')
  const { forceMode } = await import('./forceMode')
  return { store, client, forceMode }
}

beforeEach(() => vi.clearAllMocks())

describe('forceMode', () => {
  it('calls recomputeCheckedForMode before setMode', async () => {
    const { store, forceMode } = await load()
    const order: string[] = []
    vi.spyOn(store.groupsActions, 'recomputeCheckedForMode').mockImplementation(() => {
      order.push('recompute')
    })
    forceMode('add', () => order.push('setMode'))
    expect(order).toEqual(['recompute', 'setMode'])
  })

  it('first scan-complete after forceMode("add") uses the Add rule', async () => {
    const { store, client, forceMode } = await load()
    store.useGroupsStore()
    const dialogs = [
      makeDialog({ id: '1', canAct: true, canAdd: false }),
      makeDialog({ id: '2', canAct: false, canAdd: true }),
    ]
    ;(client.onGroupsState.mock.calls[0][0] as (s: GroupsState) => void)({ step: 'loaded', dialogs })
    const onScan = client.onScanState.mock.calls[0][0] as (s: ScanState) => void
    onScan({ step: 'scanning', progress: { checked: 1, total: 2 }, results: [{ dialogId: '1', status: 'member' }] })
    forceMode('add', vi.fn())
    onScan({
      step: 'complete',
      results: [
        { dialogId: '1', status: 'member' },
        { dialogId: '2', status: 'not-member' },
      ],
    })
    const checked = store.useGroupsStore().checkedDialogIds
    expect(checked).toEqual(new Set(['2']))
    expect(checked).not.toEqual(new Set(['1']))
  })
})
