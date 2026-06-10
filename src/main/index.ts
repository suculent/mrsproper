import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'

function createWindow(): void {
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

  // Apply dark mode class on first paint
  nativeTheme.on('updated', () => {
    const dark = nativeTheme.shouldUseDarkColors
    mainWindow.webContents.executeJavaScript(
      `document.documentElement.classList.toggle('dark', ${dark})`
    )
  })

  // Content-Security-Policy: allow only local bundle (no remote URLs - SSRF mitigation)
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';",
        ],
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
}

app.whenReady().then(() => {
  createWindow()

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
