// UI mirror of TagState fed by IPC subscriptions.
// Uses React useSyncExternalStore pattern with ref-counted subscription lifecycle.
// Mirrors src/renderer/store/removalStore.ts — same pattern with TagState/TagJobFileSafe
// and the absence of retryGroup (tag has no per-group retry).
// cachedSnapshot guard at lines 87–97 of removalStore is MANDATORY — prevents
// "Maximum update depth exceeded" React re-render loop (Pitfall 2).

import { useSyncExternalStore } from 'react'
import type { TagState, TagJobFileSafe } from '@shared/tagTypes'
import { tagClient } from '../ipc/tagClient'

type Listener = () => void

let currentState: TagState = {
  step: 'idle',
  tag: '',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}
let pendingJob: TagJobFileSafe | null = null

const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

function setState(next: TagState): void {
  currentState = next
  notify()
}

// Subscriptions are started once when the first component subscribes.
// The unsubscribe function is stored so it can be called on cleanup.
let tagStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  tagStateSub = tagClient.onTagState((s: TagState) => {
    setState(s)
  })

  // Bootstrap current state from main on first subscription.
  // Only apply if no push-state has arrived since we registered the listener
  // (push arrives first → bootstrap overwriting it would flicker state backwards).
  tagClient.getTagState().then((s: TagState) => {
    if (currentState.step === 'idle') {
      setState(s)
    }
  }).catch(console.error)

  // Bootstrap pending job on first subscription — detect incomplete jobs on launch
  // so the app can present the TagResumeJobDialog.
  tagClient.getTagJob().then((job: TagJobFileSafe | null) => {
    if (job !== null && job.status !== 'complete') {
      pendingJob = job
      notify()
    }
  }).catch(console.error)
}

function stopSubscriptions(): void {
  if (refCount <= 0) return  // guard against underflow
  refCount--
  if (refCount > 0) return
  tagStateSub?.()
  tagStateSub = null
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

// Snapshot identity must be stable between store changes — useSyncExternalStore
// compares snapshots with Object.is, and a fresh object every call makes React
// see an ever-changing store ("Maximum update depth exceeded" → tree unmount).
// CRITICAL: This cachedSnapshot guard is mandatory (Pitfall 2).
let cachedSnapshot: { state: TagState; pendingJob: TagJobFileSafe | null } = {
  state: currentState,
  pendingJob,
}

function getSnapshot(): { state: TagState; pendingJob: TagJobFileSafe | null } {
  if (cachedSnapshot.state !== currentState || cachedSnapshot.pendingJob !== pendingJob) {
    cachedSnapshot = { state: currentState, pendingJob }
  }
  return cachedSnapshot
}

function getServerSnapshot(): { state: TagState; pendingJob: TagJobFileSafe | null } {
  return getSnapshot()
}

// Hook for components to access tag state and any pending incomplete job
export function useTagStore(): { state: TagState; pendingJob: TagJobFileSafe | null } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Intent dispatchers — delegate to tagClient; update store from returned state.
// NOTE: tagActions.startTag(tag, dialogIds) — public API: tag first, dialogIds second.
//       tagClient.startTag(dialogIds, tag)  — IPC layer: dialogIds first, tag second.
//       The argument flip is intentional and tested (T-12-04 / Pitfall 6).
export const tagActions = {
  async startTag(tag: string, dialogIds: string[]): Promise<void> {
    try {
      // Pitfall 6: tagClient.startTag takes (dialogIds, tag) — note the flip from public API
      const s = await tagClient.startTag(dialogIds, tag)
      setState(s)
      // CR-05 analog: clear pendingJob on successful dispatch so TagResumeJobDialog unmounts
      pendingJob = null
      notify()
    } catch (err) {
      console.error('[tagStore] startTag:', err)
    }
  },

  async abortTag(): Promise<void> {
    try {
      const s = await tagClient.abortTag()
      setState(s)
    } catch (err) {
      console.error('[tagStore] abortTag:', err)
    }
  },

  async discardJob(): Promise<void> {
    try {
      await tagClient.discardTagJob()
      pendingJob = null
      notify()
    } catch (err) {
      console.error('[tagStore] discardJob:', err)
    }
  },

  /**
   * Resume a PEER_FLOOD-stopped job by re-reading the disk job file for
   * authoritative remaining groups (mirrors removalStore.resumeJobFromDisk).
   * No retryGroup — tag has no per-group retry.
   */
  async resumeJobFromDisk(): Promise<void> {
    try {
      const freshJob = await tagClient.getTagJob()
      if (!freshJob || freshJob.status === 'complete') return
      const remaining = freshJob.dialogIds.filter(
        (id) => !freshJob.outcomes.find((o) => o.dialogId === id)
      )
      if (remaining.length === 0) return
      await tagActions.startTag(freshJob.tag, remaining)
    } catch (err) {
      console.error('[tagStore] resumeJobFromDisk:', err)
    }
  },
  // NOTE: No retryGroup — tagClient has no retryTagGroup (tag has no per-group retry).
}
