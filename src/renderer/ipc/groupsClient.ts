// MrsProperApi augmentation for group enumeration and scan channels.
// Mirrors src/renderer/ipc/targetClient.ts — standard interface merging pattern.

import type { GroupsState, ScanState } from '@shared/groupTypes'

// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface (standard interface merging across authClient / targetClient).
declare global {
  interface MrsProperApi {
    getGroupsState(): Promise<GroupsState>
    refreshGroups(): Promise<GroupsState>
    onGroupsState(cb: (s: GroupsState) => void): () => void
    startScan(): Promise<ScanState>
    abortScan(): Promise<void>
    retryScanGroup(dialogId: string): Promise<void>
    getScanState(): Promise<ScanState>
    onScanState(cb: (s: ScanState) => void): () => void
  }
}

export const groupsClient = {
  getGroupsState(): Promise<GroupsState> {
    return window.mrsproper.getGroupsState()
  },

  refreshGroups(): Promise<GroupsState> {
    return window.mrsproper.refreshGroups()
  },

  onGroupsState(cb: (s: GroupsState) => void): () => void {
    return window.mrsproper.onGroupsState(cb)
  },

  startScan(): Promise<ScanState> {
    return window.mrsproper.startScan()
  },

  abortScan(): Promise<void> {
    return window.mrsproper.abortScan()
  },

  retryScanGroup(dialogId: string): Promise<void> {
    return window.mrsproper.retryScanGroup(dialogId)
  },

  getScanState(): Promise<ScanState> {
    return window.mrsproper.getScanState()
  },

  onScanState(cb: (s: ScanState) => void): () => void {
    return window.mrsproper.onScanState(cb)
  },
}
