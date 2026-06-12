/**
 * Renderer-side IPC client for theme preference (Phase 8, LOC-01).
 * Mirrors src/renderer/ipc/severityClient.ts — standard interface merging pattern.
 */

// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface (standard interface merging across authClient / groupsClient /
// searchClient / removalClient / severityClient / languageClient).
declare global {
  interface MrsProperApi {
    getTheme(): Promise<'light' | 'dark' | null>
    setTheme(theme: 'light' | 'dark'): Promise<'light' | 'dark'>
  }
}

export const themeClient = {
  getTheme(): Promise<'light' | 'dark' | null> {
    return window.mrsproper.getTheme()
  },

  setTheme(theme: 'light' | 'dark'): Promise<'light' | 'dark'> {
    return window.mrsproper.setTheme(theme)
  },
}
