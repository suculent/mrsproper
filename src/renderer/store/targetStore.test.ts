// Tests for targetStore's Add-to-contacts dispatch logic (D-08/D-09/D-10).
// Mirrors src/renderer/store/groupsStore.test.ts's mocking idiom: mock 'react' so
// useSyncExternalStore becomes a plain synchronous call (environment: node has no
// jsdom/RTL), mock the client module, and vi.resetModules() + dynamic re-import per
// test to isolate the module-level singleton (currentState, listeners).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('react', () => ({
  useSyncExternalStore: (
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => unknown
  ) => {
    subscribe(() => {})
    return getSnapshot()
  },
}))

vi.mock('@renderer/ipc/targetClient', () => ({
  targetClient: {
    resolveTarget: vi.fn(),
    confirmTarget: vi.fn(),
    resetTarget: vi.fn(),
    getTargetState: vi.fn(() => new Promise(() => {})),
    onTargetState: vi.fn(() => vi.fn()),
    onGovernorEvent: vi.fn(() => vi.fn()),
    addTargetToContacts: vi.fn(),
  },
}))

interface MockTargetClient {
  resolveTarget: ReturnType<typeof vi.fn>
  confirmTarget: ReturnType<typeof vi.fn>
  resetTarget: ReturnType<typeof vi.fn>
  getTargetState: ReturnType<typeof vi.fn>
  onTargetState: ReturnType<typeof vi.fn>
  onGovernorEvent: ReturnType<typeof vi.fn>
  addTargetToContacts: ReturnType<typeof vi.fn>
}

async function loadFreshStore() {
  vi.resetModules()
  const clientModule = await import('@renderer/ipc/targetClient')
  const storeModule = await import('./targetStore')
  return {
    useTargetStore: storeModule.useTargetStore,
    targetActions: storeModule.targetActions,
    mockClient: clientModule.targetClient as unknown as MockTargetClient,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('targetStore — initial state (D-08)', () => {
  it('addToContactsChecked defaults true; contactAddAttempted/contactAddFailed default false', async () => {
    const { useTargetStore } = await loadFreshStore()
    const snapshot = useTargetStore()
    expect(snapshot.addToContactsChecked).toBe(true)
    expect(snapshot.contactAddAttempted).toBe(false)
    expect(snapshot.contactAddFailed).toBe(false)
  })
})

describe('targetActions.toggleAddToContacts (D-08)', () => {
  it('sets addToContactsChecked to false, leaving the other two fields untouched', async () => {
    const { useTargetStore, targetActions } = await loadFreshStore()
    useTargetStore()

    targetActions.toggleAddToContacts(false)
    const snapshot = useTargetStore()
    expect(snapshot.addToContactsChecked).toBe(false)
    expect(snapshot.contactAddAttempted).toBe(false)
    expect(snapshot.contactAddFailed).toBe(false)
  })

  it('sets addToContactsChecked back to true', async () => {
    const { useTargetStore, targetActions } = await loadFreshStore()
    useTargetStore()

    targetActions.toggleAddToContacts(false)
    targetActions.toggleAddToContacts(true)
    expect(useTargetStore().addToContactsChecked).toBe(true)
  })
})

describe('targetActions.maybeAddToContacts (D-09/D-10)', () => {
  it('does nothing when addToContactsChecked is false', async () => {
    const { useTargetStore, targetActions, mockClient } = await loadFreshStore()
    useTargetStore()
    targetActions.toggleAddToContacts(false)

    await targetActions.maybeAddToContacts()

    expect(mockClient.addTargetToContacts).not.toHaveBeenCalled()
    expect(useTargetStore().contactAddAttempted).toBe(false)
  })

  it('calls targetClient.addTargetToContacts exactly once and sets contactAddAttempted', async () => {
    const { useTargetStore, targetActions, mockClient } = await loadFreshStore()
    useTargetStore()
    mockClient.addTargetToContacts.mockResolvedValue({ ok: true })

    await targetActions.maybeAddToContacts()

    expect(mockClient.addTargetToContacts).toHaveBeenCalledTimes(1)
    expect(useTargetStore().contactAddAttempted).toBe(true)
    expect(useTargetStore().contactAddFailed).toBe(false)
  })

  it('does NOT call addTargetToContacts again on a second call (at most once per target)', async () => {
    const { useTargetStore, targetActions, mockClient } = await loadFreshStore()
    useTargetStore()
    mockClient.addTargetToContacts.mockResolvedValue({ ok: true })

    await targetActions.maybeAddToContacts()
    await targetActions.maybeAddToContacts()

    expect(mockClient.addTargetToContacts).toHaveBeenCalledTimes(1)
  })

  it('sets contactAddFailed true when the bridge resolves { ok: false }, still sets contactAddAttempted, never throws', async () => {
    const { useTargetStore, targetActions, mockClient } = await loadFreshStore()
    useTargetStore()
    mockClient.addTargetToContacts.mockResolvedValue({ ok: false, code: 'SOME_CODE' })

    await expect(targetActions.maybeAddToContacts()).resolves.toBeUndefined()

    const snapshot = useTargetStore()
    expect(snapshot.contactAddAttempted).toBe(true)
    expect(snapshot.contactAddFailed).toBe(true)
  })

  it('sets contactAddFailed true when the bridge call rejects, never propagates the rejection', async () => {
    const { useTargetStore, targetActions, mockClient } = await loadFreshStore()
    useTargetStore()
    mockClient.addTargetToContacts.mockRejectedValue(new Error('network error'))

    await expect(targetActions.maybeAddToContacts()).resolves.toBeUndefined()

    const snapshot = useTargetStore()
    expect(snapshot.contactAddAttempted).toBe(true)
    expect(snapshot.contactAddFailed).toBe(true)
  })
})

describe('targetActions.resetTarget — clears the three Add-to-contacts fields', () => {
  it('resets addToContactsChecked to true, contactAddAttempted/contactAddFailed to false', async () => {
    const { useTargetStore, targetActions, mockClient } = await loadFreshStore()
    useTargetStore()
    mockClient.resetTarget.mockResolvedValue(undefined)
    mockClient.addTargetToContacts.mockResolvedValue({ ok: false })

    // Dirty all three fields away from their defaults first.
    targetActions.toggleAddToContacts(false)
    targetActions.toggleAddToContacts(true)
    await targetActions.maybeAddToContacts()
    expect(useTargetStore().contactAddAttempted).toBe(true)
    expect(useTargetStore().contactAddFailed).toBe(true)

    await targetActions.resetTarget()

    const snapshot = useTargetStore()
    expect(snapshot.addToContactsChecked).toBe(true)
    expect(snapshot.contactAddAttempted).toBe(false)
    expect(snapshot.contactAddFailed).toBe(false)
  })
})
