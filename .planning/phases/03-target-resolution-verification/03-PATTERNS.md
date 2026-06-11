# Phase 3: Target Resolution & Verification — Pattern Map

**Mapped:** 2026-06-11
**Files analyzed:** 11 new/modified files
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/shared/targetTypes.ts` | model | — | `src/shared/authTypes.ts` | exact |
| `src/shared/channels.ts` | config | — | `src/shared/channels.ts` (self — extend) | exact |
| `src/shared/opTypes.ts` | model | — | `src/shared/opTypes.ts` (self — extend) | exact |
| `src/main/telegram/TargetResolver.ts` | service | request-response | `src/main/telegram/SessionManager.ts` | exact |
| `src/main/telegram/__mocks__/telegramClient.ts` | utility | — | `src/main/telegram/__mocks__/telegramClient.ts` (self — extend) | exact |
| `src/main/ipc/targetChannels.ts` | middleware | request-response | `src/main/ipc/authChannels.ts` | exact |
| `src/main/telegram/operationErrors.ts` | utility | — | `src/main/telegram/operationErrors.ts` (self — extend) | exact |
| `src/renderer/ipc/targetClient.ts` | utility | request-response | `src/renderer/ipc/authClient.ts` | exact |
| `src/renderer/store/targetStore.ts` | store | event-driven | `src/renderer/store/authStore.ts` | exact |
| `src/renderer/target/TargetInput.tsx` | component | request-response | `src/renderer/auth/PhoneStep.tsx` | exact |
| `src/renderer/target/TargetCard.tsx` | component | request-response | `src/renderer/shell/IdentityDisplay.tsx` + `src/renderer/shell/LogoutDialog.tsx` | role-match |
| `src/renderer/target/resolveCopy.ts` | utility | — | `src/renderer/auth/errorCopy.ts` | exact |
| `src/renderer/shell/StubbedWorkflowRegions.tsx` | component | — | self (partial replace) | exact |
| `src/preload/index.ts` | middleware | — | self (extend) | exact |

> Note: `KeepOrRemoveDialog.tsx` is **out of scope** per D-07 (REVISED) — `contacts.ResolvePhone` is used instead of `contacts.ImportContacts`, so no contact-import dialog, keep/remove flow, or cleanup path exists in Phase 3.

---

## Pattern Assignments

### `src/shared/targetTypes.ts` (model)

**Analog:** `src/shared/authTypes.ts`

**Discriminated union pattern** (`src/shared/authTypes.ts`, lines 29–37):
```typescript
export type AuthState =
  | { step: 'idle' }
  | { step: 'sendingCode' }
  | { step: 'needCode'; sentTo: string; canResend: boolean }
  | { step: 'verifying' }
  | { step: 'needPassword'; hint?: string }
  | { step: 'authorized'; identity: Identity }
  | { step: 'error'; code: AuthErrorCode; retryStep: 'phone' | 'code' | 'password' }
  | { step: 'floodWait'; retryStep: 'phone' | 'code' | 'password'; secondsRemaining: number }
```

**DTO interface pattern** (`src/shared/authTypes.ts`, lines 5–11):
```typescript
export interface Identity {
  name: string
  username: string | null
  id: string
  avatar: Uint8Array | null
}
```

**Apply for Phase 3:** Model `TargetState` as a discriminated union with steps `idle | resolving | resolved | confirmed | error`. Model `ResolvedTargetDTO` as an interface containing only renderer-safe fields (no `accessHash`). Model `TargetErrorCode` as a string union.

---

### `src/shared/channels.ts` (config — extend existing)

**Analog:** `src/shared/channels.ts` (self)

**Channel constant pattern** (`src/shared/channels.ts`, lines 1–29):
```typescript
export const AUTH_SUBMIT_PHONE = 'auth:submitPhone' as const
// ...
export const OP_GOVERNOR_EVENT = 'op:governorEvent' as const

export const CHANNELS = {
  AUTH_SUBMIT_PHONE,
  // ...
  OP_GOVERNOR_EVENT,
} as const
```

**Apply for Phase 3:** Add `TARGET_RESOLVE`, `TARGET_CONFIRM`, `TARGET_RESET`, `TARGET_GET_STATE`, `TARGET_STATE` constants following the same `'target:*'` namespace pattern. Extend the `CHANNELS` object.

---

### `src/shared/opTypes.ts` (model — extend existing)

**Analog:** `src/shared/opTypes.ts` (self)

**Extension comment pattern** (`src/shared/opTypes.ts`, lines 28–29):
```typescript
export type OperationErrorCode =
  | 'FLOOD_WAIT'
  | 'PEER_FLOOD'
  | 'SESSION_INVALID'
  | 'NETWORK'
  | 'UNKNOWN'
// Phase 5 extends this with: USER_PRIVACY_RESTRICTED, CHAT_ADMIN_REQUIRED, etc.
```

**Apply for Phase 3:** Extend `OperationErrorCode` with `'TARGET_USERNAME_NOT_FOUND' | 'TARGET_PHONE_NOT_FOUND' | 'TARGET_NO_PUBLIC_PROFILE'` as additional union members. Remove the Phase 5 comment and replace with a Phase 6 forward reference.

---

### `src/main/telegram/TargetResolver.ts` (service, request-response)

**Analog:** `src/main/telegram/SessionManager.ts`

**Class structure and governor composition** (`src/main/telegram/SessionManager.ts`, lines 120–153):
```typescript
export class SessionManager {
  private readonly _client: SessionManagerClient
  private readonly _storage: SessionManagerStorage
  private readonly _emit: (state: AuthState) => void
  private readonly _governor: RateLimitGovernor

  private _currentState: AuthState = { step: 'idle' }

  constructor(options: SessionManagerOptions) {
    this._client = options.client
    this._storage = options.storage
    this._emit = (state) => {
      this._currentState = state
      options.onStateChange(state)
    }
    this._governor = new RateLimitGovernor({
      client: options.client,
      onEvent: options.onGovernorEvent,
    })
  }

  getState(): AuthState {
    return this._currentState
  }
```

**Governor-wrapped API call pattern — avatar download with empty-buffer guard** (`src/main/telegram/SessionManager.ts`, lines 402–418):
```typescript
private async _fetchIdentity(): Promise<Identity> {
  const me = await this._governor.run(() => this._client.getMe()) as ...
  const photo = await this._governor.run(() => this._client.downloadProfilePhoto(me))

  const name = [me.firstName, me.lastName].filter(Boolean).join(' ').trim() || me.firstName || ''
  const avatar =
    photo && (photo as Buffer | Uint8Array).length > 0
      ? new Uint8Array(photo as Buffer | Uint8Array)
      : null

  return {
    name,
    username: me.username ?? null,
    id: me.id.toString(),
    avatar,
  }
}
```

**Apply for Phase 3:**
- `TargetResolver` is a sibling class to `SessionManager` — same injectable constructor pattern (`client`, `onStateChange`, `onGovernorEvent`).
- Internal `_currentState: TargetState` with `getState()` accessor.
- `_governor.run(() => this._client.invoke(...))` for all three resolution API calls: `contacts.ResolvePhone`, `users.GetFullUser` (graceful), `downloadProfilePhoto` (empty-buffer guard → `null`).
- `accessHash` stored only in `TargetResolver`'s private state — never included in the emitted `TargetState`.
- Phone lookup uses `contacts.ResolvePhone` (D-07 REVISED): `client.invoke(new Api.contacts.ResolvePhone({ phone: e164 }))`. On error `PHONE_NOT_OCCUPIED`, emit `TARGET_PHONE_NOT_FOUND`.
- Username lookup uses direct `client.invoke(new Api.contacts.ResolveUsername({ username }))` — NOT `client.getEntity()` (RESEARCH Pattern 1).
- Bio fetch wrapped in `try/catch`; `bio = null` on any failure (RESEARCH Pitfall 5).
- `user.id.toString()` for all serialization; never `Number(user.id)` (RESEARCH Pattern 4).

---

### `src/main/telegram/operationErrors.ts` (utility — extend existing)

**Analog:** `src/main/telegram/operationErrors.ts` (self)

**Extension point pattern** (`src/main/telegram/operationErrors.ts`, lines 74–125):
```typescript
export function classifyRpcError(err: unknown): ClassifiedOperationError {
  const errorMessage: string =
    (err as { errorMessage?: string })?.errorMessage ?? ''

  if (errorMessage === 'PEER_FLOOD') {
    return { code: 'PEER_FLOOD', disposition: 'hard-stop' }
  }
  // ... flood wait, session invalid, network ...
  return { code: 'UNKNOWN', disposition: 'fail' }
}
```

**Apply for Phase 3:** Add a new branch before the final `UNKNOWN` fallback:
```typescript
if (errorMessage === 'USERNAME_NOT_OCCUPIED') {
  return { code: 'TARGET_USERNAME_NOT_FOUND', disposition: 'fail' }
}
if (errorMessage === 'PHONE_NOT_OCCUPIED') {
  return { code: 'TARGET_PHONE_NOT_FOUND', disposition: 'fail' }
}
```
Note: `TARGET_PHONE_NOT_FOUND` can also be produced as a logic-level error by `TargetResolver` directly (when `contacts.ResolvePhone` itself throws `PHONE_NOT_OCCUPIED`), not only via `classifyRpcError`.

---

### `src/main/telegram/__mocks__/telegramClient.ts` (utility — extend existing)

**Analog:** `src/main/telegram/__mocks__/telegramClient.ts` (self)

**MockRPCErrorCode union and makeRPCError pattern** (lines 19–43):
```typescript
export type MockRPCErrorCode =
  | 'SESSION_PASSWORD_NEEDED'
  | 'PHONE_CODE_INVALID'
  // ...
  | { type: 'FLOOD_WAIT'; seconds: number }

function makeRPCError(code: MockRPCErrorCode): Error & { errorMessage: string; seconds?: number } {
  if (typeof code === 'object' && code.type === 'FLOOD_WAIT') { ... }
  const codeStr = code as string
  const err = new Error(codeStr) as Error & { errorMessage: string }
  err.errorMessage = codeStr
  return err
}
```

**invoke dispatch by constructor name** (lines 126–146):
```typescript
invoke: async (request: unknown): Promise<unknown> => {
  const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''
  if (ctorName === 'SignIn' || (request as { className?: string })?.className === 'auth.SignIn') {
    if (config.signInError) { throw makeRPCError(config.signInError) }
    return { ... }
  }
  return {}
},
```

**Apply for Phase 3:** Extend `MockRPCErrorCode` with `'USERNAME_NOT_OCCUPIED' | 'PHONE_NOT_OCCUPIED' | 'TARGET_NO_PUBLIC_PROFILE'`. Extend `MockClientConfig` with fields for resolution scenarios (`resolveUsernameResult`, `resolvePhoneResult`, `resolveUsernameError`, `resolvePhoneError`, `getFullUserResult`, `getFullUserError`). Extend the `invoke` dispatch to handle `ctorName === 'ResolveUsername'`, `ctorName === 'ResolvePhone'`, and `ctorName === 'GetFullUser'`.

---

### `src/main/ipc/targetChannels.ts` (middleware, request-response)

**Analog:** `src/main/ipc/authChannels.ts`

**File header security comment pattern** (`src/main/ipc/authChannels.ts`, lines 1–15):
```typescript
/**
 * IPC handler registrations for the auth flow — the ONLY renderer surface.
 *
 * Security (V5 / T-04-02):
 *   - Every inbound IPC payload is zod-validated BEFORE delegating to SessionManager.
 *   - Malformed payloads are rejected with a typed error state — they never reach GramJS.
 *   - Handlers return serializable DTOs only (AuthState, LogoutResult) — never GramJS objects.
 */
```

**Zod schema + ipcMain.handle pattern** (`src/main/ipc/authChannels.ts`, lines 34–107):
```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { SessionManager } from '../telegram/SessionManager'
import { AUTH_SUBMIT_PHONE, AUTH_STATE, ... } from '@shared/channels'
import type { AuthState } from '@shared/authTypes'

const SubmitPhoneSchema = z.object({
  dialCode: z.string().min(1),
  national: z.string().min(1),
})

export function registerAuthChannels(win: BrowserWindow, sm: SessionManager): void {
  ipcMain.handle(AUTH_SUBMIT_PHONE, async (_event, payload: unknown) => {
    const parsed = SubmitPhoneSchema.parse(payload)
    await sm.submitPhone(parsed)
    return sm.getState()
  })
  // ...
}
```

**Push emitter helper pattern** (`src/main/ipc/authChannels.ts`, lines 109–129):
```typescript
export function emitAuthState(win: BrowserWindow, state: AuthState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(AUTH_STATE, state)
  }
}
```

**Apply for Phase 3:** `registerTargetChannels(win, resolver)` with Zod-validated handlers for `TARGET_RESOLVE` (payload: `{ input: string }`), `TARGET_CONFIRM` (no payload), `TARGET_RESET` (no payload), `TARGET_GET_STATE` (returns `TargetState`). Add `emitTargetState` push helper following the same `win.isDestroyed()` guard.

---

### `src/renderer/ipc/targetClient.ts` (utility, request-response)

**Analog:** `src/renderer/ipc/authClient.ts`

**Window type declaration + named export pattern** (`src/renderer/ipc/authClient.ts`, lines 1–55):
```typescript
import type { AuthState, FloodTick, LogoutResult } from '@shared/authTypes'

declare global {
  interface Window {
    mrproper: {
      submitPhone(p: { dialCode: string; national: string }): Promise<AuthState>
      // ...
      onAuthState(cb: (s: AuthState) => void): () => void
      onFloodTick(cb: (t: FloodTick) => void): () => void
    }
  }
}

export const authClient = {
  submitPhone(dialCode: string, national: string): Promise<AuthState> {
    return window.mrproper.submitPhone({ dialCode, national })
  },
  // ...
  onAuthState(cb: (s: AuthState) => void): () => void {
    return window.mrproper.onAuthState(cb)
  },
}
```

**Apply for Phase 3:** Extend the `window.mrproper` declaration with `resolveTarget`, `confirmTarget`, `resetTarget`, `getTargetState`, `onTargetState`. Export a `targetClient` object with the same thin-wrapper pattern. The `window.mrproper` declaration is extended (not replaced) — this file adds to the existing interface augmentation.

---

### `src/preload/index.ts` (middleware — extend existing)

**Analog:** `src/preload/index.ts` (self)

**contextBridge pattern** (`src/preload/index.ts`, lines 7–27):
```typescript
contextBridge.exposeInMainWorld('mrproper', {
  submitPhone: (p: { dialCode: string; national: string }) =>
    ipcRenderer.invoke('auth:submitPhone', p),
  // ...
  onAuthState: (cb: (s: AuthState) => void): (() => void) => {
    const h = (_: unknown, s: AuthState): void => cb(s)
    ipcRenderer.on('auth:state', h)
    return () => ipcRenderer.removeListener('auth:state', h)
  },
})
```

**Apply for Phase 3:** Add `resolveTarget`, `confirmTarget`, `resetTarget`, `getTargetState` as `ipcRenderer.invoke(...)` calls, and `onTargetState` as an `ipcRenderer.on(...)` subscription (same cleanup-returning-function pattern). All additions go inside the same `contextBridge.exposeInMainWorld('mrproper', { ... })` call. Import `TargetState` from `@shared/targetTypes`.

---

### `src/renderer/store/targetStore.ts` (store, event-driven)

**Analog:** `src/renderer/store/authStore.ts`

**useSyncExternalStore external store pattern** (`src/renderer/store/authStore.ts`, lines 1–144):
```typescript
import { useSyncExternalStore } from 'react'
import type { AuthState } from '@shared/authTypes'
import { authClient } from '@renderer/ipc/authClient'

interface AuthStoreState {
  auth: AuthState
  floodRemaining: number
}

type Listener = () => void
let currentState: AuthStoreState = { auth: { step: 'idle' }, floodRemaining: 0 }
const listeners = new Set<Listener>()

function notify(): void { for (const l of listeners) l() }
function setState(next: Partial<AuthStoreState>): void {
  currentState = { ...currentState, ...next }
  notify()
}

let authUnsub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++
  authUnsub = authClient.onAuthState((s: AuthState) => { setState({ auth: s }) })
  void authClient.getAuthState().then((s) => setState({ auth: s }))
}

function subscribe(listener: Listener): () => void {
  if (listeners.size === 0) startSubscriptions()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopSubscriptions()
  }
}

export function useAuthStore(): AuthStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export const authActions = {
  async submitPhone(dialCode: string, national: string): Promise<void> {
    try {
      const s = await authClient.submitPhone(dialCode, national)
      setState({ auth: s })
    } catch (err) {
      console.error('[authStore] submitPhone error:', err)
    }
  },
  // ...
}
```

**Apply for Phase 3:** `targetStore.ts` is a structural copy of `authStore.ts`:
- State shape: `{ target: TargetState; governorFloodRemaining: number }`.
- Bootstrap via `targetClient.getTargetState()`.
- Subscribe to `targetClient.onTargetState(...)` for push updates.
- Subscribe to `targetClient.onGovernorEvent(...)` (the existing `OP_GOVERNOR_EVENT` channel) for `flood-tick` events — extract `remaining` and set `governorFloodRemaining`.
- Export `useTargetStore()` hook and `targetActions` object (`resolveTarget`, `confirmTarget`, `resetTarget`).
- Same ref-counting pattern for lazy subscription start/stop.

---

### `src/renderer/target/TargetInput.tsx` (component, request-response)

**Analog:** `src/renderer/auth/PhoneStep.tsx`

**Imports pattern** (`src/renderer/auth/PhoneStep.tsx`, lines 1–17):
```typescript
import React, { useState, useCallback } from 'react'
import { isValidPhoneNumber } from 'libphonenumber-js/min'
import type { CountryCode } from 'libphonenumber-js/min'
import { Loader2, AlertCircle } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import CountryPicker, { DEFAULT_COUNTRY, type CountryOption } from './CountryPicker'
import { INVALID_PHONE_FORMAT_COPY, getErrorCopy } from './errorCopy'
import FloodCountdown from './FloodCountdown'
import type { AuthState } from '@shared/authTypes'
import { authActions } from '@renderer/store/authStore'
import { cn } from '@renderer/lib/utils'
```

**Local error + server error merge pattern** (`src/renderer/auth/PhoneStep.tsx`, lines 35–38):
```typescript
const serverError =
  authState.step === 'error' && authState.retryStep === 'phone'
    ? getErrorCopy(authState.code)
    : null
const displayError = localError ?? serverError
```

**Inline error rendering pattern** (`src/renderer/auth/PhoneStep.tsx`, lines 111–120):
```typescript
{displayError && (
  <p
    id="phone-error"
    className="flex items-center gap-1 text-label text-destructive"
    role="alert"
  >
    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
    {displayError}
  </p>
)}
```

**Spinner-on-button + flood countdown pattern** (`src/renderer/auth/PhoneStep.tsx`, lines 124–143):
```typescript
<Button type="submit" className="w-full" disabled={disabled} ...>
  {isProcessing ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      Send code
    </>
  ) : isFlood ? (
    <>
      Try again in{' '}
      <FloodCountdown remaining={floodRemaining} />
    </>
  ) : (
    'Send code'
  )}
</Button>
```

**Country picker composition** (`src/renderer/auth/PhoneStep.tsx`, lines 87–100):
```typescript
<div className="flex items-center gap-2">
  <CountryPicker value={country} onChange={handleCountryChange} disabled={disabled} />
  <Input id="national-number" type="tel" ... className={cn('flex-1', hasError && 'border-destructive ...')} />
</div>
```

**Apply for Phase 3:** `TargetInput.tsx` uses the same structure as `PhoneStep.tsx`. Key differences:
- Single smart input instead of country+national split. Mode detection runs `onChange` (no API call).
- Country chip (`CountryPicker`) rendered to the LEFT of the input only when mode is `phone-bare-digits`.
- Phone-mode disclosure hint rendered below the input when mode is phone (muted `text-label` line, no `role="alert"`).
- Find button label: "Find person" (not "Send code"). FLOOD_WAIT label: "Try again in {mm:ss}".
- Error codes come from `TargetErrorCode` / `resolveCopy.ts`, not `AuthErrorCode` / `errorCopy.ts`.
- Reads state from `useTargetStore()` / dispatches via `targetActions.resolveTarget(input)`.

---

### `src/renderer/target/TargetCard.tsx` (component, request-response)

**Analog A (avatar + identity display):** `src/renderer/shell/IdentityDisplay.tsx`

**bytesToDataUrl + getInitials utilities** (`src/renderer/shell/IdentityDisplay.tsx`, lines 16–33):
```typescript
function bytesToDataUrl(bytes: Uint8Array | null): string | null {
  if (!bytes || bytes.length === 0) return null
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  const b64 = btoa(binary)
  return `data:image/jpeg;base64,${b64}`
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
```

**Avatar with fallback pattern** (`src/renderer/shell/IdentityDisplay.tsx`, lines 43–57):
```typescript
<Avatar className={cn('h-12 w-12 shrink-0', 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>
  {avatarUrl ? (
    <AvatarImage src={avatarUrl} alt={`${identity.name}'s avatar`} />
  ) : null}
  <AvatarFallback className="bg-secondary text-secondary-foreground text-sm font-semibold">
    {initials}
  </AvatarFallback>
</Avatar>
```

**Analog B (confirm dialog pattern):** `src/renderer/shell/LogoutDialog.tsx`

**Alert banner pattern** (`src/renderer/shell/LogoutDialog.tsx`, lines 78–91):
```typescript
{serverRevoked === false && (
  <Alert variant="destructive" className="bg-destructive/10 border-destructive/30" role="alert" aria-live="assertive">
    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
    <AlertDescription className="text-body">...</AlertDescription>
  </Alert>
)}
```

**Apply for Phase 3:** `TargetCard.tsx` reuses `bytesToDataUrl` and `getInitials` verbatim from `IdentityDisplay.tsx` (or imports them if extracted to a shared util). Avatar is 64px (`h-16 w-16`) not 48px. The `AvatarFallback` uses the deterministic `AVATAR_COLORS[id % 7]` palette (inline style for the dynamic fill color) with white semibold initials. A deleted account with no name shows a lucide `Ghost` icon instead of initials. The no-photo `Alert` (informational, not destructive) appears below the identity stack when `avatar === null`. The confirm-gate button row ("Yes, this is the person" / "Change target") follows the `DialogFooter` button layout pattern from `LogoutDialog.tsx`.

---

### `src/renderer/target/resolveCopy.ts` (utility)

**Analog:** `src/renderer/auth/errorCopy.ts`

**Record<ErrorCode, string> + getErrorCopy pattern** (`src/renderer/auth/errorCopy.ts`, lines 1–38):
```typescript
import type { AuthErrorCode } from '@shared/authTypes'

export const ERROR_COPY: Record<AuthErrorCode, string> = {
  PHONE_NUMBER_INVALID: "Telegram didn't recognize that number. ...",
  // ...
  UNKNOWN: 'Something went wrong. Please try again.',
}

export function getErrorCopy(code: AuthErrorCode): string {
  return ERROR_COPY[code] ?? ERROR_COPY.UNKNOWN
}

export const INVALID_PHONE_FORMAT_COPY =
  "That phone number doesn't look right. ..."
```

**Apply for Phase 3:** `resolveCopy.ts` is a direct structural copy of `errorCopy.ts` using `TargetErrorCode` instead of `AuthErrorCode`. Export `RESOLVE_ERROR_COPY: Record<TargetErrorCode, string>`, `getResolveCopy(code)`, and named constants for client-side validation strings (`INVALID_USERNAME_FORMAT_COPY`, `INVALID_PHONE_FORMAT_COPY`). Also export non-error string constants: `PHONE_MODE_DISCLOSURE_HINT`, section heading/hint, card copy strings (kicker, numeric ID tooltip, no-photo notice). All UI-SPEC copy from `03-UI-SPEC.md` §Copywriting lives here — no string literals in components.

---

### `src/renderer/shell/StubbedWorkflowRegions.tsx` (component — partial replace)

**Analog:** `src/renderer/shell/StubbedWorkflowRegions.tsx` (self)

**Stub region pattern** (lines 10–21):
```typescript
<section
  className="rounded-lg border border-dashed border-border bg-secondary/40 p-8 text-center"
  aria-label="Target search area — coming soon"
>
  <h2 className="text-heading text-muted-foreground mb-2">Nothing to clean up yet</h2>
  <p className="text-body text-muted-foreground">Target search ...</p>
</section>
```

**Apply for Phase 3:** The first `<section>` (target-input area) is REPLACED by the real `<TargetInput>` / `<TargetCard>` components. The second `<section>` (group-list area) is LEFT UNCHANGED — its copy "Your groups will appear here once a target is selected." is already accurate. After the replacement, `StubbedWorkflowRegions.tsx` is either deleted (if it becomes trivially thin) or renamed/inlined into the shell.

---

## Shared Patterns

### Governor-Wrapped API Call
**Source:** `src/main/telegram/SessionManager.ts` (`_fetchIdentity`, lines 402–418)
**Apply to:** All three API calls in `TargetResolver.ts` (`contacts.ResolvePhone`, `users.GetFullUser`, `downloadProfilePhoto`)
```typescript
const result = await this._governor.run(() =>
  this._client.invoke(new Api.contacts.ResolvePhone({ phone: e164 }))
)
```
Never call `this._client.invoke(...)` directly — always via `this._governor.run(...)`.

### accessHash Security Boundary
**Source:** `src/shared/authTypes.ts` `Identity` interface (no accessHash field) + `SessionManager.ts` (accessHash never in `Identity`)
**Apply to:** `TargetResolver.ts` (holds `accessHash` in private state) and `src/shared/targetTypes.ts` (`ResolvedTargetDTO` has no `accessHash` field)
The renderer DTO contains only `id: string` (bigint serialized as string). The `accessHash` is stored only in `TargetResolver`'s private `_resolvedUser` field for use in Phase 4.

### Inline Error Display
**Source:** `src/renderer/auth/PhoneStep.tsx` (lines 111–120) and `src/renderer/auth/CodeStep.tsx` (lines 118–130)
**Apply to:** `TargetInput.tsx`
```typescript
{displayError && (
  <p id="field-error" className="flex items-center gap-1 text-label text-destructive" role="alert">
    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
    {displayError}
  </p>
)}
```
Input gets `aria-invalid` + `border-destructive` + `focus-visible:ring-destructive` when `hasError`.

### Spinner-on-Button + Flood Countdown
**Source:** `src/renderer/auth/PhoneStep.tsx` (lines 124–143), `src/renderer/auth/FloodCountdown.tsx`
**Apply to:** `TargetInput.tsx` Find button
```typescript
{isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{label}</> 
  : isFlood ? <>Try again in <FloodCountdown remaining={governorFloodRemaining} /></>
  : label}
```
FLOOD_WAIT countdown source: `OP_GOVERNOR_EVENT` `flood-tick` events (first operational consumer — D-17). Subscribe in `targetStore.ts` alongside `onTargetState`.

### Zod IPC Payload Validation
**Source:** `src/main/ipc/authChannels.ts` (lines 34–46)
**Apply to:** `src/main/ipc/targetChannels.ts`
```typescript
const ResolveTargetSchema = z.object({ input: z.string().min(1) })
ipcMain.handle(TARGET_RESOLVE, async (_event, payload: unknown) => {
  const parsed = ResolveTargetSchema.parse(payload)
  await resolver.resolve(parsed.input)
  return resolver.getState()
})
```
Malformed payloads throw `ZodError` before touching `TargetResolver`.

### Push Channel Emitter with isDestroyed Guard
**Source:** `src/main/ipc/authChannels.ts` (lines 120–128)
**Apply to:** `emitTargetState` in `src/main/ipc/targetChannels.ts`
```typescript
export function emitTargetState(win: BrowserWindow, state: TargetState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(TARGET_STATE, state)
  }
}
```

### bigint → string Serialization
**Source:** `src/main/telegram/SessionManager.ts` line 416 (`me.id.toString()`)
**Apply to:** `TargetResolver.ts` — `user.id.toString()` for the DTO `id` field; `user.accessHash!.toString()` for the private stored hash. Reconstruct in Phase 4 with `BigInt(idStr)`.

---

## No Analog Found

None — all files have direct or role-match analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `src/main/`, `src/renderer/`, `src/shared/`, `src/preload/`
**Files scanned:** 27
**Pattern extraction date:** 2026-06-11
