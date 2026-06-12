// MrsProperApi augmentation for name-based target search (Phase 4.1, TGT-05).
// Mirrors src/renderer/ipc/groupsClient.ts — standard interface merging pattern.

import type { SearchState } from '@shared/searchTypes'
import type { TargetState } from '@shared/targetTypes'

// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface (standard interface merging across authClient / groupsClient).
declare global {
  interface MrsProperApi {
    startSearch(query: string): Promise<SearchState>
    abortSearch(): Promise<SearchState>
    getSearchState(): Promise<SearchState>
    onSearchState(cb: (s: SearchState) => void): () => void
    selectCandidate(userId: string): Promise<TargetState>
  }
}

export const searchClient = {
  startSearch(query: string): Promise<SearchState> {
    return window.mrsproper.startSearch(query)
  },

  abortSearch(): Promise<SearchState> {
    return window.mrsproper.abortSearch()
  },

  getSearchState(): Promise<SearchState> {
    return window.mrsproper.getSearchState()
  },

  onSearchState(cb: (s: SearchState) => void): () => void {
    return window.mrsproper.onSearchState(cb)
  },

  selectCandidate(userId: string): Promise<TargetState> {
    return window.mrsproper.selectCandidate(userId)
  },
}
