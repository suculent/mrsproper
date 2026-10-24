// UI mirror of AddState fed by IPC subscriptions.
// Uses React useSyncExternalStore pattern with ref-counted subscription lifecycle.
// Mirrors src/renderer/store/tagStore.ts's module shape, plus retryGroup borrowed from
// src/renderer/store/removalStore.ts (lines 131-137) — Add needs per-group retry (ADD-13/D-17),
// unlike Tag. AddState carries no extra classification field beyond step/outcomes
// (unlike RemovalState's ban/kick field), so no such field is mirrored here either.
// cachedSnapshot guard below is MANDATORY — prevents "Maximum update depth exceeded"
// React re-render loop (Pitfall 2, documented in tagStore.ts and 15-RESEARCH.md).
//
// Divergence from tagStore/removalStore (T-15-07): addActions.startAdd(dialogIds) takes a
// SINGLE argument — no second classification-like parameter, and no argument-order flip.
// addClient.startAdd(dialogIds) and addActions.startAdd(dialogIds) are identical in shape.

import { useSyncExternalStore } from 'react'
import type { AddState, AddJobFileSafe } from '@shared/addTypes'
import { addClient } from '../ipc/addClient'
import { isJobFinished } from '@shared/addResume'

type Listener = () => void

let currentState: AddState = {
  step: 'idle',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}
let pendingJob: AddJobFileSafe | null = null

const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

function setState(next: AddState): void {
  currentState = next
  notify()
}

// Subscriptions are started once when the first component subscribes.
// The unsubscribe function is stored so it can be called on cleanup.
let addStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  addStateSub = addClient.onAddState((s: AddState) => {
    setState(s)
  })

  // Bootstrap current state from main on first subscription.
  // Only apply if no push-state has arrived since we registered the listener
  // (push arrives first → bootstrap overwriting it would flicker state backwards).
  addClient.getAddState().then((s: AddState) => {
    if (currentState.step === 'idle') {
      setState(s)
    }
  }).catch(console.error)

  // Bootstrap pending job on first subscription — detect incomplete jobs on launch
  // so the app can present the AddResumeJobDialog.
  addClient.getAddJob().then((job: AddJobFileSafe | null) => {
    if (job !== null && job.status !== 'complete' && !isJobFinished(job)) {
      pendingJob = job
      notify()
    }
  }).catch(console.error)
}

function stopSubscriptions(): void {
  if (refCount <= 0) return  // guard against underflow
  refCount--
  if (refCount > 0) return
  addStateSub?.()
  addStateSub = null
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
let cachedSnapshot: { state: AddState; pendingJob: AddJobFileSafe | null } = {
  state: currentState,
  pendingJob,
}

function getSnapshot(): { state: AddState; pendingJob: AddJobFileSafe | null } {
  if (cachedSnapshot.state !== currentState || cachedSnapshot.pendingJob !== pendingJob) {
    cachedSnapshot = { state: currentState, pendingJob }
  }
  return cachedSnapshot
}

function getServerSnapshot(): { state: AddState; pendingJob: AddJobFileSafe | null } {
  return getSnapshot()
}

// Hook for components to access add state and any pending incomplete job
export function useAddStore(): { state: AddState; pendingJob: AddJobFileSafe | null } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Intent dispatchers — delegate to addClient; update store from returned state.
// NOTE: addActions.startAdd(dialogIds) — single argument, no second classification-like
//       parameter and no argument-order flip (T-15-07) — unlike tagActions.startTag.
export const addActions = {
  /**
   * Returns true when a run actually started (returned state is not idle). An idle result
   * (e.g. main could not resolve the target yet) keeps pendingJob so the resume dialog stays.
   */
  async startAdd(dialogIds: string[]): Promise<boolean> {
    try {
      const s = await addClient.startAdd(dialogIds)
      setState(s)
      if (s.step === 'idle') return false
      // CR-05 analog: clear pendingJob once a run started so AddResumeJobDialog unmounts
      pendingJob = null
      notify()
      return true
    } catch (err) {
      console.error('[addStore] startAdd:', err)
      return false
    }
  },

  async abortAdd(): Promise<void> {
    try {
      const s = await addClient.abortAdd()
      setState(s)
    } catch (err) {
      console.error('[addStore] abortAdd:', err)
    }
  },

  /**
   * Retry a single failed group (ADD-13/D-17) — borrowed from removalStore.ts's
   * retryGroup shape. Tag has no equivalent (no per-group retry).
   */
  async retryGroup(dialogId: string): Promise<void> {
    try {
      await addClient.retryAddGroup(dialogId)
    } catch (err) {
      console.error('[addStore] retryGroup:', err)
    }
  },

  async discardJob(): Promise<void> {
    try {
      await addClient.discardAddJob()
      pendingJob = null
      notify()
    } catch (err) {
      console.error('[addStore] discardJob:', err)
    }
  },

  /**
   * D-07: explicit, main-owned resume of the on-disk job (ADD_RESUME, no payload). Main reads
   * the job, checks identity, and continues it with the job's FULL dialog-id set (D-01).
   * Returns true only when a run actually started; a main-side rejection returns the
   * unchanged executor state, which is a failure.
   */
  async resumeAdd(): Promise<boolean> {
    try {
      const stepBefore = currentState.step
      const s = await addClient.resumeAdd()
      setState(s)
      const started =
        s.step === 'running' || s.step === 'stopping' || (s.step !== 'idle' && s.step !== stepBefore)
      if (!started) return false
      // CR-05 analog: clear pendingJob once a run started so AddResumeJobDialog unmounts
      pendingJob = null
      notify()
      return true
    } catch (err) {
      console.error('[addStore] resumeAdd:', err)
      return false
    }
  },

  /**
   * Resume a stopped/hard-stopped job (stopped band, PEER_FLOOD banner). Re-reads the disk
   * job only to skip a finished/complete job; the resume itself goes through ADD_RESUME, so
   * main — not the renderer — decides which job and identity are continued (D-07).
   * Returns true only when the run actually started.
   */
  async resumeJobFromDisk(): Promise<boolean> {
    try {
      // D-11: always re-read the job (never the first-subscribe pendingJob) so a Resume after
      // a user Stop sees the latest outcomes.
      const freshJob = await addClient.getAddJob()
      if (!freshJob || freshJob.status === 'complete') return false
      if (isJobFinished(freshJob)) return false
      return await addActions.resumeAdd()
    } catch (err) {
      console.error('[addStore] resumeJobFromDisk:', err)
      return false
    }
  },
}
