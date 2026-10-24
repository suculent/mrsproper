import { contextBridge, ipcRenderer } from 'electron'
import type { AuthState, FloodTick } from '../shared/authTypes'
import type { TargetState } from '../shared/targetTypes'
import type { GroupsState, ScanState } from '../shared/groupTypes'
import type { SearchState } from '../shared/searchTypes'
import type { RemovalState, RemovalJobFile } from '../shared/removalTypes'
import type { TagState, TagJobFileSafe } from '../shared/tagTypes'
import type { GovernorEvent } from '../shared/opTypes'
import type { AddState, AddJobFileSafe } from '../shared/addTypes'
import {
  TARGET_RESOLVE,
  TARGET_CONFIRM,
  TARGET_RESET,
  TARGET_GET_STATE,
  TARGET_STATE,
  OP_GOVERNOR_EVENT,
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
  SEVERITY_GET,
  SEVERITY_SET,
  LANGUAGE_GET,
  LANGUAGE_SET,
  LANGUAGE_SET_DETECTED,
  THEME_GET,
  THEME_SET,
  ADD_START,
  ADD_RESUME,
  ADD_ABORT,
  ADD_RETRY_GROUP,
  ADD_GET_STATE,
  ADD_STATE,
  ADD_GET_JOB,
  ADD_DISCARD_JOB,
  TARGET_ADD_CONTACT,
  TEMPLATE_GET,
  TEMPLATE_SET,
  ADD_EXPORT_LOG,
  CLIPBOARD_WRITE_TEXT,
} from '../shared/channels'

// contextBridge exposes ONLY whitelisted functions to the renderer.
// The renderer never gets the GramJS client, session string, or raw ipcRenderer.
// This is the D-02 trust boundary.
contextBridge.exposeInMainWorld('mrsproper', {
  submitPhone: (p: { dialCode: string; national: string }) =>
    ipcRenderer.invoke('auth:submitPhone', p),
  submitCode: (p: { code: string }) =>
    ipcRenderer.invoke('auth:submitCode', p),
  submitPassword: (p: { password: string }) =>
    ipcRenderer.invoke('auth:submitPassword', p),
  resendCode: () => ipcRenderer.invoke('auth:resendCode'),
  getAuthState: () => ipcRenderer.invoke('auth:getState') as Promise<AuthState>,
  logout: () => ipcRenderer.invoke('auth:logout'),
  onAuthState: (cb: (s: AuthState) => void): (() => void) => {
    const h = (_: unknown, s: AuthState): void => cb(s)
    ipcRenderer.on('auth:state', h)
    return () => ipcRenderer.removeListener('auth:state', h)
  },
  onFloodTick: (cb: (t: FloodTick) => void): (() => void) => {
    const h = (_: unknown, t: FloodTick): void => cb(t)
    ipcRenderer.on('auth:floodTick', h)
    return () => ipcRenderer.removeListener('auth:floodTick', h)
  },

  // ── Target resolution bridge (Phase 3, T-03-09) ────────────────────────────
  // input crosses as { input: string }; Zod-validated in targetChannels.ts before
  // reaching TargetResolver — the preload performs no additional transformation.
  resolveTarget: (input: string): Promise<TargetState> =>
    ipcRenderer.invoke(TARGET_RESOLVE, { input }),
  confirmTarget: (): Promise<TargetState> =>
    ipcRenderer.invoke(TARGET_CONFIRM),
  resetTarget: (): Promise<TargetState> =>
    ipcRenderer.invoke(TARGET_RESET),
  getTargetState: (): Promise<TargetState> =>
    ipcRenderer.invoke(TARGET_GET_STATE) as Promise<TargetState>,
  onTargetState: (cb: (s: TargetState) => void): (() => void) => {
    const h = (_: unknown, s: TargetState): void => cb(s)
    ipcRenderer.on(TARGET_STATE, h)
    return () => ipcRenderer.removeListener(TARGET_STATE, h)
  },
  // D-17: OP_GOVERNOR_EVENT delivers typed GovernorEvent objects (flood-tick remaining,
  // hard-stop, wait-too-long, retry-attempt). Safe to expose to renderer — contains
  // only typed codes and numbers, no raw Telegram payload or session data (T-03-10).
  onGovernorEvent: (cb: (e: GovernorEvent) => void): (() => void) => {
    const h = (_: unknown, e: GovernorEvent): void => cb(e)
    ipcRenderer.on(OP_GOVERNOR_EVENT, h)
    return () => ipcRenderer.removeListener(OP_GOVERNOR_EVENT, h)
  },

  // ── Group enumeration bridge (Phase 4, GRP-02) ────────────────────────────
  // Zod-validated in groupChannels.ts before reaching GroupEnumerator —
  // preload performs no additional transformation.
  getGroupsState: (): Promise<GroupsState> =>
    ipcRenderer.invoke(GROUPS_GET_STATE) as Promise<GroupsState>,
  refreshGroups: (): Promise<GroupsState> =>
    ipcRenderer.invoke(GROUPS_REFRESH) as Promise<GroupsState>,
  onGroupsState: (cb: (s: GroupsState) => void): (() => void) => {
    const h = (_: unknown, s: GroupsState): void => cb(s)
    ipcRenderer.on(GROUPS_STATE, h)
    return () => ipcRenderer.removeListener(GROUPS_STATE, h)
  },

  // ── Membership scan bridge (Phase 4, GRP-03) ─────────────────────────────
  // scan:start accepts no payload — target is resolved from main-process TargetResolver (T-04-07).
  // scan:retryGroup payload is Zod-validated and security-checked in groupChannels.ts (T-04-06).
  startScan: (): Promise<ScanState> =>
    ipcRenderer.invoke(SCAN_START) as Promise<ScanState>,
  abortScan: (): Promise<ScanState> =>
    ipcRenderer.invoke(SCAN_ABORT) as Promise<ScanState>,
  retryScanGroup: (dialogId: string): Promise<void> =>
    ipcRenderer.invoke(SCAN_RETRY_GROUP, { dialogId }) as Promise<void>,
  getScanState: (): Promise<ScanState> =>
    ipcRenderer.invoke(SCAN_GET_STATE) as Promise<ScanState>,
  onScanState: (cb: (s: ScanState) => void): (() => void) => {
    const h = (_: unknown, s: ScanState): void => cb(s)
    ipcRenderer.on(SCAN_STATE, h)
    return () => ipcRenderer.removeListener(SCAN_STATE, h)
  },

  // ── Name search bridge (Phase 4.1, TGT-05) ───────────────────────────────
  // search:start carries { query: string }; Zod-validated in searchChannels.ts.
  // target:resolveCandidate carries only { userId: string } — accessHash never crosses IPC (T-03-01).
  startSearch: (query: string): Promise<SearchState> =>
    ipcRenderer.invoke(SEARCH_START, { query }) as Promise<SearchState>,
  abortSearch: (): Promise<SearchState> =>
    ipcRenderer.invoke(SEARCH_ABORT) as Promise<SearchState>,
  getSearchState: (): Promise<SearchState> =>
    ipcRenderer.invoke(SEARCH_GET_STATE) as Promise<SearchState>,
  onSearchState: (cb: (s: SearchState) => void): (() => void) => {
    const h = (_: unknown, s: SearchState): void => cb(s)
    ipcRenderer.on(SEARCH_STATE, h)
    return () => ipcRenderer.removeListener(SEARCH_STATE, h)
  },
  // target:resolveCandidate carries only userId — accessHash never crosses IPC (T-03-01).
  selectCandidate: (userId: string): Promise<TargetState> =>
    ipcRenderer.invoke(TARGET_RESOLVE_CANDIDATE, { userId }) as Promise<TargetState>,

  // ── Removal execution bridge (Phase 5, RMV-01/RMV-02/EXE-04/EXE-05) ──────
  // removal:start carries { severity, dialogIds }; Zod-validated + auth-gated + dialog-map-gated
  // in removalChannels.ts before reaching RemovalExecutor. Target is resolved in main only (T-05-04-B).
  startRemoval: (severity: 'kick' | 'ban', dialogIds: string[]): Promise<RemovalState> =>
    ipcRenderer.invoke(REMOVAL_START, { severity, dialogIds }) as Promise<RemovalState>,
  abortRemoval: (): Promise<RemovalState> =>
    ipcRenderer.invoke(REMOVAL_ABORT) as Promise<RemovalState>,
  // removal:retryGroup carries only { dialogId }; Zod-validated + job-dialogId-gated (T-05-05-D).
  retryRemovalGroup: (dialogId: string): Promise<void> =>
    ipcRenderer.invoke(REMOVAL_RETRY_GROUP, { dialogId }) as Promise<void>,
  getRemovalState: (): Promise<RemovalState> =>
    ipcRenderer.invoke(REMOVAL_GET_STATE) as Promise<RemovalState>,
  onRemovalState: (cb: (s: RemovalState) => void): (() => void) => {
    const h = (_: unknown, s: RemovalState): void => cb(s)
    ipcRenderer.on(REMOVAL_STATE, h)
    return () => ipcRenderer.removeListener(REMOVAL_STATE, h)
  },
  // removal:getJob — returns RemovalJobFile | null; used on launch to detect pending jobs.
  getRemovalJob: (): Promise<RemovalJobFile | null> =>
    ipcRenderer.invoke(REMOVAL_GET_JOB) as Promise<RemovalJobFile | null>,
  // removal:discardJob — clears the job file; called when user clicks Discard in ResumeJobDialog.
  discardRemovalJob: (): Promise<null> =>
    ipcRenderer.invoke(REMOVAL_DISCARD_JOB) as Promise<null>,

  // ── Tag execution bridge (Phase 10, TAG-03/TAG-05) ───────────────────────
  // tag:start carries { dialogIds, tag }; Zod-validated + auth-gated + dialog-map-gated
  // in tagChannels.ts. Target identity is read from main process only (T-05-04-B).
  startTag: (dialogIds: string[], tag: string): Promise<TagState> =>
    ipcRenderer.invoke(TAG_START, { dialogIds, tag }) as Promise<TagState>,
  abortTag: (): Promise<TagState> =>
    ipcRenderer.invoke(TAG_ABORT) as Promise<TagState>,
  getTagState: (): Promise<TagState> =>
    ipcRenderer.invoke(TAG_GET_STATE) as Promise<TagState>,
  onTagState: (cb: (s: TagState) => void): (() => void) => {
    const h = (_: unknown, s: TagState): void => cb(s)
    ipcRenderer.on(TAG_STATE, h)
    return () => ipcRenderer.removeListener(TAG_STATE, h)
  },
  getTagJob: (): Promise<TagJobFileSafe | null> =>
    ipcRenderer.invoke(TAG_GET_JOB) as Promise<TagJobFileSafe | null>,
  discardTagJob: (): Promise<null> =>
    ipcRenderer.invoke(TAG_DISCARD_JOB) as Promise<null>,

  // ── Severity preference bridge (Phase 6, SAF-01/02/03) ───────────────────
  // Non-secret pref channels; Zod-validated (z.enum(['kick','ban'])) in severityChannels.ts.
  getSeverity: (): Promise<'kick' | 'ban'> =>
    ipcRenderer.invoke(SEVERITY_GET) as Promise<'kick' | 'ban'>,
  setSeverity: (severity: 'kick' | 'ban'): Promise<'kick' | 'ban'> =>
    ipcRenderer.invoke(SEVERITY_SET, { severity }) as Promise<'kick' | 'ban'>,

  // ── Language preference bridge (Phase 8, LOC-01) ──────────────────────────
  // Non-secret pref channels; Zod-validated (z.enum(['en','cs'])) in languageChannels.ts.
  // getLanguage returns null on first launch — caller applies OS locale detection.
  getLanguage: (): Promise<'en' | 'cs' | null> =>
    ipcRenderer.invoke(LANGUAGE_GET) as Promise<'en' | 'cs' | null>,
  setLanguage: (language: 'en' | 'cs'): Promise<'en' | 'cs'> =>
    ipcRenderer.invoke(LANGUAGE_SET, { language }) as Promise<'en' | 'cs'>,
  setDetectedLanguage: (language: 'en' | 'cs'): Promise<'en' | 'cs'> =>
    ipcRenderer.invoke(LANGUAGE_SET_DETECTED, { language }) as Promise<'en' | 'cs'>,

  // ── Theme preference bridge (Phase 8, LOC-01) ─────────────────────────────
  // Non-secret pref channels; Zod-validated (z.enum(['light','dark'])) in themeChannels.ts.
  // getTheme returns null on first launch — caller falls through to OS nativeTheme.
  getTheme: (): Promise<'light' | 'dark' | null> =>
    ipcRenderer.invoke(THEME_GET) as Promise<'light' | 'dark' | null>,
  setTheme: (theme: 'light' | 'dark'): Promise<'light' | 'dark'> =>
    ipcRenderer.invoke(THEME_SET, { theme }) as Promise<'light' | 'dark'>,

  // ── Add execution bridge (Phase 14, ADD-06/ADD-08/ADD-05/ADD-16) ─────────
  // add:start carries { dialogIds }; resume is computed server-side (D-20), never sent by the
  // renderer. Zod-validated + auth-gated + dialog-map-gated in addChannels.ts. Target identity
  // is read from main process only (T-05-04-B). No renderer UI calls this yet (Phase 15's job) —
  // wired here so the full surface is reachable end-to-end once that UI exists.
  startAdd: (dialogIds: string[]): Promise<AddState> =>
    ipcRenderer.invoke(ADD_START, { dialogIds }) as Promise<AddState>,
  // add:resume — no payload. Main reads the on-disk job and continues it with the job's full
  // dialog-id set; identity comes only from the job file or a matching resolver (D-07, T-14-16).
  resumeAdd: (): Promise<AddState> =>
    ipcRenderer.invoke(ADD_RESUME) as Promise<AddState>,
  abortAdd: (): Promise<AddState> =>
    ipcRenderer.invoke(ADD_ABORT) as Promise<AddState>,
  // add:retryGroup carries only { dialogId }; Zod-validated + job-dialogId-gated.
  retryAddGroup: (dialogId: string): Promise<void> =>
    ipcRenderer.invoke(ADD_RETRY_GROUP, { dialogId }) as Promise<void>,
  getAddState: (): Promise<AddState> =>
    ipcRenderer.invoke(ADD_GET_STATE) as Promise<AddState>,
  onAddState: (cb: (s: AddState) => void): (() => void) => {
    const h = (_: unknown, s: AddState): void => cb(s)
    ipcRenderer.on(ADD_STATE, h)
    return () => ipcRenderer.removeListener(ADD_STATE, h)
  },
  // add:getJob — returns AddJobFileSafe | null (accessHash stripped); used on launch to
  // detect pending jobs.
  getAddJob: (): Promise<AddJobFileSafe | null> =>
    ipcRenderer.invoke(ADD_GET_JOB) as Promise<AddJobFileSafe | null>,
  // add:discardJob — clears the job file; called when user clicks Discard in a Resume prompt.
  discardAddJob: (): Promise<null> =>
    ipcRenderer.invoke(ADD_DISCARD_JOB) as Promise<null>,

  // ── Contact-add bridge (Phase 14, ADD-05 main half) ───────────────────────
  // target:addContact takes no payload (confirmation only); non-blocking — always resolves to
  // { ok, code? }, never rejects (D-08).
  addTargetToContacts: (): Promise<{ ok: boolean; code?: string }> =>
    ipcRenderer.invoke(TARGET_ADD_CONTACT) as Promise<{ ok: boolean; code?: string }>,

  // ── DM template preference bridge (Phase 14, ADD-16 main half) ───────────
  // Non-secret pref channels; Zod-validated (z.string().min(1).max(4000)) in templateChannels.ts.
  // getDmTemplate returns null on first launch — caller falls back to the built-in EN/CS default.
  getDmTemplate: (): Promise<string | null> =>
    ipcRenderer.invoke(TEMPLATE_GET) as Promise<string | null>,
  setDmTemplate: (template: string): Promise<string> =>
    ipcRenderer.invoke(TEMPLATE_SET, { template }) as Promise<string>,

  // ── Add-log export + clipboard bridge (Phase 15, ADD-14/ADD-13) ──────────
  // add:exportLog takes no payload; opens a main-controlled save dialog and copies
  // add-log.txt to the chosen path. clipboard:writeText carries { text }; Zod-bounded
  // and auth-gated in clipboardChannels.ts — no additional transformation here.
  exportAddLog: (): Promise<{ ok: boolean; reason?: 'no-log' | 'canceled' }> =>
    ipcRenderer.invoke(ADD_EXPORT_LOG) as Promise<{ ok: boolean; reason?: 'no-log' | 'canceled' }>,
  writeClipboardText: (text: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CLIPBOARD_WRITE_TEXT, { text }) as Promise<{ ok: boolean }>,
})
