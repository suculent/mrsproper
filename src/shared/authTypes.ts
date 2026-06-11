// Shared types imported by both main and renderer.
// Single source of truth for auth state, IPC DTOs, and error codes.
// Plans 03/04/05 implement against these exact shapes.

export interface Identity {
  name: string
  username: string | null
  id: string
  avatar: Uint8Array | null
}

export interface FloodTick {
  remaining: number
}

// Typed error codes — sourced from 01-RESEARCH §Pattern 4 Error states copy table.
export type AuthErrorCode =
  | 'PHONE_NUMBER_INVALID'
  | 'PHONE_CODE_INVALID'
  | 'PHONE_CODE_EXPIRED'
  | 'PASSWORD_HASH_INVALID'
  | 'FLOOD_WAIT'
  | 'NETWORK'
  | 'UNKNOWN'

// Auth state machine — discriminated union used by both main and renderer.
// `error` carries retryStep so the renderer stays on the offending step (D-12).
// `floodWait` carries secondsRemaining; main drives a 1-Hz timer and emits auth:floodTick (D-13).
export type AuthState =
  | { step: 'idle' }
  | { step: 'sendingCode' }
  | { step: 'needCode'; sentTo: string; canResend: boolean }
  | { step: 'verifying' }
  | { step: 'needPassword'; hint?: string }
  | { step: 'authorized'; identity: Identity }
  | { step: 'error'; code: AuthErrorCode; retryStep: 'phone' | 'code' | 'password' }
  | { step: 'floodWait'; retryStep: 'phone' | 'code' | 'password'; secondsRemaining: number }

// IPC Data Transfer Objects — the typed payloads crossing the contextBridge trust boundary.
export interface SubmitPhone {
  dialCode: string
  national: string
}

export interface SubmitCode {
  code: string
}

export interface SubmitPassword {
  password: string
}

export interface LogoutResult {
  serverRevoked: boolean
}
