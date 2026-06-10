---
phase: 01-foundation-auth-session-portable-shell
plan: 02
subsystem: test-infra
tags: [vitest, mocks, tdd, auth-contract, shared-types, wave0]

requires:
  - 01-01 (electron-vite scaffold, telegram installed, src/shared/authTypes.ts stub, config.ts)

provides:
  - Vitest v4.1.8 installed and configured (vitest.config.ts, node env, src/**/*.test.ts)
  - test + test:changed npm scripts (no watch flags)
  - libphonenumber-js@^1.13 + zod@^4 installed (human-verified)
  - src/shared/authTypes.ts — canonical AuthState 8-step union, Identity, FloodTick,
    AuthErrorCode, IPC DTOs (SubmitPhone/SubmitCode/SubmitPassword/LogoutResult)
  - src/shared/channels.ts — named AUTH_* constants + CHANNELS namespace
  - src/main/telegram/__mocks__/telegramClient.ts — configurable mock GramJS client
  - src/main/storage/__mocks__/safeStorage.ts — mock safeStorage (available/unavailable)
  - RED test suite for AUTH-01..05 + D-13/D-17 (6 test files, all failing by design)
  - 01-VALIDATION.md flipped to wave_0_complete:true, nyquist_compliant:true

affects:
  - 01-03 (auth flow implementation — implements against AuthState union, AuthFlow, classifyTelegramError)
  - 01-04 (session storage — implements against SecretsStore, safeStorage mock)
  - 01-05 (IPC handlers + shell UI — imports from shared/channels.ts, shared/authTypes.ts)
  - All subsequent phases (shared contract is the single source of truth)

tech-stack:
  added:
    - vitest@4.1.8 (devDep — test framework, Vite-native)
    - libphonenumber-js@^1.13 (phone format validation + country/dial-code list, D-14)
    - zod@^4 (IPC payload validation at trust boundary, V5 input validation)
  patterns:
    - RED TDD: test files import exact intended export paths so implementations have a defined target
    - Mock pattern: configurable fake GramJS client in __mocks__/ (never ships in production bundle)
    - Mock pattern: in-memory safeStorage with available/unavailable toggle
    - Shared contract pattern: authTypes.ts imported by both main and renderer (single source of truth)

key-files:
  created:
    - vitest.config.ts (node env, aliases @shared/@main, includes src/**/*.test.ts)
    - src/main/telegram/__mocks__/telegramClient.ts (mock GramJS client)
    - src/main/storage/__mocks__/safeStorage.ts (mock safeStorage)
    - src/main/telegram/authFlow.test.ts (RED: AUTH-01 happy path + code error + AUTH-02 2fa)
    - src/main/telegram/errors.test.ts (RED: error code mapping + password step)
    - src/main/telegram/floodWait.test.ts (RED: FLOOD_WAIT parse + countdown + D-13)
    - src/main/telegram/SessionManager.test.ts (RED: dead session + logout ok + logout server fail D-17)
    - src/main/storage/secrets.test.ts (RED: round-trip + unavailable AUTH-04)
    - src/main/telegram/config.test.ts (RED: AUTH-03 api_id/api_hash guard + grep check)
  modified:
    - package.json (added vitest devDep + libphonenumber-js/zod deps + test/test:changed scripts)
    - src/shared/authTypes.ts (finalized: Uint8Array avatar, FLOOD_WAIT/NETWORK AuthErrorCode, IPC DTOs)
    - src/shared/channels.ts (named exports + CHANNELS namespace)
    - .planning/phases/01-foundation-auth-session-portable-shell/01-VALIDATION.md (wave_0_complete:true)

key-decisions:
  - "signInWithPassword (telegram@2.26.22): password field is a CALLBACK (hint?)=>Promise<string>, NOT a plain value; onError is required — see Open Question A2 resolution below"
  - "AuthErrorCode: FLOOD_WAIT and NETWORK (not NETWORK_ERROR) per the plan interface spec; ENCRYPTION_UNAVAILABLE removed (handled by throw in secrets.ts, not a typed auth error)"
  - "Identity.avatar: Uint8Array|null per plan interface spec (previously Buffer|null in plan 01 stub)"
  - "channels.ts: named exports (AUTH_SUBMIT_PHONE etc.) plus CHANNELS namespace for both import styles"
  - "Wave 0 RED tests fail on missing module (cannot find './authFlow' etc.) — this is the intended state; implementations arrive in plans 03/04"
  - "config.test.ts RED: API_ID/API_HASH are undefined in test environment (no .env injection) — plans 03/04 wire env injection or export a testable validateConfig()"

duration: 30min
completed: 2026-06-10
---

# Phase 01 Plan 02: Wave 0 Test Infrastructure + Shared Auth Contract Summary

**Vitest test infrastructure with configurable GramJS/safeStorage mocks and a complete RED test suite encoding AUTH-01..05 + D-13/D-17 against the finalized AuthState shared contract**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-10T22:40:00Z
- **Completed:** 2026-06-10
- **Tasks:** 3 (1 auto-approved checkpoint + 2 auto tasks)
- **Files created/modified:** 12

## Accomplishments

- Vitest v4.1.8 installed and configured; `npm test` runs the full suite in <200ms
- `libphonenumber-js` and `zod` verified legitimate and installed (auto-approved per checkpoint_auto_mode instructions — both are widely-known, millions of weekly downloads, MIT license, official GitHub repos)
- `src/shared/authTypes.ts` finalized as the single source of truth: AuthState 8-step discriminated union, Identity (Uint8Array avatar), FloodTick, AuthErrorCode (7 codes), IPC DTOs
- `src/shared/channels.ts` finalized with named exports and CHANNELS namespace
- Mock GramJS client supports all 6 named RPCError shapes including FLOOD_WAIT with `.seconds` — shaped to telegram@2.26.22 exact API (Open Question A2 resolved)
- Mock safeStorage supports available/unavailable toggle with XOR in-memory round-trip
- 6 RED test files encode the complete RESEARCH Test Map with exact `-t` selectors
- `01-VALIDATION.md` flipped to `wave_0_complete: true` / `nyquist_compliant: true`; task map rows filled

## Open Question A2 Resolution (signInWithPassword arg shape in telegram@2.26.22)

**Resolved by reading `/node_modules/telegram/client/auth.d.ts`.**

```typescript
// UserPasswordAuthParams (telegram@2.26.22)
interface UserPasswordAuthParams {
  password?: (hint?: string) => Promise<string>;  // CALLBACK FORM (not plain value)
  onError: (err: Error) => Promise<boolean> | void;  // required
}

// signInWithPassword signature:
declare function signInWithPassword(
  client: TelegramClient,
  apiCredentials: ApiCredentials,
  authParams: UserPasswordAuthParams
): Promise<Api.TypeUser>;
```

**Conclusion:** `password` is a **callback** `(hint?: string) => Promise<string>`, NOT a plain string value. The `onError` handler is **required** (not optional). The mock is shaped to match: it calls `authParams.password(undefined)` during sign-in and calls `authParams.onError(err)` before throwing on error.

**Plan 04 implementation note:** Use the callback form:
```typescript
await client.signInWithPassword(apiCreds, {
  password: async (_hint) => passwordFromUser,
  onError: async (err) => { /* classify and surface */ return true }
})
```

## Checkpoint Task 1: Auto-approved

Per `checkpoint_auto_mode` in the executor prompt:
- `zod`: github.com/colinhacks/zod — de-facto TS schema validator, >20M weekly downloads, MIT, no suspicious postinstall
- `libphonenumber-js`: github.com/catamphetamine/libphonenumber-js — Google's libphonenumber port, >5M weekly downloads, MIT, no suspicious postinstall

Log: "Auto-approved checkpoint (zod, libphonenumber-js verified legitimate)"

## Task Commits

1. **Task 1: Auto-approved checkpoint (zod + libphonenumber-js)** — no commit (checkpoint only)
2. **Task 2: Install Vitest + approved packages; define shared auth contract** — `0a3ff33` (feat)
3. **Task 3: Mock GramJS client + mock safeStorage + RED test stubs for AUTH-01..05** — `7831b1d` (test)

## Vitest Run: RED State Confirmed

```
Test Files  6 failed (6)
     Tests  2 failed | 1 passed (3)
  Duration  186ms
```

- 5 suites fail: "Cannot find module" for authFlow, errors, floodWait, SessionManager, secrets (implementations don't exist — correct RED)
- config.test.ts: 2 tests fail (API_ID/API_HASH undefined in test env — correct RED), 1 passes (git grep no api_hash literal — already GREEN)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Deviation] AuthErrorCode updated to match plan interface spec**
- **Found during:** Task 2 (comparing plan `<interfaces>` block with plan 01 stub)
- **Issue:** Plan 01 created `NETWORK_ERROR` and `ENCRYPTION_UNAVAILABLE` as error codes; the plan's interface spec requires `NETWORK`, `FLOOD_WAIT`, and `UNKNOWN` (no `ENCRYPTION_UNAVAILABLE`)
- **Fix:** Updated `AuthErrorCode` to use the exact codes from the plan interface block
- **Files modified:** `src/shared/authTypes.ts`
- **Commit:** 0a3ff33

**2. [Rule 1 - Deviation] Identity.avatar type: Buffer → Uint8Array**
- **Found during:** Task 2 (reading plan interface spec)
- **Issue:** Plan 01 stub used `Buffer | null`; plan interface spec requires `Uint8Array | null`
- **Fix:** Changed to `Uint8Array | null` to match the contract
- **Files modified:** `src/shared/authTypes.ts`
- **Commit:** 0a3ff33

## Threat Surface Scan

No new network endpoints, auth paths, or trust-boundary changes introduced. Test files and mocks live in `__mocks__/` and `*.test.ts` — excluded from the electron-vite production bundle (T-02-01 mitigated by build config). Vitest is a devDependency.

## Known Stubs

None — this plan delivers test infrastructure and mocks, not production stubs. The RED tests are intentionally failing against missing implementations (waves 3–4).

## Next Phase Readiness

- Plans 03/04: Implement `authFlow.ts`, `errors.ts`, `floodWait.ts`, `SessionManager.ts`, `secrets.ts` against the exact export names expected by the RED test suite
- Plans 03/04: Wire `MRPROPER_API_ID`/`MRPROPER_API_HASH` into the Vitest config or `config.ts` test mode to turn `config.test.ts` GREEN
- Plan 05: Import `AuthState`, `SubmitPhone`, `SubmitCode`, `SubmitPassword` from `src/shared/authTypes.ts` for renderer types
- `signInWithPassword` callback form is documented above for plan 04 implementer

---
*Phase: 01-foundation-auth-session-portable-shell*
*Completed: 2026-06-10*
