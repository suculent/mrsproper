// UI mirror of SearchState fed by IPC subscriptions.
// Uses React useSyncExternalStore pattern with ref-counted subscription lifecycle.
// Mirrors src/renderer/store/groupsStore.ts — simpler: single SearchState, no checkedDialogIds,
// no _prevScanStep (no pre-check rebuild transition needed for search).

import { useSyncExternalStore } from 'react'
import type { SearchState } from '@shared/searchTypes'
import { searchClient } from '../ipc/searchClient'

type Listener = () => void

let currentState: SearchState = { step: 'idle' }
// Tracks the last query dispatched by startSearch — used by CandidateList empty state.
let lastQuery = ''

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

  // Bootstrap current state from main on first subscription.
  // WR-04: only apply if no push-state has arrived since we registered the listener
  // (push arrives first → bootstrap overwriting it would flicker state backwards).
  searchClient.getSearchState().then((s: SearchState) => {
    if (currentState.step === 'idle') {
      setState(s)
    }
  }).catch(console.error)
}

function stopSubscriptions(): void {
  if (refCount <= 0) return  // guard against underflow — prevents refCount going negative
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

// Returns the last query dispatched via startSearch — for empty state rendering in CandidateList.
export function getLastQuery(): string {
  return lastQuery
}

// Intent dispatchers — delegate to searchClient; update store from returned state
export const searchActions = {
  async startSearch(query: string): Promise<void> {
    lastQuery = query
    try {
      const s = await searchClient.startSearch(query)
      setState(s)
    } catch (err) {
      // Surface IPC/Zod errors as a terminal search error state instead of
      // eating them — renderer must see an error step, not silence.
      console.error('[searchStore] startSearch:', err)
      setState({ step: 'error', code: 'UNKNOWN' })
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
