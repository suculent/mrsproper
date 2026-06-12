import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { SessionManager } from './telegram/SessionManager'
import { TargetResolver } from './telegram/TargetResolver'
import { GroupEnumerator } from './telegram/GroupEnumerator'
import { MembershipScanner } from './telegram/MembershipScanner'
import { RemovalExecutor } from './telegram/RemovalExecutor'
import { RateLimitGovernor } from './telegram/governor'
import { createSecretsStore } from './storage/secrets'
import { createAuditStore } from './storage/auditStore'
import { registerAuthChannels, emitAuthState } from './ipc/authChannels'
import { registerTargetChannels, emitTargetState } from './ipc/targetChannels'
import { registerGroupChannels, emitGroupsState, emitScanState } from './ipc/groupChannels'
import { registerSearchChannels, emitSearchState } from './ipc/searchChannels'
import { registerRemovalChannels, emitRemovalState } from './ipc/removalChannels'
import { ParticipantSearcher } from './telegram/ParticipantSearcher'
import { OP_GOVERNOR_EVENT } from '../shared/channels'
import type { AuthState } from '../shared/authTypes'
import type { GovernorEvent } from '../shared/opTypes'

// ── API credentials (injected at build time via electron.vite.config.ts define) ──
// Loaded here lazily — safeStorage and electron ready must fire first (Pitfall 3).
// NOTE: config.ts reads import.meta.env — safe in main bundle (not in renderer).
// We import dynamically after app.whenReady() to ensure Electron is initialized.

function createWindow(): BrowserWindow {
  // Apply OS appearance before creating the window
  const isDark = nativeTheme.shouldUseDarkColors

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    title: 'Mrs. Proper',
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
  // Remove the global nativeTheme listener when this window closes, otherwise a
  // new listener accumulates every time createWindow() runs (macOS re-activation).
  mainWindow.on('closed', () => {
    nativeTheme.removeListener('updated', syncRendererTheme)
  })

  // Content-Security-Policy.
  // Production (packaged): strict — local bundle only, no remote connections. The renderer
  // never talks to the network directly (MTProto runs in the main process), so connect-src
  // 'none' is correct for the shipped app.
  // NOTE (WR-02): header injection below is unreliable for file:// loads, so the SAME strict
  // CSP is ALSO baked into the built index.html as a <meta http-equiv> tag at build time —
  // see injectProductionCsp() in electron.vite.config.ts. Keep both strings in sync.
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
  // Track the CURRENT window (review WR-03): on macOS the app keeps running after
  // the window closes, and 'activate' creates a new one. All push emitters below
  // close over this mutable binding so re-activated windows keep receiving
  // auth-state (and governor) events instead of targeting the destroyed original.
  let currentWin = createWindow()

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
      // Phase 2 D-11: set to 0 so ALL FLOOD_WAITs throw to the governor rather than being
      // silently absorbed by GramJS. Governor decides per D-09 whether to emit a countdown event.
      // floodSleepThreshold=0 is valid: Math.min(0 || 0, 86400) = 0 (verified: telegramBaseClient.js).
      // Interactive auth FLOOD_WAITs (login flow) are excluded from the governor per D-06 —
      // they follow the existing FloodWaitController path in SessionManager.
      floodSleepThreshold: 0,
    }
  )

  // ── ONE account-wide RateLimitGovernor (WR-01) ────────────────────────────
  // EXE-01's concurrency=1 serialization is enforced per governor instance.
  // SessionManager, TargetResolver, and every Phase 4+ consumer share THIS
  // instance so no two governed Telegram calls can ever run concurrently —
  // "no feature can flood the account" must hold across features, not per-feature.
  const governor = new RateLimitGovernor({
    client: client as unknown as ConstructorParameters<typeof RateLimitGovernor>[0]['client'],
    // WR-04 (Phase 2): with floodSleepThreshold=0 every FLOOD_WAIT on governed
    // calls reaches the governor — forward typed GovernorEvents to the renderer
    // and log them in main so a flood pause is always diagnosable.
    onEvent: (event: GovernorEvent) => {
      console.log('[governor]', JSON.stringify(event))
      if (!currentWin.isDestroyed()) {
        currentWin.webContents.send(OP_GOVERNOR_EVENT, event)
      }
    },
  })

  const sm = new SessionManager({
    client: client as unknown as ConstructorParameters<typeof SessionManager>[0]['client'],
    governor,
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
      emitAuthState(currentWin, state)
      // D-08: eager group enumeration immediately after login (authorized state).
      // enumerator is constructed after sm but before sm.initialize(), so by the
      // time any authorized transition fires, enumerator is already in scope.
      if (state.step === 'authorized') {
        void enumerator.enumerateAtLogin()
      }
    },
    onSessionWipe: () => {
      secretsStore.wipeSession()
    },
    onSessionPersist: (sessionString: string) => {
      // Write the session to the encrypted on-disk store so it survives a restart.
      secretsStore.persistSession(sessionString)
    },
    // WR-09: symmetric read path so sm.restore() can actually reach the durable store.
    restoreSession: () => secretsStore.restoreSession(),
    apiCreds: { apiId: API_ID, apiHash: API_HASH },
  })

  // ── Register IPC handlers ─────────────────────────────────────────────────
  // Handlers close over sm (request/response), not the window — safe across
  // window re-creation on macOS re-activation.
  registerAuthChannels(currentWin, sm)

  // ── Wire TargetResolver ───────────────────────────────────────────────────
  // Shares the same TelegramClient AND the same account-wide governor as
  // SessionManager (WR-01) — no new connection, no auth, one serial queue.
  // emitTargetState closes over currentWin via lambda so re-activated windows
  // keep receiving events without re-registering (WR-03).
  const resolver = new TargetResolver({
    client: client as unknown as ConstructorParameters<typeof TargetResolver>[0]['client'],
    governor,
    onStateChange: (state) => {
      emitTargetState(currentWin, state)
    },
  })
  // NOTE: registerTargetChannels is called AFTER scanner is constructed below (CR-01-MAIN).
  // scanner must be in scope before the call; it is declared at the MembershipScanner block.

  // ── Wire GroupEnumerator ──────────────────────────────────────────────────
  // Shares the same TelegramClient AND the same account-wide governor (WR-01).
  // emitGroupsState closes over currentWin via lambda so re-activated windows
  // keep receiving events without re-registering (WR-03).
  const enumerator = new GroupEnumerator({
    client: client as unknown as ConstructorParameters<typeof GroupEnumerator>[0]['client'],
    governor,
    onStateChange: (state) => {
      emitGroupsState(currentWin, state)
    },
  })

  // ── Wire MembershipScanner ────────────────────────────────────────────────
  // Shares the same client, governor, and enumerator as above.
  // Target is read from resolver.getResolvedUser() in main process only (T-04-07).
  const scanner = new MembershipScanner({
    client: client as unknown as ConstructorParameters<typeof MembershipScanner>[0]['client'],
    governor,
    enumerator,
    resolver,
    onStateChange: (state) => {
      emitScanState(currentWin, state)
    },
  })

  registerGroupChannels(currentWin, enumerator, scanner)

  // ── Wire ParticipantSearcher ──────────────────────────────────────────────
  // Shares the same client, governor, and enumerator as above.
  // onStateChange pushes SearchState updates to the renderer via emitSearchState.
  const searcher = new ParticipantSearcher({
    client: client as unknown as ConstructorParameters<typeof ParticipantSearcher>[0]['client'],
    governor,
    enumerator,
    onStateChange: (state) => {
      emitSearchState(currentWin, state)
    },
  })

  registerSearchChannels(currentWin, searcher, resolver)

  // ── Wire AuditStore ───────────────────────────────────────────────────────
  // Production store: lazy-requires node:fs + electron.app (no side effects at module parse).
  const auditStore = createAuditStore()

  // ── Wire RemovalExecutor ──────────────────────────────────────────────────
  // Shares the same client, governor, enumerator, resolver, and auditStore.
  // onStateChange pushes RemovalState updates to the renderer via emitRemovalState.
  // Target is read from resolver.getResolvedUser() in main process only (T-05-04-B).
  const executor = new RemovalExecutor({
    client: client as unknown as ConstructorParameters<typeof RemovalExecutor>[0]['client'],
    governor,
    enumerator,
    resolver,
    auditStore,
    onStateChange: (state) => {
      emitRemovalState(currentWin, state)
    },
  })

  registerRemovalChannels(currentWin, executor, enumerator, auditStore, () => sm.getAuthState())

  // ── On-launch job-file detection (Resume/Discard) ─────────────────────────
  // Read the job file BEFORE sm.initialize() so the pending state is available
  // the moment the renderer first calls removal:getJob on launch.
  // No silent auto-resume: renderer shows ResumeJobDialog when getRemovalJob() returns
  // a non-complete job; user explicitly chooses Resume or Discard.
  // (The job data is on disk; the executor reads it on demand — no init needed here.)
  const _pendingJob = auditStore.readJob()
  if (_pendingJob && _pendingJob.status !== 'complete') {
    // Job file exists and is incomplete — renderer will detect this via removal:getJob.
    // Log for diagnostics; no other action needed at this point.
    console.log('[main] Incomplete removal job detected on launch — resumable via renderer')
  }

  // CR-01-MAIN: registerTargetChannels receives executor so TARGET_RESET aborts removal first (Phase 5).
  // Order: executor.abortExecution() → searcher.abortSearch() → scanner.abortScan() → resolver.reset()
  // Removal abort precedes scan/resolver reset so a mid-run removal is safely checkpointed first.
  registerTargetChannels(currentWin, resolver, scanner, searcher, executor)

  // ── Restore session on launch ─────────────────────────────────────────────
  // savedSession is either a live StringSession string or ''.
  // initialize() will connect + checkAuthorization; wipe + route to idle on dead session.
  await sm.initialize(savedSession || undefined)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Rebind the push-event target to the freshly created window (WR-03).
      currentWin = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
