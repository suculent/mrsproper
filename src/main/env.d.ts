/**
 * Type augmentation for electron-vite's ImportMetaEnv.
 * Declares the build-time injected Telegram API credentials (D-04, AUTH-03).
 * These are injected via electron.vite.config.ts main.define —
 * never available in the renderer or preload bundles.
 */

/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly MRSPROPER_API_ID: string
  readonly MRSPROPER_API_HASH: string
}
