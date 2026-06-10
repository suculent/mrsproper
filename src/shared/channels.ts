// IPC channel name constants — single source of truth for both sides of the bridge.
export const CHANNELS = {
  AUTH_SUBMIT_PHONE: 'auth:submitPhone',
  AUTH_SUBMIT_CODE: 'auth:submitCode',
  AUTH_SUBMIT_PASSWORD: 'auth:submitPassword',
  AUTH_RESEND_CODE: 'auth:resendCode',
  AUTH_GET_STATE: 'auth:getState',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_STATE: 'auth:state',
  AUTH_FLOOD_TICK: 'auth:floodTick',
} as const
