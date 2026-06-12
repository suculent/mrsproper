/**
 * Renderer-side IPC client for language preference (Phase 8, LOC-01).
 * Mirrors src/renderer/ipc/severityClient.ts — standard interface merging pattern.
 */

// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface (standard interface merging across authClient / groupsClient /
// searchClient / removalClient / severityClient).
declare global {
  interface MrsProperApi {
    getLanguage(): Promise<'en' | 'cs' | null>
    setLanguage(language: 'en' | 'cs'): Promise<'en' | 'cs'>
  }
}

export const languageClient = {
  getLanguage(): Promise<'en' | 'cs' | null> {
    return window.mrsproper.getLanguage()
  },

  setLanguage(language: 'en' | 'cs'): Promise<'en' | 'cs'> {
    return window.mrsproper.setLanguage(language)
  },
}
