// MrsProperApi augmentation for the tag execution engine (Phase 10, TAG-03/TAG-05).
// Mirrors src/renderer/ipc/removalClient.ts — standard interface merging pattern.
// No retryTag / retryTagGroup — tag scope excludes per-group retry in Phase 10/11.

import type { TagState, TagJobFileSafe } from '@shared/tagTypes'

// Type declaration for the contextBridge surface — additive augmentation of the
// MrsProperApi interface (standard interface merging across authClient / groupsClient /
// searchClient / removalClient). startTag carries only { dialogIds, tag }; identity is
// read from main process resolver inside TagExecutor.execute() (T-05-04-B).
// getTagJob returns TagJobFileSafe (targetAccessHash stripped in tagChannels.ts — T-10-01).
declare global {
  interface MrsProperApi {
    startTag(dialogIds: string[], tag: string): Promise<TagState>
    abortTag(): Promise<TagState>
    getTagState(): Promise<TagState>
    onTagState(cb: (s: TagState) => void): () => void
    getTagJob(): Promise<TagJobFileSafe | null>
    discardTagJob(): Promise<null>
  }
}

export const tagClient = {
  startTag(dialogIds: string[], tag: string): Promise<TagState> {
    return window.mrsproper.startTag(dialogIds, tag)
  },

  abortTag(): Promise<TagState> {
    return window.mrsproper.abortTag()
  },

  getTagState(): Promise<TagState> {
    return window.mrsproper.getTagState()
  },

  onTagState(cb: (s: TagState) => void): () => void {
    return window.mrsproper.onTagState(cb)
  },

  getTagJob(): Promise<TagJobFileSafe | null> {
    return window.mrsproper.getTagJob()
  },

  discardTagJob(): Promise<null> {
    return window.mrsproper.discardTagJob()
  },
}
