// MrsProperApi augmentation for the clipboard write bridge (Phase 15, ADD-13).
// Mirrors src/renderer/ipc/tagClient.ts — standard interface merging pattern.
// exportAddLog is NOT declared here — its typed renderer wrapper lives in
// Plan 15-07's addClient.ts, since export-log is conceptually an Add-mode
// action (see 15-06-PLAN.md objective).

declare global {
  interface MrsProperApi {
    writeClipboardText(text: string): Promise<{ ok: boolean }>
  }
}

export const clipboardClient = {
  writeClipboardText(text: string): Promise<{ ok: boolean }> {
    return window.mrsproper.writeClipboardText(text)
  },
}
