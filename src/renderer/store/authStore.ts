// UI AuthState mirror fed by onAuthState/onFloodTick subscriptions.
// Uses React hooks (useSyncExternalStore pattern) with a simple external store.
// Subscribes on first use and provides current auth state + flood remaining to components.

import { useSyncExternalStore } from 'react'
import type { AuthState, LogoutResult } from '@shared/authTypes'
import { authClient } from '@renderer/ipc/authClient'

interface AuthStoreState {
  auth: AuthState
  floodRemaining: number
}

type Listener = () => void

let currentState: AuthStoreState = {
  auth: { step: 'idle' },
  floodRemaining: 0,
}

const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

function setState(next: Partial<AuthStoreState>): void {
  currentState = { ...currentState, ...next }
  notify()
}

// Subscriptions are started once when the first component subscribes.
// The unsubscribe functions are stored so they can be called on cleanup.
let authUnsub: (() => void) | null = null
let floodUnsub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  authUnsub = authClient.onAuthState((s: AuthState) => {
    const next: Partial<AuthStoreState> = { auth: s }
    // When a floodWait state arrives, also seed the floodRemaining from it
    if (s.step === 'floodWait') {
      next.floodRemaining = s.secondsRemaining
    }
    setState(next)
  })

  floodUnsub = authClient.onFloodTick((t) => {
    setState({ floodRemaining: t.remaining })
  })

  // Bootstrap current state from main on first subscription
  void authClient.getAuthState().then((s: AuthState) => {
    setState({ auth: s })
  })
}

function stopSubscriptions(): void {
  refCount--
  if (refCount > 0) return
  authUnsub?.()
  floodUnsub?.()
  authUnsub = null
  floodUnsub = null
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

function getSnapshot(): AuthStoreState {
  return currentState
}

function getServerSnapshot(): AuthStoreState {
  return currentState
}

// Hook for components to access auth state
export function useAuthStore(): AuthStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Intent dispatchers — delegate to authClient, update store from returned state
export const authActions = {
  async submitPhone(dialCode: string, national: string): Promise<void> {
    try {
      const s = await authClient.submitPhone(dialCode, national)
      setState({ auth: s })
    } catch (err) {
      // Network errors not classified by main — fall through; main will push state via onAuthState
      console.error('[authStore] submitPhone error:', err)
    }
  },

  async submitCode(code: string): Promise<void> {
    try {
      const s = await authClient.submitCode(code)
      setState({ auth: s })
    } catch (err) {
      console.error('[authStore] submitCode error:', err)
    }
  },

  async submitPassword(password: string): Promise<void> {
    try {
      const s = await authClient.submitPassword(password)
      setState({ auth: s })
    } catch (err) {
      console.error('[authStore] submitPassword error:', err)
    }
  },

  async resendCode(): Promise<void> {
    try {
      const s = await authClient.resendCode()
      setState({ auth: s })
    } catch (err) {
      console.error('[authStore] resendCode error:', err)
    }
  },

  async logout(): Promise<LogoutResult> {
    try {
      const result = await authClient.logout()
      // After logout the main pushes idle state via onAuthState, but reset locally too
      setState({ auth: { step: 'idle' }, floodRemaining: 0 })
      return result
    } catch (err) {
      console.error('[authStore] logout error:', err)
      return { serverRevoked: false }
    }
  },
}
