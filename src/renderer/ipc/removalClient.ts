// MrsProperApi augmentation for the removal execution engine (Phase 5, RMV-01/RMV-02/EXE-04/EXE-05).
// Mirrors src/renderer/ipc/searchClient.ts — standard interface merging pattern.

import type { RemovalState, RemovalJobFile } from '@shared/removalTypes'

// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface (standard interface merging across authClient / groupsClient / searchClient).
declare global {
  interface MrsProperApi {
    startRemoval(severity: 'kick' | 'ban', dialogIds: string[]): Promise<RemovalState>
    abortRemoval(): Promise<RemovalState>
    retryRemovalGroup(dialogId: string): Promise<void>
    getRemovalState(): Promise<RemovalState>
    onRemovalState(cb: (s: RemovalState) => void): () => void
    getRemovalJob(): Promise<RemovalJobFile | null>
    discardRemovalJob(): Promise<null>
  }
}

export const removalClient = {
  startRemoval(severity: 'kick' | 'ban', dialogIds: string[]): Promise<RemovalState> {
    return window.mrsproper.startRemoval(severity, dialogIds)
  },

  abortRemoval(): Promise<RemovalState> {
    return window.mrsproper.abortRemoval()
  },

  retryRemovalGroup(dialogId: string): Promise<void> {
    return window.mrsproper.retryRemovalGroup(dialogId)
  },

  getRemovalState(): Promise<RemovalState> {
    return window.mrsproper.getRemovalState()
  },

  onRemovalState(cb: (s: RemovalState) => void): () => void {
    return window.mrsproper.onRemovalState(cb)
  },

  getRemovalJob(): Promise<RemovalJobFile | null> {
    return window.mrsproper.getRemovalJob()
  },

  discardRemovalJob(): Promise<null> {
    return window.mrsproper.discardRemovalJob()
  },
}
