// UI mirror of RemovalState fed by IPC subscriptions.
// Uses React useSyncExternalStore pattern with ref-counted subscription lifecycle.
// Mirrors src/renderer/store/searchStore.ts — same pattern extended with pendingJob for
// incomplete job detection on launch (on-launch Resume/Discard dialog flow).

import { useSyncExternalStore } from 'react'
import type { RemovalState, RemovalJobFile } from '@shared/removalTypes'
import { removalClient } from '../ipc/removalClient'

type Listener = () => void

let currentState: RemovalState = {
  step: 'idle',
  severity: 'ban',
  targetId: '',
  targetName: '',
  progress: { processed: 0, total: 0 },
  outcomes: [],
}
let pendingJob: RemovalJobFile | null = null

const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

function setState(next: RemovalState): void {
  currentState = next
  notify()
}

// Subscriptions are started once when the first component subscribes.
// The unsubscribe function is stored so it can be called on cleanup.
let removalStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  removalStateSub = removalClient.onRemovalState((s: RemovalState) => {
    setState(s)
  })

  // Bootstrap current state from main on first subscription.
  // WR-04: only apply if no push-state has arrived since we registered the listener
  // (push arrives first → bootstrap overwriting it would flicker state backwards).
  removalClient.getRemovalState().then((s: RemovalState) => {
    if (currentState.step === 'idle') {
      setState(s)
    }
  }).catch(console.error)

  // Bootstrap pending job on first subscription — detect incomplete jobs on launch
  // so the app can present the Resume/Discard dialog.
  removalClient.getRemovalJob().then((job: RemovalJobFile | null) => {
    if (job !== null && job.status !== 'complete') {
      pendingJob = job
      notify()
    }
  }).catch(console.error)
}

function stopSubscriptions(): void {
  if (refCount <= 0) return  // guard against underflow — prevents refCount going negative
  refCount--
  if (refCount > 0) return
  removalStateSub?.()
  removalStateSub = null
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

function getSnapshot(): { state: RemovalState; pendingJob: RemovalJobFile | null } {
  return { state: currentState, pendingJob }
}

function getServerSnapshot(): { state: RemovalState; pendingJob: RemovalJobFile | null } {
  return { state: currentState, pendingJob }
}

// Hook for components to access removal state and any pending incomplete job
export function useRemovalStore(): { state: RemovalState; pendingJob: RemovalJobFile | null } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Intent dispatchers — delegate to removalClient; update store from returned state
export const removalActions = {
  async startRemoval(severity: 'kick' | 'ban', dialogIds: string[]): Promise<void> {
    try {
      const s = await removalClient.startRemoval(severity, dialogIds)
      setState(s)
    } catch (err) {
      console.error('[removalStore] startRemoval:', err)
    }
  },

  async abortRemoval(): Promise<void> {
    try {
      const s = await removalClient.abortRemoval()
      setState(s)
    } catch (err) {
      console.error('[removalStore] abortRemoval:', err)
    }
  },

  async retryGroup(dialogId: string): Promise<void> {
    try {
      await removalClient.retryRemovalGroup(dialogId)
    } catch (err) {
      console.error('[removalStore] retryGroup:', err)
    }
  },

  async discardJob(): Promise<void> {
    try {
      await removalClient.discardRemovalJob()
      pendingJob = null
      notify()
    } catch (err) {
      console.error('[removalStore] discardJob:', err)
    }
  },
}
