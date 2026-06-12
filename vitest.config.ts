import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Vitest config aligned with the electron-vite/Vite toolchain (01-RESEARCH §Validation Architecture).
// Tests target plain Node/TS main-process logic with mocks — they MUST NOT launch Electron.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
})
