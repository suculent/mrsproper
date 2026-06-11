import { contextBridge, ipcRenderer } from 'electron'
import type { AuthState, FloodTick } from '../shared/authTypes'
import type { TargetState } from '../shared/targetTypes'
import type { GroupsState, ScanState } from '../shared/groupTypes'
import type { GovernorEvent } from '../shared/opTypes'
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
})
