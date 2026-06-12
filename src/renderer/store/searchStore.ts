// UI mirror of SearchState fed by IPC subscriptions.
// Uses React useSyncExternalStore pattern with ref-counted subscription lifecycle.
// Mirrors src/renderer/store/groupsStore.ts — simpler: single SearchState, no checkedDialogIds,
// no _prevScanStep (no pre-check rebuild transition needed for search).

import { useSyncExternalStore } from 'react'
import type { SearchState } from '@shared/searchTypes'
import { searchClient } from '../ipc/searchClient'

type Listener = () => void

let currentState: SearchState = { step: 'idle' }

const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

function setState(next: SearchState): void {
  currentState = next
  notify()
}

// Subscriptions are started once when the first component subscribes.
// The unsubscribe function is stored so it can be called on cleanup.
let searchStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  searchStateSub = searchClient.onSearchState((s: SearchState) => {
    setState(s)
  })

  // Bootstrap current state from main on first subscription
  searchClient.getSearchState().then((s: SearchState) => {
    setState(s)
  }).catch(console.error)
}

function stopSubscriptions(): void {
  refCount--
  if (refCount > 0) return
  searchStateSub?.()
  searchStateSub = null
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

function getSnapshot(): SearchState {
  return currentState
}

function getServerSnapshot(): SearchState {
  return currentState
}

// Hook for components to access search state
export function useSearchStore(): SearchState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Intent dispatchers — delegate to searchClient; update store from returned state
export const searchActions = {
  async startSearch(query: string): Promise<void> {
    try {
      const s = await searchClient.startSearch(query)
      setState(s)
    } catch (err) {
      console.error('[searchStore] startSearch:', err)
    }
  },

  async abortSearch(): Promise<void> {
    try {
      const s = await searchClient.abortSearch()
      setState(s)
    } catch (err) {
      console.error('[searchStore] abortSearch:', err)
    }
  },

  async selectCandidate(userId: string): Promise<void> {
    try {
      await searchClient.selectCandidate(userId)
    } catch (err) {
      console.error('[searchStore] selectCandidate:', err)
    }
  },
}
