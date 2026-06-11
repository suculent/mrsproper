import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { SessionManager } from './telegram/SessionManager'
import { createSecretsStore } from './storage/secrets'
import { registerAuthChannels, emitAuthState } from './ipc/authChannels'
import type { AuthState } from '../shared/authTypes'

// ── API credentials (injected at build time via electron.vite.config.ts define) ──
// Loaded here lazily — safeStorage and electron ready must fire first (Pitfall 3).
// NOTE: config.ts reads import.meta.env — safe in main bundle (not in renderer).
// We import dynamically after app.whenReady() to ensure Electron is initialized.

function createWindow(): BrowserWindow {
  // Apply OS appearance before creating the window
  const isDark = nativeTheme.shouldUseDarkColors

  const mainWindow = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 400,
    minHeight: 600,
    show: false,
    title: 'MrProper',
    backgroundColor: isDark ? '#0B1220' : '#FFFFFF',
    webPreferences: {
      // D-02 trust boundary: contextIsolation + no nodeIntegration + sandbox
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  // Drive the renderer's light/dark class from nativeTheme — the SAME source as
  // the window backgroundColor above. The renderer's own prefers-color-scheme can
  // disagree with nativeTheme in Electron, which left dark text on a dark window.
  // Apply on first load and on every OS theme change.
  const syncRendererTheme = (): void => {
    const dark = nativeTheme.shouldUseDarkColors
    mainWindow.webContents
      .executeJavaScript(`document.documentElement.classList.toggle('dark', ${dark})`)
      .catch(() => {})
  }
  mainWindow.webContents.on('did-finish-load', syncRendererTheme)
  nativeTheme.on('updated', syncRendererTheme)

  // Content-Security-Policy.
  // Production (packaged): strict — local bundle only, no remote connections. The renderer
  // never talks to the network directly (MTProto runs in the main process), so connect-src
  // 'none' is correct for the shipped app.
  // Development: the Vite dev server needs an inline React-refresh preamble ('unsafe-inline'),
  // eval-based HMR ('unsafe-eval'), and a websocket back to localhost (connect-src), so a
  // strict CSP blanks the renderer. Relax ONLY in dev.
  const isDevRenderer = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
  const csp = isDevRenderer
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://localhost:* http://localhost:*; object-src 'none';"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Load the renderer
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  const win = createWindow()

  // ── After app ready: safeStorage is available (Pitfall 3 — guard post-ready) ──
  // Create the secrets store backed by the real Electron safeStorage
  const secretsStore = createSecretsStore()

  // Load API credentials (build-time injected, not committed to source — D-04)
  const { API_ID, API_HASH } = await import('./telegram/config')

  // ── Build the SessionManager ──────────────────────────────────────────────
  // Restore any previously persisted session string from the encrypted store
  const savedSession = secretsStore.restoreSession() ?? ''

  const client = new TelegramClient(
    new StringSession(savedSession),
    API_ID,
    API_HASH,
    {
      connectionRetries: 5,
      // RESEARCH Pitfall 5: set low so login flood-waits throw (surfaced as D-13 countdown)
      // rather than silently sleeping and freezing the UI
      floodSleepThreshold: 5,
    }
  )

  const sm = new SessionManager({
    client: client as unknown as ConstructorParameters<typeof SessionManager>[0]['client'],
    storage: {
      isEncryptionAvailable: () => {
        const { safeStorage } = require('electron')
        return safeStorage.isEncryptionAvailable()
      },
      encryptString: (s: string) => {
        const { safeStorage } = require('electron')
        return safeStorage.encryptString(s)
      },
      decryptString: (b: Buffer) => {
        const { safeStorage } = require('electron')
        return safeStorage.decryptString(b)
      },
    },
    onStateChange: (state: AuthState) => {
      emitAuthState(win, state)
    },
    onSessionWipe: () => {
      secretsStore.wipeSession()
    },
    onSessionPersist: (sessionString: string) => {
      // Write the session to the encrypted on-disk store so it survives a restart.
      secretsStore.persistSession(sessionString)
    },
    apiCreds: { apiId: API_ID, apiHash: API_HASH },
  })

  // ── Register IPC handlers ─────────────────────────────────────────────────
  registerAuthChannels(win, sm)

  // ── Restore session on launch ─────────────────────────────────────────────
  // savedSession is either a live StringSession string or ''.
  // initialize() will connect + checkAuthorization; wipe + route to idle on dead session.
  await sm.initialize(savedSession || undefined)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
