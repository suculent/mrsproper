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

// Removal execution IPC channels (Phase 5, RMV-01/RMV-02/EXE-04/EXE-05).
// Pattern mirrors the SCAN_* / SEARCH_* blocks above.
export const REMOVAL_START        = 'removal:start' as const        // { severity, dialogIds }
export const REMOVAL_ABORT        = 'removal:abort' as const
export const REMOVAL_RETRY_GROUP  = 'removal:retryGroup' as const   // { dialogId }
export const REMOVAL_GET_STATE    = 'removal:getState' as const
export const REMOVAL_STATE        = 'removal:state' as const        // push: main → renderer
export const REMOVAL_GET_JOB      = 'removal:getJob' as const
export const REMOVAL_DISCARD_JOB  = 'removal:discardJob' as const

// Tag execution IPC channels (Phase 10, TAG-03/TAG-05). Pattern mirrors the REMOVAL_* block exactly above.
export const TAG_START       = 'tag:start' as const        // { dialogIds, tag }
export const TAG_ABORT       = 'tag:abort' as const
export const TAG_GET_STATE   = 'tag:getState' as const
export const TAG_STATE       = 'tag:state' as const        // push: main → renderer
export const TAG_GET_JOB     = 'tag:getJob' as const
export const TAG_DISCARD_JOB = 'tag:discardJob' as const

// Add execution IPC channels (Phase 14, ADD-06..ADD-11). Pattern mirrors the REMOVAL_*/TAG_* blocks above.
export const ADD_START        = 'add:start' as const        // { dialogIds, resume? }
export const ADD_ABORT        = 'add:abort' as const
export const ADD_RETRY_GROUP  = 'add:retryGroup' as const   // { dialogId }
export const ADD_GET_STATE    = 'add:getState' as const
export const ADD_STATE        = 'add:state' as const        // push: main → renderer
export const ADD_GET_JOB      = 'add:getJob' as const
export const ADD_DISCARD_JOB  = 'add:discardJob' as const
export const ADD_EXPORT_LOG   = 'add:exportLog' as const

// Contact-add IPC (Phase 14, ADD-05 main half). Non-blocking; { ok, code? } response.
export const TARGET_ADD_CONTACT = 'target:addContact' as const

// Generic clipboard IPC (Phase 15, D-18) — first use is the Add-mode Copy-link button.
export const CLIPBOARD_WRITE_TEXT = 'clipboard:writeText' as const

// DM template preference IPC (Phase 14, ADD-16 main half). Mirrors SEVERITY_*/THEME_* pattern.
export const TEMPLATE_GET = 'template:get' as const
export const TEMPLATE_SET = 'template:set' as const

// Severity preference IPC channels (Phase 6, electron-store pref). Non-secret;
// Zod-validated (z.enum(['kick','ban'])) in severityChannels.ts.
export const SEVERITY_GET = 'severity:get' as const
export const SEVERITY_SET = 'severity:set' as const

// Language preference IPC channels (Phase 8, LOC-01). Non-secret;
// Zod-validated (z.enum(['en','cs'])) in languageChannels.ts.
// LANGUAGE_GET returns null on first launch so renderer can detect OS locale default.
export const LANGUAGE_GET = 'language:get' as const
export const LANGUAGE_SET = 'language:set' as const

// Theme preference IPC channels (Phase 8, LOC-01). Non-secret;
// Zod-validated (z.enum(['light','dark'])) in themeChannels.ts.
// THEME_GET returns null on first launch; THEME_SET also sets nativeTheme.themeSource.
export const THEME_GET = 'theme:get' as const
export const THEME_SET = 'theme:set' as const

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
  REMOVAL_START,
  REMOVAL_ABORT,
  REMOVAL_RETRY_GROUP,
  REMOVAL_GET_STATE,
  REMOVAL_STATE,
  REMOVAL_GET_JOB,
  REMOVAL_DISCARD_JOB,
  TAG_START,
  TAG_ABORT,
  TAG_GET_STATE,
  TAG_STATE,
  TAG_GET_JOB,
  TAG_DISCARD_JOB,
  ADD_START,
  ADD_ABORT,
  ADD_RETRY_GROUP,
  ADD_GET_STATE,
  ADD_STATE,
  ADD_GET_JOB,
  ADD_DISCARD_JOB,
  ADD_EXPORT_LOG,
  TARGET_ADD_CONTACT,
  CLIPBOARD_WRITE_TEXT,
  TEMPLATE_GET,
  TEMPLATE_SET,
  SEVERITY_GET,
  SEVERITY_SET,
  LANGUAGE_GET,
  LANGUAGE_SET,
  THEME_GET,
  THEME_SET,
} as const
