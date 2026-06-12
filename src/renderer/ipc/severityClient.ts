/**
 * MrsProperApi augmentation for severity preference persistence (Phase 6, SAF-01/02/03).
 * Mirrors src/renderer/ipc/removalClient.ts — standard interface merging pattern.
 */

// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface (standard interface merging across authClient / groupsClient /
// searchClient / removalClient).
declare global {
  interface MrsProperApi {
    getSeverity(): Promise<'kick' | 'ban'>
    setSeverity(severity: 'kick' | 'ban'): Promise<'kick' | 'ban'>
  }
}

export const severityClient = {
  getSeverity(): Promise<'kick' | 'ban'> {
    return window.mrsproper.getSeverity()
  },

  setSeverity(severity: 'kick' | 'ban'): Promise<'kick' | 'ban'> {
    return window.mrsproper.setSeverity(severity)
  },
}
