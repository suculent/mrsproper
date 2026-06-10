// IPC channel name constants — single source of truth for both sides of the contextBridge.
// Sourced from 01-RESEARCH §Pattern 1 preload surface.

export const AUTH_SUBMIT_PHONE = 'auth:submitPhone' as const
export const AUTH_SUBMIT_CODE = 'auth:submitCode' as const
export const AUTH_SUBMIT_PASSWORD = 'auth:submitPassword' as const
export const AUTH_RESEND_CODE = 'auth:resendCode' as const
export const AUTH_GET_STATE = 'auth:getState' as const
export const AUTH_LOGOUT = 'auth:logout' as const
export const AUTH_STATE = 'auth:state' as const
export const AUTH_FLOOD_TICK = 'auth:floodTick' as const

// Namespace object for convenience
export const CHANNELS = {
  AUTH_SUBMIT_PHONE,
  AUTH_SUBMIT_CODE,
  AUTH_SUBMIT_PASSWORD,
  AUTH_RESEND_CODE,
  AUTH_GET_STATE,
  AUTH_LOGOUT,
  AUTH_STATE,
  AUTH_FLOOD_TICK,
} as const
