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
import { registerTagChannels, emitTagState } from './ipc/tagChannels'
import { TagExecutor } from './telegram/TagExecutor'
import { createTagAuditStore } from './storage/tagAuditStore'
import { registerSeverityChannels } from './ipc/severityChannels'
import { registerLanguageChannels, preloadLanguageCache, getEffectiveLanguage } from './ipc/languageChannels'
import { registerThemeChannels, getStoredTheme } from './ipc/themeChannels'
import { ParticipantSearcher } from './telegram/ParticipantSearcher'
import { AddExecutor } from './telegram/AddExecutor'
import { createAddAuditStore } from './storage/addAuditStore'
import { createAddLogStore } from './storage/addLogStore'
import { createContactService } from './telegram/contactService'
import { registerAddChannels, emitAddState } from './ipc/addChannels'
import { registerClipboardChannels } from './ipc/clipboardChannels'
import {
  registerTemplateChannels,
  renderTemplate,
  DEFAULT_TEMPLATE_EN,
  DEFAULT_TEMPLATE_CS,
  preloadTemplateCache,
  getCachedTemplate,
} from './ipc/templateChannels'
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
  // CR-02 (Phase 8 review): seed the persisted theme preference into nativeTheme
  // BEFORE createWindow(). Without this, themeSource stays 'system' at launch, so:
  //   1. createWindow() paints backgroundColor from the OS theme (wrong-theme flash),
  //   2. syncRendererTheme re-asserts the OS theme on did-finish-load, racing the
  //      renderer's own stored-pref toggle (main.tsx), and
  //   3. OS theme changes mid-session silently revert the user's explicit choice.
  // With themeSource seeded, nativeTheme.shouldUseDarkColors follows the stored
  // preference everywhere (backgroundColor, syncRendererTheme, 'updated' events),
  // so main and renderer share one source of truth. When no preference is stored
  // (null), themeSource stays 'system' and the OS appearance applies.
  try {
    const storedTheme = await getStoredTheme()
    if (storedTheme === 'light' || storedTheme === 'dark') {
      nativeTheme.themeSource = storedTheme
    }
  } catch (err) {
    // Non-fatal: fall back to OS theme rather than blocking launch.
    console.error('[main] Failed to read stored theme preference:', err)
  }

  // Audit W1 (ADD-16): renderer main.tsx invokes language:setDetected on load, which can
  // race ahead of a late registration. Register before the window exists.
  registerLanguageChannels()

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

  // Phase 6 flood plumbing: forward reference so executor._handleGovernorEvent
  // can be called from inside governor.onEvent. The executor is constructed after
  // the governor, so a mutable reference initialized before governor construction
  // is the cleanest forward-reference pattern without restructuring the setup order.
  let executorRef: import('./telegram/RemovalExecutor').RemovalExecutor | null = null
  let tagExecutorRef: TagExecutor | null = null
  let addExecutorRef: AddExecutor | null = null

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
      // Phase 6: forward flood events to the executor when a removal run is active.
      // _handleGovernorEvent is a no-op when _runActive is false (T-06-02-04 isolation).
      executorRef?._handleGovernorEvent(event)
      tagExecutorRef?._handleGovernorEvent(event)
      addExecutorRef?._handleGovernorEvent(event)
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

  registerSearchChannels(currentWin, searcher, resolver, () => addExecutorRef?.getState().step ?? 'idle')

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

  registerRemovalChannels(currentWin, executor, enumerator, auditStore, () => sm.getState())

  // ── Wire TagAuditStore ────────────────────────────────────────────────────────
  // Production store: lazy-requires node:fs + electron.app (no side effects at module parse).
  const tagAuditStore = createTagAuditStore()

  // ── Wire TagExecutor ───────────────────────────────────────────────────────
  // Shares the same client, governor, enumerator, resolver, and auditStore as
  // RemovalExecutor — the whole GramJS package now speaks TL layer 229 ambiently, so no
  // second client or TL-layer isolation is needed for tag writes (D-10, TAG-07).
  const tagExecutor = new TagExecutor({
    client: client as unknown as ConstructorParameters<typeof TagExecutor>[0]['client'],
    governor,
    enumerator,
    resolver,
    auditStore: tagAuditStore,
    onStateChange: (state) => emitTagState(currentWin, state),
  })
  tagExecutorRef = tagExecutor
  registerTagChannels(currentWin, tagExecutor, enumerator, tagAuditStore, () => sm.getState())

  // ── Wire AddAuditStore ────────────────────────────────────────────────────
  // Production store: lazy-requires node:fs + electron.app (no side effects at module parse).
  const addAuditStore = createAddAuditStore()

  // ── Wire AddLogStore ──────────────────────────────────────────────────────
  // Production store: lazy-requires node:fs + electron.app (no side effects at module parse).
  const addLogStore = createAddLogStore()

  // ── Wire contact service (ADD-05 main half) ───────────────────────────────
  // Shares the same client, governor, and resolver as everything else — single account-wide
  // governor, single shared client, one serial queue (WR-01).
  const contactService = createContactService({
    client: client as unknown as Parameters<typeof createContactService>[0]['client'],
    governor,
    resolver,
  })

  // ── Wire the DM template preference (D-15) ────────────────────────────────
  // preloadTemplateCache() warms the synchronous cache BEFORE any AddExecutor.execute() can
  // run — DmTextProvider is a synchronous function, but electron-store access is async.
  await preloadTemplateCache()
  await preloadLanguageCache()
  const getDmText = (vars: { name: string; links: string }): string =>
    renderTemplate(
      getCachedTemplate() ??
        (getEffectiveLanguage() === 'cs' ? DEFAULT_TEMPLATE_CS : DEFAULT_TEMPLATE_EN),
      vars
    )

  // ── Wire AddExecutor ───────────────────────────────────────────────────────
  // Shares the same client, governor, enumerator, scanner, and resolver as
  // Removal/Tag — the whole GramJS package speaks TL layer 229 ambiently, so no
  // second client or TL-layer isolation is needed for add writes (D-01).
  const addExecutor = new AddExecutor({
    client: client as unknown as ConstructorParameters<typeof AddExecutor>[0]['client'],
    governor,
    enumerator,
    scanner,
    resolver,
    auditStore: addAuditStore,
    addLogStore,
    getDmText,
    onStateChange: (state) => emitAddState(currentWin, state),
  })
  addExecutorRef = addExecutor
  registerAddChannels(
    currentWin,
    addExecutor,
    enumerator,
    addAuditStore,
    contactService,
    addLogStore,
    () => sm.getState()
  )
  registerTemplateChannels()
  registerClipboardChannels(() => sm.getState())

  // Phase 6: assign executorRef so governor.onEvent can call _handleGovernorEvent
  executorRef = executor

  // Phase 6: register severity preference IPC handlers (kick/ban toggle, electron-store)
  registerSeverityChannels()

  // Phase 8: register language and theme preference IPC handlers (LOC-01)
  registerThemeChannels()

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

  // ── On-launch tag-job detection (Resume/Discard) ──────────────────────────
  // Independent of removal-job detection; both can fire simultaneously (RESEARCH.md Pitfall 6).
  const _pendingTagJob = tagAuditStore.readJob()
  if (_pendingTagJob && _pendingTagJob.status !== 'complete') {
    console.log('[main] Incomplete tag job detected on launch — resumable via renderer')
  }

  // ── On-launch add-job detection (Resume/Discard) ──────────────────────────
  // Independent of removal-job/tag-job detection; all three can fire simultaneously.
  const _pendingAddJob = addAuditStore.readJob()
  if (_pendingAddJob && _pendingAddJob.status !== 'complete') {
    console.log('[main] Incomplete add job detected on launch — resumable via renderer')
  }

  // CR-01-MAIN: registerTargetChannels receives executor so TARGET_RESET aborts removal first (Phase 5).
  // CR-03 (Phase 11): also receives tagExecutor so TARGET_RESET aborts any active tag run before
  // the target is cleared — without this, a tag run continues tagging the old (now-cleared) target.
  // T-14-19 (Phase 14): also receives addExecutor so TARGET_RESET aborts any active add run first.
  // Order: executor.abortExecution() → tagExecutor.abortExecution() → addExecutor.abortExecution()
  //        → searcher → scanner → resolver.reset()
  registerTargetChannels(currentWin, resolver, scanner, searcher, executor, tagExecutor, addExecutor)

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
