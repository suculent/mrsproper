import { contextBridge, ipcRenderer } from 'electron'
import type { AuthState, FloodTick } from '../shared/authTypes'

// contextBridge exposes ONLY whitelisted functions to the renderer.
// The renderer never gets the GramJS client, session string, or raw ipcRenderer.
// This is the D-02 trust boundary.
contextBridge.exposeInMainWorld('mrproper', {
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
})
