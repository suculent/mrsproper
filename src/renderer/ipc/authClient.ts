// Typed thin wrapper over window.mrsproper (the contextBridge surface).
// The renderer NEVER imports ipcRenderer directly — all Telegram I/O goes through this client.
// No GramJS, no session string. Trust boundary is enforced here by design.

import type { AuthState, FloodTick, LogoutResult } from '@shared/authTypes'

// Type declaration for the contextBridge surface exposed by src/preload/index.ts
declare global {
  interface MrsProperApi {
    submitPhone(p: { dialCode: string; national: string }): Promise<AuthState>
    submitCode(p: { code: string }): Promise<AuthState>
    submitPassword(p: { password: string }): Promise<AuthState>
    resendCode(): Promise<AuthState>
    getAuthState(): Promise<AuthState>
    logout(): Promise<LogoutResult>
    onAuthState(cb: (s: AuthState) => void): () => void
    onFloodTick(cb: (t: FloodTick) => void): () => void
  }
  interface Window {
    mrsproper: MrsProperApi
  }
}

export const authClient = {
  submitPhone(dialCode: string, national: string): Promise<AuthState> {
    return window.mrsproper.submitPhone({ dialCode, national })
  },

  submitCode(code: string): Promise<AuthState> {
    return window.mrsproper.submitCode({ code })
  },

  submitPassword(password: string): Promise<AuthState> {
    return window.mrsproper.submitPassword({ password })
  },

  resendCode(): Promise<AuthState> {
    return window.mrsproper.resendCode()
  },

  getAuthState(): Promise<AuthState> {
    return window.mrsproper.getAuthState()
  },

  logout(): Promise<LogoutResult> {
    return window.mrsproper.logout()
  },

  onAuthState(cb: (s: AuthState) => void): () => void {
    return window.mrsproper.onAuthState(cb)
  },

  onFloodTick(cb: (t: FloodTick) => void): () => void {
    return window.mrsproper.onFloodTick(cb)
  },
}
