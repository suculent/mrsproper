import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react-swc'
import { config as loadDotenv } from 'dotenv'

// Load .env (gitignored) at build time so MRPROPER_API_ID/MRPROPER_API_HASH
// are available in process.env for the define substitution below (D-04, AUTH-03).
loadDotenv()

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
})
