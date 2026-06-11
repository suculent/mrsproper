// UI mirror of GroupsState + ScanState fed by IPC subscriptions.
// Uses React useSyncExternalStore pattern with ref-counted subscription lifecycle.
// Mirrors src/renderer/store/targetStore.ts exactly — standard external store pattern.
// Pre-checks all actionable member groups when scan completes (D-02, D-06).

import { useSyncExternalStore } from 'react'
import type { GroupsState, ScanState } from '@shared/groupTypes'
import { groupsClient } from '../ipc/groupsClient'

interface GroupsStoreState {
  groups: GroupsState
  scan: ScanState
  // Checked-set for removal: Set of dialogIds the user wants to remove from.
  // Initialized to all actionable member groups when scan completes (pre-checked, D-02, D-06).
  checkedDialogIds: Set<string>
}

type Listener = () => void

let currentState: GroupsStoreState = {
  groups: { step: 'idle' },
  scan: { step: 'idle' },
  checkedDialogIds: new Set(),
}

const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

function setState(next: Partial<GroupsStoreState>): void {
  currentState = { ...currentState, ...next }
  notify()
}

// Subscriptions are started once when the first component subscribes.
// The unsubscribe functions are stored so they can be called on cleanup.
let groupsStateSub: (() => void) | null = null
let scanStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  groupsStateSub = groupsClient.onGroupsState((s: GroupsState) => {
    setState({ groups: s })
  })

  scanStateSub = groupsClient.onScanState((s: ScanState) => {
    // D-02, D-06: when scan completes, pre-check all verified-member actionable groups
    if (s.step === 'complete') {
      const groups = currentState.groups
      if (groups.step === 'loaded') {
        const checkedDialogIds = new Set(
          s.results
            .filter((r) => r.status === 'member')
            .map((r) => r.dialogId)
            .filter((id) => groups.dialogs.find((d) => d.id === id)?.canAct)
        )
        setState({ scan: s, checkedDialogIds })
        return
      }
    }
    setState({ scan: s })
  })

  // Bootstrap current state from main on first subscription
  void groupsClient.getGroupsState().then((s: GroupsState) => {
    setState({ groups: s })
  })
}

function stopSubscriptions(): void {
  refCount--
  if (refCount > 0) return
  groupsStateSub?.()
  scanStateSub?.()
  groupsStateSub = null
  scanStateSub = null
}

// External store subscription function (for useSyncExternalStore)
function subscribe(listener: Listener): () => void {
  if (listeners.size === 0) startSubscriptions()
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopSubscriptions()
  }
}

function getSnapshot(): GroupsStoreState {
  return currentState
}

function getServerSnapshot(): GroupsStoreState {
  return currentState
}

// Hook for components to access groups + scan state
export function useGroupsStore(): GroupsStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Intent dispatchers — delegate to groupsClient; update store from returned state
export const groupsActions = {
  async startScan(): Promise<void> {
    try {
      const s = await groupsClient.startScan()
      setState({ scan: s })
    } catch (err) {
      console.error('[groupsStore] startScan error:', err)
    }
  },

  async abortScan(): Promise<void> {
    try {
      await groupsClient.abortScan()
    } catch (err) {
      console.error('[groupsStore] abortScan error:', err)
    }
  },

  async retryScanGroup(dialogId: string): Promise<void> {
    try {
      await groupsClient.retryScanGroup(dialogId)
    } catch (err) {
      console.error('[groupsStore] retryScanGroup error:', err)
    }
  },

  async refreshGroups(): Promise<void> {
    try {
      const s = await groupsClient.refreshGroups()
      setState({ groups: s })
    } catch (err) {
      console.error('[groupsStore] refreshGroups error:', err)
    }
  },

  // D-03: local toggle — no IPC call; purely renderer-side checked-set mutation
  toggleGroup(dialogId: string): void {
    const next = new Set(currentState.checkedDialogIds)
    if (next.has(dialogId)) next.delete(dialogId)
    else next.add(dialogId)
    setState({ checkedDialogIds: next })
  },
}
