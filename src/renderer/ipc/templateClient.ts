// MrsProperApi augmentation for the DM template preference bridge (Phase 14 main half,
// Plan 15-10 renderer half — ADD-16/ADD-12). Mirrors tagClient.ts's thin bridge-wrapper
// pattern: additive type declaration only, the runtime implementation already exists in
// the preload bridge; this file adds the renderer-side TypeScript type and a plain-object
// forwarder, same as the targetClient.ts contact-add precedent (Plan 15-05).

declare global {
  interface MrsProperApi {
    getDmTemplate(): Promise<string | null>
    setDmTemplate(template: string): Promise<string>
  }
}

export const templateClient = {
  getDmTemplate(): Promise<string | null> { return window.mrsproper.getDmTemplate() },
  setDmTemplate(template: string): Promise<string> { return window.mrsproper.setDmTemplate(template) },
}
