// UI TargetState mirror fed by onTargetState/onGovernorEvent subscriptions.
// Uses React hooks (useSyncExternalStore pattern) with a simple external store.
// Subscribes on first use and provides current target state + flood countdown to components.
// governorFloodRemaining powers the Find button countdown (D-17, OP_GOVERNOR_EVENT channel).

import { useSyncExternalStore } from 'react'
import type { TargetState } from '@shared/targetTypes'
import { targetClient } from '@renderer/ipc/targetClient'

interface TargetStoreState {
  target: TargetState
  governorFloodRemaining: number // D-17: feeds the Find button countdown
  addToContactsChecked: boolean // D-08: session-only, pre-checked by default
  contactAddAttempted: boolean // D-09: enforces at-most-once dispatch per target
  contactAddFailed: boolean // D-10: drives the quiet inline failure notice
}

type Listener = () => void

let currentState: TargetStoreState = {
  target: { step: 'idle' },
  governorFloodRemaining: 0,
  addToContactsChecked: true,
  contactAddAttempted: false,
  contactAddFailed: false,
}

const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

function setState(next: Partial<TargetStoreState>): void {
  currentState = { ...currentState, ...next }
  notify()
}

// Subscriptions are started once when the first component subscribes.
// The unsubscribe functions are stored so they can be called on cleanup.
let targetStateSub: (() => void) | null = null
let governorEventSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  // Subscribe to target state changes pushed from main via TARGET_STATE channel
  targetStateSub = targetClient.onTargetState((s: TargetState) => {
    setState({ target: s })
  })

  // D-17: subscribe to governor flood-tick events via OP_GOVERNOR_EVENT channel.
  // This powers the Find button countdown in the renderer.
  governorEventSub = targetClient.onGovernorEvent((e) => {
    if (e.type === 'flood-tick') {
      setState({ governorFloodRemaining: e.remaining })
    }
  })

  // Bootstrap current state from main on first subscription
  void targetClient.getTargetState().then((s: TargetState) => {
    setState({ target: s })
  })
}

function stopSubscriptions(): void {
  refCount--
  if (refCount > 0) return
  targetStateSub?.()
  governorEventSub?.()
  targetStateSub = null
  governorEventSub = null
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

function getSnapshot(): TargetStoreState {
  return currentState
}

function getServerSnapshot(): TargetStoreState {
  return currentState
}

// Hook for components to access target state
export function useTargetStore(): TargetStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Intent dispatchers — delegate to targetClient, update store from returned state
export const targetActions = {
  async resolveTarget(input: string): Promise<void> {
    try {
      const s = await targetClient.resolveTarget(input)
      setState({ target: s })
    } catch (err) {
      // Network errors not classified by main — fall through; main will push state via onTargetState
      console.error('[targetStore] resolveTarget error:', err)
    }
  },

  async confirmTarget(): Promise<void> {
    try {
      const s = await targetClient.confirmTarget()
      setState({ target: s })
    } catch (err) {
      console.error('[targetStore] confirmTarget error:', err)
    }
  },

  async resetTarget(): Promise<void> {
    try {
      await targetClient.resetTarget()
      setState({
        target: { step: 'idle' },
        governorFloodRemaining: 0,
        addToContactsChecked: true,
        contactAddAttempted: false,
        contactAddFailed: false,
      })
    } catch (err) {
      console.error('[targetStore] resetTarget error:', err)
    }
  },

  // D-08: session-only checkbox toggle — never touches contactAddAttempted/contactAddFailed.
  toggleAddToContacts(checked: boolean): void {
    setState({ addToContactsChecked: checked })
  },

  // D-09/D-10: idempotent, non-blocking contact-add dispatch. Callable from either trigger
  // point (confirm-time or run-confirm-time) — at most one underlying bridge call per target.
  async maybeAddToContacts(): Promise<void> {
    if (!currentState.addToContactsChecked || currentState.contactAddAttempted) return
    // Set the flag BEFORE awaiting so a second concurrent call sees it already set.
    setState({ contactAddAttempted: true })
    try {
      const result = await targetClient.addTargetToContacts().catch(() => ({ ok: false }))
      setState({ contactAddFailed: !result.ok })
    } catch (err) {
      console.error('[targetStore] maybeAddToContacts error:', err)
      setState({ contactAddFailed: true })
    }
  },
}
