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

// Group enumeration and membership scan IPC channels (Phase 4).
// Pattern mirrors the TARGET_* block directly above.
export const GROUPS_GET_STATE = 'groups:getState' as const
export const GROUPS_STATE = 'groups:state' as const      // push: main → renderer
export const GROUPS_REFRESH = 'groups:refresh' as const

export const SCAN_START = 'scan:start' as const
export const SCAN_ABORT = 'scan:abort' as const
export const SCAN_RETRY_GROUP = 'scan:retryGroup' as const
export const SCAN_STATE = 'scan:state' as const          // push: main → renderer
export const SCAN_GET_STATE = 'scan:getState' as const

// Name search IPC channels (Phase 4.1, TGT-05).
// Pattern mirrors the SCAN_* block directly above.
export const SEARCH_START = 'search:start' as const       // { query: string }
export const SEARCH_ABORT = 'search:abort' as const
export const SEARCH_GET_STATE = 'search:getState' as const
export const SEARCH_STATE = 'search:state' as const       // push: main → renderer
export const TARGET_RESOLVE_CANDIDATE = 'target:resolveCandidate' as const  // { userId: string }

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
  GROUPS_GET_STATE,
  GROUPS_STATE,
  GROUPS_REFRESH,
  SCAN_START,
  SCAN_ABORT,
  SCAN_RETRY_GROUP,
  SCAN_STATE,
  SCAN_GET_STATE,
  SEARCH_START,
  SEARCH_ABORT,
  SEARCH_GET_STATE,
  SEARCH_STATE,
  TARGET_RESOLVE_CANDIDATE,
} as const
