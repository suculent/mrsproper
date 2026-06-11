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

// Governor → renderer push channel (Phase 2 D-09): typed GovernorEvent objects
// (flood-tick countdowns, hard-stop, wait-too-long, retry-attempt). Wired in
// main/index.ts; Phase 5's progress UI subscribes via the preload bridge.
export const OP_GOVERNOR_EVENT = 'op:governorEvent' as const

// Target resolution IPC channels (Phase 3).
// Renderer → main request channels + main → renderer push channel.
// D-03: resolution fires on explicit Find/Enter only; TARGET_RESOLVE is the trigger.
// D-14: TARGET_RESET clears all downstream state.
// D-11: TARGET_CONFIRM locks the resolved target for Phase 4 use.
export const TARGET_RESOLVE = 'target:resolve' as const
export const TARGET_CONFIRM = 'target:confirm' as const
export const TARGET_RESET = 'target:reset' as const
export const TARGET_GET_STATE = 'target:getState' as const
export const TARGET_STATE = 'target:state' as const

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
  OP_GOVERNOR_EVENT,
  TARGET_RESOLVE,
  TARGET_CONFIRM,
  TARGET_RESET,
  TARGET_GET_STATE,
  TARGET_STATE,
} as const
