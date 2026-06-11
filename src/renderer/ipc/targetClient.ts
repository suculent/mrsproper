// Typed thin wrapper over window.mrsproper (the contextBridge surface) for target resolution.
// The renderer NEVER imports ipcRenderer directly — all Telegram I/O goes through this client.
// No GramJS, no session string, no accessHash. Trust boundary is enforced here by design.

import type { TargetState } from '@shared/targetTypes'
import type { GovernorEvent } from '@shared/opTypes'

// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface declared in authClient.ts global block (standard interface merging).
declare global {
  interface MrsProperApi {
    resolveTarget(input: string): Promise<TargetState>
    confirmTarget(): Promise<TargetState>
    resetTarget(): Promise<TargetState>
    getTargetState(): Promise<TargetState>
    onTargetState(cb: (s: TargetState) => void): () => void
    onGovernorEvent(cb: (e: GovernorEvent) => void): () => void
  }
}

export const targetClient = {
  resolveTarget(input: string): Promise<TargetState> {
    return window.mrsproper.resolveTarget(input)
  },

  confirmTarget(): Promise<TargetState> {
    return window.mrsproper.confirmTarget()
  },

  resetTarget(): Promise<TargetState> {
    return window.mrsproper.resetTarget()
  },

  getTargetState(): Promise<TargetState> {
    return window.mrsproper.getTargetState()
  },

  onTargetState(cb: (s: TargetState) => void): () => void {
    return window.mrsproper.onTargetState(cb)
  },

  onGovernorEvent(cb: (e: GovernorEvent) => void): () => void {
    return window.mrsproper.onGovernorEvent(cb)
  },
}
