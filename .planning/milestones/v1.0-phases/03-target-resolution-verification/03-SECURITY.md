---
phase: 3
slug: target-resolution-verification
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-11
---

# Phase 3 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| shared types → renderer | ResolvedTargetDTO is the only target shape that crosses to the renderer | id (string), name, username, bio, avatar bytes, flags — NO accessHash |
| renderer → main via IPC | TARGET_* channels carry raw user input | `{ input: string }` Zod-validated (`trim().min(1).max(64)`) before TargetResolver |
| main → renderer push | TARGET_STATE + OP_GOVERNOR_EVENT | TargetState DTOs and typed GovernorEvent codes/numbers only — no raw Telegram payloads |
| operationErrors classifier | Raw Telegram errorMessage strings consumed and mapped to typed codes | No raw RPC string leaves this layer |
| governor → TargetResolver | All Telegram API calls route through the single account-wide `governor.run()` | Serialized API requests (concurrency 1) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Info Disclosure | ResolvedTargetDTO (targetTypes.ts) | mitigate | No accessHash field by construction — src/shared/targetTypes.ts:29-48; repo-wide grep shows `accessHash` in renderer/preload only as comments | closed |
| T-03-02 | Tampering | TARGET_* OperationErrorCodes (opTypes.ts) | mitigate | All three TARGET_* codes map to disposition `'fail'` — src/main/telegram/operationErrors.ts:119-133; asserted by operationErrors.test.ts:110-127 | closed |
| T-03-03 | Info Disclosure | TargetResolver.getResolvedUser() | mitigate | Returns `{ id: bigint, accessHash: bigint }` — TargetResolver.ts:185-190; not referenced anywhere in src/main/ipc, src/preload, or src/renderer; bigint shape asserted by targetResolver.test.ts:392-408 | closed |
| T-03-04 | Tampering | IPC Zod validation (targetChannels.ts) | mitigate | `ResolveTargetSchema.parse(payload)` runs before `resolver.resolve()` — targetChannels.ts:65-67; malformed-payload rejection tested at targetChannels.test.ts:150,187,201 | closed |
| T-03-05 | Info Disclosure | TargetResolver._resolvedAccessHash | mitigate | Private class field — TargetResolver.ts:75; `_buildDTO()` (lines 353-367) never includes accessHash | closed |
| T-03-06 | Tampering | TARGET_RESOLVE payload injection | mitigate | `z.object({ input: z.string().trim().min(1).max(64) })` — targetChannels.ts:39-41 (WR-04 hardening present); ZodError thrown before resolver call | closed |
| T-03-07 | Tampering | ResolveUsername vs getEntity | mitigate | Direct `invoke(new Api.contacts.ResolveUsername(...))` / `ResolvePhone(...)` — TargetResolver.ts:202-204, 257-259; `getEntity` appears only in a forbidding comment (line 199); all 4 API call sites wrapped in `_governor.run()` | closed |
| T-03-08 | Tampering | bigint ID truncation | mitigate | `user.id.toString()` for DTO id — TargetResolver.ts:357; `BigInt(x.toString())` normalization (CR-02) at lines 241-243, 287-289; zero `Number()` calls outside comments | closed |
| T-03-09 | Tampering | preload resolveTarget forwarding | mitigate | `ipcRenderer.invoke(TARGET_RESOLVE, { input })` with no transformation — src/preload/index.ts:41-42; Zod validation in main | closed |
| T-03-10 | Info Disclosure | onGovernorEvent | accept | GovernorEvent union carries only typed codes + numbers — src/shared/opTypes.ts:55-77; see Accepted Risks AR-03-01 | closed |
| T-03-11 | EoP | Shared client SessionManager+TargetResolver | accept | Read-only resolution under same user authority; WR-01 condition VERIFIED: exactly one `RateLimitGovernor` constructed (src/main/index.ts:134) and injected into both SessionManager (:149) and TargetResolver (:191); see AR-03-02 | closed |
| T-03-12 | Spoofing | TargetCard identity confirmation | mitigate | Explicit confirm gate "Yes, this is the person" — TargetCard.tsx:232-237; stable numeric ID always rendered in mono with tooltip — TargetCard.tsx:170-179; main-side gate: `confirm()` only advances from `resolved` state — TargetResolver.ts:153-157 | closed |
| T-03-13 | Info Disclosure | target.id in UI | accept | Low-sensitivity; the ID display IS the safety property; see AR-03-03 | closed |
| T-03-14 | Tampering | Link normalization in TargetInput | mitigate | Client-side `normalizeInput` — TargetInput.tsx:62-74; WR-05 paste-only URL rewrite present (lines 156-158); main still Zod-validates every payload — targetChannels.ts:66 | closed |
| T-03-15 | Info Disclosure | bytesToDataUrl avatar | accept | `bytesToDataUrl` — TargetCard.tsx:45-54; CSP `img-src 'self' data:` confirmed in runtime header (src/main/index.ts:71-72) AND build-time injected meta CSP (electron.vite.config.ts:20); see AR-03-04 | closed |
| T-03-SC (plan 01) | Tampering | package installs | accept | No new npm deps; see AR-03-05 | closed |
| T-03-SC (plan 02) | Tampering | shadcn badge install | mitigate | Badge exists as local file src/renderer/components/ui/badge.tsx; package.json dependency list untouched in Phase 3 (only change: name rename in 58eca56) | closed |
| T-03-SC (plan 03) | Tampering | package installs | accept | No new npm deps; see AR-03-05 | closed |
| T-03-SC (plan 04) | Tampering | package installs | accept | No new npm deps; see AR-03-05 | closed |
| T-03-SC (plan 05) | Tampering | package installs | accept | No new npm deps; see AR-03-05 | closed |
| T-03-GC-01 | Tampering | targetClient Window augmentation | mitigate | `MrsProperApi` interface merging — authClient.ts:9-22 (8 methods) + targetClient.ts:11-18 (6 methods) = 14-method contract matching preload's `exposeInMainWorld('mrsproper', ...)` (preload/index.ts:17); rename 260611-t1h survived consistently across preload + both clients | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-10 | GovernorEvent exposed to renderer contains only typed OperationErrorCode values and numeric counters (flood-tick remaining, retry attempt) — no raw Telegram payload or session data. Verified against src/shared/opTypes.ts:55-77. | Phase 3 plan 03-04 threat model | 2026-06-11 |
| AR-03-02 | T-03-11 | SessionManager and TargetResolver share one TelegramClient by design — both act with the logged-in admin's own authority; TargetResolver is read-only (resolve/confirm/reset, no write RPCs). Flood-safety condition (WR-01 single shared governor) verified in src/main/index.ts. | Phase 3 plan 03-04 threat model | 2026-06-11 |
| AR-03-03 | T-03-13 | Displaying the numeric Telegram user ID is the identity-verification safety property (D-13) — it is low-sensitivity public-ish data and exists so the admin removes the right person. | Phase 3 plan 03-05 threat model | 2026-06-11 |
| AR-03-04 | T-03-15 | Avatar bytes converted to data: URLs in the renderer; allowed by the strict production CSP (`img-src 'self' data:`) in both the response-header CSP and the build-time meta CSP. No cross-origin exposure; `connect-src 'none'` in production. | Phase 3 plan 03-05 threat model | 2026-06-11 |
| AR-03-05 | T-03-SC (plans 01, 03, 04, 05) | No new npm/pip/cargo packages installed during Phase 3 — git history shows the only package.json change in the phase is the app rename (commit 58eca56); dependency list identical to Phase 2. | Phase 3 plan threat models | 2026-06-11 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-11 | 21 | 21 | 0 | gsd-security-auditor (Claude) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-11
