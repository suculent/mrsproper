import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { config as loadDotenv } from 'dotenv'

// Load .env (gitignored) at build time so MRPROPER_API_ID/MRPROPER_API_HASH
// are available in process.env for the define substitution below (D-04, AUTH-03).
loadDotenv()

// ── Production CSP (review WR-02) ───────────────────────────────────────────
// The packaged app loads the renderer via loadFile (file://), where header-based
// CSP injection (webRequest.onHeadersReceived in src/main/index.ts) is unreliable —
// file:// documents have no real HTTP response headers. Per Electron security
// guidance, file-loaded content must carry its CSP in a <meta http-equiv> tag.
// This plugin injects the strict CSP into index.html at BUILD time only; the dev
// server keeps the relaxed header-based CSP (HMR needs unsafe-inline/unsafe-eval).
// MUST stay in sync with the production `csp` string in src/main/index.ts.
const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"

function injectProductionCsp(): Plugin {
  return {
    name: 'inject-production-csp',
    apply: 'build', // build only — never applied by the dev server
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: PRODUCTION_CSP,
            },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
    define: {
      'import.meta.env.MRPROPER_API_ID': JSON.stringify(process.env.MRPROPER_API_ID),
      'import.meta.env.MRPROPER_API_HASH': JSON.stringify(process.env.MRPROPER_API_HASH),
    },
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve('src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve('src/preload/index.ts'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react(), injectProductionCsp()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
})
