// Credentials injected at build time via electron-vite define (D-04, AUTH-03).
// These values come from an untracked .env file (NEVER committed to source).
// The renderer bundle NEVER receives these — define is applied to the MAIN bundle only.
// See electron.vite.config.ts main.define section.
export const API_ID = Number(import.meta.env.MRPROPER_API_ID)
export const API_HASH = import.meta.env.MRPROPER_API_HASH as string
