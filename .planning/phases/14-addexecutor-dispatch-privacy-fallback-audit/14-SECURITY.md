---
phase: 14
slug: addexecutor-dispatch-privacy-fallback-audit
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-04
---

# Phase 14 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer → ADD_START / ADD_RETRY_GROUP / TEMPLATE_SET | Only `dialogIds`, `dialogId`, or a template string are accepted; Zod-validated, auth-gated, double-start-guarded, dialog-map cross-checked. `resume` is computed in main from the on-disk job, never read from the renderer. | dialog ids, template text (admin-authored) |
| main → renderer (ADD_GET_JOB, ADD_STATE, preload bridge) | `targetAccessHash` is destructured out before the job crosses contextBridge; bridge returns only `AddJobFileSafe` / `AddState`; no raw `ipcRenderer` exposed. | job outcomes, invite links (needed by Phase 15 report UI), run state |
| disk (add-job.json) → main | `readJob()` Zod-validates; malformed or tampered content returns `null`. Continuation requires targetId AND dialogId-set equality, else a fresh job. | job file (0o600) |
| main → disk (add-job.json, add-log.txt) | Atomic temp-write then rename at mode 0o600; log is append-only at 0o600 with a defensive chmod for pre-existing files. | access hash, invite links (bearer-style secrets) |
| execute() params → target identity | Identity is read exclusively from `resolver.getResolvedUser()` and the enumerator entity map inside main; never from IPC params. | user id, access hash |
| main → Telegram (governor) | Every write (`EditBanned`, `InviteToChannel`, `AddChatUser`, `ExportChatInvite`, `SendMessage`, `AddContact`) is its own `governor.run()`; PEER_FLOOD hard-stops at every call site. | RPC payloads |
| TARGET_RESET → active add run | `addExecutor.abortExecution()` runs before `resolver.reset()` so a cleared target is never acted on. | — |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-14-01 | Information Disclosure | AddJobFile.targetAccessHash | mitigate | `AddJobFileSafe = Omit<AddJobFile,'targetAccessHash'>` (src/shared/addTypes.ts:164); enforced in ADD_GET_JOB (src/main/ipc/addChannels.ts:220-227) | closed |
| T-14-02 | Tampering | TargetResolver stale-resolution restore | mitigate | catch path restores deleted/bot/contact with id/accessHash/name (src/main/telegram/TargetResolver.ts:257-262); targetResolver.test.ts:721-777 | closed |
| T-14-03 | Tampering | add-job.json on disk | mitigate | `AddJobFileSchema.safeParse`, null on failure (src/main/storage/addAuditStore.ts:240-248) | closed |
| T-14-04 | Information Disclosure | add-job.json permissions | mitigate | `writeAtomic()` writeFileSync `{ mode: 0o600 }` then rename (src/main/storage/addAuditStore.ts:186) | closed |
| T-14-05 | Information Disclosure | add-log.txt contains invite links | mitigate | `appendFileSync` `{ mode: 0o600 }` (src/main/storage/addLogStore.ts:161) plus defensive `chmodSync` for pre-existing files (149-158); addLogStore.test.ts:159-186 | closed |
| T-14-06 | Denial of Service | AddContact blocking confirm flow | mitigate | single governed call, try/catch → `{ ok:false, code }`, never throws (src/main/telegram/contactService.ts:47-63) | closed |
| T-14-07 | Tampering | TEMPLATE_SET payload | mitigate | `z.string().min(1).max(4000)` parsed before `store.set()` (src/main/ipc/templateChannels.ts:61,125) | closed |
| T-14-08 | Injection | Rendered DM text | accept | single-pass `renderTemplate()` substitutes only admin template + server-issued name/links (src/main/ipc/templateChannels.ts:46) — see AR-14-01 | closed |
| T-14-09 | Tampering | dialog-entity map / identity source | mitigate | tests assert InviteToChannel userIds come from the resolver, never a zero or renderer accessHash (src/main/telegram/addExecutor.test.ts:314-327) | closed |
| T-14-10 | Elevation of Privilege | unban-before-invite sequencing | mitigate | `EditBanned` and `InviteToChannel` are independent sequential `governor.run()` calls; no re-ban path exists (src/main/telegram/AddExecutor.ts:698-714) | closed |
| T-14-11 | Denial of Service | PEER_FLOOD during an add run | mitigate | hard-stop disposition re-checked at every call site: main loop 352-365, link regen 428-435, DM send 461-466, retryGroup 569-579, nested link-export catches 681/728/784/799 (src/main/telegram/AddExecutor.ts) | closed |
| T-14-12 | Information Disclosure | invite links via ExportChatInvite | mitigate | `usageLimit: 1`, `expireDate = now + 432000` (src/main/telegram/AddExecutor.ts:863,870-871); persisted only to 0o600 files | closed |
| T-14-13 | Tampering | add-job.json continuation match | mitigate | `isContinuation` requires resume flag, non-complete status, targetId equality and `sameDialogIdSet` (src/main/telegram/AddExecutor.ts:269-274); checkpoint dedupes by dialogId (addAuditStore.ts:208-217) | closed |
| T-14-14 | Information Disclosure | end-of-run DM contains links | accept | SendMessage peer built only from `resolved.id/accessHash` (src/main/telegram/AddExecutor.ts:444-453) — see AR-14-02 | closed |
| T-14-15 | Tampering | ADD_START dialogIds payload | mitigate | `knownIds` from `enumerator.getState().dialogs`; throws on unknown ids (src/main/ipc/addChannels.ts:147-159) | closed |
| T-14-16 | Elevation of Privilege | ADD_START resume flag | mitigate | `AddStartSchema` has no `resume` field (77-79); resume computed from `auditStore.readJob()` (161-165); executor re-validates (AddExecutor.ts:269-274) | closed |
| T-14-17 | Information Disclosure | ADD_GET_JOB response | mitigate | `targetAccessHash` destructured out before return (src/main/ipc/addChannels.ts:220-227) | closed |
| T-14-18 | Denial of Service | target:addContact failure | mitigate | handler try/catch resolves `{ ok:false }` (src/main/ipc/addChannels.ts:241-250) | closed |
| T-14-19 | Tampering | TARGET_RESET ordering | mitigate | `addExecutor?.abortExecution()` before `scanner.abortScan()` / `resolver.reset()` (src/main/ipc/targetChannels.ts:107-113); wired at src/main/index.ts:438 | closed |
| T-14-20 | Information Disclosure | preload contextBridge surface | mitigate | `startAdd(dialogIds)` only, `getAddJob()` → `AddJobFileSafe`, `getAddState()` → `AddState`; no raw ipcRenderer (src/preload/index.ts:229-246) | closed |
| T-14-SC | Tampering | npm installs | accept | `git diff fc72828..HEAD -- package.json` is empty; zero dependency changes — see AR-14-03 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-14-01 | T-14-08 | The DM template is authored by the account owner in their own app; the only interpolated values are the server-issued invite links and the target display name, substituted in a single pass so a name containing `{links}` cannot be re-expanded. No remote party controls the template. | Phase 14 plan 14-06 threat model; verified by security audit | 2026-10-04 |
| AR-14-02 | T-14-14 | The single end-of-run DM delivers single-use, 5-day invite links to the resolved target, who is the intended recipient. The message is sent through the admin's own governed session to a peer built solely from main-held identity. This is the feature's designed data flow, not a leak. | Phase 14 plan 14-09 threat model; verified by security audit | 2026-10-04 |
| AR-14-03 | T-14-SC | No packages were added or changed in this phase; all new modules use already-vetted dependencies (telegram, big-integer, zod, electron-store, Node builtins). | Phase 14 plans 14-01..14-11; verified via package.json diff | 2026-10-04 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-04 | 21 | 21 | 0 | gsd-security-auditor (post code-review-fix state, main @ 00ede79) |

Code-review fixes verified present and mapped to threats: CR-01 → T-14-13, CR-02 / CR-03 / WR-01 / WR-02 → T-14-11, WR-03 → T-14-08, WR-04 → T-14-05.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-04
