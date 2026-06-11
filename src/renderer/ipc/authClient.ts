// Typed thin wrapper over window.mrproper (the contextBridge surface).
// The renderer NEVER imports ipcRenderer directly — all Telegram I/O goes through this client.
// No GramJS, no session string. Trust boundary is enforced here by design.

import type { AuthState, FloodTick, LogoutResult } from '@shared/authTypes'

// Type declaration for the contextBridge surface exposed by src/preload/index.ts
declare global {
  interface MrProperApi {
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
    mrproper: MrProperApi
  }
}

export const authClient = {
  submitPhone(dialCode: string, national: string): Promise<AuthState> {
    return window.mrproper.submitPhone({ dialCode, national })
  },

  submitCode(code: string): Promise<AuthState> {
    return window.mrproper.submitCode({ code })
  },

  submitPassword(password: string): Promise<AuthState> {
    return window.mrproper.submitPassword({ password })
  },

  resendCode(): Promise<AuthState> {
    return window.mrproper.resendCode()
  },

  getAuthState(): Promise<AuthState> {
    return window.mrproper.getAuthState()
  },

  logout(): Promise<LogoutResult> {
    return window.mrproper.logout()
  },

  onAuthState(cb: (s: AuthState) => void): () => void {
    return window.mrproper.onAuthState(cb)
  },

  onFloodTick(cb: (t: FloodTick) => void): () => void {
    return window.mrproper.onFloodTick(cb)
  },
}
