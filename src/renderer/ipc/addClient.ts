// MrsProperApi augmentation for the add execution engine (Phase 14 engine, Phase 15 renderer).
// Mirrors src/renderer/ipc/tagClient.ts — standard interface merging pattern.
// retryAddGroup is included (unlike tag) — Add supports per-group retry (ADD-13/D-17).

import type { AddState, AddJobFileSafe } from '@shared/addTypes'

// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface (standard interface merging across authClient / groupsClient /
// searchClient / removalClient / tagClient). startAdd carries ONLY dialogIds — no identity,
// access hash, or resume flag is ever constructed or threaded through this bridge
// (T-14-16/T-14-20/T-15-07). getAddJob returns AddJobFileSafe (targetAccessHash stripped).
// exportAddLog's preload method and return shape are already defined by Plan 15-06.
declare global {
  interface MrsProperApi {
    startAdd(dialogIds: string[]): Promise<AddState>
    abortAdd(): Promise<AddState>
    retryAddGroup(dialogId: string): Promise<void>
    getAddState(): Promise<AddState>
    onAddState(cb: (s: AddState) => void): () => void
    getAddJob(): Promise<AddJobFileSafe | null>
    discardAddJob(): Promise<null>
    exportAddLog(): Promise<{ ok: boolean; reason?: 'no-log' | 'canceled' }>
  }
}

export const addClient = {
  startAdd(dialogIds: string[]): Promise<AddState> {
    return window.mrsproper.startAdd(dialogIds)
  },

  abortAdd(): Promise<AddState> {
    return window.mrsproper.abortAdd()
  },

  retryAddGroup(dialogId: string): Promise<void> {
    return window.mrsproper.retryAddGroup(dialogId)
  },

  getAddState(): Promise<AddState> {
    return window.mrsproper.getAddState()
  },

  onAddState(cb: (s: AddState) => void): () => void {
    return window.mrsproper.onAddState(cb)
  },

  getAddJob(): Promise<AddJobFileSafe | null> {
    return window.mrsproper.getAddJob()
  },

  discardAddJob(): Promise<null> {
    return window.mrsproper.discardAddJob()
  },

  exportAddLog(): Promise<{ ok: boolean; reason?: 'no-log' | 'canceled' }> {
    return window.mrsproper.exportAddLog()
  },
}
