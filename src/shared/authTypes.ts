// Shared types imported by both main and renderer.
// Single source of truth for auth state and IPC DTOs.

export interface Identity {
  name: string
  username: string | null
  id: string
  avatar: Buffer | null
}

export type AuthErrorCode =
  | 'PHONE_NUMBER_INVALID'
  | 'PHONE_CODE_INVALID'
  | 'PHONE_CODE_EXPIRED'
  | 'PASSWORD_HASH_INVALID'
  | 'NETWORK_ERROR'
  | 'ENCRYPTION_UNAVAILABLE'
  | 'UNKNOWN'

export type AuthState =
  | { step: 'idle' }
  | { step: 'sendingCode' }
  | { step: 'needCode'; sentTo: string; canResend: boolean }
  | { step: 'verifying' }
  | { step: 'needPassword'; hint?: string }
  | { step: 'authorized'; identity: Identity }
  | { step: 'error'; code: AuthErrorCode; retryStep: 'phone' | 'code' | 'password' }
  | { step: 'floodWait'; retryStep: 'code' | 'password'; secondsRemaining: number }

export interface FloodTick {
  remaining: number
}

// IPC channel names (constants used in both preload and main)
export const AUTH_CHANNELS = {
  SUBMIT_PHONE: 'auth:submitPhone',
  SUBMIT_CODE: 'auth:submitCode',
  SUBMIT_PASSWORD: 'auth:submitPassword',
  RESEND_CODE: 'auth:resendCode',
  GET_STATE: 'auth:getState',
  LOGOUT: 'auth:logout',
  STATE_EVENT: 'auth:state',
  FLOOD_TICK: 'auth:floodTick',
} as const
